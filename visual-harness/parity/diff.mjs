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
// ONE tolerance for every measured length (p21 controller decision C5). It replaces the
// original per-property table (font-size 1.5 / line-height 2 / padding 3), which was strictly
// LOOSER and structurally hid 14 real misses the plan's own Task 2 is required to fix
// (section-head 10 vs 7.2 padding, tier-row 11 vs 8.8, chip 9.2 vs 6.8 and 18 vs 16.32
// line-height). 1.5px is tighter than every value it replaces, so this is a widening.
// It is still wide enough for the residual each Task 2 target will leave: the site's 20px rem
// base against the plugin's 16px one (constraint C4) means a px target is matched to within
// ~1px, and the tightest target — card padding ~24px against the site's 23/25/25/25 — lands
// at 1px. Never raise it to make a row go away; that is the "silence a gap" move the
// constraints forbid.
const LEN_TOL = 1.5;
// Lengths compared with LEN_TOL. margin-top/margin-bottom are in the list because they were
// captured-but-unasserted, which left gap-inventory A4 (card-to-card margin: site .sc-ability
// 24px vs plugin 8px) invisible to the gate even though Task 2 must fix it. Capturing without
// asserting is the exact blind spot this harness exists to remove.
const LEN_PROPS = [
	'font-size',
	'line-height',
	'padding-top',
	'padding-right',
	'padding-bottom',
	'padding-left',
	'margin-top',
	'margin-bottom',
];
// letter-spacing: computed `normal` IS zero tracking, so normalise it rather than skipping the
// comparison. 0.25px sits in the empty band of today's data — see the README for the derivation.
const LS_TOL = 0.25;
const lsPx = (v) => (v === 'normal' ? 0 : px(v));
// Ink (`color`). Computed colour is always rgb()/rgba() in Chromium; anything else is a parse
// failure and gets a WARN rather than a silent skip. Tolerances derived from the captured
// spread — see the README: every pair that already agrees agrees EXACTLY, and every real miss
// is >=5 on some RGB channel or >=0.07 on alpha.
const INK_RGB_TOL = 2;
const INK_ALPHA_TOL = 0.03;
const RGBA_RE = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)$/i;
const ink = (v) => {
	const m = RGBA_RE.exec((v || '').trim());
	if (!m) return null;
	const a = m[4] === undefined ? 1 : m[5] === '%' ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
	return { r: +m[1], g: +m[2], b: +m[3], a };
};
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
		// 4. TYPE/SPACE: font-size, line-height, padding-*, margin-*. GAP when both sides parse
		// to px and the plugin misses the site by more than LEN_TOL (sub-pixel rounding across
		// the site's 20px / plugin's 16px rem bases is not a gap, see constraint C4).
		// A value that does NOT parse to px (`normal` line-height, `auto` padding) cannot be
		// compared — it emits a WARN, never nothing: a silent skip would let a regression to
		// `line-height: normal` vanish from the report instead of failing it.
		for (const prop of LEN_PROPS) {
			const sv = px(s[prop]);
			const pv = px(p[prop]);
			if (Number.isNaN(sv) || Number.isNaN(pv)) {
				rows.push({
					sev: 'WARN',
					scheme,
					pair,
					msg: `${prop} not comparable: site "${s[prop]}", plugin "${p[prop]}" — a non-px value cannot be measured; fix the CSS so both sides compute to px`,
				});
				continue;
			}
			if (!near(sv, pv, LEN_TOL))
				rows.push({
					sev: sevFor(pair, prop),
					scheme,
					pair,
					msg: `${prop} miss: site ${s[prop]}, plugin ${p[prop]} (tol ${LEN_TOL}px)`,
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
		// 6. TYPE: letter-spacing (gap-inventory A7 — plugin body tracks .03em, the site is
		// `normal`). Computed `normal` is zero tracking, so it is normalised to 0 and compared in
		// px like any other length; a value that is neither `normal` nor px gets a WARN.
		{
			const sv = lsPx(s['letter-spacing']);
			const pv = lsPx(p['letter-spacing']);
			if (Number.isNaN(sv) || Number.isNaN(pv))
				rows.push({
					sev: 'WARN',
					scheme,
					pair,
					msg: `letter-spacing not comparable: site "${s['letter-spacing']}", plugin "${p['letter-spacing']}"`,
				});
			else if (!near(sv, pv, LS_TOL))
				rows.push({
					sev: sevFor(pair, 'letter-spacing'),
					scheme,
					pair,
					msg: `letter-spacing miss: site ${s['letter-spacing']}, plugin ${p['letter-spacing']} (tol ${LS_TOL}px)`,
				});
		}
		// 7. COLOUR: ink (gap-inventory A6 — body ink is flat grey against the site's cooler,
		// alpha-carrying ink). Parses both sides' rgb()/rgba() and compares the RGB channels and
		// the alpha channel independently, so a right-hue/wrong-opacity miss (pr-head: same RGB,
		// alpha .95 vs the site's .88) is caught as well as a wrong-hue one. This is the ONLY
		// colour-valued rule in the gate — checks 1-3 still only test flat-vs-non-flat.
		{
			const si = ink(s['color']);
			const pi = ink(p['color']);
			if (!si || !pi)
				rows.push({
					sev: 'WARN',
					scheme,
					pair,
					msg: `ink not comparable: site color="${s['color']}", plugin color="${p['color']}" — expected rgb()/rgba()`,
				});
			else {
				const dRgb = Math.max(Math.abs(si.r - pi.r), Math.abs(si.g - pi.g), Math.abs(si.b - pi.b));
				// Rounded to 3dp before comparing: computed alpha carries at most 2-3 decimals, and
				// raw binary subtraction (0.88 - 0.85 = 0.030000000000000027) would otherwise trip
				// the boundary on a pair that is exactly at tolerance.
				const dA = Math.round(Math.abs(si.a - pi.a) * 1000) / 1000;
				if (dRgb > INK_RGB_TOL || dA > INK_ALPHA_TOL)
					rows.push({
						sev: sevFor(pair, 'ink'),
						scheme,
						pair,
						msg:
							`ink miss: site color=${s['color']}, plugin color=${p['color']} ` +
							`(max channel ${dRgb.toFixed(0)} > ${INK_RGB_TOL}, alpha ${dA.toFixed(2)} > ${INK_ALPHA_TOL} — either fires)`,
					});
			}
		}
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
