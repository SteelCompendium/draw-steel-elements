import { execFileSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

// SC-202 r6a — the fetch-and-pin recipe's own jest gate.
//
// `visual-harness/obsidian-app-css.pin.mjs` and `visual-harness/fetch-obsidian-app-css.mjs`
// are ESM `.mjs` modules (consistent with the rest of `visual-harness/`), and this repo's
// jest config (`jest.config.ts`) has no ESM support configured — a direct `import()` of a
// `.mjs` file from a `.test.ts` fails with "Cannot use import statement outside a module"
// (confirmed against `obsidian-host-pin.mjs` before writing this file). So, mirroring the
// established pattern for exercising a real script from jest (`cssNesting.test.ts` spawns
// `node esbuild.config.mjs production` via `execFileSync`), these tests spawn real `node
// --input-type=module` processes that import the modules under test and print a JSON
// result to stdout. No network call is ever made — every spawned script either reads only
// the pin (no I/O at all) or supplies its own `fetchImpl`/`distDir` seam so the can-fail
// proof never touches this repo's real `visual-harness/dist/` cache.

const repoRoot = path.resolve(__dirname, '../../..');
const pinModule = path.join(repoRoot, 'visual-harness/obsidian-app-css.pin.mjs');
const hostPinModule = path.join(repoRoot, 'visual-harness/obsidian-host-pin.mjs');
const fetchModule = path.join(repoRoot, 'visual-harness/fetch-obsidian-app-css.mjs');

/** Runs a small ESM script (a JS source string) in a real `node` subprocess and parses its
 *  single JSON line of stdout. `--input-type=module` lets the string use `import`. */
function runModuleScript(code: string): unknown {
	const stdout = execFileSync('node', ['--input-type=module', '-e', code], {
		cwd: repoRoot,
		encoding: 'utf8',
	});
	return JSON.parse(stdout.trim().split('\n').pop() as string);
}

describe('SC-202 r6a: visual-harness/obsidian-app-css.pin.mjs parses and has the documented shape', () => {
	let pin: { obsidianVersion: string; appCssSha256: string; asarGzSha256?: string; source: string };

	beforeAll(() => {
		pin = runModuleScript(`
			import { OBSIDIAN_APP_CSS_PIN } from ${JSON.stringify(pinModule)};
			console.log(JSON.stringify(OBSIDIAN_APP_CSS_PIN));
		`) as typeof pin;
	});

	it('parses to an object carrying every documented field', () => {
		expect(pin).toEqual(
			expect.objectContaining({
				obsidianVersion: expect.any(String),
				appCssSha256: expect.any(String),
				source: expect.any(String),
			}),
		);
	});

	it('has a semver-shaped obsidianVersion', () => {
		expect(pin.obsidianVersion).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it('has a 64-hex-char sha256 for appCssSha256 (and asarGzSha256, if present)', () => {
		expect(pin.appCssSha256).toMatch(/^[0-9a-f]{64}$/);
		if (pin.asarGzSha256 !== undefined) expect(pin.asarGzSha256).toMatch(/^[0-9a-f]{64}$/);
	});

	it('points source at the approved public-URL scheme, naming this exact version', () => {
		expect(pin.source).toBe(
			`https://github.com/obsidianmd/obsidian-releases/releases/download/v${pin.obsidianVersion}/obsidian-${pin.obsidianVersion}.asar.gz`,
		);
	});

	it('currently pins Obsidian 1.13.7 (decisions.md: the 2026-09-02 ruling\'s starting pin, reinstated after 1.14.0 proved to have no public release asset)', () => {
		expect(pin.obsidianVersion).toBe('1.13.7');
		expect(pin.appCssSha256).toBe('f612f1e8f36486fa57f3b8bd45f0c848409d5b168002e757a13c6d286a7b4c41');
	});
});

describe('SC-202 r6a: the app.css content pin vs. SC-205\'s button-model version floor', () => {
	// Item 8 of the r6a brief: "the version matches PINNED_OBSIDIAN (or documents why they
	// may differ)". They pin DIFFERENT things (see obsidian-app-css.pin.mjs's header
	// comment) and are allowed to differ — this test codifies the relationship so a future
	// edit that silently changes it gets noticed here rather than only in prose.
	let result: { pinVersion: string; floorVersion: string; cmp: number | null };

	beforeAll(() => {
		result = runModuleScript(`
			import { OBSIDIAN_APP_CSS_PIN } from ${JSON.stringify(pinModule)};
			import { PINNED_OBSIDIAN, compareVersions } from ${JSON.stringify(hostPinModule)};
			console.log(JSON.stringify({
				pinVersion: OBSIDIAN_APP_CSS_PIN.obsidianVersion,
				floorVersion: PINNED_OBSIDIAN,
				cmp: compareVersions(OBSIDIAN_APP_CSS_PIN.obsidianVersion, PINNED_OBSIDIAN),
			}));
		`) as typeof result;
	});

	it('is allowed to differ from PINNED_OBSIDIAN — they gate different things', () => {
		// Not a general "any relationship goes" — this pins the SPECIFIC, documented
		// relationship as of r6a: the content pin (an exact version) currently sits at or
		// behind SC-205's floor (the oldest version its hand-maintained button-rule model
		// may be compared against). A future PINNED_OBSIDIAN bump moving this to `1` would
		// mean the content pin is now NEWER than the floor — still fine, but worth a human
		// glance at why, which is exactly what a red test here provides.
		expect(result.cmp).not.toBeNull();
		expect(result.cmp).toBeLessThanOrEqual(0);
	});
});

describe('SC-202 r6a: fetch-obsidian-app-css.mjs hash verification can-fail', () => {
	// Item 8: "the fetch module's hash verification can-fail (feed it a wrong hash ->
	// throws). No network in jest." Both proofs below run with NO real fetch (a mocked
	// `fetchImpl` returning a small in-memory gzip buffer) and NO writes to the real
	// `visual-harness/dist/` cache (a scratch `distDir`, cleaned up after).
	let scratchDir: string;

	beforeEach(() => {
		scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc202-r6a-canfail-'));
	});

	afterEach(() => {
		fs.rmSync(scratchDir, { recursive: true, force: true });
	});

	it('assertHash (the pure hash-check primitive) throws on a mismatch and is silent on a match', () => {
		const result = runModuleScript(`
			import { assertHash } from ${JSON.stringify(fetchModule)};
			let threw = false;
			try { assertHash('deadbeef', 'not-deadbeef', 'test'); } catch { threw = true; }
			let matchThrew = false;
			try { assertHash('same', 'same', 'test'); } catch { matchThrew = true; }
			console.log(JSON.stringify({ threw, matchThrew }));
		`) as { threw: boolean; matchThrew: boolean };
		expect(result.threw).toBe(true);
		expect(result.matchThrew).toBe(false);
	});

	it('resolvePinnedObsidianAppCss rejects a fetched asar.gz whose bytes do not match the pinned asarGzSha256', () => {
		const result = runModuleScript(`
			import { resolvePinnedObsidianAppCss } from ${JSON.stringify(fetchModule)};
			import zlib from 'zlib';

			// A tiny, real gzip buffer — its own bytes don't matter, only that the pin's
			// asarGzSha256 below deliberately does NOT match its sha256.
			const gz = zlib.gzipSync(Buffer.from('not the real asar, just needs to be valid gzip'));
			const badPin = {
				obsidianVersion: '0.0.0-sc202-r6a-canfail',
				appCssSha256: '0'.repeat(64),
				asarGzSha256: '1'.repeat(64), // deliberately wrong
				source: 'http://127.0.0.1:1/unreachable-by-construction',
			};
			const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => gz });

			let threw = false;
			let message = '';
			try {
				await resolvePinnedObsidianAppCss({ pin: badPin, fetchImpl, distDir: ${JSON.stringify(scratchDir)} });
			} catch (err) {
				threw = true;
				message = err.message;
			}
			console.log(JSON.stringify({ threw, message }));
		`) as { threw: boolean; message: string };
		expect(result.threw).toBe(true);
		expect(result.message).toMatch(/HASH MISMATCH \(asar\.gz\)/);
		// And the failure must be loud, not silent: nothing gets written for a hash-mismatched
		// fetch — no stale/unverified obsidian-app.css left behind for a sweep to trust.
		expect(fs.existsSync(path.join(scratchDir, 'obsidian-app.css'))).toBe(false);
	});

	// Fix round LOW-1 (r6a review): the case above throws at the FIRST hash check
	// (asar.gz), never reaching `assertHash(sha256(css), pin.appCssSha256, 'app.css')` —
	// the one check this entire round exists for. Reproduced independently before this
	// fix: replacing that line with a comment left the suite's can-fail tests all green.
	// This case needs a REAL (if minimal) asar so extraction can succeed and reach the
	// app.css check with a CORRECT asarGzSha256 but a deliberately WRONG appCssSha256.
	it('resolvePinnedObsidianAppCss rejects an extracted app.css whose bytes do not match the pinned appCssSha256 (LOW-1)', () => {
		const result = runModuleScript(`
			import { resolvePinnedObsidianAppCss } from ${JSON.stringify(fetchModule)};
			import zlib from 'zlib';
			import crypto from 'crypto';

			// A minimal, real asar containing one file, 'app.css' — just enough for
			// obsidian-host-pin.mjs's readAsarFile to extract it. Format (that reader's own
			// comment): uint32(unused) | uint32 headerPickleSize | uint32 headerPayloadSize |
			// uint32 jsonLen | json | data, every file offset relative to 8+headerPickleSize.
			function buildMinimalAsar(cssBuf) {
				const index = { files: { 'app.css': { size: cssBuf.length, offset: '0' } } };
				const jsonBuf = Buffer.from(JSON.stringify(index), 'utf8');
				const headerPickleSize = 8 + jsonBuf.length; // -> data starts right after json
				const head = Buffer.alloc(16);
				head.writeUInt32LE(4, 0);
				head.writeUInt32LE(headerPickleSize, 4);
				head.writeUInt32LE(jsonBuf.length + 4, 8); // headerPayloadSize — unread, any value
				head.writeUInt32LE(jsonBuf.length, 12);
				return Buffer.concat([head, jsonBuf, cssBuf]);
			}

			const realCss = Buffer.from('body { color: red; } /* not really Obsidian */\\n');
			const asarBuf = buildMinimalAsar(realCss);
			const gz = zlib.gzipSync(asarBuf);
			const badPin = {
				obsidianVersion: '0.0.0-sc202-r6a-canfail-appcss',
				appCssSha256: '0'.repeat(64), // deliberately wrong — realCss's real hash isn't this
				asarGzSha256: crypto.createHash('sha256').update(gz).digest('hex'), // CORRECT
				source: 'http://127.0.0.1:1/unreachable-by-construction',
			};
			const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => gz });

			let threw = false;
			let message = '';
			try {
				await resolvePinnedObsidianAppCss({ pin: badPin, fetchImpl, distDir: ${JSON.stringify(scratchDir)} });
			} catch (err) {
				threw = true;
				message = err.message;
			}
			console.log(JSON.stringify({ threw, message }));
		`) as { threw: boolean; message: string };
		expect(result.threw).toBe(true);
		expect(result.message).toMatch(/HASH MISMATCH \(app\.css\)/);
		expect(fs.existsSync(path.join(scratchDir, 'obsidian-app.css'))).toBe(false);
	});
});

describe('SC-202 r6a fix round: readVerifiedSheet catches a sheet that no longer matches its own meta (MED-1)', () => {
	// The review's exploit, reproduced hermetically: a hand-written CSS comment as
	// dist/obsidian-app.css under a GENUINE pinned-cache/1.13.7 meta used to make every
	// host-leak sweep print "OK against the real Obsidian app.css" over 34 bytes of
	// comment. readVerifiedSheet now re-hashes the bytes on read, every call.
	let scratchDir: string;

	beforeEach(() => {
		scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc202-r6a-med1-'));
	});

	afterEach(() => {
		fs.rmSync(scratchDir, { recursive: true, force: true });
	});

	it('throws when the on-disk bytes do not match the sidecar meta\'s recorded hash', () => {
		fs.writeFileSync(path.join(scratchDir, 'obsidian-app.css'), 'not the real sheet');
		fs.writeFileSync(
			path.join(scratchDir, 'obsidian-app.css.meta.json'),
			JSON.stringify({ source: 'pinned-cache', version: '1.13.7', sha256: 'f612f1e8f36486fa57f3b8bd45f0c848409d5b168002e757a13c6d286a7b4c41' }),
		);
		const result = runModuleScript(`
			import { readVerifiedSheet } from ${JSON.stringify(fetchModule)};
			let threw = false;
			let message = '';
			try { readVerifiedSheet({ distDir: ${JSON.stringify(scratchDir)} }); } catch (err) { threw = true; message = err.message; }
			console.log(JSON.stringify({ threw, message }));
		`) as { threw: boolean; message: string };
		expect(result.threw).toBe(true);
		expect(result.message).toMatch(/OBSIDIAN APP\.CSS MISMATCH/);
	});

	it('returns null (never throws) when no sheet is resolved at all', () => {
		const result = runModuleScript(`
			import { readVerifiedSheet } from ${JSON.stringify(fetchModule)};
			console.log(JSON.stringify({ result: readVerifiedSheet({ distDir: ${JSON.stringify(scratchDir)} }) }));
		`) as { result: null };
		expect(result.result).toBeNull();
	});
});

describe('SC-202 r6a fix round: a non-OK HTTP status is a wrong pin, never a silent offline fallback (MED-2)', () => {
	it('resolvePinnedObsidianAppCss throws on a 404 rather than falling back to the installed sheet', () => {
		const result = runModuleScript(`
			import { resolvePinnedObsidianAppCss } from ${JSON.stringify(fetchModule)};
			const badPin = {
				obsidianVersion: '9.9.9-sc202-r6a-canfail-404',
				appCssSha256: '0'.repeat(64),
				asarGzSha256: '0'.repeat(64),
				source: 'http://127.0.0.1:1/unreachable-by-construction',
			};
			const fetchImpl = async () => ({ ok: false, status: 404 });
			let threw = false;
			let message = '';
			try {
				await resolvePinnedObsidianAppCss({ pin: badPin, fetchImpl, distDir: ${JSON.stringify('/tmp')} + '/sc202-r6a-med2-' + Date.now() });
			} catch (err) {
				threw = true;
				message = err.message;
			}
			console.log(JSON.stringify({ threw, message }));
		`) as { threw: boolean; message: string };
		expect(result.threw).toBe(true);
		expect(result.message).toMatch(/^HTTP 404/);
	});
});
