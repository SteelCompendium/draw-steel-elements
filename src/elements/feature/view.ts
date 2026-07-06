// Plan 09 Task 5 (D2 §3.6) — FeatureElementView on the D2 kit card grammar.
//
// The view is a thin lifecycle shell: ALL rendering lives in renderFeature.ts (the
// reusable grammar Task 6's Statblock/Featureblock consume). The element's one real
// job is the ML-1 fix — it hands the renderer a renderMd callback bound to
// this.renderMarkdown, so every embedded markdown render is lifecycle-parented to
// THIS view (never the plugin, never a leaked Component).
//
// The legacy sub-view tree (Features/FeatureView -> EffectView -> FeaturesView) is
// gone: Task 6 switched its last consumers (Featureblock + Statblock) onto
// renderFeature, and the Task 10 cleanup deleted it.
import { ElementView } from '@/framework/view';
import type { FeatureConfig } from '@model/FeatureConfig';
import { renderFeature } from './renderFeature';

export class FeatureElementView extends ElementView<FeatureConfig> {
	protected onMount(root: HTMLElement, model: FeatureConfig): void {
		renderFeature(root, model, this, (md, el) => this.renderMarkdown(md, el));
	}
}
