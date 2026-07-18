// D8 Task 2 (spec §1.4/§1.6) — SidebarPanel: one mounted element + its SidebarBlockHost.
// A Component so it attaches to DseSidebarView's lifecycle (Component cascade: closing the
// leaf, or removePanel, tears the host + mounted ElementView down together).
//
// mount() drives the SAME ElementPipeline.run() the reading-mode markdown post-processor
// calls (registerFrameworkElements.ts) — no forked render logic, per spec §1's "reuses F1
// views unchanged (mode-agnostic)" guardrail.
import { Component, TFile } from 'obsidian';
import type { App, Plugin } from 'obsidian';
import type { ElementPipeline } from '../pipeline';
import type { ElementRegistry } from '../registry';
import { SidebarBlockHost } from '../host/SidebarBlockHost';
import type { SidebarPanelState } from './DseSidebarView';

export interface SidebarPanelDeps {
	app: App;
	plugin: Plugin;
	pipeline: ElementPipeline;
	registry: ElementRegistry;
}

export class SidebarPanel extends Component {
	private host: SidebarBlockHost | null = null;
	private panelEl: HTMLElement | null = null;

	constructor(
		private readonly deps: SidebarPanelDeps,
		readonly state: SidebarPanelState,
	) {
		super();
	}

	/** Resolves the def, builds the SidebarBlockHost, and drives the existing
	 *  parse -> validate -> resolve refs -> create view -> mount pipeline against the
	 *  anchored block's current body. Renders the read-only "not addressable" degrade
	 *  card (F1 §4.4 / spec §1.5) instead when the def is unknown, the backing note is
	 *  missing, or the anchored block can't currently be found. */
	async mount(container: HTMLElement): Promise<void> {
		this.panelEl = container.createDiv({ cls: 'dse-sidebar__panel' });

		const def = this.deps.registry.get(this.state.alias);
		if (!def) {
			this.renderUnavailable(`Unknown Draw Steel element "${this.state.alias}".`);
			return;
		}

		const backingFile = this.deps.app.vault.getAbstractFileByPath(this.state.filePath);
		if (!(backingFile instanceof TFile)) {
			this.renderUnavailable(`Note not found: ${this.state.filePath}`);
			return;
		}

		const host = new SidebarBlockHost(
			this.deps.plugin,
			backingFile,
			this.state.alias,
			this.state.anchorId,
			this.panelEl,
			this,
			(body) => void this.handleExternalChange(body),
			() => this.handleAnchorLost(),
		);
		this.host = host;
		await host.refresh();

		const body = host.currentBody();
		if (body === null) {
			this.renderUnavailable('Backing block not found — re-link this panel from the note.');
			return;
		}

		await this.deps.pipeline.run(def, body, host);
	}

	onunload(): void {
		this.panelEl?.remove();
	}

	/**
	 * spec §1.6: an external edit to the same note (e.g. the block also visible in a
	 * side-by-side markdown view) hands the changed body here. F1's ElementView.update()
	 * (the onUpdate in-place path) is the ideal target, but pipeline.run() doesn't return
	 * the view it mounted, so there is no handle to call update() on directly from outside
	 * the pipeline. Falls back to a full unload-and-remount through the SAME pipeline
	 * entry point instead: tear down whatever the pipeline last mounted (host's
	 * lastMountedChild — see that file's doc) and re-run pipeline.run() with the fresh
	 * body. Correct (no leaked Component, no duplicate DOM) but heavier than an in-place
	 * update; wiring true onUpdate reuse here is a FOLLOWUPS candidate (would need
	 * pipeline.ts to expose/return the mounted view, an F1 file out of this task's scope).
	 */
	private async handleExternalChange(body: string): Promise<void> {
		if (!this.host || !this.panelEl) return;
		const def = this.deps.registry.get(this.state.alias);
		if (!def) return;

		const previous = this.host.lastMountedChild;
		if (previous) this.removeChild(previous);
		this.panelEl.empty();
		await this.deps.pipeline.run(def, body, this.host);
	}

	/**
	 * Safety net (spec §1.6 / review finding #1, HIGH): SidebarBlockHost calls this the
	 * moment ITS OWN write (persist() -> replaceSource()) discovers the anchored block is
	 * gone — which the self-echo guard would otherwise hide forever, since a self-write
	 * never fires handleExternalChange above. Tears down whatever's currently mounted (same
	 * as handleExternalChange) and renders the SAME "backing block not found" degrade card
	 * mount() itself shows when the block can't be located up front — never a silent,
	 * permanently-broken save.
	 */
	private handleAnchorLost(): void {
		if (!this.host || !this.panelEl) return;
		const previous = this.host.lastMountedChild;
		if (previous) this.removeChild(previous);
		this.renderUnavailable('Backing block not found — re-link this panel from the note.');
	}

	private renderUnavailable(message: string): void {
		if (!this.panelEl) return;
		this.panelEl.empty();
		this.panelEl.setAttribute('data-dse-sidebar-unavailable', 'true');
		const card = this.panelEl.createDiv({ cls: 'dse-error-card' });
		card.createEl('div', { cls: 'dse-error-card-title', text: 'Draw Steel: panel unavailable' });
		card.createEl('div', { cls: 'dse-error-card-message', text: message });
	}
}
