// D8 Task 2 (spec §1.4/§1.6) — SidebarPanel: one mounted element + its SidebarBlockHost.
// A Component so it attaches to DseSidebarView's lifecycle (Component cascade: closing the
// leaf, or removePanel, tears the host + mounted ElementView down together).
//
// mount() drives the SAME ElementPipeline.run() the reading-mode markdown post-processor
// calls (registerFrameworkElements.ts) — no forked render logic, per spec §1's "reuses F1
// views unchanged (mode-agnostic)" guardrail.
import { Component, parseYaml, TFile } from 'obsidian';
import type { App, Plugin } from 'obsidian';
import type { ElementDefinition } from '../registry';
import type { ElementPipeline } from '../pipeline';
import type { ElementRegistry } from '../registry';
import type { ReferenceService } from '../seams/refs';
import type { ValidationService } from '../validation';
import { ElementView } from '../view';
import { SidebarBlockHost } from '../host/SidebarBlockHost';
import type { SidebarPanelState } from './DseSidebarView';

export interface SidebarPanelDeps {
	app: App;
	plugin: Plugin;
	pipeline: ElementPipeline;
	registry: ElementRegistry;
	/** D8 Task 3 (spec §1.6) — optional; see DseSidebarServices's field doc (the same
	 *  bundle DseSidebarView threads through unchanged). */
	refs?: ReferenceService;
	validation?: ValidationService;
}

/**
 * D8 Task 3 (spec §1.6) — the "parse -> (validate) -> resolveRefs" slice of
 * ElementPipeline.run() (pipeline.ts steps 2-5), reproduced here so handleExternalChange
 * can rebuild a model WITHOUT going through the pipeline's create-view-and-mount (step
 * 6): the whole point is handing the fresh model to the view ALREADY mounted, via
 * ElementView.update(), rather than tearing its root element down. Mirrors pipeline.ts's
 * own resolveRefs / autoResolveRefs precedence exactly, so a body that would parse
 * successfully through the real pipeline parses identically here. Deliberately does NOT
 * reproduce pipeline.ts's error-card rendering, click shield, or theme/pref stamping —
 * any throw here is treated by the caller as "can't refresh in place" and falls back to
 * the pipeline's full mount path, which already owns all of that.
 */
async function refreshModel(
	def: ElementDefinition,
	body: string,
	refs: ReferenceService,
	validation: ValidationService,
	sourcePath: string,
): Promise<unknown> {
	const rawData = parseYaml(body);
	if (def.schema) {
		const result = validation.validate(def.id, def.schema, rawData ?? null);
		if (!result.valid) throw new Error(`Schema validation failed for "${def.id}" during sidebar refresh.`);
	}
	if (def.resolveRefs) {
		const model = def.parse(rawData, body);
		return await def.resolveRefs(model, refs);
	}
	if (def.autoResolveRefs === true) {
		const resolved = await refs.resolveDeep(rawData, sourcePath);
		return def.parse(resolved, body);
	}
	return def.parse(rawData, body);
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
	 * (the onUpdate in-place path) IS the target — the sidebar is spec'd as "the first
	 * real consumer of onUpdate" — via refreshModel() above, which reproduces just enough
	 * of the pipeline's parse/resolveRefs to get a fresh model without going through
	 * step 6 (create-view-and-mount). host.lastMountedChild (SidebarBlockHost's handle on
	 * whatever the pipeline last addChild'd) is the same ElementView instance the
	 * pipeline mounted; calling .update(model) on it directly leaves its rootEl —
	 * `[data-dse-element="<id>"]` — untouched (ElementView.update()'s default path only
	 * empties/rebuilds the root's CHILDREN, never the root itself), which is what makes
	 * this an in-place refresh and not a remount.
	 *
	 * Falls back to the pipeline's full unload-and-remount (the original behavior) when
	 * the fast path isn't available: refs/validation weren't threaded in (D8 Task 2
	 * callers/tests that don't care about live refresh), nothing is currently mounted
	 * (e.g. the panel was previously degraded), or refreshModel() throws (schema drift, a
	 * dangling ref, ...) — in which case the pipeline's own error card is the correct
	 * outcome, not something to swallow silently here.
	 */
	private async handleExternalChange(body: string): Promise<void> {
		if (!this.host || !this.panelEl) return;
		const def = this.deps.registry.get(this.state.alias);
		if (!def) return;

		const { refs, validation } = this.deps;
		if (refs && validation) {
			const previous = this.host.lastMountedChild;
			if (previous instanceof ElementView) {
				try {
					const model = await refreshModel(def, body, refs, validation, this.host.sourcePath);
					await previous.update(model);
					return;
				} catch {
					// Fall through to the full remount below.
				}
			}
		}

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
