#!/usr/bin/env node
// visual-harness/docs-shots.mjs — SC-142 phase 2a: regenerate every screenshot in
// README.md and docs/** from the real plugin, in one command.
//
//     npm run docs-shots                       # everything
//     npm run docs-shots -- --only=statblock.png
//     npm run docs-shots -- --browser-only     # skip the Obsidian half (no display needed)
//
// Two cameras, one manifest (docs-manifest.mjs):
//   browser  — the F4 harness page in Chromium (playwright). Pure element cards. Fast,
//              deterministic, needs no display.
//   obsidian — obsidian-camera.mjs --docs, driving a real Obsidian over CDP. The settings
//              pages, modals, canvas and the sidebar exist nowhere else.
//
// THE DISPLAY (the reason this script exists rather than a line in package.json): real
// Obsidian is an Electron app and needs an X display, but NOT the user's. This starts its
// own Xvfb (a virtual framebuffer — an X server that renders into memory), points the
// camera at it, and tears it down afterwards. The user's desktop session is never touched:
// nothing appears on screen, no window steals focus, and a running Obsidian on :1 is
// irrelevant (the camera spawns its own instance against its own scratch user-data-dir on
// its own display).
//
// Xvfb comes from this repo's devbox package set (`xvfb` in devbox.json). If it is missing,
// this script says exactly what to run — and, as a last resort, how to do it on the user's
// own display instead.
//
// Env: DSE_DOCS_DISPLAY  virtual display to use (default :99; an unused one is picked if
//                        that is taken)
//      XVFB_BIN          explicit Xvfb binary (otherwise: PATH, then the devbox profile)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { DOCS_SHOTS, DOCS_MANUAL } from './docs-manifest.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const pageUrl = 'file://' + path.join(dir, 'index.html');
const outDir = path.join(repo, 'docs', 'Media');

const args = Object.fromEntries(
	process.argv
		.slice(2)
		.filter((a) => a.startsWith('--'))
		.map((a) => {
			const [k, v] = a.replace(/^--/, '').split('=');
			return [k, v ?? '1'];
		}),
);

const wanted = DOCS_SHOTS.filter((s) => !args.only || s.out === args.only);
if (args.only && wanted.length === 0) {
	console.error(`unknown --only=${args.only} (not in docs-manifest.mjs)`);
	process.exit(2);
}
const browserShots = wanted.filter((s) => s.source === 'browser');
const obsidianShots = wanted.filter((s) => s.source === 'obsidian');

fs.mkdirSync(outDir, { recursive: true });
const failures = [];

/** Byte budget per docs image. Docs pages are read over the network; a 2.5 MB screenshot
 *  of one statblock is not a picture, it is a download. Browser captures fall back from
 *  2x to 1x when they bust this (see runBrowserShots). */
const MAX_IMAGE_BYTES = 900_000;

// ---------------------------------------------------------------- browser half (F4 page)
async function runBrowserShots() {
	if (browserShots.length === 0) return;
	if (!fs.existsSync(path.join(dir, 'dist'))) {
		throw new Error('visual-harness/dist missing — run `npm run harness:build` first');
	}
	const browser = await chromium.launch();
	// Wider than the F4 sweep's 900px: docs images want room for the side-by-side
	// statblock and the gallery. deviceScaleFactor 2 = retina-crisp on the docs site;
	// entries that are already huge in CSS pixels (the gallery, the wide statblock) opt
	// down to 1 via `dpr`, or the PNG lands in the tens of megabytes.
	const contexts = new Map();
	const pageFor = async (dpr) => {
		let entry = contexts.get(dpr);
		if (!entry) {
			const context = await browser.newContext({
				viewport: { width: 1400, height: 1400 },
				deviceScaleFactor: dpr,
			});
			entry = { context, page: await context.newPage() };
			contexts.set(dpr, entry);
		}
		return entry.page;
	};
	try {
		for (const shot of browserShots) {
			const params = { theme: 'steel', bg: shot.bg ?? 'dark' };
			// `gallery: true` = every element; `gallery: [ids]` = just those, in order.
			if (shot.gallery) params.gallery = Array.isArray(shot.gallery) ? shot.gallery.join(',') : '1';
			else {
				params.element = shot.element;
				params.fixture = shot.fixture ?? 'default';
			}
			if (shot.width) params.width = String(shot.width);
			if (shot.prefs) {
				params.prefs = Object.entries(shot.prefs)
					.map(([k, v]) => `${k}:${v}`)
					.join(',');
			}
			const page = await pageFor(shot.dpr ?? 2);
			const pageErrors = [];
			const onErr = (e) => pageErrors.push(String(e));
			page.on('pageerror', onErr);
			try {
				await page.goto(`${pageUrl}?${new URLSearchParams(params)}`);
				await page.waitForFunction(() => window.__dseHarnessDone !== undefined, null, { timeout: 20000 });
				const done = await page.evaluate(() => window.__dseHarnessDone);
				const errors = [...done.errors, ...pageErrors];
				if (errors.length) throw new Error(errors.join(' | '));
				const file = path.join(outDir, shot.out);
				const write = async (p) => {
					// 60s, not playwright's 30s default: a 7 000 px statblock at 2x is a slow
					// stitch, and a timeout here reads as a broken shot rather than a big one.
					if (shot.gallery) await p.screenshot({ path: file, fullPage: true, timeout: 60000 });
					else await p.locator('#mount').screenshot({ path: file, timeout: 60000 });
					return fs.statSync(file).size;
				};
				let bytes = await write(page);
				let dpr = shot.dpr ?? 2;
				// Retina is for small cards. A full statblock is already 3 600 CSS px tall,
				// and at 2x it lands at 2.5 MB — a docs page nobody wants to load. Rather
				// than hand-tuning a dpr per entry (and re-tuning it every time a fixture
				// grows), fall back to 1x whenever the 2x file busts the budget.
				if (bytes > MAX_IMAGE_BYTES && dpr > 1) {
					dpr = 1;
					bytes = await write(await pageFor(dpr));
					console.log(`     (re-shot at 1x — 2x was over ${Math.round(MAX_IMAGE_BYTES / 1000)} kB)`);
				}
				const over = bytes > MAX_IMAGE_BYTES ? ' — OVER BUDGET, consider a shorter fixture' : '';
				console.log(`  ok ${shot.out} (${bytes} bytes, browser @${dpr}x)${over}`);
			} catch (e) {
				failures.push({ out: shot.out, error: String(e) });
				console.log(`FAIL ${shot.out}: ${String(e)}`);
			} finally {
				page.off('pageerror', onErr);
			}
		}
	} finally {
		await browser.close();
	}
}

// ------------------------------------------------------------------- the virtual display
/** Xvfb, in preference order: explicit env, PATH, this repo's devbox profile. */
function resolveXvfb() {
	if (process.env.XVFB_BIN && fs.existsSync(process.env.XVFB_BIN)) return process.env.XVFB_BIN;
	const onPath = spawnSync('which', ['Xvfb'], { encoding: 'utf8' });
	if (onPath.status === 0 && onPath.stdout.trim()) return onPath.stdout.trim();
	const devboxBin = path.join(repo, '.devbox', 'nix', 'profile', 'default', 'bin', 'Xvfb');
	if (fs.existsSync(devboxBin)) return devboxBin;
	// devbox.json lists xvfb, but `devbox install` has not materialized the profile in this
	// clone yet. Do it rather than failing — one command has to mean one command.
	console.log('Xvfb not found — running `devbox install` to materialize this repo\'s packages…');
	const install = spawnSync('devbox', ['install'], { cwd: repo, stdio: 'inherit' });
	if (install.status === 0 && fs.existsSync(devboxBin)) return devboxBin;
	return null;
}

const XVFB_HELP = `
Xvfb is unavailable, so the Obsidian half of the docs shots cannot run headlessly.

  Fix (preferred, one time):   cd ${path.relative(process.cwd(), repo) || '.'} && devbox install
     (visual-harness needs the \`xvfb\` package that devbox.json already lists)

  Fallback — use your own display instead. Obsidian must not already be running,
  because the camera spawns its own instance:

     1. Quit Obsidian completely (File → Quit; check the tray icon).
     2. DSE_DOCS_DISPLAY=:1 DSE_DOCS_NO_XVFB=1 npm run docs-shots

  A window will open, do things by itself for a minute or two, and close again.
  Do not click in it while it runs.`;

function freeDisplay(preferred) {
	const taken = (n) => fs.existsSync(`/tmp/.X11-unix/X${n}`);
	const pref = Number(String(preferred).replace(':', ''));
	if (!taken(pref)) return pref;
	for (let n = 99; n < 130; n++) if (!taken(n)) return n;
	throw new Error('no free X display number between :99 and :129');
}

async function startXvfb() {
	const bin = resolveXvfb();
	if (!bin) return null;
	const num = freeDisplay(process.env.DSE_DOCS_DISPLAY ?? ':99');
	// 1600x1200: the camera asks Obsidian for a 1440x1100 window, and the WM clamps a
	// window to the screen — a smaller framebuffer would silently shrink every capture.
	const child = spawn(bin, [`:${num}`, '-screen', '0', '1600x1200x24', '-nolisten', 'tcp'], {
		stdio: 'ignore',
		detached: false,
	});
	child.on('error', () => {});
	for (let i = 0; i < 40; i++) {
		if (fs.existsSync(`/tmp/.X11-unix/X${num}`)) {
			console.log(`Xvfb up on :${num} (${bin}) — your own display is not touched`);
			return { child, display: `:${num}` };
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	child.kill('SIGKILL');
	return null;
}

// --------------------------------------------------------------- obsidian half (CDP)
async function runObsidianShots() {
	if (obsidianShots.length === 0) return;

	let xvfb = null;
	let display = process.env.DSE_DOCS_DISPLAY ?? null;
	if (process.env.DSE_DOCS_NO_XVFB === '1') {
		display = display ?? process.env.DISPLAY ?? ':1';
		console.log(`DSE_DOCS_NO_XVFB=1 — using the existing display ${display}`);
	} else {
		xvfb = await startXvfb();
		if (!xvfb) {
			console.error(XVFB_HELP);
			failures.push({ out: '(obsidian shots)', error: 'Xvfb unavailable — see the note above' });
			return;
		}
		display = xvfb.display;
	}

	try {
		const only = args.only ? [`--only=${args.only}`] : [];
		const res = spawnSync(
			process.execPath,
			[path.join(dir, 'obsidian-camera.mjs'), '--docs', `--out=${outDir}`, ...only],
			{ stdio: 'inherit', env: { ...process.env, DSE_CAMERA_DISPLAY: display, DISPLAY: display } },
		);
		if (res.status !== 0) {
			failures.push({ out: '(obsidian shots)', error: `obsidian-camera.mjs exited ${res.status}` });
		}
	} finally {
		if (xvfb) {
			xvfb.child.kill('SIGTERM');
			setTimeout(() => xvfb.child.kill('SIGKILL'), 3000).unref?.();
		}
	}
}

// ------------------------------------------------------------------------------- main
console.log(
	`docs-shots: ${browserShots.length} browser + ${obsidianShots.length} obsidian image(s) → ${path.relative(repo, outDir)}`,
);
await runBrowserShots();
if (args['browser-only'] !== '1') await runObsidianShots();

// Orphan report: a Media file nobody declares and nobody documents as manual. Reported,
// never deleted — deleting a file the docs still reference is a broken image, and that is
// a human's call.
if (!args.only) {
	const declared = new Set([...DOCS_SHOTS.map((s) => s.out), ...DOCS_MANUAL.map((s) => s.out)]);
	const orphans = fs.readdirSync(outDir).filter((f) => !declared.has(f));
	if (orphans.length) {
		console.log(`\n${orphans.length} file(s) in docs/Media are not in the manifest:`);
		for (const o of orphans) console.log(`  ${o}`);
		console.log('  (add an entry to docs-manifest.mjs, or delete the file)');
	}
	if (DOCS_MANUAL.length) {
		console.log(`\nnot regenerable by this pipeline:`);
		for (const m of DOCS_MANUAL) console.log(`  ${m.out} — ${m.reason}`);
	}
}

if (failures.length) {
	console.error(`\n${failures.length} docs image(s) failed:`);
	for (const f of failures) console.error(`  ${f.out}: ${f.error}`);
	process.exit(1);
}
console.log(`\nall ${wanted.length} docs image(s) written to ${path.relative(repo, outDir)}`);
