// SC-169 — the reserved top-level `collapsed:` YAML key: the AUTHORED default for the
// whole-element collapse.
//
// Mechanically identical to D4's reserved `prefs:` key (framework/prefOverrides.ts): the
// pipeline pops it off the parsed body BEFORE schema validation (so no element schema has
// to grow an `additionalProperties` hole) and BEFORE `def.parse` (so it never enters any
// semantic model), and a persisted element's serializer is wrapped so a play-state write
// cannot silently delete the author's key.
//
// WHY `collapsed:` AND NOT `collapse_default:` (the naming decision SC-169 asked for).
// The existing vocabulary is the ComponentWrapper pair `collapsible:` / `collapse_default:`
// (framework/dependencySchemas.ts; models Skills + StaminaBar). Neither spelling is
// reusable here:
//   - `collapsible:` is the WRONG AXIS. Whether an element can be collapsed at all is
//     decided by its definition's `chrome` slot, not by the author — and it is already
//     dead weight in the one place it is declared (stamina-bar/view.ts honours
//     `collapse_default` but deliberately ignores `collapsible`).
//   - `collapse_default:` is ALREADY TAKEN, on one of the three elements SC-169
//     prototypes. On `ds-stamina` a top-level `collapse_default: true` means "start the
//     INNER Stamina Bar wrapper collapsed" (StaminaBar model → the kit collapsible). If
//     the framework also claimed that spelling, the same key would mean two different
//     things on the same block, and popping it before `def.parse` would silently break
//     every existing `ds-stamina` / `ds-skills` block that uses it.
// `collapsed:` is unambiguous, reads as STATE (matching HTML's own `hidden`/`open`
// convention), and is short enough to be worth typing. It is a framework RESERVED key: an
// element must not declare a field with that name.
import { stringifyYaml } from 'obsidian';

/** The reserved key. */
export const COLLAPSED_KEY = 'collapsed';

/**
 * Pops the reserved `collapsed:` key off the parsed block data (MUTATES rawData, same as
 * extractPrefOverrides) and returns the authored default, or `undefined` when the key is
 * absent. A non-boolean value warns and is ignored — the block still renders.
 */
export function extractCollapsedDefault(rawData: unknown): boolean | undefined {
	if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return undefined;
	const record = rawData as Record<string, unknown>;
	if (!Object.prototype.hasOwnProperty.call(record, COLLAPSED_KEY)) return undefined;
	const value = record[COLLAPSED_KEY];
	delete record[COLLAPSED_KEY];
	if (typeof value !== 'boolean') {
		console.warn(
			`Draw Steel Elements: the reserved per-block "${COLLAPSED_KEY}:" key must be true or false — ignoring it.`,
		);
		return undefined;
	}
	return value;
}

/** A top-level (column-0) `collapsed:` line in an already-serialized block body. */
const TOP_LEVEL_COLLAPSED_RE = new RegExp(`^${COLLAPSED_KEY}\\s*:`, 'mu');

/**
 * Serializer wrapper: re-emit the author's `collapsed:` key ahead of the element body, so
 * a persisted element's write-back (ElementView.persist → host.replaceSource) cannot drop
 * it. Only installed when the key was actually present, so blocks without it are
 * byte-untouched — the same contract as withPrefOverrides.
 *
 * …with ONE extra guard withPrefOverrides does not have. Not every persisted element
 * serializes purely from its model: `ds-hero` splices the author's RAW definition text
 * back verbatim (`HeroModel.serializeStateSplice`), so the `collapsed:` line the author
 * typed is ALREADY in the output even though the parsed key was popped. Prepending
 * unconditionally would emit it twice and the next parse would see a duplicate key. So:
 * prepend only when the serialized body does not already declare it at the top level.
 * (`withPrefOverrides` has the same latent double-emit against a raw-splicing serializer;
 * that is a pre-existing gap, filed rather than fixed here — see the SC-169 spec's open
 * questions.)
 */
export function withCollapsedDefault<M>(
	serialize: (model: M) => string,
	collapsed: boolean,
): (model: M) => string {
	return (model) => {
		const body = serialize(model);
		if (TOP_LEVEL_COLLAPSED_RE.test(body)) return body;
		return stringifyYaml({ [COLLAPSED_KEY]: collapsed }) + body;
	};
}
