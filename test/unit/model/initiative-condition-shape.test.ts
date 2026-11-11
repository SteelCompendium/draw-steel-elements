// The shape of a condition entry survives a write. A condition the user typed as a plain name (`- grabbed`)
// is written back as a plain name; the parse-time normalisation to `{key}` is an in-memory detail, not
// something that may leak into the note (SC-466 rule: a write changes only what the action touched).
// Rule under test: each holder (hero, squad-minion instance, regular instance) remembers which condition keys
// were written as plain strings; serialize writes an entry back as a string when its key is remembered AND
// it still carries nothing but `key`. Everything else is written as before. Authored objects keep their
// unknown keys and key order.
import { parseYaml } from '../../mocks/obsidian';
import type { Condition, EncounterData } from '@drawSteelAdmonition/EncounterData';
import { parse, serialize } from '../../../src/elements/initiative/model';

const parseLikePipeline = (source: string): EncounterData => parse(parseYaml(source), source);

const SOURCE = [
	'heroes:',
	'  - name: Ash',
	'    max_stamina: 30',
	'    conditions:',
	'      - slowed',
	'      - dazed',
	'      - key: hexed',
	'enemy_groups:',
	'  - name: Goblins',
	'    is_squad: true',
	'    creatures:',
	'      - name: Goblin Minion',
	'        amount: 3',
	'        max_stamina: 5',
	'        squad_role: minion',
	'        instances:',
	'          - id: 1',
	'            conditions:',
	'              - grabbed',
	'              - prone',
	'              - bleeding',
	'          - id: 2',
	'            conditions:',
	'              - grabbed',
	'              - grabbed',
	'          - id: 3',
	'  - name: Ogre',
	'    creatures:',
	'      - name: Ogre Brute',
	'        amount: 1',
	'        max_stamina: 40',
	'        instances:',
	'          - id: 1',
	'            current_stamina: 40',
	'            conditions:',
	'              - restrained',
	'              - my-custom-thing',
	'malice:',
	'  value: 0',
].join('\n');

const hero = (m: EncounterData) => m.heroes[0];
const minion = (m: EncounterData, i: number) => m.enemy_groups[0].creatures[0].instances![i];
const ogre = (m: EncounterData) => m.enemy_groups[1].creatures[0].instances![0];

/** The conditions arrays as they sit in the written block, holder by holder. */
function written(out: string): { hero: unknown; m1: unknown; m2: unknown; ogre: unknown } {
	const data = parseYaml(out) as any;
	const squad = data.enemy_groups[0].creatures[0].instances;
	return {
		hero: data.heroes[0].conditions,
		m1: squad[0].conditions,
		m2: squad[1].conditions,
		ogre: data.enemy_groups[1].creatures[0].instances[0].conditions,
	};
}

/** What the Conditions modal does when it opens (ConditionsModal.ts:130) and hands back (view.ts:2177). */
const modalClones = (conditions: (string | Condition)[]): Condition[] =>
	conditions.map((entry) => (typeof entry === 'string' ? { key: entry } : { ...entry }));

describe('plain-string conditions stay plain strings on write', () => {
	test('a write that changes nothing leaves every holder\'s condition list as written', () => {
		const out = serialize(parseLikePipeline(SOURCE));
		expect(written(out)).toEqual({
			hero: ['slowed', 'dazed', { key: 'hexed' }],
			m1: ['grabbed', 'prone', 'bleeding'],
			m2: ['grabbed', 'grabbed'],
			ogre: ['restrained', 'my-custom-thing'],
		});
		expect(out).toContain('- slowed\n');
		expect(out).not.toContain('key: slowed');
		expect(out).not.toContain('key: grabbed');
		expect(out).not.toContain('key: restrained');
	});

	test('removing one condition from a squad minion (the pool modal\'s position filter) changes only that line', () => {
		const model = parseLikePipeline(SOURCE);
		const before = serialize(model);
		const inst = minion(model, 0);
		inst.conditions = inst.conditions.filter((_, i) => i !== 1); // MinionStaminaPoolModal.ts:674
		const after = serialize(model);
		expect(written(after).m1).toEqual(['grabbed', 'bleeding']);
		expect(before.split('\n').filter((l) => !after.split('\n').includes(l))).toEqual(['          - prone']);
		expect(after.split('\n').filter((l) => !before.split('\n').includes(l))).toEqual([]);
	});

	test('removing a hero\'s and a regular instance\'s condition leaves their siblings as strings', () => {
		const model = parseLikePipeline(SOURCE);
		hero(model).conditions = hero(model).conditions.filter((_, i) => i !== 0);
		ogre(model).conditions = ogre(model).conditions.filter((_, i) => i !== 1);
		const w = written(serialize(model));
		expect(w.hero).toEqual(['dazed', { key: 'hexed' }]);
		expect(w.ogre).toEqual(['restrained']);
	});

	test('an unrelated write (turn toggle, damage) changes no condition\'s shape', () => {
		const model = parseLikePipeline(SOURCE);
		model.enemy_groups[0].has_taken_turn = true;
		hero(model).current_stamina = 12;
		ogre(model).current_stamina = 3;
		const w = written(serialize(model));
		expect(w.hero).toEqual(['slowed', 'dazed', { key: 'hexed' }]);
		expect(w.m1).toEqual(['grabbed', 'prone', 'bleeding']);
		expect(w.ogre).toEqual(['restrained', 'my-custom-thing']);
	});

	test('a re-parse of the written block records the strings afresh, so the next write keeps them', () => {
		const model = parseLikePipeline(SOURCE);
		const inst = minion(model, 0);
		inst.conditions = inst.conditions.filter((_, i) => i !== 0);
		const first = serialize(model);
		const reparsed = parseLikePipeline(first);
		expect(serialize(reparsed)).toBe(first);
		minion(reparsed, 0).conditions = minion(reparsed, 0).conditions.filter((_, i) => i !== 0);
		expect(written(serialize(reparsed)).m1).toEqual(['bleeding']);
	});

	test('the Conditions modal re-cloning every entry does not change the strings it did not touch', () => {
		const model = parseLikePipeline(SOURCE);
		const inst = minion(model, 0);
		inst.conditions = modalClones(inst.conditions); // open + close with no edit
		expect(written(serialize(model)).m1).toEqual(['grabbed', 'prone', 'bleeding']);
	});
});

describe('when a string-born condition gains data, it becomes an object', () => {
	test('a colour set through the Conditions modal turns that entry into an object; the others stay strings', () => {
		const model = parseLikePipeline(SOURCE);
		const inst = minion(model, 0);
		const clones = modalClones(inst.conditions);
		clones[1].color = '#ff0000';
		inst.conditions = clones;
		expect(written(serialize(model)).m1).toEqual(['grabbed', { key: 'prone', color: '#ff0000' }, 'bleeding']);
	});

	test.each([
		['icon', 'skull'],
		['effect', 'pulse'],
		['duration', 'save-ends'],
	] as const)('a %s makes it an object', (field, value) => {
		const model = parseLikePipeline(SOURCE);
		const clones = modalClones(hero(model).conditions);
		(clones[0] as any)[field] = value;
		hero(model).conditions = clones;
		expect(written(serialize(model)).hero).toEqual([{ key: 'slowed', [field]: value }, 'dazed', { key: 'hexed' }]);
	});

	test('present-but-undefined fields count as absent (a cleared colour goes back to a string)', () => {
		const model = parseLikePipeline(SOURCE);
		const clones = modalClones(hero(model).conditions);
		clones[1].color = '#ff0000';
		clones[1].color = undefined; // the modal clears a field by assigning undefined (ConditionsModal.ts:449, :531)
		clones[1].duration = undefined;
		hero(model).conditions = clones;
		expect(written(serialize(model)).hero).toEqual(['slowed', 'dazed', { key: 'hexed' }]);
	});
});

describe('everything the plugin or the user wrote as an object stays an object', () => {
	test('a condition the plugin adds is written as `- key: x`, even next to strings', () => {
		const model = parseLikePipeline(SOURCE);
		const inst = minion(model, 0);
		inst.conditions = [...modalClones(inst.conditions), { key: 'stunned' }];
		const out = serialize(model);
		expect(written(out).m1).toEqual(['grabbed', 'prone', 'bleeding', { key: 'stunned' }]);
		expect(out).toContain('- key: stunned');
	});

	test('an object the user wrote as `- key: hexed` stays an object through a no-op, a removal and a modal clone', () => {
		const model = parseLikePipeline(SOURCE);
		expect(written(serialize(model)).hero).toEqual(['slowed', 'dazed', { key: 'hexed' }]);
		hero(model).conditions = modalClones(hero(model).conditions).filter((_, i) => i !== 0);
		expect(written(serialize(model)).hero).toEqual(['dazed', { key: 'hexed' }]);
		expect(serialize(model)).toContain('- key: hexed');
	});

	test('a plugin-built holder (never parsed from a source) writes its conditions as objects, as before', () => {
		const model = parseLikePipeline(SOURCE);
		model.heroes.push({
			name: 'New',
			max_stamina: 10,
			current_stamina: 10,
			temp_stamina: 0,
			has_taken_turn: false,
			isHero: true,
			conditions: [{ key: 'slowed' }],
		} as any);
		const out = parseYaml(serialize(model)) as any;
		expect(out.heroes[1].conditions).toEqual([{ key: 'slowed' }]);
	});

	test('a key written both as a string and as an object in one holder keeps each entry\'s own shape', () => {
		const src = [
			'heroes:',
			'  - name: Ash',
			'    max_stamina: 30',
			'    conditions:',
			'      - prone',
			'      - key: prone',
			'      - dazed',
			'enemy_groups: []',
		].join('\n');
		const model = parseLikePipeline(src);
		expect((parseYaml(serialize(model)) as any).heroes[0].conditions).toEqual(['prone', { key: 'prone' }, 'dazed']);
		// the pool modal's removal keeps the entry objects, so each survivor keeps its shape
		hero(model).conditions = hero(model).conditions.filter((_, i) => i !== 0);
		expect((parseYaml(serialize(model)) as any).heroes[0].conditions).toEqual([{ key: 'prone' }, 'dazed']);
	});
});

describe('duplicates', () => {
	test('two identical strings both stay strings, and removing one leaves the other a string', () => {
		const model = parseLikePipeline(SOURCE);
		expect(written(serialize(model)).m2).toEqual(['grabbed', 'grabbed']);
		const inst = minion(model, 1);
		inst.conditions = inst.conditions.filter((_, i) => i !== 0);
		expect(written(serialize(model)).m2).toEqual(['grabbed']);
	});
});

describe('authored condition objects keep what the user wrote', () => {
	const src = [
		'heroes:',
		'  - name: Ash',
		'    max_stamina: 30',
		'    conditions:',
		'      - color: blue',
		'        key: taunted',
		'        effect: pulse',
		'        source: trap',
		'      - key: bleeding',
		'        note: 3 rounds',
		'enemy_groups: []',
	].join('\n');

	test('unknown keys survive a write, in the order the user wrote them', () => {
		const out = serialize(parseLikePipeline(src));
		expect((parseYaml(out) as any).heroes[0].conditions).toEqual([
			{ color: 'blue', key: 'taunted', effect: 'pulse', source: 'trap' },
			{ key: 'bleeding', note: '3 rounds' },
		]);
		expect(out).toContain('- color: blue\n        key: taunted\n        effect: pulse\n        source: trap');
	});

	test('an authored object that carries only an unknown key is not mistaken for a plain string', () => {
		const model = parseLikePipeline(src);
		hero(model).conditions = modalClones(hero(model).conditions);
		expect((parseYaml(serialize(model)) as any).heroes[0].conditions[1]).toEqual({ key: 'bleeding', note: '3 rounds' });
	});

	test('an unknown key on a string-born entry makes it an object too', () => {
		const model = parseLikePipeline(SOURCE);
		const clones = modalClones(hero(model).conditions);
		(clones[0] as any).source = 'trap';
		hero(model).conditions = clones;
		expect(written(serialize(model)).hero).toEqual([{ key: 'slowed', source: 'trap' }, 'dazed', { key: 'hexed' }]);
	});
});

describe('holders that never wrote conditions', () => {
	test('stay without a `conditions` key, and a condition added later is an object', () => {
		const model = parseLikePipeline(SOURCE);
		const bare = minion(model, 2);
		expect((parseYaml(serialize(model)) as any).enemy_groups[0].creatures[0].instances[2].conditions).toBeUndefined();
		bare.conditions = [{ key: 'grabbed' }];
		expect((parseYaml(serialize(model)) as any).enemy_groups[0].creatures[0].instances[2].conditions).toEqual([{ key: 'grabbed' }]);
	});
});
