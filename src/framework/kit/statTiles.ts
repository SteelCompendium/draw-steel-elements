// src/framework/kit/statTiles.ts — Plan 24 / SC-100 Task 3: the kit stat-tile primitive.
// A value-over-label tile ROW (mirrors the site's .sc-card__stats/.sc-card__stat grid,
// steel-redesign.css:192-207 — the kit page's Kit Bonuses grid and the Kit Browse-index
// tile share this same grammar there). Ported as its OWN class grammar (`.dse-tiles*`),
// NOT a reuse of CharacteristicsGrid's `.dse-statgrid` DOM — that grammar's legacy shots
// (characteristics/hero/values-row) are frozen elsewhere and have no equivalent to this
// primitive's FIXED-SLOT DASH semantics: an absent bonus still renders its slot (an em
// dash), never an omitted cell, because the fixed 2x4 grid reading uniformly is itself
// real information the plugin's old row-list omitted (SC-100 ruling 2). New CSS only ever
// targets these new `.dse-tiles*` nodes (styles-source.css), so LEGACY-FREEZE can't be
// threatened by construction — the classes never appear in ANY legacy DOM, because no
// legacy code path creates them.
//
// The boxed VALUE-over-LABEL cell shape itself borrows the recipe already established for
// the feature card's Distance/Target rail (`.dse-feature__meta-cell--distance/target`,
// styles-source.css) — CSS shapes only, per the plan's Design §7 ("do NOT touch
// CharacteristicsGrid.ts or .dse-statgrid; borrow its CSS shapes by reference only" —
// generalized here to "borrow, don't touch, any frozen sibling grammar").
//
// F1 OD-8: this file must never import from src/elements/ (kit-index.test.ts enforces it
// for every module in this directory) — the value/label/accent shape below is intentionally
// generic (not kit-the-card-type specific), so a future §D2 adopter (class/career stat
// boxes) can reuse it without this file ever needing to know about kit's own semantics
// (the "per Echelon"-qualifier stripping / kind derivation stay in layouts.ts, the
// card-type-specific caller).
export interface StatTile {
	/** The tile's big value. Absent/blank renders the fixed slot's dash (site parity —
	 *  kitBonus()'s "every absent bonus reads '—', never an omitted cell"). */
	value?: string;
	/** The small-caps label under the value. */
	label: string;
	/** Accent hook — 'dmg' brightens the value the way the site's `.is-dmg` does for the
	 *  Melee/Ranged Dmg cells. An open string (not a fixed union), like `Badge['tone']`,
	 *  so a future accent needs no change here — only a new CSS rule on its class. */
	accent?: string;
}

/** Em dash — matches the site's `kitBonus()` fallback for an absent bonus slot. */
const DASH = '—';

/**
 * Mounts ONE row of fixed-slot value/label tiles into `parent`. Call it once per row (kit's
 * Design section calls it twice — Stamina/Speed/Stability/Disengage, then the four Dmg/Dist
 * cells) for a stacked two-row grid; consecutive `.dse-tiles` siblings get their own
 * tucked-margin CSS rule (mirrors the site's `.sc-card__stats + .sc-card__stats`).
 */
export function statTiles(parent: HTMLElement, tiles: StatTile[]): HTMLElement {
	const row = parent.createDiv({ cls: 'dse-tiles' });
	for (const tile of tiles) {
		const cell = row.createDiv({
			cls: tile.accent ? `dse-tiles__cell dse-tiles__cell--${tile.accent}` : 'dse-tiles__cell',
		});
		const value = tile.value?.trim();
		cell.createDiv({ cls: 'dse-tiles__value', text: value ? value : DASH });
		cell.createDiv({ cls: 'dse-tiles__label', text: tile.label });
	}
	return row;
}
