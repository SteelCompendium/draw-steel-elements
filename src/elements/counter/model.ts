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

// SC-671 — a key the counter does not read (a user's own `note_to_self:`, an `extra:` map) used to be deleted from the note by the
// first write, because `serialize` writes the `Counter` instance and `Counter.parse` copies seven named fields. The unknown top-level keys
// are now remembered per instance and written back after the known ones (`max_value`, `current_value`, `min_value`, `name`,
// `value_height`, `name_height`, `_dse_anchor`), in their original relative order. "Known" is every key the counter READS: there is no
// alias, the view only reads the model. A known key is never carried here whatever its value (a wrong-typed or falsy one keeps its
// parse behaviour). The framework-reserved wrapper keys (`prefs`, `collapsed`, `collapsible`, `collapse_default`) never reach `parse`
// (the pipeline pops them and `withReservedKeys` writes them once), so they are not unknown keys either.
//
// Where they live: a module-private WeakMap keyed by the parsed instance, NOT own properties of `Counter` (negotiation's choice, not
// montage's). `Counter` is a class that `serialize` writes whole: an own property would be written as a key by anything that serializes
// the instance, and a user key named like a field, a method or the prototype (`name`, `current_value`, `constructor`, `toJSON`,
// `__proto__`) would overwrite or shadow it. In the map no YAML key can do that: the pairs are only read back by `serialize`, which
// puts them into a plain DTO with `Object.fromEntries` (defines own data properties, so `__proto__` is an ordinary key there too).
// A re-parse (outside edit, sidebar refresh) builds a new instance with the keys of its new source, so a stale set can never survive one.
//
// A key that looks like an integer (`2024:`) is written FIRST, ahead of the known keys, and comes back quoted: that is JavaScript's own
// object key order, not a choice (SC-625's precedent), and a unit test pins it. The value is carried as it parsed (a nested map or list
// included); its formatting is whatever `stringifyYaml` does today (SC-599's question, not this one). A block with no unknown keys
// serializes exactly as before.
// Exported only so a unit test can tie this list to the `Counter` fields (a field added to `Counter.parse` must be added here).
export const KNOWN_KEYS: ReadonlySet<string> = new Set([
	'max_value', 'current_value', 'min_value', 'name', 'value_height', 'name_height', '_dse_anchor',
]);

const unknownKeys = new WeakMap<Counter, ReadonlyArray<readonly [string, unknown]>>();

/** The own enumerable string keys of `source` that the counter does not read, as pairs in their original order; none for a value that is
 *  not a mapping (a string or a list would otherwise yield its indices). */
function unknownPairs(source: unknown): Array<readonly [string, unknown]> {
	if (source === null || typeof source !== 'object' || Array.isArray(source)) return [];
	return Object.entries(source).filter(([key]) => !KNOWN_KEYS.has(key));
}

/** The keys Counter.parse fills a default into when the source did not declare them (SC-482). */
const PARSER_DEFAULT_KEYS = ['current_value', 'min_value', 'value_height', 'name_height'] as const;

export const parse = recordingDefaults(
	(data: unknown, _raw: string): Counter => {
		const model = Counter.parse(data);
		const pairs = unknownPairs(data);
		if (pairs.length > 0) unknownKeys.set(model, pairs);
		return model;
	},
	PARSER_DEFAULT_KEYS,
);

export function serialize(model: Counter): string {
	const extras = unknownKeys.get(model);
	if (!extras) return stringifyOmittingUntouched(model);
	// A carried pair whose key the model owns is dropped (a field added to `Counter` and missing from KNOWN_KEYS would otherwise let the
	// source's stale value overwrite the live one: `fromEntries` keeps the last duplicate).
	const carried = extras.filter(([key]) => !Object.prototype.hasOwnProperty.call(model, key));
	// `fromEntries`, never an assignment: a hand-written `__proto__:` key must become a plain own key, not set the prototype.
	return stringifyOmittingUntouched(model, Object.fromEntries([...Object.entries(model), ...carried]));
}
