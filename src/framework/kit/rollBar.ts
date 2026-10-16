// Plan 14 Task 3 (D5 §4) — kit/rollBar: the pre-roll modifier surface shared by
// the feature roller and ds-roll. Composes kit steppers + iconButtons; holds UI
// state ONLY (counts/toggles — ephemeral; the CALLER seeds/saves session state)
// and carries NO DS math: the net-effect label mirrors §1.3 for the user's eyes,
// but resolution is always resolveRoll's. Emits a plain RollBarState on Roll.
//
// SC-279 — the "roll strip": [Roll] first and always visible, then a kit
// collapsible "Modifiers" disclosure (collapsed by default on BOTH hosts) whose
// header carries a live WORDED summary of the current state, so collapsed never
// hides a fact. The expanded panel labels every control: a visible caption over
// each stepper, native labelled checkboxes for Skill / Main action, a worded
// live net-effect line, and a "Reset modifiers" text button that returns to the
// host's `defaults` (authored seeds for ds-roll; zeros for cards) — never to a
// bare zero when the host authored something else.
//
// A11y (§3.6/§4): all controls are real buttons/inputs (Tab/Enter/Space), stepper
// labels name their subject and equal the visible caption (label-in-name), the
// toggles are checkboxes (state = a check SHAPE + a word, never a hue), the net
// line is aria-live. Styling via .dse-rollbar* classes + existing --dse-* tokens
// only (OD-D5-9: no new tokens).
import type { Component } from 'obsidian';
import { collapsible } from './collapsible';
import { iconButton } from './iconButton'; // sibling imports, NEVER './index' (barrel cycle)
import type { IconButtonHandle } from './iconButton';
import { stepper } from './stepper';
import type { StepperHandle } from './stepper';
import type { SessionPersist } from '../session';
import type { RollMode } from '../roll/types';

/** The bar's emitted UI state — feeds RollInput construction in the caller. */
export interface RollBarState {
	characteristic: number;
	skillBonus: 0 | 2;
	edges: number;
	banes: number;
	mainAction: boolean;
}

export interface RollBarOptions {
	mode: RollMode;
	/** Characteristic name to label the stepper ("Reason"). Absent ⇒ no stepper (§3.3 flat-mod). */
	characteristicLabel?: string;
	/** Bound-hero value (§3.3 case 1): shown read-only, stepper suppressed. */
	characteristicFixed?: number;
	/** Initial state (session-restored by the caller). */
	initial?: Partial<RollBarState>;
	/** Show the main-action (crit-eligible) override toggle (power-roll mode only). */
	showMainAction?: boolean;
	/** Initial main-action value (inferred from usage by the caller, OD-6). */
	mainAction?: boolean;
	/**
	 * SC-279 — what "Reset modifiers" returns to (skill / edges / banes / main action; the
	 * characteristic is a fact, never reset). ds-roll passes its AUTHORED seeds so Reset
	 * lands back on what the note says; cards omit it (0 / 0 / off / the inferred
	 * `mainAction`). Distinct from `initial`, which is the (session-restored) starting state.
	 */
	defaults?: Partial<Pick<RollBarState, 'skillBonus' | 'edges' | 'banes' | 'mainAction'>>;
	/**
	 * SC-279 — session round-trip for the "Modifiers" disclosure (slot `roll.modsOpen.<n>`).
	 * Session only, never the note; the panel is collapsed unless the viewer opened it.
	 */
	persist?: SessionPersist;
	/** Fired once per Roll activation with the CURRENT state. */
	onRoll: (state: RollBarState) => void;
}

export interface RollBarHandle {
	readonly rootEl: HTMLElement;
	getState(): RollBarState;
	/** External update (session restore); re-renders controls + net label in place. */
	setState(state: Partial<RollBarState>): void;
}

/** Mounts the roll strip (Roll + collapsed "Modifiers" disclosure) into `parent` (D5 §4). */
export function rollBar(parent: HTMLElement, opts: RollBarOptions, owner: Component): RollBarHandle {
	const state: RollBarState = {
		characteristic: opts.characteristicFixed ?? opts.initial?.characteristic ?? 0,
		skillBonus: opts.initial?.skillBonus === 2 ? 2 : 0,
		edges: opts.initial?.edges ?? 0,
		banes: opts.initial?.banes ?? 0,
		mainAction: opts.mainAction ?? opts.initial?.mainAction ?? false,
	};
	const defaults = {
		skillBonus: opts.defaults?.skillBonus === 2 ? 2 : 0,
		edges: opts.defaults?.edges ?? 0,
		banes: opts.defaults?.banes ?? 0,
		mainAction: opts.defaults?.mainAction ?? opts.mainAction ?? false,
	} as const;
	// Flat dice ignore edges/banes entirely (engine step 3), so those controls — and the
	// net line that describes them — do not exist there. Skill stays: the engine adds
	// skillBonus in every mode (engine.ts step 4), so an authored `skill:` is honoured.
	const tieredEdges = opts.mode !== 'flat';
	const hasMainAction = Boolean(opts.showMainAction) && opts.mode === 'power-roll';

	const rootEl = parent.createDiv({ cls: 'dse-rollbar' });
	const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
	/** Display cap at "2+": further clicks stay "double", matching the engine clamp. */
	const capped = (n: number): string => (n >= 2 ? '2+' : String(n));

	// -- Roll: FIRST in DOM/tab order and always visible, the only accent control --
	iconButton(
		rootEl,
		{ icon: 'dices', label: 'Roll', text: 'Roll', variant: 'accent', onClick: () => opts.onRoll({ ...state }) },
		owner,
	);

	// -- the Modifiers disclosure (kit collapsible; collapsed unless the viewer opened it) --
	const mods = collapsible(
		rootEl,
		{ title: 'Modifiers', open: false, persist: opts.persist },
		owner,
	);
	mods.rootEl.addClass('dse-rollbar__mods');
	mods.contentEl.addClass('dse-rollbar__panel');
	const summaryEl = mods.headerEl.createSpan({ cls: 'dse-rollbar__summary' });
	const panelEl = mods.contentEl;

	/** A captioned field: a visible small-caps label above the control (aria-hidden — the
	 *  control carries the same text as its own accessible name, so it is announced once). */
	const field = (parentEl: HTMLElement, caption: string): HTMLElement => {
		const fieldEl = parentEl.createDiv({ cls: 'dse-rollbar__field' });
		fieldEl.createSpan({ cls: 'dse-rollbar__label', text: caption }).setAttribute('aria-hidden', 'true');
		return fieldEl;
	};

	// -- characteristic: fixed (bound hero) / manual stepper / absent --
	let charStepper: StepperHandle | undefined;
	if (opts.characteristicLabel !== undefined && opts.characteristicFixed !== undefined) {
		const fieldEl = field(panelEl, opts.characteristicLabel);
		fieldEl.createSpan({ cls: 'dse-rollbar__char-fixed', text: signed(opts.characteristicFixed) });
	} else if (opts.characteristicLabel !== undefined) {
		const fieldEl = field(panelEl, opts.characteristicLabel);
		charStepper = stepper(
			fieldEl,
			{
				value: state.characteristic, min: -5, max: 5, editable: true, integer: true,
				label: opts.characteristicLabel,
				onChange: (value) => { state.characteristic = value; render(); },
			},
			owner,
		);
	}

	// -- edge / bane steppers (kept together on one line; absent in flat mode) --
	let edgeStepper: StepperHandle | undefined;
	let baneStepper: StepperHandle | undefined;
	let netEl: HTMLElement | undefined;
	if (tieredEdges) {
		const pairEl = panelEl.createDiv({ cls: 'dse-rollbar__pair' });
		edgeStepper = stepper(
			field(pairEl, 'Edges'),
			{
				value: state.edges, min: 0, max: 9, label: 'Edges', format: capped,
				onChange: (value) => { state.edges = value; render(); },
			},
			owner,
		);
		baneStepper = stepper(
			field(pairEl, 'Banes'),
			{
				value: state.banes, min: 0, max: 9, label: 'Banes', format: capped,
				onChange: (value) => { state.banes = value; render(); },
			},
			owner,
		);
		// Live region: the plain-words effect of the current edges/banes (never colour-only).
		netEl = panelEl.createDiv({ cls: 'dse-rollbar__net' });
		netEl.setAttribute('aria-live', 'polite');
	}

	// -- native labelled checkboxes: state is a check SHAPE + the words in the label --
	const checkbox = (cls: string, text: string, checked: boolean, onChange: (on: boolean) => void): HTMLInputElement => {
		const labelEl = panelEl.createEl('label', { cls: `dse-rollbar__check ${cls}` });
		const inputEl = labelEl.createEl('input', { type: 'checkbox' });
		inputEl.checked = checked;
		labelEl.createSpan({ text });
		owner.registerDomEvent(inputEl, 'change', () => { onChange(inputEl.checked); render(); });
		return inputEl;
	};
	const skillBox = checkbox('dse-rollbar__check--skill', 'Skill applies (+2)', state.skillBonus === 2, (on) => {
		state.skillBonus = on ? 2 : 0;
	});
	// Main action = crit eligibility (OD-6): only a natural 19–20 on a MAIN-action power roll crits.
	const mainBox = hasMainAction
		? checkbox('dse-rollbar__check--main', 'Main action — natural 19–20 is a critical hit', state.mainAction, (on) => {
				state.mainAction = on;
			})
		: undefined;

	// -- reset: text + icon, back to the host's defaults; disabled when already there --
	const resetButton: IconButtonHandle = iconButton(
		panelEl,
		{
			icon: 'rotate-ccw', label: 'Reset modifiers', text: 'Reset modifiers', variant: 'ghost',
			onClick: () => { setState({ ...defaults }); },
		},
		owner,
	);
	resetButton.buttonEl.addClass('dse-rollbar__reset');

	/** Net-effect words (mirrors §1.3 / §1.5 so flat-vs-shift is visible pre-roll). */
	function netText(): string {
		// Engine parity (resolveRoll step 2): cap EACH side at 2 FIRST, then cancel —
		// 3 edges + 1 bane is a SINGLE edge, never a double. Cancel-then-cap
		// (clamp(edges − banes)) would mislabel that case; the label must never
		// disagree with the math resolveRoll applies.
		const net = Math.min(Math.max(0, state.edges), 2) - Math.min(Math.max(0, state.banes), 2);
		if (net === 0) return state.edges > 0 && state.banes > 0 ? 'Edges & banes cancel' : 'No edges or banes';
		if (opts.mode === 'opposed') return net === 2 ? 'Double edge → +4' : net === -2 ? 'Double bane → −4' : net === 1 ? 'Edge +2' : 'Bane −2';
		if (net === 2) return 'Double edge — tier ↑';
		if (net === -2) return 'Double bane — tier ↓';
		return net === 1 ? 'Edge +2' : 'Bane −2';
	}

	/** The collapsed header's worded summary: every non-default fact, so collapsed hides nothing. */
	function summaryText(): string {
		const parts: string[] = [];
		if (opts.characteristicLabel !== undefined) {
			const value = opts.characteristicFixed ?? state.characteristic;
			parts.push(`${opts.characteristicLabel} ${value === 0 ? '0' : signed(value)}`);
		}
		if (state.skillBonus === 2) parts.push('skill +2');
		if (tieredEdges && state.edges > 0) parts.push(`${state.edges} ${state.edges === 1 ? 'edge' : 'edges'}`);
		if (tieredEdges && state.banes > 0) parts.push(`${state.banes} ${state.banes === 1 ? 'bane' : 'banes'}`);
		if (hasMainAction && state.mainAction !== defaults.mainAction) {
			parts.push(state.mainAction ? 'main action' : 'not a main action');
		}
		return parts.length > 0 ? parts.join(', ') : 'none';
	}

	function atDefaults(): boolean {
		return (
			state.skillBonus === defaults.skillBonus &&
			(!tieredEdges || (state.edges === defaults.edges && state.banes === defaults.banes)) &&
			(!hasMainAction || state.mainAction === defaults.mainAction)
		);
	}

	/** Re-renders every derived readout in place (never rebuilds the controls). */
	function render(): void {
		summaryEl.setText(summaryText());
		netEl?.setText(netText());
		resetButton.setDisabled(atDefaults());
	}
	render();

	function setState(patch: Partial<RollBarState>): void {
		if (patch.characteristic !== undefined && opts.characteristicFixed === undefined) {
			state.characteristic = patch.characteristic;
			charStepper?.setValue(state.characteristic);
		}
		if (patch.skillBonus !== undefined) {
			state.skillBonus = patch.skillBonus === 2 ? 2 : 0;
			skillBox.checked = state.skillBonus === 2;
		}
		if (patch.edges !== undefined) { state.edges = patch.edges; edgeStepper?.setValue(state.edges); }
		if (patch.banes !== undefined) { state.banes = patch.banes; baneStepper?.setValue(state.banes); }
		if (patch.mainAction !== undefined) {
			state.mainAction = patch.mainAction;
			if (mainBox) mainBox.checked = state.mainAction;
		}
		render();
	}

	return { rootEl, getState: () => ({ ...state }), setState };
}
