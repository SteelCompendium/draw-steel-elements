// Plan 05 Task 5 (F1 §6 step 8) — NegotiationView: re-expresses the deleted
// NegotiationTrackerProcessor's orchestration (name line + settings menu, patience/interest
// tracker, the two-tab argument/learn-more panel, motivations/pitfalls details) as an
// ElementView, REUSING the four existing sub-views under src/drawSteelAdmonition/negotiation/
// (they were already vanilla DOM; only their persistence coupling changed — each takes an
// injected `persist: () => void` instead of calling CodeBlocks.updateNegotiationTracker).
//
// What the framework replaced from the legacy processor:
//  - the manual capture-phase mousedown/pointerdown stop -> the pipeline's default click
//    shield (def.noClickShield unset);
//  - the try/catch + ".error-message" div -> the pipeline's single error boundary +
//    renderErrorCard;
//  - CodeBlocks.updateNegotiationTracker -> this.persist() (debounced write-behind through
//    host.replaceSource). Deliberate behavior change: the legacy processor also persisted
//    during RENDER (PatienceInterestView's display init went through its persisting
//    setters), so merely opening a note rewrote the block; on Framework v2 rendering never
//    writes — persist() runs only on user mutation.
//
// Negotiation is NOT collapsible (the legacy processor used no ComponentWrapper and the
// block has no collapsible/collapse_default keys) — the DOM builds directly under the
// element root, no kit mountComponentWrapper.
//
// Ordinary mutations need NO re-render logic here: the sub-views update their own DOM in
// place (class toggling / checkbox state) and only call persist(). The one whole-model
// change is the Reset menu: resetData() then the framework default update() (unload owned
// children + onMount against the reset model) rebuilds everything, then persist().
import { Component, Menu, Notice, setIcon } from 'obsidian';
import { ElementView } from '@/framework/view';
import { NegotiationData } from '@model/NegotiationData';
import { PatienceInterestView } from '@drawSteelAdmonition/negotiation/PatienceInterestView';
import { MotivationsPitfallsView } from '@drawSteelAdmonition/negotiation/MotivationsPitfallsView';
import { ArgumentView } from '@drawSteelAdmonition/negotiation/ArgumentView';
import { LearnMoreView } from '@drawSteelAdmonition/negotiation/LearnMoreView';
import { labeledIcon } from '@utils/common';

/** SessionStore slot for the active actions tab (F1 §4.3) — session UI state, never
 *  written to the note; survives re-renders of the same block. */
const TAB_SLOT = 'tab';

type NegotiationTab = 'argument' | 'learn-more';

export class NegotiationView extends ElementView<NegotiationData> {
	protected onMount(root: HTMLElement, model: NegotiationData): void {
		// Per-mount listener owner: the reset path rebuilds via the framework default
		// update(), whose unloadOwnedChildren() releases every registration bound here
		// before onMount runs again — nothing accumulates on the view across resets.
		const cycleOwner = this.addChild(new Component());
		// The persist callback injected into the sub-views (replaces their legacy
		// CodeBlocks.updateNegotiationTracker coupling). persist() itself no-ops (returning
		// false, scheduling nothing) when !cx.host.canPersist (F1 §4.4).
		const persist = (): void => {
			void this.persist();
		};

		// Legacy note: the processor guarded `if (!data.currentArgument)` here — dead even
		// then; NegotiationData's constructor always materializes currentArgument.
		const container = root.createDiv({ cls: 'ds-nt-container ds-container' });

		this.buildNameLine(container, cycleOwner, model);

		const trackerContainer = container.createDiv({ cls: 'ds-nt-tracker-container' });
		new PatienceInterestView(model, persist).build(trackerContainer);
		this.addActions(trackerContainer, cycleOwner, model, persist);

		const details = container.createDiv({ cls: 'ds-nt-details' });
		new MotivationsPitfallsView(model, persist).build(details);
	}

	private buildNameLine(container: HTMLElement, owner: Component, model: NegotiationData): void {
		const nameContainer = container.createDiv({ cls: 'ds-nt-name-line' });

		const name = model.name ?? '';
		nameContainer.createEl('span', { cls: 'ds-nt-name-value', text: 'Negotiation: ' + name.trim() });

		// The settings menu's only item is Reset — a write action, so it is gated on
		// canPersist (F1 §4.4: read-only surfaces render without dead-end write affordances).
		if (!this.cx.host.canPersist) return;

		const menuEl = nameContainer.createDiv({ cls: 'ds-nt-settings-menu' });
		setIcon(menuEl, 'more-vertical');
		owner.registerDomEvent(menuEl, 'click', (event: MouseEvent) => {
			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle('Reset Negotiation')
					.setIcon('rotate-ccw')
					.onClick(() => void this.resetNegotiation()),
			);
			menu.showAtMouseEvent(event);
		});
	}

	/** Reset = the one whole-model change: mutate, rebuild through the framework default
	 *  update() (unload owned children + onMount on the reset model), then persist.
	 *  Rebuild/persist failures are caught and logged — never left as unhandled
	 *  rejections. */
	private async resetNegotiation(): Promise<void> {
		new Notice('Negotiation reset to initial state');
		this.model.resetData();
		try {
			await this.update(this.model);
			await this.persist();
		} catch (error) {
			console.error('Draw Steel Elements: negotiation reset failed', error);
		}
	}

	// The two-tab actions panel (Make an Argument / Learn Motivation-Pitfall). Both tab
	// bodies mount up front (legacy parity); switching is pure .active class toggling.
	private addActions(
		parent: HTMLElement,
		owner: Component,
		model: NegotiationData,
		persist: () => void,
	): void {
		const actionsContainer = parent.createDiv({ cls: 'ds-nt-actions-container' });

		const actionTab = actionsContainer.createDiv({ cls: 'ds-nt-action-tabs' });
		const argumentTab = actionTab.createDiv({ cls: 'ds-nt-action-tab ds-nt-argument-tab' });
		labeledIcon('message-circle', 'Make an Argument', argumentTab);
		const learnMoreTab = actionTab.createDiv({ cls: 'ds-nt-action-tab ds-nt-learn-more-tab' });
		labeledIcon('help-circle', 'Learn Motivation/Pitfall', learnMoreTab);

		const argumentContainer = actionsContainer.createDiv({ cls: 'ds-nt-action-container ds-nt-argument-container' });
		const learnMoreContainer = actionsContainer.createDiv({ cls: 'ds-nt-action-container ds-nt-learn-more-container' });

		const blockKey = this.cx.host.blockKey();
		const applyTab = (tab: NegotiationTab): void => {
			argumentTab.classList.toggle('active', tab === 'argument');
			argumentContainer.classList.toggle('active', tab === 'argument');
			learnMoreTab.classList.toggle('active', tab === 'learn-more');
			learnMoreContainer.classList.toggle('active', tab === 'learn-more');
		};
		const selectTab = (tab: NegotiationTab): void => {
			applyTab(tab);
			this.cx.session.set(blockKey, TAB_SLOT, tab);
		};

		// Initial tab: session-remembered (survives re-renders/resets), else the legacy
		// default (argument active).
		applyTab(this.cx.session.get<NegotiationTab>(blockKey, TAB_SLOT) ?? 'argument');
		owner.registerDomEvent(argumentTab, 'click', () => selectTab('argument'));
		owner.registerDomEvent(learnMoreTab, 'click', () => selectTab('learn-more'));

		new ArgumentView(model, persist).build(argumentContainer);
		new LearnMoreView().build(learnMoreContainer);
	}
}
