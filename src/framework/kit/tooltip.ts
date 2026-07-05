// Plan 08 Task 2 (D2 §2.5) — kit/tooltip: THIN wrapper over Obsidian's native
// setTooltip. Replaces TooltipHover.vue and every `title=`/`el.title` site (which give
// no keyboard/AT exposure). No custom tooltip DOM: native handles positioning, delay,
// keyboard focus, and popout windows correctly (§4.10), and needs no owner — Obsidian
// manages the hover lifecycle itself.
//
// A11y (§4.2): a tooltip is NEVER a control's only accessible name. Where it would be,
// callers must also pass an aria-label — kit iconButton enforces this by requiring
// `label`.
import { setTooltip } from 'obsidian';
import type { TooltipPlacement } from 'obsidian';

export interface DseTooltipOptions {
	placement?: TooltipPlacement;
}

/** Attaches a native Obsidian tooltip to `el`. Idempotent per setTooltip semantics. */
export function tooltip(el: HTMLElement, text: string, options?: DseTooltipOptions): void {
	setTooltip(el, text, options?.placement !== undefined ? { placement: options.placement } : undefined);
}
