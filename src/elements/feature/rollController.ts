// Plan 14 Task 4 (D5 §3) — the per-effect roll controller for the shared feature
// grammar. renderFeature mounts ONE controller per rolling effect (spec §3.1:
// each rollable effect rolls independently) when hooks are supplied; without
// hooks (rollingEnabled off, or no cx.roll) renderFeature output is byte-
// identical to today.
//
// Flow (§3.2/§3.4): a Roll button (die icon) — first activation reveals the
// resolver bar AND rolls; the bar stays for adjust-and-reroll. Results highlight
// the resolved tier row via the panel's data-dse-roll-result channel (crit adds
// the crit row), render a result card (aria-live), and land in SessionStore
// (roll.lastInput.<n> / roll.history.<n>, cap 10 — OD-8). Rolling NEVER writes
// the note; read-only hosts roll fine (reconciliation delta 12).
import type { Component } from 'obsidian';
import type { RenderContext } from '@/framework/context';
import { iconButton, rollBar, rollResultCard } from '@/framework/kit';
import type { PowerRollPanelHandle, PowerRollTier, RollBarHandle, RollBarState } from '@/framework/kit';
import { parseRollExpression } from '@/framework/roll/parse';
import type { RollService } from '@/framework/roll/service';
import type { RollInput, RollResult } from '@/framework/roll/types';
import type { CharacteristicProvider } from '@/framework/roll/binding';
import type { SessionStore } from '@/framework/session';

/** Everything the controller needs from the element view's cx (kept plain so
 *  renderFeature stays cx-free — reconciliation delta 6). */
export interface FeatureRollHooks {
	service: RollService;
	clickToRoll: boolean;
	session: SessionStore;
	blockKey: string;
	provider?: CharacteristicProvider;
}

/** Builds hooks from a view's cx, or undefined when rolling is off/unavailable.
 *  The undefined path IS the fidelity bar: renderFeature renders exactly today's DOM. */
export function featureRollHooks(
	cx: RenderContext,
	provider?: CharacteristicProvider,
): FeatureRollHooks | undefined {
	if (!cx.roll || !cx.prefs.get('rollingEnabled')) return undefined;
	return {
		service: cx.roll,
		clickToRoll: cx.prefs.get('rollClickToRoll'),
		session: cx.session,
		blockKey: cx.host.blockKey(),
		provider,
	};
}

const TIER_TO_ROW: readonly PowerRollTier[] = ['low', 'mid', 'high'];

export interface AttachRollControlsOptions {
	/** The effect's host element (the .dse-section / feature root the panel sits in). */
	hostEl: HTMLElement;
	panel: PowerRollPanelHandle;
	/** The effect's raw `roll:` string (parsed leniently; absent ⇒ bare power roll). */
	rollExpr: string | undefined;
	/** OD-6: inferred from usage via actionTypeOf === 'main'; bar shows the override. */
	mainActionDefault: boolean;
	/** Accessible name: "Roll <ability>". */
	abilityName: string;
	/** Per-feature rolling-effect ordinal — keys the session slots. */
	effectIndex: number;
	hooks: FeatureRollHooks;
	owner: Component;
}

/** Layers roll interactivity onto one mounted power-roll panel. */
export function attachRollControls(opts: AttachRollControlsOptions): void {
	const parsed = parseRollExpression(opts.rollExpr ?? '');
	const lastSlot = `roll.lastInput.${opts.effectIndex}`;
	const historySlot = `roll.history.${opts.effectIndex}`;
	const fixed =
		parsed.characteristic !== undefined
			? opts.hooks.provider?.get(parsed.characteristic)
			: undefined;

	// Bar + result mount BELOW the panel, inside the effect's host.
	const areaEl = opts.hostEl.createDiv({ cls: 'dse-roll-area' });
	let bar: RollBarHandle | undefined;
	let cardHostEl: HTMLElement | undefined;

	// The launch affordance: in the panel head when it has one, else atop the area.
	const launchHost = opts.panel.headEl ?? areaEl;
	const launch = iconButton(
		launchHost,
		{
			icon: 'dices',
			label: `Roll ${opts.abilityName}`,
			variant: 'ghost',
			onClick: () => void doRoll(), // first click reveals the bar AND rolls (§3.2)
		},
		opts.owner,
	);
	launch.buttonEl.addClass('dse-roll-btn');

	if (opts.hooks.clickToRoll) {
		// Pointer convenience on the STATIC panel rows (feature grammar is never
		// selectable — negotiation's radios keep their own click semantics untouched).
		opts.owner.registerDomEvent(opts.panel.rootEl, 'click', (evt: MouseEvent) => {
			if ((evt.target as HTMLElement).closest('.dse-pr__row')) void doRoll();
		});
	}

	function ensureBar(): RollBarHandle {
		if (bar) return bar;
		const last = opts.hooks.session.get<Partial<RollBarState>>(opts.hooks.blockKey, lastSlot);
		bar = rollBar(
			areaEl,
			{
				mode: parsed.mode,
				characteristicLabel:
					parsed.characteristic !== undefined
						? parsed.characteristic.charAt(0).toUpperCase() + parsed.characteristic.slice(1)
						: undefined,
				characteristicFixed: fixed,
				initial: last,
				showMainAction: true,
				mainAction: opts.mainActionDefault,
				onRoll: (state) => void doRoll(state),
			},
			opts.owner,
		);
		return bar;
	}

	async function doRoll(state?: RollBarState): Promise<void> {
		const s = state ?? ensureBar().getState();
		opts.hooks.session.set(opts.hooks.blockKey, lastSlot, s);
		const input: RollInput = {
			mode: parsed.mode,
			characteristic: s.characteristic,
			skillBonus: s.skillBonus,
			flatBonus: parsed.flatBonus,
			edges: s.edges,
			banes: s.banes,
			isMainActionAbility: s.mainAction,
		};
		const result = await opts.hooks.service.roll(input);
		const history = opts.hooks.session.get<RollResult[]>(opts.hooks.blockKey, historySlot) ?? [];
		opts.hooks.session.set(opts.hooks.blockKey, historySlot, [...history, result].slice(-10));
		renderResult(result);
	}

	function renderResult(result: RollResult): void {
		let active: PowerRollTier[] | null = null;
		if (result.tier !== undefined) {
			active = [TIER_TO_ROW[result.tier - 1]];
			// Nat-19–20 crit also lights the crit line when the ability has one (§3.4).
			if (result.isCritical && opts.panel.rowEls.crit) active.push('crit');
		}
		opts.panel.setRollResult(active);
		cardHostEl?.remove();
		cardHostEl = areaEl.createDiv();
		rollResultCard(
			cardHostEl,
			{
				result,
				delegate: opts.hooks.service.delegate,
				onReroll: () => void doRoll(),
				onClear: clear,
			},
			opts.owner,
		);
	}

	function clear(): void {
		opts.panel.setRollResult(null);
		cardHostEl?.remove();
		cardHostEl = undefined;
	}
}
