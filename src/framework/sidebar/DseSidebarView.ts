// D8 Task 2 (spec §1.3) — DseSidebarView: the ItemView shell that owns N SidebarPanel
// children. An ItemView leaf is independent of the active markdown leaf, so this is what
// makes a mounted DSE element (initiative tracker, hero sheet, ...) survive navigating
// between notes — the same migrated F1 view mounts here with ZERO view-code changes
// (mode-blind views, F1 §2.1 principle 2); SidebarBlockHost is the only new plumbing.
import { ItemView } from 'obsidian';
import type { App, Plugin, WorkspaceLeaf } from 'obsidian';
import type { ElementPipeline } from '../pipeline';
import type { ElementRegistry } from '../registry';
import type { ReferenceService } from '../seams/refs';
import type { PreferenceStore } from '../seams/prefs';
import type { ValidationService } from '../validation';
import { SidebarPanel } from './SidebarPanel';

export const VIEW_TYPE_DSE_SIDEBAR = 'dse-sidebar';

/** One panel's persisted identity — durable across restarts via getState/setState. */
export interface SidebarPanelState {
	/** Backing note; "" only for the ephemeral plugin-data exception (spec §1.7) — not
	 *  implemented by this task (no caller constructs a "" panel yet). */
	filePath: string;
	/** e.g. "ds-initiative" — selects the ElementDefinition via registry.get, and is
	 *  also the exact fence language findAnchoredBlock scans for (anchor.ts). */
	alias: string;
	/** Durable block anchor (spec §1.5 / anchor.ts), or `null` for a `strictBody` element
	 *  (SC-158): those blocks are never stamped, so they carry no id and are addressed by
	 *  `body` below instead. */
	anchorId: string | null;
	/** SC-158 — the block's body text at bind time. Only set (and only read) when
	 *  `anchorId` is null: it IS the block's identity for a strict-body element. Persisted
	 *  with the rest of the panel state, so a pinned `ds-scc` block survives a restart. */
	body?: string;
}

export interface DseSidebarState {
	panels: SidebarPanelState[];
}

/** Services a panel needs to mount an element through the real framework — the same
 *  bundle DseSidebarView threads to every SidebarPanel it constructs, and registration.ts
 *  assembles once at plugin onload. */
export interface DseSidebarServices {
	app: App;
	plugin: Plugin;
	pipeline: ElementPipeline;
	registry: ElementRegistry;
	/**
	 * D8 Task 3 (spec §1.6) — optional: lets SidebarPanel rebuild a changed model
	 * itself (mirroring ElementPipeline.run()'s parse -> resolveRefs steps — now the
	 * SAME shared prepareModel() pipeline.ts exports, review round 1 finding #2) and
	 * hand it to the ALREADY-mounted ElementView's update() (F1 §3.3 onUpdate
	 * in-place path) on an external vault edit, instead of tearing the view's root
	 * element down and mounting a fresh one through the pipeline. Omitted by any
	 * caller/test that only cares about the mount/persist/degrade paths — those keep
	 * working via the pipeline's full remount (SidebarPanel's existing fallback),
	 * just without the in-place refresh. All three of refs/validation/prefs are
	 * required together for the fast path (prepareModel needs prefs to pop the
	 * reserved `prefs:` key).
	 */
	refs?: ReferenceService;
	validation?: ValidationService;
	prefs?: PreferenceStore;
}

export class DseSidebarView extends ItemView {
	private panels: SidebarPanel[] = [];
	private panelsEl!: HTMLElement;
	/** SC-184 (item 9) — the "no pinned blocks" explainer, shown iff `panels.length === 0`.
	 *  Lives as a sibling of the panel divs inside panelsEl; toggled by updateEmptyState. */
	private emptyStateEl: HTMLElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly services: DseSidebarServices,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_DSE_SIDEBAR;
	}

	getDisplayText(): string {
		return 'Draw Steel';
	}

	getIcon(): string {
		// lucide icon name; D2/D3 may retheme (spec §1.3).
		return 'swords';
	}

	protected async onOpen(): Promise<void> {
		this.panelsEl = this.contentEl.createDiv({ cls: 'dse-sidebar' });
		this.updateEmptyState();
	}

	protected async onClose(): Promise<void> {
		// Component cascade: unloading each panel tears down its SidebarBlockHost's vault
		// listener + the mounted ElementView (flushing any pending persist — F1 §4.5).
		for (const panel of this.panels.slice()) this.removeChild(panel);
		this.panels = [];
	}

	/** Workspace-serialized on layout save; survives restart via setState below. */
	getState(): Record<string, unknown> {
		const state: DseSidebarState = { panels: this.panels.map((panel) => ({ ...panel.state })) };
		return state as unknown as Record<string, unknown>;
	}

	/** Called by the workspace on layout restore, directly on a freshly constructed view
	 *  (independent of onOpen's own call, which always starts with zero panels — a brand
	 *  new leaf has nothing to restore). Also safe to call on an already-open view (e.g.
	 *  a later re-sync): existing panels are torn down first. */
	async setState(state: unknown): Promise<void> {
		for (const panel of this.panels.slice()) this.removeChild(panel);
		this.panels = [];
		this.ensurePanelsEl().empty();
		// .empty() above just removed it from the DOM (it was a child of panelsEl) —
		// drop the stale reference so updateEmptyState doesn't think it's still live.
		this.emptyStateEl = null;

		const panels = (state as Partial<DseSidebarState> | null)?.panels ?? [];
		for (const panelState of panels) this.mountPanel(normalizePanelState(panelState));
		// Covers the zero-panels-restored case: mountPanel is never called, so nothing
		// else would show the empty state for a workspace.json that legitimately has no
		// pinned panels.
		this.updateEmptyState();
	}

	/** Constructs + mounts a new panel (fire-and-forget on the async mount — callers that
	 *  need to observe the mounted DOM synchronously in a test should await a macrotask
	 *  flush, matching the rest of the DSE write-behind/mount conventions). */
	/**
	 * SC-153 — IDEMPOTENT by block identity. Pinning a block that is already pinned
	 * focuses the panel it already has instead of stacking a second copy of it.
	 *
	 * Every entry point funnels through here (`sendToSidebar`, so: the generic "Send block
	 * to sidebar" command, the initiative command, and the encounter builder's "Open in
	 * sidebar"), and none of them checked — so pressing any of them twice on one block
	 * mounted the same block twice, each panel independently re-rendering the same note
	 * text. The encounter builder made it obvious because its button is the one users press
	 * repeatedly, but the duplicate is the sidebar's to prevent, not the caller's.
	 *
	 * Identity mirrors the two addressing modes exactly (`SidebarPanelState`): an anchored
	 * block is its `anchorId`, a `strictBody` block is its `body`.
	 */
	addPanel(state: SidebarPanelState): SidebarPanel {
		const existing = this.panels.find((p) => samePanelTarget(p.state, state));
		if (existing) {
			// Already pinned. Re-mounting would duplicate it; doing nothing would make the
			// button feel broken when the panel is scrolled out of view — so reveal it, and
			// let the caller's own reveal of the leaf do the rest.
			existing.reveal();
			return existing;
		}
		const panel = this.mountPanel(state);
		// SC-184 (item 4) — addPanel mutates panels[] (the thing getState() serializes)
		// without this the workspace has no reason to believe its layout changed; only
		// the FIRST pin reliably persisted, via the setViewState call that created the
		// leaf in the first place (registration.ts's openSidebarView). Public API
		// (obsidian.d.ts Workspace.requestSaveLayout).
		this.services.app.workspace.requestSaveLayout();
		// SC-153 FIX ROUND 1 — a panel whose block no longer exists is not a second target,
		// it is debris. Identity dedupe above only catches a RE-pin of a block that is still
		// there; delete the block and pin its replacement and the ids legitimately differ, so
		// the user was left with two panels for one block (the dead one either showing a
		// "re-link this panel" card or, worse, stale DOM that still looked live). Sweeping
		// same-note/same-alias panels that no longer resolve turns that back into one panel.
		// Async because the check re-reads the note (see SidebarPanel.stillAddressable) —
		// same fire-and-forget convention as mountPanel's own async mount above.
		void this.evictOrphanedSiblings(panel);
		return panel;
	}

	/**
	 * SC-153 FIX ROUND 1 — drop panels bound to the same note+alias as `keep` whose backing
	 * block has vanished. Deliberately narrow: only same note AND same alias (a dead panel
	 * for some unrelated block is none of this pin's business), never `keep` itself, and
	 * only on a re-read that actually fails to locate the block — a panel that has simply
	 * not mounted yet reports addressable and is left alone.
	 */
	private async evictOrphanedSiblings(keep: SidebarPanel): Promise<void> {
		for (const panel of [...this.panels]) {
			if (panel === keep) continue;
			if (panel.state.filePath !== keep.state.filePath) continue;
			if (panel.state.alias !== keep.state.alias) continue;
			// SC-153 FIX ROUND 2 — ANCHORED panels only. "Not addressable" has to mean
			// "definitely gone" before it can justify closing a panel behind the user's back,
			// and only a stamped `_dse_anchor` gives that: `findAnchoredBlock` scans for a
			// durable id, so a miss means the block was deleted (or moved to another note),
			// never merely edited.
			//
			// A body-addressed panel (`anchorId === null` — SC-158 `strictBody`, i.e. `ds-scc`)
			// has no such id: its identity IS its body text, so the user retyping one character
			// inside the block reads as "gone" even though the block is right there. Sweeping
			// on that is wrong twice over — it closes a panel for an edit rather than a
			// deletion, AND the thing it closes is the "Backing block not found — re-link this
			// panel from the note" card, which is the user's only notice that the binding
			// broke. Re-review probe P-N: two `ds-scc` blocks in one note, edit the pinned
			// one's body, pin the other, and the first panel silently vanished.
			//
			// Deliberately NOT "skip panels showing the degrade card": in production the
			// ORPHAN this sweep exists to clear is normally already degraded (deleting the
			// block fires vault "modify" -> notifyAnchorLost -> the same card), so that guard
			// would un-fix the duplicate-panel bug in the real app while every jsdom test kept
			// passing — the mock vault never fires "modify", so the harness would never see it.
			// The authoritative-identity split is the property that actually distinguishes the
			// two cases.
			if (panel.state.anchorId === null) continue;
			if (await panel.stillAddressable()) continue;
			this.removePanel(panel);
		}
	}

	/** Tears the panel + its host/view down (Component cascade — see onClose). Now the
	 *  one real caller-facing removal path (SC-184 item 1's chrome "Unpin" and item 7's
	 *  degrade-card dismiss button both land here via SidebarPanel's onRemoveRequested
	 *  callback), where it used to have none. */
	removePanel(panel: SidebarPanel): void {
		const index = this.panels.indexOf(panel);
		if (index >= 0) this.panels.splice(index, 1);
		this.removeChild(panel);
		// SC-184 (item 4) — symmetric with addPanel's own requestSaveLayout: a removal is
		// exactly as much a layout change as an addition.
		this.services.app.workspace.requestSaveLayout();
		this.updateEmptyState();
	}

	private mountPanel(state: SidebarPanelState): SidebarPanel {
		// SC-184 (items 1/7) — `panel` is referenced inside its own removal callback, so it
		// has to exist (as a binding) before the callback can close over it; the callback
		// itself is never invoked synchronously during construction, only later from a user
		// action, so the definite-assignment below is safe.
		let panel!: SidebarPanel;
		panel = new SidebarPanel(this.services, state, () => this.removePanel(panel));
		this.panels.push(panel);
		this.addChild(panel);
		void panel.mount(this.ensurePanelsEl());
		this.updateEmptyState();
		return panel;
	}

	/** SC-184 (item 9) — the ribbon icon used to open straight into a bare, unlabeled
	 *  `<div class="dse-sidebar">`; nothing on screen said what the leaf was for or how to
	 *  put anything in it. Idempotent either direction, so every panels[]-mutating call
	 *  site (mountPanel, removePanel, setState) can just call it unconditionally. */
	private updateEmptyState(): void {
		if (this.panels.length > 0) {
			this.emptyStateEl?.remove();
			this.emptyStateEl = null;
			return;
		}
		if (this.emptyStateEl) return;
		const el = this.ensurePanelsEl().createDiv({ cls: 'dse-sidebar__empty' });
		el.createEl('div', { cls: 'dse-sidebar__empty-title', text: 'No pinned blocks' });
		el.createEl('div', {
			cls: 'dse-sidebar__empty-message',
			text:
				'Open a note in Reading view, hover a Draw Steel block, open its ⋯ menu, and ' +
				'choose "Pin to sidebar". Pinned blocks keep running here while you read other notes.',
		});
		this.emptyStateEl = el;
	}

	/** onOpen always runs before any caller can reach `addPanel`/`setState` through a real
	 *  leaf (WorkspaceLeaf.setViewState awaits it) — this guard only matters for a test or
	 *  future caller that drives the view directly without going through a leaf. */
	private ensurePanelsEl(): HTMLElement {
		if (!this.panelsEl) this.panelsEl = this.contentEl.createDiv({ cls: 'dse-sidebar' });
		return this.panelsEl;
	}
}

/**
 * SC-153 — do these two panel states address the SAME block? Deliberately mirrors the
 * addressing split in `SidebarPanelState`/`SidebarBlockHost` rather than comparing whole
 * objects: `body` is only meaningful for a strict-body (never-anchored) block. A
 * null-vs-null anchor with differing bodies is two different blocks; a shared anchorId is
 * one block regardless of body drift, which is the whole point of stamping an anchor.
 */
function samePanelTarget(a: SidebarPanelState, b: SidebarPanelState): boolean {
	if (a.filePath !== b.filePath || a.alias !== b.alias) return false;
	if (a.anchorId !== null || b.anchorId !== null) return a.anchorId === b.anchorId;
	return (a.body ?? '') === (b.body ?? '');
}

/**
 * SC-184 (item 10) — `SidebarPanelState` used to carry a `collapsed?: boolean` field that
 * nothing in `src/` ever read or wrote (a stub for the never-built dashboard chrome,
 * superseded by SC-169's real per-element collapse). Deleting the TYPE stops any NEW write
 * from re-persisting it, but a workspace.json written before this change still has the key
 * on every restored panel's state object — `setState` reads that JSON with a type assertion,
 * not real validation, so the stale key would otherwise ride along forever (through
 * `getState()`'s `{ ...panel.state }` spread) even though nothing looks at it again.
 * Rebuilding a clean object per restored panel — naming exactly the fields the current type
 * declares — makes the field actually disappear after one save, rather than merely stop
 * mattering. Never throws on a legacy object missing a field entirely: every read here is
 * already optional-safe (`?? null` / a spread-free literal).
 */
function normalizePanelState(raw: SidebarPanelState): SidebarPanelState {
	return {
		filePath: raw.filePath,
		alias: raw.alias,
		anchorId: raw.anchorId,
		...(raw.body !== undefined ? { body: raw.body } : {}),
	};
}
