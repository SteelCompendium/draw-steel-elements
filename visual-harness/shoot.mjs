#!/usr/bin/env node
// visual-harness/shoot.mjs — the F4 camera (Plan 11). Sweeps element × theme × bg
// (+ steel print) through the built harness page and writes deterministic PNGs to
// visual-harness/shots/. Any mount error (error card, page error, unknown fixture)
// saves the shot with an --ERROR suffix and exits nonzero naming the failure.
// Flags: --element=<id> --theme=<legacy|steel> --bg=<dark|light> --fixture=<name> --readonly
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = 'file://' + path.join(dir, 'index.html');
const shotsDir = path.join(dir, 'shots');
fs.mkdirSync(shotsDir, { recursive: true });

const args = Object.fromEntries(
	process.argv
		.slice(2)
		.filter((a) => a.startsWith('--'))
		.map((a) => {
			const [k, v] = a.replace(/^--/, '').split('=');
			return [k, v ?? '1'];
		}),
);

const COMBOS = [
	{ theme: 'legacy', bg: 'dark' },
	{ theme: 'legacy', bg: 'light' },
	{ theme: 'steel', bg: 'dark' },
	{ theme: 'steel', bg: 'light' },
	{ theme: 'steel', bg: 'dark', print: true },
];
const comboName = (c) => (c.print ? `${c.theme}-print` : `${c.theme}-${c.bg}`);

const failures = [];

async function snap(page, params, outName) {
	const pageErrors = [];
	const onErr = (e) => pageErrors.push(String(e));
	page.on('pageerror', onErr);
	try {
		await page.goto(`${pageUrl}?${new URLSearchParams(params)}`);
		await page.waitForFunction(() => window.__dseHarnessDone !== undefined, null, {
			timeout: 15000,
		});
		const done = await page.evaluate(() => window.__dseHarnessDone);
		const errors = [...done.errors, ...pageErrors];
		const file = path.join(shotsDir, `${outName}${errors.length ? '--ERROR' : ''}.png`);
		if (params.gallery) await page.screenshot({ path: file, fullPage: true });
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
const context = await browser.newContext({
	viewport: { width: 900, height: 1200 },
	deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
	// Manifest drives the sweep — single source of truth is the page itself.
	await page.goto(pageUrl);
	await page.waitForFunction(() => window.__dseHarnessManifest !== undefined);
	const manifest = await page.evaluate(() => window.__dseHarnessManifest);

	// SC-108 / FOLLOWUPS #37: keep the manifest's per-element `fixtures` list (not just
	// ids) so the sweep can shoot every named fixture, not only 'default'. Naming rule
	// (design §6): default-fixture output stays `${id}--${combo}` byte-for-byte unchanged
	// for every element; a NON-default fixture gets `${id}-${fixtureName}--${combo}` so it
	// can never collide with — and overwrite — a frozen default-fixture golden.
	let elements = manifest.elements;
	const narrowShots = manifest.narrowShots ?? [];
	if (args.element) elements = elements.filter((e) => e.id === args.element);
	// A narrow-shot id (e.g. `perk-narrow`) is a legal --element value even though it is
	// not a registered element — it selects only that capture below.
	if (args.element && elements.length === 0 && !narrowShots.some((n) => n.id === args.element)) {
		console.error(`unknown --element=${args.element}`);
		process.exit(2);
	}
	let combos = COMBOS;
	if (args.theme) combos = combos.filter((c) => c.theme === args.theme && !c.print);
	if (args.bg) combos = combos.filter((c) => c.bg === args.bg && !c.print);
	if (combos.length === 0) {
		const badParts = [];
		if (args.theme) badParts.push(`--theme=${args.theme}`);
		if (args.bg) badParts.push(`--bg=${args.bg}`);
		console.error(`no combos match ${badParts.join(' ')}`);
		process.exit(2);
	}

	for (const e of elements) {
		// Mirrors entry.ts's own `fixtures[fixtureName] ?? fixtures['default']` fallback:
		// an explicit --fixture that this element doesn't have falls back to 'default'
		// (zero behavior change for any pre-existing invocation). With no --fixture flag,
		// shoot every fixture the element declares (still just ['default'] for 31 of 32
		// elements today).
		const fixtureNames = args.fixture
			? e.fixtures.includes(args.fixture)
				? [args.fixture]
				: ['default']
			: e.fixtures;
		for (const fixtureName of fixtureNames) {
			const outId = fixtureName === 'default' ? e.id : `${e.id}-${fixtureName}`;
			for (const c of combos) {
				const params = { element: e.id, fixture: fixtureName, theme: c.theme, bg: c.bg };
				if (c.print) params.print = '1';
				if (args.readonly) params.readonly = '1';
				const suffix = args.readonly ? '--readonly' : '';
				await snap(page, params, `${outId}--${comboName(c)}${suffix}`);
			}
		}
	}
	// SC-121 Batch 4 (batch-3 review L-5): narrow-width captures, declared by the page
	// (manifest.narrowShots — entry.ts NARROW_SHOTS). Same combo matrix as an element,
	// output under the entry's own id so it can never overwrite the full-width golden.
	// Filtered by --element like everything else: --element=perk shoots perk AND the
	// narrow entries derived from it, so a narrowed run still sees them.
	for (const n of narrowShots) {
		if (args.element && args.element !== n.element && args.element !== n.id) continue;
		for (const c of combos) {
			const params = { element: n.element, fixture: n.fixture, theme: c.theme, bg: c.bg, width: String(n.width) };
			if (c.print) params.print = '1';
			if (args.readonly) params.readonly = '1';
			const suffix = args.readonly ? '--readonly' : '';
			await snap(page, params, `${n.id}--${comboName(c)}${suffix}`);
		}
	}
	if (!args.element) {
		for (const c of combos.filter((c) => !c.print)) {
			await snap(page, { gallery: '1', theme: c.theme, bg: c.bg }, `gallery--${comboName(c)}`);
		}
	}
} catch (e) {
	// Anything that escapes snap()'s own try/catch (e.g. the manifest load itself
	// failing) still gets a curated failure entry instead of an uncaught crash.
	failures.push({ outName: 'sweep', errors: ['exception: ' + String(e)] });
	console.log(`FAIL sweep (exception)`);
} finally {
	await browser.close();
}

if (failures.length) {
	console.error(`\n${failures.length} shot(s) had errors:`);
	for (const f of failures) console.error(`  ${f.outName}: ${f.errors.join(' | ')}`);
	process.exit(1);
}
console.log(`\nall shots written to ${shotsDir}`);
