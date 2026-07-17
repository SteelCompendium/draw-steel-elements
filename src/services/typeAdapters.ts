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
	/** Turn a resolved compendium file into the element's model, or null when unavailable. */
	fromFile(app: App, file: TFile): Promise<ElementModel>;
}

/** ds-block family: SDK reader over the first ds-* block TEXT (statblock/feature/featureblock). */
function dsBlockAdapter(re: RegExp, readYaml: (text: string) => unknown): TypeAdapter {
	return {
		matches: (type) => re.test(type),
		fromFile: async (app, file) => {
			const text = await extractFirstDsBlockText(app, file);
			return text === null ? null : readYaml(text);
		},
	};
}

/** frontmatter family: SDK modelDTOAdapter over the file's frontmatter. */
function frontmatterAdapter(re: RegExp, adapter: (fm: any) => unknown): TypeAdapter {
	return { matches: (type) => re.test(type), fromFile: async (app, file) => adapter(frontmatterOf(app, file)) };
}

/**
 * SINGLE SOURCE OF TRUTH -- the display family (Task 6) and CompendiumIndex share this.
 * Order matters: statblock/featureblock must precede the bare `feature` entry so
 * e.g. `monster.goblin.statblock` (or bare `statblock`) doesn't fall through to it.
 */
export const TYPE_ADAPTERS: TypeAdapter[] = [
	dsBlockAdapter(STATBLOCK_TYPE_RE, (t) => StatblockConfig.readYaml(t)),
	dsBlockAdapter(/(^|\.)featureblock$/, (t) => FeatureblockConfig.readYaml(t)),
	dsBlockAdapter(/^feature($|\.)/, (t) => FeatureConfig.readYaml(t)),
	frontmatterAdapter(/^kit$/, Kit.modelDTOAdapter),
	frontmatterAdapter(/^ancestry$/, Ancestry.modelDTOAdapter),
	frontmatterAdapter(/^culture$/, Culture.modelDTOAdapter),
	frontmatterAdapter(/^career$/, Career.modelDTOAdapter),
	frontmatterAdapter(/^class$/, Class.modelDTOAdapter),
	frontmatterAdapter(/^title$/, Title.modelDTOAdapter),
	frontmatterAdapter(/^perk$/, Perk.modelDTOAdapter),
	frontmatterAdapter(/^treasure$/, Treasure.modelDTOAdapter),
	frontmatterAdapter(/^complication$/, Complication.modelDTOAdapter),
	frontmatterAdapter(/^condition$/, Condition.modelDTOAdapter),
];

export function adapterForType(type: string): TypeAdapter | undefined {
	return TYPE_ADAPTERS.find((a) => a.matches(type));
}
