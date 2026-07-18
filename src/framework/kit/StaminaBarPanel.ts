// D7 Task 1 (spec §2.1/§2.3) — StaminaBarPanel: the `.dse-stamina` render core lifted
// verbatim from stamina-bar/view.ts's private `renderBar`/`updateBarDisplay` (D2 §3.5),
// so the standalone StaminaBarView and a future hero-sheet StaminaPanel both build the
// identical bar off the same code. A thin function pair (not a HeroPanel subclass —
// the D7 spec is explicit about this: the standalone element already owns its own
// ElementView lifecycle; a HeroPanel wrapper would just be indirection).
//
// `updateStaminaBar` re-queries its four sub-elements from the bar root by class (no
// stored field references) so it stays a pure (root, values) -> void pair — the DOM
// identity is untouched either way (F1 §6 "explicit targeted update, no rebuild").
//
// SC-5 (D2 §5): the ONLY .style access is setProperty("--dse-*", …) — zero inline
// color, zero inline width.
import { setTooltip } from 'obsidian';
import type { Component } from 'obsidian';

/** The three numbers a stamina bar renders — deliberately NOT the `StaminaBar` model
 *  (kit stays decoupled from element-owned model shapes); callers map their model's
 *  `current_stamina`/`temp_stamina`/`max_stamina` (or hero equivalents) onto this. */
export interface StaminaBarValues {
	current: number;
	temp: number;
	max: number;
}

export interface StaminaBarRenderOptions {
	/** YAML/model `height` field (em units on the track); defaults to 1. */
	height?: number;
	/** `style: sheet` renders the "not implemented" notice instead of the bar. */
	style?: string;
	/** Whether the bar is interactive (F1 §4.4 canPersist). */
	canPersist: boolean;
	/** Click handler, registered via `owner.registerDomEvent` when canPersist. */
	onClick?: () => void;
	/** Component that owns the click listener's lifecycle. Required when canPersist
	 *  is true and onClick is supplied. */
	owner?: Component;
	/** Hover tooltip text applied when NOT canPersist (F1 §4.4 inert-but-visible). */
	readOnlyTooltip?: string;
}

const SHEET_STYLE_NOTICE = 'Sheet style is not implemented, use default style';

/** Ports StaminaBar.vue's `calculatePercentFromStamina` 1:1, re-expressed against
 *  `max` rather than a `StaminaBar` model. */
function calculatePercentFromStamina(max: number, stamina: number, ignoreDying = false): number {
	const dyingStamina = Math.floor((max ?? 0) / 2);
	const totalStamina = (max ?? 0) + dyingStamina;
	const absoluteStamina = ignoreDying ? stamina : stamina + dyingStamina;
	return (absoluteStamina / totalStamina) * 100;
}

/** The SFC's `barColor` computed, re-expressed as the [data-state] value: the state
 *  names the condition; the COLOR lives in CSS on the --dse-stamina-* tokens. */
function staminaState(s: StaminaBarValues): 'healthy' | 'winded' | 'dying' {
	const current = s.current ?? 0;
	if (current <= 0) return 'dying';
	if (current < Math.floor((s.max ?? 0) / 2)) return 'winded';
	return 'healthy';
}

/** Ports StaminaBar.vue's `overlayWidth` computed 1:1 (the dying/winded zone width). */
function overlayWidthPercent(s: StaminaBarValues): number {
	return calculatePercentFromStamina(s.max, Math.floor((s.max ?? 0) / 2), true);
}

/**
 * Renders the `.dse-stamina` bar into `root` (lifted verbatim from
 * StaminaBarView.renderBar, stamina-bar/view.ts:73). Returns the created `.dse-stamina`
 * element, or `null` when `opts.style === 'sheet'` (the notice is rendered instead and
 * there is no bar to return / update).
 */
export function renderStaminaBar(
	root: HTMLElement,
	s: StaminaBarValues,
	opts: StaminaBarRenderOptions,
): HTMLElement | null {
	if (opts.style === 'sheet') {
		root.createDiv({ cls: 'dse-stamina__notice', text: SHEET_STYLE_NOTICE });
		return null;
	}

	const bar = root.createDiv({
		cls: opts.canPersist ? 'dse-stamina dse-stamina--clickable' : 'dse-stamina',
	});
	// Sanctioned --dse-* geometry (D2 §5): the height feeds the track height.
	bar.style.setProperty('--dse-bar-h', `${opts.height ?? 1}em`);

	const trackEl = bar.createDiv({ cls: 'dse-stamina__track' });
	trackEl.createDiv({ cls: 'dse-stamina__fill' });
	trackEl.createDiv({ cls: 'dse-stamina__temp' });
	const dying = trackEl.createDiv({ cls: 'dse-stamina__threshold dse-stamina__threshold--dying' });
	dying.createSpan({ cls: 'dse-stamina__pill', text: 'Dying' });
	const winded = trackEl.createDiv({ cls: 'dse-stamina__threshold dse-stamina__threshold--winded' });
	winded.createSpan({ cls: 'dse-stamina__pill', text: 'Winded' });
	const num = trackEl.createDiv({ cls: 'dse-stamina__num' });
	num.createSpan({ cls: 'dse-stamina__pill' });

	updateStaminaBar(bar, s);

	// F1 §4.4: canPersist === false renders read-only (visible but inert) instead of a
	// dead-end click.
	if (opts.canPersist) {
		if (opts.owner && opts.onClick) {
			opts.owner.registerDomEvent(bar, 'click', opts.onClick);
		}
	} else if (opts.readOnlyTooltip !== undefined) {
		setTooltip(bar, opts.readOnlyTooltip);
	}

	return bar;
}

/**
 * Targeted DOM update (F1 §6 "explicit targeted update methods", no reactivity lib) —
 * lifted verbatim from StaminaBarView.updateBarDisplay (stamina-bar/view.ts:119):
 * re-expresses the SFC's barColor/overlayWidth/calculatePercentFromStamina computeds in
 * place, without rebuilding the DOM. `bar` is the element `renderStaminaBar` returned.
 */
export function updateStaminaBar(bar: HTMLElement, s: StaminaBarValues): void {
	const fillEl = bar.querySelector<HTMLElement>(':scope > .dse-stamina__track > .dse-stamina__fill');
	const tempEl = bar.querySelector<HTMLElement>(':scope > .dse-stamina__track > .dse-stamina__temp');
	const trackEl = bar.querySelector<HTMLElement>(':scope > .dse-stamina__track');
	const numPillEl = bar.querySelector<HTMLElement>(':scope > .dse-stamina__track > .dse-stamina__num > .dse-stamina__pill');
	if (!fillEl || !tempEl || !trackEl || !numPillEl) return;

	const current = s.current ?? 0;
	const temp = s.temp ?? 0;
	const max = s.max ?? 0;

	fillEl.style.setProperty('--dse-fill', `${calculatePercentFromStamina(max, current)}%`);
	fillEl.setAttribute('data-state', staminaState(s));
	tempEl.style.setProperty('--dse-temp-fill', `${calculatePercentFromStamina(max, temp, true)}%`);
	// ONE zone width on the track feeds both threshold regions and the numeric region
	// (inherited custom property).
	trackEl.style.setProperty('--dse-zone', `${overlayWidthPercent(s)}%`);

	// CB-17 fix (preserved from the pre-extraction code): explicit `> 0` check, not the
	// SFC's `?? 0 > 0` operator-precedence bug.
	numPillEl.setText(`(${current}/${max}${temp > 0 ? ' + ' + temp : ''})`);
}
