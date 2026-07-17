// src/services/typeAdapters.ts — shared type -> adapter map (D6 Task 2, spec §6).
//
// SINGLE SOURCE OF TRUTH for turning a resolved compendium file into an element's typed
// model: the display family (Task 6) and CompendiumIndex.getEntity().model() both dispatch
// through TYPE_ADAPTERS so there is exactly one place that knows "this SCC `type` frontmatter
// value maps to this SDK reader." ResolvedRef/CompendiumEntry carry no frontmatter (D6 recon
// (b)) -- frontmatter is read off `metadataCache` via the TFile by the caller/adapter itself.
import { App, TFile } from "obsidian";
import {
	Kit, Ancestry, Culture, Career, Class, Title, Perk, Treasure, Complication, Condition,
} from "steel-compendium-sdk";
import { FRONTMATTER_RE } from "@/refs/SccResolver";
import { StatblockConfig } from "@model/StatblockConfig";
import { FeatureConfig } from "@model/FeatureConfig";
import { FeatureblockConfig } from "@model/FeatureblockConfig";

/**
 * First `ds-*` fenced block's RAW TEXT (no YAML parse) -- the ds-block-family SDK readers
 * (StatblockConfig/FeatureConfig/FeatureblockConfig `.readYaml`) parse text, not a
 * pre-parsed object, unlike `extractFirstDsBlock` (ReferenceResolver.ts) which returns
 * parsed YAML for the F1 reference-resolution seam. Mirrors that function's blockRegex so
 * the two never drift, but throws nothing -- callers treat a miss as "no model available."
 */
export async function extractFirstDsBlockText(app: App, file: TFile): Promise<string | null> {
	const content = await app.vault.read(file);
	const blockRegex = /^([`~]{3,})ds-[\w-]+\s*\n([\s\S]+?)\n^\1/m;
	const match = content.match(blockRegex);
	return match ? match[2] : null;
}

function frontmatterOf(app: App, file: TFile): Record<string, unknown> {
	return (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
}

/** Deliberately opaque -- callers know the concrete shape from the SCC `type` they queried. */
export type ElementModel = unknown;

/**
 * D6 Task 8 (spec §3) -- the model-less family's "model": no SDK DTO exists for these SCC
 * types (e.g. `rule.*`), so the file's own frontmatter name + body stand in directly.
 * `genericCard()` (displayFamily.ts) is the inline-mode producer of this shape; the
 * `genericNoteAdapter` below is the by-SCC producer -- same shape either way, so
 * `DisplayCardView<GenericNote>` never has to know which path it came from.
 */
export interface GenericNote {
	name: string;
	type: string;
	body: string;
}

/**
 * The statblock family's `type` scope, anchored so a bare `statblock` or any
 * `<family>.statblock` (e.g. `monster.goblin.statblock`) matches but `notastatblock`
 * doesn't. Exported so CompendiumIndex.getStatblock can gate on the SAME regex
 * TYPE_ADAPTERS uses below, instead of re-declaring a second (and previously looser)
 * copy -- single source of truth for "what counts as a statblock type."
 */
export const STATBLOCK_TYPE_RE = /(^|\.)statblock$/;

export interface TypeAdapter {
	/** SCC-type test: does this adapter own a given frontmatter `type` value? */
	matches(type: string): boolean;
	/**
	 * D6 Task 10 (spec §4.3) -- the canonical `ds-<alias>` code-block language for this
	 * type family (e.g. "ds-kit", "ds-statblock"), matching the display element's own
	 * `aliases[0]`-equivalent canonical form (see src/elements/display/index.ts and the
	 * statblock/feature/featureblock definitions). `typeToAlias` below is the sole
	 * reader -- single source of truth for "what fence do I wrap a reference/full-block
	 * insert in for this SCC type," alongside `fromFile`/`fromData` already owning "how
	 * do I parse it."
	 */
	alias: string;
	/** Turn a resolved compendium file into the element's model, or null when unavailable. */
	fromFile(app: App, file: TFile): Promise<ElementModel>;
	/**
	 * D6 Task 6 (spec §2) -- turn ALREADY-PARSED data (inline block YAML, or a file's
	 * frontmatter) into the element's model synchronously. `displayFamily` is the only
	 * caller (its inline-body parse path) and only ever looks up frontmatter-family
	 * types, so this is safe to leave undefined for the ds-block family (statblock/
	 * feature/featureblock), whose readers consume raw block TEXT, not a pre-parsed
	 * object, and have no equivalent "already-parsed data" entry point.
	 */
	fromData?: (data: unknown) => ElementModel;
}

/** ds-block family: SDK reader over the first ds-* block TEXT (statblock/feature/featureblock). */
function dsBlockAdapter(re: RegExp, readYaml: (text: string) => unknown, alias: string): TypeAdapter {
	return {
		matches: (type) => re.test(type),
		alias,
		fromFile: async (app, file) => {
			const text = await extractFirstDsBlockText(app, file);
			return text === null ? null : readYaml(text);
		},
	};
}

/** frontmatter family: SDK modelDTOAdapter over the file's frontmatter (fromFile) OR any
 *  already-parsed data (fromData, D6 Task 6 -- e.g. an inline block body). Single
 *  underlying `adapter` call either way -- one place (this map) that knows "this SCC
 *  `type` maps to this SDK reader," per task-2-review.md's binding single-source-of-truth
 *  constraint. */
function frontmatterAdapter(re: RegExp, adapter: (fm: any) => unknown, alias: string): TypeAdapter {
	return {
		matches: (type) => re.test(type),
		alias,
		fromFile: async (app, file) => adapter(frontmatterOf(app, file)),
		fromData: (data) => adapter(data),
	};
}

/**
 * D6 Task 8 (spec §3) -- the model-less family (`rule.*`, …): no SDK model exists, so
 * `fromFile` builds a `GenericNote` straight from the resolved file's frontmatter (name)
 * + body (frontmatter-stripped markdown) instead of dispatching to an SDK reader. No
 * `fromData` -- `genericCard()`'s inline path builds its own `GenericNote` directly (the
 * raw block body itself IS the card body, OD-D6-7), so this adapter is by-SCC only,
 * exactly like the ds-block family above being fromFile-only for the opposite reason.
 */
function genericNoteAdapter(re: RegExp, alias: string): TypeAdapter {
	return {
		matches: (type) => re.test(type),
		alias,
		fromFile: async (app, file) => {
			const fm = frontmatterOf(app, file);
			const name =
				typeof fm.item_name === "string" ? fm.item_name
				: typeof fm.name === "string" ? fm.name
				: file.basename;
			const noteType = typeof fm.type === "string" ? fm.type : "";
			const content = await app.vault.read(file);
			const body = content.replace(FRONTMATTER_RE, "");
			const note: GenericNote = { name, type: noteType, body };
			return note;
		},
	};
}

/**
 * SINGLE SOURCE OF TRUTH -- the display family (Task 6) and CompendiumIndex share this.
 * Order matters: statblock/featureblock must precede the bare `feature` entry so
 * e.g. `monster.goblin.statblock` (or bare `statblock`) doesn't fall through to it.
 */
export const TYPE_ADAPTERS: TypeAdapter[] = [
	dsBlockAdapter(STATBLOCK_TYPE_RE, (t) => StatblockConfig.readYaml(t), 'ds-statblock'),
	dsBlockAdapter(/(^|\.)featureblock$/, (t) => FeatureblockConfig.readYaml(t), 'ds-featureblock'),
	dsBlockAdapter(/^feature($|\.)/, (t) => FeatureConfig.readYaml(t), 'ds-feature'),
	frontmatterAdapter(/^kit$/, Kit.modelDTOAdapter, 'ds-kit'),
	frontmatterAdapter(/^ancestry$/, Ancestry.modelDTOAdapter, 'ds-ancestry'),
	frontmatterAdapter(/^culture$/, Culture.modelDTOAdapter, 'ds-culture'),
	frontmatterAdapter(/^career$/, Career.modelDTOAdapter, 'ds-career'),
	frontmatterAdapter(/^class$/, Class.modelDTOAdapter, 'ds-class'),
	frontmatterAdapter(/^title$/, Title.modelDTOAdapter, 'ds-title'),
	frontmatterAdapter(/^perk$/, Perk.modelDTOAdapter, 'ds-perk'),
	frontmatterAdapter(/^treasure$/, Treasure.modelDTOAdapter, 'ds-treasure'),
	frontmatterAdapter(/^complication$/, Complication.modelDTOAdapter, 'ds-complication'),
	frontmatterAdapter(/^condition$/, Condition.modelDTOAdapter, 'ds-condition'),
	// D6 Task 8 (spec §3): model-less family -- `rule` (bare, in the real corpus) plus any
	// future `rule.<sub>` namespacing. Placed last: nothing above it is ever named "rule".
	genericNoteAdapter(/^rule($|\.)/, 'ds-rule'),
];

export function adapterForType(type: string): TypeAdapter | undefined {
	return TYPE_ADAPTERS.find((a) => a.matches(type));
}

/**
 * D6 Task 10 (spec §4.3) -- the compendium search/insert commands' "which fence do I
 * wrap this SCC `type` in" lookup, over the SAME TYPE_ADAPTERS ordering/regexes
 * `adapterForType` uses (no forked type->element mapping). Falls back to the model-less
 * `ds-rule` alias for any `type` no adapter claims (empty/unrecognized frontmatter) --
 * `genericCard`'s by-SCC path (`genericNoteAdapter`) already renders an arbitrary
 * name+body generically, so it is the safest generic destination for a reference/full
 * block whose real type this map doesn't know.
 */
export function typeToAlias(type: string): string {
	return adapterForType(type)?.alias ?? 'ds-rule';
}
