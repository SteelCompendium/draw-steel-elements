// src/framework/prefOverrides.ts — D4 §1.3/§1.4 (Plan 13): the reserved per-block
// `prefs:` override map.
//
// Pipeline-generic (OD-D4-2): the map is popped from the parsed YAML BEFORE schema
// validation (schemas never see the reserved key) and BEFORE def.parse (it never
// enters any semantic model). Presentation keys only — behavioral keys have their
// own per-block spelling (collapsible:/collapse_default:) and are warned+ignored
// here, as are unknown keys (console.warn, NOT an error card — the block renders).
//
// THREE rejection classes, all warn-and-ignore (SC-123 fix round, review M-1 added
// the third): unknown keys; attr-less keys (behavioral, or SC-112's css-bearing
// typography — global-only by design); and `perBlock: false` keys, the CONDITIONAL-DOM
// preferences whose value a view reads at BUILD time. The last one is a hard structural
// limit, not a policy choice: this module runs AFTER the view mounted and re-stamps an
// ATTRIBUTE only, so an accepted override there would pair the global DOM shape with a
// local attribute — measured as the corrupt `"+2Might"` characteristics cell.
//
// Override-wins mechanics (OD-D4-3a): applyPrefOverrides runs AFTER the pipeline's
// cx.prefs.reflect(root, view), so its subscribe() callbacks register after
// reflect's. On any global change to a pinned key, reflect stamps the global value
// first, then the pin re-stamps the override — deterministic listener order, no F1
// signature change.
//
// Round-trip (persisted elements): replaceSource rewrites the whole block body from
// def.serialize(model), which would silently DROP the author's `prefs:` line on the
// first interaction. SC-652: anything the read removed from the block comes back on write, BY VALUE
// -- the whole `prefs:` value as the author wrote it (applied overrides, unknown/typo keys, attr-less
// and `perBlock: false` keys, SC-406 gated keys, even a value that is not a map at all), in the
// author's key order. withPrefOverrides re-emits it (re-stringified via the same stringifyYaml the
// serializers use, so formatting may normalize -- key order and values are preserved; blocks WITHOUT
// a `prefs:` key are byte-untouched because the wrapper is only installed when the key was present).
// Reading is unchanged: a kept-but-unusable key still warns and is still not applied.
import { stringifyYaml } from 'obsidian';
import type { Component } from 'obsidian';
import type { DsePrefs, PreferenceStore } from './seams/prefs';

/**
 * SC-652 (generalising SC-406's gated-key passthrough) -- the author's `prefs:` value, held aside so a
 * later write can put it back exactly as it was read. `extractPrefOverrides` fills this in whenever the
 * block HAS a `prefs:` key, whatever is under it: a map (every key, applied or not -- an unknown or
 * typo key, an attr-less key, a `perBlock: false` key, a SC-406 gated key with the switch on or off), or
 * a value that is not a map at all (`prefs: compact`, a list, nothing). `value` is the parsed value, by
 * reference, in the author's key order. `present` is false for a block without the key, in which case
 * no wrapper is installed and the block is byte-untouched.
 */
export interface PrefPassthrough {
	present: boolean;
	value: unknown;
}

/** A fresh, empty passthrough for `extractPrefOverrides` to fill in. */
export function emptyPrefPassthrough(): PrefPassthrough {
	return { present: false, value: undefined };
}

/**
 * Pops the reserved `prefs:` key off the parsed block data (mutates rawData) and
 * returns the validated presentation-only override bag, or undefined when absent
 * or empty after validation.
 */
export function extractPrefOverrides(
	rawData: unknown,
	prefs: PreferenceStore,
	/** SC-652: when given, receives the author's whole `prefs:` value so a write can keep it (see PrefPassthrough). */
	passthrough?: PrefPassthrough,
): Partial<DsePrefs> | undefined {
	if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return undefined;
	const record = rawData as Record<string, unknown>;
	if (!Object.prototype.hasOwnProperty.call(record, 'prefs')) return undefined;
	const bag = record.prefs;
	delete record.prefs;
	if (passthrough) {
		passthrough.present = true;
		passthrough.value = bag;
	}
	if (!bag || typeof bag !== 'object' || Array.isArray(bag)) {
		console.warn('Draw Steel Elements: the per-block `prefs:` key must be a map of preference keys — ignoring it.');
		return undefined;
	}
	const byKey = new Map(prefs.descriptors().map((d) => [d.key as string, d]));
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(bag)) {
		const descriptor = byKey.get(key);
		if (!descriptor) {
			console.warn(`Draw Steel Elements: ignoring unknown per-block pref "${key}".`);
			continue;
		}
		if (!descriptor.attr) {
			// Also lands here by design: css-bearing keys (SC-112 font/scale prefs) are
			// intentionally GLOBAL-ONLY — per-block prefs: supports attr-reflected keys only.
			console.warn(
				`Draw Steel Elements: "${key}" is not a presentation preference — per-block prefs: only supports attribute-reflected keys (use the block's own keys, e.g. collapsible:, for behavioral overrides).`,
			);
			continue;
		}
		if (descriptor.perBlock === false) {
			// SC-123 fix round (review M-1). CONDITIONAL-DOM keys (sbCharLine / sbCharBox /
			// sbVillain) are read by the view at BUILD time to choose which DOM to emit; this
			// module runs AFTER the view mounted and only re-stamps an attribute, so honoring
			// the override here would dress the GLOBAL shape in LOCAL attributes. Measured
			// before this guard: global `two` + block `one` rendered "+2Might" — the value and
			// the word run together, no box, no layout — and the `sbVillain` mirror was a
			// silent no-op with the band still built. Rejecting is the honest answer, and it
			// reports to the AUTHOR rather than deforming the page for the reader.
			console.warn(
				`Draw Steel Elements: "${key}" cannot be set per block — it changes the rendered structure, not just its styling, so it is a global preference only (Settings → Draw Steel Elements). Ignoring it for this block.`,
			);
			continue;
		}
		out[key] = value;
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Stamps each override on the root and PINS it: a subscribe() registered after
 * reflect()'s re-stamps the override whenever the global value changes underneath
 * it. Auto-unsubscribed with `owner` (F1 §4.5).
 */
export function applyPrefOverrides(
	root: HTMLElement,
	owner: Component,
	overrides: Partial<DsePrefs> | undefined,
	prefs: PreferenceStore,
): void {
	if (!overrides) return;
	const byKey = new Map(prefs.descriptors().map((d) => [d.key as string, d]));
	for (const [key, value] of Object.entries(overrides)) {
		const descriptor = byKey.get(key);
		// extractPrefOverrides already filtered both of these; belt (SC-123 M-1 added the
		// second one — a conditional-DOM key must never reach a root, from any caller).
		if (!descriptor?.attr || descriptor.perBlock === false) continue;
		const attrName = `data-dse-${descriptor.attr}`;
		const pin = (): void => root.setAttribute(attrName, String(value));
		pin();
		prefs.subscribe(descriptor.key, owner, pin);
	}
}

/**
 * `head` (re-emitted keys, ending in a newline) followed by the element's serialized `body`. SC-482: a body of
 * exactly `{}` ("nothing left to write", from a mapping source that returned to its defaults) cannot follow
 * top-level keys (`prefs:\n  x: y\n{}` is invalid YAML), so it is dropped and the result trimmed.
 */
export function emitAhead(head: string, body: string): string {
	return body === '{}' ? head.trimEnd() : head + body;
}

/** A top-level (column-0) `prefs:` declaration in an already-serialized block body. */
const TOP_LEVEL_PREFS_RE = /^prefs\s*:/mu;

/**
 * Serializer wrapper: re-emit the author's `prefs:` value ahead of the element body. SC-652: when a
 * `passthrough` is given (the block had a `prefs:` key) that is the author's whole value, by value; the
 * `overrides` bag is only the fallback for a caller that has no passthrough.
 *
 * Not every serializer builds the body from its model alone: `ds-hero` splices the author's RAW
 * definition text back (`HeroModel.serializeStateSplice`), so the `prefs:` line may already be in
 * the body even though the parsed key was removed. Prepending unconditionally would write it twice
 * (SC-514), so, like `withCollapseKeys`, this prepends only when the body does not already declare it.
 */
export function withPrefOverrides<M>(
	serialize: (model: M) => string,
	overrides: Partial<DsePrefs> | undefined,
	passthrough?: PrefPassthrough,
): (model: M) => string {
	const kept: unknown = passthrough?.present ? passthrough.value : (overrides ?? {});
	return (model) => {
		const body = serialize(model);
		if (TOP_LEVEL_PREFS_RE.test(body)) return body;
		return emitAhead(stringifyYaml({ prefs: kept }), body);
	};
}
