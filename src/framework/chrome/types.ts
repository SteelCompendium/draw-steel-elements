// SC-169 — the element CHROME contract: the standard top-right menu panel + the
// whole-element collapse that every card-like element opts into.
//
// One implementation lives in the framework (`mountChrome.ts`); an element opts IN by
// declaring the `chrome` slot on its ElementDefinition (registry.ts). Absence of the slot
// means "no panel, no collapse" — which is the correct answer for trivial elements
// (`ds-hr`, `ds-values-row`, …) and the default for everything not yet rolled out.
//
// The slot carries exactly what the framework cannot derive on its own:
//   1. ELIGIBILITY — the slot's presence IS the opt-in (Scott's ruling 3, SC-169).
//   2. `summary()`  — the one-line collapsed form ("Hero: Frodo Baggins",
//                     "Stamina (31/48)"). Only the element knows which field is the
//                     name and which two numbers are worth 12 characters.
//   3. `items()`    — OPTIONAL extra menu items, for the future "add to encounter" /
//                     "export" affordances. v1 ships none; collapse/expand is always
//                     provided by the framework and the edit pencil is provided by the
//                     pipeline (gated on the default-OFF `authoringControls` pref).
import type { Component } from 'obsidian';

/**
 * The one-line collapsed form, as STRUCTURE rather than a pre-joined string: the
 * framework owns the punctuation and the DOM (`label: name (detail)`) so every collapsed
 * element reads identically, and each part gets its own span for styling/truncation.
 */
export interface ElementSummary {
	/** Type label — the left half. Sentence case, no colon. e.g. "Hero", "Stamina". */
	label: string;
	/** Instance name, when the element has one. e.g. "Frodo Baggins". */
	name?: string;
	/**
	 * A few characters of super-important data, rendered parenthesised after the name
	 * (SC-169's "Stamina: Frodo Baggins (22/48)"). Keep it SHORT — the collapsed form is
	 * one line and the name is what a reader scans for.
	 */
	detail?: string;
}

/** One icon-only item in the panel. Rendered right-to-left in declaration order. */
export interface ChromeMenuItem {
	/** Stable id — used for the `data-dse-chrome-item` attribute (tests/CSS hooks). */
	id: string;
	/** Lucide icon name. */
	icon: string;
	/** REQUIRED accessible name (the aria-label AND the hover tooltip). */
	label: string;
	onClick: () => void;
}

/** What `summary()` / `items()` are handed. */
export interface ElementChromeContext<M> {
	readonly model: M;
	/** The definition's own identity — so an element can fall back to `def.name`. */
	readonly def: { readonly id: string; readonly name: string };
}

/**
 * The `ElementDefinition.chrome` slot. Declaring it opts the element into the standard
 * menu panel and whole-element collapse.
 */
export interface ElementChrome<M = unknown> {
	/** The one-line collapsed form. Called lazily, each time the element collapses. */
	summary(ctx: ElementChromeContext<M>): ElementSummary;
	/**
	 * Element-specific menu items, appended to the LEFT of the framework's own
	 * (collapse/expand stays rightmost, the OS-window-controls anchor). Optional; no
	 * element ships one in v1.
	 */
	items?(ctx: ElementChromeContext<M>): ChromeMenuItem[];
}

/** Handle returned by `mountChrome` — the pipeline keeps it only to add late items. */
export interface ChromeHandle {
	readonly panelEl: HTMLElement;
	readonly summaryEl: HTMLElement;
	isCollapsed(): boolean;
	setCollapsed(collapsed: boolean): void;
	/** Append one more item to the panel, left of the collapse toggle. */
	addItem(item: ChromeMenuItem, owner: Component): void;
}
