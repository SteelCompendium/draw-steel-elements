// Plan 08 Task 2 (D2 §2.10) — kit/divider: horizontal / vertical rule. Replaces
// HorizontalRule.vue (element #11), VerticalRule.vue, and the modal
// .vertical-divider / .horizontal-divider.
//
// `ornament: true` renders the ◆ diamond rule: two fade lines meeting a rotated
// diamond — in Legacy this is pixel-faithful to today's .ds-hr-container (the token
// values --dse-rule/--dse-rule-fade map to var(--icon-color)/transparent); the Steel
// theme (D3) re-skins the same DOM via --dse-metal-line. Plain (no ornament) is a
// single solid hairline. Static — no listeners — so `owner` is optional and unused,
// kept in the signature for kit uniformity (§2 conventions).
import type { Component } from 'obsidian';

export interface DividerOptions {
	axis: 'h' | 'v';
	/** `true` → the ◆ diamond rule (horizontal only). */
	ornament?: boolean;
}

export interface DividerHandle {
	readonly rootEl: HTMLElement;
}

/** Mounts a rule into `parent`: `.dse-hr` (h) or `.dse-vr` (v), role="separator". */
export function divider(
	parent: HTMLElement,
	opts: DividerOptions,
	_owner?: Component,
): DividerHandle {
	if (opts.axis === 'v') {
		const rootEl = parent.createDiv({ cls: 'dse-vr' });
		rootEl.setAttribute('role', 'separator');
		rootEl.setAttribute('aria-orientation', 'vertical');
		return { rootEl };
	}

	const rootEl = parent.createDiv({ cls: 'dse-hr' });
	rootEl.setAttribute('role', 'separator'); // horizontal is the separator default
	if (opts.ornament) {
		rootEl.createSpan({ cls: 'dse-hr__line dse-hr__line--left' });
		rootEl.createSpan({ cls: 'dse-hr__diamond' });
		rootEl.createSpan({ cls: 'dse-hr__line dse-hr__line--right' });
	} else {
		rootEl.createSpan({ cls: 'dse-hr__line' });
	}
	return { rootEl };
}
