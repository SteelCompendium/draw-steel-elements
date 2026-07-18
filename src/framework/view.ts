// F1 §3.3 — ElementView<M>: the view lifecycle base every DSE element renders through.
// Also implements the persisted write path (§4.2) and the cleanup semantics (§4.5) that
// bind to it.
//
// Design note — serializer injection (deliberate decoupling from Task 8/registry.ts):
// ElementDefinition (framework/registry.ts) does not exist yet at this point in the
// bottom-up build order, so persist() cannot import it or call `def.serialize` directly.
// Instead the view holds an injected `serialize: (model: M) => string` function, set via
// the public setSerializer() below. The pipeline (Task 9) is expected to call
// `view.setSerializer(def.serialize)` once, right after `def.createView(cx)` and before
// the first mount()/persist(), for any definition whose shape requires persistence
// (registry.ts, Task 8, rejects shape:"persisted" definitions missing `serialize`, so by
// the time a persisted view is ever mounted a serializer is guaranteed to exist). This
// keeps view.ts's import graph free of registry.ts while matching F1 §3.3's runtime
// intent verbatim ("persist(): def.serialize(model) → host.replaceSource()").
import { Component, MarkdownRenderer } from 'obsidian';
import type { RenderContext } from './context';
import { rewriteSccAnchors } from '@/refs/rewriteSccAnchors';

/** Write-behind debounce window for persist() (F1 §4.2, "~400ms trailing", OD-3 default). */
export const PERSIST_DEBOUNCE_MS = 400;

/**
 * F1 §3.3 — the abstract view lifecycle base every DSE element mounts/updates/persists
 * through. A view owns DOM (rootEl) and the current model; RenderContext (cx) owns
 * services — this class holds no Obsidian coupling beyond what cx/Component provide.
 */
export abstract class ElementView<M> extends Component {
	protected readonly cx: RenderContext;
	protected model!: M;
	/** The element's root container (a child of host.containerEl), assigned by mount(). */
	protected rootEl!: HTMLElement;

	/** Injected by the pipeline via setSerializer(); see the file header design note. */
	private serialize?: (model: M) => string;

	// -- persist() write-behind state (F1 §4.2) ---------------------------------------
	private persistTimer: number | undefined;
	private persistScheduled = false;
	private persistWaiters: Array<(ok: boolean) => void> = [];

	// -- default update() "unload children" bookkeeping -------------------------------
	// The real obsidian Component exposes no public "unload just my children" primitive
	// (only load()/unload() of the whole component, which would also unload `this`).
	// ElementView therefore tracks the children IT owns by wrapping addChild/removeChild,
	// so the default update() path (F1 §3.3: "unload children + onMount again") can tear
	// down exactly last onMount's children without unloading the view itself.
	private readonly ownedChildren: Component[] = [];

	constructor(cx: RenderContext) {
		super();
		this.cx = cx;
		// F1 §4.5: mandatory flush — registered (not an onunload() override) so it always
		// runs on unload regardless of whether a subclass overrides onunload() itself and
		// forgets to call super.onunload(). No-ops when nothing is pending (see
		// flushPersist's guard), so this is free for static/non-persisted elements.
		this.register(() => this.flushPersist());
	}

	/** Build the DOM. createEl/createDiv only; register listeners via this.registerDomEvent. */
	protected abstract onMount(root: HTMLElement, model: M): void | Promise<void>;

	/** Apply a changed model in place. Optional; default = unload children + onMount again. */
	protected onUpdate?(model: M): void | Promise<void>;

	/**
	 * Inject the model → YAML serializer persist() uses on write-back. Wired by the
	 * pipeline from `def.serialize` (Task 9) — see the file header design note. Required
	 * before the first persist() call (persist() throws a clear error otherwise, rather
	 * than silently failing inside the debounce timer).
	 */
	setSerializer(serialize: (model: M) => string): void {
		this.serialize = serialize;
	}

	// ---------------------------------------------------------------- provided (final)
	// Called by the pipeline/host — not overridden by subclasses.

	/** Mount this view: assign rootEl/model and run onMount. Called once by the pipeline. */
	async mount(root: HTMLElement, model: M): Promise<void> {
		this.rootEl = root;
		this.model = model;
		await this.onMount(root, model);
	}

	/**
	 * Apply a changed model. Delegates to onUpdate when the subclass provides it;
	 * otherwise rebuilds per F1 §3.3's default: unload this view's own children (so
	 * anything the previous onMount added via this.addChild tears down correctly),
	 * empty rootEl, and run onMount again against the new model.
	 */
	async update(model: M): Promise<void> {
		this.model = model;
		if (this.onUpdate) {
			await this.onUpdate(model);
			return;
		}
		this.unloadOwnedChildren();
		this.rootEl.empty();
		await this.onMount(this.rootEl, model);
	}

	/**
	 * Render embedded markdown lifecycle-bound to THIS view (never the plugin).
	 *
	 * F2 §4.3(a) fix wave: Obsidian's MarkdownRenderer emits `scc.v1:` links as inert
	 * external anchors; this is the ONLY render path elements use, so it is the single
	 * place to fix them up. The vault-wide sccPostProcessor (§4.3(b), main.ts) cannot
	 * cover it — this call is async and fire-and-forget from the caller's perspective,
	 * so the anchors don't exist yet when that synchronous post-processor runs. No-ops
	 * when cx.sccAnchors isn't wired (bare test/harness contexts).
	 */
	protected async renderMarkdown(markdown: string, el: HTMLElement): Promise<void> {
		await MarkdownRenderer.render(this.cx.app, markdown, el, this.cx.host.sourcePath, this);
		if (this.cx.sccAnchors) rewriteSccAnchors(el, this.cx.sccAnchors);
	}

	/**
	 * Persisted elements: serialize the current model → host.replaceSource(). No-op
	 * returning false immediately (nothing scheduled, no write attempted) when
	 * `!cx.host.canPersist` — views should already have rendered read-only affordances
	 * in that case (F1 §4.4). Otherwise a debounced write-behind: rapid calls within the
	 * ~400ms trailing window (F1 §4.2/OD-3) coalesce into exactly ONE replaceSource call
	 * that serializes whatever `this.model` holds AT FLUSH TIME (views keep pending model
	 * state authoritative until then, per §4.2 step 3). A pending write is
	 * force-flushed on unload (§4.5) so closing the note never drops the last edit.
	 */
	protected persist(): Promise<boolean> {
		if (!this.cx.host.canPersist) return Promise.resolve(false);
		if (!this.serialize) {
			throw new Error(
				'ElementView.persist(): no serializer configured. The pipeline must call ' +
					'setSerializer() (wiring def.serialize) before the first persist() call.',
			);
		}

		return new Promise<boolean>((resolve) => {
			this.persistWaiters.push(resolve);
			this.persistScheduled = true;
			if (this.persistTimer !== undefined) this.win.clearTimeout(this.persistTimer);
			this.persistTimer = this.win.setTimeout(() => this.flushPersist(), PERSIST_DEBOUNCE_MS);
		});
	}

	/** The window this view lives in (popout-safe timer/document access). */
	protected get win(): Window {
		return this.rootEl.ownerDocument.defaultView as Window;
	}

	// ---------------------------------------------------------------- internals

	/** Performs (or no-ops) the actual write; shared by the debounce timer and the
	 *  mandatory onunload flush. Resolves every persist() call coalesced into this
	 *  round with the same write result. */
	private flushPersist(): void {
		if (!this.persistScheduled) return;
		this.persistScheduled = false;
		if (this.persistTimer !== undefined) {
			this.win.clearTimeout(this.persistTimer);
			this.persistTimer = undefined;
		}
		const waiters = this.persistWaiters;
		this.persistWaiters = [];
		// persist() only ever sets persistScheduled after confirming this.serialize is
		// set, so it is guaranteed defined here.
		const yaml = this.serialize!(this.model);
		void this.cx.host.replaceSource(yaml).then((ok) => {
			for (const resolve of waiters) resolve(ok);
		});
	}

	addChild<T extends Component>(child: T): T {
		this.ownedChildren.push(child);
		return super.addChild(child);
	}

	removeChild<T extends Component>(child: T): T {
		const index = this.ownedChildren.indexOf(child);
		if (index >= 0) this.ownedChildren.splice(index, 1);
		return super.removeChild(child);
	}

	private unloadOwnedChildren(): void {
		for (const child of this.ownedChildren.slice()) {
			this.removeChild(child);
		}
	}
}

// ---------------------------------------------------------------------------------
// HeroPanel<S> / PanelHost (D7 OD-7, Task 1): RELOCATED to framework/kit/HeroPanel.ts
// (the D7 spec's file layout puts the contract in the kit, alongside the panel cores
// that implement it). Re-exported here so the pre-existing import path
// (`from '.../framework/view'`; see test/dom/framework/element-view.test.ts) keeps
// resolving to the exact same class/interface — zero behavior change.
export { HeroPanel } from './kit/HeroPanel';
export type { PanelHost } from './kit/HeroPanel';
