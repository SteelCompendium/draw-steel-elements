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
import { getStaminaCandidate } from './staminaCandidate';

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

/** The SFC's `barColor` computed, re-expressed as the [data-state] value: the state
 *  names the condition; the COLOR lives in CSS on the --dse-stamina-* tokens.
 *
 *  FOLLOWUPS #27a fix: winded is "at half Stamina max OR BELOW"
 *  (reference/draw-steel-reference.md:274-278, "Stamina and Death" — cited as RR §8 by
 *  StaminaBar.isWinded's own comment) — an inclusive `<=`, matching the winded badge
 *  (stamina-bar/view.ts's renderRecoveries) which already used `<=`. This was
 *  previously a strict `<`, so the two indicators disagreed at exactly half stamina;
 *  now both sides of the boundary agree. */
function staminaState(s: StaminaBarValues): 'healthy' | 'winded' | 'dying' {
	const current = s.current ?? 0;
	if (current <= 0) return 'dying';
	if (current <= Math.floor((s.max ?? 0) / 2)) return 'winded';
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

	// SC-132 candidate stage: the redesign layer. `getStaminaCandidate()` is null
	// everywhere except the visual harness's `?cand=` runs, so production / jest / the
	// standard shots sweep build exactly the DOM above and nothing else.
	buildCandidateLayer(bar);

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

	updateCandidateLayer(bar, s);
}

/* ==================================================================== */
/*  SC-132 CANDIDATE STAGE ONLY — the stamina-cluster redesign layer     */
/* ==================================================================== */
/*
   Everything below exists to let Scott pick a DIRECTION from real, screenshotted
   implementations; it is not the shipping shape. See kit/staminaCandidate.ts for
   the contract that keeps it out of production, jest and the frozen shots:
   `getStaminaCandidate()` is null unless the visual harness set it, and both
   entry points below early-return on null BEFORE touching the DOM.

   ONE superset DOM serves all four candidates — each candidate's CSS reveals the
   parts it uses and hides the rest — so there is a single build/update path to
   keep correct rather than four. When a direction is picked, its own nodes get
   lifted into a purpose-built renderer and this file returns to its pre-SC-132
   shape plus that one treatment.

   Geometry travels as --dse-* custom properties exactly like the legacy bar (SC-5:
   the only .style access anywhere in this file is setProperty("--dse-*", …)).
*/

/** Lucide glyph carried by the state crest (candidates C and D). */
const STATE_ICON: Record<'healthy' | 'winded' | 'dying', string> = {
	healthy: 'shield',
	winded: 'shield-alert',
	dying: 'skull',
};

const STATE_LABEL: Record<'healthy' | 'winded' | 'dying', string> = {
	healthy: 'Steady',
	winded: 'Winded',
	dying: 'Dying',
};

/**
 * Candidate B's discrete-segment model. Stamina must stay COUNTABLE for the
 * segment idea to mean anything, so the cell VALUE is chosen from a coarse ladder
 * such that the body lands in a countable band (<= 15 cells) rather than one cell
 * per stamina point (a level-10 hero's 48 stamina would be an unreadable comb).
 */
function segmentStep(max: number): number {
	for (const step of [1, 2, 3, 5, 10, 20, 25]) {
		if (Math.ceil(max / step) <= 15) return step;
	}
	return 50;
}

/** Builds the candidate superset DOM into `bar`. No-op unless a candidate is active. */
function buildCandidateLayer(bar: HTMLElement): void {
	const cand = getStaminaCandidate();
	if (!cand) return;
	bar.setAttribute('data-cand', cand);

	const root = bar.createDiv({ cls: 'dse-stamina__cand' });

	// -- Head: crest, small-caps label, state chip, numerals -------------------
	const head = root.createDiv({ cls: 'dse-stamina__chead' });
	const crestEl = head.createSpan({ cls: 'dse-crest dse-stamina__crest' });
	crestEl.setAttribute('aria-hidden', 'true');
	crestEl.createSpan({ cls: 'dse-crest__glyph dse-stamina__crest-glyph' });
	const idEl = head.createDiv({ cls: 'dse-stamina__cid' });
	idEl.createSpan({ cls: 'dse-stamina__clabel', text: 'Stamina' });
	idEl.createSpan({ cls: 'dse-stamina__cstate' });
	const nums = head.createDiv({ cls: 'dse-stamina__cnums' });
	nums.createSpan({ cls: 'dse-stamina__ccur' });
	nums.createSpan({ cls: 'dse-stamina__cslash', text: '/' });
	nums.createSpan({ cls: 'dse-stamina__cmax' });
	nums.createSpan({ cls: 'dse-stamina__ctemp' });

	// -- Continuous gauge (A / C / D): a machined channel plus its index marks.
	// The channel clips its own fills; the marks live OUTSIDE it so a ◆ can seat
	// on the rail without being cut off.
	const gauge = root.createDiv({ cls: 'dse-stamina__gauge' });
	const channel = gauge.createDiv({ cls: 'dse-stamina__gchannel' });
	channel.createDiv({ cls: 'dse-stamina__gdying' });
	channel.createDiv({ cls: 'dse-stamina__gwound' });
	channel.createDiv({ cls: 'dse-stamina__gpour' });
	channel.createDiv({ cls: 'dse-stamina__gshield' });
	channel.createDiv({ cls: 'dse-stamina__gwinded' });
	gauge.createDiv({ cls: 'dse-stamina__gidx dse-stamina__gidx--zero' });
	gauge.createDiv({ cls: 'dse-stamina__gidx dse-stamina__gidx--winded' });
	// Where base max sits once temp has widened the scale (SC-133) — hidden at temp 0,
	// where it would just restate the channel's own right edge.
	gauge.createDiv({ cls: 'dse-stamina__gidx dse-stamina__gidx--max' });

	// -- Discrete segments (B): rebuilt per update, since the cell count depends
	// on max/temp. Empty at build time.
	root.createDiv({ cls: 'dse-stamina__segs' });
}

/** Targeted refresh of the candidate layer. No-op unless a candidate is active. */
function updateCandidateLayer(bar: HTMLElement, s: StaminaBarValues): void {
	const root = bar.querySelector<HTMLElement>(':scope > .dse-stamina__cand');
	if (!root) return;

	const current = s.current ?? 0;
	const temp = s.temp ?? 0;
	const max = s.max ?? 0;
	const state = staminaState(s);

	// -- The candidate gauge's coordinate model (a DELIBERATE correction of the
	// Legacy bar's, and one of the things being put up for the pick) ---------------
	//
	// Legacy paints ONE fill spanning the whole [-max/2 … +max] space, so at 24/30 the
	// green already covers the dying zone and at -4/30 a red bar still reads "24% full".
	// The number and the bar disagree, and the zone the rules care about is invisible
	// until you are in it.
	//
	// Here the ZERO BULKHEAD is the origin: positive stamina pours rightward from it,
	// and the dying zone fills LEFTWARD from it only once the hero is actually in it.
	// Green therefore means "stamina you have" and red means "how deep into dying you
	// are" — the two never occupy the same pixels, and an empty right-hand channel at
	// 0 stamina is the honest picture.
	//
	// TEMP STAMINA IS FIRST-CLASS HERE (SC-133). The Legacy overlay paints temp from
	// `left: 0` on a DIFFERENT origin than the fill, so it renders as a nub inside the
	// Dying hatch, goes co-extensive with the fill at negative stamina, and overflows
	// the track once temp > max. None of that is inherited: temp is a cap that starts
	// exactly where the pour ends and shares its origin and scale, and the positive
	// region is scaled to `max + temp` rather than `max` whenever temp is present. That
	// last part is what makes the whole range honest —
	//   * current == max with temp > 0 still has somewhere to draw the cap
	//     (a fixed max-scale would have zero room left and the shield would vanish);
	//   * temp > max cannot overflow or be silently clipped by the channel;
	//   * the base ceiling stays legible because it gets its OWN index mark
	//     (`--dse-max-x`), so a rescaled gauge never hides where max actually is.
	const zone = overlayWidthPercent(s); // width of the dying zone = the bulkhead's x
	const live = 100 - zone; // the positive region
	const halfMax = Math.floor(max / 2);
	const pct = (n: number, of: number, span: number): number => (of <= 0 ? 0 : (n / of) * span);
	// The positive region's denominator: max, widened by temp so the cap always fits.
	const denom = max + Math.max(temp, 0);

	root.setAttribute('data-state', state);
	root.setAttribute('data-temp', temp > 0 ? 'on' : 'off');

	// Geometry (SC-5 sanctioned --dse-* setProperty only).
	const pourW = pct(Math.min(Math.max(current, 0), max), denom, live);
	root.style.setProperty('--dse-zone', `${zone}%`);
	root.style.setProperty('--dse-pour-w', `${pourW}%`);
	root.style.setProperty(
		'--dse-wound-w',
		`${current < 0 ? Math.min(pct(-current, halfMax, zone), zone) : 0}%`,
	);
	root.style.setProperty('--dse-winded-x', `${zone + pct(halfMax, denom, live)}%`);
	root.style.setProperty('--dse-max-x', `${zone + pct(max, denom, live)}%`);
	root.style.setProperty('--dse-cap-x', `${zone + pourW}%`);
	root.style.setProperty('--dse-cap-w', `${temp > 0 ? pct(temp, denom, live) : 0}%`);
	// Kept for the Legacy-shaped consumers of the same node set (and so a candidate can
	// still reach the old whole-space fraction if a direction wants it).
	root.style.setProperty('--dse-fill', `${calculatePercentFromStamina(max, current)}%`);

	const q = <T extends HTMLElement>(sel: string): T | null => root.querySelector<T>(sel);

	const glyph = q('.dse-stamina__crest-glyph');
	if (glyph && glyph.getAttribute('data-icon') !== STATE_ICON[state]) {
		glyph.setAttribute('data-icon', STATE_ICON[state]);
		glyph.empty();
		setIcon(glyph, STATE_ICON[state]);
	}
	q('.dse-stamina__cstate')?.setText(STATE_LABEL[state]);
	q('.dse-stamina__ccur')?.setText(String(current));
	q('.dse-stamina__cmax')?.setText(String(max));
	q('.dse-stamina__ctemp')?.setText(temp > 0 ? `+${temp}` : '');

	renderSegments(root, current, temp, max, state);
}

/**
 * Candidate B's cell row, rebuilt in place (the cell COUNT is a function of max and
 * temp, so a targeted per-cell update would still have to add/remove nodes; a row of
 * ~20 divs is cheap and this is candidate-stage code).
 *
 * Left of the zero bulkhead sit the DYING cells — the negative stamina a hero can
 * actually spend before death — drawn as empty sockets while alive and lighting up
 * danger as they are consumed. Right of it, body cells; past max, temp cells.
 */
function renderSegments(
	root: HTMLElement,
	current: number,
	temp: number,
	max: number,
	state: string,
): void {
	const segs = root.querySelector<HTMLElement>(':scope > .dse-stamina__segs');
	if (!segs) return;
	segs.empty();
	if (max <= 0) return;

	const step = segmentStep(max);
	const dyingCells = Math.max(1, Math.ceil(Math.floor(max / 2) / step));
	const bodyCells = Math.ceil(max / step);
	const tempCells = temp > 0 ? Math.ceil(temp / step) : 0;
	// Boundary index (within the body run) where "at half max or below" begins.
	const windedAt = Math.max(1, Math.round(Math.floor(max / 2) / step));

	const cell = (kind: string, on: boolean): HTMLElement => {
		const el = segs.createDiv({ cls: 'dse-stamina__seg' });
		el.setAttribute('data-kind', kind);
		el.setAttribute('data-on', on ? '1' : '0');
		return el;
	};

	// Dying run, drawn left-to-right = furthest-from-zero first. Cell j spans
	// [-(D-j)*step, -(D-j-1)*step), so it is consumed once current drops to its top.
	for (let j = 0; j < dyingCells; j++) {
		cell('dying', current <= -(dyingCells - j - 1) * step);
	}
	segs.createDiv({ cls: 'dse-stamina__segdiv dse-stamina__segdiv--zero' });

	for (let i = 0; i < bodyCells; i++) {
		if (i === windedAt) segs.createDiv({ cls: 'dse-stamina__segdiv dse-stamina__segdiv--winded' });
		const el = cell('body', current > i * step);
		if (i < windedAt) el.setAttribute('data-band', 'low');
	}

	for (let t = 0; t < tempCells; t++) cell('temp', true);

	segs.setAttribute('data-state', state);
}
