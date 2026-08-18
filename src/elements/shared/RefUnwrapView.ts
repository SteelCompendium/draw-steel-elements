// src/elements/shared/RefUnwrapView.ts — D6 Task 3 (spec §1.5): resolves a whole-block
// reference IN THE VIEW (recon (d): full RenderContext is only available here — cx.refs
// alone (what resolveRefs gets) can't classify web/unresolved without throwing, and
// display families need frontmatter + body, not the first ds-block ReferenceService
// extracts).
//
//   inline  -> mount the base view directly.
//   ref     -> slug -> code (cx.compendium.resolveSlug) -> classify (cx.sccAnchors.resolve):
//                vault (model found)              -> mount base view with typed model + source
//                vault (no renderable model)       -> "found but not renderable" card
//                web                               -> "View on steelcompendium.io" + "Sync
//                                                       compendium" CTA card
//                unresolved / no index             -> unknown-code / not-installed card
import { stringifyYaml } from 'obsidian';
import { ElementView } from '@/framework/view';
import { renderErrorCard } from '@/framework/pipeline';
import type { RenderContext } from '@/framework/context';
import type { ElementDefinition } from '@/framework/registry';
import type { ResolvedRef } from '@/framework/seams/refs';
import type { ElementSummary } from '@/framework/chrome/types';
import { extractFirstDsBlockText } from '@/services/typeAdapters';
import type { RefOrInline, RefSource, WithReferenceOptions } from './withReference';

/**
 * SC-149 fix round (L-1) — the friendly frame for a reference that could not be shown.
 * Deliberately NOT the `.dse-error-card` grammar: no element name, no pipeline stage word
 * ("failed to render (render)" is jargon, and "render" is the wrong word for "your body
 * isn't a code"). Just what happened, and what to do about it. Exported so the styling
 * contract has one owner; `.dse-ref-web-card` (the "not installed locally" state) carries
 * the same classes so the two read as one family.
 */
export function renderRefNotice(root: HTMLElement, opts: { message: string; hint?: string }): void {
	const card = root.createDiv({ cls: 'dse-ref-notice' });
	card.createDiv({ cls: 'dse-ref-notice__msg', text: opts.message });
	if (opts.hint) card.createDiv({ cls: 'dse-ref-notice__hint', text: opts.hint });
}

/**
 * D6 Task 9 (spec §9 risk) — depth guard against a by-SCC ref chain that resolves back
 * into itself. Module-level (not per-instance) because the cycle we're guarding against
 * spans MULTIPLE RefUnwrapView instances: block A resolves code C, mounts a base view
 * whose rendered markdown contains a nested whole-block ref back to C — that nested block
 * gets its OWN RefUnwrapView instance (a fresh code-block mount), not a recursive call on
 * this one. `blockKey|raw` (not `raw` alone) so two DIFFERENT blocks in the same note that
 * happen to reference the same code never collide with each other.
 *
 * Deliberately a same-key REFUSAL, not a numeric depth counter: real compendium bodies
 * carry pre-resolved inline links (`[text](scc.v1:...)`), never whole-block refs — spec §9
 * itself calls practical depth "1" — so a true multi-level chain essentially can't occur
 * against real content. This is a defense-in-depth guard keyed on the raw-text form (before
 * SCC-prefix/slug normalization); it prevents obvious cycles via the same literal key in
 * the same block but is not an exhaustive resolution-cycle detector. Added at the start of
 * a resolution and removed in a `finally` once that resolution's full mount settles (covers
 * any nested rendering triggered synchronously inside it, not just the ref lookup itself) —
 * so a LATER (non-overlapping) resolution of the same key, e.g. on a subsequent onUpdate,
 * is unaffected.
 */
const IN_FLIGHT_REFS = new Set<string>();

export class RefUnwrapView<M> extends ElementView<RefOrInline<M>> {
	/** Tracks the currently-mounted base view (if any) so onUpdate can tear it down before
	 *  re-mounting — ElementView's own "unload owned children" default only fires when a
	 *  subclass does NOT define onUpdate; defining one here (needed for the degrade ladder)
	 *  opts out of that default, so this view must do its own child cleanup. */
	private mountedChild?: ElementView<M>;
	/**
	 * SC-169 round 2 (Scott's ruling 5: "the collapsed form should show the actual name, not
	 * the scc entity"). The model+definition that were ACTUALLY mounted — for a whole-block
	 * reference that is the resolved compendium entry, which is the only place the creature's
	 * real name exists. Recorded on the success path of `mountBase` only; every error/web/
	 * unresolved card leaves it unset, so the collapsed line degrades to the definition's own
	 * summary (type name + the reference text the author typed) rather than lying.
	 */
	private resolved?: { model: M; def: ElementDefinition<M> };

	constructor(
		cx: RenderContext,
		private readonly base: ElementDefinition<M>,
		private readonly opts: WithReferenceOptions,
	) {
		super(cx);
	}

	protected async onMount(root: HTMLElement, model: RefOrInline<M>): Promise<void> {
		if (model.kind === 'invalid') {
			// SC-149 (L-1): a refused body — the def already produced the user-facing
			// message; this view only has to present it.
			this.errorCard(root, model.message, model.hint);
			return;
		}
		if (model.kind === 'inline') {
			await this.mountBase(root, model.model);
			return;
		}
		await this.resolveAndMount(root, model.raw);
	}

	/**
	 * SC-145: `mountBase` mounts the wrapped base view against the SAME `root` node this
	 * view got (never a nested sub-div — see `mountBase` below), so whatever card frame
	 * the base view's OWN `authoringAnchor()` names (e.g. DisplayCardView's `.dse-card`,
	 * StatblockElementView's `.dse-sb`) is exactly as valid here. Delegating is what makes
	 * those per-view overrides reach the generic pipeline pencil at all: the pipeline
	 * calls `authoringAnchor()` on THIS view (the one `def.createView()` returned for
	 * every withReference-wrapped element — statblock/feature/featureblock + all 11 D6
	 * display-family elements), never on the inner one directly. Falls back to `rootEl`
	 * when nothing mounted yet (an error/web/unresolved-ref card, none of which override
	 * authoringAnchor — also moot, since `def.noAuthoringButton`/error-path short-circuits
	 * usually apply, but a safe default regardless).
	 */
	authoringAnchor(): HTMLElement {
		return this.mountedChild?.authoringAnchor() ?? this.rootEl;
	}

	/**
	 * SC-169 round 2 (ruling 5) — the collapsed one-line form for a reference body reports
	 * the RESOLVED entry's name ("Statblock: Human Bandit Chief"), never the code. Delegates
	 * to whichever definition actually rendered (`baseForType` may have picked a different
	 * family than this wrapper's own base, which is also the right label to show), with its
	 * real typed model. Undefined until a resolution succeeds — the framework then falls back
	 * to `liftChrome`'s honest "type name + the reference text" line.
	 */
	chromeSummary(): ElementSummary | undefined {
		const resolved = this.resolved;
		if (!resolved?.def.chrome) return undefined;
		return resolved.def.chrome.summary({
			model: resolved.model,
			def: { id: resolved.def.id, name: resolved.def.name },
		});
	}

	protected async onUpdate(model: RefOrInline<M>): Promise<void> {
		if (this.mountedChild) {
			this.removeChild(this.mountedChild);
			this.mountedChild = undefined;
		}
		this.resolved = undefined;
		this.rootEl.empty();
		// SC-149 (H-1): a previous successful mount may have re-stamped the root with the
		// RESOLVED family's element id (see mountBase). Put the block's own id back before
		// re-resolving, or an edit that turns a statblock code into a bad body would leave
		// the root claiming to be a statblock.
		this.rootEl.setAttribute('data-dse-element', this.base.id);
		await this.onMount(this.rootEl, model);
	}

	private async resolveAndMount(root: HTMLElement, raw: string): Promise<void> {
		const trimmed = raw.trim();

		// D6 Task 9 (spec §9 risk): refuse a ref that is already mid-resolution for this
		// SAME block — see IN_FLIGHT_REFS's doc comment above for why this is keyed on
		// blockKey+raw and why a same-key refusal (not a numeric depth budget) is the
		// right shape. Guards BOTH ladders below (legacy @path/[[wikilink]] and the SCC
		// ladder) since both ultimately resolve "this ref" and mount a base view.
		const guardKey = `${this.cx.host.blockKey()}|${trimmed}`;
		if (IN_FLIGHT_REFS.has(guardKey)) {
			this.errorCard(
				root,
				`Reference nesting too deep — \`${trimmed}\` is already resolving in this block (spec §9 depth guard).`,
			);
			return;
		}
		IN_FLIGHT_REFS.add(guardKey);
		try {
			// `@path` / `[[wikilink]]` — the legacy forms D6 spec §1.1 says "still work" —
			// carry no SCC code at all, so cx.sccAnchors/cx.compendium can never classify
			// them; they resolve entirely through cx.refs (the ReferenceService's at-path/
			// wikilink providers, F1 §3.7). Handled BEFORE the SCC ladder below, which stays
			// scc-prefixed/bare-slug only (fix round 1, Critical finding).
			if (trimmed.startsWith('@') || (trimmed.startsWith('[[') && trimmed.endsWith(']]'))) {
				await this.resolveLegacyRef(root, trimmed);
				return;
			}

			const index = this.cx.compendium;
			if (!index || !index.available) {
				this.errorCard(root, 'Compendium not installed — run "Sync compendium" to render references.');
				return;
			}
			// Resolve to a bare code (bare slug -> scoped candidates; scc-prefixed -> SccResolver).
			const code = this.toCode(root, raw, index);
			if (code === null) return; // toCode already rendered the right card
			const resolution = this.cx.sccAnchors?.resolve(`scc:${code}`);
			if (!resolution || resolution.kind === 'unresolved') {
				this.errorCard(root, `Unknown SCC code \`${code}\`. Try Draw Steel: Insert compendium reference.`);
				return;
			}
			if (resolution.kind === 'web') {
				this.webCard(root, code, resolution.url);
				return;
			}
			// vault -> typed model + source, or the "found but not renderable" degrade.
			const entity = await index.getEntity(code);
			if (!entity) {
				this.errorCard(
					root,
					`"${code}" found but not renderable — this compendium predates the required block; re-sync.`,
				);
				return;
			}
			// SC-149 — which base def renders this code? For every typed element that is
			// always its own base; `ds-scc` supplies a `baseForType` that dispatches on the
			// resolved entity's SCC `type` (the same TYPE_ADAPTERS ordering CompendiumIndex
			// used to build the model just below, so the two can never disagree about which
			// family a `type` belongs to). Checked BEFORE `entity.model()` so a type this
			// plugin cannot render says so plainly instead of blaming a stale compendium.
			const base = this.baseForType(entity.type);
			if (base === undefined) {
				this.errorCard(
					root,
					`"${entity.name}" (type: ${entity.type || 'unknown'}) has no renderer in this plugin.`,
				);
				return;
			}
			const parsed = await entity.model();
			if (parsed === undefined) {
				// Minor fix (review round 1, spec §1.5): name the file + frontmatter `type`,
				// not just the entity's display name, so a user debugging a stale-compendium
				// file can tell which file/version is stale.
				const type = entity.type || 'unknown';
				this.errorCard(
					root,
					`"${entity.name}" found but not renderable — ${entity.file.path} (type: ${type}) predates the required block; re-sync.`,
				);
				return;
			}
			const source: RefSource = { file: entity.file, frontmatter: entity.frontmatter, body: await entity.body() };
			await this.mountBase(root, parsed as M, source, base);
		} finally {
			IN_FLIGHT_REFS.delete(guardKey);
		}
	}

	/**
	 * `@path`/`[[wikilink]]` legacy forms (D6 spec §1.1, fix round 1 — Critical finding).
	 * Resolved through `cx.refs` (the at-path/wikilink `RefProvider`s, F1 §3.7), NOT
	 * `cx.sccAnchors`/`cx.compendium` — these raw strings carry no SCC code to classify,
	 * so the SCC ladder always misclassified them as "not an SCC code". `ResolvedRef.data`
	 * is the target's parsed first-`ds-*`-block payload (an already-parsed object, per
	 * `extractFirstDsBlock`'s `parseYaml(match[2])` — NOT the raw block text).
	 *
	 * Task 4 fix (statblock/feature/featureblock e2e verification): spec §1.2's original
	 * sketch called `base.parse(resolved.data, "")` — empty raw — which is correct for a
	 * `data`-driven base.parse (the display family, Task 6) but silently produces an
	 * EMPTY model for the ds-block family's SDK-reader defs (`(_data, raw) =>
	 * X.readYaml(raw)`, statblock/feature/featureblock), which ignore `data` entirely and
	 * re-`parseYaml` an empty string. Both parse shapes need SOME non-empty `raw` string
	 * from a single already-parsed `ResolvedRef`, with no def-shape sniffing here.
	 *
	 * Fix round 1 (Low, task-4-review.md finding 3): `ResolvedRef` always carries `.file`
	 * for both built-in providers (at-path/wikilink — `resolveByPath` in
	 * `src/framework/seams/refs.ts` always sets it), so prefer the byte-original block
	 * TEXT via `extractFirstDsBlockText` (the same helper `TYPE_ADAPTERS`' by-SCC path
	 * uses) — this makes the legacy-ref path byte-identical to inline, matching the
	 * guarantee already established for by-SCC, rather than merely "value-identical after
	 * a `stringifyYaml` round-trip." The round-trip (mirroring `FormModal.ts`'s own
	 * `def.parse(data, stringifyYaml(data))`) is kept ONLY as a fallback for a
	 * `RefProvider` that resolves data without a backing vault file (none of the built-ins
	 * do this today, but the seam is public — `ReferenceService.register` — so a future/
	 * custom provider could), or for the defensive case where the file's own ds-* block
	 * text can't be re-extracted despite `.data` having parsed successfully upstream.
	 *
	 * Source threading (`RefSource` / `SourceAware`) has no direct `ResolvedRef`
	 * equivalent for this path (no frontmatter/type contract the way a compendium
	 * `CompendiumEntity` has) — deliberately skipped: display-family cards are not
	 * expected to be authored via `@path`/`[[wikilink]]` in practice (§2.3's SourceAware
	 * threading targets real compendium hits).
	 */
	private async resolveLegacyRef(root: HTMLElement, raw: string): Promise<void> {
		let resolved: ResolvedRef;
		try {
			resolved = await this.cx.refs.resolve(raw, this.cx.host.sourcePath);
		} catch (error) {
			this.errorCard(root, error instanceof Error ? error.message : String(error));
			return;
		}
		const rawText = await this.legacyRefRawText(resolved);
		const model = this.base.parse(resolved.data, rawText);
		await this.mountBase(root, model);
	}

	/** Fix round 1 (Low, finding 3): byte-original block text over a `stringifyYaml`
	 *  round-trip whenever a vault file backs the resolution — see resolveLegacyRef's
	 *  doc comment above for why. */
	private async legacyRefRawText(resolved: ResolvedRef): Promise<string> {
		if (resolved.file) {
			const text = await extractFirstDsBlockText(this.cx.app, resolved.file);
			if (text !== null) return text;
		}
		return resolved.data === undefined ? '' : stringifyYaml(resolved.data);
	}

	/** Bare slug -> code (scoped, §1.3); scc-prefixed -> strip to code. `@path`/`[[..]]`
	 *  never reach here (handled earlier by resolveLegacyRef). */
	private toCode(root: HTMLElement, raw: string, index: NonNullable<RenderContext['compendium']>): string | null {
		if (/^scc(\.v\d+)?:/.test(raw)) return this.codeFromRaw(raw);
		if (raw.includes('/')) return raw; // already a full source/type/item code
		const candidates = index.resolveSlug(raw, this.opts.sccType);
		if (candidates.length === 1) return candidates[0];
		if (candidates.length === 0) {
			this.errorCard(root, `No compendium entry matches \`${raw}\` for this element.`);
		} else {
			this.errorCard(
				root,
				`\`${raw}\` is ambiguous — paste a full code: ${candidates.map((c) => `\`${c}\``).join(', ')}`,
			);
		}
		return null;
	}

	private codeFromRaw(raw: string): string {
		return raw.trim().replace(/^scc(\.v\d+)?:/, '').split('#')[0].trim();
	}

	/** SC-149 — the base def for a resolved SCC `type` (see WithReferenceOptions.baseForType).
	 *  Without the option this is always the wrapped base, i.e. the pre-SC-149 behavior. */
	private baseForType(type: string): ElementDefinition<M> | undefined {
		if (!this.opts.baseForType) return this.base;
		return this.opts.baseForType(type) as ElementDefinition<M> | undefined;
	}

	private async mountBase(root: HTMLElement, model: M, source?: RefSource, base?: ElementDefinition<M>): Promise<void> {
		const resolved = base ?? this.base;
		// SC-149 fix round, H-1 (HIGH) — the pipeline stamped `data-dse-element` with the
		// BLOCK's element id (pipeline.ts, before any resolution could know better). When
		// `baseForType` picked a different view, that left `ds-scc`'s statblock/feature/
		// featureblock output matching NONE of the 84 element-scoped CSS rules in
		// styles-source.css: no card gradient, no block rhythm, no hairline, plan 25's
		// standalone action-spine removal silently reverted, and every SC-123/SC-146
		// statblock/featureblock preference a no-op (the pref attributes are stamped, but
		// their selectors also require the element id). Re-stamp to the view that actually
		// rendered — "ds-scc renders the REAL statblock card" is then true at the CSS layer
		// too, which is the honest semantics. SUCCESS PATH ONLY: every error/notice card
		// above keeps the block's own id, so nothing styles an error as a statblock.
		if (resolved.id !== this.base.id) root.setAttribute('data-dse-element', resolved.id);
		const view = resolved.createView(this.cx);
		if (source && isSourceAware(view)) view.setSource(source);
		this.mountedChild = view;
		// SC-169 round 2 (ruling 5): remember WHAT was mounted, so the collapsed one-line
		// form can name the resolved entry instead of echoing the author's code.
		this.resolved = { model, def: resolved };
		this.addChild(view);
		await view.mount(root, model);
	}

	/** SC-149 (L-1): `friendlyErrors` elements get a plain-language notice card; everything
	 *  else keeps the framework's `<name>: failed to render (<stage>)` frame verbatim. The
	 *  MESSAGE is identical either way — only the frame differs — so every pinned message
	 *  still reads the same in both. */
	private errorCard(root: HTMLElement, message: string, hint?: string): void {
		if (this.opts.friendlyErrors) {
			renderRefNotice(root, { message, hint });
			return;
		}
		renderErrorCard(root, { id: this.base.id, name: this.base.name }, new Error(message));
	}

	private webCard(root: HTMLElement, code: string, url: string): void {
		const card = root.createDiv({ cls: 'dse-ref-notice dse-ref-web-card', attr: { 'data-scc': code } });
		card.createDiv({ cls: 'dse-ref-notice__msg dse-ref-web-card__msg', text: 'Not installed locally.' });
		const a = card.createEl('a', { cls: 'dse-ref-web-card__link', text: 'View on steelcompendium.io', href: url });
		a.setAttribute('target', '_blank');
		a.setAttribute('rel', 'noopener');
		card.createDiv({
			cls: 'dse-ref-notice__hint dse-ref-web-card__cta',
			text: 'Run "Sync compendium" to embed it here.',
		});
	}
}

function isSourceAware(v: unknown): v is { setSource(s: RefSource): void } {
	return typeof (v as { setSource?: unknown }).setSource === 'function';
}
