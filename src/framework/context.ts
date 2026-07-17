// F1 §3.2 — RenderContext: per-block-instance context DTO + factory.
//
// RenderContext is the single immutable DTO the pipeline builds and passes to views.
// It exposes six service seams (theme, prefs, refs, session) plus the host (mode adapter)
// and essential app/plugin/settings for cross-cutting concerns. It contains NO view
// reference and NO DOM — views own DOM; context owns services.
//
// The optional `roll` field is the REAL RollService seam (D5, Plan 14) — supplied by
// the pipeline; re-exported from './roll/service' so F1-era import paths keep working.

import type { App, Plugin } from 'obsidian';
import type { RenderMode, BlockHost } from './host/BlockHost';
import type { ThemeService } from './seams/theme';
import type { PreferenceStore } from './seams/prefs';
import type { ReferenceService } from './seams/refs';
import type { RollService } from './roll/service';
import type { SessionStore } from './session';
import type { DSESettings } from '@model/Settings';
import type { SccAnchorResolver } from '@/refs/rewriteSccAnchors';
import type { CompendiumIndex } from '@/services/CompendiumIndex';

// D5 (Plan 14): the F1-era stub is gone — the REAL RollService lives in
// framework/roll/service.ts and is re-exported here so F1-era importers
// (view.ts's PanelHost) keep their './context' import path unchanged.
export type { RollService };

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
	/** Roll service seam (D5) — supplied by the pipeline; optional so bare
	 *  createRenderContext callers (tests) stay valid. Views guard on absence. */
	readonly roll?: RollService;
	/**
	 * F2 §4.3(a)/§4.4 fix wave — the live SccResolver (main.ts's plugin.sccResolver),
	 * threaded through so ElementView.renderMarkdown can call rewriteSccAnchors on its
	 * own rendered DOM (the vault-wide sccPostProcessor, §4.3(b), only ever sees
	 * synchronous post-render DOM and misses the async, fire-and-forget renderMarkdown
	 * elements render through). Optional so bare createRenderContext callers (tests,
	 * and any harness that doesn't care about scc links) stay valid — renderMarkdown
	 * no-ops the rewrite pass when this is absent.
	 */
	readonly sccAnchors?: SccAnchorResolver;
	/**
	 * D6 Task 3 (spec §1.2) — the typed-model compendium accessor (D6 Task 2). Threaded
	 * through so `RefUnwrapView` can resolve a whole-block reference (bare slug -> code
	 * via `resolveSlug`, typed model + source via `getEntity`) without going back through
	 * `SccRefProvider` (which throws on web/unresolved — recon gotcha (d)). Optional so
	 * bare `createRenderContext` callers (tests, and any harness that doesn't care about
	 * compendium references) stay valid; `RefUnwrapView` degrades to a "compendium not
	 * installed" card when absent.
	 */
	readonly compendium?: CompendiumIndex;
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
	sccAnchors?: SccAnchorResolver;
	compendium?: CompendiumIndex;
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
		sccAnchors: args.sccAnchors,
		compendium: args.compendium,
	};

	// Freeze to enforce immutability at runtime.
	return Object.freeze(context);
}
