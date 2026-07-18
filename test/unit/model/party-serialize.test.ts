// D8 Task 8 (spec §6.2) — party element model: parse + byte-stable serialize. ds-party has
// NO legacy predecessor, so there is no external byte-compat oracle to transcribe against
// — the contract is self-referential (encounter/model.ts's convention, not
// montage/project's fixed-key-order rebuild): parse only validates + fills ONE top-level
// default (`members: []`), never reorders/strips a key, so serialize(parse(x)) reproduces
// x's own bytes whenever x already has `members` present.
import { parseYaml } from '../../mocks/obsidian';
import { parse, serialize, followerCount, echelonForLevel, WEALTH_MIN, WEALTH_MAX } from '../../../src/elements/party/model';
import type { PartyModel } from '../../../src/elements/party/model';
import partyExample from '../../../src/elements/party/example.yaml';

const parseLikePipeline = (source: string): PartyModel => parse(parseYaml(source), source);

describe('D8 Task 8: party model parse (spec §6.2 schema)', () => {
	test('parses the shipped example.yaml into real member/party data', () => {
		const model = parseLikePipeline(partyExample);
		expect(model.members).toHaveLength(2);
		expect(model.members[0]).toEqual({
			name: 'Kira',
			level: 3,
			class: 'Shadow',
			ancestry: 'Wode Elf',
			victories: 1,
			xp: 24,
			renown: 3,
			wealth: 1,
			hero_ref: '[[Kira]]',
		});
		expect(model.party).toEqual({ hero_tokens: 2 });
		expect(model._dse_anchor).toBe('a01b22');
	});

	test('a member missing optional fields keeps them OMITTED — never invented on parse', () => {
		const model = parseLikePipeline(partyExample);
		const doran = model.members[1];
		expect(doran.name).toBe('Doran');
		expect(doran.xp).toBeUndefined();
		expect(doran.hero_ref).toBeUndefined();
	});

	test('a blank block materializes an empty members[] default rather than throwing', () => {
		const model = parseLikePipeline('_dse_anchor: abc123');
		expect(model.members).toEqual([]);
		expect(model.party).toBeUndefined();
	});

	test('rejects a non-list members field', () => {
		expect(() => parseLikePipeline('members: not-a-list')).toThrow(/members/i);
	});

	test('rejects a member row missing name', () => {
		expect(() => parseLikePipeline('members:\n  - level: 3')).toThrow(/name/i);
	});

	test('rejects a member row with a blank name', () => {
		expect(() => parseLikePipeline('members:\n  - name: "  "')).toThrow(/name/i);
	});

	test('rejects a non-object party field', () => {
		expect(() => parseLikePipeline('party: not-an-object')).toThrow(/party/i);
	});
});

describe('D8 Task 8: serialize is byte-stable', () => {
	test('parse -> serialize on the shipped example.yaml body reproduces it exactly', () => {
		expect(serialize(parseLikePipeline(partyExample))).toBe(partyExample.trim());
	});

	test('_dse_anchor and an unknown top-level key survive the round-trip untouched', () => {
		const src = [
			'members:',
			'  - name: Kira',
			'    level: 3',
			'party:',
			'  hero_tokens: 2',
			'_dse_anchor: 8f3a1c',
			'future_field: kept-as-is',
		].join('\n');
		const out = serialize(parseLikePipeline(src));
		expect(out).toBe(src);
	});

	test('a member with only `name` round-trips with no other field materialized', () => {
		const src = ['members:', '  - name: Solo'].join('\n');
		const out = serialize(parseLikePipeline(src));
		expect(out).toBe(src);
		expect(out).not.toContain('level:');
		expect(out).not.toContain('victories:');
		expect(out).not.toContain('xp:');
		expect(out).not.toContain('renown:');
		expect(out).not.toContain('wealth:');
		expect(out).not.toContain('hero_ref:');
	});

	test('a present value is never overridden by a default (a member with victories: 0 stays 0, not omitted)', () => {
		const src = ['members:', '  - name: Kira', '    victories: 0'].join('\n');
		const model = parseLikePipeline(src);
		expect(model.members[0].victories).toBe(0);
		expect(serialize(model)).toContain('victories: 0');
	});

	test('output is trimmed (no trailing/leading whitespace), matching every other persisted element', () => {
		const out = serialize(parseLikePipeline(partyExample));
		expect(out).not.toMatch(/\n$/);
		expect(out).not.toMatch(/^\s/);
	});

	test('round-trip stability: parse(serialize(parse(x))) deep-equals parse(x); serialize is stable on pass 2', () => {
		const m1 = parseLikePipeline(partyExample);
		const s1 = serialize(m1);
		const m2 = parseLikePipeline(s1);
		expect(m2).toEqual(m1);
		expect(serialize(m2)).toBe(s1);
	});
});

describe('D8 Task 8: followerCount — REF §11/§13, AGENT 962-1005 (exact thresholds 3/6/9/12 -> 1/2/3/4)', () => {
	test('below the first threshold -> 0 followers', () => {
		expect(followerCount(0)).toBe(0);
		expect(followerCount(2)).toBe(0);
	});

	test('each threshold, and just below the next one, holds its own count', () => {
		expect(followerCount(3)).toBe(1);
		expect(followerCount(5)).toBe(1);
		expect(followerCount(6)).toBe(2);
		expect(followerCount(8)).toBe(2);
		expect(followerCount(9)).toBe(3);
		expect(followerCount(11)).toBe(3);
		expect(followerCount(12)).toBe(4);
	});

	test('past the top threshold stays capped at 4 (never fabricates a 5th tier)', () => {
		expect(followerCount(20)).toBe(4);
	});
});

describe('D8 Task 8: echelonForLevel — REF §13/AGENT 993-1005 (exact level table, never a guess)', () => {
	test('1st echelon: levels 1-3', () => {
		expect(echelonForLevel(1)).toBe(1);
		expect(echelonForLevel(3)).toBe(1);
	});

	test('2nd echelon: levels 4-6', () => {
		expect(echelonForLevel(4)).toBe(2);
		expect(echelonForLevel(6)).toBe(2);
	});

	test('3rd echelon: levels 7-9', () => {
		expect(echelonForLevel(7)).toBe(3);
		expect(echelonForLevel(9)).toBe(3);
	});

	test('4th echelon: level 10 only', () => {
		expect(echelonForLevel(10)).toBe(4);
	});

	test('an unset or out-of-table level -> null, never a fabricated echelon', () => {
		expect(echelonForLevel(undefined)).toBeNull();
		expect(echelonForLevel(0)).toBeNull();
		expect(echelonForLevel(11)).toBeNull();
	});
});

describe('D8 Task 8: WEALTH_MIN/WEALTH_MAX — REF §11/§13 ("Abstract 1-6")', () => {
	test('bounds are 1 and 6', () => {
		expect(WEALTH_MIN).toBe(1);
		expect(WEALTH_MAX).toBe(6);
	});
});
