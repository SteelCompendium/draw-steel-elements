// visual-harness/parity/diff.mjs — compare plugin-inventory against the site baseline.
// Exit 1 if any MATERIAL gap remains. Writes parity-report.md.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const site = JSON.parse(fs.readFileSync(path.join(dir, 'baseline', 'site-inventory.json'), 'utf8'));
const plug = JSON.parse(fs.readFileSync(path.join(dir, 'plugin-inventory.json'), 'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(dir, 'selector-map.json'), 'utf8'));

const isFlat = (v) => !v || v === 'none';
const firstSite = (sel) => {
	// first captured occurrence of a site selector, dark scheme
	for (const [k, v] of Object.entries(site.entries)) if (k.endsWith('--dark') && v[sel]) return v[sel];
	return null;
};
const firstPlug = (sel) => {
	for (const [k, v] of Object.entries(plug.entries)) if (k.endsWith('--dark') && v[sel]) return v[sel];
	return null;
};

// Pair ids with a FILED deferral (see selector-map.json's expectedGapsNote): a real
// difference that cannot be closed in CSS. Reported, but downgraded to WARN so the gate
// stays green on known work. NEVER add an id here without the FOLLOWUPS entry.
const expectedGaps = new Set(map.expectedGaps || []);
const sevFor = (pair) => (expectedGaps.has(pair.id) ? 'WARN' : 'GAP');

const rows = [];
for (const pair of map.pairs) {
	const s = firstSite(pair.site);
	const p = firstPlug(pair.plugin);
	if (!s) {
		rows.push({ sev: 'WARN', pair, msg: `site selector ${pair.site} never captured — check urls.json` });
		continue;
	}
	if (!p) {
		rows.push({
			sev: 'WARN',
			pair,
			msg: `plugin selector ${pair.plugin} never rendered — check selector-map.json`,
		});
		continue;
	}
	// 1. Material: site has a gradient, plugin is flat.
	if (!isFlat(s['background-image']) && isFlat(p['background-image']))
		rows.push({
			sev: sevFor(pair),
			pair,
			msg: `flat surface: site background-image="${s['background-image']}", plugin="none"`,
		});
	// 2. Material: site has a bevel/shadow, plugin has none.
	if (!isFlat(s['box-shadow']) && isFlat(p['box-shadow']))
		rows.push({ sev: sevFor(pair), pair, msg: `no bevel: site box-shadow="${s['box-shadow']}", plugin="none"` });
	// 3. Material: site has a visible hairline, plugin has none.
	if (s['border-top-style'] !== 'none' && p['border-top-style'] === 'none')
		rows.push({
			sev: sevFor(pair),
			pair,
			msg: `no hairline: site border-top ${s['border-top-width']} ${s['border-top-color']}`,
		});
}

const gaps = rows.filter((r) => r.sev === 'GAP');
const out = [
	'# Steel material parity report',
	'',
	`Site baseline captured: ${site.capturedAt}`,
	`Plugin sampled: ${plug.capturedAt}`,
	'',
	`**${gaps.length} material gap(s), ${rows.length - gaps.length} warning(s).**`,
	'',
	...rows.map((r) => `- **${r.sev}** \`${r.pair.id}\` (${r.pair.site} → ${r.pair.plugin}): ${r.msg}`),
	'',
].join('\n');
fs.writeFileSync(path.join(dir, 'parity-report.md'), out);
console.log(out);
process.exit(gaps.length === 0 ? 0 : 1);
