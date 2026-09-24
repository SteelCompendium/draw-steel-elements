// F1 §3.2 / §3.4 — RenderMode + the BlockHost mode-adapter seam.
//
// BlockHost is the single boundary between "a rendered DSE element" and "where it is
// mounted" (reading-mode note, Live Preview editor, or — additively, D8 — a sidebar
// panel). F1 ships ReadingModeBlockHost only; LivePreviewBlockHost is a declared,
// documented, unimplemented drop-in (spec §9 Non-goals) so the seam is visibly
// two-sided from day one.
import type { Component } from 'obsidian';

/**
 * Which surface a DSE element is currently mounted in.
 *
 * F1 spec §3.2 defines `"reading" | "live-preview"`; `"sidebar"` is an additive member
 * reserved for D8 — no BlockHost implements it in F1. Declared here (rather than the
 * not-yet-built framework/context.ts, where §3.2 places RenderContext.mode) because
 * BlockHost.mode is this union's primary producer.
 */
export type RenderMode = 'reading' | 'live-preview' | 'sidebar';

/** Position/identity of an addressable fenced block within its source document. */
export interface BlockInfo {
	/**
	 * Alias actually used in the document, e.g. "ds-stam". Never the element's
	 * canonical language — see ReadingModeBlockHost's alias-preservation contract
	 * (F1 §3.4 construction notes; fixes legacy CB-5).
	 */
	language: string;
	/** Fence line (the opening ` ```<language> ` or `~~~<language>` line), inclusive. */
	lineStart: number;
	/** Closing fence line, inclusive. */
	lineEnd: number;
}

/**
 * The mode adapter: the single seam between an ElementView and where/how it is
 * mounted and persisted. RenderContext.host (F1 §3.2) is always one of these.
 */
export interface BlockHost {
	readonly mode: RenderMode;
	/** Note path; "" for canvas text nodes (mirrors ctx.sourcePath today). */
	readonly sourcePath: string;
	/** Container the pipeline mounts the element root into. */
	readonly containerEl: HTMLElement;
	/**
	 * Whether replaceSource can possibly succeed here (false: print/export, canvas, a
	 * block nested inside another view's own MarkdownRenderer.render, or any other
	 * non-addressable context — F1 §4.4). Views must render read-only (visible but
	 * inert) when false, instead of attempting a write.
	 * NOT embeds (SC-184 fix round, embed-comment tangent) — an `![[embed]]` re-renders
	 * through Obsidian's own MarkdownRenderer with a real, non-empty sourcePath and a
	 * working getSectionInfo, so it resolves `canPersist === true` and writes through the
	 * same real file every other reading-mode host does (verified live; see SC-184's
	 * decisions ledger). NOT hover popovers either (SC-343 final review — corrected; this
	 * doc previously listed them as non-persistable): measured on Obsidian 1.14.2 (base
	 * and head alike, 2026-09-24), a hover popover's section RESOLVES and a click writes
	 * the correct block, same as any other reading-mode context. Of the cases above, only
	 * canvas has a dedicated quarantine branch in code (`sourcePath === ''`,
	 * ReadingModeBlockHost's `canPersist` getter); print/export and a nested render are
	 * non-persistable because their own hosts report `canPersist === false` (no
	 * addressable section info), not because they hit that branch.
	 *
	 * SC-343: a reading-mode host whose section RESOLVED AT LEAST ONCE stays persistable
	 * after the section goes (e.g. the flush after navigate-away) through its durable
	 * identity; a host whose section never resolved stays read-only for life.
	 */
	readonly canPersist: boolean;
	/**
	 * Tie a Component's lifecycle to this rendered block (reading mode: the
	 * MarkdownRenderChild; Live Preview later: the widget's own lifecycle).
	 * SC-340 (spec §7) amends this for reading mode: the ElementVIEW itself is no longer
	 * tied here — the pipeline owns it through the plugin-scoped ViewRegistry instead
	 * (see ReadingModeBlockHost.ts / viewRegistry.ts), so it can outlive this block's
	 * section (adoption). addChild remains the right call for any AUXILIARY Component a
	 * view registers that should still unload in lockstep with the section (e.g. a modal
	 * or popover the view opens, not the view itself).
	 */
	addChild<T extends Component>(child: T): T;
	/** Position/identity of the block in its document, when addressable; else null. */
	getBlockInfo(): BlockInfo | null;
	/**
	 * Replace the fenced block's BODY (not the fences) with newSource.
	 * Reading mode: Vault.process (atomic) + section-info line splice, preserving the
	 * fence style/language found live in the document. Live Preview later: a CM6
	 * transaction. Resolves false when `!canPersist` or the block cannot be located at
	 * write time — never throws, never logs.
	 */
	replaceSource(newSource: string): Promise<boolean>;
	/** Best-effort stable key for session state (F1 §4.3). Never used for document state. */
	blockKey(): string;
	/**
	 * SC-343 (spec SC-340 §6.5 item 5) — optional. `ElementView.persist()` calls it just
	 * before scheduling a write, so a host that caches the block's position can refresh it
	 * while the section is still live (the write itself may run after the section is gone).
	 */
	notePersistIntent?(): void;
	/**
	 * SC-184 — optional: lets the standard element chrome menu (framework/pipeline.ts)
	 * offer an "Unpin from sidebar" item without knowing anything about
	 * DseSidebarView/SidebarPanel. Only `SidebarBlockHost` implements it (a request to
	 * remove THIS panel); every other host omits it, so the pipeline's gate is simply
	 * "does this host support removal" rather than a mode check duplicated in two files.
	 */
	requestRemoval?(): void;
}
