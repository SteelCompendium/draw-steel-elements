// D7 Task 1 (spec §2.1/§2.3), rebuilt for SC-152 round 3 (Scott, 2026-08-22: "The
// characteristics here should probably be the same css and code that is used in the
// statblocks… they are exactly the same data.") — the ONE characteristics-row builder.
//
// History: this file used to export `renderCharacteristicsGrid`, a five-cell
// `.dse-statgrid` lifted from the standalone element's original onMount, while the
// statblock built its own `.dse-sb__chars` row in statblock/view.ts — two renderers
// for the same five numbers. The statblock's renderer is the richer one (the SC-123
// merged/split shapes driven by the `sbCharLine`/`sbCharBox` preferences, the
// site-faithful `.dse-sb__char-box/-v/-l` split, `formatCharacteristic`'s signed
// values), so IT moved here verbatim and everyone renders through it: the statblock
// (behavior-identical — same classes, same DOM order, same text nodes), the
// standalone `ds-char` element, and the hero sheet's Characteristics region.
//
// SC-5 (D2 §5): the ONLY .style access is setProperty("--dse-value-scale"/
// "--dse-label-scale", …) — zero inline font-size, zero inline color. The two scale
// vars are set only when the caller provides them (ds-char's `value_height`/
// `name_height` YAML fields); consumption is CSS scoped to the characteristics
// element so the statblock's own row can never pick them up.
export interface CharacteristicsValues {
	might?: number;
	agility?: number;
	reason?: number;
	intuition?: number;
	presence?: number;
}

export interface CharacteristicsRowOptions {
	/** Site-faithful split DOM (`.dse-sb__char-box/-v/-l`) vs the merged one-text-node
	 *  cell ("Might +2"). Callers resolve this from the SAME preference pair the
	 *  statblock uses (`charsAreSplit`, below) so the three surfaces can never
	 *  disagree on shape. */
	split: boolean;
	/** ds-char's YAML `value_height` -> --dse-value-scale (unset when omitted —
	 *  never the string "undefined"). */
	valueHeight?: number;
	/** ds-char's YAML `name_height` -> --dse-label-scale. */
	nameHeight?: number;
	/** Reserved for a future interactive panel (unused by every current caller — no
	 *  DOM/behavior change when omitted). */
	onScoreClick?: (characteristic: { name: string; value?: number }) => void;
}

/** The legacy StatsView.formatCharacteristic, VERBATIM (word/number parity) —
 *  moved here from statblock/view.ts so the signed "+2"/"-1"/"N/A" presentation is
 *  part of the shared renderer, not a statblock privilege. */
export function formatCharacteristic(value?: number): string {
	if (value === undefined || isNaN(value)) {
		return 'N/A';
	}
	return value >= 0 ? `+${value}` : `${value}`;
}

/**
 * Renders the five-cell `.dse-sb__chars` characteristics row into `root` — the
 * statblock's renderChars, lifted verbatim (statblock/view.ts, SC-123). Returns the
 * created `.dse-sb__chars` element.
 *
 * TWO SHAPES, chosen by `opts.split` (the statblock's SC-123 contract): merged keeps
 * ONE text node per cell, byte-for-byte what the statblock has always emitted at
 * `sbCharLine: 'one'` + `sbCharBox: 'off'`; split emits the site's three-part
 * `.dse-sb__char-box` / `-v` / `-l` (site DOM order: box, value, label — the boxed
 * letter is the label's initial, verbatim), which the CSS lays out per the
 * reflected `data-dse-sb-charline`/`data-dse-sb-charbox` attributes.
 */
export function renderCharacteristicsRow(
	root: HTMLElement,
	chars: CharacteristicsValues,
	opts: CharacteristicsRowOptions,
): HTMLElement {
	const row = root.createDiv({ cls: 'dse-sb__chars' });
	if (opts.valueHeight !== undefined) {
		row.style.setProperty('--dse-value-scale', String(opts.valueHeight));
	}
	if (opts.nameHeight !== undefined) {
		row.style.setProperty('--dse-label-scale', String(opts.nameHeight));
	}

	const characteristics = [
		{ name: 'Might', value: chars.might },
		{ name: 'Agility', value: chars.agility },
		{ name: 'Reason', value: chars.reason },
		{ name: 'Intuition', value: chars.intuition },
		{ name: 'Presence', value: chars.presence },
	];

	for (const char of characteristics) {
		const cellEl = row.createDiv({ cls: 'dse-sb__char' });
		if (opts.onScoreClick) {
			cellEl.addEventListener('click', () => opts.onScoreClick?.(char));
		}
		const value = formatCharacteristic(char.value);
		if (!opts.split) {
			// LEGACY-FREEZE: one text node, exactly as the statblock always emitted
			// (see statblock/view.ts's SC-10 Task 4 history — splitting the node moves
			// sub-pixel glyph shaping).
			cellEl.setText(`${char.name} ${value}`);
			continue;
		}
		cellEl.createSpan({ cls: 'dse-sb__char-box', text: char.name.charAt(0).toUpperCase() });
		cellEl.createSpan({ cls: 'dse-sb__char-v', text: value });
		cellEl.createSpan({ cls: 'dse-sb__char-l', text: char.name });
	}

	return row;
}

/** The single place that decides between the merged text node and the split DOM —
 *  true when either characteristics preference has moved off the merged pair. Every
 *  surface that renders the row derives `opts.split` from THIS so the statblock,
 *  ds-char and the hero sheet can never disagree. (Both prefs are global-only —
 *  `perBlock: false` — see prefs/catalog.ts.) */
export function charsAreSplit(prefs: { get(key: 'sbCharLine' | 'sbCharBox'): unknown }): boolean {
	return prefs.get('sbCharLine') !== 'one' || prefs.get('sbCharBox') !== 'off';
}
