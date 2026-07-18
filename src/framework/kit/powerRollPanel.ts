// Plan 08 Task 4 (D2 §2.8) — kit/powerRollPanel + tierBadge: the shared roll
// grammar. The .tier-key-container clip-path badges + tier lines currently built
// inline by FeatureView (EffectView.tierNKey) and duplicated by Negotiation become
// one kit unit: a titled "Power Roll + {chars}" panel with the four tier rows
// (≤11 / 12-16 / 17+ / crit), each row = a badge + the outcome text. The badge
// SHAPES are the existing clip-path polygons, copied verbatim into the
// .dse-pr__badge--* CSS (no font); only the fill moves onto --dse-tier-* tokens.
//
// Markdown in a row renders via the caller-supplied `renderMd` callback — the
// element provides one parented to its own view (F1's renderMarkdown pattern), so
// the kit never imports Obsidian's markdown renderer or app surface (kit⊥elements).
// Without the callback the text is set plainly.
//
// A11y (§2.8/§4): static by default. In `selectable` mode (Negotiation) every row
// is a REAL <button role="radio" aria-checked> inside a role="radiogroup" — a TRUE
// radiogroup (a roll resolves to exactly ONE tier; a radiogroup's owned elements
// must be radios with aria-checked, not aria-pressed toggles — Plan 09 Task 0) —
// with the tabs-style roving-tabindex arrow-key pattern (selection follows focus,
// wrapping). Color is never the sole signal: each row always shows its range text
// (§4.7). F1 §4.5: all listeners are owner-bound.
import type { Component } from 'obsidian';

export type PowerRollTier = 'low' | 'mid' | 'high' | 'crit';

export interface PowerRollRow {
	tier: PowerRollTier;
	/** Outcome markdown (rendered via opts.renderMd, else set as plain text). */
	md: string;
}

/**
 * Caller-supplied markdown renderer (md, targetEl). Elements pass their
 * view-parented renderMarkdown; the kit fires and forgets the promise.
 */
export type RenderMdCallback = (md: string, el: HTMLElement) => void | Promise<void>;

export interface PowerRollPanelOptions {
	/** The roll's characteristics, e.g. "Might or Agility" → "Power Roll + …". */
	chars?: string;
	/**
	 * Head override (Plan 09 Task 6a). A string renders VERBATIM as the head text —
	 * through `renderMd` when provided, like the rows (caller data may be markdown);
	 * `false` mounts NO head element at all (headless tiers — the default caption
	 * would invent words the data doesn't have); `undefined` keeps today's default
	 * 'Power Roll + {chars}' caption (kit chrome, always plain text).
	 */
	head?: string | false;
	/** The tier rows to render, in order (a full roll has all four). */
	rows: readonly PowerRollRow[];
	/** Rows become <button role="radio" aria-checked> radios (Negotiation). Default static. */
	selectable?: boolean;
	/** Initially selected tier (selectable mode only). */
	selected?: PowerRollTier;
	/** Fired on USER selection changes only — never by select(). */
	onSelect?: (tier: PowerRollTier) => void;
	renderMd?: RenderMdCallback;
}

export interface PowerRollPanelHandle {
	readonly rootEl: HTMLElement;
	/** The head element, for callers that decorate it. Absent when `head: false`. */
	readonly headEl?: HTMLElement;
	/** Row elements by tier, for callers that decorate rows. */
	readonly rowEls: Readonly<Partial<Record<PowerRollTier, HTMLElement>>>;
	/** External update, in place (selectable mode). No onSelect, no focus steal. */
	select(tier: PowerRollTier): void;
	getSelected(): PowerRollTier | undefined;
	/**
	 * D5 (Plan 14): roll-result highlight — data-dse-roll-result="active|dimmed"
	 * on every row (null clears). A SEPARATE channel from selectable-mode
	 * selection: never touches aria-checked/tabindex, works on static panels.
	 */
	setRollResult(active: readonly PowerRollTier[] | null): void;
}

/** Tier → badge modifier + range text (the .tN-key-body-text originals, verbatim). */
const TIER_BADGES: Record<PowerRollTier, { mod: string; range: string }> = {
	low: { mod: 't1', range: '≤11' },
	mid: { mod: 't2', range: '12-16' },
	high: { mod: 't3', range: '17+' },
	crit: { mod: 'crit', range: 'crit' },
};

/**
 * Mounts a standalone tier badge into `parent`: the clip-path key box + the range
 * text (color is never the sole tier signal, §4.7). Returns the badge element.
 */
export function tierBadge(parent: HTMLElement, tier: PowerRollTier): HTMLElement {
	const { mod, range } = TIER_BADGES[tier];
	const badgeEl = parent.createSpan({ cls: `dse-pr__badge dse-pr__badge--${mod}` });
	badgeEl.createSpan({ cls: 'dse-pr__badge-text', text: range });
	return badgeEl;
}

let prCounter = 0;

/** Mounts the "Power Roll + {chars}" panel into `parent` (D2 §2.8). */
export function powerRollPanel(
	parent: HTMLElement,
	opts: PowerRollPanelOptions,
	owner: Component,
): PowerRollPanelHandle {
	const uid = `dse-pr-${++prCounter}`;
	const rootEl = parent.createDiv({ cls: 'dse-pr' });

	// head: false → headless (no element); string → verbatim override (renderMd owns
	// markdown, like the rows); undefined → the default caption (plain kit chrome).
	// An empty/whitespace-only override carries no words → normalize to headless: a
	// blank head is chrome the data doesn't justify (callers already `… || false`).
	const head = typeof opts.head === 'string' && opts.head.trim() === '' ? false : opts.head;
	let headEl: HTMLElement | undefined;
	if (head !== false) {
		headEl = rootEl.createDiv({ cls: 'dse-pr__head' });
		headEl.id = `${uid}-head`;
		if (typeof head === 'string') {
			if (opts.renderMd) void opts.renderMd(head, headEl);
			else headEl.setText(head);
		} else {
			headEl.setText(opts.chars ? `Power Roll + ${opts.chars}` : 'Power Roll');
		}
	}

	const rowsEl = rootEl.createDiv({ cls: 'dse-pr__rows' });
	if (opts.selectable) {
		// A roll resolves to exactly one tier → a radiogroup, labelled by the head.
		// Headless panels fall back gracefully: no aria-labelledby (never a dangling
		// id reference), selection semantics unchanged.
		rowsEl.setAttribute('role', 'radiogroup');
		if (headEl) rowsEl.setAttribute('aria-labelledby', headEl.id);
	}

	const tiers = opts.rows.map((r) => r.tier);
	const rowEls: Partial<Record<PowerRollTier, HTMLElement>> = {};

	for (const row of opts.rows) {
		const rowEl = opts.selectable
			? rowsEl.createEl('button', { cls: 'dse-pr__row' })
			: rowsEl.createDiv({ cls: 'dse-pr__row' });
		if (opts.selectable) {
			rowEl.setAttribute('type', 'button'); // never a form submit
			// The radiogroup's owned elements are radios (keyboard operability stays
			// native — a real <button> — with the radio role/state painted on top).
			rowEl.setAttribute('role', 'radio');
		}
		rowEl.setAttribute('data-tier', row.tier);
		tierBadge(rowEl, row.tier);
		const textEl = rowEl.createSpan({ cls: 'dse-pr__text' });
		// The renderMd callback owns markdown (fire-and-forget — mount stays sync);
		// without it the outcome is plain text.
		if (opts.renderMd) void opts.renderMd(row.md, textEl);
		else textEl.setText(row.md);
		rowEls[row.tier] = rowEl;
	}

	// ---- selection state (selectable mode only) ----
	let selected: PowerRollTier | undefined =
		opts.selectable && opts.selected !== undefined && rowEls[opts.selected] !== undefined
			? opts.selected
			: undefined;

	/** Reflects `selected` onto every row: aria-checked + roving tabindex (§4.4) —
	 *  exactly one radio checked once selected. With no selection yet, the FIRST
	 *  row is the single Tab stop. */
	function render(): void {
		tiers.forEach((tier, i) => {
			const rowEl = rowEls[tier]!;
			const isSelected = tier === selected;
			rowEl.setAttribute('aria-checked', String(isSelected));
			const isStop = selected === undefined ? i === 0 : isSelected;
			rowEl.setAttribute('tabindex', isStop ? '0' : '-1');
		});
	}

	/** The one selection-change path: no-ops on unknown tiers and re-selection. */
	function change(tier: PowerRollTier, write: { notify: boolean; focus: boolean }): void {
		if (rowEls[tier] === undefined || tier === selected) return;
		selected = tier;
		render();
		if (write.focus) rowEls[tier]?.focus(); // selection follows focus (§4.4)
		if (write.notify) opts.onSelect?.(tier);
	}

	if (opts.selectable) {
		render(); // initial mount

		for (const tier of tiers) {
			owner.registerDomEvent(rowEls[tier]!, 'click', () =>
				change(tier, { notify: true, focus: false }),
			);
		}

		owner.registerDomEvent(rowsEl, 'keydown', (evt: KeyboardEvent) => {
			if (tiers.length === 0) return;
			// Anchor on the row the key landed on (not `selected`): before any
			// selection exists, focus sits on row 0 and arrows must move off IT.
			const targetRow = (evt.target as HTMLElement).closest('.dse-pr__row');
			const current = tiers.findIndex((t) => rowEls[t] === targetRow);
			if (current === -1) return;
			let next: number;
			switch (evt.key) {
				case 'ArrowDown':
				case 'ArrowRight':
					next = (current + 1) % tiers.length;
					break;
				case 'ArrowUp':
				case 'ArrowLeft':
					next = (current - 1 + tiers.length) % tiers.length;
					break;
				case 'Home':
					next = 0;
					break;
				case 'End':
					next = tiers.length - 1;
					break;
				default:
					return; // unhandled keys pass through untouched
			}
			evt.preventDefault();
			change(tiers[next], { notify: true, focus: true });
		});
	}

	return {
		rootEl,
		headEl,
		rowEls,
		select: (tier: PowerRollTier): void => {
			if (!opts.selectable) return; // static panels have no selection state
			change(tier, { notify: false, focus: false });
		},
		getSelected: () => selected,
		setRollResult: (active: readonly PowerRollTier[] | null): void => {
			for (const tier of tiers) {
				const rowEl = rowEls[tier]!;
				if (active === null) rowEl.removeAttribute('data-dse-roll-result');
				else rowEl.setAttribute('data-dse-roll-result', active.includes(tier) ? 'active' : 'dimmed');
			}
		},
	};
}
