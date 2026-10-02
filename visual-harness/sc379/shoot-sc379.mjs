#!/usr/bin/env node
// SC-379 ROUND 1 CAMERA. Screenshots the three negotiation candidates (sc379/mock.html)
// and the matching BEFORE (the shipped element, through the real harness page
// ../index.html + the real pipeline) into <outDir> — never into visual-harness/shots/,
// so the freeze baseline, the print-twin parity assertion and the chrome-placement gate
// are structurally untouchable by this script.
//
// The BEFORE is driven into the SAME mid-negotiation state as the candidates with real
// clicks on the shipped affordances (no fixture edit): Interest 3 / Patience 3 come from
// example.yaml; then "Peace" is ticked in the Motivations list (already appealed to),
// "Higher Authority" is ticked under "Appeals to Motivation", and the 12–16 tier row is
// chosen. Every candidate's default state shows exactly that.
//
// Prereq (writes only gitignored dist/): `npm run shots -- --element=negotiation` once,
// which builds dist/harness.{js,css} and fetches the pinned dist/obsidian-app.css.
// Usage (repo root, inside devbox):
//   node visual-harness/sc379/shoot-sc379.mjs <outDir>
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MOCK = 'file://' + path.join(here, 'mock.html');
const HARNESS = 'file://' + path.join(here, '..', 'index.html');
const outDir = process.argv[2];
if (!outDir) {
	console.error('usage: node visual-harness/sc379/shoot-sc379.mjs <outDir>');
	process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const WIDE = 760; // the harness's own #mount max-width (vars.css)
const NARROW = 300; // sidebar-leaf width, NARROW_SHOTS' convention

// [state, bg, narrow]
const MATRIX = [
	['default', 'dark', false],
	['learn', 'dark', false],
	['ended', 'dark', false],
	['default', 'light', false],
	['default', 'dark', true],
];

const shots = [];
for (const cand of ['A', 'B', 'C']) {
	for (const [state, bg, narrow] of MATRIX) {
		shots.push({ kind: 'mock', cand, state, bg, narrow });
	}
}
shots.push({ kind: 'before', state: 'default', bg: 'dark', narrow: false });
shots.push({ kind: 'before', state: 'default', bg: 'light', narrow: false });
shots.push({ kind: 'before', state: 'default', bg: 'dark', narrow: true });

function outName(s) {
	const who = s.kind === 'before' ? 'before' : s.cand;
	return `sc379-r1-${who}-${s.state}-${s.bg}${s.narrow ? '-narrow' : ''}.png`;
}

const browser = await chromium.launch();
const failures = [];
for (const s of shots) {
	const width = s.narrow ? NARROW : WIDE;
	const page = await browser.newPage({ viewport: { width: width + 100, height: 3400 }, deviceScaleFactor: 2 });
	page.on('pageerror', (e) => failures.push(`${outName(s)}: pageerror ${String(e)}`));
	try {
		if (s.kind === 'mock') {
			const q = new URLSearchParams({ cand: s.cand, state: s.state, bg: s.bg, width: String(width) });
			await page.goto(`${MOCK}?${q}`, { waitUntil: 'load' });
			await page.waitForFunction(() => window.__n3Done === true, null, { timeout: 10000 });
		} else {
			const q = new URLSearchParams({ element: 'negotiation', fixture: 'default', theme: 'steel', bg: s.bg, sheet: '1' });
			if (s.narrow) q.set('width', String(width));
			await page.goto(`${HARNESS}?${q}`, { waitUntil: 'load' });
			await page.waitForFunction(() => window.__dseHarnessDone !== undefined, null, { timeout: 15000 });
			const root = page.locator('[data-dse-element="negotiation"]');
			await root.locator('.dse-nt__motivations label', { hasText: 'Peace' }).locator('input').click();
			await page.waitForTimeout(400); // persist() is a debounced write-behind
			await root.locator('.dse-nt__argument-motivations label', { hasText: 'Higher Authority' }).locator('input').click();
			await page.waitForTimeout(400);
			await root.locator('button.dse-pr__row[data-tier="mid"]').click();
			await page.mouse.move(0, 0);
			const done = await page.evaluate(() => window.__dseHarnessDone);
			if (done.errors && done.errors.length) failures.push(`${outName(s)}: ${done.errors.join('; ')}`);
		}
		const out = path.join(outDir, outName(s));
		await page.locator('#mount').screenshot({ path: out });
		console.log(`  ok ${out}`);
	} catch (e) {
		failures.push(`${outName(s)}: ${String(e)}`);
	}
	await page.close();
}
await browser.close();
if (failures.length) {
	for (const f of failures) console.error(`FAIL ${f}`);
	process.exit(1);
}
console.log(`sc379 round-1 shots written to ${outDir}`);
