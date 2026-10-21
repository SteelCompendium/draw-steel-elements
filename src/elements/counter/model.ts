// Plan 07 Task 4 (F1 §6 step 7) — counter model.ts: parse(data, raw) wraps the existing
// @model/Counter class VERBATIM (same convention as elements/stamina-bar/model.ts and
// elements/skills/model.ts). The pipeline has already YAML-parsed the block source
// (pipeline.ts step 2: `parseYaml(source)`) before calling this, so Counter.parse(data)
// is exactly what the legacy Counter.parseYaml(source) did after its own parseYaml — one
// parse, same defaults materialization (current_value ?: 0, min_value ?: 0,
// value_height ?: 3, name_height ?: 1; max_value stays undefined when absent). `raw` is
// unused: Counter has no SDK reader that needs the original source text.
//
// SC-482 contract (narrows the byte-compat below ONLY for keys absent from the source): those
// four materialized defaults used to leak into the user's note on the first write (a counter
// with `name` + `max_value` came back with `min_value: 0`, `value_height: 3`, `name_height: 1`).
// A key is now OMITTED from the written block iff it was ABSENT from the parsed source AND its
// value at write time still equals the default the parser filled in. Every key the source
// declared is written (even if equal to its default, incl. an authored `value_height: 0` that
// the parser reads as 3 — written as 3, as before); an absent key whose value changed is
// written (the first + on a counter with no `current_value`); key ORDER is unchanged, so a block
// that declares every key serializes byte-identically to before. The record of "which defaults
// did the source omit" lives in src/elements/shared/undeclaredDefaults.ts (a per-instance
// WeakMap, never an own property). A Counter the plugin builds itself was never parsed here,
// has no record, and keeps the whole-instance output.
//
// serialize(model): the BYTE-COMPAT boundary (narrowed by SC-482, above). The legacy write path
// (the former CodeBlocks.updateCounter -> updateCodeBlock -> updateMarkdownCodeBlock,
// src/utils/CodeBlocks.ts — deleted in SC-454) did exactly `stringifyYaml(data).trim()`
// where `data` IS the whole Counter class instance the legacy CounterView held — no DTO
// projection. Reusing the SAME class instance here is itself the compatibility guarantee:
// field set + insertion order (max_value, current_value, min_value, name, value_height,
// name_height) fall out of Counter's own constructor assignment order, unchanged — and an
// undefined max_value is OMITTED from the output (yaml's default keepUndefined: false),
// never emitted as `max_value: null`. `.trim()` matches the legacy writer exactly and is
// also required by ReadingModeBlockHost.replaceSource, which does
// `newSource.split('\n')` — an untrimmed trailing "\n" from stringifyYaml would otherwise
// splice a spurious blank line before the closing fence.
import { Counter } from '@model/Counter';
import { recordingDefaults, stringifyOmittingUntouched } from '../shared/undeclaredDefaults';

/** The keys Counter.parse fills a default into when the source did not declare them (SC-482). */
const PARSER_DEFAULT_KEYS = ['current_value', 'min_value', 'value_height', 'name_height'] as const;

export const parse = recordingDefaults((data: unknown, _raw: string): Counter => Counter.parse(data), PARSER_DEFAULT_KEYS);

export function serialize(model: Counter): string {
	return stringifyOmittingUntouched(model);
}
