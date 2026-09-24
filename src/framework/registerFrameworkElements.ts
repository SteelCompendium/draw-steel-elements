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
import { ViewRegistry } from './host/viewRegistry';
import { adoptView } from './host/adoptView';

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
	// SC-340 §6.1: the plugin-scoped owner of every reading-mode view.
	const registry = plugin.addChild(new ViewRegistry({ enabled: options.viewAdoption ?? false }));

	for (const def of framework.registry.all()) {
		for (const alias of def.aliases) {
			plugin.registerMarkdownCodeBlockProcessor(
				alias,
				(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
					// SC-340 §6.2: a rebuild caused by one of OUR writes adopts the live view.
					const claimed = registry.claim(ctx.docId, ctx.sourcePath, source);
					if (claimed) {
						try {
							adoptView(registry, claimed, el, ctx);
							return Promise.resolve();
						} catch (error) {
							// §8: never leave the block blank — release and render fresh.
							console.error('Draw Steel Elements: view adoption failed; rendering a fresh view.', error);
							if (claimed.root.parentElement === el) claimed.root.remove();
							registry.release(claimed, 'adopt-failed');
						}
					}
					const host = new ReadingModeBlockHost(plugin, el, ctx, alias, scrollPin, registry);
					// SC-343: the durable identity starts from the body this view is built from.
					host.setMountedBody(source);
					return framework.pipeline.run(def, source, host);
				},
			);
		}
	}
	return registry;
}
