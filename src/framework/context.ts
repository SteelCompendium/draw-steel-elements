// F1 §3.2 — RenderContext: per-block-instance context DTO + factory.
//
// RenderContext is the single immutable DTO the pipeline builds and passes to views.
// It exposes six service seams (theme, prefs, refs, session) plus the host (mode adapter)
// and essential app/plugin/settings for cross-cutting concerns. It contains NO view
// reference and NO DOM — views own DOM; context owns services.
//
// The optional `roll` field (additive for D5 planning) is a stub `RollService` to be
// filled in by D5; it's available for future use but unused in F1.

import type { App, Plugin } from 'obsidian';
import type { RenderMode, BlockHost } from './host/BlockHost';
import type { ThemeService } from './seams/theme';
import type { PreferenceStore } from './seams/prefs';
import type { ReferenceService } from './seams/refs';
import type { SessionStore } from './session';
import type { DSESettings } from '@model/Settings';

/**
 * Stub interface for roll service (D5 implementation).
 * Minimal/empty in F1 — D5 fills the contract.
 */
export interface RollService {
	// Placeholder for D5; intentionally empty for now.
}

/**
 * Per-block-instance render context: services + essentials injected into views.
 * F1 §3.2: immutable, mode-agnostic container for everything a view needs
 * to render and persist without direct Obsidian coupling.
 *
 * No view reference, no DOM — context owns services; views own DOM.
 */
export interface RenderContext {
	/** Obsidian App instance; used sparingly (ref service, validation). */
	readonly app: App;
	/** The plugin instance; used sparingly to avoid deep coupling. */
	readonly plugin: Plugin;
	/** Plugin settings snapshot, readonly to enforce immutability in views. */
	readonly settings: Readonly<DSESettings>;
	/** The mode adapter (host) — the single seam to reading-mode / LP / sidebars. */
	readonly host: BlockHost;
	/** Which rendering surface: "reading" | "live-preview" | "sidebar". Convenience === host.mode. */
	readonly mode: RenderMode;
	/** Theme service seam — theming and CSS token resolution (D3 extends). */
	readonly theme: ThemeService;
	/** Preference store seam — user preferences and data-dse-* reflection (D4 extends). */
	readonly prefs: PreferenceStore;
	/** Reference service seam — @path / wikilink / scc.vN: link resolution (F2 fills scc provider). */
	readonly refs: ReferenceService;
	/** Session store — best-effort in-memory state, keyed by (blockKey, slot). Cleared on plugin unload. */
	readonly session: SessionStore;
	/** Optional roll service stub (D5 implementation). */
	readonly roll?: RollService;
}

/**
 * Factory: construct a RenderContext from discrete service instances.
 * Called by the pipeline once per block, assembling the injection container.
 *
 * @param args - All required services and essentials to wire into the context.
 * @returns - A new immutable RenderContext.
 */
export function createRenderContext(args: {
	app: App;
	plugin: Plugin;
	settings: Readonly<DSESettings>;
	host: BlockHost;
	theme: ThemeService;
	prefs: PreferenceStore;
	refs: ReferenceService;
	session: SessionStore;
	roll?: RollService;
}): RenderContext {
	const context: RenderContext = {
		app: args.app,
		plugin: args.plugin,
		settings: args.settings,
		host: args.host,
		mode: args.host.mode,
		theme: args.theme,
		prefs: args.prefs,
		refs: args.refs,
		session: args.session,
		roll: args.roll,
	};

	// Freeze to enforce immutability at runtime.
	return Object.freeze(context);
}
