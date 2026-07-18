// D7 Task 2 (spec §4.4) — ds-conditions model: parse + byte-stable serialize for the
// single-actor conditions strip. BRAND NEW element (no legacy predecessor) that reuses
// the `Condition` shape verbatim from the initiative tracker's EncounterData.ts
// (`{key, color?, effect?}`, spec §2.4) rather than redefining it.
//
// serialize is NOT the party/model.ts "mutate + validate, self-referential" convention
// (there is no unknown-key passthrough worth preserving here): parse fully NORMALIZES
// every entry to a `Condition` object (bare strings -> {key}), and serialize
// DOWN-CONVERTS a normalized entry with only `key` set (no color/effect) back to a bare
// string on the way out. That is DETERMINISTIC, not format-preserving — "Restrained"
// round-trips as a bare string not because the original text was remembered, but
// because a key-only Condition always serializes that way (spec §4.4: "bare string = no
// duration"). Editing away a condition's last customization (clearing effect) therefore
// drops it back to a bare string on the very next persist — intended, not a bug.
import { stringifyYaml } from 'obsidian';
import type { Condition } from '@drawSteelAdmonition/EncounterData';

export type { Condition };

export interface ConditionsModel {
	conditions: Condition[];
}

function normalizeEntry(entry: unknown, index: number): Condition {
	if (typeof entry === 'string') {
		if (entry.trim() === '') {
			throw new Error(`Condition at index ${index} must not be a blank string.`);
		}
		return { key: entry };
	}
	if (typeof entry === 'object' && entry !== null && typeof (entry as Condition).key === 'string') {
		const e = entry as Condition;
		const normalized: Condition = { key: e.key };
		if (e.color !== undefined) normalized.color = e.color;
		if (e.effect !== undefined) normalized.effect = e.effect;
		return normalized;
	}
	throw new Error(`Condition at index ${index} must be a string, or an object with a 'key'.`);
}

/**
 * Validates shape and normalizes every entry to a `Condition` object (spec §4.4:
 * parse "normalizes bare strings -> {key}"). A blank/absent `conditions` list
 * materializes as `[]` — a freshly authored block with no conditions is valid.
 */
export function parse(input: unknown, _raw: string): ConditionsModel {
	// A completely empty ds-conditions block parses to `undefined`/`null` (the schema
	// permits type ["object", "null"], spec §4.4) — treated the same as `{}`.
	if (input === undefined || input === null) {
		return { conditions: [] };
	}
	if (typeof input !== 'object') {
		throw new Error('The input must be a YAML object.');
	}
	const data = input as { conditions?: unknown };
	if (data.conditions !== undefined && !Array.isArray(data.conditions)) {
		throw new Error("Invalid data: 'conditions' field must be a list.");
	}
	const conditions = (data.conditions ?? []).map((entry, index) => normalizeEntry(entry, index));
	return { conditions };
}

/** Down-converts one normalized Condition to its authored form: key-only -> bare
 *  string (spec §4.4), else the full `{key, color?, effect?}` object. */
function toDtoEntry(c: Condition): string | Condition {
	return c.color === undefined && c.effect === undefined ? c.key : c;
}

/** serialize(model): stringifyYaml({conditions: [...down-converted]}).trim() — the
 *  same `.trim()` convention every other persisted element's serialize uses. */
export function serialize(model: ConditionsModel): string {
	return stringifyYaml({ conditions: model.conditions.map(toDtoEntry) }).trim();
}
