// Plan 05 Task 4 — negotiation model.ts: parse(data, raw) wraps the existing
// @model/NegotiationData class VERBATIM (same convention as elements/stamina-bar/model.ts
// and elements/skills/model.ts). The pipeline has already YAML-parsed the block source
// (pipeline.ts step 2: `parseYaml(source)`) before calling this, so constructing the class
// from `data` is exactly what the legacy parseNegotiationData(source) did after its own
// parseYaml — one parse, same constructor, same defaults materialization (current_patience
// ?? initial_patience ?? 5, current_interest ?? initial_interest ?? 0, i5..i0 placeholders,
// nested Motivation/Pitfall/CurrentArgument instances). `raw` is unused: NegotiationData
// has no SDK reader that needs the original source text.
//
// serialize(model): the BYTE-COMPAT boundary (narrowed by SC-482, below). The legacy write path
// (the former CodeBlocks.updateNegotiationTracker -> updateCodeBlock -> updateMarkdownCodeBlock,
// src/utils/CodeBlocks.ts — deleted in SC-454) did exactly `stringifyYaml(data).trim()`
// where `data` IS the whole NegotiationData class instance the processor holds — no DTO
// projection. Reusing the SAME class instance here is itself the compatibility guarantee:
// field set + insertion order (name, initial_patience, current_patience, initial_interest,
// current_interest, motivations, pitfalls, currentArgument, i5..i0) fall out of
// NegotiationData's own constructor assignment order, unchanged. `.trim()` matches the
// legacy writer exactly and is also required by ReadingModeBlockHost.replaceSource, which
// does `newSource.split('\n')` — an untrimmed trailing "\n" from stringifyYaml would
// otherwise splice a spurious blank line before the closing fence.
// Byte-fidelity of free text (long motivation/pitfall reasons folding as plain scalars,
// multi-line i5..i0 as `|-` literal blocks) is pinned by
// test/unit/model/negotiation-serialize.test.ts on the Task-2 faithful `yaml` serializer.
//
// SC-482 contract (narrows that byte-compat ONLY for keys absent from the source): NegotiationData
// fills defaults into own properties (current_patience / current_interest derived from the
// initial_* values, motivations / pitfalls [], currentArgument {5 keys}, i5..i0 placeholders) and
// each Motivation / Pitfall fills name / reason ('') and hasBeenAppealedTo (false), and the legacy
// writer leaked all of it into the user's note on the first change. A key is now OMITTED from the
// written block iff it was ABSENT from the parsed source AND its value at write time still equals
// what the parser filled in — compared by value, so a derived default (current_patience =
// initial_patience) is omitted while unchanged and written once it moves. Every key the source
// declared is written (even if equal to its default); an absent key whose value changed is
// written; key ORDER is unchanged (class order), so a block that declares every key serializes
// byte-identically to before. Each Motivation / Pitfall records its OWN absent keys from its own
// raw item. The record lives in src/elements/shared/undeclaredDefaults.ts (a per-instance
// WeakMap, never an own property); a model the plugin builds itself keeps the whole output.
import { stringifyYaml } from 'obsidian';
import { NegotiationData } from '@model/NegotiationData';
import { omitUntouchedDefaults, recordAbsentDefaults, recordingDefaults } from '../shared/undeclaredDefaults';

/** The top-level keys NegotiationData fills a default into when the source did not declare them (SC-482). */
const PARSER_DEFAULT_KEYS = [
	'current_patience',
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
] as const;
/** The keys Motivation / Pitfall fill a default into when their raw item did not declare them. */
const MOTIVATION_DEFAULT_KEYS = ['name', 'reason', 'hasBeenAppealedTo'] as const;
const PITFALL_DEFAULT_KEYS = ['name', 'reason'] as const;

/** Record, on each nested instance, which of `keys` its own raw item left out (index-aligned with the parse). */
function recordNested(instances: readonly object[], rawItems: unknown, keys: readonly string[]): void {
	const raw = Array.isArray(rawItems) ? rawItems : [];
	instances.forEach((instance, index) => {
		const item = typeof raw[index] === 'object' && raw[index] !== null ? (raw[index] as Record<string, unknown>) : {};
		recordAbsentDefaults(instance, keys.filter((key) => item[key] === undefined));
	});
}

function parseModel(data: unknown, _raw: string): NegotiationData {
	const model = new NegotiationData(data as Partial<NegotiationData>);
	const declared = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
	recordNested(model.motivations, declared.motivations, MOTIVATION_DEFAULT_KEYS);
	recordNested(model.pitfalls, declared.pitfalls, PITFALL_DEFAULT_KEYS);
	return model;
}

export const parse = recordingDefaults(parseModel, PARSER_DEFAULT_KEYS);

export function serialize(model: NegotiationData): string {
	// A fresh object in the model's own key order, so reassigning `motivations` / `pitfalls` below
	// keeps their position (and never touches the live model).
	const kept = omitUntouchedDefaults(model);
	// An empty source whose values returned to their defaults: write an empty body, not `{}`.
	if (kept !== model && Object.values(kept).every((value) => value === undefined)) return '';
	const written: Record<string, unknown> = { ...kept };
	if (Array.isArray(written.motivations)) written.motivations = model.motivations.map((m) => omitUntouchedDefaults(m));
	if (Array.isArray(written.pitfalls)) written.pitfalls = model.pitfalls.map((p) => omitUntouchedDefaults(p));
	return stringifyYaml(written).trim();
}
