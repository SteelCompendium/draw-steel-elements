// SC-481 - redraw an element Obsidian reused for a different block.
//
// After a write to one of several blocks with the SAME text, Obsidian matches the new sections to the old ones by their
// text and hands the old rendered element of the written block to the next identical block below it (Reading view:
// parseFinish takes the first unused old section with equal html; Live Preview: the same rule for code-block widgets).
// It calls no code-block processor for that reused element, so it keeps the writer's live view. Left alone, that view
//   - shows the writer's new value at the twin's place,
//   - writes the writer's block when it is clicked (its body no longer matches the twin, so the host looks the body
//     up and finds the writer's block), and
//   - is emptied when the writer is adopted into the new section (adoptView moves the root out), which is the twin
//     vanishing until the note is reopened.
//
// The fix is the one public-API move that is always right: every code-block processor call is a chance to look at the
// views already drawn for the same note (path) and redraw any element that now sits on a block other
// than its view's - a fresh view built from the block the element is on.
//   - `remountVacated`: the adopted writer's old element, vacated by the adoption, when Obsidian still uses it.
//   - `reconcile`: any other live view whose element now resolves to a fence (a plain section, or inside a quote/callout window) with a body other than the one the
//     view knows (the claim missed - adoption off, the block edit form's Save, Live Preview - so the writer is still
//     in the reused element).
// Both build a normal view, bound to the twin's own body and lines, so the twin writes through its own section.
import type { MarkdownPostProcessorContext, Plugin } from 'obsidian';
import type { ElementRegistry } from '../registry';
import type { ElementPipeline } from '../pipeline';
import { ReadingModeBlockHost, fenceOnElement, newPassMemo } from './ReadingModeBlockHost';
import type { CmEditorView, LivePreviewScope } from './ReadingModeBlockHost';
import type { PreviewScrollPin } from './previewScrollPin';
import type { ViewRegistry } from './viewRegistry';
import { splitLines } from './lineEnding';

/** What the remounter needs of the framework (the same narrow shape `registerFrameworkElements` takes). */
interface FrameworkParts {
	readonly registry: ElementRegistry;
	readonly pipeline: ElementPipeline;
}

export class ReusedElementRemounter {
	/** The last note text split into lines: every host asked about one note shares the one split. */
	private cachedText: string | null = null;
	private cachedLines: readonly string[] = [];

	constructor(
		private readonly plugin: Plugin,
		private readonly framework: FrameworkParts,
		private readonly scrollPin: PreviewScrollPin | null,
		private readonly registry: ViewRegistry,
	) {}

	private readonly linesOf = (text: string): readonly string[] => {
		if (this.cachedText !== text) {
			this.cachedLines = splitLines(text);
			this.cachedText = text;
		}
		return this.cachedLines;
	};

	/** Draw a fresh view for `body` into `el`, which must be empty. Never rejects: a failed draw is logged. */
	private async mount(el: HTMLElement, ctx: MarkdownPostProcessorContext, alias: string, body: string): Promise<void> {
		const def = this.framework.registry.get(alias);
		if (!def) return;
		try {
			const host = new ReadingModeBlockHost(this.plugin, el, ctx, alias, this.scrollPin, this.registry);
			// SC-343: the durable identity starts from the body this view is built from.
			host.setMountedBody(body);
			await this.framework.pipeline.run(def, body, host);
		} catch (error) {
			console.error('Draw Steel Elements: redrawing a reused section failed.', error);
		}
	}

	/**
	 * The writer's view was adopted into the new section, which vacated `prevEl`. If Obsidian reused `prevEl` for a later
	 * block (it still resolves to a section), that block has no card: draw it.
	 */
	remountVacated(prevEl: HTMLElement, prevCtx: MarkdownPostProcessorContext, alias: string): Promise<void> {
		// (Reading view only: Live Preview never adopts. Its getSectionInfo still answers for a DESTROYED widget, so this
		// would draw into one if adoption were ever added there.)
		// The same section test `reconcile` uses: a quote/callout window is read for the fence inside it, never parsed whole.
		const fence = fenceOnElement(prevCtx, prevEl, alias, this.linesOf);
		if (!fence) return Promise.resolve();
		prevEl.replaceChildren();
		return this.mount(prevEl, prevCtx, alias, fence.body);
	}

	/**
	 * Release and redraw every live view of this note whose element now sits on a different block than the one the view
	 * knows. Cheap when nothing moved: one section read per live view and no string work unless a body differs.
	 * Scoped by path, not by docId: Live Preview gives every code-block widget its own random docId, so the writer's widget
	 * never shares one with the new widget whose processor call this is. Each view is judged against its OWN context, so a
	 * view in another pane or embed of the same note (its renderer may not have re-parsed yet) is judged by its own state.
	 *
	 * SC-537: `within` is the editor view of an editor update (livePreviewReconcile.ts). Then only the views drawn inside that
	 * editor are judged, and a Live Preview callout widget (no section from Obsidian, no processor call when it is handed to a twin)
	 * by the section that editor reports for it, read from the update's own document. Reading views and other panes are still
	 * judged only at processor time.
	 */
	reconcile(sourcePath: string, within?: CmEditorView): Promise<void> {
		const redraws: Promise<void>[] = [];
		let scope: LivePreviewScope | undefined;
		if (within) {
			// The note text is read from the update's document once, and only if a view in this editor needs it.
			const view = within;
			let text: string | null = null;
			scope = {
				view,
				get text(): string {
					return (text ??= view.state.doc.toString());
				},
				...newPassMemo(),
			};
		}
		for (const entry of this.registry.liveEntries()) {
			if (entry.released || entry.claiming) continue;
			if (entry.host.sourcePath !== sourcePath) continue;
			if (within && !within.dom.contains(entry.root)) continue;
			const body = entry.host.reusedBlockBody(this.linesOf, scope);
			if (body === null) continue;
			const { el, ctx, alias } = entry.host.remountTarget();
			// Unloads the writer's view (its pending edit flushes first, through the body lookup that finds its own block).
			this.registry.release(entry, 'reused-by-twin');
			el.replaceChildren();
			redraws.push(this.mount(el, ctx, alias, body));
		}
		return Promise.all(redraws).then(() => undefined);
	}
}
