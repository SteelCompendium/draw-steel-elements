// F1 §3.5 / D3 §2.2 — Seam (a): theming / tokens.
//
// D3 (Plan 10 Task 2) replaces F1's in-memory stub with the real implementation:
// the active theme IS the persisted `theme` preference (F1 §3.6's PreferenceStore
// key), so it survives restarts and is the same value the D4 settings picker edits.
// D3 owns the value space (DseThemeId members, the DseTokenName union, and the
// --dse-* CSS custom property sheet in styles-source.css).
//
// Contract downstream code relies on (F1 §3.5, D3 §7.2): every element root carries
// data-dse-element="<def.id>" (stamped by the pipeline — NOT this seam) and
// data-dse-theme="<active>" (stamped here, by apply() — the SINGLE writer of that
// attribute; the `theme` PrefDescriptor deliberately has no `attr`, see prefs.ts).
// All element CSS is scoped under [data-dse-element]. "Legacy" = today's visual
// styling expressed as a theme.
//
// Popout safety (D3 §2.5): state is per-root, not per-document — apply() stamps the
// element's OWN root in whatever window it lives; document.body is never touched.
import type { Component } from 'obsidian';
import type { DseTokenName } from '../tokens';
import type { PreferenceStore } from './prefs';

export type DseThemeId = 'steel' | 'legacy' | (string & {}); // D3 §2.3 — open for snippet ids (§6)
// Narrowed union (Plan 08 Task 1, D2 §6) — defined in framework/tokens.ts (seams must
// not import kit); re-exported here so the F1 import surface stays intact.
export type { DseTokenName };

export interface ThemeService {
	readonly active: DseThemeId;
	/** Stamp data-dse-theme (and theme-dependent attrs) on an element root; re-stamps on
	 *  change for the lifetime of `owner` (auto-unsubscribe via owner.register()). */
	apply(rootEl: HTMLElement, owner: Component): void;
	/** Subscribe to theme changes; returns unsubscribe (callers wrap in owner.register). */
	onChange(cb: (theme: DseThemeId) => void): () => void;
	/** Token → CSS var reference, e.g. cssVar("accent") === "var(--dse-accent)". */
	cssVar(name: DseTokenName): string;
}

/**
 * Pipeline-internal extension of ThemeService: mutates the active theme. Not part
 * of the public ThemeService surface consumed by element views (§3.5's interface
 * has no setter). D4's settings picker drives this (or writes the `theme` pref
 * directly — both paths converge on prefs.set, see setActive below).
 */
export interface ThemeServiceInternal extends ThemeService {
	setActive(theme: DseThemeId): void;
}

export const DEFAULT_THEME_ID: DseThemeId = 'steel';

/**
 * D3 §2.2 — the PreferenceStore-backed ThemeService. `active` reads the `theme`
 * pref synchronously; `setActive` persists it; ONE long-lived upstream
 * `prefs.subscribe` (owned by the plugin — the single sanctioned long-lived
 * subscription) fans every pref change out to the onChange listeners, which is
 * what re-stamps every live apply()'d root. A theme switch is therefore reflow,
 * not re-render: O(live roots) attribute writes, no view teardown.
 */
class DseThemeService implements ThemeServiceInternal {
	private readonly listeners = new Set<(theme: DseThemeId) => void>();

	constructor(
		private readonly prefs: PreferenceStore,
		owner: Component,
	) {
		// Single upstream subscription: when the `theme` pref changes (setActive here,
		// the D4 picker, or a persisted-value load), fan out to listeners. Owner = the
		// plugin, so it lives exactly as long as the plugin — it drives, not leaks.
		this.prefs.subscribe('theme', owner, (theme) => {
			// Snapshot: a listener unsubscribing another listener mid-notify must not
			// perturb this pass (Set iteration would otherwise skip/repeat entries).
			for (const cb of [...this.listeners]) cb(theme);
		});
	}

	get active(): DseThemeId {
		return this.prefs.get('theme');
	}

	apply(rootEl: HTMLElement, owner: Component): void {
		rootEl.dataset.dseTheme = this.active;
		// Re-stamp on change; auto-unsubscribes when owner (the ElementView) unloads.
		// Per-root, never document.body — popout safety (D3 §2.5).
		const unsubscribe = this.onChange((theme) => {
			rootEl.dataset.dseTheme = theme;
		});
		owner.register(unsubscribe);
	}

	onChange(cb: (theme: DseThemeId) => void): () => void {
		this.listeners.add(cb);
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			this.listeners.delete(cb);
		};
	}

	cssVar(name: DseTokenName): string {
		return `var(--dse-${name})`;
	}

	setActive(theme: DseThemeId): void {
		if (theme === this.active) return;
		// Persist only — the upstream prefs.subscribe in the constructor drives the
		// listener fan-out. Notifying here as well would double-fire every listener.
		// D4 (Plan 10 FOLLOWUP): a storage rejection must not vanish silently.
		this.prefs.set('theme', theme).catch((error) => {
			console.error('Draw Steel Elements: failed to persist theme preference', error);
		});
	}
}

/** Construct the ThemeService over `prefs` (pipeline-internal: ThemeServiceInternal).
 *  `owner` = the plugin: it owns the service's one long-lived pref subscription. */
export function createThemeService(prefs: PreferenceStore, owner: Component): ThemeServiceInternal {
	return new DseThemeService(prefs, owner);
}
