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
import { wrapMarkdownTables } from './mdTableWrap';
import type { ElementSummary } from './chrome/types';

/** Write-behind debounce window for persist() (F1 §4.2, "~400ms trailing", OD-3 default). */
export const PERSIST_DEBOUNCE_MS = 400;

// ---------------------------------------------------------------------------------
// SC-169 FIX ROUND 1 (H-1) — the "an element root just got re-rendered" hook.
//
// Everything the PIPELINE appends after `mount()` — the SC-169 chrome panel, the collapsed
// one-line bar, the D9 authoring pencil — is DOM the view knows nothing about, sitting in
// DOM the view owns. `update()`'s default path empties `rootEl` and re-runs `onMount`, so
// all of it is destroyed, and nothing put it back: mounting happened exactly once, in
// `run()`.
//
// For the pencil that was a cosmetic loss (SC-145; its pref is default-OFF). For chrome it
// was a data-visibility bug: `data-dse-collapsed` lives on the root and SURVIVES `empty()`,
// so a collapsed element came back with the attribute set, no summary bar, and every
// rebuilt child hidden by the collapse rule — a zero-height invisible block with no expand
// control anywhere. Reproduced in real Obsidian by collapsing a statblock and toggling
// "Enable dice rolling", and reachable from a dozen other places besides
// (`setCharacteristicProvider`, every GM tracker's own buttons,
// `SidebarPanel.handleExternalChange`).
//
// KEYED ON THE ROOT ELEMENT, not on the view, and that is the whole design decision. The
// view that re-renders a root is not always the view the pipeline mounted: `RefUnwrapView`
// mounts a CHILD ElementView onto the very same root node, and for a `ds-statblock` /
// `ds-feature` body it is that CHILD which subscribes to the roll preferences and calls
// `this.update(...)`. A hook stored on the pipeline's own view instance would simply never
// fire for the most common trigger there is. Keying on the node means every rebuilder —
// parent, child, or any wrapper written later — finds the same hook with no cooperation
// and nothing to forward. A WeakMap so a detached root is collectable as usual.
type AfterRenderHook = () => void;
const AFTER_RENDER = new WeakMap<HTMLElement, AfterRenderHook>();

/**
 * Register the pipeline's "re-attach my DOM" hook for an element root. Called once per
 * block, BEFORE `view.mount()` — so a rebuild triggered from inside `onMount` is covered
 * too — and never invoked by `mount()` itself (the pipeline runs the first leg directly).
 */
export function registerAfterRender(root: HTMLElement, hook: AfterRenderHook): void {
	AFTER_RENDER.set(root, hook);
}

/** Run the hook registered for `root`, if any. No-op for every unregistered node. */
export function runAfterRender(root: HTMLElement): void {
	AFTER_RENDER.get(root)?.();
}

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
	 * SC-145: the DOM node the pipeline's generic reading-mode "Edit <element>" pencil
	 * (D9's authoringControls pref, ElementPipeline.run) should be mounted INTO. Must be
	 * whichever node actually carries the element's visible card frame (border/
	 * background/padding) — the pipeline appends the button as this node's last child
	 * right after mount(), so the button renders visually INSIDE the card rather than as
	 * a stray sibling below/outside it.
	 *
	 * Defaults to `rootEl`, which is correct for every view that mounts its content
	 * straight onto root: the shared "card plate" CSS rule (styles-source.css, ~:4068)
	 * targets `[data-dse-element]` directly for counter/initiative/encounter/
	 * negotiation/montage/project/party/feature/featureblock, so root itself IS the
	 * visible box for those, regardless of whatever nested wrapper div (`.dse-counter`,
	 * `.dse-init`, …) the view happens to render its own content into.
	 *
	 * A view whose visible card frame is instead a NESTED child div — the D6
	 * display-family `.dse-card` (DisplayCardView, below) and statblock's `.dse-sb`
	 * (StatblockElementView) — overrides this to return that node. Called by the
	 * pipeline AFTER `mount()` resolves, so an overriding view's card node is guaranteed
	 * to already exist by call time.
	 */
	authoringAnchor(): HTMLElement {
		return this.rootEl;
	}

	/**
	 * SC-169 round 2 (Scott's ruling 5) — a VIEW-level override for the collapsed one-line
	 * form, consulted before `def.chrome.summary(model)` every time the element collapses.
	 *
	 * Only a view whose real model is not the model the pipeline parsed needs this. That is
	 * exactly one shape today: `RefUnwrapView`, where the parsed model is `{kind:'ref', raw}`
	 * — the SCC code the author typed — and the resolved statblock/feature/creature only
	 * exists after an async round-trip inside the view. Returning `undefined` (the default,
	 * and the honest answer before resolution settles) falls back to the definition's own
	 * summary.
	 */
	chromeSummary(): ElementSummary | undefined {
		return undefined;
	}

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
	 * The model this view last rendered. Public so the pipeline's afterRender hook (below)
	 * can rebuild its own DOM against current data without the pipeline having to shadow
	 * every `update(model)` call itself.
	 */
	currentModel(): M {
		return this.model;
	}

	/**
	 * Apply a changed model. Delegates to onUpdate when the subclass provides it;
	 * otherwise rebuilds per F1 §3.3's default: unload this view's own children (so
	 * anything the previous onMount added via this.addChild tears down correctly),
	 * empty rootEl, and run onMount again against the new model.
	 *
	 * BOTH branches end in the afterRender hook (SC-169 fix round 1): a subclass that
	 * defines `onUpdate` is not exempt — `RefUnwrapView`'s empties `rootEl` too.
	 */
	async update(model: M): Promise<void> {
		this.model = model;
		if (this.onUpdate) {
			await this.onUpdate(model);
		} else {
			this.unloadOwnedChildren();
			this.rootEl.empty();
			await this.onMount(this.rootEl, model);
		}
		runAfterRender(this.rootEl);
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
	 *
	 * SC-121 Batch 4 (batch-3 review L-5): the same seam also wraps bare markdown tables
	 * in a `.dse-md-table` horizontal scroll container (mdTableWrap.ts) — the plugin's
	 * equivalent of the site's Material `.md-typeset__table`, without which a wide book
	 * table overflows its card unreachably at sidebar width.
	 */
	protected async renderMarkdown(markdown: string, el: HTMLElement): Promise<void> {
		await MarkdownRenderer.render(this.cx.app, markdown, el, this.cx.host.sourcePath, this);
		if (this.cx.sccAnchors) rewriteSccAnchors(el, this.cx.sccAnchors);
		wrapMarkdownTables(el);
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

	/**
	 * Tear down exactly the children THIS view added (via addChild) without touching
	 * rootEl or the view itself. `protected` (not `private`) so a subclass that owns a
	 * finer-grained re-render than the default update() — e.g. DisplayCardView's
	 * theme-conditional branch swap (SC-100) — can reuse the same owned-children
	 * bookkeeping instead of re-deriving it.
	 */
	protected unloadOwnedChildren(): void {
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
