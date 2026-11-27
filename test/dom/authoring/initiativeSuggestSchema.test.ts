// SC-707 — the ds-initiative suggestions-only schema (src/elements/initiative/suggest-schema.yaml, `authoring.suggestSchema`).
// Drift guard (owner ruling O3): every key the schema lists, at every level, must be a key the initiative code actually READS, so a key that
// is renamed or dropped in the model cannot stay in the autocomplete. "Reads" is measured, not listed by hand: a full block that writes every
// schema key goes through parse, the reference stage and Advance round with every object wrapped in a recording Proxy, and the schema's keys
// at each level must be a subset of the keys read at that level.
import { parseYaml } from '../../mocks/obsidian';
import suggestSchemaYaml from '../../../src/elements/initiative/suggest-schema.yaml';
import { initiativeElement } from '../../../src/elements/initiative/definition';
import { advanceRound, parse } from '../../../src/elements/initiative/model';
import { resolveInitiativeRefs } from '../../../src/elements/initiative/resolveRefs';
import type { ReferenceService } from '../../../src/framework/seams/refs';

type Level = 'top' | 'hero' | 'group' | 'creature' | 'malice';
interface Node {
	properties?: Record<string, Node>;
	items?: Node;
}
const schema = parseYaml(suggestSchemaYaml) as Node;

/** The keys the schema lists at each level, plus the path of every node that lists keys at all (to catch a level this test does not know). */
function schemaKeys(): { keys: Record<Level, string[]>; keyedPaths: string[] } {
	const keyedPaths: string[] = [];
	const walk = (node: Node | undefined, path: string): string[] => {
		if (!node) return [];
		if (node.properties) {
			keyedPaths.push(path);
			for (const [key, child] of Object.entries(node.properties)) walk(child, `${path}/${key}`);
		}
		if (node.items) walk(node.items, `${path}[]`);
		return Object.keys(node.properties ?? {});
	};
	walk(schema, '');
	const at = (node: Node | undefined): string[] => Object.keys(node?.properties ?? {});
	const heroes = schema.properties!.heroes.items;
	const groups = schema.properties!.enemy_groups.items;
	return {
		keys: {
			top: at(schema),
			hero: at(heroes),
			group: at(groups),
			creature: at(groups?.properties!.creatures.items),
			malice: at(schema.properties!.malice),
		},
		keyedPaths,
	};
}

/** One block that writes every key the schema lists: a squad group (minion + captain, so the captain / squad keys are exercised) and a plain group. */
const FULL_BLOCK = `
name: The Ford
round: 2
heroes:
  - name: Aragorn
    max_stamina: 120
    statblock: Aragorn
    current_stamina: 100
    temp_stamina: 5
    image: images/aragorn.png
    conditions: [grabbed]
enemy_groups:
  - name: Goblin Squad
    is_squad: true
    creatures:
      - name: Goblin
        max_stamina: 4
        amount: 5
        statblock: Goblin
        image: images/goblin.png
        squad_role: minion
        with_captain_stamina: 3
      - name: Goblin Captain
        max_stamina: 40
        amount: 1
        squad_role: captain
        captain_of: Goblin
malice:
  value: 5
  round_gain: 2
`;

/** Wraps `value` so every string key read on an object, at a known level, is recorded. */
function recording(value: unknown, level: Level, seen: Record<Level, Set<string>>): unknown {
	if (typeof value !== 'object' || value === null) return value;
	const childLevel: Record<string, Level> = { heroes: 'hero', enemy_groups: 'group', creatures: 'creature', malice: 'malice' };
	const wrap = (target: object, lvl: Level, listOf: Level | null): object =>
		new Proxy(target, {
			get(t, prop, receiver) {
				const got = Reflect.get(t, prop, receiver) as unknown;
				if (Array.isArray(t)) return typeof prop === 'string' && /^\d+$/.test(prop) && listOf ? recording(got, listOf, seen) : got;
				if (typeof prop === 'string') {
					seen[lvl].add(prop);
					const next = childLevel[prop];
					if (next && typeof got === 'object' && got !== null) return Array.isArray(got) ? wrap(got, lvl, next) : wrap(got, next, null);
				}
				return got;
			},
		});
	return wrap(value, level, null);
}

describe('SC-707 — the ds-initiative suggestions schema stays inside what the parser reads', () => {
	const { keys, keyedPaths } = schemaKeys();

	test('the schema lists keys at exactly the five known levels (a new nested level needs a place in this test)', () => {
		expect(keyedPaths.sort()).toEqual(['', '/enemy_groups[]', '/enemy_groups[]/creatures[]', '/heroes[]', '/malice'].sort());
	});

	test('the sample block writes every key the schema lists, so nothing in the schema escapes the read check', () => {
		const data = parseYaml(FULL_BLOCK) as Record<string, any>;
		const written: Record<Level, Set<string>> = {
			top: new Set(Object.keys(data)),
			hero: new Set(Object.keys(data.heroes[0])),
			group: new Set(Object.keys(data.enemy_groups[0])),
			creature: new Set(data.enemy_groups[0].creatures.flatMap((c: object) => Object.keys(c))),
			malice: new Set(Object.keys(data.malice)),
		};
		for (const level of Object.keys(keys) as Level[]) expect([level, keys[level].filter((k) => !written[level].has(k))]).toEqual([level, []]);
	});

	test('every key in the schema, at every level, is a key parse / resolveRefs / Advance round reads', async () => {
		const seen: Record<Level, Set<string>> = { top: new Set(), hero: new Set(), group: new Set(), creature: new Set(), malice: new Set() };
		const traced = recording(parseYaml(FULL_BLOCK), 'top', seen);
		const model = parse(traced, FULL_BLOCK);
		const refs = {
			resolveBarePath: async () => ({ data: { name: 'N', stamina: 5, image: 'i.png', with_captain: '+2 bonus to Stamina' } }),
			resolve: async () => ({ data: {} }),
		} as unknown as ReferenceService;
		await resolveInitiativeRefs(model, refs);
		advanceRound(model);
		for (const level of Object.keys(keys) as Level[]) expect([level, keys[level].filter((k) => !seen[level].has(k))]).toEqual([level, []]);
	});

	test('the tracker-written keys are not offered (turn flags, action checklists, pool bookkeeping, instances, the malice log)', () => {
		const offered = Object.values(keys).flat();
		for (const managed of ['has_taken_turn', 'actions', 'isHero', 'instances', 'minion_stamina_pool', 'minion_stamina_pool_max', 'captain_bonus_active', 'captain_bonus_n', 'selectedInstanceKey', 'log', 'with_captain', 'isDead']) {
			expect(offered).not.toContain(managed);
		}
	});

	test('the definition keeps NO def.schema (validation is unchanged) and carries the suggestions schema in the authoring slot', () => {
		expect(initiativeElement.schema).toBeUndefined();
		expect(initiativeElement.authoring?.suggestSchema).toBe(suggestSchemaYaml);
	});
});
