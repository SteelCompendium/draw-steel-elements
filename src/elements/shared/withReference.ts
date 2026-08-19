// src/elements/shared/withReference.ts — D6 Task 3 (spec §1): the reusable wrapper that
// lets any base def (display/statblock/feature family) accept a WHOLE-BLOCK reference in
// place of inline YAML.
//
// Resolution home (recon (d), binding): the spec §1.2 sketch puts resolution in
// resolveRefs(model, refs), but the built SccRefProvider.resolve THROWS on web/unresolved,
// resolveRefs only gets cx.refs (no cx.sccAnchors/cx.compendium), and display families
// resolve from frontmatter, not the first ds-block SccRefProvider extracts. So ALL ref
// resolution lives in RefUnwrapView (which holds the full RenderContext): it does
// bare-slug -> code via cx.compendium.resolveSlug, classifies via the sync
// cx.sccAnchors.resolve for the §1.5 degrade ladder, and pulls the typed model + source via
// cx.compendium.getEntity. withReference itself stays dumb: autoResolveRefs stays OFF, no
// resolveRefs hook — parse() only tags ref-vs-inline; the view does the async work. This
// keeps the base statblock/feature/display views reference-agnostic (§1.4).
import type { ElementDefinition } from '@/framework/registry';
import type { ElementChrome } from '@/framework/chrome/types';
import type { TFile } from 'obsidian';
import { RefUnwrapView } from './RefUnwrapView';

/** The resolved compendium file backing a whole-block reference (display family, §2.3). */
export interface RefSource {
	file: TFile;
	frontmatter: Record<string, unknown>;
	body: string;
}

/** parse()'s output for a wrapped def: the base model (inline body), an unresolved
 *  reference string (whole-block ref — resolved later, in the view), or — SC-149 fix round
 *  L-1, `ds-scc` only — a REFUSED body carrying the message to show. The third variant
 *  exists so a strict-body refusal is presented by the view (a friendly notice card, see
 *  `friendlyErrors`) instead of thrown into the pipeline's developer-flavoured
 *  "failed to render (render)" frame. Nothing else produces it. */
export type RefOrInline<M> =
	| { kind: 'inline'; model: M }
	| { kind: 'ref'; raw: string }
	| { kind: 'invalid'; message: string; hint?: string };

/** A base view that wants the resolved source file threaded in (display family, §2.3). */
export interface SourceAware {
	setSource(source: RefSource): void;
}

export interface WithReferenceOptions {
	/** SCC type family this element renders — scopes bare-slug sugar (§1.3). */
	sccType: string | RegExp;
	/**
	 * SC-149 (`ds-scc`) — pick the base def to mount from the RESOLVED entity's SCC
	 * `type`, instead of always mounting the single base this wrapper wraps. Absent for
	 * every typed element (statblock/feature/featureblock and the internal display
	 * family): they render exactly one model shape, so their own base is always right.
	 * `ds-scc` is the one caller — it accepts ANY code, so which view to mount is only
	 * knowable after resolution. Returning `undefined` means "this plugin has no view
	 * for that type" and produces an error card rather than a half-render.
	 */
	baseForType?: (type: string) => ElementDefinition<unknown> | undefined;
	/**
	 * SC-149 fix round (L-1) — present every reference failure as a friendly NOTICE card
	 * (what happened + what to do) instead of the framework's `<name>: failed to render
	 * (<stage>)` error card. Opt-in, and `ds-scc` is the only element that opts in: it is
	 * the one public element whose failure card is a routine, expected user experience
	 * (a code that isn't synced yet, a body that isn't a code), where "failed to render
	 * (render)" is both jargon and the wrong word. Typed elements keep the developer frame
	 * — their references are hand-authored by someone already editing YAML.
	 */
	friendlyErrors?: boolean;
}

/**
 * SC-149 — what `withReference()` returns: the wrapped def PLUS the base def it wraps.
 * `ds-scc` needs the bases of the other reference-capable elements to mount them after
 * it resolves a code (`baseForType` above), and reaching them any other way would mean
 * either re-exporting eleven inner consts by hand or re-declaring them. The wrapper
 * already holds the base — exposing it here keeps one source of truth.
 */
export type ReferenceElement<M> = ElementDefinition<RefOrInline<M>> & {
	readonly base: ElementDefinition<M>;
};

const PREFIXED_RE = /^(scc(\.v\d+)?:|@)/;

/**
 * Spec §1.3 — the block body IS a whole-block reference (return the ref string) or it is
 * inline YAML (return null). Cheapest first: prefixed/linked forms, then a bare scalar
 * (slug or full code), else null (a mapping = inline data).
 */
export function detectWholeBlockRef(data: unknown, raw: string): string | null {
	const trimmed = raw.trim();
	if (trimmed.length === 0) return null;
	// 1. Prefixed / linked canonical forms — single line.
	if (!trimmed.includes('\n')) {
		if (PREFIXED_RE.test(trimmed)) return trimmed;
		if (trimmed.startsWith('[[') && trimmed.endsWith(']]')) return trimmed;
	}
	// 2. Bare-code sugar: parseYaml yielded a bare scalar (string/number), not a mapping.
	if (typeof data === 'string' && data.trim().length > 0 && !data.includes('\n')) {
		return data.trim();
	}
	if (typeof data === 'number') return String(data);
	// 3. Otherwise inline YAML.
	return null;
}

/**
 * Wrap a base display/statblock/feature definition so its block body may be a whole-block
 * reference instead of inline YAML. `base.parse` still owns inline data; RefUnwrapView owns
 * the ref -> payload round-trip and the §1.5 degrade ladder (recon (d): resolution needs
 * full cx, so it lives in the view, not resolveRefs). autoResolveRefs stays OFF.
 */
export function withReference<M>(base: ElementDefinition<M>, opts: WithReferenceOptions): ReferenceElement<M> {
	return {
		...base,
		// SC-149: the wrapped base, exposed for `ds-scc`'s cross-type dispatch (see
		// ReferenceElement's doc). Not part of ElementDefinition — the registry copies
		// the object wholesale and ignores unknown keys.
		base,
		autoResolveRefs: false,
		// Fix round 1 (spec §1.1): lets the pipeline's parse-stage guard recognize a bare
		// `@path` body as this def's business (parseYaml would otherwise throw on the
		// leading `@` before detectWholeBlockRef ever runs) — see registry.ts's doc.
		acceptsWholeBlockRef: true,
		// Explicit `undefined` overrides (not just omissions) — `base.serialize`/
		// `base.resolveRefs` are typed against `M`, not `RefOrInline<M>`; spreading them
		// through unchanged would carry the narrower (wrong) parameter type into the
		// returned ElementDefinition<RefOrInline<M>>. Ref resolution lives entirely in
		// RefUnwrapView (recon (d)), and every base this wraps is shape:"static" (no
		// serialize), so both are simply unset here.
		resolveRefs: undefined,
		serialize: undefined,
		// SC-169: the base's chrome slot is typed against `M`, but the wrapped def's model
		// is `RefOrInline<M>` — spreading it through would be a type error AND would hand
		// the element's own summary() a wrapper object it does not understand. Lifted
		// instead, so a reference-capable element declares chrome ONCE, on its base, in
		// terms of its real model (see liftChrome).
		chrome: base.chrome ? liftChrome(base.chrome, base) : undefined,
		parse(data, raw): RefOrInline<M> {
			const ref = detectWholeBlockRef(data, raw);
			if (ref !== null) return { kind: 'ref', raw: ref };
			return { kind: 'inline', model: base.parse(data, raw) };
		},
		createView: (cx) => new RefUnwrapView<M>(cx, base, opts),
	};
}

/**
 * SC-169 — lift a base def's `chrome` slot through the reference wrapper.
 *
 * INLINE bodies delegate to the element's own summary() with its real model. A
 * WHOLE-BLOCK REFERENCE has no model at this layer at all: the resolved entity lives
 * inside RefUnwrapView, which owns the async round-trip, so the collapsed line falls back
 * to the definition's type name plus the reference text the author wrote
 * ("Statblock: scc.v1:…"). That is honest rather than wrong, and it is a rollout item
 * (the view would need to be able to refresh its own chrome summary post-resolution),
 * deliberately out of the SC-169 spec phase.
 */
function liftChrome<M>(
	chrome: ElementChrome<M>,
	base: Pick<ElementDefinition<M>, 'id' | 'name'>,
): ElementChrome<RefOrInline<M>> {
	return {
		summary: ({ model, def }) => {
			if (model.kind === 'inline') return chrome.summary({ model: model.model, def });
			return { label: base.name, name: model.kind === 'ref' ? model.raw : undefined };
		},
		items: chrome.items
			? ({ model, def }) =>
					model.kind === 'inline' ? (chrome.items?.({ model: model.model, def }) ?? []) : []
			: undefined,
		// SC-169 FIX ROUND 1 (L-1): an INVALID body is a notice card explaining what to
		// write instead ("`not a code` is not a full SCC code. …"), and a collapsed element
		// paints nothing but its one-liner — which for this model has no name to show, so
		// folding would replace the explanation with a bare "SCC REFERENCE" bar. Refuse the
		// collapse control for that model only; a well-formed reference that merely fails to
		// RESOLVE keeps it (the author's code is a real, nameable thing and the honest
		// "Statblock: scc.v1:…" line is worth folding).
		collapsible: ({ model }) => model.kind !== 'invalid',
	};
}
