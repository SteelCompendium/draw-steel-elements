#!/usr/bin/env node
// visual-harness/candidates.mjs — SC-132 CANDIDATE-STAGE camera.
//
// Shoots the stamina-cluster design candidates as labeled STATE-MATRIX BOARDS: one
// page per (candidate × surface × colour scheme) holding every honest state
// (healthy / temp>0 / winded / dying / read-only) under captions, so a single PNG is
// a reviewable artifact rather than a pile of loose crops.
//
// Deliberately a SEPARATE camera from shoot.mjs, writing to a SEPARATE directory:
//   * `visual-harness/shots/` is the freeze surface (check-freeze.sh hashes it) and
//     the manifest-driven sweep is the gate. Candidate output must not land there.
//   * candidate fixtures live in entry.ts's CANDIDATE_FIXTURES, which is off the
//     manifest, so `npm run shots` cannot see any of this.
//
// Output: visual-harness/shots-candidates/<cand>--<surface>--<scheme>.png
//         plus compare--<scheme>.png (all four candidates, healthy + winded).
//
// Usage: node visual-harness/candidates.mjs [--cand=a] [--scheme=dark]
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

const CANDS = args.cand ? [args.cand] : ['a', 'b', 'c', 'd'];
const SCHEMES = args.scheme ? [args.scheme] : ['dark', 'light'];
const SURFACES = ['stamina-bar', 'hero'];

const failures = [];

async function snap(page, params, outName, fullPage = true) {
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
		if (fullPage) await page.screenshot({ path: file, fullPage: true });
		else await page.locator('#mount').screenshot({ path: file });
		if (errors.length) failures.push({ outName, errors });
		console.log(`${errors.length ? 'FAIL' : '  ok'} ${path.basename(file)}`);
	} catch (e) {
		failures.push({ outName, errors: ['exception: ' + String(e)] });
		console.log(`FAIL ${outName} (exception)`);
	} finally {
		page.off('pageerror', onErr);
	}
}

const browser = await chromium.launch();
// Wider than the sweep's 900px: the boards carry captions plus the hero sheet's own
// multi-column grid, and design review needs the MAIN-PANE width (dse-verify skill's
// capture-width convention), not a narrow leaf.
const context = await browser.newContext({
	viewport: { width: 1000, height: 1400 },
	deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
	for (const cand of CANDS) {
		for (const surface of SURFACES) {
			for (const bg of SCHEMES) {
				await snap(
					page,
					{ board: surface, cand, theme: 'steel', bg },
					`${cand}--${surface}--${bg}`,
				);
			}
		}
	}
} catch (e) {
	failures.push({ outName: 'sweep', errors: ['exception: ' + String(e)] });
} finally {
	await browser.close();
}

if (failures.length) {
	console.error(`\n${failures.length} shot(s) had errors:`);
	for (const f of failures) console.error(`  ${f.outName}: ${f.errors.join(' | ')}`);
	process.exit(1);
}
console.log(`\ncandidate boards written to ${outDir}`);
