// Plan 07 Task 5 / F1 §6 step 2 — ValuesRowElementView.
//
// onMount reuses the KEPT legacy ValuesRow/ValuesRowView DOM builder VERBATIM (same
// pattern as feature/view.ts reusing Features/FeatureView): the element view only
// recreates the deleted ValuesRowProcessor's `.ds-values-row-ele-container` wrapper and
// delegates everything inside it to ValuesRowView.build().
//
// What the framework replaced from the legacy processor (F1 §2.4): the try/catch +
// ".error-message" div -> the pipeline's single error boundary + renderErrorCard. There is
// NO click shield to replace — the legacy processor never armed one, which is why the
// definition sets noClickShield: true.
import type { MarkdownPostProcessorContext } from 'obsidian';
import { ElementView } from '@/framework/view';
import { ValuesRowView } from '@drawSteelAdmonition/ValuesRow/ValuesRowView';
import type { KeyValuePairs } from '@model/KeyValuePairs';

export class ValuesRowElementView extends ElementView<KeyValuePairs> {
	protected onMount(root: HTMLElement, model: KeyValuePairs): void {
		const container = root.createEl('div', { cls: 'ds-values-row-ele-container' });
		// The kept view still takes a MarkdownPostProcessorContext but never reads it (it
		// only stores ctx); host.sourcePath is the framework's ctx.sourcePath equivalent
		// (F1 §3.4), so a minimal shim bridges the shared, untouched view.
		const ctx = { sourcePath: this.cx.host.sourcePath } as MarkdownPostProcessorContext;
		new ValuesRowView(this.cx.plugin, model, ctx).build(container);
	}
}
