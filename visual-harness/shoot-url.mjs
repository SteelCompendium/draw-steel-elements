#!/usr/bin/env node
// visual-harness/shoot-url.mjs — screenshot any URL (e.g. the live v2 site for design
// reference / SC-67). Usage: npm run shot-url -- <url> <out.png>
import { chromium } from 'playwright';

const [url, out] = process.argv.slice(2);
if (!url || !out) {
	console.error('usage: npm run shot-url -- <url> <out.png>');
	process.exit(2);
}
const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: 1440, height: 1000 },
	deviceScaleFactor: 2,
});
await page.goto(url, { waitUntil: 'networkidle' });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`wrote ${out}`);
