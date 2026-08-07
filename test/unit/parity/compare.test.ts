// test/unit/parity/compare.test.ts — SC-110: the parity gate's own gate.
//
// `visual-harness/parity/compare.cjs` decides whether `npm run parity` passes. Its new
// contract is: exit 0 iff 0 GAPs AND 0 undeclared WARNs, where the ONLY escape is an
// explicit `declaredDeferrals` entry citing a FOLLOWUPS number or a Linear ticket. An
// allowlist nobody can prove fails is a mute button, not a gate — so the load-bearing
// case here is the can-fail one: an undeclared WARN must flip the run to a failure.
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const parity = require('../../../visual-harness/parity/compare.cjs');
const { validateMap, checkBaselineCoverage, compare, ALL_RULES, NON_DECLARABLE_RULES, RULE_CLASS, KNOWN_RULES } =
	parity;

const PARITY_DIR = path.join(__dirname, '../../../visual-harness/parity');

/** A full computed-style sample; overrides drift one property at a time. */
const styles = (over: Record<string, string> = {}): Record<string, string> => ({
	'background-image': 'none',
	'background-color': 'rgb(20, 20, 20)',
	'box-shadow': 'none',
	'border-top-color': 'rgb(0, 0, 0)',
	'border-top-width': '0px',
	'border-top-style': 'none',
	'border-bottom-color': 'rgb(0, 0, 0)',
	'border-bottom-width': '0px',
	'border-bottom-style': 'none',
	'border-radius': '0px',
	color: 'rgb(10, 20, 30)',
	'font-family': '"Source Serif 4", serif',
	'font-size': '16px',
	'font-weight': '400',
	'font-variant-caps': 'normal',
	'letter-spacing': 'normal',
	'text-transform': 'none',
	'padding-top': '0px',
	'padding-right': '0px',
	'padding-bottom': '0px',
	'padding-left': '0px',
	'margin-top': '0px',
	'margin-bottom': '0px',
	'line-height': '27.2px',
	...over,
});

const inv = (sel: string, over: Record<string, string> = {}) => ({
	capturedAt: '2026-01-01T00:00:00.000Z',
	entries: {
		'page--dark': { [sel]: styles(over) },
		'page--light': { [sel]: styles(over) },
	},
});

const onePairMap = (extra: Record<string, unknown> = {}) => ({
	pairs: [{ id: 'p', site: '.s', plugin: '.p', why: 'test pair' }],
	...extra,
});

/** What diff.mjs does with the counts: the whole exit-code story. */
const wouldExitZero = (r: { counts: { gap: number; warn: number }; deadDeclarations: unknown[] }) =>
	r.counts.gap === 0 && r.counts.warn === 0 && r.deadDeclarations.length === 0;

describe('parity compare — severities and the exit contract', () => {
	test('identical inventories report nothing at all', () => {
		const r = compare({ site: inv('.s'), plug: inv('.p'), map: onePairMap() });
		expect(r.rows).toHaveLength(0);
		expect(r.counts).toEqual({ gap: 0, warn: 0, declared: 0 });
		expect(wouldExitZero(r)).toBe(true);
	});

	test('a real difference is a GAP in BOTH schemes and fails the gate', () => {
		const r = compare({
			site: inv('.s'),
			plug: inv('.p', { 'font-size': '20px' }),
			map: onePairMap(),
		});
		expect(r.counts.gap).toBe(2);
		expect(r.rows.map((x: { scheme: string }) => x.scheme).sort()).toEqual(['dark', 'light']);
		expect(r.rows[0].rule).toBe('font-size');
		expect(wouldExitZero(r)).toBe(false);
	});

	test('a declaration converts a matching GAP to DECLARED and the gate passes', () => {
		const r = compare({
			site: inv('.s'),
			plug: inv('.p', { 'font-size': '20px' }),
			map: onePairMap({
				declaredDeferrals: [{ pair: 'p', rule: 'font-size', why: 'FOLLOWUPS #99 — deliberate' }],
			}),
		});
		expect(r.counts).toEqual({ gap: 0, warn: 0, declared: 2 });
		expect(r.rows[0].why).toContain('FOLLOWUPS #99');
		expect(wouldExitZero(r)).toBe(true);
	});

	// ── THE CAN-FAIL PROOF ────────────────────────────────────────────────────────────
	// Before SC-110 a WARN was printed and ignored, so a pair could go blind (a renamed
	// class, a page that stopped emitting the node) with the gate still green. These two
	// tests are the same scenario with and without a declaration; if the first ever goes
	// green the mechanism has stopped being a gate.
	test('an UNDECLARED warn (plugin node never rendered) FLIPS the gate to failing', () => {
		const r = compare({
			site: inv('.s'),
			plug: inv('.something-else'),
			map: onePairMap(),
		});
		expect(r.counts.gap).toBe(0); // nothing was *compared* …
		expect(r.counts.warn).toBe(2); // … and that is precisely the failure
		expect(r.rows[0].rule).toBe('capture-plugin');
		expect(r.rows[0].msg).toContain('never rendered');
		expect(wouldExitZero(r)).toBe(false);
	});

	test('the same warn passes only once it is explicitly declared', () => {
		const r = compare({
			site: inv('.s'),
			plug: inv('.something-else'),
			map: onePairMap({
				declaredDeferrals: [{ pair: 'p', rule: 'capture-plugin', why: 'SC-110 — pair is off the fixture set' }],
			}),
		});
		expect(r.counts).toEqual({ gap: 0, warn: 0, declared: 2 });
		expect(wouldExitZero(r)).toBe(true);
	});

	test('an unparseable value is an undeclared WARN, never a silent skip', () => {
		const r = compare({
			site: inv('.s'),
			plug: inv('.p', { 'line-height': 'normal' }),
			map: onePairMap(),
		});
		expect(r.counts.warn).toBe(2);
		expect(r.rows[0].msg).toContain('not comparable');
		expect(wouldExitZero(r)).toBe(false);
	});

	test('a scheme-scoped declaration covers ONLY that scheme', () => {
		const r = compare({
			site: inv('.s'),
			plug: inv('.p', { 'font-size': '20px' }),
			map: onePairMap({
				declaredDeferrals: [{ pair: 'p', rule: 'font-size', scheme: 'dark', why: 'FOLLOWUPS #99' }],
			}),
		});
		expect(r.counts).toEqual({ gap: 1, warn: 0, declared: 1 });
		expect(wouldExitZero(r)).toBe(false);
	});

	test('a declaration that matches nothing is reported as dead (anti-rot)', () => {
		const r = compare({
			site: inv('.s'),
			plug: inv('.p'),
			map: onePairMap({
				declaredDeferrals: [{ pair: 'p', rule: 'ink', why: 'FOLLOWUPS #99 — long since fixed' }],
			}),
		});
		expect(r.deadDeclarations).toHaveLength(1);
		expect(r.deadDeclarations[0].rule).toBe('ink');
		expect(wouldExitZero(r)).toBe(false);
	});
});

describe('parity compare — `owns` may MOVE a rule, never drop or double-count it', () => {
	const split = (a: string[], b: string[]) => ({
		pairs: [
			{ id: 'box', site: '.wrap', plugin: '.p', why: 'box', owns: a },
			{ id: 'text', site: '.wrap .tag', plugin: '.p', why: 'text', owns: b },
		],
	});
	const complement = (owned: string[]) => ALL_RULES.filter((r: string) => !owned.includes(r));

	test('a valid partition of a collapsed node passes validation', () => {
		expect(validateMap(split(['ink'], complement(['ink'])))).toEqual([]);
	});

	test('dropping a rule when splitting a node is a hard error', () => {
		const errs = validateMap(split(['ink'], complement(['ink', 'letter-spacing'])));
		expect(errs.join('\n')).toContain('letter-spacing');
		expect(errs.join('\n')).toContain('owned by NO pair');
	});

	test('two pairs claiming the same rule on one node is a hard error', () => {
		const errs = validateMap(split(['ink'], complement([])));
		expect(errs.join('\n')).toContain('owned by both');
	});

	test('sharing a plugin node without declaring `owns` is a hard error', () => {
		const errs = validateMap({
			pairs: [
				{ id: 'a', site: '.x', plugin: '.p', why: '' },
				{ id: 'b', site: '.y', plugin: '.p', why: '' },
			],
		});
		expect(errs.join('\n')).toContain('MUST declare "owns"');
	});

	test('an unknown rule name in `owns` is a hard error', () => {
		const errs = validateMap({ pairs: [{ id: 'a', site: '.x', plugin: '.p', owns: ['inkk'] }] });
		expect(errs.join('\n')).toContain('unknown rule "inkk"');
	});

	test('the `owns` filter really suppresses the rule it moves away', () => {
		const map = {
			pairs: [
				{ id: 'box', site: '.s', plugin: '.p', owns: complement(['font-size']) },
				{ id: 'text', site: '.s2', plugin: '.p', owns: ['font-size'] },
			],
		};
		const site = {
			capturedAt: 'x',
			entries: {
				'page--dark': { '.s': styles({ 'font-size': '99px' }), '.s2': styles() },
				'page--light': { '.s': styles({ 'font-size': '99px' }), '.s2': styles() },
			},
		};
		// `box` no longer owns font-size, and `text` (which does) agrees — so the 99px on
		// the box pair's site node must NOT be reported.
		const r = compare({ site, plug: inv('.p'), map });
		expect(r.rows).toHaveLength(0);
	});
});

// ── M-1: rule coverage is enforced on EVERY pair, not only on collapsed nodes ────────
// The original partition check ran only when a plugin selector was named by two or more
// pairs (`if (group.length < 2) continue`). A pair whose plugin node nobody else named
// could therefore narrow `owns` to anything and the remaining rules were never compared,
// never warned about, never recorded — a second mute button, bypassing all five
// declaration checks. It was live: the shipped `statblock-wrap` pair was hiding two real
// line-height rows through it.
describe('parity compare — narrowing `owns` on an UNSHARED plugin node cannot drop rules', () => {
	const complement = (owned: string[]) => ALL_RULES.filter((r: string) => !owned.includes(r));

	test('a lone pair narrowing `owns` is a hard error naming every dropped rule', () => {
		const errs = validateMap({
			pairs: [{ id: 'solo', site: '.s', plugin: '.p', why: 'lone node', owns: ['margin-top', 'margin-bottom'] }],
		});
		const joined = errs.join('\n');
		expect(joined).toContain('owned by NO pair');
		for (const r of complement(['margin-top', 'margin-bottom'])) expect(joined).toContain(r);
		expect(joined).toContain('Silence is not an option');
	});

	test('the same pair with no `owns` at all is valid — full coverage is the default', () => {
		expect(validateMap({ pairs: [{ id: 'solo', site: '.s', plugin: '.p', why: 'lone node' }] })).toEqual([]);
	});

	// THE CAN-FAIL TWIN: the narrowing that validation now rejects is exactly the one that
	// used to erase a real finding. Without the coverage check the run reports nothing.
	test('the drop it used to hide really was a finding (can-fail proof)', () => {
		const map = {
			pairs: [{ id: 'solo', site: '.s', plugin: '.p', why: 'lone node', owns: ['margin-top'] }],
		};
		const r = compare({ site: inv('.s'), plug: inv('.p', { 'font-size': '99px' }), map });
		expect(r.rows).toHaveLength(0); // the comparison silently did not happen …
		expect(wouldExitZero(r)).toBe(true); // … and the gate would have gone green
		expect(validateMap(map).join('\n')).toContain('owned by NO pair'); // — so validation kills it first
	});

	test('the erasure attack on the SHIPPED map is now rejected (review probe P7)', () => {
		const shipped = JSON.parse(fs.readFileSync(path.join(PARITY_DIR, 'selector-map.json'), 'utf8'));
		const wrap = shipped.pairs.find((p: { id: string }) => p.id === 'statblock-wrap');
		wrap.owns = ['margin-top']; // narrow it, then delete the declarations it excused
		shipped.declaredDeferrals = shipped.declaredDeferrals.filter(
			(d: { pair: string }) => d.pair !== 'statblock-wrap',
		);
		expect(validateMap(shipped).join('\n')).toContain('owned by NO pair');
	});

	test('`excludes` is the ONLY drop, and it must cite a FOLLOWUPS number or ticket', () => {
		const drop = (why: string) => ({
			pairs: [
				{
					id: 'solo',
					site: '.s',
					plugin: '.p',
					owns: ['margin-top', 'margin-bottom'],
					excludes: complement(['margin-top', 'margin-bottom']).map((rule: string) => ({ rule, why })),
				},
			],
		});
		expect(validateMap(drop('SC-110 — the site node carries nothing else'))).toEqual([]);
		expect(validateMap(drop('it looks fine to me')).join('\n')).toContain('must cite');
	});

	test('a rule cannot be both owned and excluded', () => {
		const errs = validateMap({
			pairs: [
				{
					id: 'solo',
					site: '.s',
					plugin: '.p',
					owns: ALL_RULES,
					excludes: [{ rule: 'ink', why: 'SC-110' }],
				},
			],
		});
		expect(errs.join('\n')).toContain('owned or excluded, never both');
	});

	test('`excludes` without `owns` is inert and therefore an error', () => {
		const errs = validateMap({
			pairs: [{ id: 'solo', site: '.s', plugin: '.p', excludes: [{ rule: 'ink', why: 'SC-110' }] }],
		});
		expect(errs.join('\n')).toContain('inert');
	});

	test('a sibling cannot exclude a rule its partner owns', () => {
		const errs = validateMap({
			pairs: [
				{ id: 'box', site: '.s', plugin: '.p', owns: complement(['ink']) },
				{ id: 'text', site: '.s2', plugin: '.p', owns: ['ink'], excludes: [{ rule: 'bg', why: 'SC-110' }] },
			],
		});
		expect(errs.join('\n')).toContain('excluded by "text" but owned by "box"');
	});
});

// ── M-2: material divergences are NEVER declarable ───────────────────────────────────
describe('parity compare — MATERIAL rules can never be declared away', () => {
	test('every known rule has exactly one property class', () => {
		for (const r of KNOWN_RULES) expect(typeof RULE_CLASS[r]).toBe('string');
		expect(Object.keys(RULE_CLASS).sort()).toEqual([...KNOWN_RULES].sort());
	});

	test('the non-declarable set is exactly the material rules', () => {
		expect(NON_DECLARABLE_RULES).toEqual(['bg', 'shadow', 'hairline-top', 'hairline-bottom']);
	});

	test.each(['bg', 'shadow', 'hairline-top', 'hairline-bottom'])(
		'declaring "%s" is a hard contract error',
		(rule) => {
			const errs = validateMap(
				onePairMap({ declaredDeferrals: [{ pair: 'p', rule, why: 'FOLLOWUPS #99 — looks fine' }] }),
			);
			expect(errs.join('\n')).toContain('can NEVER be declared');
			expect(errs.join('\n')).toContain('plan 19');
		},
	);

	test.each(['font-size', 'line-height', 'letter-spacing', 'body-font', 'padding-top', 'margin-top', 'ink'])(
		'declaring "%s" (geometry/typography/ink) stays legal',
		(rule) => {
			expect(validateMap(onePairMap({ declaredDeferrals: [{ pair: 'p', rule, why: 'FOLLOWUPS #99' }] }))).toEqual([]);
		},
	);

	// CAN-FAIL: the flat-surface GAP is real, and the declaration that used to convert it
	// to DECLARED is now rejected before `compare` ever runs — so it stays fatal.
	test('a flat-surface GAP cannot be converted to DECLARED (plan 19 failure mode)', () => {
		const map = onePairMap({
			declaredDeferrals: [{ pair: 'p', rule: 'bg', why: 'FOLLOWUPS #99 — deliberate' }],
		});
		expect(validateMap(map).join('\n')).toContain('can NEVER be declared');
		const r = compare({
			site: inv('.s', { 'background-image': 'linear-gradient(#111, #222)' }),
			plug: inv('.p'),
			map: onePairMap(),
		});
		expect(r.counts.gap).toBe(2);
		expect(wouldExitZero(r)).toBe(false);
	});
});

// ── L-1/P8: the capture rows are directional ─────────────────────────────────────────
describe('parity compare — `capture` declarations are directional', () => {
	test('a capture-site declaration does NOT silence "plugin never rendered"', () => {
		const r = compare({
			site: inv('.s'),
			plug: inv('.something-else'),
			map: onePairMap({
				declaredDeferrals: [{ pair: 'p', rule: 'capture-site', why: 'SC-110 — page is off urls.json' }],
			}),
		});
		expect(r.counts.warn).toBe(2);
		expect(r.rows[0].rule).toBe('capture-plugin');
		expect(wouldExitZero(r)).toBe(false);
	});

	test('a capture-plugin declaration does NOT silence "site never captured"', () => {
		const r = compare({
			site: inv('.something-else'),
			plug: inv('.p'),
			map: onePairMap({
				declaredDeferrals: [{ pair: 'p', rule: 'capture-plugin', why: 'SC-110 — fixture is out of scope' }],
			}),
		});
		expect(r.counts.warn).toBe(2);
		expect(r.rows[0].rule).toBe('capture-site');
		expect(wouldExitZero(r)).toBe(false);
	});

	test('the old undirected "capture" name is rejected with the migration named', () => {
		const errs = validateMap(onePairMap({ declaredDeferrals: [{ pair: 'p', rule: 'capture', why: 'SC-110' }] }));
		expect(errs.join('\n')).toContain('now DIRECTIONAL');
	});
});

describe('parity compare — a declaration cannot be anonymous or inert', () => {
	test('a declaration with no FOLLOWUPS/ticket citation is a hard error', () => {
		const errs = validateMap(
			onePairMap({ declaredDeferrals: [{ pair: 'p', rule: 'ink', why: 'it looks fine to me' }] }),
		);
		expect(errs.join('\n')).toContain('must cite');
	});

	// P11: the citation proves shape, and the number has to be a plausible one. `SC-0` /
	// `FOLLOWUPS #0` name nothing that can ever exist, so they are shape-valid noise.
	test.each(['SC-0', 'FOLLOWUPS #0', 'SC-00', 'FOLLOWUPS #007'])('citation "%s" is rejected', (why) => {
		const errs = validateMap(onePairMap({ declaredDeferrals: [{ pair: 'p', rule: 'ink', why }] }));
		expect(errs.join('\n')).toContain('must cite');
	});

	test.each(['SC-1', 'SC-110', 'FOLLOWUPS #9', 'FOLLOWUPS #52'])('citation "%s" is accepted', (why) => {
		expect(validateMap(onePairMap({ declaredDeferrals: [{ pair: 'p', rule: 'ink', why }] }))).toEqual([]);
	});

	test('a declaration naming an unknown pair is a hard error', () => {
		const errs = validateMap(
			onePairMap({ declaredDeferrals: [{ pair: 'nope', rule: 'ink', why: 'FOLLOWUPS #99' }] }),
		);
		expect(errs.join('\n')).toContain('no pair with id "nope"');
	});

	test('a declaration naming an unknown rule is a hard error', () => {
		const errs = validateMap(
			onePairMap({ declaredDeferrals: [{ pair: 'p', rule: 'colour', why: 'FOLLOWUPS #99' }] }),
		);
		expect(errs.join('\n')).toContain('unknown rule "colour"');
	});

	test('declaring a rule the pair does not own is a hard error (it could never match)', () => {
		const errs = validateMap({
			pairs: [
				{ id: 'box', site: '.s', plugin: '.p', owns: ALL_RULES.filter((r: string) => r !== 'ink') },
				{ id: 'text', site: '.s2', plugin: '.p', owns: ['ink'] },
			],
			declaredDeferrals: [{ pair: 'box', rule: 'ink', why: 'FOLLOWUPS #99' }],
		});
		expect(errs.join('\n')).toContain('does not own rule "ink"');
	});
});

describe('parity compare — a stale baseline fails loudly with the human remedy', () => {
	test('a site selector missing from the baseline names `npm run parity:site`', () => {
		const errs = checkBaselineCoverage(inv('.s'), {
			pairs: [
				{ id: 'p', site: '.s', plugin: '.p' },
				{ id: 'q', site: '.brand-new', plugin: '.q' },
			],
		});
		expect(errs.join('\n')).toContain('STALE BASELINE');
		expect(errs.join('\n')).toContain('.brand-new');
		expect(errs.join('\n')).toContain('npm run parity:site');
	});

	test('a baseline covering every mapped selector is clean', () => {
		expect(checkBaselineCoverage(inv('.s'), { pairs: [{ id: 'p', site: '.s', plugin: '.p' }] })).toEqual([]);
	});
});

describe('the SHIPPED contract is itself valid', () => {
	const map = JSON.parse(fs.readFileSync(path.join(PARITY_DIR, 'selector-map.json'), 'utf8'));

	test('selector-map.json passes every structural check', () => {
		expect(validateMap(map)).toEqual([]);
	});

	test('the committed baseline covers every site selector the map names', () => {
		const site = JSON.parse(fs.readFileSync(path.join(PARITY_DIR, 'baseline', 'site-inventory.json'), 'utf8'));
		expect(checkBaselineCoverage(site, map)).toEqual([]);
	});

	test('every declared deferral cites its FOLLOWUPS number or ticket', () => {
		for (const d of map.declaredDeferrals) expect(d.why).toMatch(/(FOLLOWUPS #[1-9]\d*|SC-[1-9]\d*)/);
	});

	test('no shipped declaration names a material rule', () => {
		for (const d of map.declaredDeferrals) expect(NON_DECLARABLE_RULES).not.toContain(d.rule);
	});

	// Documented in README.md ("Declared deferrals") and the dse-verify skill. If this
	// number moves, the run either fixed a divergence (delete the entry) or grew a new one
	// (file a FOLLOWUPS item first) — it is never something to re-baseline quietly.
	test('the declared set is exactly the documented 9 entries', () => {
		expect(map.declaredDeferrals.map((d: { pair: string; rule: string }) => `${d.pair}:${d.rule}`)).toEqual([
			'pr-chars:ink',
			'section-tag:font-size',
			'section-tag:line-height',
			'section-tag:letter-spacing',
			'statblock-wrap:line-height',
			'statblock-wrap:margin-top',
			'statblock-wrap:margin-bottom',
			'featureblock-wrap:margin-top',
			'featureblock-wrap:margin-bottom',
		]);
	});
});
