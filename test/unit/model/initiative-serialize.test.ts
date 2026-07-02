// Plan 06 Task 1: initiative element model — the SYNC parse (split from the legacy async
// parseEncounterData) + BYTE-COMPAT serialize.
//
// BYTE-COMPAT ORACLE: the legacy write path (CodeBlocks.updateInitiativeTracker ->
// updateCodeBlock -> updateMarkdownCodeBlock, src/utils/CodeBlocks.ts:102; canvas :79) does
// exactly `stringifyYaml(data).trim()` on the WHOLE materialized EncounterData the legacy
// processor holds. The fixtures (quick-start.yaml, squad.yaml) and the mid-encounter source
// below are REF-FREE (no `statblock` strings), so the legacy async parseEncounterData never
// touches its resolver on them and the new sync parse() must produce the IDENTICAL
// materialized object — serialize(parse(src)) must byte-equal
// stringifyYaml(await parseEncounterData(src, app, settings)).trim(). The legacy function is
// called UNCHANGED as an independent oracle (its own parseYaml + materialization code path);
// the structural pins are hand-checked so the suite is not tautological.
//
// SPLIT PINS (the subtle part of Plan 06 T-1): parse() must NOT run the validations legacy
// ran only AFTER its inline statblock merge — hero name (EncounterData.ts:130) /
// hero max_stamina (:133) / creature name (:230) / creature max_stamina (:240) — those move
// to Task 2's resolveRefs, which fills statblock-sourced values first. Everything
// merge-independent (shape errors, squad-role errors, amount, malice, condition format,
// instance ids) must still throw SYNCHRONOUSLY from parse.
import { parseYaml, stringifyYaml, App } from '../../mocks/obsidian';
import { parseEncounterData } from '@drawSteelAdmonition/EncounterData';
import type { EncounterData } from '@drawSteelAdmonition/EncounterData';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { parse, serialize } from '../../../src/elements/initiative/model';
import quickStart from '../../fixtures/initiative/quick-start.yaml';
import squad from '../../fixtures/initiative/squad.yaml';

/** Runs the model exactly the way the pipeline does: def.parse(parseYaml(source), source). */
const parseLikePipeline = (source: string): EncounterData => parse(parseYaml(source), source);

/** The legacy materialization — the UNCHANGED async function, as an independent oracle. */
const legacyMaterialize = (source: string): Promise<EncounterData> =>
	parseEncounterData(source, new App() as any, DEFAULT_SETTINGS);

/** The exact bytes the LEGACY writer would put back into the note for this source. */
const legacyWriterBytes = async (source: string): Promise<string> =>
	stringifyYaml(await legacyMaterialize(source)).trim();

// Mid-encounter state: explicit hero stamina/turn/conditions + PRE-EXISTING creature
// instances (instances.length === amount), exercising the validate-existing-instances
// branch (EncounterData.ts:310-343) that the fresh fixtures never reach.
const midEncounter = [
	'heroes:',
	'  - name: Frodo',
	'    max_stamina: 80',
	'    current_stamina: 33',
	'    temp_stamina: 2',
	'    has_taken_turn: true',
	'    conditions:',
	'      - dazed',
	'enemy_groups:',
	'  - name: Pack',
	'    has_taken_turn: true',
	'    creatures:',
	'      - name: Wolf',
	'        max_stamina: 20',
	'        amount: 2',
	'        instances:',
	'          - id: 1',
	'            current_stamina: 7',
	'            conditions:',
	'              - bleeding',
	'          - id: 2',
	'malice:',
	'  value: 3',
].join('\n');

describe('T-1: serialize(parse(src)) is byte-compatible with the legacy writer', () => {
	test('quick-start: parse deep-equals legacy parse; serialize byte-equals legacy writeback', async () => {
		const model = parseLikePipeline(quickStart);
		expect(model).toEqual(await legacyMaterialize(quickStart));
		expect(serialize(model)).toBe(await legacyWriterBytes(quickStart));
	});

	test('squad: parse deep-equals legacy parse; serialize byte-equals legacy writeback', async () => {
		const model = parseLikePipeline(squad);
		expect(model).toEqual(await legacyMaterialize(squad));
		expect(serialize(model)).toBe(await legacyWriterBytes(squad));
	});

	test('mid-encounter (pre-existing instances): byte-equals legacy writeback', async () => {
		const model = parseLikePipeline(midEncounter);
		expect(model).toEqual(await legacyMaterialize(midEncounter));
		expect(serialize(model)).toBe(await legacyWriterBytes(midEncounter));
		// Hand-checked pins for the validate-existing-instances branch:
		const wolf = model.enemy_groups[0].creatures[0];
		expect(wolf.instances![0]).toMatchObject({ id: 1, current_stamina: 7, temp_stamina: 0 });
		expect(wolf.instances![0].conditions).toEqual([
			{ key: 'bleeding', color: undefined, effect: undefined },
		]);
		expect(wolf.instances![1]).toMatchObject({ id: 2, current_stamina: 20, temp_stamina: 0 });
		expect(model.heroes[0].current_stamina).toBe(33); // explicit values kept, not reset
		expect(model.heroes[0].has_taken_turn).toBe(true);
	});

	test('output is trimmed (no trailing newline), matching legacy writer + replaceSource', () => {
		const out = serialize(parseLikePipeline(quickStart));
		expect(out).not.toMatch(/\n$/);
		expect(out).not.toMatch(/^\s/);
	});

	test('serialized shape pins (hand-checked, non-tautological)', () => {
		const quickOut = serialize(parseLikePipeline(quickStart));
		// Top-level key order is the parsed-source insertion order.
		const topLevelKeys = quickOut
			.split('\n')
			.filter((line) => /^\S/.test(line))
			.map((line) => line.split(':')[0]);
		expect(topLevelKeys).toEqual(['heroes', 'enemy_groups', 'malice']);
		// Materialized defaults are actually written back (the legacy first-write behavior).
		expect(quickOut).toContain('has_taken_turn: false');
		expect(quickOut).toContain('current_stamina: 80');
		expect(quickOut).toContain('temp_stamina: 0');
		expect(quickOut).toContain('isHero: true');
		expect(quickOut).toContain('value: 5');

		const squadOut = serialize(parseLikePipeline(squad));
		expect(squadOut).toContain('minion_stamina_pool: 20');
		// Condition objects drop their undefined color/effect keys on disk; provided
		// values are kept (string 'grabbed' + {key: bleeding, color: crimson}).
		expect(squadOut).toMatch(/conditions:\n\s+- key: grabbed\n\s+- key: bleeding\n\s+color: crimson/);
		expect(squadOut).not.toContain('effect:');
		expect(squadOut).not.toContain('color: null');
	});
});

describe('T-1: round-trip stability (parse -> serialize -> parse)', () => {
	test.each([
		['quick-start', quickStart],
		['squad', squad],
		['mid-encounter', midEncounter],
	])('%s: parse(serialize(m)) deep-equals m; serialize is stable on pass 2', (_name, source) => {
		const m1 = parseLikePipeline(source);
		const s1 = serialize(m1);
		const m2 = parseLikePipeline(s1);
		expect(m2).toEqual(m1);
		expect(serialize(m2)).toBe(s1);
	});
});

describe('T-1: instance materialization + defaults (hand-checked pins, mirror legacy T-1)', () => {
	test('heroes get defaults: current_stamina→max, temp→0, turn=false, isHero, [] conditions', () => {
		const frodo = parseLikePipeline(quickStart).heroes[0];
		expect(frodo).toMatchObject({
			name: 'Frodo Baggins',
			max_stamina: 80,
			current_stamina: 80,
			temp_stamina: 0,
			has_taken_turn: false,
			isHero: true,
			conditions: [],
		});
	});

	test('string and object conditions normalize to Condition objects', () => {
		expect(parseLikePipeline(squad).heroes[0].conditions).toEqual([
			{ key: 'grabbed', color: undefined, effect: undefined },
			{ key: 'bleeding', color: 'crimson', effect: undefined },
		]);
	});

	test('creature instances auto-created with 1-based ids and full stamina (pool = max × amount)', () => {
		const data = parseLikePipeline(quickStart);
		const orc = data.enemy_groups[0].creatures[0];
		expect(orc.isHero).toBe(false);
		expect(orc.instances).toHaveLength(4);
		expect(orc.instances!.map((i) => i.id)).toEqual([1, 2, 3, 4]);
		expect(orc.instances![0]).toMatchObject({ current_stamina: 40, temp_stamina: 0, conditions: [] });
		expect(data.enemy_groups[0].creatures[1].instances).toHaveLength(1);
	});

	test('squad minion pool = max_stamina × amount; minion instances carry no stamina', () => {
		const group = parseLikePipeline(squad).enemy_groups[0];
		expect(group.is_squad).toBe(true);
		expect(group.minion_stamina_pool).toBe(20); // 4 stamina × 5 minions
		const minion = group.creatures[0];
		expect(minion.instances).toHaveLength(5);
		expect(minion.instances![0].current_stamina).toBeUndefined();
		expect(minion.instances![0].conditions).toEqual([]);
		expect(group.creatures[1].instances![0].current_stamina).toBe(40);
	});

	test('missing malice defaults to { value: 0 }; provided malice is kept', () => {
		expect(parseLikePipeline(squad).malice).toEqual({ value: 0 });
		expect(parseLikePipeline(quickStart).malice.value).toBe(5);
	});
});

describe('T-1: split boundary — ref-dependent validation is DEFERRED to resolveRefs (Task 2)', () => {
	test('hero with only a statblock ref parses: string kept, name/max/current left unset', () => {
		const data = parseLikePipeline('heroes:\n  - statblock: "Heroes/Frodo.md"\nenemy_groups: []');
		const hero = data.heroes[0];
		expect(hero.statblock).toBe('Heroes/Frodo.md'); // NOT resolved here
		expect(hero.name).toBeUndefined(); // legacy :130 check deferred
		expect(hero.max_stamina).toBeUndefined(); // legacy :133 check deferred
		expect(hero.current_stamina).toBeUndefined(); // ?? max_stamina had nothing to fill
		expect(hero.temp_stamina).toBe(0);
		expect(hero.has_taken_turn).toBe(false);
		expect(hero.isHero).toBe(true);
		expect(hero.conditions).toEqual([]);
	});

	test('hero missing name / max_stamina does NOT throw in parse (fires from resolveRefs in Task 2)', () => {
		// Legacy threw "Hero at index 0 is missing the 'name' field." / "...'max_stamina'...".
		expect(() => parseLikePipeline('heroes:\n  - max_stamina: 10\nenemy_groups: []')).not.toThrow();
		expect(() => parseLikePipeline('heroes:\n  - name: Frodo\nenemy_groups: []')).not.toThrow();
	});

	test('creature with statblock ref: instances still materialize (ids), stamina left unset', () => {
		const yaml = [
			'heroes: []',
			'enemy_groups:',
			'  - name: G',
			'    creatures:',
			'      - statblock: "Monsters/Orc.md"',
			'        amount: 2',
		].join('\n');
		const creature = parseLikePipeline(yaml).enemy_groups[0].creatures[0];
		expect(creature.statblock).toBe('Monsters/Orc.md');
		expect(creature.name).toBeUndefined(); // legacy :230 check deferred
		expect(creature.max_stamina).toBeUndefined(); // legacy :240 check deferred
		expect(creature.isHero).toBe(false);
		expect(creature.instances!.map((i) => i.id)).toEqual([1, 2]);
		expect(creature.instances![0].current_stamina).toBeUndefined(); // Task 2 fills post-merge
		expect(creature.instances![0].temp_stamina).toBe(0);
	});

	test('squad minion with statblock ref: pool stays unset (never NaN) for Task 2 to initialize', () => {
		const yaml = [
			'heroes: []',
			'enemy_groups:',
			'  - name: S',
			'    is_squad: true',
			'    creatures:',
			'      - statblock: "Monsters/Goblin.md"',
			'        amount: 5',
			'        squad_role: minion',
		].join('\n');
		const group = parseLikePipeline(yaml).enemy_groups[0];
		expect(group.minion_stamina_pool).toBeUndefined();
		expect(Number.isNaN(group.minion_stamina_pool as any)).toBe(false);
		expect(group.creatures[0].instances).toHaveLength(5); // condition-only instances exist
	});

	test('creature missing name / max_stamina does NOT throw in parse (deferred)', () => {
		const noName = 'heroes: []\nenemy_groups:\n  - name: G\n    creatures:\n      - {max_stamina: 10, amount: 1}';
		const noMax = 'heroes: []\nenemy_groups:\n  - name: G\n    creatures:\n      - {name: Orc, amount: 1}';
		expect(() => parseLikePipeline(noName)).not.toThrow();
		expect(() => parseLikePipeline(noMax)).not.toThrow();
	});
});

describe('T-1: merge-independent error surface still fires SYNCHRONOUSLY from parse', () => {
	test('non-object input', () => {
		expect(() => parseLikePipeline('just a string')).toThrow('The input must be a YAML object.');
		expect(() => parseLikePipeline('')).toThrow('The input must be a YAML object.'); // parseYaml('') === null
	});

	test('missing heroes / enemy_groups lists', () => {
		expect(() => parseLikePipeline('enemy_groups: []')).toThrow(
			"Invalid data: 'heroes' field is missing or is not a list.",
		);
		expect(() => parseLikePipeline('heroes: []')).toThrow(
			"Invalid data: 'enemy_groups' field is missing or is not a list.",
		);
	});

	test('group shape errors', () => {
		expect(() => parseLikePipeline('heroes: []\nenemy_groups:\n  - creatures: []')).toThrow(
			"Enemy group at index 0 is missing the 'name' field.",
		);
		expect(() => parseLikePipeline('heroes: []\nenemy_groups:\n  - name: G')).toThrow(
			"Enemy group 'G' has an invalid or missing 'creatures' field.",
		);
	});

	test('invalid condition shape for a hero', () => {
		const yaml = ['heroes:', '  - name: Frodo', '    max_stamina: 10', '    conditions:', '      - 5', 'enemy_groups: []'].join('\n');
		expect(() => parseLikePipeline(yaml)).toThrow("Invalid condition format for hero 'Frodo'.");
	});

	const squadYaml = (creatures: string) =>
		['heroes: []', 'enemy_groups:', '  - name: Squad', '    is_squad: true', '    creatures:', creatures].join('\n');

	test('squad-role validation suite', () => {
		expect(() =>
			parseLikePipeline(
				squadYaml(
					[
						'      - {name: A, max_stamina: 4, amount: 1, squad_role: minion}',
						'      - {name: B, max_stamina: 4, amount: 1, squad_role: minion}',
						'      - {name: C, max_stamina: 40, amount: 1, squad_role: captain}',
					].join('\n'),
				),
			),
		).toThrow("Squad 'Squad' can have at most two creatures (minions and an optional captain).");
		expect(() => parseLikePipeline(squadYaml('      - {name: A, max_stamina: 4, amount: 1}'))).toThrow(
			"Creature 'A' in squad 'Squad' must have a 'squad_role' of 'minion' or 'captain'.",
		);
		expect(() =>
			parseLikePipeline(squadYaml('      - {name: A, max_stamina: 4, amount: 1, squad_role: boss}')),
		).toThrow("Creature 'A' in squad 'Squad' has an invalid 'squad_role' value.");
		expect(() =>
			parseLikePipeline(
				squadYaml(
					[
						'      - {name: A, max_stamina: 4, amount: 2, squad_role: minion}',
						'      - {name: B, max_stamina: 4, amount: 2, squad_role: minion}',
					].join('\n'),
				),
			),
		).toThrow("Squad 'Squad' can have only one minion creature type.");
		expect(() =>
			parseLikePipeline(squadYaml('      - {name: Cap, max_stamina: 40, amount: 1, squad_role: captain}')),
		).toThrow("Squad 'Squad' must have at least one minion creature.");
	});

	test('creature amount validation stays in parse (amount is never statblock-sourced)', () => {
		const yaml = 'heroes: []\nenemy_groups:\n  - name: G\n    creatures:\n      - {name: Orc, max_stamina: 10}';
		expect(() => parseLikePipeline(yaml)).toThrow(
			"Creature 'Orc' in group 'G' is missing or has an invalid 'amount' field.",
		);
	});

	test('pre-existing instance with a non-numeric id', () => {
		const yaml = [
			'heroes: []',
			'enemy_groups:',
			'  - name: G',
			'    creatures:',
			'      - name: Orc',
			'        max_stamina: 10',
			'        amount: 1',
			'        instances:',
			'          - id: first',
		].join('\n');
		expect(() => parseLikePipeline(yaml)).toThrow(
			"Instance at index 0 of creature 'Orc' in group 'G' is missing or has an invalid 'id' field.",
		);
	});

	test('non-numeric malice value', () => {
		expect(() => parseLikePipeline('heroes: []\nenemy_groups: []\nmalice:\n  value: very high')).toThrow(
			"Invalid data: 'malice.value' must be a number.",
		);
	});
});
