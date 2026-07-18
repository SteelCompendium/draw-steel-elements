// src/framework/prefOverrides.ts — D4 §1.3/§1.4 (Plan 13): the reserved per-block
// `prefs:` override map.
//
// Pipeline-generic (OD-D4-2): the map is popped from the parsed YAML BEFORE schema
// validation (schemas never see the reserved key) and BEFORE def.parse (it never
// enters any semantic model). Presentation keys only — behavioral keys have their
// own per-block spelling (collapsible:/collapse_default:) and are warned+ignored
// here, as are unknown keys (console.warn, NOT an error card — the block renders).
//
// Override-wins mechanics (OD-D4-3a): applyPrefOverrides runs AFTER the pipeline's
// cx.prefs.reflect(root, view), so its subscribe() callbacks register after
// reflect's. On any global change to a pinned key, reflect stamps the global value
// first, then the pin re-stamps the override — deterministic listener order, no F1
// signature change.
//
// Round-trip (persisted elements): replaceSource rewrites the whole block body from
// def.serialize(model), which would silently DROP the author's `prefs:` map on the
// first interaction. withPrefOverrides re-emits it (re-stringified via the same
// stringifyYaml the serializers use, so formatting may normalize — key order and
// values are preserved; blocks WITHOUT a prefs: map are byte-untouched because the
// wrapper is only installed when overrides exist).
import { stringifyYaml } from 'obsidian';
import type { Component } from 'obsidian';
import type { DsePrefs, PreferenceStore } from './seams/prefs';

/**
 * Pops the reserved `prefs:` key off the parsed block data (mutates rawData) and
 * returns the validated presentation-only override bag, or undefined when absent
 * or empty after validation.
 */
export function extractPrefOverrides(
	rawData: unknown,
	prefs: PreferenceStore,
): Partial<DsePrefs> | undefined {
	if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return undefined;
	const record = rawData as Record<string, unknown>;
	if (!Object.prototype.hasOwnProperty.call(record, 'prefs')) return undefined;
	const bag = record.prefs;
	delete record.prefs;
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
			console.warn(
				`Draw Steel Elements: "${key}" is not a presentation preference — per-block prefs: only supports attribute-reflected keys (use the block's own keys, e.g. collapsible:, for behavioral overrides).`,
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
		if (!descriptor?.attr) continue; // extractPrefOverrides already filtered; belt
		const attrName = `data-dse-${descriptor.attr}`;
		const pin = (): void => root.setAttribute(attrName, String(value));
		pin();
		prefs.subscribe(descriptor.key, owner, pin);
	}
}

/** Serializer wrapper: re-emit the author's `prefs:` map ahead of the element body. */
export function withPrefOverrides<M>(
	serialize: (model: M) => string,
	overrides: Partial<DsePrefs>,
): (model: M) => string {
	return (model) => stringifyYaml({ prefs: overrides }) + serialize(model);
}
