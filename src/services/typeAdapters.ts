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
	return app.metadataCache.getFileCache(file)?.frontmatter ?? {};
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

/**
 * The `ds-feature` family's `type` scope — SC-141.
 *
 * The SCC *code* segment for every ability is `feature.ability.<class>.level-N`, but the
 * frontmatter `type:` steel-etl writes into the synced md-dse file is the LEAF of that
 * segment, not the whole thing: an ability file carries `type: ability`, a class/ancestry
 * trait carries `type: trait`, and only the plain-feature files carry `type: feature`.
 * (Real corpus, 2026-08-10: 621 `ability` + 95 `trait` + 876 `feature` files — and all
 * three groups carry a ```ds-feature block, i.e. they are the SAME renderable family.)
 *
 * Scoping this to `/^feature($|\.)/` therefore made every one of the 716 `ability`/`trait`
 * files invisible to `adapterForType` — `model()` returned `undefined`, and both the
 * `ds-hero` abilities list and a by-SCC `ds-feature` reference reported the resolved file
 * as "not an ability entry" / "not renderable". Exported (like STATBLOCK_TYPE_RE) so the
 * `ds-feature` element's bare-slug scope and `ds-hero`'s abilities scope read the SAME
 * regex instead of keeping their own copies, which is exactly how they drifted.
 */
export const FEATURE_TYPE_RE = /^(feature|ability|trait)($|\.)/;

/**
 * The `ds-featureblock` family's `type` scope — SC-141 fix round (M2).
 *
 * Same shape of bug as FEATURE_TYPE_RE above, one family over: all 35 `dynamic-terrain`
 * files in the real corpus (`dynamic-terrain.{mechanisms,fieldworks,siege-engines,
 * power-fixtures,environmental-hazards,supernatural-objects}`) carry a real ```ds-fb block
 * and were claimed by no adapter at all, so `getEntity().model()` returned `undefined` and
 * a by-SCC reference reported them as "found but not renderable — re-sync" against a
 * compendium that was perfectly fine. `typeToAlias` likewise wrapped all 35 in `ds-rule`.
 *
 * Note the frontmatter `type:` here is the ROOT of the SCC type segment
 * (`dynamic-terrain.mechanisms` -> `type: dynamic-terrain`), where the feature family's is
 * the LEAF (`feature.ability.shadow.level-1` -> `type: ability`). steel-etl is not
 * self-consistent about which end it writes, which is exactly why these scopes must be
 * derived from the corpus census rather than from the code shape.
 *
 * Exported (like STATBLOCK_TYPE_RE / FEATURE_TYPE_RE) so the `ds-featureblock` element's
 * bare-slug scope reads it instead of keeping its own copy.
 */
export const FEATUREBLOCK_TYPE_RE = /(^|\.)featureblock$|^dynamic-terrain($|\.)/;

export interface TypeAdapter {
	/** SCC-type test: does this adapter own a given frontmatter `type` value? */
	matches(type: string): boolean;
	/**
	 * D6 Task 10 (spec §4.3) -- the canonical `ds-<alias>` code-block language for this
	 * type family (e.g. "ds-kit", "ds-statblock"), matching the display element's own
	 * `aliases[0]`-equivalent canonical form (see src/elements/display/index.ts and the
	 * statblock/feature/featureblock definitions). `referenceAliasForType`/
	 * `snapshotAliasForType` below are the readers -- single source of truth for "what
	 * fence do I wrap a reference/full-block insert in for this SCC type," alongside
	 * `fromFile`/`fromData` already owning "how do I parse it." Since SC-149 the ten
	 * display-family aliases here are INTERNAL names (no registered code-block language
	 * answers to them); they still identify the family for `ds-scc`'s renderer lookup
	 * (`src/elements/scc/definition.ts`).
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
function frontmatterAdapter(re: RegExp, adapter: (fm: unknown) => unknown, alias: string): TypeAdapter {
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
	dsBlockAdapter(FEATUREBLOCK_TYPE_RE, (t) => FeatureblockConfig.readYaml(t), 'ds-featureblock'),
	dsBlockAdapter(FEATURE_TYPE_RE, (t) => FeatureConfig.readYaml(t), 'ds-feature'),
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
 * The three PUBLIC typed element fences whose inline YAML is a documented, stable
 * authoring surface (statblock/feature/featureblock). SC-149 makes this the dividing
 * line for both insert commands: these three keep their typed reference block AND their
 * snapshot; everything else references through `ds-scc` and has no snapshot at all.
 */
const DS_BLOCK_ALIASES = new Set(['ds-statblock', 'ds-feature', 'ds-featureblock']);

/** SC-149's catch-all reference fence (src/elements/scc/definition.ts's alias, duplicated
 *  as a literal here rather than imported: `src/services/` must not depend on
 *  `src/elements/`, and this string is pinned by test). */
const SCC_ALIAS = 'ds-scc';

/**
 * D6 Task 10 (spec §4.3), rewritten by SC-149 -- "which fence do I wrap a REFERENCE to
 * this SCC `type` in", over the SAME TYPE_ADAPTERS ordering/regexes `adapterForType`
 * uses (no forked type->element mapping). The three ds-block families keep their own
 * public typed fence; every other type -- including one no adapter claims -- references
 * through `ds-scc`, which resolves by code and picks the renderer itself.
 */
export function referenceAliasForType(type: string): string {
	const alias = adapterForType(type)?.alias;
	return alias !== undefined && DS_BLOCK_ALIASES.has(alias) ? alias : SCC_ALIAS;
}

/**
 * SC-149 -- "may this SCC `type` be inserted as an inline SNAPSHOT (a full block of
 * serialized YAML that stops tracking the compendium)?" and, if so, in which fence.
 * `null` for everything outside the ds-block trio: Scott's ruling is firm that a
 * snapshot of a display-family entry -- a dump of an internal, unstable YAML shape that
 * silently goes stale -- is the exact vector this pass exists to remove. Snapshots of
 * the three documented formats stay: they are the homebrew editing base.
 */
export function snapshotAliasForType(type: string): string | null {
	const alias = adapterForType(type)?.alias;
	return alias !== undefined && DS_BLOCK_ALIASES.has(alias) ? alias : null;
}
