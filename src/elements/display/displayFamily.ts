// src/elements/display/displayFamily.ts — D6 Task 6 (spec §2): the factory that turns one
// declarative descriptor into a reference-capable display element (ds-kit, ds-condition,
// ds-treasure, …). Two D6-established seams it MUST reuse rather than re-declare (per this
// task's binding brief + task-2-review.md's single-source-of-truth constraint):
//
//  - Model construction (inline block body -> typed SDK model) dispatches through the SAME
//    TYPE_ADAPTERS/adapterForType map (Task 2) that CompendiumIndex.getEntity().model()
//    uses for the by-SCC path — one place that knows "this SCC `type` maps to this SDK
//    reader," not a second `adapter` reference hand-written per element.
//  - `sccType` (the bare-slug scope withReference/RefUnwrapView need, §1.3) is DERIVED from
//    the same `type` key instead of a second hand-written regex literal.
//
// withReference (Task 3) supplies the whole-block-reference degrade ladder; this factory's
// own `base` def only ever has to handle the inline-YAML case — parse() here NEVER sees a
// whole-block-reference raw string (withReference's own parse() intercepts that first via
// detectWholeBlockRef and never calls through to base.parse for it).
import { parseYaml } from 'obsidian';
import type { ElementDefinition } from '@/framework/registry';
import { adapterForType } from '@/services/typeAdapters';
import type { GenericNote } from '@/services/typeAdapters';
import { DisplayCardView } from '@/elements/shared/CardLayout';
import type { CardLayout } from '@/elements/shared/CardLayout';
import { withReference } from '@/elements/shared/withReference';
import type { RefOrInline } from '@/elements/shared/withReference';

export interface DisplayFamilyDescriptor<M> {
	/** Stable machine id, kebab-case (registry id + canonical D9 sdk-model key). */
	id: string;
	/** Code-block languages; first is canonical. */
	aliases: readonly [string, ...string[]];
	/** Human name for error cards / settings UI. */
	name: string;
	/**
	 * Canonical SCC `type` key (e.g. "kit") — looked up in TYPE_ADAPTERS for BOTH the
	 * inline-body model construction below and (derived) the by-SCC bare-slug scope.
	 * Must match one of TYPE_ADAPTERS' frontmatter-family entries (typeAdapters.ts).
	 */
	type: string;
	/** Declarative card frame (Task 5's DisplayCardView driver). */
	layout: CardLayout<M>;
	/** Curated starter block body (D9 authoring hint) — the element's own example.yaml text. */
	example: string;
}

/** `data` is the pipeline's already-`parseYaml`'d block body for the inline case (a plain
 *  mapping) — but an empty/whitespace-only block body parses to `undefined`, and
 *  detectWholeBlockRef's own "empty -> inline" branch (withReference.ts) lets that reach
 *  here too. Guard against both non-object shapes by re-parsing `raw` directly rather than
 *  assuming `data` is always the mapping we want. */
function isPlainObject(data: unknown): data is Record<string, unknown> {
	return typeof data === 'object' && data !== null;
}

export function displayFamily<M>(d: DisplayFamilyDescriptor<M>): ElementDefinition<RefOrInline<M>> {
	const adapter = adapterForType(d.type);
	if (!adapter?.fromData) {
		throw new Error(`displayFamily("${d.id}"): no TYPE_ADAPTERS entry with fromData for type "${d.type}"`);
	}
	const fromData = adapter.fromData;

	const base: ElementDefinition<M> = {
		id: d.id,
		name: d.name,
		aliases: d.aliases,
		shape: 'static',
		// The block body is self-contained inline YAML (the base def's own concern);
		// whole-block references are withReference's job, layered on below.
		autoResolveRefs: false,
		parse: (data, raw) => fromData(isPlainObject(data) ? data : parseYaml(raw)) as M,
		createView: (cx) => new DisplayCardView<M>(cx, d.layout),
		authoring: { example: d.example },
	};

	// A plain string scope is an exact-match comparison (CompendiumIndex.ts's matchType:
	// `type === scope`), byte-identical to `new RegExp(`^${d.type}$`).test(type)` for
	// every current `type` key — but without the unescaped-regex-metacharacter footgun
	// a future namespaced `type` (e.g. containing a `.`) would hit (Task 6 review, Nit).
	return withReference(base, { sccType: d.type });
}

// ---------------------------------------------------------------------------------------
// D6 Task 8 (spec §3): genericCard() — displayFamily's model-less sibling. Rules (and any
// future homebrew-adjacent family with no SDK DTO) have no TYPE_ADAPTERS "fromData" entry
// to dispatch inline bodies through, because there is no SDK model at all — the raw block
// body IS the card body (OD-D6-7's "reference-only, raw-markdown-fallback" decision). A
// `GenericNote = { name, type, body }` (typeAdapters.ts) stands in for the SDK DTO on BOTH
// paths:
//   - inline: `base.parse` builds one directly from the raw text (type stays "" — there is
//     no frontmatter to source it from inline).
//   - by-SCC: TYPE_ADAPTERS carries a matching `genericNoteAdapter` entry (typeAdapters.ts)
//     that builds one from the resolved file's frontmatter + body. This is the brief's
//     "Decision for the plan" (task-8-brief.md step 2, option over (a)'s custom
//     GenericCardView/setSource override): registering the adapter keeps RefUnwrapView
//     uniform — `CompendiumIndex.getEntity().model()` always returns a model for a `rule.*`
//     code, so `DisplayCardView<GenericNote>` needs no subclass at all; `mountBase` passes
//     the already-built GenericNote straight through as `model`.
function humanizeType(type: string): string {
	return type
		.split(/[._-]/)
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

const genericLayout: CardLayout<GenericNote> = {
	title: (m) => m.name,
	badges: (m) => (m.type ? [{ text: humanizeType(m.type), tone: 'type' }] : []),
	// GenericNote.body already IS the source/inline body (built that way on both paths
	// above) — `useSourceBody: false` means DisplayCardView always renders it from
	// `layout.body(model)` regardless of hybrid mode, never through the (still-TODO,
	// per CardLayout.ts) by-SCC `this.source!.body` render path.
	body: (m) => m.body,
	useSourceBody: false,
};

export interface GenericCardDescriptor {
	/** Stable machine id, kebab-case. */
	id: string;
	/** Code-block languages; first is canonical. */
	aliases: readonly [string, ...string[]];
	/** Human name for error cards / settings UI, and the inline-mode card title/type
	 *  (inline bodies carry no frontmatter to source either from). */
	name: string;
	/** SCC `type` scope (bare-slug sugar, §1.3) — also what TYPE_ADAPTERS' matching
	 *  `genericNoteAdapter` entry must accept for the by-SCC path to find a model. */
	sccType: string | RegExp;
	/** Curated starter block body (D9 authoring hint). */
	example: string;
}

export function genericCard(cfg: GenericCardDescriptor): ElementDefinition<RefOrInline<GenericNote>> {
	const base: ElementDefinition<GenericNote> = {
		id: cfg.id,
		name: cfg.name,
		aliases: cfg.aliases,
		shape: 'static',
		autoResolveRefs: false,
		// Inline: no SDK model — the raw body IS the card body (OD-D6-7 raw-markdown
		// fallback). `type` stays "" (no frontmatter in inline mode to source it from),
		// so genericLayout's type badge only ever appears in hybrid (by-SCC) mode.
		parse: (_data, raw) => ({ name: cfg.name, type: '', body: raw }),
		createView: (cx) => new DisplayCardView<GenericNote>(cx, genericLayout),
		authoring: { example: cfg.example },
	};
	return withReference(base, { sccType: cfg.sccType });
}
