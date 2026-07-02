import { parseEncounterData } from '@drawSteelAdmonition/EncounterData';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App } from '../../mocks/obsidian';
import quickStart from '../../fixtures/initiative/quick-start.yaml';
import squad from '../../fixtures/initiative/squad.yaml';

const parse = (source: string) => parseEncounterData(source, new App() as any, DEFAULT_SETTINGS);

describe('T-1: parseEncounterData — happy path', () => {
	test('heroes get defaults: current_stamina→max, temp→0, turn=false, isHero, [] conditions', async () => {
		const data = await parse(quickStart);
		const frodo = data.heroes[0];
		expect(frodo.name).toBe('Frodo Baggins');
		expect(frodo.max_stamina).toBe(80);
		expect(frodo.current_stamina).toBe(80);
		expect(frodo.temp_stamina).toBe(0);
		expect(frodo.has_taken_turn).toBe(false);
		expect(frodo.isHero).toBe(true);
		expect(frodo.conditions).toEqual([]);
	});

	test('string and object conditions normalize to Condition objects', async () => {
		const data = await parse(squad);
		expect(data.heroes[0].conditions).toEqual([
			{ key: 'grabbed', color: undefined, effect: undefined },
			{ key: 'bleeding', color: 'crimson', effect: undefined },
		]);
	});

	test('creature instances auto-created with 1-based ids and full stamina', async () => {
		const data = await parse(quickStart);
		const orc = data.enemy_groups[0].creatures[0];
		expect(orc.isHero).toBe(false);
		expect(orc.instances).toHaveLength(4);
		expect(orc.instances!.map((i) => i.id)).toEqual([1, 2, 3, 4]);
		expect(orc.instances![0]).toMatchObject({ current_stamina: 40, temp_stamina: 0, conditions: [] });
		const troll = data.enemy_groups[0].creatures[1];
		expect(troll.instances).toHaveLength(1);
	});

	test('squad minion pool initializes to max_stamina × amount; minion instances carry no stamina', async () => {
		const data = await parse(squad);
		const group = data.enemy_groups[0];
		expect(group.is_squad).toBe(true);
		expect(group.minion_stamina_pool).toBe(20); // 4 stamina × 5 minions
		const minion = group.creatures[0];
		expect(minion.instances).toHaveLength(5);
		expect(minion.instances![0].current_stamina).toBeUndefined();
		expect(minion.instances![0].conditions).toEqual([]);
		const captain = group.creatures[1];
		expect(captain.instances![0].current_stamina).toBe(40);
	});

	test('missing malice defaults to { value: 0 }; provided malice is kept', async () => {
		expect((await parse(squad)).malice).toEqual({ value: 0 });
		expect((await parse(quickStart)).malice.value).toBe(5);
	});
});

describe('T-2: parseEncounterData — error surface (user-facing message contract)', () => {
	test('non-object input', async () => {
		await expect(parse('just a string')).rejects.toThrow('The input must be a YAML object.');
	});

	test('missing heroes', async () => {
		await expect(parse('enemy_groups: []')).rejects.toThrow(
			"Invalid data: 'heroes' field is missing or is not a list.",
		);
	});

	test('missing enemy_groups', async () => {
		await expect(parse('heroes: []')).rejects.toThrow(
			"Invalid data: 'enemy_groups' field is missing or is not a list.",
		);
	});

	test('hero missing name', async () => {
		await expect(parse('heroes:\n  - max_stamina: 10\nenemy_groups: []')).rejects.toThrow(
			"Hero at index 0 is missing the 'name' field.",
		);
	});

	test('hero missing max_stamina', async () => {
		await expect(parse('heroes:\n  - name: Frodo\nenemy_groups: []')).rejects.toThrow(
			"Hero 'Frodo' is missing or has an invalid 'max_stamina' field.",
		);
	});

	test('invalid condition shape', async () => {
		const yaml = [
			'heroes:',
			'  - name: Frodo',
			'    max_stamina: 10',
			'    conditions:',
			'      - 5',
			'enemy_groups: []',
		].join('\n');
		await expect(parse(yaml)).rejects.toThrow("Invalid condition format for hero 'Frodo'.");
	});

	const squadYaml = (creatures: string) =>
		['heroes: []', 'enemy_groups:', '  - name: Squad', '    is_squad: true', '    creatures:', creatures].join('\n');

	test('squad with more than two creatures', async () => {
		const creatures = [
			'      - {name: A, max_stamina: 4, amount: 1, squad_role: minion}',
			'      - {name: B, max_stamina: 4, amount: 1, squad_role: minion}',
			'      - {name: C, max_stamina: 40, amount: 1, squad_role: captain}',
		].join('\n');
		await expect(parse(squadYaml(creatures))).rejects.toThrow(
			"Squad 'Squad' can have at most two creatures (minions and an optional captain).",
		);
	});

	test('squad creature missing squad_role', async () => {
		const creatures = '      - {name: A, max_stamina: 4, amount: 1}';
		await expect(parse(squadYaml(creatures))).rejects.toThrow(
			"Creature 'A' in squad 'Squad' must have a 'squad_role' of 'minion' or 'captain'.",
		);
	});

	test('squad creature with invalid squad_role value', async () => {
		const creatures = '      - {name: A, max_stamina: 4, amount: 1, squad_role: boss}';
		await expect(parse(squadYaml(creatures))).rejects.toThrow(
			"Creature 'A' in squad 'Squad' has an invalid 'squad_role' value.",
		);
	});

	test('squad with two minion creature types', async () => {
		const creatures = [
			'      - {name: A, max_stamina: 4, amount: 2, squad_role: minion}',
			'      - {name: B, max_stamina: 4, amount: 2, squad_role: minion}',
		].join('\n');
		await expect(parse(squadYaml(creatures))).rejects.toThrow(
			"Squad 'Squad' can have only one minion creature type.",
		);
	});

	test('squad without any minions', async () => {
		const creatures = '      - {name: Cap, max_stamina: 40, amount: 1, squad_role: captain}';
		await expect(parse(squadYaml(creatures))).rejects.toThrow(
			"Squad 'Squad' must have at least one minion creature.",
		);
	});

	test('non-numeric malice value', async () => {
		const yaml = ['heroes: []', 'enemy_groups: []', 'malice:', '  value: very high'].join('\n');
		await expect(parse(yaml)).rejects.toThrow("Invalid data: 'malice.value' must be a number.");
	});
});
