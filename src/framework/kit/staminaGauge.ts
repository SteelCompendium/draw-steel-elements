// SC-132 — the stamina GAUGE: the Steel cluster's instrument, and the one place the
// gauge's coordinate model is written down.
//
// WHY A SEPARATE MODULE. Three surfaces draw this instrument — the element/hero cluster
// (StaminaBarPanel), the stamina edit modal's preview and the minion pool modal's
// preview — and SC-133 exists because those surfaces used to compute their geometry
// independently and disagreed about where temp stamina lives. One builder + one
// geometry function means a temp-only edit is visible in the modal for the same reason
// it is visible on the sheet, not by coincidence.
//
// THE COORDINATE MODEL (a deliberate correction of the Legacy bar's):
//
//   Legacy paints ONE fill spanning the whole [-max/2 … +max] space, so at 24/30 the
//   green already covers the dying zone and at -4/30 a red bar still reads "24% full".
//   The number and the bar disagree, and the zone the rules care about is invisible
//   until you are in it.
//
//   Here the ZERO BULKHEAD is the origin: positive stamina pours rightward from it, and
//   the dying zone fills LEFTWARD from it only once the hero is actually in it. Green
//   means "stamina you have", red means "how deep into dying you are", and the two never
//   occupy the same pixels — an empty right-hand channel at 0 stamina is the honest
//   picture.
//
//   TEMP STAMINA IS FIRST-CLASS. Legacy paints temp from `left: 0` on a DIFFERENT origin
//   than the fill, so it renders as a nub inside the Dying hatch, goes co-extensive with
//   the fill at negative stamina, and overflows the track once temp > max. None of that
//   is inherited: temp is a cap that starts exactly where the pour ends and shares its
//   origin and scale, and the positive region is scaled to `max + temp` whenever temp is
//   present. That last part is what makes the whole range honest —
//     * current == max with temp > 0 still has somewhere to draw the cap (a fixed
//       max-scale would have zero room left and the plate would vanish);
//     * temp > max cannot overflow or be silently clipped by the channel;
//     * the base ceiling stays legible because it gets its OWN index mark (`--dse-max-x`),
//       so a rescaled gauge never hides where max actually is.
//
//   THE RESERVE IS A FIXED-WIDTH REGION, NOT PART OF THAT RESCALING — stated explicitly
//   because it means the gauge carries TWO rulers whenever temp is present, and that is a
//   deliberate choice rather than an oversight. The dying reserve always occupies
//   `halfMax / (max + halfMax)` of the channel (a third, for any max), while the positive
//   region to its right divides the remainder by `max + temp`. So at temp > 0 the two
//   sides draw a different number of pixels per point of Stamina.
//
//   The alternative — one ruler, `max + halfMax + temp` across the whole channel — was
//   rejected for a specific reason: it would MOVE THE ZERO BULKHEAD every time temp
//   changed. The bulkhead is this model's origin; an origin that slides when you gain 4
//   temporary Stamina is a worse lie than two rulers, because the reader's anchor for
//   "how close am I to going down" would drift under them. Fixed reserve + fixed origin +
//   an elastic positive region keeps the one landmark that matters nailed down, and the
//   base-max mark reports the rescaling explicitly. `staminaGauge.test.ts` pins this
//   choice so it cannot be "fixed" by accident.
//
// SC-5 (D2 §5): every number below leaves this module as a `--dse-*` custom property.
// There is no inline colour and no inline width anywhere in the stamina family.

/** The three numbers a stamina gauge renders. */
export interface StaminaGaugeValues {
	current: number;
	temp: number;
	max: number;
}

export type StaminaState = 'healthy' | 'winded' | 'dying';

export interface StaminaGaugeOptions {
	/**
	 * Render the hero dying reserve left of the zero bulkhead (`max/2` wide). False for
	 * surfaces with no negative range — creature stamina and the minion squad pool —
	 * where the bulkhead collapses onto the channel's left edge and the pour simply
	 * starts there.
	 */
	dyingZone?: boolean;
	/** Extra graduations at these FRACTIONS OF THE WHOLE CHANNEL (minion death ticks).
	 *  Not of the positive region: the CSS places them with a bare
	 *  `left: var(--dse-tick-x)`, so a caller that also has a dying reserve would find
	 *  them offset by it. Today's only caller (the minion pool) passes
	 *  `dyingZone: false`, where the two are the same thing. */
	ticks?: readonly number[];
}

/** Every geometry number the gauge's CSS consumes, as percentages of the channel. */
export interface StaminaGaugeGeometry {
	/** Width of the engraved dying reserve = the x of the zero bulkhead. */
	zone: number;
	/** Width of the pour, from the bulkhead rightwards. */
	pourW: number;
	/** How far past zero the hero is, growing LEFTWARD from the bulkhead. */
	woundW: number;
	/** x of the winded (half-max) graduation. */
	windedX: number;
	/** x of the base-max graduation (only drawn while temp widens the scale). */
	maxX: number;
	/** x where the temp plate starts (= the pour's end). */
	capX: number;
	/** Width of the temp plate. */
	capW: number;
}

/** RR §8 "Stamina and Death": winded is at half Stamina max OR BELOW (inclusive), dying
 *  at 0 or below (and implies winded — dying takes display priority). */
export function staminaState(s: StaminaGaugeValues): StaminaState {
	const current = s.current ?? 0;
	const max = s.max ?? 0;
	// FOLLOWUPS #28's full-degrade case: every ref failed and no authored max_stamina, so
	// `max` is 0. Without this line `current <= 0` is trivially true and the cluster puts
	// on the whole dying dress — red frame, red ground, skull, the word — for a block that
	// is UNCONFIGURED, not dead. A hero with no maximum is not dying; state is undefined
	// there, and 'healthy' is the quiet answer (the numerals still read 0 / 0, which is
	// the honest thing to show).
	if (!(max > 0)) return 'healthy';
	if (current <= 0) return 'dying';
	if (current <= Math.floor(max / 2)) return 'winded';
	return 'healthy';
}

/**
 * The gauge's geometry for one set of values. Pure — no DOM, so the modal can compute a
 * PENDING state's geometry without touching the committed model.
 */
export function staminaGaugeGeometry(
	s: StaminaGaugeValues,
	opts: StaminaGaugeOptions = {},
): StaminaGaugeGeometry {
	// EVERY number is sanitised on the way in, not guarded on the way out. These values
	// arrive from parsed YAML and from derived hero stats, so a non-finite one is a real
	// possibility (a malformed `max_stamina:`, a reference that failed to resolve), and a
	// single NaN anywhere propagates through the arithmetic into `NaN%` — which CSS drops
	// SILENTLY, so the bar just stops moving and nothing reports a fault. Guarding only
	// the divisions is not enough: a NaN NUMERATOR sails straight past a `denom > 0` check.
	const num = (v: number | undefined): number => (Number.isFinite(v) ? (v as number) : 0);
	const current = num(s.current);
	const temp = Math.max(num(s.temp), 0);
	const max = num(s.max);
	const halfMax = Math.floor(max / 2);

	// The dying reserve is half the hero's max, expressed against the whole coordinate
	// space [-max/2 … +max]. With no dying zone the bulkhead sits at 0 and the positive
	// region is the entire channel.
	const total = max + halfMax;
	// `!(x > 0)`, never `x <= 0`: NaN <= 0 is FALSE, so the `<=` form lets a NaN through
	// and every percentage downstream becomes `NaN%` — a value CSS silently drops, which
	// is the worst kind of bug because the bar just stops moving. This is the same trap
	// StaminaEditModal documents by name in its Spend Recovery guard.
	const zone = opts.dyingZone === false || !(total > 0) ? 0 : (halfMax / total) * 100;
	const live = 100 - zone;

	// The positive region's denominator: max, widened by temp so the cap always fits.
	const denom = max + temp;
	const pct = (n: number, span: number): number => (!(denom > 0) ? 0 : (n / denom) * span);

	const pourW = pct(Math.min(Math.max(current, 0), max), live);
	return {
		zone,
		pourW,
		woundW:
			current < 0 && halfMax > 0 ? Math.min((-current / halfMax) * zone, zone) : 0,
		windedX: zone + pct(halfMax, live),
		maxX: zone + pct(max, live),
		capX: zone + pourW,
		capW: temp > 0 ? pct(temp, live) : 0,
	};
}

/** Class on the gauge root, so callers can find it without knowing the internals. */
export const GAUGE_CLS = 'dse-stamina__gauge';

/**
 * Builds the gauge into `parent` and returns its root.
 *
 * The CHANNEL clips its own fills; the index marks live OUTSIDE it, as siblings, because
 * a mark is a graduation ON the track and has to size itself against the track's
 * interior rather than be clipped by it (SC-132 round 2: the first cut floated a brand ◆
 * centred on the channel's top edge and read as a diamond that had missed its mark).
 */
export function renderStaminaGauge(
	parent: HTMLElement,
	opts: StaminaGaugeOptions = {},
): HTMLElement {
	const gauge = parent.createDiv({ cls: GAUGE_CLS });
	const channel = gauge.createDiv({ cls: 'dse-stamina__gchannel' });
	channel.createDiv({ cls: 'dse-stamina__gdying' });
	channel.createDiv({ cls: 'dse-stamina__gwound' });
	channel.createDiv({ cls: 'dse-stamina__gpour' });
	// The pending-edit band (modal previews only; zero-width and inert everywhere else).
	channel.createDiv({ cls: 'dse-stamina__gdelta' });
	channel.createDiv({ cls: 'dse-stamina__gshield' });
	gauge.createDiv({ cls: 'dse-stamina__gidx dse-stamina__gidx--zero' });
	gauge.createDiv({ cls: 'dse-stamina__gidx dse-stamina__gidx--winded' });
	// Where base max sits once temp has widened the scale — hidden at temp 0, where it
	// would just restate the channel's own right edge.
	gauge.createDiv({ cls: 'dse-stamina__gidx dse-stamina__gidx--max' });
	if (opts.dyingZone === false) gauge.setAttribute('data-zone', 'off');
	for (const frac of opts.ticks ?? []) {
		const tick = gauge.createDiv({ cls: 'dse-stamina__gidx dse-stamina__gidx--tick' });
		tick.style.setProperty('--dse-tick-x', `${frac * 100}%`);
	}
	return gauge;
}

/**
 * Targeted refresh of a gauge built by `renderStaminaGauge` — SC-5 sanctioned
 * `setProperty('--dse-*', …)` only, no rebuild, no inline colour.
 *
 * `state` is stamped on the gauge as well as (by the caller) on the cluster, so a gauge
 * mounted on its own — the modal previews — still colours its pour.
 */
export function updateStaminaGauge(
	gauge: HTMLElement,
	s: StaminaGaugeValues,
	opts: StaminaGaugeOptions = {},
): StaminaGaugeGeometry {
	const g = staminaGaugeGeometry(s, opts);
	const temp = Math.max(s.temp ?? 0, 0);
	gauge.setAttribute('data-state', staminaState(s));
	gauge.setAttribute('data-temp', temp > 0 ? 'on' : 'off');
	gauge.style.setProperty('--dse-zone', `${g.zone}%`);
	gauge.style.setProperty('--dse-pour-w', `${g.pourW}%`);
	gauge.style.setProperty('--dse-wound-w', `${g.woundW}%`);
	gauge.style.setProperty('--dse-winded-x', `${g.windedX}%`);
	gauge.style.setProperty('--dse-max-x', `${g.maxX}%`);
	gauge.style.setProperty('--dse-cap-x', `${g.capX}%`);
	gauge.style.setProperty('--dse-cap-w', `${g.capW}%`);
	return g;
}

/**
 * The modal previews' pending-edit band: a ghost of the damage about to be taken or the
 * healing about to be applied, drawn in the gauge's own coordinate space.
 *
 * `kind: 'none'` collapses it to zero width rather than hiding it, so the element keeps
 * its box and the transition (when the theme animates) has something to run on.
 */
export function setStaminaGaugeDelta(
	gauge: HTMLElement,
	fromX: number,
	width: number,
	kind: 'heal' | 'damage' | 'none',
): void {
	const delta = gauge.querySelector<HTMLElement>('.dse-stamina__gdelta');
	if (!delta) return;
	delta.setAttribute('data-kind', kind);
	delta.style.setProperty('--dse-delta-x', `${kind === 'none' ? 0 : fromX}%`);
	delta.style.setProperty('--dse-delta-fill', `${kind === 'none' ? 0 : width}%`);
}
