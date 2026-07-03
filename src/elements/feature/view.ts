// Plan 07 Task 1 / F1 §6 step 5 — FeatureElementView.
//
// onMount reuses the legacy Features/FeatureView DOM builder VERBATIM (same pattern as
// horizontal-rule/view.ts reusing HorizontalRuleProcessor.build): the element view only
// recreates the deleted FeatureProcessor's `.ds-feature-ele-container.ds-container`
// wrapper and delegates everything inside it to the KEPT sub-view tree
// (FeatureView -> EffectView -> FeaturesView). Those sub-views are NOT migrated or
// deleted here: Featureblock + Statblock (F1 §6 step 6) still construct them directly,
// exactly like Statblock/Featureblock keep calling HorizontalRuleProcessor.build. The
// Feature CSS (`.ds-feature-*`, `.ds-pr-*`, `.ds-features`, …) stays GLOBAL for the same
// reason — negotiation/statblock/featureblock rules consume those classes with no
// `[data-dse-element="feature"]` ancestor, so re-scoping would silently unstyle them
// (per-element scoping of shared classes is a D3 job).
//
// What the framework replaced from the legacy processor (F1 §2.4): the manual
// capture-phase mousedown/pointerdown stop -> the pipeline's default click shield
// (def.noClickShield unset); the try/catch + ".error-message" div -> the pipeline's
// single error boundary + renderErrorCard.
import type { MarkdownPostProcessorContext } from 'obsidian';
import { ElementView } from '@/framework/view';
import { FeatureView } from '@drawSteelAdmonition/Features/FeatureView';
import type { FeatureConfig } from '@model/FeatureConfig';

export class FeatureElementView extends ElementView<FeatureConfig> {
	protected onMount(root: HTMLElement, model: FeatureConfig): void {
		const container = root.createEl('div', { cls: 'ds-feature-ele-container ds-container' });
		// The kept sub-view tree still takes a MarkdownPostProcessorContext but reads ONLY
		// ctx.sourcePath (every renderMD call, incl. the nested EffectView/FeaturesView
		// recursion). host.sourcePath is the framework's equivalent (F1 §3.4 "mirrors
		// ctx.sourcePath"), so a minimal shim bridges the shared, untouched sub-views.
		const ctx = { sourcePath: this.cx.host.sourcePath } as MarkdownPostProcessorContext;
		new FeatureView(this.cx.plugin, model, ctx).build(container);
	}
}
