// D8 Task 2 (spec §1.4/§1.6) — SidebarPanel: one mounted element + its SidebarBlockHost.
// A Component so it attaches to DseSidebarView's lifecycle (Component cascade: closing the
// leaf, or removePanel, tears the host + mounted ElementView down together).
//
// mount() drives the SAME ElementPipeline.run() the reading-mode markdown post-processor
// calls (registerFrameworkElements.ts) — no forked render logic, per spec §1's "reuses F1
// views unchanged (mode-agnostic)" guardrail.
import { Component, TFile } from 'obsidian';
import type { App, Plugin } from 'obsidian';
import { iconButton } from '../kit/iconButton';
import type { ElementPipeline } from '../pipeline';
import { prepareModel } from '../pipeline';
import type { ElementRegistry } from '../registry';
import type { ReferenceService } from '../seams/refs';
import type { PreferenceStore } from '../seams/prefs';
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
	 *  bundle DseSidebarView threads through unchanged). All three of refs/validation/
	 *  prefs must be present for handleExternalChange's in-place refresh fast path
	 *  (review round 1, finding #1/#2): prepareModel() needs prefs to pop the reserved
	 *  `prefs:` key, same as ElementPipeline.run() does. */
	refs?: ReferenceService;
	validation?: ValidationService;
	prefs?: PreferenceStore;
}

export class SidebarPanel extends Component {
	private host: SidebarBlockHost | null = null;
	private panelEl: HTMLElement | null = null;
	/** SC-184 — the mounted element's own render root, i.e. the SidebarBlockHost's
	 *  containerEl. Separate from `panelEl` now that the panel also carries a header
	 *  (renderHeader) outside the pipeline's own DOM. */
	private bodyEl: HTMLElement | null = null;

	constructor(
		private readonly deps: SidebarPanelDeps,
		readonly state: SidebarPanelState,
		/** SC-184 — wired by DseSidebarView.mountPanel to `() =>
		 *  this.removePanel(panel)`. Backs both the chrome menu's "Unpin from sidebar"
		 *  item (via SidebarBlockHost.requestRemoval) and the degrade card's "Remove
		 *  panel" dismiss button (renderUnavailable) — one removal path, two entry
		 *  points. */
		private readonly onRemoveRequested: () => void,
	) {
		super();
	}

	/** Resolves the def, builds the SidebarBlockHost, and drives the existing
	 *  parse -> validate -> resolve refs -> create view -> mount pipeline against the
	 *  anchored block's current body. Renders the read-only "not addressable" degrade
	 *  card (F1 §4.4 / spec §1.5) instead when the def is unknown, the backing note is
	 *  missing, or the anchored block can't currently be found. */
	/**
	 * SC-153 — bring an ALREADY-mounted panel to the user's attention, for the case where
	 * they pinned a block that is pinned already (`DseSidebarView.addPanel`). Without this
	 * the second press looks like nothing happened when the panel is scrolled out of view.
	 * Deliberately does not re-render: the panel is already live and, for the encounter
	 * builder's refresh path, its host's own change listener has already picked up the new
	 * body. `scrollIntoView` is guarded because jsdom does not implement it.
	 */
	reveal(): void {
		this.panelEl?.scrollIntoView?.({ block: 'nearest' });
	}

	/**
	 * SC-153 FIX ROUND 1 — does this panel's backing block still exist in the note?
	 * `DseSidebarView.evictOrphanedSiblings` uses it to clear debris left when the user
	 * deletes a pinned block and then pins its replacement.
	 *
	 * Re-reads the note through the host rather than trusting the cached content: the whole
	 * point is to run right after someone else changed the file, and the host's vault
	 * "modify" listener is not guaranteed to have landed yet (it may not have fired at all
	 * in a synthetic host). `refresh()` is safe to call again — its listener registration is
	 * guarded — and re-priming the cache is exactly what a panel about to be judged stale
	 * should do anyway.
	 *
	 * Returns TRUE (keep the panel) whenever the answer is not a definite "gone": an
	 * unmounted panel has no host yet, and a read failure is not evidence of deletion.
	 */
	async stillAddressable(): Promise<boolean> {
		if (!this.host) return true;
		try {
			await this.host.refresh();
		} catch {
			return true;
		}
		return this.host.getBlockInfo() !== null;
	}

	async mount(container: HTMLElement): Promise<void> {
		this.panelEl = container.createDiv({ cls: 'dse-sidebar__panel' });
		this.renderHeader();
		this.bodyEl = this.panelEl.createDiv({ cls: 'dse-sidebar__panel-body' });

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
			this.state.body ?? null,
			this.bodyEl,
			this,
			(body) => void this.handleExternalChange(body),
			() => this.handleAnchorLost(),
			this.onRemoveRequested,
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

	/**
	 * SC-184 (item 3) — element label + source note name, always rendered regardless of
	 * whether the block below mounts successfully or degrades: this is what lets a stack
	 * of panels (including a "note not found" card) be told apart at all. The note name is
	 * a real link (`workspace.openLinkText`) rather than plain text — cheap, and it turns
	 * the header into a way BACK to the source note, not just a label.
	 */
	private renderHeader(): void {
		if (!this.panelEl) return;
		const def = this.deps.registry.get(this.state.alias);
		const header = this.panelEl.createDiv({ cls: 'dse-sidebar__panel-header' });
		header.createSpan({ cls: 'dse-sidebar__panel-label', text: def?.name ?? this.state.alias });
		const noteLink = header.createEl('a', {
			cls: 'dse-sidebar__panel-note',
			text: this.noteBasename(),
			href: '#',
		});
		noteLink.setAttribute('title', this.state.filePath);
		noteLink.setAttribute('aria-label', `Open ${this.state.filePath}`);
		this.registerDomEvent(noteLink, 'click', (event) => {
			event.preventDefault();
			void this.deps.app.workspace.openLinkText(this.state.filePath, '', false);
		});
	}

	/** The backing note's display name: the real TFile's basename when it still exists,
	 *  else a best-effort derivation from the persisted path (a "note not found" panel
	 *  should still show SOMETHING recognisable in its header). */
	private noteBasename(): string {
		const file = this.deps.app.vault.getAbstractFileByPath(this.state.filePath);
		if (file instanceof TFile) return file.basename;
		const last = this.state.filePath.split('/').pop() ?? this.state.filePath;
		return last.replace(/\.md$/i, '');
	}

	onunload(): void {
		this.panelEl?.remove();
	}

	/**
	 * spec §1.6: an external edit to the same note (e.g. the block also visible in a
	 * side-by-side markdown view) hands the changed body here. F1's ElementView.update()
	 * (the onUpdate in-place path) IS the target — the sidebar is spec'd as "the first
	 * real consumer of onUpdate" — via prepareModel() (pipeline.ts, shared with
	 * ElementPipeline.run() as of review round 1 finding #2), which runs the pipeline's
	 * exact parse -> pop `prefs:` -> validate -> resolveRefs slice to get a fresh model
	 * without going through step 6 (create-view-and-mount). host.lastMountedChild
	 * (SidebarBlockHost's handle on whatever the pipeline last addChild'd) is the same
	 * ElementView instance the pipeline mounted; calling .update(model) on it directly
	 * leaves its rootEl — `[data-dse-element="<id>"]` — untouched (ElementView.update()'s
	 * default path only empties/rebuilds the root's CHILDREN, never the root itself),
	 * which is what makes this an in-place refresh and not a remount.
	 *
	 * Falls back to the pipeline's full unload-and-remount (the original behavior) when
	 * the fast path isn't available: refs/validation/prefs weren't all threaded in (D8
	 * Task 2 callers/tests that don't care about live refresh), nothing is currently
	 * mounted (e.g. the panel was previously degraded), or prepareModel() throws (schema
	 * drift, a dangling ref, ...) — in which case the pipeline's own error card is the
	 * correct outcome, not something to swallow silently here.
	 */
	private async handleExternalChange(body: string): Promise<void> {
		if (!this.host || !this.bodyEl) return;
		const def = this.deps.registry.get(this.state.alias);
		if (!def) return;

		const { refs, validation, prefs } = this.deps;
		if (refs && validation && prefs) {
			const previous = this.host.lastMountedChild;
			if (previous instanceof ElementView) {
				try {
					const { model } = await prepareModel(def, body, {
						prefs,
						refs,
						validation,
						sourcePath: this.host.sourcePath,
					});
					await previous.update(model);
					return;
				} catch {
					// Fall through to the full remount below.
				}
			}
		}

		const previous = this.host.lastMountedChild;
		if (previous) this.removeChild(previous);
		this.bodyEl.empty();
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
		if (!this.host || !this.bodyEl) return;
		const previous = this.host.lastMountedChild;
		if (previous) this.removeChild(previous);
		this.renderUnavailable('Backing block not found — re-link this panel from the note.');
	}

	/**
	 * SC-184 (item 7) — every degrade card (unknown element, note not found, backing
	 * block not found) now offers a "Remove panel" button, reusing the exact same
	 * removal path item 1's chrome menu "Unpin" uses (`onRemoveRequested`, threaded from
	 * DseSidebarView.mountPanel). Before this a degraded panel was permanent debris: it
	 * has no chrome menu of its own (nothing mounted through the pipeline to hang one
	 * off), so the header's plain label was the only thing on it a user could act on.
	 */
	private renderUnavailable(message: string): void {
		if (!this.bodyEl || !this.panelEl) return;
		this.bodyEl.empty();
		// On the OUTER panel (not bodyEl): the header stays visible above the degrade card,
		// and this is the attribute existing tests/CSS hooks already key off of.
		this.panelEl.setAttribute('data-dse-sidebar-unavailable', 'true');
		const card = this.bodyEl.createDiv({ cls: 'dse-error-card' });
		card.createEl('div', { cls: 'dse-error-card-title', text: 'Draw Steel: panel unavailable' });
		card.createEl('div', { cls: 'dse-error-card-message', text: message });
		iconButton(
			card,
			{
				icon: 'x',
				label: 'Remove panel',
				variant: 'ghost',
				onClick: () => this.onRemoveRequested(),
			},
			this,
		);
	}
}
