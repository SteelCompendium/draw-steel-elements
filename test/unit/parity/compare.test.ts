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
const { validateMap, checkBaselineCoverage, compare, ALL_RULES } = parity;

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
		expect(r.rows[0].rule).toBe('capture');
		expect(r.rows[0].msg).toContain('never rendered');
		expect(wouldExitZero(r)).toBe(false);
	});

	test('the same warn passes only once it is explicitly declared', () => {
		const r = compare({
			site: inv('.s'),
			plug: inv('.something-else'),
			map: onePairMap({
				declaredDeferrals: [{ pair: 'p', rule: 'capture', why: 'SC-110 — pair is off the fixture set' }],
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

describe('parity compare — a declaration cannot be anonymous or inert', () => {
	test('a declaration with no FOLLOWUPS/ticket citation is a hard error', () => {
		const errs = validateMap(
			onePairMap({ declaredDeferrals: [{ pair: 'p', rule: 'ink', why: 'it looks fine to me' }] }),
		);
		expect(errs.join('\n')).toContain('must cite');
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
		for (const d of map.declaredDeferrals) expect(d.why).toMatch(/(FOLLOWUPS #\d+|SC-\d+)/);
	});
});
