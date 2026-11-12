// SC-600: hand-editing a creature's `amount` keeps the instances it can. Before, ANY mismatch between
// `amount` and `instances.length` replaced the whole list (ids 1..amount, no conditions, full stamina), so
// growing a group of 3 to 4 reset every creature's conditions and stamina on the next save. Now: grow
// appends fresh instances at the END, shrink drops from the END, kept instances are validated as ever.
// A squad's shared stamina pool is not touched by this change.
import { parseYaml, App } from '../../mocks/obsidian';
import { parseEncounterData } from '@drawSteelAdmonition/EncounterData';
import type { CreatureInstance, EncounterData } from '@drawSteelAdmonition/EncounterData';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { parse, serialize } from '../../../src/elements/initiative/model';

const parseLike = (source: string): EncounterData => parse(parseYaml(source), source);
const legacy = (source: string): Promise<EncounterData> =>
	parseEncounterData(source, new App() as any, DEFAULT_SETTINGS);

/** Wolf pack: instance 1 bleeding at 7, instance 2 dazed (save ends) at 5 with temp 3, instance 3 untouched. */
const wolfBlock = (amount: number, instances: string[] = defaultWolfInstances): string =>
	[
		'heroes: []',
		'enemy_groups:',
		'  - name: Pack',
		'    creatures:',
		'      - name: Wolf',
		'        max_stamina: 20',
		`        amount: ${amount}`,
		'        instances:',
		...instances,
		'malice:',
		'  value: 0',
	].join('\n');

const defaultWolfInstances = [
	'          - id: 1',
	'            current_stamina: 7',
	'            temp_stamina: 0',
	'            conditions:',
	'              - bleeding',
	'          - id: 2',
	'            current_stamina: 5',
	'            temp_stamina: 3',
	'            conditions:',
	'              - key: dazed',
	'                duration: save-ends',
	'          - id: 3',
	'            current_stamina: 20',
	'            temp_stamina: 0',
	'            conditions: []',
];

/** The keys of an instance's conditions (parse turns plain names into `{ key }` objects). */
const keysOf = (instance: CreatureInstance) => (instance.conditions ?? []).map((c) => (typeof c === 'string' ? c : c.key));
const wolfOf = (model: EncounterData) => model.enemy_groups[0].creatures[0];
const idsOf = (model: EncounterData) => wolfOf(model).instances!.map((i) => i.id);

/** Squad: 3 minions (conditions only), a captain, a minion pool on the group. */
const squadBlock = (minionAmount: number, minionInstances: string[], captainAmount = 1, captainInstances: string[] = []) =>
	[
		'heroes: []',
		'enemy_groups:',
		'  - name: Squad',
		'    is_squad: true',
		'    minion_stamina_pool: 7',
		'    creatures:',
		'      - name: Goblin',
		'        max_stamina: 4',
		`        amount: ${minionAmount}`,
		'        squad_role: minion',
		...(minionInstances.length ? ['        instances:', ...minionInstances] : []),
		'      - name: Captain',
		'        max_stamina: 40',
		`        amount: ${captainAmount}`,
		'        squad_role: captain',
		...(captainInstances.length ? ['        instances:', ...captainInstances] : []),
		'malice:',
		'  value: 0',
	].join('\n');

const minionInstances = [
	'          - id: 1',
	'            conditions:',
	'              - grabbed',
	'          - id: 2',
	'            conditions:',
	'              - key: slowed',
	'                duration: eot',
	'          - id: 3',
	'            conditions: []',
];

describe('SC-600: regular creatures — amount edited, instances kept', () => {
	test('grow 3 -> 4: kept instances keep conditions and stamina; the new one is fresh, appended at the end', () => {
		const wolf = wolfOf(parseLike(wolfBlock(4)));
		expect(wolf.instances).toHaveLength(4);
		expect(wolf.instances![0]).toMatchObject({ id: 1, current_stamina: 7, temp_stamina: 0 });
		expect(keysOf(wolf.instances![0])).toEqual(['bleeding']);
		expect(wolf.instances![1]).toMatchObject({ id: 2, current_stamina: 5, temp_stamina: 3 });
		expect(wolf.instances![1].conditions).toMatchObject([{ key: 'dazed', duration: 'save-ends' }]);
		expect(wolf.instances![3]).toEqual({ id: 4, current_stamina: 20, temp_stamina: 0, conditions: [] });
		// Same key order as today's fresh path (key insertion order is the YAML order).
		expect(Object.keys(wolf.instances![3])).toEqual(['id', 'current_stamina', 'temp_stamina', 'conditions']);
	});

	test('shrink 3 -> 2: the first two keep their state, the last is gone', () => {
		const wolf = wolfOf(parseLike(wolfBlock(2)));
		expect(wolf.instances!.map((i) => i.id)).toEqual([1, 2]);
		expect(wolf.instances![0]).toMatchObject({ current_stamina: 7 });
		expect(keysOf(wolf.instances![0])).toEqual(['bleeding']);
		expect(wolf.instances![1]).toMatchObject({ current_stamina: 5, temp_stamina: 3 });
	});

	test('non-sequential ids: 1,3 grown to 3 gives 1,3,4 (max + 1, never reuse); 1,3,4 shrunk to 2 gives 1,3', () => {
		const sparse = ['          - id: 1', '            current_stamina: 9', '          - id: 3', '            current_stamina: 8'];
		const grown = parseLike(wolfBlock(3, sparse));
		expect(idsOf(grown)).toEqual([1, 3, 4]);
		expect(wolfOf(grown).instances![1].current_stamina).toBe(8);
		expect(wolfOf(grown).instances![2]).toEqual({ id: 4, current_stamina: 20, temp_stamina: 0, conditions: [] });
		const grownTwice = parseLike(wolfBlock(5, sparse));
		expect(idsOf(grownTwice)).toEqual([1, 3, 4, 5, 6]);
		const trio = [...sparse, '          - id: 4', '            current_stamina: 6'];
		expect(idsOf(parseLike(wolfBlock(2, trio)))).toEqual([1, 3]);
		// A removed id below the maximum is not handed out again.
		expect(idsOf(parseLike(wolfBlock(3, ['          - id: 2', '          - id: 5'])))).toEqual([2, 5, 6]);
	});

	test('amount 0 with existing instances gives an empty list', () => {
		expect(wolfOf(parseLike(wolfBlock(0))).instances).toEqual([]);
	});

	test('instances missing: a fresh list, deep-equal to the legacy materialization (unchanged)', async () => {
		const src = ['heroes: []', 'enemy_groups:', '  - name: Pack', '    creatures:', '      - name: Wolf', '        max_stamina: 20', '        amount: 3'].join('\n');
		const model = parseLike(src);
		expect(idsOf(model)).toEqual([1, 2, 3]);
		expect(wolfOf(model).instances![2]).toEqual({ id: 3, current_stamina: 20, temp_stamina: 0, conditions: [] });
		expect(model).toEqual(await legacy(src));
		expect(serialize(model)).toBe(serialize(parseLike(src))); // and writes nothing it was not given
		expect(parseYaml(serialize(model))).toEqual(parseYaml(src));
	});

	test('instances the right length: unchanged (deep-equal to the legacy materialization)', async () => {
		expect(parseLike(wolfBlock(3))).toEqual(await legacy(wolfBlock(3)));
	});

	test('a captain (regular path inside a squad) grows and shrinks the same way', () => {
		const cap = ['          - id: 1', '            current_stamina: 12', '            conditions:', '              - weakened'];
		const grown = parseLike(squadBlock(3, minionInstances, 2, cap)).enemy_groups[0].creatures[1];
		expect(grown.instances!.map((i) => i.id)).toEqual([1, 2]);
		expect(grown.instances![0]).toMatchObject({ current_stamina: 12 });
		expect(keysOf(grown.instances![0])).toEqual(['weakened']);
		expect(grown.instances![1]).toEqual({ id: 2, current_stamina: 40, temp_stamina: 0, conditions: [] });
		const two = [...cap, '          - id: 2', '            current_stamina: 3'];
		const shrunk = parseLike(squadBlock(3, minionInstances, 1, two)).enemy_groups[0].creatures[1];
		expect(shrunk.instances!.map((i) => i.id)).toEqual([1]);
		expect(shrunk.instances![0]).toMatchObject({ current_stamina: 12 });
	});
});

describe('SC-600: squad minions — conditions kept per minion, the shared pool untouched', () => {
	const minionsOf = (model: EncounterData) => model.enemy_groups[0].creatures[0];

	test('grow 3 -> 5: kept minions keep conditions; new ones are { id, conditions: [] } appended at the end', () => {
		const minions = minionsOf(parseLike(squadBlock(5, minionInstances))).instances!;
		expect(minions.map((i) => i.id)).toEqual([1, 2, 3, 4, 5]);
		expect(keysOf(minions[0])).toEqual(['grabbed']);
		expect(minions[1].conditions).toMatchObject([{ key: 'slowed', duration: 'eot' }]);
		expect(minions[4]).toEqual({ id: 5, conditions: [] });
		expect(Object.keys(minions[4])).toEqual(['id', 'conditions']);
	});

	test('shrink 3 -> 2: the first two keep their conditions, the last is gone', () => {
		const minions = minionsOf(parseLike(squadBlock(2, minionInstances))).instances!;
		expect(minions.map((i) => i.id)).toEqual([1, 2]);
		expect(keysOf(minions[0])).toEqual(['grabbed']);
		expect(minions[1].conditions).toMatchObject([{ key: 'slowed' }]);
	});

	test('non-sequential minion ids: 1,3 grown to 3 gives 1,3,4', () => {
		const sparse = ['          - id: 1', '          - id: 3'];
		expect(minionsOf(parseLike(squadBlock(3, sparse))).instances!.map((i) => i.id)).toEqual([1, 3, 4]);
	});

	test('the shared pool is not re-initialized or rescaled by a grow or a shrink', () => {
		for (const amount of [1, 3, 8]) {
			const group = parseLike(squadBlock(amount, minionInstances)).enemy_groups[0];
			expect(group.minion_stamina_pool).toBe(7);
			expect(serialize(parseLike(squadBlock(amount, minionInstances)))).toContain('minion_stamina_pool: 7');
		}
	});
});

describe('SC-600: validation order — trim first, then validate the kept', () => {
	test('a malformed entry beyond the new amount is trimmed without throwing (regular and minion)', () => {
		const bad = [...defaultWolfInstances.slice(0, 4), '          - id: not-a-number'];
		expect(() => parseLike(wolfBlock(1, bad))).not.toThrow();
		expect(idsOf(parseLike(wolfBlock(1, bad)))).toEqual([1]);
		const badMinion = ['          - id: 1', '          - id: oops', '          - id: 3', '            conditions: 5'];
		expect(() => parseLike(squadBlock(1, badMinion))).not.toThrow();
	});

	test('a malformed kept entry still throws as today, also while growing or shrinking', () => {
		const bad = ['          - id: 1', '          - id: not-a-number'];
		const msg = "Instance at index 1 of creature 'Wolf' in group 'Pack' is missing or has an invalid 'id' field.";
		expect(() => parseLike(wolfBlock(2, bad))).toThrow(msg);
		expect(() => parseLike(wolfBlock(4, bad))).toThrow(msg);
		expect(() => parseLike(wolfBlock(3, bad.slice(0, 1).concat(['          - id: 2', '          - id: x'])))).toThrow(/index 2/);
		const badCondition = ['          - id: 1', '            conditions:', '              - 42'];
		expect(() => parseLike(wolfBlock(3, badCondition))).toThrow("Invalid condition format for instance '1' of creature 'Wolf'.");
	});
});

describe('SC-600: a non-finite amount is an invalid amount (it used to hang the instance loop)', () => {
	const msg = "Creature 'Wolf' in group 'Pack' is missing or has an invalid 'amount' field.";

	test.each(['.inf', '-.inf', '.nan'])('YAML amount: %s throws the existing invalid-amount error', (literal) => {
		const src = wolfBlock(3).replace('amount: 3', `amount: ${literal}`);
		expect(() => parseLike(src)).toThrow(msg);
	});

	test.each([Infinity, -Infinity, NaN])('a parsed object with amount %s throws the same error', (amount) => {
		const input = parseYaml(wolfBlock(3));
		input.enemy_groups[0].creatures[0].amount = amount;
		expect(() => parse(input, '')).toThrow(msg);
	});

	test('finite amounts behave as before: fractional rounds up, negative gives no instances', () => {
		expect(idsOf(parseLike(wolfBlock(2.5)))).toEqual([1, 2, 3]);
		expect(wolfOf(parseLike(wolfBlock(-1))).instances).toEqual([]);
	});
});

describe('SC-600: integrity — what a hand edit of one group writes back', () => {
	const twoGroups = (alphaAmount: number, alphaInstances: string[]): string =>
		[
			'heroes: []',
			'enemy_groups:',
			'  - name: Alpha',
			'    creatures:',
			'      - name: Wolf',
			'        max_stamina: 20',
			`        amount: ${alphaAmount}`,
			'        instances:',
			...alphaInstances,
			'  - name: Beta',
			'    creatures:',
			'      - name: Ogre',
			'        max_stamina: 60',
			'        amount: 2',
			'        instances:',
			'          - id: 1',
			'            current_stamina: 11',
			'            temp_stamina: 0',
			'            conditions:',
			'              - key: dazed',
			'                duration: save-ends',
			'              - bleeding',
			'          - id: 2',
			'            current_stamina: 60',
			'            temp_stamina: 0',
			'            conditions: []',
			'malice:',
			'  value: 4',
		].join('\n');

	const betaBytes = (text: string): string => text.slice(text.indexOf('  - name: Beta'), text.indexOf('\nmalice:'));

	test.each([
		['grown 3 -> 4', 4],
		['shrunk 3 -> 2', 2],
	])('%s: the other group is byte-identical; the edited group keeps its conditions (plain names stay plain) and stamina', (_label, amount) => {
		// The note as the plugin last wrote it, then a hand edit of Alpha's `amount` only.
		const written = serialize(parseLike(twoGroups(3, defaultWolfInstances)));
		const edited = written.replace('amount: 3', `amount: ${amount}`);
		expect(edited).not.toBe(written);
		const after = serialize(parseLike(edited));

		expect(betaBytes(after)).toBe(betaBytes(written));
		expect(after.slice(after.indexOf('\nmalice:'))).toBe(written.slice(written.indexOf('\nmalice:')));

		const wolf = parseYaml(after).enemy_groups[0].creatures[0];
		expect(wolf.amount).toBe(amount);
		expect(wolf.instances).toHaveLength(amount);
		expect(wolf.instances[0]).toMatchObject({ id: 1, current_stamina: 7 });
		expect(wolf.instances[0].conditions).toEqual(['bleeding']); // SC-592: a plain name is still a plain name
		expect(wolf.instances[1]).toMatchObject({ id: 2, current_stamina: 5, temp_stamina: 3 });
		expect(wolf.instances[1].conditions).toEqual([{ key: 'dazed', duration: 'save-ends' }]);
		if (amount === 4) expect(wolf.instances[3]).toEqual({ id: 4, current_stamina: 20, temp_stamina: 0, conditions: [] });
		// Everything above Alpha's instances is as written.
		expect(after.slice(0, after.indexOf('        instances:'))).toBe(
			written.slice(0, written.indexOf('        instances:')).replace('amount: 3', `amount: ${amount}`),
		);
		// A second pass changes nothing (the edited block is a fixed point).
		expect(serialize(parseLike(after))).toBe(after);
	});
});
