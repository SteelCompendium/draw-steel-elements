// visual-harness/parity/compare.cjs — the PURE core of the Steel parity gate.
//
// Why CommonJS in a directory of .mjs scripts: this is the only file here that jest has
// to load (test/unit/parity/compare.test.ts). The jest projects transpile TS to
// `module: commonjs`, so a `.mjs` ESM module cannot be `require`d from a test, and the
// declared-deferrals contract is exactly the kind of gate logic that must itself be
// tested (an allowlist nobody can prove fails is a mute button, not a gate). Node's ESM
// loader imports a .cjs default export fine, so `diff.mjs` stays ESM and thin.
//
// diff.mjs = I/O + exit code. This file = validation + comparison, no fs, no process.
'use strict';

// ── the rule vocabulary ─────────────────────────────────────────────────────────────
// Every string a comparison can be attributed to. `owns` allowlists and declared
// deferrals are both checked against this list, so a typo is a hard error rather than a
// silently inert entry.
const ALL_RULES = [
	'bg',
	'bg-polarity',
	'shadow',
	'hairline-top',
	'hairline-bottom',
	'font-size',
	'line-height',
	'padding-top',
	'padding-right',
	'padding-bottom',
	'padding-left',
	'margin-top',
	'margin-bottom',
	'body-font',
	'letter-spacing',
	'ink',
];
// The "one side never rendered / was never captured" rows. Not comparisons, so they can
// never be *owned* (there is nothing to split), but they can be declared — a pair that is
// legitimately absent from a page set. DIRECTIONAL on purpose: `capture-site` is "the site
// page does not carry this node" (a urls.json/coverage fact) and `capture-plugin` is "the
// plugin never rendered it" — the exact "a pair went blind" failure SC-110 made fatal. One
// undirected `capture` rule let a declaration filed for the first silence the second.
const CAPTURE_RULES = ['capture-site', 'capture-plugin'];
const KNOWN_RULES = [...ALL_RULES, ...CAPTURE_RULES];

// ── property classes ────────────────────────────────────────────────────────────────
// Every rule belongs to exactly one class, and the class decides whether a divergence in
// it may be DECLARED. MATERIAL (rules 1-3: gradient, bevel, hairline) is NEVER declarable:
// plan 19's failure mode was a wholly flat Steel theme that passed human review, flatness
// is always closable in styles-source.css, and "no CSS-fixable flatness is excusable by a
// JSON entry" is the whole reason this gate exists. GEOMETRY / TYPOGRAPHY / INK stay
// declarable, because that is where genuine pixel decisions (Scott's, not the gate
// holder's) actually live. Deliberately conservative — relaxing it is a one-line change to
// NON_DECLARABLE_CLASSES.
const RULE_CLASS = {
	bg: 'material',
	'bg-polarity': 'material',
	shadow: 'material',
	'hairline-top': 'material',
	'hairline-bottom': 'material',
	'font-size': 'typography',
	'line-height': 'typography',
	'body-font': 'typography',
	'letter-spacing': 'typography',
	'padding-top': 'geometry',
	'padding-right': 'geometry',
	'padding-bottom': 'geometry',
	'padding-left': 'geometry',
	'margin-top': 'geometry',
	'margin-bottom': 'geometry',
	ink: 'ink',
	'capture-site': 'capture',
	'capture-plugin': 'capture',
};
const NON_DECLARABLE_CLASSES = ['material'];
const NON_DECLARABLE_RULES = KNOWN_RULES.filter((r) => NON_DECLARABLE_CLASSES.includes(RULE_CLASS[r]));
const DECLARABLE_RULES = KNOWN_RULES.filter((r) => !NON_DECLARABLE_RULES.includes(r));

// BOTH colour schemes are compared. A scheme-scoped regression (e.g. a light-only flat
// surface) is plan 19's exact failure mode; comparing dark alone would let half the
// theme go flat with a green gate.
const SCHEMES = ['dark', 'light'];

// ── tolerances (derivations live in README.md; never raise one to silence a row) ─────
const LEN_TOL = 1.5;
const LS_TOL = 0.25;
const INK_RGB_TOL = 2;
const INK_ALPHA_TOL = 0.03;

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

// Every declared deferral (and every `excludes` entry) must name the workspace FOLLOWUPS
// item or Linear ticket that carries the decision. Enforced mechanically — without it
// `declaredDeferrals` degrades into an anonymous mute button. The number must be a real
// one: `[1-9]\d*` rejects `SC-0` / `FOLLOWUPS #0`, which are shape-valid but name nothing.
// (Cross-repo existence cannot be checked from inside this repo; this is the floor.)
const CITATION_RE = /(FOLLOWUPS #[1-9]\d*|SC-[1-9]\d*)/;

const isFlat = (v) => !v || v === 'none';
const px = (v) => (v && v.endsWith('px') ? parseFloat(v) : NaN);
const near = (a, b, tol) => !(Math.abs(a - b) > tol);
const SANS = /(-apple-system|system-ui|BlinkMac|Segoe|Roboto\b|Helvetica|Arial|sans-serif|Inter)/i;
const famHead = (v) => (v || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
const lsPx = (v) => (v === 'normal' ? 0 : px(v));
const RGBA_RE = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)$/i;
const ink = (v) => {
	const m = RGBA_RE.exec((v || '').trim());
	if (!m) return null;
	const a = m[4] === undefined ? 1 : m[5] === '%' ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
	return { r: +m[1], g: +m[2], b: +m[3], a };
};

// ── SC-126 step 1: wash POLARITY, not a full background-color comparison ───────────────
// `bgFamily` buckets a computed background-color into a coarse polarity class for rule 1b
// ONLY (below). It is deliberately narrow — see README.md "Known limitation" for the full
// story and why a full colour comparison is separately-scoped, larger work.
//
// Thresholds are derived from the REAL spread in both committed inventories, not
// intuition: every mapped pair's background-color today, in both schemes, on both site
// and plugin, is either fully transparent or a near-pure achromatic wash —
// rgba(0,0,0,{.16,.18,.02,.024}) — with nothing else in the data. The historical SC-117
// defect (pre-fix `--dse-surface-sunken`, git 169d62f^) sat at rgba(220,226,230,.06) dark
// / opaque #eaeeef light — average channel ~225/~237 — nowhere near either real bucket, so
// a wide gap between BLACK_MAX and WHITE_MIN costs nothing today and still catches that
// defect with room to spare.
//   - alpha === 0            -> unclassified (`null`). A fully transparent fill is
//     invisible regardless of hue — flagging rgba(0,0,0,0) against rgba(255,255,255,0)
//     would be the textbook false positive this rule must never produce.
//   - average RGB channel <= BLACK_MAX -> 'black'
//   - average RGB channel >= WHITE_MIN -> 'white'
//   - anything else (a real mid-grey, or a coloured/tinted wash) -> unclassified (`null`).
//     A future coloured or half-tone surface fill must not be forced into a black/white
//     bucket it doesn't belong in — leaving it unclassified means this rule stays silent
//     on it rather than guessing, which is what keeps it near-noise-free.
const BG_BLACK_MAX = 40;
const BG_WHITE_MIN = 200;
const bgFamily = (v) => {
	const c = ink(v);
	if (!c || c.a <= 0) return null;
	const avg = (c.r + c.g + c.b) / 3;
	if (avg <= BG_BLACK_MAX) return 'black';
	if (avg >= BG_WHITE_MIN) return 'white';
	return null;
};

const firstIn = (inv, scheme, sel) => {
	for (const [k, v] of Object.entries(inv.entries)) if (k.endsWith(`--${scheme}`) && v[sel]) return v[sel];
	return null;
};

// A pair with no `owns` compares every rule. `owns` never *adds* or *removes* coverage —
// it moves a rule from one pair to another when the plugin collapses two site nodes into
// one node. validateMap enforces that on EVERY plugin selector, shared or not: the owned
// sets (plus any cited `excludes`) must cover ALL_RULES exactly once. Until the SC-110 fix
// round the invariant only existed for *shared* selectors, so a pair naming a plugin node
// no one else named could narrow `owns` and silently drop the rest — no error, no dead
// declaration, exit 0. That was a second mute button, and it was live: `statblock-wrap`
// was hiding two real line-height rows through it.
const owns = (pair, rule) => !pair.owns || pair.owns.includes(rule);

/**
 * Static checks on selector-map.json. Every one of these is fatal: the gate refuses to
 * report at all rather than report against a contract that cannot mean what it says.
 * @returns {string[]} error lines (empty = valid)
 */
function validateMap(map) {
	const errors = [];
	const pairs = map.pairs || [];
	const ids = new Set();
	for (const p of pairs) {
		if (ids.has(p.id)) errors.push(`duplicate pair id "${p.id}"`);
		ids.add(p.id);
		if (!p.site || !p.plugin) errors.push(`pair "${p.id}" is missing a site or plugin selector`);
		if (p.owns !== undefined) {
			if (!Array.isArray(p.owns)) errors.push(`pair "${p.id}": "owns" must be an array of rule names`);
			else {
				for (const r of p.owns) if (!ALL_RULES.includes(r)) errors.push(`pair "${p.id}": unknown rule "${r}" in "owns"`);
				if (new Set(p.owns).size !== p.owns.length) errors.push(`pair "${p.id}": duplicate rule names in "owns"`);
			}
		}
		// `excludes` is the ONLY way to drop a rule from the contract, and it is priced
		// exactly like a declared deferral: one entry per rule, each citing the FOLLOWUPS
		// item or ticket that owns the decision. Shape: [{ rule, why }].
		if (p.excludes !== undefined) {
			if (!Array.isArray(p.excludes)) {
				errors.push(`pair "${p.id}": "excludes" must be an array of { rule, why }`);
			} else {
				if (!Array.isArray(p.owns))
					errors.push(
						`pair "${p.id}": "excludes" without "owns" is inert — a pair with no "owns" already compares every rule`,
					);
				const seenX = new Set();
				for (const x of p.excludes) {
					const rule = x && x.rule;
					const lbl = `pair "${p.id}": excludes "${rule}"`;
					if (!ALL_RULES.includes(rule)) {
						errors.push(`${lbl}: unknown rule`);
						continue;
					}
					if (seenX.has(rule)) errors.push(`${lbl}: duplicate exclusion`);
					seenX.add(rule);
					if (Array.isArray(p.owns) && p.owns.includes(rule))
						errors.push(`${lbl}: the pair also OWNS this rule — a rule is owned or excluded, never both`);
					if (!x.why || !CITATION_RE.test(x.why))
						errors.push(
							`${lbl}: "why" must cite a workspace FOLLOWUPS number or a Linear ticket ` +
								'(e.g. "FOLLOWUPS #41" / "SC-110") — dropping a rule out of the contract is at least ' +
								'as consequential as declaring a divergence, so it is priced the same',
						);
				}
			}
		}
	}

	// RULE COVERAGE — enforced on EVERY plugin selector, shared or not. Each rule must be
	// owned by exactly one pair, or explicitly (and citably) excluded. This is what keeps
	// `owns` from becoming a second mute button: you may move a rule to the pair that
	// measures it honestly, you may not have two pairs both claim it, and you may not drop
	// it in silence. (Before the SC-110 fix round this ran only when `group.length >= 2`,
	// which left every unshared pair free to narrow `owns` and vanish the remainder.)
	const byPlugin = new Map();
	for (const p of pairs) {
		if (!byPlugin.has(p.plugin)) byPlugin.set(p.plugin, []);
		byPlugin.get(p.plugin).push(p);
	}
	for (const [sel, group] of byPlugin) {
		if (group.length > 1) {
			const missingOwns = group.filter((p) => !Array.isArray(p.owns)).map((p) => p.id);
			if (missingOwns.length) {
				errors.push(
					`plugin selector ${sel} is shared by pairs [${group.map((p) => p.id).join(', ')}] — ` +
						`every pair sharing a node MUST declare "owns" (missing on: ${missingOwns.join(', ')})`,
				);
				continue;
			}
		}
		const seen = new Map();
		for (const p of group)
			for (const r of Array.isArray(p.owns) ? p.owns : ALL_RULES) {
				if (!ALL_RULES.includes(r)) continue; // already reported above
				if (seen.has(r)) errors.push(`plugin selector ${sel}: rule "${r}" is owned by both "${seen.get(r)}" and "${p.id}"`);
				else seen.set(r, p.id);
			}
		const excluded = new Map();
		for (const p of group)
			for (const x of Array.isArray(p.excludes) ? p.excludes : []) {
				const rule = x && x.rule;
				if (!ALL_RULES.includes(rule)) continue; // already reported above
				if (seen.has(rule) && seen.get(rule) !== p.id)
					errors.push(
						`plugin selector ${sel}: rule "${rule}" is excluded by "${p.id}" but owned by "${seen.get(rule)}" — ` +
							'a rule the group already measures cannot also be dropped from it',
					);
				excluded.set(rule, p.id);
			}
		const unowned = ALL_RULES.filter((r) => !seen.has(r) && !excluded.has(r));
		if (unowned.length)
			errors.push(
				`plugin selector ${sel}: rule(s) [${unowned.join(', ')}] are owned by NO pair ` +
					`(pairs naming it: [${group.map((p) => p.id).join(', ')}]) — every rule must be owned by exactly ` +
					'one pair or explicitly excluded. "owns" MOVES a rule, it never drops one: add the sibling pair ' +
					'that measures it honestly, or drop "owns" and declare the rows that surfaces, or add an ' +
					'"excludes" entry citing a FOLLOWUPS number / Linear ticket. Silence is not an option.',
			);
	}

	// Declared deferrals.
	const seenDecl = new Set();
	for (const d of map.declaredDeferrals || []) {
		const label = `declaredDeferral ${d.pair}:${d.rule}${d.scheme ? `[${d.scheme}]` : ''}`;
		const pair = pairs.find((p) => p.id === d.pair);
		if (!pair) errors.push(`${label}: no pair with id "${d.pair}"`);
		if (!KNOWN_RULES.includes(d.rule))
			errors.push(
				`${label}: unknown rule "${d.rule}"` +
					(d.rule === 'capture'
						? ' — "capture" is now DIRECTIONAL: use "capture-site" (the site page legitimately does not ' +
							'carry this node) or "capture-plugin" (the plugin never rendered it). One undirected rule ' +
							'let a declaration filed for the first silence the second.'
						: ''),
			);
		else if (NON_DECLARABLE_RULES.includes(d.rule))
			errors.push(
				`${label}: rule "${d.rule}" is class "${RULE_CLASS[d.rule]}" and can NEVER be declared ` +
					`(non-declarable: ${NON_DECLARABLE_RULES.join(', ')}). A flat surface, a missing bevel or a missing ` +
					'hairline is always closable in styles-source.css, and a wholly flat Steel theme that passed human ' +
					'review is the exact failure this gate was built to catch (plan 19). Fix the CSS. Geometry ' +
					'(padding/margin), typography (font-size/line-height/body-font/letter-spacing) and ink stay ' +
					'declarable — that is where real pixel decisions live.',
			);
		if (d.scheme && !SCHEMES.includes(d.scheme)) errors.push(`${label}: unknown scheme "${d.scheme}"`);
		if (!d.why || !CITATION_RE.test(d.why))
			errors.push(`${label}: "why" must cite a workspace FOLLOWUPS number or a Linear ticket (e.g. "FOLLOWUPS #41" / "SC-110")`);
		if (pair && !CAPTURE_RULES.includes(d.rule) && !owns(pair, d.rule))
			errors.push(`${label}: pair "${d.pair}" does not own rule "${d.rule}", so this declaration can never match`);
		// M-3: the separator is written as an ESCAPE, never as a literal control byte. Two
		// literal NULs here once made git class this 341-line file as BINARY, so the core that
		// decides whether the whole theme passes landed as an undiffable blob.
		const key = `${d.pair}\u0000${d.rule}\u0000${d.scheme || '*'}`;
		if (seenDecl.has(key)) errors.push(`${label}: duplicate declaration`);
		seenDecl.add(key);
	}
	return errors;
}

/**
 * The committed baseline must actually contain every site selector the contract names.
 * A selector added to the map after the last `npm run parity:site` would otherwise show
 * up as an ordinary "never captured" row; this makes it a distinct, loud failure with
 * the remedy attached, because the remedy is a DELIBERATE HUMAN ACTION and never a CI step.
 * @returns {string[]} error lines (empty = baseline covers the contract)
 */
function checkBaselineCoverage(site, map) {
	const captured = new Set();
	for (const entry of Object.values(site.entries || {})) for (const sel of Object.keys(entry)) captured.add(sel);
	const missing = [...new Set((map.pairs || []).map((p) => p.site))].filter((s) => !captured.has(s));
	if (!missing.length) return [];
	return [
		'STALE BASELINE: the committed site baseline does not contain these selector(s) named by selector-map.json:',
		...missing.map((s) => `  - ${s}`),
		`Baseline captured at: ${site.capturedAt}`,
		'',
		'The baseline is the reference of record and is NEVER refreshed automatically.',
		'Fix it by hand, off CI:  npm run parity:site   (hits the LIVE site — a deliberate human action)',
		'then review the baseline/site-inventory.json diff before committing: a diff must be',
		'explained by a real site change, otherwise a page failed to load and the capture is garbage.',
	];
}

/**
 * Compare the plugin inventory against the site baseline through the selector map.
 * @returns {{ rows: object[], counts: {gap:number,warn:number,declared:number}, deadDeclarations: object[] }}
 */
function compare({ site, plug, map }) {
	const rows = [];
	const add = (sev, scheme, pair, rule, msg) => rows.push({ sev, scheme, pair, rule, msg });

	for (const scheme of SCHEMES) {
		for (const pair of map.pairs) {
			const s = firstIn(site, scheme, pair.site);
			const p = firstIn(plug, scheme, pair.plugin);
			if (!s) {
				add('WARN', scheme, pair, 'capture-site', `site selector ${pair.site} never captured — check urls.json`);
				continue;
			}
			if (!p) {
				add('WARN', scheme, pair, 'capture-plugin', `plugin selector ${pair.plugin} never rendered — check selector-map.json`);
				continue;
			}
			// 1. Material: site has a gradient, plugin is flat.
			if (owns(pair, 'bg') && !isFlat(s['background-image']) && isFlat(p['background-image']))
				add('GAP', scheme, pair, 'bg', `flat surface: site background-image="${s['background-image']}", plugin="none"`);
			// 1b. Material: WRONG WASH POLARITY (SC-126 step 1). Site sits on a
			// translucent-BLACK fill, plugin on translucent-WHITE (or opaque), or vice
			// versa. This is the SC-117 defect class: 13 declaration sites washed the
			// wrong direction in both schemes and rule 1 above never caught any of them,
			// because it only ever looks at background-image — neither side's was
			// `none`. Deliberately narrow (see bgFamily above and README.md "Known
			// limitation"): fires only when BOTH sides are a classifiable, visible,
			// near-achromatic wash and they land on OPPOSITE ends of the range. A full
			// background-color comparison is separately-scoped, larger work.
			if (owns(pair, 'bg-polarity')) {
				const sf = bgFamily(s['background-color']);
				const pf = bgFamily(p['background-color']);
				if (sf && pf && sf !== pf)
					add(
						'GAP',
						scheme,
						pair,
						'bg-polarity',
						`wrong wash polarity: site background-color="${s['background-color']}" (${sf}), plugin="${p['background-color']}" (${pf})`,
					);
			}
			// 2. Material: site has a bevel/shadow, plugin has none.
			if (owns(pair, 'shadow') && !isFlat(s['box-shadow']) && isFlat(p['box-shadow']))
				add('GAP', scheme, pair, 'shadow', `no bevel: site box-shadow="${s['box-shadow']}", plugin="none"`);
			// 3. Material: site has a visible hairline, plugin has none. Both edges.
			for (const edge of ['top', 'bottom'])
				if (
					owns(pair, `hairline-${edge}`) &&
					s[`border-${edge}-style`] !== 'none' &&
					p[`border-${edge}-style`] === 'none'
				)
					add(
						'GAP',
						scheme,
						pair,
						`hairline-${edge}`,
						`no hairline: site border-${edge} ${s[`border-${edge}-width`]} ${s[`border-${edge}-color`]}`,
					);
			// 4. TYPE/SPACE lengths.
			for (const prop of LEN_PROPS) {
				if (!owns(pair, prop)) continue;
				const sv = px(s[prop]);
				const pv = px(p[prop]);
				if (Number.isNaN(sv) || Number.isNaN(pv)) {
					add(
						'WARN',
						scheme,
						pair,
						prop,
						`${prop} not comparable: site "${s[prop]}", plugin "${p[prop]}" — a non-px value cannot be measured; fix the CSS so both sides compute to px`,
					);
					continue;
				}
				if (!near(sv, pv, LEN_TOL))
					add('GAP', scheme, pair, prop, `${prop} miss: site ${s[prop]}, plugin ${p[prop]} (tol ${LEN_TOL}px)`);
			}
			// 5. TYPE: body-font (a serif, not the exact licensed face — see README).
			if (owns(pair, 'body-font') && !SANS.test(famHead(s['font-family'])) && SANS.test(famHead(p['font-family'])))
				add(
					'GAP',
					scheme,
					pair,
					'body-font',
					`body-font: site family="${s['font-family']}" (serif/slab), plugin family="${p['font-family']}" (sans)`,
				);
			// 6. TYPE: letter-spacing (computed `normal` IS zero tracking).
			if (owns(pair, 'letter-spacing')) {
				const sv = lsPx(s['letter-spacing']);
				const pv = lsPx(p['letter-spacing']);
				if (Number.isNaN(sv) || Number.isNaN(pv))
					add(
						'WARN',
						scheme,
						pair,
						'letter-spacing',
						`letter-spacing not comparable: site "${s['letter-spacing']}", plugin "${p['letter-spacing']}"`,
					);
				else if (!near(sv, pv, LS_TOL))
					add(
						'GAP',
						scheme,
						pair,
						'letter-spacing',
						`letter-spacing miss: site ${s['letter-spacing']}, plugin ${p['letter-spacing']} (tol ${LS_TOL}px)`,
					);
			}
			// 7. COLOUR: ink.
			if (owns(pair, 'ink')) {
				const si = ink(s['color']);
				const pi = ink(p['color']);
				if (!si || !pi)
					add(
						'WARN',
						scheme,
						pair,
						'ink',
						`ink not comparable: site color="${s['color']}", plugin color="${p['color']}" — expected rgb()/rgba()`,
					);
				else {
					const dRgb = Math.max(Math.abs(si.r - pi.r), Math.abs(si.g - pi.g), Math.abs(si.b - pi.b));
					const dA = Math.round(Math.abs(si.a - pi.a) * 1000) / 1000;
					if (dRgb > INK_RGB_TOL || dA > INK_ALPHA_TOL)
						add(
							'GAP',
							scheme,
							pair,
							'ink',
							`ink miss: site color=${s['color']}, plugin color=${p['color']} ` +
								`(max channel ${dRgb.toFixed(0)} > ${INK_RGB_TOL}, alpha ${dA.toFixed(2)} > ${INK_ALPHA_TOL} — either fires)`,
						);
				}
			}
		}
	}

	// ── declared deferrals: the ONLY thing that keeps a finding from failing the gate ──
	// A declaration converts a matching row (GAP *or* WARN) to DECLARED. Everything else
	// is fatal, so the contract is: exit 0 iff 0 GAPs and 0 undeclared WARNs. Note the
	// class gate in validateMap: a MATERIAL row can never reach this loop with a matching
	// declaration, because the contract was rejected before compare() was ever called.
	const decls = (map.declaredDeferrals || []).map((d) => ({ ...d, hits: 0 }));
	for (const row of rows) {
		const d = decls.find(
			(x) => x.pair === row.pair.id && x.rule === row.rule && (!x.scheme || x.scheme === row.scheme),
		);
		if (!d) continue;
		d.hits++;
		row.sev = 'DECLARED';
		row.why = d.why;
	}
	// Anti-rot: a declaration that no longer matches anything is a stale excuse for a
	// finding that has since been fixed (or renamed). Fail so it gets deleted.
	const deadDeclarations = decls.filter((d) => d.hits === 0);

	const counts = {
		gap: rows.filter((r) => r.sev === 'GAP').length,
		warn: rows.filter((r) => r.sev === 'WARN').length,
		declared: rows.filter((r) => r.sev === 'DECLARED').length,
	};
	return { rows, counts, deadDeclarations };
}

module.exports = {
	ALL_RULES,
	CAPTURE_RULES,
	KNOWN_RULES,
	RULE_CLASS,
	NON_DECLARABLE_CLASSES,
	NON_DECLARABLE_RULES,
	DECLARABLE_RULES,
	CITATION_RE,
	SCHEMES,
	LEN_TOL,
	LS_TOL,
	INK_RGB_TOL,
	INK_ALPHA_TOL,
	validateMap,
	checkBaselineCoverage,
	compare,
};
