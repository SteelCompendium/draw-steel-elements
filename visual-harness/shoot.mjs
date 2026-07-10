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

	let elements = manifest.elements.map((e) => e.id);
	if (args.element) elements = elements.filter((id) => id === args.element);
	if (args.element && elements.length === 0) {
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

	for (const id of elements) {
		for (const c of combos) {
			const params = { element: id, fixture: args.fixture ?? 'default', theme: c.theme, bg: c.bg };
			if (c.print) params.print = '1';
			if (args.readonly) params.readonly = '1';
			const suffix = args.readonly ? '--readonly' : '';
			await snap(page, params, `${id}--${comboName(c)}${suffix}`);
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
