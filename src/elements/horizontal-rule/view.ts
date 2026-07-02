// D1 Task 1 (Plan 03) / F1 §6 step 1 — HorizontalRuleView.
//
// onMount reuses the legacy Common/horizontalRuleProcessor DOM builder VERBATIM: the same
// `.ds-hr-container > .ds-hr-left-line + .ds-hr-center + .ds-hr-right-line` structure the
// CSS at styles-source.css:330 already styles. That CSS block was already a duplicate of
// the deleted HorizontalRule.vue's scoped styles (D1 spec §3's CSS migration table calls
// this out explicitly: "Already duplicated ... Net: delete a duplicate"), so no CSS port
// happens in this migration.
//
// horizontalRuleProcessor.ts is intentionally NOT deleted: Statblock/Featureblock call
// `HorizontalRuleProcessor.build()` directly, embedding `.ds-hr-container` inside their OWN
// containers (styles-source.css:1738/1804 nest `.ds-hr-container` padding rules under
// `.ds-sb-container`/`.ds-fb-container`, with NO `[data-dse-element="horizontal-rule"]`
// ancestor). Re-scoping the base `.ds-hr-container` rule under
// `[data-dse-element="horizontal-rule"]` — the generic instruction other migrations
// follow — would therefore silently unstyle those embedded call sites; they migrate later
// (F1 steps 5/6), out of D1 scope. Kept as-is, ambiguity resolved per F1 §6 (preserve
// today's shared DOM/CSS building block until its own migration step).
import { HorizontalRuleProcessor } from '@drawSteelAdmonition/Common/horizontalRuleProcessor';
import { ElementView } from '@/framework/view';

export class HorizontalRuleView extends ElementView<void> {
	protected onMount(root: HTMLElement): void {
		HorizontalRuleProcessor.build(root);
	}
}
