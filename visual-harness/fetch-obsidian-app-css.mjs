// visual-harness/fetch-obsidian-app-css.mjs — SC-202 r6a (fix round).
//
// The fetch-and-pin recipe (decisions.md, 2026-09-02 ruling): fetches the PINNED Obsidian
// release asset, extracts `app.css`, verifies it against the committed
// `obsidian-app-css.pin.mjs`, and writes the two files `visual-harness/shoot.mjs` reads:
// `dist/obsidian-app.css` (the sheet itself) and `dist/obsidian-app.css.meta.json`
// (provenance — which sheet is actually in use, and why).
//
// `shoot.mjs` imports this module and awaits `resolvePinnedObsidianAppCss()` itself at
// startup (fix round MED-4) — every invocation path (`npm run shots`, `node
// visual-harness/shoot.mjs` directly, `--ignore-scripts`) gets the SAME resolved sheet or
// the SAME loud failure, never a silent SKIP of six gates just because an npm lifecycle
// hook didn't run. `npm run host-css` runs this file's CLI entry (`main()`, below) directly
// — a convenience for pre-warming the cache by hand; it is not the only thing that keeps
// `dist/obsidian-app.css` populated any more.
//
// FOUR possible outcomes, in priority order, and NONE of them may fabricate a pass:
//   1. Cached `.asar.gz` present (from an earlier run), or a fresh fetch succeeds — the
//      WHOLE chain (asar.gz -> gunzip -> app.css) is verified against the pin. A CACHED
//      copy that fails verification is NOT an immediate failure: the cache is deleted and
//      ONE fresh fetch is attempted before giving up (a truncated/corrupted download
//      should self-heal, not need a human to notice and delete a file). A FRESH fetch that
//      fails verification (cached-then-refetched, or fetched directly) IS a loud failure —
//      `process.exit(1)` (via the caller's catch), never a silent fallback —
//      `dist/obsidian-app.css` is left untouched, never overwritten with unverified bytes.
//   2. No cache, the fetch completes with a NON-OK HTTP status (404/403/5xx) — this is a
//      WRONG PIN (a mistyped/retired/yanked version), not an offline machine, and is a loud
//      failure exactly like a hash mismatch. Falling back here would silently swap "the
//      pin" for "whatever happens to be installed" while still claiming to gate the pin
//      (fix round MED-2 — this round's own 1.14.0 dead end is exactly this shape).
//   3. No cache, the fetch itself THROWS (DNS failure, connection refused/reset, timeout —
//      a genuinely unreachable network) — falls back to the INSTALLED Obsidian's own asar
//      (SC-205's `findObsidianAsar`/`readAsarFile`, reused not forked; ELIGIBILITY is a
//      parseable x.y.z version, independent of SC-205's own `PINNED_OBSIDIAN` floor — fix
//      round MED-3, see `isEligibleInstalledAsar`'s own comment for why that floor is the
//      wrong question here). If the installed version happens to equal the pin's, its
//      `app.css` is verified against `appCssSha256` and recorded as `installed-pinned` — a
//      REAL verified gate, not a fallback (an offline dev running exactly the pinned
//      Obsidian should not lose the gate). Otherwise it's `installed-fallback`: a
//      clearly-worded WARNING naming the sheet actually in use (version + hash — NOT the
//      pin), and the run continues (exit 0).
//   4. No cache, no fetch, no eligible installed asar either — writes nothing, and DELETES
//      any stale `dist/obsidian-app.css`/`.meta.json` left from an earlier run (fix round
//      MED-1's second leg: a SKIP must not be sitting next to a leftover sheet a later,
//      differently-invoked run could silently pick up and gate against). The sweeps' own
//      "SKIPPED (no resolved sheet)" line covers it.
//
// SEPARATELY, `checkDriftAgainstInstalled` always compares the INSTALLED Obsidian against
// the pin (same eligibility rule as outcome 3, independent of which outcome above happened)
// and prints ONE line if they differ — the single warn-on-drift line that replaces the five
// per-sweep drift clauses rounds 1-5 each printed. Drift is expected, not a failure: the
// gate keeps running against the pin either way.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import { findObsidianAsar, readAsarFile } from './obsidian-host-pin.mjs';
import { OBSIDIAN_APP_CSS_PIN } from './obsidian-app-css.pin.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIST_DIR = path.join(dir, 'dist');
export const OUT_CSS_FILE = path.join(DEFAULT_DIST_DIR, 'obsidian-app.css');
export const OUT_META_FILE = path.join(DEFAULT_DIST_DIR, 'obsidian-app.css.meta.json');

/** Fix round LOW-2: every top-level failure print (the CLI's `main()`, `shoot.mjs`'s own
 *  `ensurePinnedObsidianAppCss`) appends this so a dev isn't left to read the source to
 *  learn the remedy. */
export const HASH_FAILURE_REMEDY =
	'Delete visual-harness/dist/ and re-run `npm run host-css`; if the pin itself changed ' +
	'recently, see visual-harness/README.md → "Obsidian app.css pin" for the bump procedure.';

export function sha256(bufOrStr) {
	return crypto.createHash('sha256').update(bufOrStr).digest('hex');
}

/** Pure and hermetic — the piece jest exercises directly (no network, no disk) to prove
 *  the recipe's hash verification can-fail. Throws a descriptive Error on any mismatch. */
export function assertHash(actual, expected, what) {
	if (actual !== expected) throw new Error(`HASH MISMATCH (${what}): got ${actual}, expected ${expected}`);
}

/**
 * Fix round MED-1 — read whatever `resolvePinnedObsidianAppCss` last wrote and RE-VERIFY
 * it, every call. Before this round's fix round, `shoot.mjs`'s loader trusted the sidecar
 * meta on its word; proved exploitable: a hand-written 34-byte CSS comment dropped in as
 * `dist/obsidian-app.css`, under the GENUINE `pinned-cache`/`1.13.7`/`f612f1e8…` meta, made
 * all six SC-202 sweeps print "OK against the real Obsidian app.css" over those 34 bytes.
 * The bytes on disk are re-hashed here against TWO independent things: the meta's
 * own recorded hash (catches "the file changed since it was written" — corruption, a hand
 * edit, a stale leftover) and, whenever the meta claims any pinned equivalence
 * (`pinned-fetch`, `pinned-cache`, `installed-pinned` — anything that is NOT the
 * explicitly-uncertain `installed-fallback`), the committed `pin.appCssSha256` itself
 * (catches "the meta was rewritten to match a tampered file" too — defense in depth, not
 * merely trusting one JSON sidecar to check itself). Exported (not folded into `shoot.mjs`)
 * so it's directly, hermetically jest-testable without launching a browser.
 * @returns {{css:string, version:string, sha256:string, source:string} | null} `null` means
 *  "no sheet resolved" (the caller's own SKIP applies); THROWS on a verification failure —
 *  the caller decides how to present that as a loud failure.
 */
export function readVerifiedSheet({ pin = OBSIDIAN_APP_CSS_PIN, distDir = DEFAULT_DIST_DIR } = {}) {
	const outCssFile = path.join(distDir, 'obsidian-app.css');
	const outMetaFile = path.join(distDir, 'obsidian-app.css.meta.json');
	let css;
	let meta;
	try {
		css = fs.readFileSync(outCssFile, 'utf8');
		meta = JSON.parse(fs.readFileSync(outMetaFile, 'utf8'));
	} catch {
		return null;
	}
	if (!css || !meta?.sha256) return null;
	const actualSha256 = sha256(css);
	if (actualSha256 !== meta.sha256) {
		throw new Error(
			`OBSIDIAN APP.CSS MISMATCH — ${outCssFile} does not match its own ${outMetaFile} ` +
				`(sha256 ${actualSha256} on disk, meta says ${meta.sha256}) — the sheet changed, or ` +
				`was replaced, after it was written.`,
		);
	}
	if (meta.source !== 'installed-fallback' && actualSha256 !== pin.appCssSha256) {
		throw new Error(
			`OBSIDIAN APP.CSS MISMATCH — ${outMetaFile} claims source "${meta.source}" (a ` +
				`verified-against-the-pin sheet) but its sha256 (${actualSha256}) does not match the ` +
				`committed pin (${pin.appCssSha256}).`,
		);
	}
	return { css, version: meta.version, sha256: actualSha256, source: meta.source };
}

/**
 * Fix round MED-3: is this a candidate this RECIPE may treat as an offline stand-in for
 * (or a drift comparison against) the pin? `findObsidianAsar`'s own `usable` flag answers a
 * DIFFERENT question — "is this new enough to validate SC-205's hand-copied button-rule
 * MODEL", gated by that module's own `PINNED_OBSIDIAN` floor (1.14.0 as of this round).
 * This recipe's pin is 1.13.7: an installed 1.13.7 (or, generally, any real x.y.z Obsidian,
 * older or newer than SC-205's floor) is a perfectly good candidate for OUR purposes even
 * though `usable` would say no. The one thing still excluded is the unversioned
 * `/opt/.../obsidian.asar` installer copy (`found.version` stays the literal string
 * `'(unversioned installer asar)'` in that case) — its version cannot be compared against
 * anything, pin or floor alike.
 */
function isEligibleInstalledAsar(found) {
	return !!(found && /^\d+\.\d+\.\d+$/.test(found.version));
}

function gzPathFor(pin, distDir) {
	return path.join(distDir, `obsidian-${pin.obsidianVersion}.asar.gz`);
}
function asarPathFor(pin, distDir) {
	return path.join(distDir, `obsidian-${pin.obsidianVersion}.asar`);
}

/** Verify the WHOLE chain from a gz buffer already in hand (cached or freshly fetched) and
 *  extract app.css. Writes the `.asar` to the cache dir too (LOW-3-style housekeeping,
 *  SC-205's own lesson in the old `loadLocalObsidianAppCss`: nothing ever reads it back, so
 *  it's regenerated fresh from the verified gz every run rather than cached-and-trusted
 *  itself — one fewer cache-invalidation case, and gunzip of an 8.8 MB file is cheap).
 *  Throws on any hash mismatch — the loud-failure half of outcome 1's contract. */
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

/** Delete whatever sheet/meta are on disk, ignoring "already gone" — fix round MED-1's
 *  second leg: a printed SKIP must never leave a stale sheet a later run could silently
 *  pick up and gate against (see outcome 4 above). */
function clearResolvedSheet(outCssFile, outMetaFile) {
	for (const f of [outCssFile, outMetaFile]) {
		try {
			fs.unlinkSync(f);
		} catch {
			/* already absent — fine */
		}
	}
}

/**
 * The whole recipe (outcomes 1-4 above). `fetchImpl`/`urlOverride` are seams for the
 * can-fail proofs and the no-network simulation — production callers pass neither and get
 * the real global `fetch` against `pin.source`. `urlOverride` is also exposed on the CLI
 * via the `SC202_HOST_CSS_URL_OVERRIDE` env var (see `main()` below) for a real,
 * no-code-change no-network simulation: point it at a guaranteed-unreachable host.
 * `distDir` is a THIRD seam, jest-only: the can-fail proofs point it at a scratch directory
 * so a deliberately bad pin never touches this repo's real `visual-harness/dist/` cache.
 *
 * Throws (never resolves) on: a hash mismatch surviving the one cache self-heal retry, or
 * a non-OK HTTP status (outcome 2 — a wrong pin, not an offline machine). Every OTHER path
 * resolves — including "nothing usable at all" (`{resolved: false}`, outcome 4), which is
 * legitimate, not an error.
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

	/** One fetch attempt, classified into the three shapes outcomes 2/3 need to tell apart:
	 *  a genuine network-level failure (fetchImpl itself threw — DNS/refused/reset/timeout),
	 *  a completed-but-bad HTTP response (a wrong pin), or success. */
	async function fetchFresh() {
		let res;
		try {
			res = await fetchImpl(url);
		} catch (err) {
			return { kind: 'network-error', err };
		}
		if (!res.ok) return { kind: 'http-error', status: res.status };
		return { kind: 'ok', gzBuf: Buffer.from(await res.arrayBuffer()) };
	}

	/** Verify + write on success — shared by the cache path and the fresh-fetch path so
	 *  both go through the exact same hash gate and write the exact same shape of meta.
	 *  INFO-4: `sha256` records the hash of the bytes actually written (computed here), not
	 *  `pin.appCssSha256` restated — equivalent today (verification already proved them
	 *  equal) but strictly more honest, and free. */
	function finish(gzBuf, usedNetwork) {
		if (usedNetwork) {
			fs.mkdirSync(distDir, { recursive: true });
			fs.writeFileSync(gzPath, gzBuf);
		}
		const { css, asarSha256 } = verifyAndExtract(gzBuf, pin, distDir); // throws on mismatch
		fs.writeFileSync(outCssFile, css);
		const meta = {
			source: usedNetwork ? 'pinned-fetch' : 'pinned-cache',
			version: pin.obsidianVersion,
			sha256: sha256(css),
			asarGzSha256: sha256(gzBuf),
			asarSha256,
			sourceUrl: pin.source,
			fetchedAt: new Date().toISOString(),
		};
		writeMeta(meta, outMetaFile, distDir);
		return { resolved: true, mode: meta.source, version: pin.obsidianVersion, sha256: meta.sha256, usedNetwork };
	}

	/** Outcome 3/4 — the fetch is genuinely unreachable (never called for an HTTP error,
	 *  which is outcome 2 and throws instead). `reason` is the network error's own message,
	 *  folded into the printed WARNING/SKIP. */
	function offlineFallback(reason) {
		const found = findObsidianAsar();
		if (isEligibleInstalledAsar(found)) {
			const css = readAsarFile(found.path, 'app.css');
			if (css) {
				const cssSha = sha256(css);
				if (found.version === pin.obsidianVersion && cssSha === pin.appCssSha256) {
					// MED-3's "Better": the installed copy genuinely IS the pin — a real verified
					// gate, not a labelled-uncertain fallback. An offline dev running exactly the
					// pinned Obsidian keeps a real gate instead of losing it to SC-205's floor.
					console.warn(
						`\nOBSIDIAN APP.CSS FETCH UNAVAILABLE (${reason}), no cached copy — but the installed ` +
							`Obsidian IS the pinned version and its app.css verifies against the pin: Obsidian ` +
							`${found.version}, sha256 ${cssSha}. Using it as a verified pinned sheet (not a ` +
							`fallback).`,
					);
					fs.mkdirSync(distDir, { recursive: true });
					fs.writeFileSync(outCssFile, css);
					writeMeta(
						{ source: 'installed-pinned', version: found.version, sha256: cssSha, sourceUrl: pin.source, fetchedAt: new Date().toISOString() },
						outMetaFile,
						distDir,
					);
					return { resolved: true, mode: 'installed-pinned', version: found.version, sha256: cssSha };
				}
				console.warn(
					`\nOBSIDIAN APP.CSS FETCH UNAVAILABLE (${reason}), no cached copy — falling back to the ` +
						`INSTALLED Obsidian's app.css: Obsidian ${found.version}, sha256 ${cssSha}. This is NOT ` +
						`the pinned ${pin.obsidianVersion} sheet (sha256 ${pin.appCssSha256}) — treat any ` +
						`host-leak result this run as informative, not a verified gate. See ` +
						`visual-harness/README.md → "Obsidian app.css pin" to restore the pinned fetch once ` +
						`the network is back.`,
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
		}
		console.warn(
			`\nOBSIDIAN APP.CSS FETCH UNAVAILABLE (${reason}), no cached copy, and no eligible installed ` +
				`Obsidian asar either — host-leak sweeps will SKIP this run.`,
		);
		clearResolvedSheet(outCssFile, outMetaFile); // MED-1: a printed SKIP must not lie next to a stale sheet
		return { resolved: false };
	}

	if (fs.existsSync(gzPath)) {
		const cachedGz = fs.readFileSync(gzPath);
		try {
			return finish(cachedGz, false); // cached — idempotent, no network (still re-verified)
		} catch (err) {
			// LOW-2: a corrupt/stale cache self-heals ONCE (delete + re-fetch) before this is
			// treated as a real failure — a truncated download shouldn't need a human to notice.
			console.warn(
				`\nOBSIDIAN APP.CSS cached copy failed verification (${err.message}) — deleting the cache ` +
					`and re-fetching once before giving up.`,
			);
			try {
				fs.unlinkSync(gzPath);
			} catch {
				/* already gone */
			}
			try {
				fs.unlinkSync(asarPathFor(pin, distDir));
			} catch {
				/* already gone */
			}
			const fresh = await fetchFresh();
			if (fresh.kind === 'ok') return finish(fresh.gzBuf, true); // may itself throw — the real failure
			if (fresh.kind === 'http-error')
				throw new Error(
					`HTTP ${fresh.status} fetching the pinned Obsidian release asset (${url}) after the cache ` +
						`re-fetch — the pin likely names a version with no public asset; check ` +
						`https://github.com/obsidianmd/obsidian-releases/releases for a real v<ver> tag with a ` +
						`desktop asar.gz asset before re-pinning.`,
				);
			return offlineFallback(fresh.err.message);
		}
	}

	const fresh = await fetchFresh();
	if (fresh.kind === 'ok') return finish(fresh.gzBuf, true);
	if (fresh.kind === 'http-error')
		// MED-2: a completed HTTP error is a WRONG PIN, not an offline machine — loud, never a
		// silent fallback to "whatever is installed" while still claiming to gate the pin.
		throw new Error(
			`HTTP ${fresh.status} fetching the pinned Obsidian release asset (${url}) — the pin likely names ` +
				`a version with no public asset; check https://github.com/obsidianmd/obsidian-releases/releases ` +
				`for a real v<ver> tag with a desktop asar.gz asset before re-pinning.`,
		);
	return offlineFallback(fresh.err.message);
}

/**
 * Warn-on-drift — INDEPENDENT of `resolvePinnedObsidianAppCss` above: always compares the
 * INSTALLED Obsidian (if any ELIGIBLE one — MED-3's rule, same as the fallback) against the
 * pin and prints exactly ONE line if they differ, replacing the five per-sweep drift
 * clauses rounds 1-5 each printed. Never throws — drift is expected until the pin is
 * deliberately bumped, and the gate keeps running against the pin regardless.
 * @returns {{installedVersion: string, installedSha256: string} | null} null when nothing
 *  drifted (or nothing installed/eligible to compare).
 */
export function checkDriftAgainstInstalled({ pin = OBSIDIAN_APP_CSS_PIN } = {}) {
	const found = findObsidianAsar();
	if (!isEligibleInstalledAsar(found)) return null;
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

/**
 * Fix round MED-4 — the shared "make sure a sheet is resolved" entry point BOTH the CLI
 * (`main()`, below) and `shoot.mjs`'s own startup call it: resolve, print the drift line,
 * print ONE provenance line naming what's in use (or that nothing is), and — on a genuine
 * verification failure (never on outcome 4's legitimate "nothing usable") — print the
 * LOW-2 remedy and exit 1. Kept in this module (not duplicated in `shoot.mjs`) so there is
 * exactly one place that decides what "loud failure" looks like for this recipe.
 */
export async function ensurePinnedObsidianAppCss(opts) {
	let result;
	try {
		result = await resolvePinnedObsidianAppCss(opts);
	} catch (err) {
		console.error(`\nOBSIDIAN APP.CSS PIN VERIFICATION FAILED: ${err.message}\n${HASH_FAILURE_REMEDY}`);
		process.exit(1);
	}
	checkDriftAgainstInstalled(opts);
	if (result.resolved) {
		console.log(`\nhost sheet: ${result.mode}, Obsidian ${result.version}, sha256 ${result.sha256}`);
	} else {
		console.log(
			'\nhost sheet: none resolved (no pinned fetch, no cache, and no eligible installed Obsidian) — ' +
				'host-leak sweeps will SKIP this run.',
		);
	}
	return result;
}

async function main() {
	const urlOverride = process.env.SC202_HOST_CSS_URL_OVERRIDE || undefined;
	await ensurePinnedObsidianAppCss({ urlOverride });
}

// CLI entry — `npm run host-css` runs this file directly to pre-warm the cache by hand.
// LOW-3: compares resolved file:// URLs (not a raw string template) so a path needing
// percent-encoding (a space, a non-ASCII character) still matches correctly instead of
// silently skipping the whole CLI body.
//
// r6a re-review (LOW-3b), folded here per the owner's ruling: LOW-3's own `pathToFileURL`
// comparison is a silent no-op when the CLI is invoked THROUGH A SYMLINK —
// `import.meta.url` is realpath-resolved by Node (it always names the file the symlink
// points AT), but `process.argv[1]` is not (it names the symlink itself), so the two
// never compare equal and `main()` never runs. `fs.realpathSync` on both sides fixes it:
// resolve `process.argv[1]` to its real path (as a URL, still via `pathToFileURL`, so the
// percent-encoding fix above survives) and compare that against `import.meta.url`'s own
// (already-real) path.
const entryArg = process.argv[1];
const entryReal = entryArg ? pathToFileURL(fs.realpathSync(path.resolve(entryArg))).href : undefined;
if (entryReal && entryReal === pathToFileURL(fs.realpathSync(fileURLToPath(import.meta.url))).href) {
	main().catch((err) => {
		// Defensive only — `ensurePinnedObsidianAppCss` already handles the expected failure
		// shape (a verification error) with its own exit 1. This catches anything else (a
		// genuine bug) so it still exits non-zero instead of an unhandled-rejection warning.
		console.error(`\nOBSIDIAN APP.CSS PIN VERIFICATION FAILED (unexpected): ${err.message}\n${HASH_FAILURE_REMEDY}`);
		process.exit(1);
	});
}
