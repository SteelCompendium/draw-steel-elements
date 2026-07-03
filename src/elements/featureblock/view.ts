// Plan 07 Task 2 / F1 §6 step 6 — FeatureblockElementView.
//
// onMount reuses the legacy featureblock/FeatureblockView DOM builder VERBATIM (same
// pattern as feature/view.ts reusing Features/FeatureView): the element view only
// recreates the deleted FeatureblockProcessor's `.ds-fb-container.ds-container` wrapper
// and delegates everything inside it to the KEPT sub-view tree (FeatureblockView ->
// HeaderView / FeatureblockStatsView -> BoldKeyWithValueView /
// HorizontalRuleProcessor.build / FeaturesView -> FeatureView). Those sub-views are NOT
// migrated or deleted here: Statblock (F1 §6 step 6's other half) still constructs
// several of them directly. The Featureblock CSS (`.ds-fb-*`) and the nested shared
// classes (`.ds-feature-container`, `.ds-hr-container`, `.ds-header-container`, …) stay
// GLOBAL for the same reason as Feature's — statblock/legacy rules consume them with no
// `[data-dse-element="featureblock"]` ancestor, so re-scoping would silently unstyle
// them (per-element scoping of shared classes is a D3 job).
//
// What the framework replaced from the legacy processor (F1 §2.4): the manual
// capture-phase mousedown/pointerdown stop -> the pipeline's default click shield
// (def.noClickShield unset); the try/catch + ".error-message" div -> the pipeline's
// single error boundary + renderErrorCard.
import type { MarkdownPostProcessorContext } from 'obsidian';
import { ElementView } from '@/framework/view';
import { FeatureblockView } from '@drawSteelAdmonition/featureblock/FeatureblockView';
import type { FeatureblockConfig } from '@model/FeatureblockConfig';

export class FeatureblockElementView extends ElementView<FeatureblockConfig> {
	protected onMount(root: HTMLElement, model: FeatureblockConfig): void {
		const container = root.createEl('div', { cls: 'ds-fb-container ds-container' });
		// The kept sub-view tree still takes a MarkdownPostProcessorContext but reads ONLY
		// ctx.sourcePath (FeatureblockView's flavor renderMD + every nested
		// FeaturesView/FeatureView renderMD call; FeatureblockStatsView / HeaderView /
		// BoldKeyWithValueView never read ctx at all). host.sourcePath is the framework's
		// equivalent (F1 §3.4 "mirrors ctx.sourcePath"), so a minimal shim bridges the
		// shared, untouched sub-views — same as feature/view.ts.
		const ctx = { sourcePath: this.cx.host.sourcePath } as MarkdownPostProcessorContext;
		new FeatureblockView(this.cx.plugin, model, ctx).build(container);
	}
}
