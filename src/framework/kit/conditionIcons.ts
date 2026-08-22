// D7 Task 1 (spec §2.1/§2.3) — conditionIcons: the per-condition icon loop lifted
// verbatim from InitiativeView.buildConditionIcons's forEach body (initiative/view.ts:
// 858, D2 §3.11), so the standalone InitiativeView and a future hero-sheet condition
// display both build identical `.dse-cond` icon markup off the same code.
//
// Scope note: only the per-entry icon rendering moved here — NOT the "Add Condition"
// affordance (that opens `ConditionsModal` (SC-186), a `src/views/` UI shell with its
// own mutate/persist wiring specific to the initiative tracker; it stays in
// InitiativeView, called after this function, exactly as before).
//
// Boundary note: `applyConditionColor`/`applyConditionEffect` (the validated
// --dse-condition-color / .condition-effect-* appliers, T8/OD-8/SD-2) live in
// src/elements/conditionColor.ts — framework/kit must never import from src/elements/
// (F1 OD-8; kit-index.test.ts enforces it with a real import scan, not just lint). The
// two tiny, pure DOM helpers are therefore duplicated here rather than imported —
// same validated behavior, zero coupling. `src/elements/conditionColor.ts` is
// untouched; its other call sites (ConditionsModal, MinionStaminaPoolModal,
// InitiativeView's own add-condition path) are unaffected. SC-186's fallback glyph/
// title-case helpers (elements/conditionDisplay.ts) are duplicated here for the same
// boundary reason — see FALLBACK_ICON/titleCaseKey below.
import type { Component } from 'obsidian';
import { setIcon } from 'obsidian';
import { iconButton } from './iconButton';
import { tooltip } from './tooltip';
import type { ConditionManager } from '@utils/Conditions';

/** Minimal condition-entry shape (mirrors drawSteelAdmonition/EncounterData's
 *  `Condition`), duplicated locally so the kit takes no dependency outside
 *  framework/utils. */
export interface ConditionIconEntry {
	key: string;
	color?: string;
	effect?: string;
}

export type ConditionIconInput = string | ConditionIconEntry;

export interface ConditionIconsOptions {
	/** Component that owns the icon buttons' registered click listeners (write mode). */
	owner: Component;
	/** When false, icons render as static, non-interactive glyphs (read-only). */
	canRemove: boolean;
	/** Called with the exact entry that was clicked to remove (write mode only). */
	onRemove?: (entry: ConditionIconInput) => void;
}

const CONDITION_EFFECTS = ['blink', 'glow', 'glow-pulse', 'breathing', 'blur-pulse'] as const;

/** SC-186 fallback glyph for an unregistered (custom) condition key — duplicate of
 *  elements/conditionDisplay.ts's FALLBACK_CONDITION_ICON (see file header for why this
 *  isn't an import). */
const FALLBACK_ICON = 'circle-dashed';

/** Duplicate of elements/conditionDisplay.ts's titleCaseConditionKey (see file header). */
function titleCaseKey(key: string): string {
	return key
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/** Duplicate of elements/conditionColor.ts's applyConditionColor (see file header for
 *  why this isn't an import). */
function applyConditionColor(el: HTMLElement, color: string | undefined): void {
	const valid =
		!!color &&
		typeof CSS !== 'undefined' &&
		typeof CSS.supports === 'function' &&
		CSS.supports('color', color);
	el.style.setProperty('--dse-condition-color', valid && color ? color : '');
}

/** Duplicate of elements/conditionColor.ts's applyConditionEffect (see file header). */
function applyConditionEffect(el: HTMLElement, effect: string | undefined): void {
	for (const known of CONDITION_EFFECTS) {
		el.classList.remove(`condition-effect-${known}`);
	}
	if (effect && (CONDITION_EFFECTS as readonly string[]).includes(effect)) {
		el.classList.add(`condition-effect-${effect}`);
	}
}

/**
 * Renders one icon per condition entry into `container` (lifted verbatim from
 * InitiativeView.buildConditionIcons's per-entry loop, initiative/view.ts:858).
 * Interactive (`iconButton`, click-to-remove) when `opts.canRemove`, else a static,
 * non-interactive span — identical DOM either way to the pre-extraction private
 * method. String entries and `{key, color?, effect?}` entries are both accepted.
 * SC-186: entries the manager doesn't recognize (custom/unregistered keys) render a
 * generic fallback glyph (circle-dashed) with a title-cased key as the accessible
 * name/tooltip, instead of being silently skipped — the only escape hatch for a
 * statblock's bespoke condition.
 */
export function buildConditionIcons(
	container: HTMLElement,
	conditions: ConditionIconInput[],
	mgr: ConditionManager,
	opts: ConditionIconsOptions,
): void {
	for (const conditionEntry of conditions) {
		let conditionKey: string;
		let conditionData: ConditionIconEntry | null = null;
		if (typeof conditionEntry === 'string') {
			conditionKey = conditionEntry;
		} else if (typeof conditionEntry === 'object' && conditionEntry.key) {
			conditionKey = conditionEntry.key;
			conditionData = conditionEntry;
		} else {
			continue;
		}

		const condition = mgr.getAnyConditionByKey(conditionKey);
		// SC-186: unregistered keys no longer skip — they render the fallback glyph +
		// title-cased key (a custom statblock condition, e.g. "hexed" -> "Hexed").
		const iconName = condition?.iconName ?? FALLBACK_ICON;
		const displayName = condition?.displayName ?? titleCaseKey(conditionKey);

		// Click-to-remove is a write — read-only renders a static state glyph.
		let iconEl: HTMLElement;
		if (opts.canRemove) {
			iconEl = iconButton(
				container,
				{
					icon: iconName,
					label: `Remove condition: ${displayName}`,
					tooltip: displayName,
					onClick: () => opts.onRemove?.(conditionEntry),
				},
				opts.owner,
			).buttonEl;
		} else {
			iconEl = container.createSpan();
			setIcon(iconEl, iconName);
			tooltip(iconEl, displayName);
		}
		iconEl.addClass('dse-cond');

		// Color and effect customizations ride the validated helpers above: the color
		// arrives as the CSS.supports-gated --dse-condition-color custom property
		// (never el.style.color), the effect as a known-vocabulary class.
		applyConditionColor(iconEl, conditionData?.color);
		applyConditionEffect(iconEl, conditionData?.effect);
	}
}
