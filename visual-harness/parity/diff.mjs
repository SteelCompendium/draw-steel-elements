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
// BOTH colour schemes are compared. A scheme-scoped regression (e.g. a light-only flat
// surface) is exactly plan 19's failure mode; comparing dark alone would let half the
// theme go flat with a green gate.
const SCHEMES = ['dark', 'light'];
const firstIn = (inv, scheme, sel) => {
	// first captured occurrence of a selector within the given colour scheme
	for (const [k, v] of Object.entries(inv.entries)) if (k.endsWith(`--${scheme}`) && v[sel]) return v[sel];
	return null;
};

// Pair ids with a FILED deferral (see selector-map.json's expectedGapsNote): a real
// difference that cannot be closed in CSS. Reported, but downgraded to WARN so the gate
// stays green on known work. NEVER add an id here without the FOLLOWUPS entry.
const expectedGaps = new Set(map.expectedGaps || []);
const note = map.expectedGapsNote || '';
// Anti-theatre: the README requires every deferred id to cite a FOLLOWUPS number in
// expectedGapsNote. Enforce it here, or "expectedGaps" degrades into a silent mute button.
const undocumented = [...expectedGaps].filter((id) => !note.includes(id));
if (undocumented.length) {
	console.error(
		`expectedGaps id(s) not documented in expectedGapsNote: ${undocumented.join(', ')}\n` +
			'Every deferred id MUST name its workspace FOLLOWUPS.md number in that note.',
	);
	process.exit(1);
}
const sevFor = (pair) => (expectedGaps.has(pair.id) ? 'WARN' : 'GAP');

const rows = [];
for (const scheme of SCHEMES) {
	for (const pair of map.pairs) {
		const s = firstIn(site, scheme, pair.site);
		const p = firstIn(plug, scheme, pair.plugin);
		if (!s) {
			rows.push({ sev: 'WARN', scheme, pair, msg: `site selector ${pair.site} never captured — check urls.json` });
			continue;
		}
		if (!p) {
			rows.push({
				sev: 'WARN',
				scheme,
				pair,
				msg: `plugin selector ${pair.plugin} never rendered — check selector-map.json`,
			});
			continue;
		}
		// 1. Material: site has a gradient, plugin is flat.
		if (!isFlat(s['background-image']) && isFlat(p['background-image']))
			rows.push({
				sev: sevFor(pair),
				scheme,
				pair,
				msg: `flat surface: site background-image="${s['background-image']}", plugin="none"`,
			});
		// 2. Material: site has a bevel/shadow, plugin has none.
		if (!isFlat(s['box-shadow']) && isFlat(p['box-shadow']))
			rows.push({
				sev: sevFor(pair),
				scheme,
				pair,
				msg: `no bevel: site box-shadow="${s['box-shadow']}", plugin="none"`,
			});
		// 3. Material: site has a visible hairline, plugin has none. Both edges — most of the
		// site's head-strip hairlines are border-BOTTOM, so checking border-top alone left the
		// rule inert on every one of them.
		for (const edge of ['top', 'bottom'])
			if (s[`border-${edge}-style`] !== 'none' && p[`border-${edge}-style`] === 'none')
				rows.push({
					sev: sevFor(pair),
					scheme,
					pair,
					msg: `no hairline: site border-${edge} ${s[`border-${edge}-width`]} ${s[`border-${edge}-color`]}`,
				});
	}
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
	`Schemes compared: ${SCHEMES.join(', ')}.`,
	'',
	...rows.map(
		(r) => `- **${r.sev}** \`${r.pair.id}\` [${r.scheme}] (${r.pair.site} → ${r.pair.plugin}): ${r.msg}`,
	),
	'',
].join('\n');
fs.writeFileSync(path.join(dir, 'parity-report.md'), out);
console.log(out);
process.exit(gaps.length === 0 ? 0 : 1);
