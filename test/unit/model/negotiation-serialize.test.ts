// Plan 05 Task 4: negotiation element model — parse + BYTE-COMPAT serialize.
// The legacy write path (CodeBlocks.updateNegotiationTracker -> updateCodeBlock ->
// updateMarkdownCodeBlock, src/utils/CodeBlocks.ts:102 / canvas :79) does exactly
// `stringifyYaml(data).trim()` on the WHOLE NegotiationData instance the processor holds.
// So the compatibility oracle here is the legacy writer's own output for the same input:
// `stringifyYaml(new NegotiationData(parseYaml(src))).trim()` — NOT the source bytes.
// new NegotiationData materializes defaults (current_patience=5, current_interest=0,
// i5..i0 placeholders, a full currentArgument) so serialize(parse(src)) legitimately emits
// fields ABSENT from src; the legacy writer does the same on its first write.
//
// The free-text suite exists because of Plan 05 T-2: the obsidian mock's stringifyYaml now
// delegates to the real `yaml` package at Obsidian-bundle defaults, which FOLDS long plain
// scalars across continuation lines (no `>-`) and emits `|-` literal blocks for embedded
// newlines. Negotiation is the first persisted element whose disk shape actually hits
// those paths (motivation/pitfall reasons, i5..i0 sentences) — prove they round-trip.
import { parseYaml, stringifyYaml } from '../../mocks/obsidian';
import { NegotiationData, parseNegotiationData } from '@model/NegotiationData';
import { parse, serialize } from '../../../src/elements/negotiation/model';
import frodoYaml from '../../fixtures/negotiation/frodo.yaml';

/** Runs the model exactly the way the pipeline does: def.parse(parseYaml(source), source). */
const parseLikePipeline = (source: string): NegotiationData => parse(parseYaml(source), source);

/** The exact bytes the LEGACY writer would put back into the note for this source. */
const legacyWriterBytes = (source: string): string =>
	stringifyYaml(new NegotiationData(parseYaml(source))).trim();

describe('T-4: negotiation model parse (verbatim class reuse)', () => {
	test('parse returns a real NegotiationData, identical to the legacy parse path', () => {
		const model = parseLikePipeline(frodoYaml);
		expect(model).toBeInstanceOf(NegotiationData);
		// Same construction as legacy parseNegotiationData(source) — nested instances included.
		expect(model).toEqual(parseNegotiationData(frodoYaml));
		expect(model.current_patience).toBe(3); // from initial_patience
		expect(model.current_interest).toBe(3); // from initial_interest
		expect(model.motivations.map((m) => m.name)).toEqual(['Higher Authority', 'Peace']);
	});
});

describe('T-4: serialize is byte-compatible with the legacy writer', () => {
	test('serialize(parse(frodo)) equals the legacy writeback bytes exactly', () => {
		expect(serialize(parseLikePipeline(frodoYaml))).toBe(legacyWriterBytes(frodoYaml));
	});

	test('defaults materialize exactly like the legacy first write (pin: patience=5, interest=0)', () => {
		const src = 'name: Quick';
		const out = serialize(parseLikePipeline(src));
		expect(out).toBe(legacyWriterBytes(src));
		expect(out).toContain('current_patience: 5');
		expect(out).toContain('current_interest: 0');
		expect(out).toContain('i5: Interest 5 result');
		expect(out).toContain('currentArgument:');
		expect(out).toContain('lieUsed: false');
	});

	test('output is trimmed (no trailing newline), matching legacy writer + replaceSource', () => {
		const out = serialize(parseLikePipeline(frodoYaml));
		expect(out).not.toMatch(/\n$/);
		expect(out).not.toMatch(/^\s/);
	});

	test('top-level key order is the NegotiationData constructor assignment order', () => {
		const out = serialize(parseLikePipeline(frodoYaml));
		const topLevelKeys = out
			.split('\n')
			.filter((line) => /^\S/.test(line))
			.map((line) => line.split(':')[0]);
		expect(topLevelKeys).toEqual([
			'name',
			'initial_patience',
			'current_patience',
			'initial_interest',
			'current_interest',
			'motivations',
			'pitfalls',
			'currentArgument',
			'i5',
			'i4',
			'i3',
			'i2',
			'i1',
			'i0',
		]);
	});
});

describe('T-4: round-trip stability', () => {
	test('parse(serialize(parse(frodo))) deep-equals parse(frodo); serialize is stable on pass 2', () => {
		const m1 = parseLikePipeline(frodoYaml);
		const s1 = serialize(m1);
		const m2 = parseLikePipeline(s1);
		expect(m2).toEqual(m1);
		expect(serialize(m2)).toBe(s1);
	});
});

// FOLLOWUPS #26: `_dse_anchor` passthrough (D8 spec §1.5) — NegotiationData is one of
// the three class-based persisted models (with Counter/StaminaBar) that previously
// dropped unknown top-level keys on parse -> serialize, so a sidebar-sent block's
// anchor line was lost the first time the block was persisted.
describe('FOLLOWUPS #26: _dse_anchor passthrough', () => {
	test('parse -> mutate -> serialize preserves an existing anchor byte-stable, emitted LAST (after i0)', () => {
		const source = frodoYaml.trimEnd() + '\n_dse_anchor: 4c19ff';
		const model = parseLikePipeline(source);
		expect(model._dse_anchor).toBe('4c19ff');

		model.current_patience = 1;
		const out = serialize(model);

		expect(out.endsWith('\n_dse_anchor: 4c19ff')).toBe(true);
		const m2 = parseLikePipeline(out);
		expect(m2._dse_anchor).toBe('4c19ff');
		expect(m2.current_patience).toBe(1);
	});

	test('no anchor in the source: serialize never materializes the key', () => {
		const model = parseLikePipeline(frodoYaml);
		expect(model._dse_anchor).toBeUndefined();
		expect(serialize(model)).not.toMatch(/_dse_anchor/);
	});
});

describe('T-4: free-text byte-compat (yaml-pkg folding, Plan 05 T-2)', () => {
	// Past the default lineWidth of 80, so the `yaml` package folds it across
	// continuation lines as a PLAIN scalar (js-yaml would have emitted `>-` instead).
	const LONG_REASON =
		'It is the sworn duty of every hobbit of the Shire to carry the burden to the ' +
		'very fires of Mount Doom, no matter the cost to himself or to those he loves most dearly.';
	// Embedded newlines incl. a blank line — exercises the `|-` literal-block path.
	const MULTILINE_I0 =
		'Thinks you are after the ring.\nBecomes hostile at once.\n\nThe negotiation is over.';

	const dto = {
		name: 'Free-text compat',
		initial_patience: 3,
		motivations: [{ name: 'Higher Authority', reason: LONG_REASON }],
		pitfalls: [{ name: 'Power', reason: LONG_REASON }],
		i0: MULTILINE_I0,
	};
	const source = stringifyYaml(dto);

	test('long/multi-line free text round-trips byte-identically through parse -> serialize', () => {
		const m1 = parseLikePipeline(source);
		const s1 = serialize(m1);

		// s1 IS what legacy Obsidian would write for this input.
		expect(s1).toBe(legacyWriterBytes(source));

		// Prove the folding paths are actually exercised, not just short scalars:
		// the long reason is folded onto an indented continuation line (plain scalar,
		// no block-folding marker), and the multi-line i0 is a `|-` literal block.
		expect(s1).toMatch(/reason: It is the sworn duty[^\n]*\n {6}\S/);
		expect(s1).not.toContain('>-');
		expect(s1).toContain('i0: |-');

		// The folded bytes are lossless: parsing them back restores the exact text...
		const m2 = parseLikePipeline(s1);
		expect(m2.motivations[0].reason).toBe(LONG_REASON);
		expect(m2.pitfalls[0].reason).toBe(LONG_REASON);
		expect(m2.i0).toBe(MULTILINE_I0);

		// ...and a second serialize pass is byte-identical (stable on disk).
		expect(serialize(m2)).toBe(s1);
		expect(m2).toEqual(m1);
	});
});
