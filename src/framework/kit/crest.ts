// Plan 08 Task 4 (D2 §2.9) — kit/crest: the Steel-only heraldic shield holding a
// category glyph on ability cards / statblock headers (mirrors the site's .sc-crest).
//
// STEEL-ONLY: the Legacy base sheet renders `.dse-crest { display: none }`, so
// today's look is unchanged wherever elements adopt cardHead+crest before D3 lands.
// The show-override ships WITH D3's [data-dse-theme="steel"] skin layer (the shield
// consumes --dse-metal-grad / --dse-metal-line / --dse-bevel / --dse-crest-shape,
// which are all `none` in Legacy).
//
// Purely decorative ornament: aria-hidden, no listeners (no owner needed), and it
// degrades to NOTHING when no icon is given (§2.9).
import { setIcon } from 'obsidian';

export type CrestSize = 'md' | 'lg';

export interface CrestOptions {
	/** Lucide icon name for the glyph. Absent → the crest renders nothing. */
	icon?: string;
	/** 'lg' adds .dse-crest--lg (the tall card-header shield). Default 'md'. */
	size?: CrestSize;
}

export interface CrestHandle {
	readonly rootEl: HTMLElement;
}

/**
 * Mounts the heraldic shield <span> into `parent` — or nothing at all (returns
 * null) when `icon` is absent.
 */
export function crest(parent: HTMLElement, opts: CrestOptions): CrestHandle | null {
	if (!opts.icon) return null;
	const rootEl = parent.createSpan({ cls: 'dse-crest' });
	if (opts.size === 'lg') rootEl.addClass('dse-crest--lg');
	// Ornament only — the card's semantics never depend on it (§4.7: color/ornament
	// is never the sole signal), so hide it from AT outright.
	rootEl.setAttribute('aria-hidden', 'true');
	const glyphEl = rootEl.createSpan({ cls: 'dse-crest__glyph' });
	setIcon(glyphEl, opts.icon);
	return { rootEl };
}
