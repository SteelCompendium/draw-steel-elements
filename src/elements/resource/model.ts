// D7 Task 3 (spec §4.1) — ds-resource model: parse + byte-stable serialize for the
// class-aware heroic resource tracker. BRAND NEW element (no legacy predecessor).
//
// Class defaulting (type/min from RESOURCE_BY_CLASS, resourceByClass.ts) happens AT
// RENDER (view.ts/panel.ts, via resolveResource) — NOT here. parse() copies through only
// the keys the author actually wrote, so `class: fury` / `current: 4` alone never
// materializes `type: Ferocity` / `min: 0` onto the in-memory model, and serialize()
// then only ever emits keys that were authored (or later explicitly set by the user via
// an override) — "keep authored YAML honest" (spec §4.1). This mirrors
// elements/conditions/model.ts's normalize/down-convert shape (parse fully validates,
// serialize is a pure projection) but WITHOUT conditions' normalization step: there is
// nothing to normalize here, only keys to pass through or omit.
import { stringifyYaml } from 'obsidian';

export interface ResourceModel {
	/** Class key (e.g. "fury", "talent") — arbitrary casing as authored; resolveResource
	 *  lowercases it for the RESOURCE_BY_CLASS lookup. Absent = no class-aware defaulting
	 *  (a bare/generic resource). */
	class?: string;
	/** Explicit resource-name override (spec §4.1's resolveResource `overrides.type`).
	 *  Absent = the class's default name (or "Resource" if unrecognized/absent). */
	type?: string;
	/** Signed (spec §1.2: Talent Clarity goes negative). Required — every ds-resource
	 *  block must author a current value. */
	current: number;
	/** Explicit floor override (spec §4.1's resolveResource `overrides.min`). Absent =
	 *  the class's default floor (0, except Talent). */
	min?: number;
	/** Optional ceiling. Absent = unbounded (the stepper's plus button never disables). */
	max?: number;
}

export function parse(input: unknown, _raw: string): ResourceModel {
	if (typeof input !== 'object' || input === null) {
		throw new Error('The input must be a YAML object.');
	}
	const data = input as Record<string, unknown>;
	if (typeof data.current !== 'number') {
		throw new Error("ds-resource requires a numeric 'current' field.");
	}
	const model: ResourceModel = { current: data.current };
	if (typeof data.class === 'string') model.class = data.class;
	if (typeof data.type === 'string') model.type = data.type;
	if (typeof data.min === 'number') model.min = data.min;
	if (typeof data.max === 'number') model.max = data.max;
	return model;
}

/** Field order (class, type, current, min, max) matches the schema's own property
 *  order and the spec §4.1 example (`class:` then `current:`) — undefined keys are
 *  simply never assigned onto `dto`, so yaml's stringifyYaml (keepUndefined: false by
 *  default) omits them entirely, the same convention as counter/model.ts's max_value. */
export function serialize(model: ResourceModel): string {
	const dto: Record<string, unknown> = {};
	if (model.class !== undefined) dto.class = model.class;
	if (model.type !== undefined) dto.type = model.type;
	dto.current = model.current;
	if (model.min !== undefined) dto.min = model.min;
	if (model.max !== undefined) dto.max = model.max;
	return stringifyYaml(dto).trim();
}
