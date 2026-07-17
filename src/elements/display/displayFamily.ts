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

	return withReference(base, { sccType: new RegExp(`^${d.type}$`) });
}
