// D8 Task 9 (spec §7) — turn/round economy: the per-actor `actions` checklist
// (Hero.actions / CreatureInstance.actions) plus `advanceRound()`, the round-boundary
// transition shared by the round display, the Malice panel's auto-gain (Task 5, spec
// §3.3/OD-3), and this checklist's per-round reset.
//
// HARD INVARIANT (byte-stability, F1 §4.2): `round` / `actions` / `malice.round_gain` /
// `malice.log` are ADDITIVE-OPTIONAL — parse() must never materialize any of them when
// absent, and serialize() must never emit a key that was never set. This file is the
// "freeze proof": a legacy (pre-D8) block round-trips with NONE of the new keys present,
// and a block that already carries them round-trips byte-stable too.
//
// This suite does NOT touch (and must not need to touch) `initiative-serialize.test.ts`
// — that file's fixtures are ref-free legacy sources with no `round`/`actions`/
// `round_gain`/`log`, and it stays green UNMODIFIED as the load-bearing proof that parse()/
// serialize() needed zero changes for this feature.
import { parseYaml } from '../../mocks/obsidian';
import { advanceRound, parse, serialize } from '../../../src/elements/initiative/model';
import type { EncounterData } from '../../../src/elements/initiative/model';

const parseLikePipeline = (source: string): EncounterData => parse(parseYaml(source), source);

describe('T-9: byte-stability — legacy blocks never gain the new economy keys', () => {
	// A pre-D8 body: no `round`, no `actions` anywhere, bare `malice: { value: 3 }`.
	const legacySource = [
		'heroes:',
		'  - name: Frodo',
		'    max_stamina: 80',
		'enemy_groups:',
		'  - name: Pack',
		'    creatures:',
		'      - name: Wolf',
		'        max_stamina: 20',
		'        amount: 2',
		'malice:',
		'  value: 3',
	].join('\n');

	test('parse -> serialize emits no round/actions/round_gain/log keys', () => {
		const model = parseLikePipeline(legacySource);
		const out = serialize(model);

		expect(out).not.toMatch(/^round:/m);
		expect(out).not.toMatch(/actions:/);
		expect(out).not.toMatch(/round_gain:/);
		expect(out).not.toMatch(/log:/);

		// The object itself carries no new keys either (never fabricated in memory).
		expect(model.round).toBeUndefined();
		expect(model.heroes[0].actions).toBeUndefined();
		expect(model.enemy_groups[0].creatures[0].instances![0].actions).toBeUndefined();
		expect(model.malice.round_gain).toBeUndefined();
		expect(model.malice.log).toBeUndefined();
	});

	test('is byte-identical to a fresh parse/serialize of the same source (no drift across passes)', () => {
		const s1 = serialize(parseLikePipeline(legacySource));
		const s2 = serialize(parseLikePipeline(legacySource));
		expect(s1).toBe(s2);

		const reparsed = parseLikePipeline(s1);
		expect(serialize(reparsed)).toBe(s1);
	});
});

describe('T-9: byte-stability — new fields present survive parse -> serialize -> parse', () => {
	const withNewFields = [
		'round: 2',
		'heroes:',
		'  - name: Frodo',
		'    max_stamina: 80',
		'    actions: {main: true, maneuver: false, move: true, triggered: false}',
		'enemy_groups:',
		'  - name: Pack',
		'    creatures:',
		'      - name: Wolf',
		'        max_stamina: 20',
		'        amount: 1',
		'        instances:',
		'          - id: 1',
		'            actions: {main: false, maneuver: true, move: false, triggered: true}',
		'malice:',
		'  value: 3',
		'  round_gain: 2',
		'  log:',
		'    - {round: 1, amount: 1, label: x}',
	].join('\n');

	test('round / hero actions / instance actions / malice.round_gain+log all survive, in order', () => {
		const model = parseLikePipeline(withNewFields);

		expect(model.round).toBe(2);
		expect(model.heroes[0].actions).toEqual({
			main: true,
			maneuver: false,
			move: true,
			triggered: false,
		});
		expect(model.enemy_groups[0].creatures[0].instances![0].actions).toEqual({
			main: false,
			maneuver: true,
			move: false,
			triggered: true,
		});
		expect(model.malice.round_gain).toBe(2);
		expect(model.malice.log).toEqual([{ round: 1, amount: 1, label: 'x' }]);

		const s1 = serialize(model);
		expect(s1).toContain('round: 2');
		expect(s1).toContain('round_gain: 2');
		expect(s1).toMatch(/log:\s*\n\s*- round: 1\s*\n\s*amount: 1\s*\n\s*label: x/);

		const m2 = parseLikePipeline(s1);
		expect(m2).toEqual(model);
		expect(serialize(m2)).toBe(s1);
	});
});

describe('T-9: advanceRound()', () => {
	test('increments round, clears has_taken_turn + all materialized actions, applies round_gain + logs it', () => {
		const source = [
			'round: 2',
			'heroes:',
			'  - name: Frodo',
			'    max_stamina: 80',
			'    has_taken_turn: true',
			'    actions: {main: true, maneuver: true, move: false, triggered: true}',
			'  - name: Sam',
			'    max_stamina: 60',
			'enemy_groups:',
			'  - name: Pack',
			'    has_taken_turn: true',
			'    creatures:',
			'      - name: Wolf',
			'        max_stamina: 20',
			'        amount: 1',
			'        instances:',
			'          - id: 1',
			'            actions: {main: true, maneuver: false, move: true, triggered: true}',
			'malice:',
			'  value: 5',
			'  round_gain: 2',
		].join('\n');
		const model = parseLikePipeline(source);

		advanceRound(model);

		expect(model.round).toBe(3);
		expect(model.malice.value).toBe(7); // 5 + round_gain 2
		expect(model.malice.log).toEqual([{ round: 3, amount: 2, label: 'Round gain' }]);

		// has_taken_turn cleared on both heroes and the enemy group.
		expect(model.heroes[0].has_taken_turn).toBe(false);
		expect(model.heroes[1].has_taken_turn).toBe(false);
		expect(model.enemy_groups[0].has_taken_turn).toBe(false);

		// Materialized `actions` reset to all-false (stays present, not un-materialized).
		expect(model.heroes[0].actions).toEqual({
			main: false,
			maneuver: false,
			move: false,
			triggered: false,
		});
		expect(model.enemy_groups[0].creatures[0].instances![0].actions).toEqual({
			main: false,
			maneuver: false,
			move: false,
			triggered: false,
		});

		// An actor that never had `actions` touched stays untouched (absent), not
		// fabricated by advanceRound.
		expect(model.heroes[1].actions).toBeUndefined();
	});

	test('absent round defaults to 1, so the first advance produces round 2', () => {
		const model = parseLikePipeline(
			['heroes: []', 'enemy_groups: []', 'malice:', '  value: 0'].join('\n'),
		);
		expect(model.round).toBeUndefined();

		advanceRound(model);

		expect(model.round).toBe(2);
	});

	test('absent/zero round_gain is manual-only: no pool change, no log entry appended', () => {
		const noGain = parseLikePipeline(
			['heroes: []', 'enemy_groups: []', 'malice:', '  value: 4'].join('\n'),
		);
		advanceRound(noGain);
		expect(noGain.malice.value).toBe(4);
		expect(noGain.malice.log).toBeUndefined();

		const zeroGain = parseLikePipeline(
			['heroes: []', 'enemy_groups: []', 'malice:', '  value: 4', '  round_gain: 0'].join('\n'),
		);
		advanceRound(zeroGain);
		expect(zeroGain.malice.value).toBe(4);
		expect(zeroGain.malice.log).toBeUndefined();
	});

	test('round_gain applied on top of an existing log preserves earlier entries', () => {
		const model = parseLikePipeline(
			[
				'round: 1',
				'heroes: []',
				'enemy_groups: []',
				'malice:',
				'  value: 3',
				'  round_gain: 1',
				'  log:',
				'    - {round: 1, amount: 3, label: Feytouched}',
			].join('\n'),
		);

		advanceRound(model);

		expect(model.malice.log).toEqual([
			{ round: 1, amount: 3, label: 'Feytouched' },
			{ round: 2, amount: 1, label: 'Round gain' },
		]);
	});
});
