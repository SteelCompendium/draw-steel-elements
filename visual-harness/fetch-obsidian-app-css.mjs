// visual-harness/fetch-obsidian-app-css.mjs — SC-202 r6a.
//
// The fetch-and-pin recipe (decisions.md, 2026-09-02 ruling): fetches the PINNED Obsidian
// release asset, extracts `app.css`, verifies it against the committed
// `obsidian-app-css.pin.mjs`, and writes the two files the host-leak sweeps in
// `visual-harness/shoot.mjs` already read: `dist/obsidian-app.css` (the sheet itself) and
// `dist/obsidian-app.css.meta.json` (provenance — which sheet is actually in use, and why).
//
// Runs automatically before every `npm run shots` (package.json's `preshots` — an npm
// lifecycle hook, not a change to `shoot.mjs`'s own process wiring: it keeps this module
// independently runnable/testable via `npm run host-css` and keeps `shoot.mjs`'s job to
// "read whatever dist/obsidian-app.css says" rather than "know how to fetch"). `npm run
// host-css` runs the identical script by hand, e.g. to pre-warm the cache offline.
//
// THREE possible outcomes, in priority order, and NONE of them may fabricate a pass:
//   1. Cached `.asar.gz` present (from an earlier run), or a fresh fetch succeeds — the
//      WHOLE chain (asar.gz -> gunzip -> app.css) is re-verified against the pin every time,
//      cached or fresh, so a corrupted cache is caught, not silently trusted. Any mismatch
//      anywhere in the chain is a LOUD failure, `process.exit(1)`, never a silent fallback
//      (brief item 2) — `dist/obsidian-app.css` is left untouched on failure, never
//      overwritten with unverified bytes.
//   2. No cache, the fetch itself fails (network down, DNS, a bad override URL) — falls
//      back to the INSTALLED Obsidian's own asar (SC-205's `findObsidianAsar`/
//      `readAsarFile`, reused not forked), prints a clearly-worded WARNING naming the sheet
//      actually in use (version + hash — NOT the pin), and continues (exit 0). This is the
//      one path that does not throw: an unreachable network is not a hash violation.
//   3. No cache, no fetch, no usable installed asar either — writes nothing.
//      `dist/obsidian-app.css` stays absent (or whatever it already was), and the sweeps'
//      existing "SKIPPED (no local asar)" line covers it exactly as before this round.
//
// SEPARATELY, `checkDriftAgainstInstalled` always compares the INSTALLED Obsidian against
// the pin (regardless of which of the three outcomes above happened) and prints ONE line if
// they differ — the single warn-on-drift line that replaces the five per-sweep drift
// clauses rounds 1-5 each printed (brief item 6). Drift is expected, not a failure: the gate
// keeps running against the pin either way.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { findObsidianAsar, readAsarFile } from './obsidian-host-pin.mjs';
import { OBSIDIAN_APP_CSS_PIN } from './obsidian-app-css.pin.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIST_DIR = path.join(dir, 'dist');
export const OUT_CSS_FILE = path.join(DEFAULT_DIST_DIR, 'obsidian-app.css');
export const OUT_META_FILE = path.join(DEFAULT_DIST_DIR, 'obsidian-app.css.meta.json');

export function sha256(bufOrStr) {
	return crypto.createHash('sha256').update(bufOrStr).digest('hex');
}

/** Pure and hermetic — the one piece jest exercises directly (no network, no disk) to prove
 *  the recipe's hash verification can-fail. Throws a descriptive Error on any mismatch. */
export function assertHash(actual, expected, what) {
	if (actual !== expected) throw new Error(`HASH MISMATCH (${what}): got ${actual}, expected ${expected}`);
}

function gzPathFor(pin, distDir) {
	return path.join(distDir, `obsidian-${pin.obsidianVersion}.asar.gz`);
}
function asarPathFor(pin, distDir) {
	return path.join(distDir, `obsidian-${pin.obsidianVersion}.asar`);
}

/** Verify the WHOLE chain from a gz buffer already in hand (cached or freshly fetched) and
 *  extract app.css. Writes the `.asar` to the cache dir too (LOW-3-style housekeeping,
 *  SC-205's own lesson in `loadLocalObsidianAppCss`: nothing ever reads it back, so it's
 *  regenerated fresh from the verified gz every run rather than cached-and-trusted itself —
 *  one fewer cache-invalidation case, and gunzip of an 8.8 MB file is cheap). Throws on any
 *  hash mismatch — the loud-failure half of item 2's contract. */
function verifyAndExtract(gzBuf, pin, distDir) {
	if (pin.asarGzSha256) assertHash(sha256(gzBuf), pin.asarGzSha256, 'asar.gz');
	const asarBuf = zlib.gunzipSync(gzBuf);
	fs.mkdirSync(distDir, { recursive: true });
	fs.writeFileSync(asarPathFor(pin, distDir), asarBuf);
	const css = readAsarFile(asarPathFor(pin, distDir), 'app.css');
	if (!css) throw new Error(`could not read app.css out of the extracted asar (${asarPathFor(pin, distDir)})`);
	assertHash(sha256(css), pin.appCssSha256, 'app.css');
	return { css, asarSha256: sha256(asarBuf) };
}

function writeMeta(meta, outMetaFile, distDir) {
	fs.mkdirSync(distDir, { recursive: true });
	fs.writeFileSync(outMetaFile, JSON.stringify(meta, null, 2) + '\n');
}

/**
 * The whole recipe (brief item 2-4). `fetchImpl`/`urlOverride` are seams for the can-fail
 * proof and the no-network simulation — production callers pass neither and get the real
 * global `fetch` against `pin.source`. `urlOverride` is also exposed on the CLI via the
 * `SC202_HOST_CSS_URL_OVERRIDE` env var (see `main()` below) for a real, no-code-change
 * no-network simulation: point it at a guaranteed-unreachable host. `distDir` is a THIRD
 * seam, jest-only: the can-fail proof points it at a scratch directory so a deliberately
 * bad pin never touches this repo's real `visual-harness/dist/` cache.
 *
 * @returns {Promise<{resolved: boolean, mode?: string, version?: string, sha256?: string, usedNetwork?: boolean}>}
 */
export async function resolvePinnedObsidianAppCss({
	pin = OBSIDIAN_APP_CSS_PIN,
	fetchImpl = fetch,
	urlOverride,
	distDir = DEFAULT_DIST_DIR,
} = {}) {
	const outCssFile = path.join(distDir, 'obsidian-app.css');
	const outMetaFile = path.join(distDir, 'obsidian-app.css.meta.json');
	const gzPath = gzPathFor(pin, distDir);
	const url = urlOverride ?? pin.source;
	let gzBuf;
	let usedNetwork = false;
	if (fs.existsSync(gzPath)) {
		gzBuf = fs.readFileSync(gzPath); // cached — idempotent, no network (still re-verified below)
	} else {
		try {
			const res = await fetchImpl(url);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			gzBuf = Buffer.from(await res.arrayBuffer());
			usedNetwork = true;
		} catch (err) {
			// Fetch itself failed (no cache to fall back on) — item 4's offline fallback. This
			// is NOT a hash-verification failure, so it is the one path that does not throw.
			const found = findObsidianAsar();
			const css = found?.usable ? readAsarFile(found.path, 'app.css') : null;
			if (found?.usable && css) {
				const cssSha = sha256(css);
				console.warn(
					`\nOBSIDIAN APP.CSS FETCH UNAVAILABLE (${err.message}), no cached copy — falling ` +
						`back to the INSTALLED Obsidian's app.css: Obsidian ${found.version}, sha256 ` +
						`${cssSha}. This is NOT the pinned ${pin.obsidianVersion} sheet (sha256 ` +
						`${pin.appCssSha256}) — treat any host-leak result this run as informative, not ` +
						`a verified gate. See visual-harness/README.md → "Obsidian app.css pin" to ` +
						`restore the pinned fetch once the network is back.`,
				);
				fs.mkdirSync(distDir, { recursive: true });
				fs.writeFileSync(outCssFile, css);
				writeMeta(
					{
						source: 'installed-fallback',
						version: found.version,
						sha256: cssSha,
						pinnedVersion: pin.obsidianVersion,
						pinnedSha256: pin.appCssSha256,
						fetchedAt: new Date().toISOString(),
					},
					outMetaFile,
					distDir,
				);
				return { resolved: true, mode: 'installed-fallback', version: found.version, sha256: cssSha };
			}
			console.warn(
				`\nOBSIDIAN APP.CSS FETCH UNAVAILABLE (${err.message}), no cached copy, and no usable ` +
					`installed Obsidian asar either — host-leak sweeps will SKIP this run.`,
			);
			return { resolved: false };
		}
	}
	// Have gz bytes now (cache or fresh fetch) — verify the WHOLE chain. A mismatch here is
	// loud and fatal even for cached bytes: a corrupted cache must be caught, not trusted
	// (brief item 2, "never a silent fallback"; the verification proof deliberately corrupts
	// the cache to prove this).
	if (usedNetwork) {
		fs.mkdirSync(distDir, { recursive: true });
		fs.writeFileSync(gzPath, gzBuf);
	}
	const { css, asarSha256 } = verifyAndExtract(gzBuf, pin, distDir);
	fs.writeFileSync(outCssFile, css);
	const meta = {
		source: usedNetwork ? 'pinned-fetch' : 'pinned-cache',
		version: pin.obsidianVersion,
		sha256: pin.appCssSha256,
		asarGzSha256: sha256(gzBuf),
		asarSha256,
		sourceUrl: pin.source,
		fetchedAt: new Date().toISOString(),
	};
	writeMeta(meta, outMetaFile, distDir);
	return { resolved: true, mode: meta.source, version: pin.obsidianVersion, sha256: pin.appCssSha256, usedNetwork };
}

/**
 * Warn-on-drift (brief item 5) — INDEPENDENT of `resolvePinnedObsidianAppCss` above: always
 * compares the INSTALLED Obsidian (if any) against the pin and prints exactly ONE line if
 * they differ, replacing the five per-sweep drift clauses rounds 1-5 each printed (item 6).
 * Never throws — drift is expected until the pin is deliberately bumped, and the gate keeps
 * running against the pin regardless of what the installed copy says.
 * @returns {{installedVersion: string, installedSha256: string} | null} null when nothing
 *  drifted (or nothing installed/usable to compare).
 */
export function checkDriftAgainstInstalled({ pin = OBSIDIAN_APP_CSS_PIN } = {}) {
	const found = findObsidianAsar();
	if (!found?.usable) return null;
	const css = readAsarFile(found.path, 'app.css');
	if (!css) return null;
	const installedSha256 = sha256(css);
	if (found.version === pin.obsidianVersion && installedSha256 === pin.appCssSha256) return null;
	console.log(
		`\nOBSIDIAN APP.CSS PIN DRIFT — installed Obsidian is ${found.version} (app.css sha256 ` +
			`${installedSha256}) but the harness gate runs against the pinned ${pin.obsidianVersion} ` +
			`(app.css sha256 ${pin.appCssSha256}). Expected until the pin is deliberately bumped — see ` +
			`visual-harness/README.md → "Obsidian app.css pin" for the bump procedure.`,
	);
	return { installedVersion: found.version, installedSha256 };
}

async function main() {
	const urlOverride = process.env.SC202_HOST_CSS_URL_OVERRIDE || undefined;
	const result = await resolvePinnedObsidianAppCss({ urlOverride });
	checkDriftAgainstInstalled();
	if (result.resolved) {
		console.log(`\nobsidian app.css ready (${result.mode}): Obsidian ${result.version}, sha256 ${result.sha256}`);
	} else {
		console.log(
			'\nobsidian app.css NOT available this run (no fetch, no cache, no usable installed asar) — ' +
				'host-leak sweeps will print their existing SKIPPED (no local asar) line.',
		);
	}
}

// CLI entry — `npm run host-css` and the `preshots` lifecycle hook both run this file
// directly. Guarded so `resolvePinnedObsidianAppCss`/`checkDriftAgainstInstalled` stay
// importable (and testable) without triggering a real run as a side effect of import.
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error(`\nOBSIDIAN APP.CSS PIN VERIFICATION FAILED: ${err.message}`);
		process.exit(1);
	});
}
