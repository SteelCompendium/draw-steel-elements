// Plan 05 Task 4: negotiation element model — parse + BYTE-COMPAT serialize.
// The legacy write path (the former CodeBlocks.updateNegotiationTracker -> updateCodeBlock ->
// updateMarkdownCodeBlock, src/utils/CodeBlocks.ts — deleted in SC-454) did exactly
// `stringifyYaml(data).trim()` on the WHOLE NegotiationData instance the processor holds.
// So the compatibility oracle here is the legacy writer's own output for the same input:
// `stringifyYaml(new NegotiationData(parseYaml(src))).trim()` — NOT the source bytes.
// new NegotiationData materializes defaults (current_patience=5, current_interest=0,
// i5..i0 placeholders, a full currentArgument) so serialize(parse(src)) legitimately emits
// fields ABSENT from src; the legacy writer does the same on its first write.
//
// SC-482 narrows that oracle: a key the source did NOT declare and the write did not change is no
// longer written (current_patience / current_interest / currentArgument / i5..i0 / each
// motivation's hasBeenAppealedTo ...), so serialize(parse(src)) now equals the legacy bytes only
// for a source that declares every key. Such a source is built here as `legacyWriterBytes(src)`
// itself — what the old plugin wrote into the note on the first change.
//
// The free-text suite exists because of Plan 05 T-2: the obsidian mock's stringifyYaml now
// delegates to the real `yaml` package at Obsidian-bundle defaults, which FOLDS long plain
// scalars across continuation lines (no `>-`) and emits `|-` literal blocks for embedded
// newlines. Negotiation is the first persisted element whose disk shape actually hits
// those paths (motivation/pitfall reasons, i5..i0 sentences) — prove they round-trip.
import { parseYaml, stringifyYaml } from '../../mocks/obsidian';
import { CurrentArgument, Motivation, NegotiationData, parseNegotiationData, Pitfall, unknownKeysOf } from '@model/NegotiationData';
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

describe('T-4: serialize is byte-compatible with the legacy writer (for every key the source declared)', () => {
	test('serialize(parse(frodo)) is the legacy writeback bytes minus the keys frodo never declared (SC-482)', () => {
		const legacy = legacyWriterBytes(frodoYaml);
		const undeclared = [
			'current_patience: 3',
			'current_interest: 3',
			'    hasBeenAppealedTo: false',
			'currentArgument:',
			'  motivationsUsed: []',
			'  pitfallsUsed: []',
			'  lieUsed: false',
			'  sameArgumentUsed: false',
			'  reusedMotivation: false',
		];
		// The legacy bytes are the oracle: remove exactly the lines for undeclared keys.
		const expected = legacy
			.split('\n')
			.filter((line) => !undeclared.includes(line))
			.join('\n');
		expect(serialize(parseLikePipeline(frodoYaml))).toBe(expected);
		expect(expected.split('\n').length).toBe(legacy.split('\n').length - 10);
	});

	test('a fully-declared block (the legacy writeback bytes as the source) round-trips byte-identically', () => {
		const full = legacyWriterBytes(frodoYaml);
		expect(serialize(parseLikePipeline(full))).toBe(full);
	});

	test('undeclared defaults are not written (pin: patience=5, interest=0 stay in the model only)', () => {
		const src = 'name: Quick';
		const model = parseLikePipeline(src);
		expect(model.current_patience).toBe(5);
		expect(model.current_interest).toBe(0);
		expect(serialize(model)).toBe('name: Quick');
		// What the legacy first write added, now omitted:
		const legacy = legacyWriterBytes(src);
		expect(legacy).toContain('current_patience: 5');
		expect(legacy).toContain('i5: Interest 5 result');
		expect(legacy).toContain('currentArgument:');
		expect(legacy).toContain('lieUsed: false');
		// ...and the fully-declared form of that block is byte-identical to the legacy bytes.
		expect(serialize(parseLikePipeline(legacy))).toBe(legacy);
	});

	test('a default the write changed is written (current_patience moved off its derived default)', () => {
		const model = parseLikePipeline('name: Quick\ninitial_patience: 4');
		expect(serialize(model)).toBe('name: Quick\ninitial_patience: 4');
		model.current_patience = 2;
		expect(serialize(model)).toBe('name: Quick\ninitial_patience: 4\ncurrent_patience: 2');
	});

	test('output is trimmed (no trailing newline), matching legacy writer + replaceSource', () => {
		const out = serialize(parseLikePipeline(frodoYaml));
		expect(out).not.toMatch(/\n$/);
		expect(out).not.toMatch(/^\s/);
	});

	test('top-level key order is the NegotiationData constructor assignment order', () => {
		const out = serialize(parseLikePipeline(legacyWriterBytes(frodoYaml)));
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

		// s1 IS the input (every key it declares, none it does not — SC-482), and a fully-declared
		// form of it is byte-identical to what legacy Obsidian would write.
		expect(s1).toBe(source.trim());
		expect(serialize(parseLikePipeline(legacyWriterBytes(source)))).toBe(legacyWriterBytes(source));

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

// SC-637 — a key the negotiation does not read is written back after the known ones, at the top of the block and inside each
// motivation and pitfall. The pairs live beside the instance (a WeakMap in NegotiationData.ts), so no key can shadow a member.
describe('keys the negotiation does not know survive a write (SC-637)', () => {
	const keysOf = (yaml: string): string[] => Object.keys(parseYaml(yaml));
	const source = [
		'note_to_self: keep me',
		'name: The Duke',
		'initial_interest: 3',
		'initial_patience: 3',
		'gm_meta:',
		'  author: Sam',
		'  tags: [a, b]',
		'motivations:',
		'  - gm_note: ask about the sister',
		'    name: Legacy',
		'    reason: heir',
		'    odds:',
		'      high: 2',
		'    hasBeenAppealedTo: false',
		'  - name: Coin',
		'    reason: money',
		'    seen_by: [Sam, Bo]',
		'pitfalls:',
		'  - gm_note: never mention the war',
		'    name: Pride',
		'    reason: charity',
		'    tags: [x]',
		'i5: five',
		'i4: four',
		'i3: three',
		'i2: two',
		'i1: one',
		'i0: zero',
		'zz_last: 9',
	].join('\n');
	const MOT_0 = { name: 'Legacy', reason: 'heir', hasBeenAppealedTo: true, gm_note: 'ask about the sister', odds: { high: 2 } };

	test('top-level unknown keys (a scalar, a nested map, a list) come back by value after the standing and a motivation change', () => {
		const m = parseLikePipeline(source);
		m.current_patience = 1;
		m.setMotivationUsed('Legacy', true);
		const out = parseYaml(serialize(m));
		expect(out.note_to_self).toBe('keep me');
		expect(out.gm_meta).toEqual({ author: 'Sam', tags: ['a', 'b'] });
		expect(out.zz_last).toBe(9);
		expect(out.current_patience).toBe(1);
	});

	test('top-level order: the known keys in their fixed order, then the unknown ones in the order they were written', () => {
		const m = parseLikePipeline(source);
		m.current_patience = 2;
		expect(keysOf(serialize(m))).toEqual([
			'name', 'initial_patience', 'current_patience', 'initial_interest', 'motivations', 'pitfalls', 'i5', 'i4', 'i3', 'i2', 'i1', 'i0',
			'note_to_self', 'gm_meta', 'zz_last',
		]);
	});

	test('a motivation and a pitfall keep their unknown keys (nested values too), after their known keys, in their original order', () => {
		const m = parseLikePipeline(source);
		m.current_patience = 2;
		const out = parseYaml(serialize(m));
		expect(out.motivations[0]).toEqual({ name: 'Legacy', reason: 'heir', hasBeenAppealedTo: false, gm_note: 'ask about the sister', odds: { high: 2 } });
		expect(Object.keys(out.motivations[0])).toEqual(['name', 'reason', 'hasBeenAppealedTo', 'gm_note', 'odds']);
		expect(out.motivations[1]).toEqual({ name: 'Coin', reason: 'money', seen_by: ['Sam', 'Bo'] });
		expect(out.pitfalls[0]).toEqual({ name: 'Pride', reason: 'charity', gm_note: 'never mention the war', tags: ['x'] });
		expect(Object.keys(out.pitfalls[0])).toEqual(['name', 'reason', 'gm_note', 'tags']);
	});

	test('a write that touches a motivation itself (Spent) keeps that motivation\'s own keys, and a write that touches another keeps them too', () => {
		const m = parseLikePipeline(source);
		m.setMotivationUsed('Legacy', true);
		expect(parseYaml(serialize(m)).motivations[0]).toEqual(MOT_0);
		m.setMotivationUsed('Coin', true);
		const out = parseYaml(serialize(m));
		expect(out.motivations[0]).toEqual(MOT_0);
		expect(out.motivations[1]).toEqual({ name: 'Coin', reason: 'money', hasBeenAppealedTo: true, seen_by: ['Sam', 'Bo'] });
	});

	test('Reset keeps every unknown key: it resets the tracker, not the Director\'s own keys', () => {
		const m = parseLikePipeline(source);
		m.current_interest = 4;
		m.setMotivationUsed('Legacy', true);
		m.resetData();
		const out = parseYaml(serialize(m));
		expect(out.current_interest).toBeUndefined(); // back at the initial 3, which the block never declared as a current value (SC-482)
		expect(out.note_to_self).toBe('keep me');
		expect(out.motivations[0]).toMatchObject({ gm_note: 'ask about the sister', odds: { high: 2 } });
		expect(out.pitfalls[0].gm_note).toBe('never mention the war');
	});

	test('serialize never touches the live model, and a second pass over its own output is byte-identical', () => {
		const m = parseLikePipeline(source);
		const once = serialize(m);
		expect(serialize(m)).toBe(once);
		expect(Object.keys(m)).not.toContain('note_to_self');
		expect(Object.keys(m.motivations[0])).toEqual(['name', 'reason', 'hasBeenAppealedTo']);
		expect(serialize(parseLikePipeline(once))).toBe(once);
	});

	test('every key the negotiation reads is known and never carried as unknown: only the Director\'s own keys are', () => {
		const all = [
			'name: n', 'initial_patience: 4', 'current_patience: 2', 'initial_interest: 3', 'current_interest: 1', '_dse_anchor: a1b2c3',
			'motivations:', '  - name: " Padded "', '    reason: ""', '    hasBeenAppealedTo: true', '    extra_m: 1',
			'pitfalls:', '  - name: P', '    reason: r', '    extra_p: 2',
			'currentArgument:', '  motivationsUsed: []', '  pitfallsUsed: []', '  lieUsed: false', '  sameArgumentUsed: false', '  reusedMotivation: false',
			'i5: a', 'i4: b', 'i3: c', 'i2: d', 'i1: e', 'i0: f', 'extra_top: 3',
		].join('\n');
		const m = parseLikePipeline(all);
		expect(unknownKeysOf(m).map(([key]) => key)).toEqual(['extra_top']);
		expect(unknownKeysOf(m.motivations[0]).map(([key]) => key)).toEqual(['extra_m']);
		expect(unknownKeysOf(m.pitfalls[0]).map(([key]) => key)).toEqual(['extra_p']);
		const out = parseYaml(serialize(m));
		expect(out.motivations[0]).toEqual({ name: 'Padded', reason: '', hasBeenAppealedTo: true, extra_m: 1 }); // `name` is trimmed as before, `reason: ""` is not resurrected twice
		expect(Object.keys(out).filter((key) => key === 'extra_top')).toHaveLength(1);
	});

	test('a motivation that is not a mapping carries no keys (a string would otherwise yield its indices), and a block with nothing unknown writes no extra key', () => {
		const m = parseLikePipeline('name: n\nmotivations:\n  - plain\n  - [a, b]\npitfalls: [x]');
		expect(unknownKeysOf(m.motivations[0])).toEqual([]);
		expect(unknownKeysOf(m.motivations[1])).toEqual([]);
		expect(unknownKeysOf(m.pitfalls[0])).toEqual([]);
		const known = 'name: n\ninitial_patience: 3\ninitial_interest: 2';
		expect(keysOf(serialize(parseLikePipeline(known)))).toEqual(['name', 'initial_patience', 'initial_interest']);
	});

	test('a model the plugin builds itself (no source) and a motivation made by hand carry no unknown keys', () => {
		const built = new NegotiationData({ name: 'Built' });
		expect(unknownKeysOf(built)).toEqual([]);
		expect(unknownKeysOf(new Motivation({ name: 'M' }))).toEqual([]);
		expect(unknownKeysOf(new Pitfall({ name: 'P' }))).toEqual([]);
		expect(keysOf(serialize(built))).not.toContain('note_to_self');
	});

	test('`__proto__`, `constructor`, `toString`, `hasOwnProperty` and `toJSON` keys in hand-written YAML pollute nothing, do not crash and come back as plain keys, at all three levels', () => {
		const level = (tag: string, indent: string): string =>
			[`__proto__:`, `  polluted: yes`, `constructor: c-${tag}`, `toString: s-${tag}`, `hasOwnProperty: h-${tag}`, `toJSON: j-${tag}`].map((line) => indent + line).join('\n');
		const text = [
			'name: n', 'initial_patience: 3', 'initial_interest: 2',
			'motivations:', '  - name: M', '    reason: r', level('m', '    '),
			'pitfalls:', '  - name: P', '    reason: r', level('p', '    '),
			level('top', ''),
		].join('\n');
		const m = parseLikePipeline(text);
		m.current_patience = 1;
		const out = serialize(m);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		expect(Object.getPrototypeOf(m)).toBe(NegotiationData.prototype);
		expect(Object.getPrototypeOf(m.motivations[0])).toBe(Motivation.prototype);
		expect(Object.getPrototypeOf(m.pitfalls[0])).toBe(Pitfall.prototype);
		expect(typeof m.ending).toBe('function'); // no member of the model was shadowed
		expect(m.ending()).toBeNull();
		expect(out).toContain('polluted');
		const back = parseYaml(out);
		expect(back.current_patience).toBe(1);
		expect([back.constructor, back.toString, back.hasOwnProperty, back.toJSON]).toEqual(['c-top', 's-top', 'h-top', 'j-top']);
		expect([back.motivations[0].constructor, back.motivations[0].toString, back.motivations[0].hasOwnProperty, back.motivations[0].toJSON]).toEqual(['c-m', 's-m', 'h-m', 'j-m']);
		expect([back.pitfalls[0].constructor, back.pitfalls[0].toString, back.pitfalls[0].hasOwnProperty, back.pitfalls[0].toJSON]).toEqual(['c-p', 's-p', 'h-p', 'j-p']);
		expect(Object.keys(back).slice(-5)).toEqual(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'toJSON']);
	});

	test('a key named like a NegotiationData method or field (`ending`, `offerFor`, `resetData`, `Name`, `current_Patience`) is only data: it is written back and shadows nothing, at all three levels', () => {
		const text = [
			'name: n', 'initial_patience: 3', 'initial_interest: 2',
			'motivations:', '  - name: M', '    reason: r', '    resetData: m-reset', '    Name: m-name',
			'pitfalls:', '  - name: P', '    reason: r', '    resetData: p-reset', '    Reason: p-reason',
			'ending: top-ending', 'offerFor: top-offer', 'resetData: top-reset', 'current_Patience: top-case',
		].join('\n');
		const m = parseLikePipeline(text);
		expect(m.ending()).toBeNull();
		expect(m.offerFor(3)).toBe('Interest 3 result');
		m.current_patience = 2;
		m.setMotivationUsed('M', true);
		m.resetData();
		expect(m.current_patience).toBe(3);
		const back = parseYaml(serialize(m));
		expect([back.ending, back.offerFor, back.resetData, back.current_Patience]).toEqual(['top-ending', 'top-offer', 'top-reset', 'top-case']);
		expect(back.motivations[0]).toMatchObject({ name: 'M', resetData: 'm-reset', Name: 'm-name' });
		expect(back.pitfalls[0]).toMatchObject({ name: 'P', resetData: 'p-reset', Reason: 'p-reason' });
		expect(back.current_patience).toBeUndefined(); // reset to the initial value, so the undeclared key is not written
	});

	test('a key that looks like an integer is written FIRST, quoted (JavaScript key order, pinned so nobody "fixes" it by accident), at all three levels', () => {
		const m = parseLikePipeline([
			'name: n', 'initial_patience: 3', 'initial_interest: 2', 'notes: a', '2024: year',
			'motivations:', '  - name: M', '    reason: r', '    7: seven', '    tag: x',
			'pitfalls:', '  - name: P', '    reason: r', '    9: nine',
		].join('\n'));
		const out = serialize(m);
		expect(out.split('\n')[0]).toBe('"2024": year');
		expect(out.split('\n')[1]).toBe('name: n');
		expect(out).toContain('  - "7": seven\n    name: M');
		expect(out).toContain('  - "9": nine\n    name: P');
		expect(parseYaml(out).notes).toBe('a');
		expect(serialize(parseLikePipeline(out))).toBe(out); // and it is stable on the next pass
	});
});

// SC-637 — the Director's own keys inside `currentArgument:` belong to that argument: every write that keeps the argument keeps them
// (known keys in the existing order, then the unknown ones in their original order), and Complete Argument / Reset, which end the
// argument through `CurrentArgument.resetData`, end them with it.
describe('keys inside currentArgument survive while the argument does (SC-637)', () => {
	const KNOWN_ARG_KEYS = ['motivationsUsed', 'pitfallsUsed', 'lieUsed', 'sameArgumentUsed', 'reusedMotivation'];
	const source = [
		'name: The Duke',
		'initial_interest: 3',
		'initial_patience: 3',
		'motivations:',
		'  - name: Legacy',
		'    reason: heir',
		'  - name: Coin',
		'    reason: money',
		'pitfalls:',
		'  - name: Pride',
		'    reason: charity',
		'currentArgument:',
		'  arg_note: keep me',
		'  lieUsed: false',
		'  motivationsUsed: [Legacy]',
		'  arg_meta:',
		'    who: Sam',
		'    tags: [a, b]',
		'  pitfallsUsed: []',
		'  sameArgumentUsed: false',
		'  reusedMotivation: false',
		'  zz_last: 9',
		'i5: five', 'i4: four', 'i3: three', 'i2: two', 'i1: one', 'i0: zero',
	].join('\n');
	const EXTRAS = { arg_note: 'keep me', arg_meta: { who: 'Sam', tags: ['a', 'b'] }, zz_last: 9 };

	test('the argument keeps its unknown keys (a scalar, a nested map, a list) by value after each write that keeps it: a chip, a modifier, a standing change, a Spent chip', () => {
		const m = parseLikePipeline(source);
		m.currentArgument.motivationsUsed.push('Coin'); // an appeal chip
		m.currentArgument.pitfallsUsed.push('Pride'); // a pitfall chip
		m.currentArgument.lieUsed = true; // a modifier checkbox
		m.current_patience = 1; // a Patience seal
		m.current_interest = 4; // an Interest row
		m.setMotivationUsed('Legacy', true); // a Spent chip (also flips reusedMotivation inside the argument)
		const arg = parseYaml(serialize(m)).currentArgument;
		expect(arg).toMatchObject({ ...EXTRAS, motivationsUsed: ['Legacy', 'Coin'], pitfallsUsed: ['Pride'], lieUsed: true, reusedMotivation: true });
	});

	test('order inside the argument: the five known keys in their fixed order, then the unknown ones in the order they were written', () => {
		const m = parseLikePipeline(source);
		m.currentArgument.lieUsed = true;
		expect(Object.keys(parseYaml(serialize(m)).currentArgument)).toEqual([...KNOWN_ARG_KEYS, 'arg_note', 'arg_meta', 'zz_last']);
	});

	test('Complete Argument ends the argument and its unknown keys with it; the rest of the block keeps its own', () => {
		const m = parseLikePipeline(source + '\nnote_to_self: top');
		m.currentArgument.resetData(); // what Complete Argument does to the argument
		const out = parseYaml(serialize(m));
		expect(out.currentArgument).toEqual({ motivationsUsed: [], pitfallsUsed: [], lieUsed: false, sameArgumentUsed: false, reusedMotivation: false });
		expect(out.note_to_self).toBe('top');
		expect(unknownKeysOf(m.currentArgument)).toEqual([]);
	});

	test('Reset ends the argument and its unknown keys with it; the block\'s own keys stay', () => {
		const m = parseLikePipeline(source + '\nnote_to_self: top');
		m.setMotivationUsed('Legacy', true);
		m.resetData();
		const out = parseYaml(serialize(m));
		expect(Object.keys(out.currentArgument)).toEqual(KNOWN_ARG_KEYS);
		expect(out.note_to_self).toBe('top');
	});

	test('a new argument chosen after the old one ended carries nothing from it', () => {
		const m = parseLikePipeline(source);
		m.currentArgument.resetData();
		m.currentArgument.motivationsUsed.push('Coin');
		expect(Object.keys(parseYaml(serialize(m)).currentArgument)).toEqual(KNOWN_ARG_KEYS);
	});

	test('only the Director\'s keys are carried: the five the negotiation reads never are', () => {
		const m = parseLikePipeline(source);
		expect(unknownKeysOf(m.currentArgument).map(([key]) => key)).toEqual(['arg_note', 'arg_meta', 'zz_last']);
	});

	test('no argument in the source, or one that is not a mapping, carries no keys and writes none', () => {
		const none = parseLikePipeline('name: n\ninitial_patience: 3');
		expect(unknownKeysOf(none.currentArgument)).toEqual([]);
		const odd = parseLikePipeline('name: n\ninitial_patience: 3\ncurrentArgument: plain');
		expect(unknownKeysOf(odd.currentArgument)).toEqual([]);
		odd.current_patience = 1;
		expect(Object.keys(parseYaml(serialize(odd)).currentArgument)).toEqual(KNOWN_ARG_KEYS);
	});

	test('serialize writes the argument from a copy: the live argument gains no own key, and a second pass is byte-identical', () => {
		const m = parseLikePipeline(source);
		const once = serialize(m);
		expect(Object.keys(m.currentArgument)).toEqual(KNOWN_ARG_KEYS);
		expect(serialize(m)).toBe(once);
		expect(serialize(parseLikePipeline(once))).toBe(once);
	});

	test('`__proto__`, `constructor`, `toString`, `hasOwnProperty`, `toJSON` and keys named like its methods and fields pollute and shadow nothing, and come back as plain keys', () => {
		const text = [
			'name: n', 'initial_patience: 3', 'initial_interest: 2',
			'currentArgument:',
			'  __proto__:', '    polluted: yes', '  constructor: c', '  toString: s', '  hasOwnProperty: h', '  toJSON: j',
			'  usesMotivation: um', '  resetData: rd', '  LieUsed: ll', '  lie_used: lu',
		].join('\n');
		const m = parseLikePipeline(text);
		m.currentArgument.lieUsed = true;
		const out = serialize(m);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		expect(Object.getPrototypeOf(m.currentArgument)).toBe(CurrentArgument.prototype);
		expect(typeof m.currentArgument.usesMotivation).toBe('function');
		expect(typeof m.currentArgument.resetData).toBe('function');
		expect(m.currentArgument.usesMotivation()).toBe(false);
		expect(out).toContain('polluted');
		const arg = parseYaml(out).currentArgument;
		expect([arg.constructor, arg.toString, arg.hasOwnProperty, arg.toJSON]).toEqual(['c', 's', 'h', 'j']);
		expect([arg.usesMotivation, arg.resetData, arg.LieUsed, arg.lie_used]).toEqual(['um', 'rd', 'll', 'lu']);
		expect(arg.lieUsed).toBe(true);
		expect(Object.keys(arg).slice(5)).toEqual(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'toJSON', 'usesMotivation', 'resetData', 'LieUsed', 'lie_used']);
	});

	test('a key that looks like an integer inside the argument is written first, quoted (JavaScript key order, pinned)', () => {
		const m = parseLikePipeline('name: n\ninitial_patience: 3\ncurrentArgument:\n  lieUsed: true\n  3: three\n  note: x');
		const out = serialize(m);
		expect(out).toContain('currentArgument:\n  "3": three\n  motivationsUsed: []');
		expect(serialize(parseLikePipeline(out))).toBe(out);
	});
});
