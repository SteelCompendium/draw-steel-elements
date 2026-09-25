import { execFileSync } from 'child_process';
import path from 'path';

// SC-127 r9 (coordinator follow-up after sweep A2's own can-fail proof): the in-run guard
// (`shoot.mjs`'s `assertSc127LightIslandPinned`) threads a `lightDefault` comparison map
// from `generateLightIsland` through to a comparison helper. Two real revisions of this
// code got that map wrong in ways a 10-minute Playwright sweep was the ONLY thing that
// caught: first, the wrong (formula-text, not concrete-value) map was passed; then,
// `lightDefault` was computed but never included in `generateLightIsland`'s own return
// object, so the guard's `targetMap` argument was `undefined` and every property lookup
// threw deep inside the sweep (`TypeError: Cannot read properties of undefined (reading
// '--background-modifier-active-hover')`, sc127-r9-sweepA2.log).
//
// `findMissingTokens`/`findDriftedTokens` (visual-harness/obsidian-light-island.mjs) were
// extracted specifically so this exact failure mode — a wrong-shaped or missing comparison
// map — fails in milliseconds here, not in a sweep. `visual-harness/obsidian-light-island.mjs`
// is an ESM `.mjs` module and this repo's jest config has no ESM support configured (same
// limitation `obsidianAppCssPin.test.ts`'s own header documents), so these tests spawn a
// real `node --input-type=module` subprocess that imports the module and prints a JSON
// result, mirroring that file's `runModuleScript` helper.

const repoRoot = path.resolve(__dirname, '../../..');
const islandModule = path.join(repoRoot, 'visual-harness/obsidian-light-island.mjs');

function runModuleScript(code: string): unknown {
	const stdout = execFileSync('node', ['--input-type=module', '-e', code], {
		cwd: repoRoot,
		encoding: 'utf8',
	});
	return JSON.parse(stdout.trim().split('\n').pop() as string);
}

describe('SC-127 r9 — findMissingTokens (guard completeness check)', () => {
	it('finds a token with no "<name>:" declaration in the block text', () => {
		const result = runModuleScript(`
			import { findMissingTokens } from ${JSON.stringify(islandModule)};
			const missing = findMissingTokens(
				['--present', '--also-present', '--absent'],
				'{ --present: red; --also-present: blue; }',
			);
			console.log(JSON.stringify(missing));
		`);
		expect(result).toEqual(['--absent']);
	});

	it('reports nothing missing when every token is declared', () => {
		const result = runModuleScript(`
			import { findMissingTokens } from ${JSON.stringify(islandModule)};
			const missing = findMissingTokens(['--a', '--b'], '{ --a: 1px; --b: 2px; }');
			console.log(JSON.stringify(missing));
		`);
		expect(result).toEqual([]);
	});

	it('does not false-positive on a token name that is a suffix of another (word-boundary safety)', () => {
		const result = runModuleScript(`
			import { findMissingTokens } from ${JSON.stringify(islandModule)};
			// "--accent" must not be satisfied by "--accent-2: …", only by its OWN "--accent:" decl.
			const missing = findMissingTokens(['--accent'], '{ --accent-2: red; }');
			console.log(JSON.stringify(missing));
		`);
		expect(result).toEqual(['--accent']);
	});
});

describe('SC-127 r9 — findDriftedTokens (guard correctness check)', () => {
	it('finds nothing drifted when every normalized value matches', () => {
		const result = runModuleScript(`
			import { findDriftedTokens } from ${JSON.stringify(islandModule)};
			const drifted = findDriftedTokens(
				['--a', '--b'],
				{ '--a': ' red ', '--b': 'blue' },
				{ '--a': 'red', '--b': ' blue ' },
				(v) => v.trim(),
			);
			console.log(JSON.stringify(drifted));
		`);
		expect(result).toEqual([]);
	});

	it('reports a token whose normalized value differs between the two maps', () => {
		const result = runModuleScript(`
			import { findDriftedTokens } from ${JSON.stringify(islandModule)};
			const drifted = findDriftedTokens(
				['--a', '--b'],
				{ '--a': 'red', '--b': 'green' },
				{ '--a': 'red', '--b': 'blue' },
				(v) => v,
			);
			console.log(JSON.stringify(drifted));
		`);
		expect(result).toEqual([{ token: '--b', ours: 'green', target: 'blue' }]);
	});

	// SC-127 r9's OWN real bug, reproduced directly: `generateLightIsland` computed
	// `lightDefault` but never returned it, so the guard called this helper with
	// `targetMap === undefined`. A sweep took ten minutes to surface that as a deep
	// property-access TypeError; this must fail the instant it is called instead.
	it('throws (never silently reports "nothing drifted") when targetMap is undefined', () => {
		expect(() =>
			runModuleScript(`
				import { findDriftedTokens } from ${JSON.stringify(islandModule)};
				findDriftedTokens(['--a'], { '--a': 'red' }, undefined, (v) => v);
				console.log(JSON.stringify('unreachable'));
			`),
		).toThrow();
	});

	it('throws when oursMap is undefined', () => {
		expect(() =>
			runModuleScript(`
				import { findDriftedTokens } from ${JSON.stringify(islandModule)};
				findDriftedTokens(['--a'], undefined, { '--a': 'red' }, (v) => v);
				console.log(JSON.stringify('unreachable'));
			`),
		).toThrow();
	});

	it('throws when a token is present in the token list but missing from one of the maps (wrong-shaped map)', () => {
		expect(() =>
			runModuleScript(`
				import { findDriftedTokens } from ${JSON.stringify(islandModule)};
				findDriftedTokens(['--a', '--b'], { '--a': 'red' }, { '--a': 'red', '--b': 'blue' }, (v) => v);
				console.log(JSON.stringify('unreachable'));
			`),
		).toThrow();
	});
});
