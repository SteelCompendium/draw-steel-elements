#!/usr/bin/env node
// visual-harness/strips.mjs — SC-132 ROUND 3 camera: per-COMPONENT option strips.
//
// Round 2 put four whole-cluster LAYOUTS up for a pick; Scott declined to choose one
// until the individual components' appearance is settled. So this camera shoots one
// page per component question, each holding every option for that component rendered
// against the same state(s) — the only variable in a comparison is the thing being
// decided.
//
// Same quarantine as candidates.mjs, for the same reasons: a SEPARATE camera writing to
// a SEPARATE directory (`shots-candidates/`), driven by fixtures that are off the
// manifest, so `npm run shots` and the freeze surface cannot see any of it.
//
// Output: visual-harness/shots-candidates/strip--<id>--<scheme>.png
//
// Usage: node visual-harness/strips.mjs [--strip=temp] [--scheme=dark]
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

// Kept in sync with STRIPS in entry.ts by the page itself: the boot exposes the ids so
// the camera cannot silently drift from the definitions.
const ALL = [
	'temp-edge',
	'max-mark',
	'c-height',
	'temp',
	'rec-shape',
	'rec-label',
	'catch-breath',
	'dying',
	'fresh',
	'conditions',
];
const STRIPS = args.strip ? [args.strip] : ALL;
const SCHEMES = args.scheme ? [args.scheme] : ['dark', 'light'];

const failures = [];

const browser = await chromium.launch();
// Wider than the candidate boards' 1000px: a strip is a side-by-side comparison, so the
// page has to carry the option-label rail plus N state columns without squeezing the
// gauge into something that no longer represents how it renders.
const context = await browser.newContext({
	viewport: { width: 1400, height: 320 },
	deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
	for (const strip of STRIPS) {
		for (const bg of SCHEMES) {
			const outName = `strip--${strip}--${bg}`;
			const pageErrors = [];
			const onErr = (e) => pageErrors.push(String(e));
			page.on('pageerror', onErr);
			try {
				await page.goto(`${pageUrl}?${new URLSearchParams({ strip, theme: 'steel', bg })}`);
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
	}
} catch (e) {
	failures.push({ outName: 'sweep', errors: ['exception: ' + String(e)] });
} finally {
	await browser.close();
}

if (failures.length) {
	console.error(`\n${failures.length} strip(s) had errors:`);
	for (const f of failures) console.error(`  ${f.outName}: ${f.errors.join(' | ')}`);
	process.exit(1);
}
console.log(`\nstrips written to ${outDir}`);
