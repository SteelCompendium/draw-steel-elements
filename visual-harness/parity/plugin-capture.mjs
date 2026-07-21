// visual-harness/parity/plugin-capture.mjs — sample the plugin harness with the SAME property
// set as site-capture.mjs, so the two inventories are directly comparable.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const map = JSON.parse(fs.readFileSync(path.join(dir, 'selector-map.json'), 'utf8'));
const harness = `file://${path.join(dir, '..', 'index.html')}`;

// MUST stay byte-identical to site-capture.mjs's PROPS — if the two lists diverge the
// inventories are no longer comparable and the diff silently compares nothing.
const PROPS = [
	'background-image', 'background-color', 'box-shadow',
	'border-top-color', 'border-top-width', 'border-top-style', 'border-radius',
	'color', 'font-family', 'font-size', 'font-weight', 'font-variant-caps',
	'letter-spacing', 'text-transform',
];

// Elements whose render exercises the mapped surfaces.
const ELEMENTS = ['feature', 'statblock', 'featureblock', 'kit', 'condition'];
const pluginSelectors = [...new Set(map.pairs.map((p) => p.plugin))];

const browser = await chromium.launch();
const entries = {};
for (const bg of ['dark', 'light']) {
	for (const el of ELEMENTS) {
		const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
		await page.goto(`${harness}?element=${el}&fixture=default&theme=steel&bg=${bg}`);
		// The harness sets __dseHarnessDone to a { errors } object (not `true`) — same wait
		// condition shoot.mjs uses.
		await page.waitForFunction(() => window.__dseHarnessDone !== undefined, null, {
			timeout: 20000,
		});
		const done = await page.evaluate(() => window.__dseHarnessDone);
		if (done.errors.length) {
			throw new Error(`${el}--${bg} mounted with errors: ${done.errors.join(' | ')}`);
		}
		const styles = await page.evaluate(
			({ selectors, props }) => {
				const out = {};
				for (const sel of selectors) {
					const node = document.querySelector(sel);
					if (!node) continue;
					const cs = getComputedStyle(node);
					out[sel] = Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p).trim()]));
				}
				return out;
			},
			{ selectors: pluginSelectors, props: PROPS },
		);
		entries[`${el}--${bg}`] = styles;
		await page.close();
		console.log(`sampled ${el}--${bg} (${Object.keys(styles).length} selectors)`);
	}
}
await browser.close();
fs.writeFileSync(
	path.join(dir, 'plugin-inventory.json'),
	JSON.stringify({ capturedAt: new Date().toISOString(), entries }, null, 2) + '\n',
);
console.log('wrote plugin-inventory.json');
