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
import { ElementView } from '@/framework/view';
import { renderErrorCard } from '@/framework/pipeline';
import type { RenderContext } from '@/framework/context';
import type { ElementDefinition } from '@/framework/registry';
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
		const index = this.cx.compendium;
		if (!index || !index.available) {
			this.errorCard(root, 'Compendium not installed — run "Sync compendium" to render references.');
			return;
		}
		// Resolve to a bare code (bare slug -> scoped candidates; prefixed/linked -> SccResolver).
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
		const parsed = await entity?.model();
		if (!entity || parsed === undefined) {
			const name = entity?.name ?? code;
			this.errorCard(
				root,
				`"${name}" found but not renderable — this compendium predates the required block; re-sync.`,
			);
			return;
		}
		const source: RefSource = { file: entity.file, frontmatter: entity.frontmatter, body: await entity.body() };
		await this.mountBase(root, parsed as M, source);
	}

	/** Bare slug -> code (scoped, §1.3); prefixed/linked -> strip to code via SccResolver's data-scc. */
	private toCode(root: HTMLElement, raw: string, index: NonNullable<RenderContext['compendium']>): string | null {
		const isPrefixed = /^(scc(\.v\d+)?:|@|\[\[)/.test(raw);
		if (isPrefixed) {
			const resolution = this.cx.sccAnchors?.resolve(raw);
			// scc: forms carry a code; @path/[[..]] resolve via the legacy providers
			// elsewhere — for the display/statblock ref case we require an scc code, so
			// fall to unknown if not.
			if (resolution && resolution.kind !== 'unresolved') return this.codeFromRaw(raw);
			if (raw.startsWith('scc')) return this.codeFromRaw(raw);
			this.errorCard(root, `Reference \`${raw}\` is not an SCC code.`);
			return null;
		}
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
