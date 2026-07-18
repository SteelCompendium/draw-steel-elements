// D7 Task 7 (spec §3.1/§3.4, OD-1/OD-2) — ds-hero model: the flagship's byte-stability
// proof. Unlike every other persisted element (resource/surges/tokens/conditions —
// serialize = stringifyYaml(dto).trim(), a pure re-projection), ds-hero's serialize is a
// STATE-SCOPED SPLICE: the authored definition region is captured byte-for-byte at parse
// time (`defnRaw`) and spliced back verbatim on every write; only `state:` is ever
// re-emitted. This suite is the regression guard for that splice, hardened against the
// "structural, not substring" split requirement (a `state:` appearing inside a hero-
// section string value must never confuse the splitter).
import { parseYaml } from '../../mocks/obsidian';
import { createValidationService } from '../../../src/framework/validation';
import type { ValidationService } from '../../../src/framework/validation';
import { parse, serialize, HeroModel } from '../../../src/elements/hero/model';
import heroSchemaYaml from '../../../src/elements/hero/schema.yaml';
import heroExample from '../../../src/elements/hero/example.yaml';

/** Runs the model exactly the way the pipeline does: def.parse(parseYaml(source), source). */
const parseLikePipeline = (source: string): HeroModel => parse(parseYaml(source), source);

/**
 * Mirrors model.ts's OWN structural split (a column-0-anchored, whole-line match for the
 * top-level `state:` key) so the test asserts against the same contract the
 * implementation promises, not an incidental byproduct. Used only to compute the
 * EXPECTED defn region from a raw fixture string — never imported from src.
 */
function expectedDefnRegion(raw: string): string {
	const lines = raw.split('\n');
	const idx = lines.findIndex((line) => /^state:[ \t]*(#.*)?$/.test(line));
	return idx === -1 ? raw.replace(/\s+$/u, '') : lines.slice(0, idx).join('\n');
}

describe('D7 Task 7: hero model parse (spec §3.1 shape)', () => {
	test('parses the shipped example.yaml into typed defn + state', () => {
		const model = parseLikePipeline(heroExample);
		expect(model.defn.name).toBe('Torin Stonefist');
		expect(model.defn.level).toBe(3);
		expect(model.defn.characteristics).toEqual({ might: 2, agility: 2, reason: -1, intuition: 0, presence: 1 });
		expect(model.defn.kits).toEqual(['scc.v1:mcdm.heroes.v1/kit/mountain']);
		expect(model.defn.abilities).toEqual([
			'scc.v1:mcdm.heroes.v1/.../brute-strike',
			'scc.v1:mcdm.heroes.v1/.../into-the-fray',
		]);
		expect(model.defn.resource).toEqual({ type: 'Ferocity', min: 0 });
		expect(model.state).toEqual({
			stamina: { current: 31, temp: 0 },
			resource: 4,
			surges: 1,
			recoveries: 6,
			victories: 2,
			conditions: [{ key: 'bleeding', effect: 'save ends' }],
			tokens_ref: '@Party/Session',
		});
	});

	test('rejects a non-object block', () => {
		expect(() => parseLikePipeline('4')).toThrow();
	});

	test('rejects a missing name', () => {
		const src = 'level: 3\ncharacteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }';
		expect(() => parseLikePipeline(src)).toThrow(/name/i);
	});

	test('rejects a missing/non-numeric level', () => {
		const src = 'name: X\ncharacteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }';
		expect(() => parseLikePipeline(src)).toThrow(/level/i);
	});

	test('rejects characteristics missing one of the five keys', () => {
		const src = 'name: X\nlevel: 1\ncharacteristics: { might: 0, agility: 0, reason: 0, intuition: 0 }';
		expect(() => parseLikePipeline(src)).toThrow(/presence/i);
	});

	test('a block that is ONLY state: (no hero definition fields) fails cleanly, not silently', () => {
		const src = 'state:\n  stamina: { current: 10, temp: 0 }';
		// name/level/characteristics are all required on the definition half — a state-
		// only block is not a valid hero (proves the splitter doesn't accidentally treat
		// the whole document as "state" and swallow the missing-field error).
		expect(() => parseLikePipeline(src)).toThrow(/name/i);
	});
});

describe('D7 Task 7: serialize is the state-scoped splice (spec §3.4/OD-2)', () => {
	test('round-trip: the defn region is byte-identical to the input; only state: is re-emitted', () => {
		const model = parseLikePipeline(heroExample);
		const out = serialize(model);
		const defnRegion = expectedDefnRegion(heroExample);

		expect(out.startsWith(`${defnRegion}\nstate:\n`)).toBe(true);
		expect(out.slice(0, defnRegion.length)).toBe(defnRegion);

		// The re-emitted state: section round-trips to the same state (format may differ
		// from the authored flow style — only the DEFN region has a byte-fidelity claim).
		const reparsed = parseLikePipeline(out);
		expect(reparsed.state).toEqual(model.state);
		expect(reparsed.defn).toEqual(model.defn);
	});

	test('state mutation: the defn region is STILL byte-identical; only state.stamina.current changes', () => {
		const model = parseLikePipeline(heroExample);
		const before = serialize(model);

		model.state.stamina.current = 15;
		const after = serialize(model);

		const defnRegion = expectedDefnRegion(heroExample);
		expect(after.slice(0, defnRegion.length)).toBe(defnRegion);
		expect(before.slice(0, defnRegion.length)).toBe(defnRegion);
		expect(after).not.toBe(before);

		const reparsedBefore = parseLikePipeline(before);
		const reparsedAfter = parseLikePipeline(after);
		expect(reparsedAfter.state.stamina.current).toBe(15);
		// every OTHER state field is untouched by the mutation
		expect({ ...reparsedAfter.state, stamina: undefined }).toEqual({ ...reparsedBefore.state, stamina: undefined });
		expect(reparsedAfter.state.stamina.temp).toBe(reparsedBefore.state.stamina.temp);
	});

	test('no state: author: defaults seed in memory only; serialize appends a fresh state: block, hero region untouched', () => {
		// The defn-only prefix of the shipped example — still valid YAML on its own, with
		// no state: key at all.
		const heroOnly = expectedDefnRegion(heroExample);
		const model = parseLikePipeline(heroOnly);

		// Defaults materialize ONLY in memory (spec §3.4): current=max, recoveries=max,
		// resource=min, surges/victories=0, conditions=[], tokens_ref absent.
		expect(model.state).toEqual({
			stamina: { current: model.defn.max_stamina, temp: 0 },
			resource: model.defn.resource?.min,
			surges: 0,
			recoveries: model.defn.recoveries_max,
			victories: 0,
			conditions: [],
		});
		expect(model.state.tokens_ref).toBeUndefined();

		const out = serialize(model);
		expect(out.startsWith(`${heroOnly}\nstate:\n`)).toBe(true);
		expect(out.slice(0, heroOnly.length)).toBe(heroOnly);
	});

	test('authored region survives comments, unusual indentation, quoted strings, and trailing whitespace', () => {
		const trail = '   '; // appended via + so no literal trailing whitespace sits in this file
		const quirky = [
			`name: Odd Duck${trail}`,
			`level:    5${trail}                    # weirdly aligned comment`,
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
			`#   an over-indented-looking comment line${trail}`,
			'skills:      [Alchemy, "Weird: Skill Name"]',
			'state:',
			'  stamina: { current: 10, temp: 0 }',
		].join('\n');

		const model = parseLikePipeline(quirky);
		expect(model.defn.skills).toEqual(['Alchemy', 'Weird: Skill Name']);

		const defnRegion = expectedDefnRegion(quirky);
		const before = serialize(model);
		expect(before.slice(0, defnRegion.length)).toBe(defnRegion);
		expect(before.slice(0, defnRegion.length)).toBe(
			[
				`name: Odd Duck${trail}`,
				`level:    5${trail}                    # weirdly aligned comment`,
				'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
				`#   an over-indented-looking comment line${trail}`,
				'skills:      [Alchemy, "Weird: Skill Name"]',
			].join('\n'),
		);

		model.state.stamina.current = 3;
		const after = serialize(model);
		expect(after.slice(0, defnRegion.length)).toBe(defnRegion);
	});

	test('edge: "state:" inside a hero-section string value does not confuse the structural splitter', () => {
		const raw = [
			'name: Sly Wordsmith',
			'level: 4',
			'characteristics: { might: 0, agility: 0, reason: 3, intuition: 1, presence: 2 }',
			`complication: "The party's state: is dire, but the plan holds."`,
			'state:',
			'  stamina: { current: 20, temp: 0 }',
		].join('\n');

		const model = parseLikePipeline(raw);
		// The complication string survived WHOLE — a substring search would have cut the
		// defn region off mid-string, right after "state:" inside the quoted value.
		expect(model.defn.complication).toBe("The party's state: is dire, but the plan holds.");
		expect(model.state.stamina).toEqual({ current: 20, temp: 0 });

		const defnRegion = expectedDefnRegion(raw);
		expect(defnRegion).toContain('complication:');
		expect(defnRegion.split('\n')).toHaveLength(4); // name, level, characteristics, complication

		const out = serialize(model);
		expect(out.slice(0, defnRegion.length)).toBe(defnRegion);
	});

	test('a state: appearing inside an indented block-scalar description is not treated as the split point', () => {
		const raw = [
			'name: Block Scalar Test',
			'level: 2',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
			'complication: |',
			'  This description mentions state: right here, mid-paragraph.',
			'  It should never be mistaken for the real state: key below.',
			'state:',
			'  stamina: { current: 8, temp: 0 }',
		].join('\n');

		const model = parseLikePipeline(raw);
		expect(model.defn.complication).toBe(
			'This description mentions state: right here, mid-paragraph.\n' +
				'It should never be mistaken for the real state: key below.\n',
		);
		expect(model.state.stamina).toEqual({ current: 8, temp: 0 });

		const defnRegion = expectedDefnRegion(raw);
		expect(defnRegion.split('\n')).toHaveLength(6);
		const out = serialize(model);
		expect(out.slice(0, defnRegion.length)).toBe(defnRegion);
	});
});

describe('D7 Task 7 fix round 1: splitter is a structural scan, not "state: is last/block"', () => {
	test('MUST-FIX 1: state: before other definition fields — the fields after it survive, not dropped', () => {
		const raw = [
			'name: X',
			'level: 1',
			'state:',
			'  stamina: { current: 5, temp: 0 }',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
		].join('\n');

		const model = parseLikePipeline(raw);
		expect(model.defn.characteristics).toEqual({ might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 });
		expect(model.state.stamina).toEqual({ current: 5, temp: 0 });

		const out = serialize(model);
		// state always serializes LAST (documented normalization) — the non-state fields
		// keep their authored order/bytes, just with state's span removed and re-appended.
		const expectedDefnRegion = [
			'name: X',
			'level: 1',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
		].join('\n');
		expect(out.startsWith(`${expectedDefnRegion}\nstate:\n`)).toBe(true);
		expect(out.slice(0, expectedDefnRegion.length)).toBe(expectedDefnRegion);
		// the old (buggy) contract dropped characteristics entirely — assert it is present
		// in the output at all, not just recoverable from `model.defn` in memory.
		expect(out).toContain('characteristics:');
	});

	test('MUST-FIX 1 (round-trip): re-parsing the serialized output succeeds and is stable on a second write', () => {
		const raw = [
			'name: X',
			'level: 1',
			'state:',
			'  stamina: { current: 5, temp: 0 }',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
		].join('\n');

		const model = parseLikePipeline(raw);
		const out = serialize(model);
		const reparsed = parseLikePipeline(out);
		expect(reparsed.defn.characteristics).toEqual({ might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 });
		expect(reparsed.state).toEqual(model.state);

		// serializing the reparsed model again is stable (state having moved to the end
		// once doesn't keep drifting on subsequent writes).
		const out2 = serialize(reparsed);
		expect(out2).toBe(out);
	});

	test('MUST-FIX 2: CRLF source round-trips without manufacturing a duplicate state: key', () => {
		const raw = [
			'name: X',
			'level: 1',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
			'state:',
			'  stamina: { current: 5, temp: 0 }',
		].join('\r\n');

		const model = parseLikePipeline(raw);
		expect(model.state.stamina).toEqual({ current: 5, temp: 0 });

		const out = serialize(model);
		// exactly one top-level state: key in the output
		expect(out.match(/^state:/gm)?.length).toBe(1);
		// the fresh output preserves the source's CRLF dominant EOL
		expect(out).toContain('\r\n');
		expect(out.split('\r\n').some((line) => line.includes('\n'))).toBe(false);

		const reparsed = parseLikePipeline(out);
		expect(reparsed.defn.name).toBe('X');
		expect(reparsed.state.stamina).toEqual({ current: 5, temp: 0 });
	});

	test('MUST-FIX 3: inline flow-style state: ({ ... } on one line) round-trips without a duplicate key', () => {
		const raw = [
			'name: X',
			'level: 1',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
			'state: { stamina: { current: 7, temp: 0 } }',
		].join('\n');

		const model = parseLikePipeline(raw);
		expect(model.state.stamina).toEqual({ current: 7, temp: 0 });

		const out = serialize(model);
		expect(out.match(/^state:/gm)?.length).toBe(1);

		const reparsed = parseLikePipeline(out);
		expect(reparsed.state.stamina).toEqual({ current: 7, temp: 0 });
		expect(reparsed.defn.name).toBe('X');
	});

	test('duplicate top-level state: keys in raw source are rejected with a clear parse error', () => {
		const validData = {
			name: 'X',
			level: 1,
			characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
		};
		const rawWithDupes = [
			'name: X',
			'level: 1',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
			'state:',
			'  a: 1',
			'state:',
			'  b: 2',
		].join('\n');

		expect(() => parse(validData, rawWithDupes)).toThrow(/duplicate/i);
		expect(() => parse(validData, rawWithDupes)).toThrow(/state/i);
	});

	test('block-scalar description containing a "state:"-looking line is still never mistaken for the split point (regression guard for the fix)', () => {
		const raw = [
			'name: Block Scalar Test',
			'level: 2',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
			'complication: |',
			'  This description mentions state: right here, mid-paragraph.',
			'  It should never be mistaken for the real state: key below.',
			'state:',
			'  stamina: { current: 8, temp: 0 }',
		].join('\n');

		const model = parseLikePipeline(raw);
		expect(model.defn.complication).toBe(
			'This description mentions state: right here, mid-paragraph.\n' +
				'It should never be mistaken for the real state: key below.\n',
		);
		expect(model.state.stamina).toEqual({ current: 8, temp: 0 });

		const defnRegion = expectedDefnRegion(raw);
		const out = serialize(model);
		expect(out.slice(0, defnRegion.length)).toBe(defnRegion);
	});

	test('no trailing newline in source: state: last, no EOL at EOF — still byte-stable', () => {
		const raw = [
			'name: X',
			'level: 1',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
			'state:',
			'  stamina: { current: 9, temp: 0 }',
		].join('\n'); // deliberately no trailing \n

		const model = parseLikePipeline(raw);
		const defnRegion = expectedDefnRegion(raw);
		const out = serialize(model);
		expect(out.slice(0, defnRegion.length)).toBe(defnRegion);
		expect(out.startsWith(`${defnRegion}\nstate:\n`)).toBe(true);
	});
});

describe('FOLLOWUPS #28 MED-1: trailing comment/blank lines after a state-last block survive', () => {
	test('a trailing comment after state: is preserved, not silently dropped on first persist', () => {
		const raw = [
			'name: X',
			'level: 1',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
			'state:',
			'  stamina: { current: 5, temp: 0 }',
			'# remember to bump level after next respite',
		].join('\n');

		const model = parseLikePipeline(raw);
		expect(model.state.stamina).toEqual({ current: 5, temp: 0 });

		const out = serialize(model);
		const expectedDefn = [
			'name: X',
			'level: 1',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
			'# remember to bump level after next respite',
		].join('\n');
		expect(out.startsWith(`${expectedDefn}\nstate:\n`)).toBe(true);
		expect(out).toContain('# remember to bump level after next respite');
	});

	test('trailing blank lines after state: do not corrupt the output (whitespace-only, trimmed)', () => {
		const raw = [
			'name: X',
			'level: 1',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
			'state:',
			'  stamina: { current: 5, temp: 0 }',
			'',
			'',
		].join('\n');

		const model = parseLikePipeline(raw);
		expect(model.state.stamina).toEqual({ current: 5, temp: 0 });

		const out = serialize(model);
		const expectedDefn = [
			'name: X',
			'level: 1',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
		].join('\n');
		// no stray blank-line gap between the last real defn field and the re-appended
		// state: — exactly the "\nstate:\n" joiner, nothing else.
		expect(out.startsWith(`${expectedDefn}\nstate:\n`)).toBe(true);
		expect(out.slice(0, expectedDefn.length)).toBe(expectedDefn);
	});

	test('a blank line then a trailing comment after state: — both survive together', () => {
		const raw = [
			'name: X',
			'level: 1',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
			'state:',
			'  stamina: { current: 5, temp: 0 }',
			'',
			'# a trailing note, separated from state by a blank line',
		].join('\n');

		const model = parseLikePipeline(raw);
		expect(model.state.stamina).toEqual({ current: 5, temp: 0 });

		const out = serialize(model);
		const expectedDefn = [
			'name: X',
			'level: 1',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
			'',
			'# a trailing note, separated from state by a blank line',
		].join('\n');
		expect(out.startsWith(`${expectedDefn}\nstate:\n`)).toBe(true);
	});

	test('CRLF source: trailing comment after state: survives with the CRLF joiner intact', () => {
		const raw = [
			'name: X',
			'level: 1',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
			'state:',
			'  stamina: { current: 5, temp: 0 }',
			'# a CRLF-sourced trailing comment',
		].join('\r\n');

		const model = parseLikePipeline(raw);
		expect(model.state.stamina).toEqual({ current: 5, temp: 0 });

		const out = serialize(model);
		expect(out).toContain('# a CRLF-sourced trailing comment');
		expect(out.match(/^state:/gm)?.length).toBe(1);
		// the source's dominant CRLF EOL is preserved throughout the output
		expect(out.split('\r\n').some((line) => line.includes('\n'))).toBe(false);

		const reparsed = parseLikePipeline(out);
		expect(reparsed.defn.name).toBe('X');
		expect(reparsed.state.stamina).toEqual({ current: 5, temp: 0 });
	});

	test('a comment sandwiched between state: and a following definition key still ends up above state on re-serialize', () => {
		// state: appearing mid-document (not last) with a trailing comment right after its
		// own indented content, before the next top-level key — the comment is not part of
		// state's span and should re-surface with the other definition fields.
		const raw = [
			'name: X',
			'level: 1',
			'state:',
			'  stamina: { current: 5, temp: 0 }',
			'# a note about the next field',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
		].join('\n');

		const model = parseLikePipeline(raw);
		expect(model.defn.characteristics).toEqual({ might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 });
		expect(model.state.stamina).toEqual({ current: 5, temp: 0 });

		const out = serialize(model);
		const expectedDefn = [
			'name: X',
			'level: 1',
			'# a note about the next field',
			'characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 }',
		].join('\n');
		expect(out.startsWith(`${expectedDefn}\nstate:\n`)).toBe(true);
	});
});

describe('D7 Task 7 fix round 1 (LOW 4): parseState throws on type-mismatched scalar fields, like parseStamina', () => {
	const baseHero = {
		name: 'X',
		level: 1,
		characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
	};

	test.each(['resource', 'surges', 'recoveries', 'victories'])('state.%s must throw when present and non-numeric', (field) => {
		const data = { ...baseHero, state: { [field]: 'oops' } };
		expect(() => HeroModel.parse(data, 'name: X')).toThrow(new RegExp(field, 'i'));
	});
});

describe('D7 Task 7: schema.yaml (AJV, drives Task 9 D9 form-editor reuse)', () => {
	let service: ValidationService;

	beforeEach(() => {
		service = createValidationService();
	});

	test('the shipped example.yaml validates cleanly', () => {
		const result = service.validate('hero', heroSchemaYaml, parseYaml(heroExample));
		expect(result).toEqual({ valid: true, errors: [] });
	});

	test('a sheet with no state: at all is valid (defaults are seeded by parse, not required by schema)', () => {
		const heroOnly = expectedDefnRegion(heroExample);
		const result = service.validate('hero', heroSchemaYaml, parseYaml(heroOnly));
		expect(result.valid).toBe(true);
	});

	test('missing name fails validation', () => {
		const result = service.validate('hero', heroSchemaYaml, {
			level: 1,
			characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
		});
		expect(result.valid).toBe(false);
	});

	test('an unknown top-level key fails validation (additionalProperties: false)', () => {
		const result = service.validate('hero', heroSchemaYaml, {
			name: 'X',
			level: 1,
			characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
			bogus_field: true,
		});
		expect(result.valid).toBe(false);
	});

	test('characteristics constrained to exactly the five keys', () => {
		const result = service.validate('hero', heroSchemaYaml, {
			name: 'X',
			level: 1,
			characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0, luck: 1 },
		});
		expect(result.valid).toBe(false);
	});

	test('a partial state: block (only stamina) is valid — the rest is optional', () => {
		const result = service.validate('hero', heroSchemaYaml, {
			name: 'X',
			level: 1,
			characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
			state: { stamina: { current: 5, temp: 0 } },
		});
		expect(result).toEqual({ valid: true, errors: [] });
	});
});
