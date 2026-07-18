// D7 Task 1 (spec §2.1/§2.3) — CharacteristicsGrid: the `.dse-statgrid` builder lifted
// verbatim from characteristics/view.ts's onMount (D2 §3.3), so the standalone
// CharacteristicsElementView and a future hero-sheet panel both build the identical
// grid off the same code.
//
// SC-5 (D2 §5): the ONLY .style access is setProperty("--dse-value-scale"/
// "--dse-label-scale", …) — zero inline font-size, zero inline color.
export interface CharacteristicsValues {
	might: number;
	agility: number;
	reason: number;
	intuition: number;
	presence: number;
}

export interface CharacteristicsGridOptions {
	/** YAML/model `value_height` -> --dse-value-scale (defaults to 1 if omitted here;
	 *  callers own their own default resolution, matching the pre-extraction code). */
	valueHeight?: number;
	/** YAML/model `name_height` -> --dse-label-scale. */
	nameHeight?: number;
	/** Reserved for a future interactive panel (unused by the standalone element — no
	 *  DOM/behavior change when omitted). */
	onScoreClick?: (characteristic: { name: string; value: number }) => void;
}

/**
 * Renders the five-cell `.dse-statgrid` into `root` (lifted verbatim from
 * CharacteristicsElementView.onMount, characteristics/view.ts:20-39). Returns the
 * created `.dse-statgrid` element.
 */
export function renderCharacteristicsGrid(
	root: HTMLElement,
	chars: CharacteristicsValues,
	opts?: CharacteristicsGridOptions,
): HTMLElement {
	const grid = root.createDiv({ cls: 'dse-statgrid' });
	grid.style.setProperty('--dse-value-scale', String(opts?.valueHeight));
	grid.style.setProperty('--dse-label-scale', String(opts?.nameHeight));

	const characteristics = [
		{ name: 'Might', value: chars.might },
		{ name: 'Agility', value: chars.agility },
		{ name: 'Reason', value: chars.reason },
		{ name: 'Intuition', value: chars.intuition },
		{ name: 'Presence', value: chars.presence },
	];

	for (const char of characteristics) {
		const cell = grid.createDiv({ cls: 'dse-statgrid__cell' });
		if (opts?.onScoreClick) {
			cell.addEventListener('click', () => opts.onScoreClick?.(char));
		}
		cell.createDiv({ cls: 'dse-statgrid__value', text: String(char.value) });
		cell.createDiv({ cls: 'dse-statgrid__label', text: char.name });
	}

	return grid;
}
