// visual-harness/parity/site-capture.mjs — capture the LIVE v2 site as the parity reference.
// Emits baseline/site-inventory.json (computed styles) + baseline/site-shots/*.png.
// Run: npm run parity:site
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const urls = JSON.parse(fs.readFileSync(path.join(dir, 'urls.json'), 'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(dir, 'selector-map.json'), 'utf8'));
const outDir = path.join(dir, 'baseline');
const shotDir = path.join(outDir, 'site-shots');
fs.mkdirSync(shotDir, { recursive: true });

// The property set that defines "material". Extend here, never per-selector.
const PROPS = [
  'background-image', 'background-color', 'box-shadow',
  'border-top-color', 'border-top-width', 'border-top-style',
  'border-bottom-color', 'border-bottom-width', 'border-bottom-style', 'border-radius',
  'color', 'font-family', 'font-size', 'font-weight', 'font-variant-caps',
  'letter-spacing', 'text-transform',
];

const siteSelectors = [...new Set(map.pairs.map(p => p.site))];

const browser = await chromium.launch();
const entries = {};
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  for (const u of urls) {
    const res = await page.goto(u.url, { waitUntil: 'networkidle' });
    if (!res || !res.ok()) throw new Error(`${u.id}: HTTP ${res && res.status()} for ${u.url}`);
    // Force the colour scheme via the site's own toggle attribute.
    await page.evaluate(s => document.body.setAttribute('data-md-color-scheme', s === 'dark' ? 'slate' : 'default'), scheme);
    await page.waitForSelector(u.waitFor, { timeout: 15000 });
    await page.waitForTimeout(300); // let CSS transitions settle

    const styles = await page.evaluate(({ selectors, props }) => {
      const out = {};
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) continue;                       // absent on this page — fine
        const cs = getComputedStyle(el);
        out[sel] = Object.fromEntries(props.map(p => [p, cs.getPropertyValue(p).trim()]));
      }
      return out;
    }, { selectors: siteSelectors, props: PROPS });

    entries[`${u.id}--${scheme}`] = styles;
    await page.screenshot({ path: path.join(shotDir, `${u.id}--${scheme}.png`), fullPage: false });
    console.log(`captured ${u.id}--${scheme} (${Object.keys(styles).length} selectors)`);
  }
  await ctx.close();
}
await browser.close();

fs.writeFileSync(path.join(outDir, 'site-inventory.json'), JSON.stringify({
  capturedAt: new Date().toISOString(),
  note: 'Reference captured from the LIVE site. Regenerate deliberately; review the diff.',
  entries,
}, null, 2) + '\n');
console.log(`wrote baseline/site-inventory.json (${Object.keys(entries).length} page/scheme entries)`);
