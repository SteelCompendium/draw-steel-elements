// D8 Task 4 (spec §2.5) — encounter element model: parse + byte-stable serialize.
// ds-encounter has NO legacy predecessor (unlike initiative/counter/negotiation), so
// there is no external byte-compat oracle to transcribe against — the contract is
// self-referential: parse only validates + fills two top-level defaults, never
// reorders/strips a key, so serialize(parse(x)) reproduces x's own bytes whenever x
// already has both `party` and `monsters` present (no defaults kick in to touch key
// order).
import { parseYaml } from '../../mocks/obsidian';
import { parse, serialize } from '../../../src/elements/encounter/model';
import type { EncounterModel } from '../../../src/elements/encounter/model';
import encounterExample from '../../../src/elements/encounter/example.yaml';

const parseLikePipeline = (source: string): EncounterModel => parse(parseYaml(source), source);

describe('D8 Task 4: encounter model parse', () => {
	test('parses the shipped example.yaml into real party/monsters data', () => {
		const model = parseLikePipeline(encounterExample);
		expect(model.party).toEqual({ hero_count: 4, hero_level: 3 });
		expect(model.monsters).toHaveLength(2);
		expect(model.monsters[0]).toEqual({
			code: 'scc.v1:mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker',
			count: 6,
			squad: 'minion',
		});
		expect(model.label).toBe('Ambush at the ford');
	});

	test('a blank block materializes empty party/monsters defaults rather than throwing', () => {
		const model = parseLikePipeline('label: Empty');
		expect(model.party).toEqual({});
		expect(model.monsters).toEqual([]);
	});

	test('rejects a non-list monsters field', () => {
		expect(() => parseLikePipeline('monsters: not-a-list')).toThrow(/monsters/i);
	});

	test('rejects a monster row missing code', () => {
		expect(() => parseLikePipeline('monsters:\n  - count: 3')).toThrow(/code/i);
	});

	test('rejects a monster row with a non-numeric count', () => {
		expect(() => parseLikePipeline('monsters:\n  - code: "scc.v1:x/y/z"\n    count: "six"')).toThrow(/count/i);
	});

	test('rejects an invalid squad value', () => {
		expect(() =>
			parseLikePipeline('monsters:\n  - code: "scc.v1:x/y/z"\n    count: 1\n    squad: leader'),
		).toThrow(/squad/i);
	});
});

describe('D8 Task 4: serialize is byte-stable', () => {
	test('parse -> serialize on the shipped example.yaml body reproduces it exactly', () => {
		expect(serialize(parseLikePipeline(encounterExample))).toBe(encounterExample.trim());
	});

	test('_dse_anchor and an unknown key survive the round-trip untouched', () => {
		const src = [
			'party:',
			'  hero_count: 4',
			'  hero_level: 3',
			'monsters:',
			'  - code: scc.v1:mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker',
			'    count: 6',
			'label: Ambush',
			'_dse_anchor: 8f3a1c',
			'future_field: kept-as-is',
		].join('\n');
		const out = serialize(parseLikePipeline(src));
		expect(out).toBe(src);
	});

	test('a present _computed cache round-trips (it is a stored cache, not recomputed by parse)', () => {
		const src = [
			'party:',
			'  hero_count: 4',
			'  hero_level: 3',
			'monsters:',
			'  - code: scc.v1:mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker',
			'    count: 6',
			'_computed:',
			'  spent_ev: 44',
			'  budget: 40',
			'  ratio: 1.1',
			'  band: hard',
			'  victories: 2',
		].join('\n');
		const model = parseLikePipeline(src);
		expect(model._computed).toEqual({ spent_ev: 44, budget: 40, ratio: 1.1, band: 'hard', victories: 2 });
		expect(serialize(model)).toBe(src);
	});

	test('output is trimmed (no trailing newline), matching every other persisted element', () => {
		const out = serialize(parseLikePipeline(encounterExample));
		expect(out).not.toMatch(/\n$/);
		expect(out).not.toMatch(/^\s/);
	});
});
