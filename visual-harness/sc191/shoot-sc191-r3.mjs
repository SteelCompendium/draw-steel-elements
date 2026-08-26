#!/usr/bin/env node
// SC-191 ROUND 3 camera. Screenshots visual-harness/sc191/mock3.html — the per-AXIS
// variant page — and writes NOWHERE NEAR visual-harness/shots/, so the freeze baseline,
// the print-twin parity assertion and the chrome-placement assertion are all structurally
// untouchable by this script.
//
// Round 3 is not "six treatments" — it is ONE base (`roster`, Scott's pick) with three
// independent AXES, each of which can be decided on its own:
//   crest    before | dark | none | rule      (does the hero monogram earn its place?)
//   seal     before | ink | struck | bare    (the "super bright" test-result circles)
//   space    before | pad  | centre           (the refinement pass)
// A shot names its axis and pins the other two to the round-3 default, so every
// comparison is one-variable.
//
// Usage (from the repo root, inside devbox):
//   node visual-harness/sc191/shoot-sc191-r3.mjs <outDir>
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = 'file://' + path.join(here, 'mock3.html');
const outDir = process.argv[2];
if (!outDir) {
	console.error('usage: node visual-harness/sc191/shoot-sc191-r3.mjs <outDir>');
	process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const WIDE = 820;
const NARROW = 300;

// Every axis ships a labelled `before` — the round-2 roster exactly as Scott saw it — so
// the comparison is honest rather than flattering.
const AXES = {
	crest: ['before', 'dark', 'none', 'rule'],
	seal: ['before', 'ink', 'struck', 'bare'],
	space: ['before', 'pad', 'centre'],
};

const SHOTS = [];
for (const axis of Object.keys(AXES)) {
	for (const option of AXES[axis]) {
		SHOTS.push({ id: `sc191-r3-${axis}-${option}`, axis, option, state: 'mid', width: WIDE, bgs: ['dark', 'light'] });
	}
}
// The recommendation, assembled: every axis at its recommended option, in all three
// states and at sidebar width.
SHOTS.push({ id: 'sc191-r3-recommended-mid', axis: 'all', option: 'rec', state: 'mid', width: WIDE, bgs: ['dark', 'light'] });
SHOTS.push({ id: 'sc191-r3-recommended-empty', axis: 'all', option: 'rec', state: 'empty', width: WIDE, bgs: ['dark', 'light'] });
SHOTS.push({ id: 'sc191-r3-recommended-done', axis: 'all', option: 'rec', state: 'done', width: WIDE, bgs: ['dark', 'light'] });
SHOTS.push({ id: 'sc191-r3-recommended-narrow', axis: 'all', option: 'rec', state: 'mid', width: NARROW, bgs: ['dark', 'light'] });
// The "+" affordance in the Heroes corner, hovered, so the universal change is visible
// as a control rather than asserted.
SHOTS.push({ id: 'sc191-r3-addhero-hover', axis: 'all', option: 'rec', state: 'mid', width: WIDE, bgs: ['dark'], hover: 'addhero' });
// Colour last: the same recommended board with every hue removed.
SHOTS.push({ id: 'sc191-r3-recommended-grey', axis: 'all', option: 'rec', state: 'mid', width: WIDE, bgs: ['dark'], gray: true });

const browser = await chromium.launch();
const failures = [];
for (const shot of SHOTS) {
	for (const bg of shot.bgs) {
		const page = await browser.newPage({
			viewport: { width: Math.max(shot.width + 60, 380), height: 900 },
			deviceScaleFactor: 2,
		});
		const qs = new URLSearchParams({ axis: shot.axis, option: shot.option, state: shot.state, bg, width: String(shot.width) });
		if (shot.gray) qs.set('gray', 'on');
		if (shot.hover) qs.set('hover', shot.hover);
		await page.goto(`${page_url}?${qs.toString()}`, { waitUntil: 'load' });
		await page.waitForFunction(() => window.__sc191r3Done !== undefined, null, { timeout: 10000 });
		const mount = page.locator('#mount');
		const out = path.join(outDir, `${shot.id}-${bg}.png`);
		try {
			await mount.screenshot({ path: out });
			console.log(`  ok ${path.basename(out)}`);
		} catch (e) {
			failures.push(`${shot.id}/${bg}: ${String(e)}`);
		}
		await page.close();
	}
}
await browser.close();
if (failures.length) {
	for (const f of failures) console.error(`FAIL ${f}`);
	process.exit(1);
}
console.log(`sc191 round-3 shots written to ${outDir}`);
