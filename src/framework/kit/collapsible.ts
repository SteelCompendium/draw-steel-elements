// D1 Task 2 (Plan 03) / F1 §6 step "Skills" — kit/collapsible: vanilla DOM port of
// Common/CollapsibleHeading.vue + Common/RightArrowToggleIndicator.vue. First occupant of
// framework/kit/ alongside componentWrapper.ts (D1 spec §2 step 2 / OD-D1-2: "seed kit/
// now"). D2 extends this kit; keep it small + reusable.
//
// Purely presentational — no persistence, no SessionStore/Obsidian-service coupling. The
// caller (an ElementView) owns the current `enabled` (expanded) state and reacts to
// `onToggle`; `owner` only lifecycle-binds the click listener to the caller
// (`Component.registerDomEvent`, F1 §4.5 cleanup semantics) since this widget holds no
// Component of its own.
//
// `collapse-icon` / `is-collapsed` are kept VERBATIM (not renamed/prefixed) — they are
// Obsidian's own semantic classes for the native collapse-triangle rotation treatment
// (RightArrowToggleIndicator.vue's original comment: "Override of Obsidian functionality
// to ironically gain function parity with Obsidian's own heading elements"). Renaming them
// would forfeit that free built-in styling. `heading-collapse-indicator` is kept verbatim
// too, since it is the exact selector the ported Live Preview positioning rule
// (styles-source.css) targets.
import type { Component } from 'obsidian';
import { setIcon } from 'obsidian';

export interface CollapsibleHeadingOptions {
	/** h1–h6. Default 1, mirrors the legacy Vue CollapsibleHeading default. */
	headerLevel?: number;
	/** Whether the section is currently EXPANDED (Vue prop name: `enabled`). */
	enabled: boolean;
	/** Heading text content. */
	text: string;
	/** Called with the NEW enabled (expanded) state once the indicator is clicked — the
	 *  indicator's own visual state (is-collapsed) is already updated by the time this
	 *  fires; the caller only needs to react (persist state, show/hide content, etc.). */
	onToggle: (enabled: boolean) => void;
}

export interface CollapsibleHeadingHandle {
	readonly headingEl: HTMLElement;
	readonly indicatorEl: HTMLElement;
	/** Reflects an externally-driven enabled/expanded state onto the indicator (e.g. a
	 *  caller restoring session state on a later re-render). */
	setEnabled(enabled: boolean): void;
}

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

/**
 * Mounts a collapsible heading (h1–h6) with a right-triangle toggle indicator into
 * `parent`. Mirrors CollapsibleHeading.vue's template 1:1: the indicator precedes the
 * heading text.
 */
export function mountCollapsibleHeading(
	parent: HTMLElement,
	owner: Component,
	options: CollapsibleHeadingOptions,
): CollapsibleHeadingHandle {
	const level = Math.min(Math.max(Math.trunc(options.headerLevel ?? 1), 1), 6);
	const tag = HEADING_TAGS[level - 1];
	const headingEl = parent.createEl(tag, { cls: 'ds-kit-collapsible-heading heading' });
	const indicatorEl = headingEl.createSpan({
		cls: 'heading-collapse-indicator collapse-indicator collapse-icon',
	});
	setIcon(indicatorEl, 'right-triangle');

	const setEnabled = (enabled: boolean): void => {
		indicatorEl.toggleClass('is-collapsed', !enabled);
	};
	setEnabled(options.enabled);
	headingEl.appendText(options.text);

	const handleClick = (event: Event): void => {
		event.preventDefault();
		event.stopPropagation();
		// Read the indicator's OWN current state rather than closing over the (possibly
		// stale) initial `options.enabled` — repeated toggles work correctly even without
		// the caller calling setEnabled() back in.
		const nextEnabled = indicatorEl.hasClass('is-collapsed');
		setEnabled(nextEnabled);
		options.onToggle(nextEnabled);
	};

	// Vue: @mousedown.stop @click.capture.stop.prevent
	owner.registerDomEvent(indicatorEl, 'mousedown', (event: Event) => event.stopPropagation());
	owner.registerDomEvent(indicatorEl, 'click', handleClick, { capture: true });

	return { headingEl, indicatorEl, setEnabled };
}
