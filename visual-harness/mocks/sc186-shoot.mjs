#!/usr/bin/env node
// visual-harness/mocks/sc186-shoot.mjs — captures the SC-186 design-option mocks
// (option a/b/c × dark/light) as PNGs. Run sc186-build.mjs first.
// Usage: node visual-harness/mocks/sc186-shoot.mjs [--out=<dir>]
// Default out dir: visual-harness/shots (gitignored; sc186-* names collide with
// nothing in the freeze baseline by construction).
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(path.dirname(here));
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outDir = outArg ? outArg.slice('--out='.length) : path.join(repoRoot, 'visual-harness/shots');
fs.mkdirSync(outDir, { recursive: true });

const pageUrl = 'file://' + path.join(here, 'sc186.html');

const SHOTS = [
	{ option: 'a', name: 'drawer' },
	{ option: 'b', name: 'workbench' },
	{ option: 'c', name: 'twomodal' },
];

const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: 1100, height: 900 },
	deviceScaleFactor: 2,
});

let failures = 0;
for (const { option, name } of SHOTS) {
	for (const bg of ['dark', 'light']) {
		const url = `${pageUrl}?option=${option}&bg=${bg}`;
		const out = path.join(outDir, `sc186-opt${option.toUpperCase()}-${name}-${bg}.png`);
		try {
			await page.goto(url, { waitUntil: 'networkidle' });
			await page.waitForSelector('body[data-sc186-ready]', { timeout: 10000 });
			await page.evaluate(() => document.fonts.ready);
			await page.screenshot({ path: out, fullPage: true });
			console.log(`wrote ${out}`);
		} catch (err) {
			failures++;
			console.error(`FAILED ${url}: ${err.message}`);
		}
	}
}

await browser.close();
process.exit(failures ? 1 : 0);
