#!/usr/bin/env node
// visual-harness/assemblies.mjs — SC-132 ROUND 5 camera: the ASSEMBLED layouts.
//
// Rounds 1-2 put four whole-cluster layouts up for a pick and Scott deferred it until
// the components were settled; rounds 3-4 settled them. This camera shoots the locked
// component set assembled into each surviving layout, as full state-matrix boards, so
// the layout pick is made against finished objects rather than against promises.
//
// Same quarantine as candidates.mjs / strips.mjs, for the same reasons: a SEPARATE
// camera writing to the SEPARATE `shots-candidates/` directory, driven by fixtures that
// are off the manifest, so `npm run shots` and the freeze surface cannot see any of it.
//
// Output: visual-harness/shots-candidates/asm--<layout>--<surface>[--w<px>]--<scheme>.png
//
// Usage: node visual-harness/assemblies.mjs [--asm=la] [--scheme=dark]
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = 'file://' + path.join(dir, 'index.html');
const outDir = path.join(dir, 'shots-candidates');
fs.mkdirSync(outDir, { recursive: true });

const args = Object.fromEntries(
	process.argv
		.slice(2)
		.filter((a) => a.startsWith('--'))
		.map((a) => {
			const [k, v] = a.replace(/^--/, '').split('=');
			return [k, v ?? '1'];
		}),
);

// Kept in sync with ASSEMBLIES in entry.ts; an unknown id fails the run loudly rather
// than writing a blank board.
const ALL = ['la', 'lc', 'ld', 'ld2', 'lap', 'lapn', 'lsc', 'lscn', 'ld3'];
const ASMS = args.asm ? args.asm.split(',') : ALL;
const SCHEMES = args.scheme ? [args.scheme] : ['dark', 'light'];
const SURFACES = ['stamina-bar', 'hero'];

// Sidebar leaves. 300px is Obsidian's DEFAULT right-sidebar width; 260 is about as narrow
// as a leaf is dragged before it stops being usable, and 360 is the common "I gave the
// sidebar some room" width. Round 5 shot 300 only, which is exactly why Scott could see
// that the rail wrapped but not WHERE it starts and stops wrapping. Only the rail claims
// to survive a leaf, so only the rail is shot here.
const NARROW = [
	{ asm: 'ld', surface: 'stamina-bar', width: 260 },
	{ asm: 'ld', surface: 'stamina-bar', width: 300 },
	{ asm: 'ld', surface: 'stamina-bar', width: 360 },
	{ asm: 'ld2', surface: 'stamina-bar', width: 260 },
	{ asm: 'ld2', surface: 'stamina-bar', width: 300 },
	{ asm: 'ld2', surface: 'stamina-bar', width: 360 },
	// Round 7: the same three leaves for the revised two-line rail.
	{ asm: 'ld3', surface: 'stamina-bar', width: 260 },
	{ asm: 'ld3', surface: 'stamina-bar', width: 300 },
	{ asm: 'ld3', surface: 'stamina-bar', width: 360 },
];

// ROUND 6, Scott: "In the Hero sheet, all 3 layouts appear to be very squished
// horizontally. I assume they will look better in actual use." The board viewport is
// 760px, which is a NARROW Obsidian note; a maximised editor pane on a laptop is
// 900-1100. So the hero board is re-shot with #mount pinned to 860px inside a wider
// viewport — verifying the assumption rather than repeating it.
const WIDE = [
	{ asm: 'lap', surface: 'hero', width: 860 },
	{ asm: 'lapn', surface: 'hero', width: 860 },
	// Round 7: Scott's layout has to be judged at BOTH hero widths — the default board
	// (760px mount → a ~340px stamina region, the narrow case) is shot by the loop above,
	// and this is the maximised-editor case where the two-row split has real room.
	{ asm: 'lsc', surface: 'hero', width: 860 },
	{ asm: 'lscn', surface: 'hero', width: 860 },
];

const failures = [];

const browser = await chromium.launch();
// 760px, not the round-1 boards' 1000px: the cluster's widest member is C's banner at
// 26rem (416px), so 1000px was mostly empty plate, and a narrower board keeps a
// full-matrix screenshot legible when Linear scales it down.
const context = await browser.newContext({
	viewport: { width: 760, height: 900 },
	deviceScaleFactor: 2,
});
const page = await context.newPage();

async function snap(params, outName) {
	const pageErrors = [];
	const onErr = (e) => pageErrors.push(String(e));
	page.on('pageerror', onErr);
	try {
		await page.goto(`${pageUrl}?${new URLSearchParams(params)}`);
		await page.waitForFunction(() => window.__dseHarnessDone !== undefined, null, {
			timeout: 20000,
		});
		const done = await page.evaluate(() => window.__dseHarnessDone);
		const errors = [...done.errors, ...pageErrors];
		const file = path.join(outDir, `${outName}${errors.length ? '--ERROR' : ''}.png`);
		await page.screenshot({ path: file, fullPage: true });
		if (errors.length) failures.push({ outName, errors });
		console.log(`${errors.length ? 'FAIL' : '  ok'} ${path.basename(file)}`);
	} catch (e) {
		failures.push({ outName, errors: ['exception: ' + String(e)] });
		console.log(`FAIL ${outName} (exception)`);
	} finally {
		page.off('pageerror', onErr);
	}
}

try {
	for (const asm of ASMS) {
		for (const surface of SURFACES) {
			for (const bg of SCHEMES) {
				await snap({ asm, board: surface, theme: 'steel', bg }, `asm--${asm}--${surface}--${bg}`);
			}
		}
	}
	for (const n of [...NARROW, ...WIDE]) {
		if (!ASMS.includes(n.asm)) continue;
		for (const bg of SCHEMES) {
			// A 860px mount needs a viewport wide enough to hold it plus the board's own
			// 26px gutters, or the capture just clips at 760 and reports nothing.
			await page.setViewportSize({ width: Math.max(760, n.width + 120), height: 900 });
			await snap(
				{ asm: n.asm, board: n.surface, theme: 'steel', bg, width: String(n.width) },
				`asm--${n.asm}--${n.surface}--w${n.width}--${bg}`,
			);
		}
	}
	await page.setViewportSize({ width: 760, height: 900 });
} catch (e) {
	failures.push({ outName: 'sweep', errors: ['exception: ' + String(e)] });
} finally {
	await browser.close();
}

if (failures.length) {
	console.error(`\n${failures.length} board(s) had errors:`);
	for (const f of failures) console.error(`  ${f.outName}: ${f.errors.join(' | ')}`);
	process.exit(1);
}
console.log(`\nassembly boards written to ${outDir}`);
