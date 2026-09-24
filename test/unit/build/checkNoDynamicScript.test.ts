import { execFileSync } from 'child_process';
import path from 'path';

// SC-328 — build gate: the production main.js must never contain a dynamic
// `createElement("script")`-shaped call. JSZip's legacy-browser polyfills used to inject
// exactly this into the bundle, which Obsidian's community-plugin review rejects outright.
// `scripts/check-no-dynamic-script.mjs` is the gate itself; it is wired into
// esbuild.config.mjs's production path, so both `npm run build` and `npm run
// build-no-check` run it after every production build (a single check point covers both
// scripts, since they only differ by whether `tsc --noEmit` runs first).
//
// scripts/check-no-dynamic-script.mjs is ESM (.mjs) and this repo's jest config has no
// ESM support (confirmed failure mode documented in
// test/unit/build/obsidianAppCssPin.test.ts's header) — so, the same established pattern,
// every check here spawns a real `node --input-type=module -e <code>` subprocess that
// imports the module directly and prints a JSON line of its result, rather than
// `import`-ing the .mjs file into this .test.ts.

const repoRoot = path.resolve(__dirname, '../../..');
const gateModule = path.join(repoRoot, 'scripts/check-no-dynamic-script.mjs');

interface Hit { offset: number; context: string }

/** Runs a small ESM script (a JS source string) in a real `node` subprocess and parses
 *  its single JSON line of stdout. `--input-type=module` lets the string use `import`. */
function runModuleScript(code: string): unknown {
	const stdout = execFileSync('node', ['--input-type=module', '-e', code], {
		cwd: repoRoot,
		encoding: 'utf8',
	});
	return JSON.parse(stdout.trim().split('\n').pop() as string);
}

function findHits(source: string): Hit[] {
	return runModuleScript(`
		import { findDynamicScriptCreation } from ${JSON.stringify(gateModule)};
		console.log(JSON.stringify(findDynamicScriptCreation(${JSON.stringify(source)})));
	`) as Hit[];
}

describe('SC-328: scripts/check-no-dynamic-script.mjs detector', () => {
	test('flags createElement( + "script"/\'script\'/`script`, case-insensitively, across whitespace — and nothing else', () => {
		const sample = [
			'document.createElement("script");',
			"el = document.createElement('script')",
			'x = CreateElement(`script`)',
			'document.CREATEELEMENT  (  "SCRIPT"  )',
			'document.createElement("div")', // must NOT match
		].join('\n');
		expect(findHits(sample)).toHaveLength(4);
	});

	// SC-328 fix round 1 LOW-2: the reviewer compiled 16 evasion shapes through esbuild
	// minify and found the original createElement(...)-only pattern missed Obsidian's own
	// `createEl(...)` DOM helper (used throughout this plugin, so the most plausible way
	// plugin code would reintroduce the pattern) and `createElementNS(...)`.
	test('flags createEl("script") (Obsidian\'s DOM helper), case-insensitively — and createEl("div") does NOT match', () => {
		const sample = [
			'el.createEl("script")',
			"container.createEl('script', { attr: { src: x } })",
			'x.CREATEEL(`script`)',
			'el.createEl("div")', // must NOT match
		].join('\n');
		expect(findHits(sample)).toHaveLength(3);
	});

	test('flags createElementNS(<namespace>, "script") — a plain createElementNS(..., "div") does NOT match', () => {
		const sample = [
			'document.createElementNS("http://www.w3.org/2000/svg", "script")',
			'document.createElementNS(SVG_NS, \'script\')',
			'document.createElementNS("http://www.w3.org/1999/xhtml", "div")', // must NOT match
		].join('\n');
		expect(findHits(sample)).toHaveLength(2);
	});

	test('reports the byte offset and ~80 chars of context for each hit', () => {
		const prefix = 'const a = 1;\n'.repeat(3);
		const needle = 'document.createElement("script");';
		const suffix = '\nconst b = 2;\n'.repeat(3);
		const sample = prefix + needle + suffix;
		const hits = findHits(sample);
		expect(hits).toHaveLength(1);
		expect(hits[0].offset).toBe(sample.indexOf('createElement', prefix.length));
		expect(hits[0].context).toContain('createElement("script")');
	});

	test('a clean sample produces zero hits', () => {
		expect(findHits('document.createElement("div"); const x = 1;')).toHaveLength(0);
	});

	test('multiple hits in one source are all reported, in order', () => {
		const sample = 'document.createElement("script");\nx();\ndocument.createElement(\'script\');';
		const hits = findHits(sample);
		expect(hits).toHaveLength(2);
		expect(hits[0].offset).toBeLessThan(hits[1].offset);
	});
});

describe('SC-328: the real production main.js is clean', () => {
	beforeAll(() => {
		// Same command `npm run build`/`npm run build-no-check` both funnel into —
		// exercises the wired-in gate for real, not just the pure detector above.
		execFileSync('node', ['esbuild.config.mjs', 'production'], {
			cwd: repoRoot,
			stdio: 'inherit',
		});
	});

	test('checkBuiltFile(main.js) finds zero dynamic createElement("script") calls', () => {
		const mainJsPath = path.join(repoRoot, 'main.js');
		const hits = runModuleScript(`
			import { checkBuiltFile } from ${JSON.stringify(gateModule)};
			console.log(JSON.stringify(checkBuiltFile(${JSON.stringify(mainJsPath)})));
		`) as Hit[];
		expect(hits).toHaveLength(0);
	});
});
