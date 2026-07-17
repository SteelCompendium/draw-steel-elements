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
import type { TFile } from 'obsidian';
import { RefUnwrapView } from './RefUnwrapView';

/** The resolved compendium file backing a whole-block reference (display family, §2.3). */
export interface RefSource {
	file: TFile;
	frontmatter: Record<string, unknown>;
	body: string;
}

/** parse()'s output for a wrapped def: either the base model (inline body) or an
 *  unresolved reference string (whole-block ref — resolved later, in the view). */
export type RefOrInline<M> = { kind: 'inline'; model: M } | { kind: 'ref'; raw: string };

/** A base view that wants the resolved source file threaded in (display family, §2.3). */
export interface SourceAware {
	setSource(source: RefSource): void;
}

export interface WithReferenceOptions {
	/** SCC type family this element renders — scopes bare-slug sugar (§1.3). */
	sccType: string | RegExp;
}

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
export function withReference<M>(
	base: ElementDefinition<M>,
	opts: WithReferenceOptions,
): ElementDefinition<RefOrInline<M>> {
	return {
		...base,
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
		parse(data, raw): RefOrInline<M> {
			const ref = detectWholeBlockRef(data, raw);
			if (ref !== null) return { kind: 'ref', raw: ref };
			return { kind: 'inline', model: base.parse(data, raw) };
		},
		createView: (cx) => new RefUnwrapView<M>(cx, base, opts),
	};
}
