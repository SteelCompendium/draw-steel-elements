// Plan 07 Task 5 / F1 §6 step 2 — CharacteristicsElementView.
//
// onMount reuses the KEPT legacy Characteristics/CharacteristicsView DOM builder VERBATIM
// (same pattern as feature/view.ts reusing Features/FeatureView): the element view only
// recreates the deleted CharacteristicsProcessor's `.ds-characteristics-ele-container`
// wrapper and delegates everything inside it to CharacteristicsView.build().
//
// What the framework replaced from the legacy processor (F1 §2.4): the manual
// capture-phase mousedown/pointerdown stop -> the pipeline's default click shield
// (def.noClickShield unset); the try/catch + ".error-message" div -> the pipeline's
// single error boundary + renderErrorCard.
import type { MarkdownPostProcessorContext } from 'obsidian';
import { ElementView } from '@/framework/view';
import { CharacteristicsView } from '@drawSteelAdmonition/Characteristics/CharacteristicsView';
import type { Characteristics } from '@model/Characteristics';

export class CharacteristicsElementView extends ElementView<Characteristics> {
	protected onMount(root: HTMLElement, model: Characteristics): void {
		const container = root.createEl('div', { cls: 'ds-characteristics-ele-container' });
		// The kept view still takes a MarkdownPostProcessorContext but never reads it (it
		// only stores ctx); host.sourcePath is the framework's ctx.sourcePath equivalent
		// (F1 §3.4), so a minimal shim bridges the shared, untouched view.
		const ctx = { sourcePath: this.cx.host.sourcePath } as MarkdownPostProcessorContext;
		new CharacteristicsView(this.cx.plugin, model, ctx).build(container);
	}
}
