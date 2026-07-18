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
	/** Durable block anchor (spec §1.5 / anchor.ts). */
	anchorId: string;
	collapsed?: boolean;
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

		const panels = (state as Partial<DseSidebarState> | null)?.panels ?? [];
		for (const panelState of panels) this.mountPanel(panelState);
	}

	/** Constructs + mounts a new panel (fire-and-forget on the async mount — callers that
	 *  need to observe the mounted DOM synchronously in a test should await a macrotask
	 *  flush, matching the rest of the DSE write-behind/mount conventions). */
	addPanel(state: SidebarPanelState): SidebarPanel {
		return this.mountPanel(state);
	}

	/** Tears the panel + its host/view down (Component cascade — see onClose). */
	removePanel(panel: SidebarPanel): void {
		const index = this.panels.indexOf(panel);
		if (index >= 0) this.panels.splice(index, 1);
		this.removeChild(panel);
	}

	private mountPanel(state: SidebarPanelState): SidebarPanel {
		const panel = new SidebarPanel(this.services, state);
		this.panels.push(panel);
		this.addChild(panel);
		void panel.mount(this.ensurePanelsEl());
		return panel;
	}

	/** onOpen always runs before any caller can reach `addPanel`/`setState` through a real
	 *  leaf (WorkspaceLeaf.setViewState awaits it) — this guard only matters for a test or
	 *  future caller that drives the view directly without going through a leaf. */
	private ensurePanelsEl(): HTMLElement {
		if (!this.panelsEl) this.panelsEl = this.contentEl.createDiv({ cls: 'dse-sidebar' });
		return this.panelsEl;
	}
}
