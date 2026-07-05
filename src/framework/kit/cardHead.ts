// Plan 08 Task 4 (D2 §2.7) — kit/cardHead: the 6-slot header builder. Ports
// DESIGN.md's unified .sc-head (3-lane × 2-column) into DSE so statblock /
// featureblock / feature / negotiation share ONE header grammar instead of each
// hand-rolling a *-title-line + *-subtitle-line:
//
//           LEFT (stack)              RIGHT (rail)
//   top   left-eyebrow             right-eyebrow
//   mid   left-primary (= name)    right-primary
//   bot   left-deck                right-deck
//
// Slot names are POSITIONAL, never purpose-bound — the same kind of field always
// lands in the same slot, and an omitted slot collapses to a gap (never a
// mislabeled placeholder). Lanes are grid ROWS in CSS, so a slot omitted on one
// side keeps its lane height from the other side (the two primaries stay level).
//
// A11y (§2.7): `name` is the card's heading — role="heading" + an aria-level
// appropriate to nesting (opts.level, default 3) — a landmark for AT, not a
// control. Static widget: no listeners, so `owner` is optional and unused, kept in
// the signature for kit uniformity (§2 conventions), like divider.
import type { Component } from 'obsidian';
import { crest, type CrestOptions } from './crest';

export interface CardHeadOptions {
	/** Left lane, top: the kind-noun ("Monster", "Feature", …). */
	leftEyebrow?: string;
	/** Left lane, middle: the card's NAME — required; renders as the heading. */
	name: string;
	/** Left lane, bottom: quiet provenance ("class · subclass"). */
	leftDeck?: string;
	/** Right rail, top (e.g. "Level 1"). */
	rightEyebrow?: string;
	/** Right rail, middle: the headline attribute (category / cost). */
	rightPrimary?: string;
	/** Right rail, bottom: a secondary attribute (cost / usage / EV). */
	rightDeck?: string;
	/** Embed a crest() shield in the leading grid column (§2.9; Steel-only). */
	crest?: CrestOptions;
	/** aria-level for the name heading, appropriate to nesting. Default 3. */
	level?: number;
}

export type CardHeadSlot =
	| 'leftEyebrow'
	| 'name'
	| 'leftDeck'
	| 'rightEyebrow'
	| 'rightPrimary'
	| 'rightDeck';

export interface CardHeadHandle {
	readonly rootEl: HTMLElement;
	/** The name slot (= slots.name), for callers that decorate the heading. */
	readonly nameEl: HTMLElement;
	/** Only the slots that were PROVIDED — omitted slots have no element at all. */
	readonly slots: Partial<Record<CardHeadSlot, HTMLElement>>;
}

type Lane = 'eyebrow' | 'primary' | 'deck';
type Side = 'left' | 'right';
type RenderStyle = 'line' | 'chip';

/** Mounts the 6-slot header grid into `parent` (D2 §2.7). */
export function cardHead(
	parent: HTMLElement,
	opts: CardHeadOptions,
	_owner?: Component,
): CardHeadHandle {
	const rootEl = parent.createDiv({ cls: 'dse-head' });
	const slots: Partial<Record<CardHeadSlot, HTMLElement>> = {};

	// Crest first: it occupies the leading grid column, spanning every lane.
	// crest() itself degrades to nothing without an icon (§2.9).
	if (opts.crest) crest(rootEl, opts.crest);

	// Default render styles: left column = text lines, right column = chips (§2.7).
	const mountSlot = (
		slot: CardHeadSlot,
		lane: Lane,
		side: Side,
		text: string | undefined,
		style: RenderStyle,
	): HTMLElement | undefined => {
		if (text === undefined) return undefined; // an omitted slot is a GAP
		const el = rootEl.createSpan({
			cls: `dse-head__${lane} dse-head__${lane}--${side} dse-head__${lane}--${style}`,
			text,
		});
		slots[slot] = el;
		return el;
	};

	mountSlot('leftEyebrow', 'eyebrow', 'left', opts.leftEyebrow, 'line');
	const nameEl = mountSlot('name', 'primary', 'left', opts.name, 'line')!;
	nameEl.setAttribute('role', 'heading');
	nameEl.setAttribute('aria-level', String(opts.level ?? 3));
	mountSlot('leftDeck', 'deck', 'left', opts.leftDeck, 'line');
	mountSlot('rightEyebrow', 'eyebrow', 'right', opts.rightEyebrow, 'chip');
	mountSlot('rightPrimary', 'primary', 'right', opts.rightPrimary, 'chip');
	mountSlot('rightDeck', 'deck', 'right', opts.rightDeck, 'chip');

	return { rootEl, nameEl, slots };
}
