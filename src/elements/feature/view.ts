// Plan 09 Task 5 (D2 §3.6) — FeatureElementView on the D2 kit card grammar.
//
// The view is a thin lifecycle shell: ALL rendering lives in renderFeature.ts (the
// reusable grammar Task 6's Statblock/Featureblock consume). The element's one real
// job is the ML-1 fix — it hands the renderer a renderMd callback bound to
// this.renderMarkdown, so every embedded markdown render is lifecycle-parented to
// THIS view (never the plugin, never a leaked Component).
//
// The legacy sub-view tree (drawSteelAdmonition/Features/FeatureView -> EffectView ->
// FeaturesView) is deliberately NOT touched: Featureblock + Statblock still construct
// it directly until Task 6 switches them onto renderFeature and retires it.
import { ElementView } from '@/framework/view';
import type { FeatureConfig } from '@model/FeatureConfig';
import { renderFeature } from './renderFeature';

export class FeatureElementView extends ElementView<FeatureConfig> {
	protected onMount(root: HTMLElement, model: FeatureConfig): void {
		renderFeature(root, model, this, (md, el) => this.renderMarkdown(md, el));
	}
}
