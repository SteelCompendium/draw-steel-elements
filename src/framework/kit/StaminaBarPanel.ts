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
import { setIcon, setTooltip } from 'obsidian';
import type { Component } from 'obsidian';
import { renderStaminaGauge, staminaState, updateStaminaGauge } from './staminaGauge';

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
	/** SC-132: build the Steel cluster (default true). The modal previews mount their own
	 *  gauge directly and pass false — they are not the whole instrument. */
	cluster?: boolean;
}

const SHEET_STYLE_NOTICE = 'Sheet style is not implemented, use default style';

/** Ports StaminaBar.vue's `calculatePercentFromStamina` 1:1, re-expressed against
 *  `max` rather than a `StaminaBar` model.
 *
 *  FOLLOWUPS #28 LOW: full-degrade (every ref fails, no authored `max_stamina`
 *  override) leaves `max=0`, so `totalStamina` is also 0 — the SFC's original
 *  division-by-zero would feed `NaN%` to a `--dse-*` CSS custom property (silently
 *  ignored by CSS, but not a defined value). Guard `totalStamina === 0` and return a
 *  defined 0% (empty bar) instead. */
function calculatePercentFromStamina(max: number, stamina: number, ignoreDying = false): number {
	const dyingStamina = Math.floor((max ?? 0) / 2);
	const totalStamina = (max ?? 0) + dyingStamina;
	if (totalStamina === 0) return 0;
	const absoluteStamina = ignoreDying ? stamina : stamina + dyingStamina;
	return (absoluteStamina / totalStamina) * 100;
}

/*  The [data-state] ladder (healthy | winded | dying) now lives in ./staminaGauge, so
    the cluster, the gauge and the modal previews cannot disagree about where "winded"
    starts. FOLLOWUPS #27a fix, preserved there verbatim: winded is "at half Stamina max
    OR BELOW" (reference/draw-steel-reference.md:274-278, "Stamina and Death" — cited as
    RR §8 by StaminaBar.isWinded's own comment) — an inclusive `<=`, matching the winded
    badge. It was a strict `<` before that fix, so the two indicators disagreed at
    exactly half stamina.                                                             */

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

	// SC-132: the Steel cluster. Built UNCONDITIONALLY and hidden by the base sheet —
	// the same convention kit/crest.ts uses, and the only correct one here: the theme is
	// a live CSS attribute (seams/theme.ts stamps `data-dse-theme`; nothing re-renders on
	// a theme switch), so a DOM that branched on the theme would be wrong the instant the
	// user flipped it. Legacy and print therefore keep the legacy track above, byte for
	// byte, and the Steel screen layer swaps which of the two is visible.
	if (opts.cluster !== false) buildCluster(bar);

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

	updateCluster(bar, s);
}

/* ==================================================================== */
/*  SC-132 — the Steel stamina cluster                                   */
/* ==================================================================== */
/*
   Scott's layout, in his own words (Linear SC-132, comment 67763d6d):

     "Left-aligned crest which effectively splits all the space to the right of it into
      two rows. The bottom row is the stamina bar. The top row has all the other data —
      the winded/dying text is left-aligned in the top row … The current stamina (in
      larger font), max stamina, and the temp stamina chip are in the top row and
      right-aligned."

        ┌──────┬────────────────┬──────────────┐
        │      │ winded         │      11 / 30 │   row 1  (baseline-aligned)
        │crest ├────────────────┴──────────────┤
        │      │ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░ │   row 2  (the gauge)
        └──────┴───────────────────────────────┘

   All four boxes are DIRECT children of the cluster, because one grid has to contain
   both the crest (spanning two rows) and the gauge (row 2, spanning two columns). The
   design rounds needed a `display: contents` wrapper to express that against a fixed
   candidate DOM; production owns its own DOM and simply does not build the wrapper.

   THE CREST IS A LIVING ICON, not a live crest — Scott's own correction: "I do think the
   crest itself is stable (un-animated) and the icon itself gets the animation; otherwise
   its too noisy." The SILHOUETTE ladder below is the first channel (shield →
   shield-alert → skull) and is real before a single frame of animation, so motion is
   never the only thing saying the state.
*/

/** The state's silhouette. Three different shapes, so the ladder survives a grayscale
 *  glance and a colourblind one — hue is never the only channel (DESIGN.md; Scott is
 *  colourblind, disclosed on this very ticket). */
const STATE_ICON: Record<'healthy' | 'winded' | 'dying', string> = {
	healthy: 'shield',
	winded: 'shield-alert',
	dying: 'skull',
};

/** The state's word. "Steady" is built but never shown — the Steel layer hides the word
 *  at healthy, because a status that is always on stops being a status. */
const STATE_LABEL: Record<'healthy' | 'winded' | 'dying', string> = {
	healthy: 'Steady',
	winded: 'Winded',
	dying: 'Dying',
};

/** Builds the cluster into `bar`. Ornament (the crest) is aria-hidden; the numerals are
 *  ordinary text, so AT reads "Stamina 11 / 30 +4" without any ARIA of its own. */
function buildCluster(bar: HTMLElement): HTMLElement {
	const cluster = bar.createDiv({ cls: 'dse-stamina__cluster' });

	// Column 1, both rows. `.dse-crest` is the kit's own heraldic shield frame, so the
	// cluster inherits SC-130's shape and optical-centring machinery instead of growing
	// a second shield.
	const crest = cluster.createSpan({ cls: 'dse-crest dse-stamina__crest' });
	crest.setAttribute('aria-hidden', 'true');
	crest.createSpan({ cls: 'dse-crest__glyph dse-stamina__crest-glyph' });

	// Row 1 left: the label and the state word.
	const id = cluster.createDiv({ cls: 'dse-stamina__cid' });
	id.createSpan({ cls: 'dse-stamina__clabel', text: 'Stamina' });
	id.createSpan({ cls: 'dse-stamina__cstate' });

	// Row 1 right: the readout.
	const nums = cluster.createDiv({ cls: 'dse-stamina__cnums' });
	nums.createSpan({ cls: 'dse-stamina__ccur' });
	nums.createSpan({ cls: 'dse-stamina__cslash', text: '/' });
	nums.createSpan({ cls: 'dse-stamina__cmax' });
	nums.createSpan({ cls: 'dse-stamina__ctemp' });

	// Row 2: the gauge, full remaining width.
	renderStaminaGauge(cluster, { dyingZone: true });
	return cluster;
}

/** Targeted refresh of the cluster (no rebuild). No-op when no cluster was built. */
function updateCluster(bar: HTMLElement, s: StaminaBarValues): void {
	const cluster = bar.querySelector<HTMLElement>(':scope > .dse-stamina__cluster');
	if (!cluster) return;

	const current = s.current ?? 0;
	const temp = s.temp ?? 0;
	const max = s.max ?? 0;
	const state = staminaState(s);

	cluster.setAttribute('data-state', state);
	cluster.setAttribute('data-temp', temp > 0 ? 'on' : 'off');

	const glyph = cluster.querySelector<HTMLElement>('.dse-stamina__crest-glyph');
	// Guarded so a refresh that does not change the state does not tear down and rebuild
	// an SVG (and, with it, restart the breathing animation on every stamina tick).
	if (glyph && glyph.getAttribute('data-icon') !== STATE_ICON[state]) {
		glyph.setAttribute('data-icon', STATE_ICON[state]);
		glyph.empty();
		setIcon(glyph, STATE_ICON[state]);
	}
	cluster.querySelector<HTMLElement>('.dse-stamina__cstate')?.setText(STATE_LABEL[state]);
	cluster.querySelector<HTMLElement>('.dse-stamina__ccur')?.setText(String(current));
	cluster.querySelector<HTMLElement>('.dse-stamina__cmax')?.setText(String(max));
	cluster.querySelector<HTMLElement>('.dse-stamina__ctemp')?.setText(temp > 0 ? `+${temp}` : '');

	const gauge = cluster.querySelector<HTMLElement>(':scope > .dse-stamina__gauge');
	if (gauge) updateStaminaGauge(gauge, s, { dyingZone: true });
}
