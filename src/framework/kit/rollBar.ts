// Plan 14 Task 3 (D5 §4) — kit/rollBar: the pre-roll modifier surface shared by
// the feature roller and ds-roll. Composes kit steppers + iconButtons; holds UI
// state ONLY (counts/toggles — ephemeral; the CALLER seeds/saves session state)
// and carries NO DS math: the net-effect label mirrors §1.3 for the user's eyes,
// but resolution is always resolveRoll's. Emits a plain RollBarState on Roll.
//
// A11y (§3.6/§4): all controls are real buttons/steppers (Tab/Enter/Space),
// aria-pressed on toggles, stepper labels name their subject. Styling via
// .dse-rollbar* classes + existing --dse-* tokens only (OD-D5-9: no new tokens).
import type { Component } from 'obsidian';
import { iconButton } from './iconButton'; // sibling imports, NEVER './index' (barrel cycle)
import type { IconButtonHandle } from './iconButton';
import { stepper } from './stepper';
import type { StepperHandle } from './stepper';
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
	/** Fired once per Roll activation with the CURRENT state. */
	onRoll: (state: RollBarState) => void;
}

export interface RollBarHandle {
	readonly rootEl: HTMLElement;
	getState(): RollBarState;
	/** External update (session restore); re-renders controls + net label in place. */
	setState(state: Partial<RollBarState>): void;
}

/** Mounts the edge/bane resolver bar into `parent` (D5 §4). */
export function rollBar(parent: HTMLElement, opts: RollBarOptions, owner: Component): RollBarHandle {
	const state: RollBarState = {
		characteristic: opts.characteristicFixed ?? opts.initial?.characteristic ?? 0,
		skillBonus: opts.initial?.skillBonus === 2 ? 2 : 0,
		edges: opts.initial?.edges ?? 0,
		banes: opts.initial?.banes ?? 0,
		mainAction: opts.mainAction ?? opts.initial?.mainAction ?? false,
	};

	const rootEl = parent.createDiv({ cls: 'dse-rollbar' });
	const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
	/** Display cap at "2+": further clicks stay "double", matching the engine clamp. */
	const capped = (n: number): string => (n >= 2 ? '2+' : String(n));

	// -- characteristic: fixed (bound hero) / manual stepper / absent --
	let charStepper: StepperHandle | undefined;
	if (opts.characteristicLabel !== undefined && opts.characteristicFixed !== undefined) {
		rootEl.createSpan({
			cls: 'dse-rollbar__char-fixed',
			text: `${opts.characteristicLabel} ${signed(opts.characteristicFixed)}`,
		});
	} else if (opts.characteristicLabel !== undefined) {
		charStepper = stepper(
			rootEl,
			{
				value: state.characteristic, min: -5, max: 5, editable: true, integer: true,
				label: opts.characteristicLabel,
				onChange: (value) => { state.characteristic = value; },
			},
			owner,
		);
	}

	// -- skill toggle --
	const skillButton = iconButton(
		rootEl,
		{
			label: 'Skill (+2)', text: 'Skill +2', pressed: state.skillBonus === 2, variant: 'ghost',
			onClick: () => {
				state.skillBonus = state.skillBonus === 2 ? 0 : 2;
				skillButton.setPressed(state.skillBonus === 2);
			},
		},
		owner,
	);

	// -- edge / bane steppers --
	const edgeStepper = stepper(
		rootEl,
		{
			value: state.edges, min: 0, max: 9, label: 'Edges', format: capped,
			onChange: (value) => { state.edges = value; renderNet(); },
		},
		owner,
	);
	const baneStepper = stepper(
		rootEl,
		{
			value: state.banes, min: 0, max: 9, label: 'Banes', format: capped,
			onChange: (value) => { state.banes = value; renderNet(); },
		},
		owner,
	);

	// -- main-action override (power-roll only, OD-6) --
	let mainActionButton: IconButtonHandle | undefined;
	if (opts.showMainAction && opts.mode === 'power-roll') {
		mainActionButton = iconButton(
			rootEl,
			{
				label: 'Main action (can crit)', text: 'Main action', pressed: state.mainAction, variant: 'ghost',
				onClick: () => {
					state.mainAction = !state.mainAction;
					mainActionButton!.setPressed(state.mainAction);
				},
			},
			owner,
		);
	}

	// -- live net-effect label (mirrors §1.3 / §1.5 so flat-vs-shift is visible pre-roll) --
	const netEl = rootEl.createSpan({ cls: 'dse-rollbar__net' });
	function renderNet(): void {
		// Engine parity (resolveRoll step 2): cap EACH side at 2 FIRST, then cancel —
		// 3 edges + 1 bane is a SINGLE edge, never a double. Cancel-then-cap
		// (clamp(edges − banes)) would mislabel that case; the label must never
		// disagree with the math resolveRoll applies.
		const net = Math.min(Math.max(0, state.edges), 2) - Math.min(Math.max(0, state.banes), 2);
		let text = '';
		if (net === 0) text = state.edges > 0 && state.banes > 0 ? 'Edges & banes cancel' : '';
		else if (opts.mode === 'opposed') text = net === 2 ? 'Double edge → +4' : net === -2 ? 'Double bane → −4' : net === 1 ? 'Edge +2' : 'Bane −2';
		else if (net === 2) text = 'Double edge — tier ↑';
		else if (net === -2) text = 'Double bane — tier ↓';
		else text = net === 1 ? 'Edge +2' : 'Bane −2';
		netEl.setText(text);
	}
	renderNet();

	// -- reset + Roll --
	iconButton(
		rootEl,
		{
			icon: 'rotate-ccw', label: 'Reset modifiers', variant: 'ghost',
			onClick: () => {
				setState({ skillBonus: 0, edges: 0, banes: 0, mainAction: opts.mainAction ?? false });
			},
		},
		owner,
	);
	iconButton(
		rootEl,
		{ icon: 'dices', label: 'Roll', text: 'Roll', variant: 'accent', onClick: () => opts.onRoll({ ...state }) },
		owner,
	);

	function setState(patch: Partial<RollBarState>): void {
		if (patch.characteristic !== undefined && opts.characteristicFixed === undefined) {
			state.characteristic = patch.characteristic;
			charStepper?.setValue(state.characteristic);
		}
		if (patch.skillBonus !== undefined) {
			state.skillBonus = patch.skillBonus === 2 ? 2 : 0;
			skillButton.setPressed(state.skillBonus === 2);
		}
		if (patch.edges !== undefined) { state.edges = patch.edges; edgeStepper.setValue(state.edges); }
		if (patch.banes !== undefined) { state.banes = patch.banes; baneStepper.setValue(state.banes); }
		if (patch.mainAction !== undefined) {
			state.mainAction = patch.mainAction;
			mainActionButton?.setPressed(state.mainAction);
		}
		renderNet();
	}

	return { rootEl, getState: () => ({ ...state }), setState };
}
