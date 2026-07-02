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
// serialize(model): the BYTE-COMPAT boundary. The legacy write path
// (CodeBlocks.updateNegotiationTracker -> updateCodeBlock -> updateMarkdownCodeBlock,
// src/utils/CodeBlocks.ts:102; canvas path :79) does exactly `stringifyYaml(data).trim()`
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
import { stringifyYaml } from 'obsidian';
import { NegotiationData } from '@model/NegotiationData';

export function parse(data: unknown, _raw: string): NegotiationData {
	return new NegotiationData(data as Partial<NegotiationData>);
}

export function serialize(model: NegotiationData): string {
	return stringifyYaml(model).trim();
}
