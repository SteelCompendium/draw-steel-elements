// Plan 09 Task 7 (D2 §3.10) — NegotiationView on the D2 kit. Same orchestration as the
// Plan 05 port (head + reset menu, patience/interest tracker, the two-tab
// argument/learn-more area, motivations/pitfalls details; sub-views under
// src/drawSteelAdmonition/negotiation/), rebuilt so every legacy click-<div> is a real
// control:
//  - the name line -> kit cardHead: the name lives in the NAME SLOT, the kind-noun in
//    the eyebrow — never a baked "Negotiation: " prefix, so an unnamed negotiation
//    heads as plain "Negotiation" with no dangling colon (CB-16);
//  - the settings glyph -> a kit iconButton (labelled, focusable) opening the same
//    Reset menu. The reset closure binds THIS view instance — one view per block on
//    Framework v2, so resetting tracker A can never write tracker B (CB-4; the legacy
//    singleton processor's menu closure hit the last-rendered block);
//  - the two click-div tabs -> kit tabs(): a real tablist (aria-selected, roving
//    tabindex, arrow keys); the active tab persists to cx.session through the kit's
//    SessionPersist accessor at the same (blockKey, 'tab') slot as before (F1 §4.3 /
//    OD-7 — session UI state, never written to the note);
//  - tier rows -> kit powerRollPanel(selectable) inside the argument sub-view;
//  - SC-379: the Patience/Interest standing region is two kit track() radiogroups of
//    numbered seals (PatienceInterestView), and an "ended" band (EndBandView) states the
//    book's three stop conditions. ONE callback, `refreshStanding()`, repaints all of it in
//    place — both tracks, both readouts, the now-tag, the band, `data-ended` on .dse-nt and
//    the argument area's static-roll/Complete state — whenever the standing changes (a seal
//    click, a keyboard move, Complete Argument). Reset rebuilds the whole view as before.
//
// PERSISTENCE IS UNTOUCHED (byte-compat bar): the NegotiationData model + serialize
// path are exactly the Plan 05 wrappers; sub-views mutate this.model then call the
// injected persist() (debounced write-behind, no-op when !cx.host.canPersist, F1 §4.4)
// — persist() runs only on user mutation, NEVER during render. Ordinary mutations
// update their own DOM in place; the one whole-model change is Reset: resetData() then
// the framework default update() (unload owned children + onMount on the reset model),
// then persist(). Negotiation stays NOT collapsible (no kit mountComponentWrapper).
import { Component, Menu, Notice } from 'obsidian';
import { ElementView } from '@/framework/view';
import { cardHead, iconButton, tabs } from '@/framework/kit';
import type { RenderMdCallback } from '@/framework/kit';
import { NegotiationData } from '@model/NegotiationData';
import { PatienceInterestView } from '@drawSteelAdmonition/negotiation/PatienceInterestView';
import { EndBandView } from '@drawSteelAdmonition/negotiation/EndBandView';
import { MotivationsPitfallsView } from '@drawSteelAdmonition/negotiation/MotivationsPitfallsView';
import { ArgumentView } from '@drawSteelAdmonition/negotiation/ArgumentView';
import { LearnMoreView } from '@drawSteelAdmonition/negotiation/LearnMoreView';

/** SessionStore slot for the active actions tab (F1 §4.3) — unchanged from the Plan 05
 *  port, now round-tripped by the kit tabs' SessionPersist accessor. */
const TAB_SLOT = 'tab';

export class NegotiationView extends ElementView<NegotiationData> {
	protected onMount(root: HTMLElement, model: NegotiationData): void {
		// Per-mount listener owner: the reset path rebuilds via the framework default
		// update(), whose unloadOwnedChildren() releases every registration bound here
		// before onMount runs again — nothing accumulates on the view across resets.
		const cycleOwner = this.addChild(new Component());
		// The persist callback injected into the sub-views. persist() itself no-ops
		// (returning false, scheduling nothing) when !cx.host.canPersist (F1 §4.4).
		const persist = (): void => {
			void this.persist();
		};
		// Markdown renders lifecycle-bound to THIS view (ML-1), handed to the kit
		// powerRollPanels inside the tab sub-views.
		const renderMd: RenderMdCallback = (md, el) => this.renderMarkdown(md, el);
		const canPersist = this.cx.host.canPersist;

		const container = root.createDiv({ cls: 'dse-nt' });

		// The one standing-repaint callback (see the header). The sub-views and the band are
		// assigned below, before any user action can reach it.
		let standing: PatienceInterestView | undefined;
		let band: EndBandView | undefined;
		let argument: ArgumentView | undefined;
		const refreshStanding = (): void => {
			const ending = model.ending();
			if (ending === null) container.removeAttribute('data-ended');
			else container.setAttribute('data-ended', ending);
			standing?.refresh();
			band?.refresh();
			argument?.setEnded(ending !== null);
		};

		this.buildHead(container, cycleOwner, model);

		standing = new PatienceInterestView(model, persist, refreshStanding, cycleOwner, canPersist);
		band = new EndBandView(model, standing.build(container));

		argument = this.buildActions(container, cycleOwner, model, persist, refreshStanding, renderMd, canPersist);

		new MotivationsPitfallsView(model, persist, cycleOwner, canPersist).build(container);

		refreshStanding(); // first paint: data-ended + the band for an already-ended standing
	}

	/** kit cardHead (CB-16) + the Reset options button (write action — canPersist only). */
	private buildHead(container: HTMLElement, owner: Component, model: NegotiationData): void {
		const head = container.createDiv({ cls: 'dse-nt__head' });

		// CB-16: the NAME lives in the name slot; the kind-noun is the eyebrow. Unnamed
		// negotiations promote the noun into the name slot instead — no dangling colon,
		// no doubled "Negotiation / Negotiation".
		const name = model.name?.trim() ?? '';
		cardHead(
			head,
			{
				leftEyebrow: name ? 'Negotiation' : undefined,
				name: name || 'Negotiation',
				// SC-379: the heraldic crest, as on the montage head. Steel-only and decorative
				// (crest.ts: aria-hidden); the narrow container query drops it at sidebar width.
				crest: { icon: 'handshake', size: 'lg' },
				level: 2,
			},
			owner,
		);

		// The menu's only item is Reset — a write action, so it is gated on canPersist
		// (F1 §4.4: read-only surfaces render without dead-end write affordances).
		if (!this.cx.host.canPersist) return;

		const menu = iconButton(
			head,
			{
				icon: 'more-vertical',
				label: 'Negotiation options',
				variant: 'ghost',
				onClick: (event: MouseEvent) => {
					const m = new Menu();
					m.addItem((item) =>
						item
							.setTitle('Reset negotiation')
							.setIcon('rotate-ccw')
							// CB-4: bound to THIS view instance (one per block) — never a
							// shared processor field.
							.onClick(() => void this.resetNegotiation()),
					);
					m.showAtMouseEvent(event);
				},
			},
			owner,
		);
		menu.buttonEl.addClass('dse-nt__menu');
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

	/** The two-tab actions area on kit tabs(). Both tab bodies mount up front (legacy
	 *  parity); switching is the kit's hidden-attribute panel swap. */
	private buildActions(
		container: HTMLElement,
		owner: Component,
		model: NegotiationData,
		persist: () => void,
		refreshStanding: () => void,
		renderMd: RenderMdCallback,
		canPersist: boolean,
	): ArgumentView {
		const handle = tabs(
			container,
			{
				tabs: [
					{ id: 'argument', label: 'Make an Argument', icon: 'message-circle' },
					{ id: 'learn-more', label: 'Learn Motivation/Pitfall', icon: 'help-circle' },
				],
				// Legacy default; a session-remembered selection (same blockKey/slot as
				// the Plan 05 port) wins inside the kit.
				selected: 'argument',
				persist: { session: this.cx.session, blockKey: this.cx.host.blockKey(), slot: TAB_SLOT },
			},
			owner,
		);
		handle.rootEl.addClass('dse-nt__actions');

		const argument = new ArgumentView(model, persist, refreshStanding, owner, renderMd, canPersist);
		argument.build(handle.panels['argument']);
		new LearnMoreView(owner, renderMd).build(handle.panels['learn-more']);
		return argument;
	}
}
