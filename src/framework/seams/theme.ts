// F1 §3.5 — Seam (a): theming / tokens.
//
// Minimal in F1: `active` is effectively constant ("steel"). D3 owns the value
// space (DseThemeId members, the DseTokenName union, and the --dse-* CSS custom
// property sheet in styles-source.css) — this file ships the machinery only.
//
// Contract downstream code relies on (F1 §3.5): every element root carries
// data-dse-element="<def.id>" (stamped by the pipeline — NOT this seam) and
// data-dse-theme="<active>" (stamped here, by apply()). All element CSS is
// scoped under [data-dse-element]. "Legacy" (D3) = today's visual styling
// expressed as a theme.
import type { Component } from 'obsidian';
import type { DseTokenName } from '../tokens';

export type DseThemeId = 'steel' | 'legacy' | (string & {}); // D3 finalizes members
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
 * has no setter — "active is effectively constant" in F1). What drives this in a
 * running plugin (e.g. wiring the `theme` PreferenceStore key to it) is later-task
 * scope (pipeline / main.ts wiring, D3/D4) — F1 ships the mechanism so it's already
 * testable and D3/D4 have something to call.
 */
export interface ThemeServiceInternal extends ThemeService {
	setActive(theme: DseThemeId): void;
}

export const DEFAULT_THEME_ID: DseThemeId = 'steel';

class DseThemeService implements ThemeServiceInternal {
	private _active: DseThemeId;
	private readonly listeners = new Set<(theme: DseThemeId) => void>();

	constructor(initial: DseThemeId) {
		this._active = initial;
	}

	get active(): DseThemeId {
		return this._active;
	}

	apply(rootEl: HTMLElement, owner: Component): void {
		rootEl.setAttribute('data-dse-theme', this._active);
		const unsubscribe = this.onChange((theme) => {
			rootEl.setAttribute('data-dse-theme', theme);
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
		if (theme === this._active) return;
		this._active = theme;
		// Snapshot: a listener unsubscribing another listener mid-notify must not
		// perturb this pass (Set iteration would otherwise skip/repeat entries).
		for (const cb of [...this.listeners]) cb(theme);
	}
}

/** Construct a fresh ThemeService (pipeline-internal: ThemeServiceInternal). */
export function createThemeService(initial: DseThemeId = DEFAULT_THEME_ID): ThemeServiceInternal {
	return new DseThemeService(initial);
}
