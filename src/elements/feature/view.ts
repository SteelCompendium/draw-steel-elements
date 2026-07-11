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
//
// D5 (Plan 14): passes roll hooks when rollingEnabled (featureRollHooks — absent
// hooks render the byte-identical pre-D5 card), exposes the D7 characteristic-
// provider injection point, and re-mounts live when the roll prefs flip so the
// settings toggle is immediately visible on open notes.
import { ElementView } from '@/framework/view';
import type { RenderContext } from '@/framework/context';
import type { FeatureConfig } from '@model/FeatureConfig';
import type { CharacteristicProvider } from '@/framework/roll/binding';
import { renderFeature } from './renderFeature';
import { featureRollHooks } from './rollController';

export class FeatureElementView extends ElementView<FeatureConfig> {
	private provider?: CharacteristicProvider;

	constructor(cx: RenderContext) {
		super(cx);
		// D5: re-mount when the roll prefs flip so the settings toggle is visible on
		// open notes immediately. Inline in each consuming view (not a shared helper:
		// rootEl/model/update are protected — only the subclass reaches them type-
		// safely). The view is the subscription owner ⇒ unload detaches (F1 §4.5).
		// Before first mount rootEl is unset — the guard makes a pre-mount flip a
		// no-op (the mount itself reads the fresh value).
		const remount = (): void => {
			if (this.rootEl) void this.update(this.model);
		};
		cx.prefs.subscribe('rollingEnabled', this, remount);
		cx.prefs.subscribe('rollClickToRoll', this, remount);
	}

	/** D7 hook (D5 §3.3): inject a bound hero's characteristic values. */
	setCharacteristicProvider(provider: CharacteristicProvider): void {
		this.provider = provider;
		if (this.rootEl) void this.update(this.model);
	}

	protected onMount(root: HTMLElement, model: FeatureConfig): void {
		renderFeature(root, model, this, (md, el) => this.renderMarkdown(md, el), {
			roll: featureRollHooks(this.cx, this.provider),
		});
	}
}
