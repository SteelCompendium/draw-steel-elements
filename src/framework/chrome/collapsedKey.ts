// SC-169 — the THREE reserved top-level collapse keys and how they combine.
//
// Mechanically the same trick as D4's reserved `prefs:` key (framework/prefOverrides.ts):
// the pipeline pops a reserved key off the parsed body BEFORE schema validation (so the six
// `additionalProperties: false` element schemas never see it) and BEFORE `def.parse` (so it
// never enters any semantic model), and a persisted element's serializer is wrapped so a
// play-state write cannot silently delete the author's key.
//
// THE THREE KEYS (Scott's SC-169 ruling 2, 2026-08-18: "`collapsed` is great. Elements
// should also get `collapsible` and `collapse_default`"):
//
//   collapsible: <bool>       CAN this element be collapsed at all? `false` removes the
//                             collapse/expand control entirely — and if that leaves the
//                             panel with nothing in it, the panel itself is not mounted.
//   collapsed: <bool>         the authored INITIAL state. The canonical spelling.
//   collapse_default: <bool>  a SYNONYM of `collapsed:`, kept because it is the spelling
//                             the pre-SC-169 vocabulary already used (ComponentWrapper,
//                             `ds-stamina` / `ds-skills`).
//
// PRECEDENCE, per key, highest first — the same three-tier ladder D4 §1.3 already
// established for the ComponentWrapper pair (block key > global preference > built-in):
//
//   collapsible:  `collapsible:` → the `collapsibleDefault` preference (default true)
//   collapsed:    `collapsed:` → `collapse_default:` → the `collapseDefault` preference
//                 (default false)
//
// `collapsed:` beats `collapse_default:` when a block sets BOTH: it is the canonical
// spelling of the same fact, and "the newer, more specific name wins" is the only rule that
// does not require the reader to know which key was invented first.
//
// WHO POPS WHAT, and why the legacy pair is usually only PEEKED. `collapsed:` is a brand-new
// spelling no element owns, so it is always popped. `collapsible:`/`collapse_default:` are
// NOT new: they are real ComponentWrapper MODEL fields on `ds-stamina` and `ds-skills`
// (validated by `component-wrapper-1.0.0`, materialised onto the model, re-emitted by the
// element's own serializer). Popping those would hide them from `def.parse`, let
// ComponentWrapper's constructor substitute its own `?? true`/`?? false`, and rewrite the
// author's values on the next write-back. So the pipeline claims them only when BOTH:
//
//   * the definition declares the `chrome` slot — a non-chrome element has no use for the
//     framework reading of these keys, so it is left completely alone (zero blast radius
//     across the ~30 elements that have not opted in, `ds-skills` included); and
//   * the definition does NOT set `collapseKeysOwnedByModel` — the flag `ds-stamina` sets,
//     which switches the read to non-destructive.
//
// That combination is what makes an existing `ds-stamina` block with `collapse_default: true`
// still start collapsed after SC-169 removed that element's own "Stamina Bar" header (Q3):
// same key, same effect, new mechanism, and the byte-identical block body it always had.
import { stringifyYaml } from 'obsidian';

/** The canonical authored-state key. Framework-reserved: no element may declare it. */
export const COLLAPSED_KEY = 'collapsed';
/** "Can this collapse at all." Also a ComponentWrapper model field on two elements. */
export const COLLAPSIBLE_KEY = 'collapsible';
/** Synonym of `collapsed:`. Also a ComponentWrapper model field on two elements. */
export const COLLAPSE_DEFAULT_KEY = 'collapse_default';

export interface CollapseKeys {
	/** `collapsible:` as authored, or undefined when the block did not say. */
	collapsible?: boolean;
	/** `collapsed:` as authored, or undefined. */
	collapsed?: boolean;
	/** `collapse_default:` as authored, or undefined. */
	collapseDefault?: boolean;
	/**
	 * Exactly the keys that were REMOVED from the block data, with their values — the
	 * serializer wrapper's re-emit list. Empty when nothing was removed (a block with no
	 * collapse keys, or an element that owns the legacy pair), in which case no wrapper is
	 * installed at all and the serialized body is byte-untouched.
	 */
	popped: Record<string, boolean>;
}

const EMPTY: CollapseKeys = { popped: {} };

/**
 * Reads the three reserved collapse keys off the parsed block data.
 *
 * MUTATES `rawData` (same contract as `extractPrefOverrides`): `collapsed:` is always
 * removed; `collapsible:`/`collapse_default:` are removed only when `claimLegacyKeys` is
 * true — see `claimLegacyKeys` below and the header. A non-boolean value warns and is
 * ignored — the block still renders.
 */
export function extractCollapseKeys(rawData: unknown, claimLegacyKeys = false): CollapseKeys {
	if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return EMPTY;
	const record = rawData as Record<string, unknown>;
	const popped: Record<string, boolean> = {};

	const read = (key: string, remove: boolean): boolean | undefined => {
		if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
		const value = record[key];
		if (remove) delete record[key];
		if (typeof value !== 'boolean') {
			console.warn(
				`Draw Steel Elements: the reserved per-block "${key}:" key must be true or false — ignoring it.`,
			);
			return undefined;
		}
		if (remove) popped[key] = value;
		return value;
	};

	const collapsed = read(COLLAPSED_KEY, true);
	const collapsible = read(COLLAPSIBLE_KEY, claimLegacyKeys);
	const collapseDefault = read(COLLAPSE_DEFAULT_KEY, claimLegacyKeys);
	return { collapsible, collapsed, collapseDefault, popped };
}

/**
 * Collapses the three authored keys plus the two global preferences into the two booleans
 * `mountChrome` actually needs. See the header for the precedence ladder.
 */
export function resolveCollapseState(
	keys: CollapseKeys,
	prefs: { collapsibleDefault: boolean; collapseDefault: boolean },
): { collapsible: boolean; collapsedDefault: boolean } {
	return {
		collapsible: keys.collapsible ?? prefs.collapsibleDefault,
		collapsedDefault: keys.collapsed ?? keys.collapseDefault ?? prefs.collapseDefault,
	};
}

/** A top-level (column-0) declaration of `key` in an already-serialized block body. */
const topLevelRe = (key: string): RegExp => new RegExp(`^${key}\\s*:`, 'mu');

/**
 * Serializer wrapper: re-emit the reserved keys the pipeline POPPED, ahead of the element
 * body, so a persisted element's write-back (ElementView.persist → host.replaceSource)
 * cannot drop them. Only installed when something was actually popped, so blocks without a
 * collapse key are byte-untouched — the same contract as `withPrefOverrides`.
 *
 * …with ONE extra guard `withPrefOverrides` does not have. Not every persisted element
 * serializes purely from its model: `ds-hero` splices the author's RAW definition text back
 * verbatim (`HeroModel.serializeStateSplice`), so a popped line may ALREADY be in the output
 * even though the parsed key was removed. Prepending unconditionally would emit it twice and
 * the next parse would see a duplicate key. So: prepend only the keys the serialized body
 * does not already declare at the top level. (`withPrefOverrides` has the same latent
 * double-emit against a raw-splicing serializer; that is a pre-existing gap, filed rather
 * than fixed here — see the SC-169 spec's open questions.)
 */
export function withCollapseKeys<M>(
	serialize: (model: M) => string,
	popped: Record<string, boolean>,
): (model: M) => string {
	return (model) => {
		const body = serialize(model);
		const missing: Record<string, boolean> = {};
		for (const [key, value] of Object.entries(popped)) {
			if (!topLevelRe(key).test(body)) missing[key] = value;
		}
		if (Object.keys(missing).length === 0) return body;
		return stringifyYaml(missing) + body;
	};
}
