// Plan 07 Task 4 (F1 §6 step 7) — counter model.ts: parse(data, raw) wraps the existing
// @model/Counter class VERBATIM (same convention as elements/stamina-bar/model.ts and
// elements/skills/model.ts). The pipeline has already YAML-parsed the block source
// (pipeline.ts step 2: `parseYaml(source)`) before calling this, so Counter.parse(data)
// is exactly what the legacy Counter.parseYaml(source) did after its own parseYaml — one
// parse, same defaults materialization (current_value ?: 0, min_value ?: 0,
// value_height ?: 3, name_height ?: 1; max_value stays undefined when absent). `raw` is
// unused: Counter has no SDK reader that needs the original source text.
//
// serialize(model): the BYTE-COMPAT boundary. The legacy write path
// (CodeBlocks.updateCounter -> updateCodeBlock -> updateMarkdownCodeBlock,
// src/utils/CodeBlocks.ts:102; canvas path :79) does exactly `stringifyYaml(data).trim()`
// where `data` IS the whole Counter class instance the legacy CounterView held — no DTO
// projection. Reusing the SAME class instance here is itself the compatibility guarantee:
// field set + insertion order (max_value, current_value, min_value, name, value_height,
// name_height) fall out of Counter's own constructor assignment order, unchanged — and an
// undefined max_value is OMITTED from the output (yaml's default keepUndefined: false),
// never emitted as `max_value: null`. `.trim()` matches the legacy writer exactly and is
// also required by ReadingModeBlockHost.replaceSource, which does
// `newSource.split('\n')` — an untrimmed trailing "\n" from stringifyYaml would otherwise
// splice a spurious blank line before the closing fence.
import { stringifyYaml } from 'obsidian';
import { Counter } from '@model/Counter';

export function parse(data: unknown, _raw: string): Counter {
	return Counter.parse(data);
}

export function serialize(model: Counter): string {
	return stringifyYaml(model).trim();
}
