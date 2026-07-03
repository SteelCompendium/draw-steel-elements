// Plan 07 Task 3 / F1 §6 step 6 — StatblockElementView.
//
// Unlike Feature/Featureblock, Statblock had NO legacy view class — its whole render
// lived in the deleted StatblockProcessor's private buildUI. onMount therefore folds
// those sub-view calls in VERBATIM (same strings, same fallbacks, same guard): recreate
// the processor's `.ds-sb-container.ds-container` wrapper, then Common/HeaderView ->
// statblock/StatsView -> (only when features exist) HorizontalRuleProcessor.build +
// Features/FeaturesView over `features.map(f => new FeatureConfig(f))`. Those sub-views
// are NOT migrated or deleted here — they are the same kept builders Feature/Featureblock
// still delegate to. The Statblock CSS (`.ds-sb-*`) and the nested shared classes
// (`.ds-feature-container`, `.ds-hr-container`, `.ds-header-container`, …) stay GLOBAL —
// featureblock/legacy rules consume them with no `[data-dse-element="statblock"]`
// ancestor (HeaderView even emits `.ds-sb-header-*` inside featureblock renders), so
// re-scoping would silently unstyle them (per-element scoping of shared classes is a D3
// job).
//
// What the framework replaced from the legacy processor (F1 §2.4): the manual
// capture-phase mousedown/pointerdown stop -> the pipeline's default click shield
// (def.noClickShield unset); the try/catch + ".error-message" div -> the pipeline's
// single error boundary + renderErrorCard.
import type { MarkdownPostProcessorContext } from 'obsidian';
import { ElementView } from '@/framework/view';
import { HeaderView } from '@drawSteelAdmonition/Common/HeaderView';
import { StatsView } from '@drawSteelAdmonition/statblock/StatsView';
import { FeaturesView } from '@drawSteelAdmonition/Features/FeaturesView';
import { HorizontalRuleProcessor } from '@drawSteelAdmonition/Common/horizontalRuleProcessor';
import { FeatureConfig } from '@model/FeatureConfig';
import type { StatblockConfig } from '@model/StatblockConfig';

export class StatblockElementView extends ElementView<StatblockConfig> {
	protected onMount(root: HTMLElement, model: StatblockConfig): void {
		const container = root.createEl('div', { cls: 'ds-sb-container ds-container' });
		// The kept sub-views still take a MarkdownPostProcessorContext but read ONLY
		// ctx.sourcePath (every renderMD call in the nested FeaturesView/FeatureView tree;
		// HeaderView/StatsView/HorizontalRuleProcessor never read ctx at all).
		// host.sourcePath is the framework's equivalent (F1 §3.4 "mirrors
		// ctx.sourcePath"), so a minimal shim bridges the shared, untouched sub-views —
		// same as feature/featureblock's view.ts.
		const ctx = { sourcePath: this.cx.host.sourcePath } as MarkdownPostProcessorContext;

		// -- StatblockProcessor.buildUI, folded in verbatim ------------------------------
		const level = model.statblock.level !== undefined ? `Level ${model.statblock.level}` : 'Level N/A';
		const roles = model.statblock.roles?.join(', ') ?? 'No Role';
		new HeaderView(
			this.cx.plugin,
			ctx,
			model.statblock.name ?? 'Unnamed Creature',
			`${level} ${roles}`,
			model.statblock.ancestry?.join(', ') ?? 'Unknown Ancestry',
			model.statblock.ev !== undefined ? `EV ${model.statblock.ev}` : 'EV N/A',
		).build(container);

		new StatsView(this.cx.plugin, model, ctx).build(container);
		if (model.statblock.features?.length > 0) {
			HorizontalRuleProcessor.build(container);
			const featureConfigs = model.statblock.features.map((f) => new FeatureConfig(f));
			new FeaturesView(this.cx.plugin, featureConfigs, ctx).build(container);
		}
	}
}
