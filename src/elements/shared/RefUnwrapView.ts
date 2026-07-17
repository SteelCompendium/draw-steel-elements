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
import type { RefOrInline, RefSource, WithReferenceOptions } from './withReference';

export class RefUnwrapView<M> extends ElementView<RefOrInline<M>> {
	/** Tracks the currently-mounted base view (if any) so onUpdate can tear it down before
	 *  re-mounting — ElementView's own "unload owned children" default only fires when a
	 *  subclass does NOT define onUpdate; defining one here (needed for the degrade ladder)
	 *  opts out of that default, so this view must do its own child cleanup. */
	private mountedChild?: ElementView<M>;

	constructor(
		cx: RenderContext,
		private readonly base: ElementDefinition<M>,
		private readonly opts: WithReferenceOptions,
	) {
		super(cx);
	}

	protected async onMount(root: HTMLElement, model: RefOrInline<M>): Promise<void> {
		if (model.kind === 'inline') {
			await this.mountBase(root, model.model);
			return;
		}
		await this.resolveAndMount(root, model.raw);
	}

	protected async onUpdate(model: RefOrInline<M>): Promise<void> {
		if (this.mountedChild) {
			this.removeChild(this.mountedChild);
			this.mountedChild = undefined;
		}
		this.rootEl.empty();
		await this.onMount(this.rootEl, model);
	}

	private async resolveAndMount(root: HTMLElement, raw: string): Promise<void> {
		const trimmed = raw.trim();
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
		await this.mountBase(root, parsed as M, source);
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
	 * re-`parseYaml` an empty string. Re-serializing `resolved.data` back to YAML text
	 * (mirroring `FormModal.ts`'s own `def.parse(data, stringifyYaml(data))` round-trip)
	 * gives BOTH parse shapes what they need from a single already-parsed object, with no
	 * def-shape sniffing here.
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
		const rawYaml = resolved.data === undefined ? '' : stringifyYaml(resolved.data);
		const model = this.base.parse(resolved.data, rawYaml);
		await this.mountBase(root, model);
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

	private async mountBase(root: HTMLElement, model: M, source?: RefSource): Promise<void> {
		const view = this.base.createView(this.cx);
		if (source && isSourceAware(view)) view.setSource(source);
		this.mountedChild = view;
		this.addChild(view);
		await view.mount(root, model);
	}

	private errorCard(root: HTMLElement, message: string): void {
		renderErrorCard(root, { id: this.base.id, name: this.base.name }, new Error(message));
	}

	private webCard(root: HTMLElement, code: string, url: string): void {
		const card = root.createDiv({ cls: 'dse-ref-web-card', attr: { 'data-scc': code } });
		card.createDiv({ cls: 'dse-ref-web-card__msg', text: 'Not installed locally.' });
		const a = card.createEl('a', { cls: 'dse-ref-web-card__link', text: 'View on steelcompendium.io', href: url });
		a.setAttribute('target', '_blank');
		a.setAttribute('rel', 'noopener');
		card.createDiv({ cls: 'dse-ref-web-card__cta', text: 'Run "Sync compendium" to embed it here.' });
	}
}

function isSourceAware(v: unknown): v is { setSource(s: RefSource): void } {
	return typeof (v as { setSource?: unknown }).setSource === 'function';
}
