// D1 Task 1 (Plan 03) — the framework -> Obsidian wiring loop (F1 §2.3 "incremental
// migration switch").
//
// ElementRegistry (registry.ts, Task 8) is deliberately Obsidian-decoupled — a pure
// id/alias -> ElementDefinition lookup with no `Plugin` coupling, so it stays
// unit-testable without a real Plugin (see that file's header comment). This module is the
// piece registry.ts's header explicitly deferred: "Wiring a registry's definitions into
// Obsidian's registerMarkdownCodeBlockProcessor is ... main.ts's job (Task 10)" — main.ts
// (D1 Task 1) calls this once, after populating the registry, right alongside the still-live
// legacy `registerElements(plugin)` call. Both paths coexist (ADDITIVE): this only ever
// registers processors for whatever `framework.registry` currently holds; every
// not-yet-migrated element keeps rendering through RegisterElements.ts untouched.
//
// Per-alias wiring recipe mirrors F1 §2.3 item 2 / §6 step-1 table exactly:
//   plugin.registerMarkdownCodeBlockProcessor(alias, (source, el, ctx) =>
//     framework.pipeline.run(def, source, new ReadingModeBlockHost(plugin, el, ctx, alias)));
// A FRESH ReadingModeBlockHost is constructed per render call (not per alias/def) — each
// Obsidian post-processor invocation is a new block instance with its own
// MarkdownPostProcessorContext, containerEl, and lifecycle.
import type { Plugin, MarkdownPostProcessorContext } from 'obsidian';
import type { ElementRegistry } from './registry';
import type { ElementPipeline } from './pipeline';
import { ReadingModeBlockHost } from './host/ReadingModeBlockHost';
import { PreviewScrollPin } from './host/previewScrollPin';
import { LivePreviewScrollHold } from './host/livePreviewScrollHold';
import { ViewRegistry } from './host/viewRegistry';
import { adoptView } from './host/adoptView';
import { ReusedElementRemounter } from './host/remountReused';
import { livePreviewReconcileExtension } from './host/livePreviewReconcile';

/**
 * The subset of `ElementFrameworkV2` (main.ts) this wiring loop needs. A narrow structural
 * interface — rather than importing `ElementFrameworkV2` from main.ts — keeps
 * `src/framework/` free of any dependency on the plugin's composition root (main.ts already
 * satisfies this shape, so `registerFrameworkElements(this, this.frameworkV2)` just works).
 */
export interface FrameworkElementsBundle {
	readonly registry: ElementRegistry;
	readonly pipeline: ElementPipeline;
}

/**
 * Registers one Obsidian markdown code-block processor per alias of every definition
 * currently in `framework.registry` (F1 §2.3). Call AFTER the registry has been populated
 * (`registry.register(...)` for each migrated element) — definitions registered later are
 * NOT picked up retroactively; this is a one-shot wiring pass over `registry.all()` at the
 * time it is called, matching `main.ts onload`'s single call site.
 */
export function registerFrameworkElements(
	plugin: Plugin,
	framework: FrameworkElementsBundle,
	options: { viewAdoption?: boolean } = {},
): ViewRegistry {
	// SC-198: one pin per plugin, shared by every host so blocks sharing a scroller share
	// its pin rather than fighting over it, and so unload can drop any pin still held.
	const scrollPin = new PreviewScrollPin();
	plugin.register(() => scrollPin.releaseAll());
	// SC-470: every write to a note, ours or not, pins every Reading view of it (previewScrollPin.ts);
	// SC-479: and every Reading view of another note that shows a DSE block embedded from it.
	const resolveLink = (linkpath: string, sourcePath: string): string | null => plugin.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)?.path ?? null;
	plugin.registerEvent(plugin.app.vault.on('modify', (file) => scrollPin.pinReadingViewsOf(plugin.app.workspace, file.path, resolveLink)));
	// SC-470 r4: a popout closed while pinned never fires its TTL; release its pins on `window-close`.
	plugin.registerEvent(plugin.app.workspace.on('window-close', (_win, window) => scrollPin.releaseWindow(window)));
	// SC-472: a leaf that navigated to another note keeps its scroller; drop the old note's pin at once, not at the backstop.
	plugin.registerEvent(plugin.app.workspace.on('file-open', () => scrollPin.releaseNavigated()));
	// SC-478: Live Preview panes keep their reading position across the same writes (livePreviewScrollHold.ts):
	// capture at `modify`, which fires before the pane's transaction; restore + hold inside the editor.
	const lpHold = new LivePreviewScrollHold();
	plugin.register(() => lpHold.releaseAll());
	// SC-522: and every Live Preview view of another note that shows a DSE block embedded from it holds that embed's height.
	plugin.registerEvent(plugin.app.vault.on('modify', (file) => lpHold.captureViewsOf(plugin.app.workspace, file.path, resolveLink)));
	plugin.registerEditorExtension(lpHold.extension());
	// SC-340 §6.1: the plugin-scoped owner of every reading-mode view.
	const registry = plugin.addChild(new ViewRegistry({ enabled: options.viewAdoption ?? false }));
	// SC-481: redraws an element Obsidian reused for the next identical block (see remountReused.ts).
	const remounter = new ReusedElementRemounter(plugin, framework, scrollPin, registry);
	// SC-537: and, for twin callouts in Live Preview (no processor call there), from the editor's own update (livePreviewReconcile.ts).
	plugin.registerEditorExtension(livePreviewReconcileExtension(remounter));

	for (const def of framework.registry.all()) {
		for (const alias of def.aliases) {
			plugin.registerMarkdownCodeBlockProcessor(
				alias,
				(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
					// SC-340 §6.2: a rebuild caused by one of OUR writes adopts the live view.
					const claimed = registry.claim(ctx.docId, ctx.sourcePath, source);
					if (claimed) {
						// SC-481: where the writer's view was drawn, read before adoption re-points its host.
						const vacated = claimed.host.remountTarget();
						let adopted = false;
						try {
							adoptView(registry, claimed, el, ctx);
							adopted = true;
						} catch (error) {
							// §8: never leave the block blank — release and render fresh.
							console.error('Draw Steel Elements: view adoption failed; rendering a fresh view.', error);
							if (claimed.root.parentElement === el) claimed.root.remove();
							registry.release(claimed, 'adopt-failed');
						}
						if (adopted) {
							// SC-481: the adoption emptied the writer's old element; if Obsidian still uses it for a later
							// identical block, that block gets its own view. Then any other element left on a different block.
							return Promise.all([
								remounter.remountVacated(vacated.el, vacated.ctx, vacated.alias),
								remounter.reconcile(ctx.sourcePath),
							]).then(() => undefined);
						}
					}
					const host = new ReadingModeBlockHost(plugin, el, ctx, alias, scrollPin, registry);
					// SC-343: the durable identity starts from the body this view is built from.
					host.setMountedBody(source);
					// SC-481: a claim that missed (adoption off, an edit form's Save, a twin) can leave the writer's view in the
					// element Obsidian reused for the twin; redraw it from the twin's own block.
					return Promise.all([framework.pipeline.run(def, source, host), remounter.reconcile(ctx.sourcePath)]).then(() => undefined);
				},
			);
		}
	}
	return registry;
}
