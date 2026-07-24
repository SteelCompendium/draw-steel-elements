// visual-harness/parity/diff.mjs — compare plugin-inventory against the site baseline.
// Exit 1 if any material OR type/space gap remains. Writes parity-report.md.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const site = JSON.parse(fs.readFileSync(path.join(dir, 'baseline', 'site-inventory.json'), 'utf8'));
const plug = JSON.parse(fs.readFileSync(path.join(dir, 'plugin-inventory.json'), 'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(dir, 'selector-map.json'), 'utf8'));

const isFlat = (v) => !v || v === 'none';

// TYPE/SPACE helpers — px v = "27.2px" -> 27.2 ; near() applies a per-rule pixel tolerance so
// sub-pixel rounding differences between the site's 20px rem base and the plugin's 16px one
// (see p21 constraint C4 — compare computed px, never the rem literal) don't cause noise.
const px = (v) => (v && v.endsWith('px') ? parseFloat(v) : NaN);
const near = (a, b, tol) => !(Math.abs(a - b) > tol);
// A family is "serif-ish" if its first family in the stack is NOT one of the known sans faces.
const SANS = /(-apple-system|system-ui|BlinkMac|Segoe|Roboto\b|Helvetica|Arial|sans-serif|Inter)/i;
const famHead = (v) => (v || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
// Per-property tolerance in px. font-size (chips etc.) is tight because a 1px miss is visible
// at small sizes; line-height and padding get more slack for sub-pixel rounding.
const TOL = { 'font-size': 1.5, 'line-height': 2, 'padding-top': 3, 'padding-right': 3, 'padding-bottom': 3, 'padding-left': 3 };
const TYPE_SPACE_PROPS = ['font-size', 'line-height', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
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
// sevFor accepts an optional `rule` name so a deferral can target one rule on a pair
// (`"<pairId>:<rule>"`, C3) without muting every other rule on that pair. A bare pair id
// still downgrades every rule on the pair, for back-compat with existing deferrals.
const sevFor = (pair, rule) =>
	expectedGaps.has(pair.id) || (rule && expectedGaps.has(`${pair.id}:${rule}`)) ? 'WARN' : 'GAP';

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
				sev: sevFor(pair, 'bg'),
				scheme,
				pair,
				msg: `flat surface: site background-image="${s['background-image']}", plugin="none"`,
			});
		// 2. Material: site has a bevel/shadow, plugin has none.
		if (!isFlat(s['box-shadow']) && isFlat(p['box-shadow']))
			rows.push({
				sev: sevFor(pair, 'shadow'),
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
					sev: sevFor(pair, `hairline-${edge}`),
					scheme,
					pair,
					msg: `no hairline: site border-${edge} ${s[`border-${edge}-width`]} ${s[`border-${edge}-color`]}`,
				});
		// 4. TYPE/SPACE: font-size, line-height, padding-*. GAP when both sides parse to px and
		// the plugin misses the site by more than the property's tolerance (see TOL — sub-pixel
		// rounding across the site's 20px / plugin's 16px rem bases is not a gap, see constraint C4).
		for (const prop of TYPE_SPACE_PROPS) {
			const sv = px(s[prop]);
			const pv = px(p[prop]);
			if (!Number.isNaN(sv) && !Number.isNaN(pv) && !near(sv, pv, TOL[prop]))
				rows.push({
					sev: sevFor(pair, prop),
					scheme,
					pair,
					msg: `${prop} miss: site ${s[prop]}, plugin ${p[prop]} (tol ${TOL[prop]}px)`,
				});
		}
		// 5. TYPE: body-font. The site's body/label face is a licensed slab (BerlingskeSlab-DBd)
		// we cannot bundle — assert the plugin uses *a* serif, not the exact face: GAP when the
		// site's family head is not a known sans (i.e. serif/slab) and the plugin's family head IS
		// a known sans (still falling back to the system sans stack).
		if (!SANS.test(famHead(s['font-family'])) && SANS.test(famHead(p['font-family'])))
			rows.push({
				sev: sevFor(pair, 'body-font'),
				scheme,
				pair,
				msg: `body-font: site family="${s['font-family']}" (serif/slab), plugin family="${p['font-family']}" (sans)`,
			});
	}
}

const gaps = rows.filter((r) => r.sev === 'GAP');
const out = [
	'# Steel parity report',
	'',
	`Site baseline captured: ${site.capturedAt}`,
	`Plugin sampled: ${plug.capturedAt}`,
	'',
	`**${gaps.length} gap(s), ${rows.length - gaps.length} warning(s).**`,
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
