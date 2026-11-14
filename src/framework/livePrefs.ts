// SC-644 — the ONE way a pipeline-level (or any other long-lived) consumer says "when one of THESE
// preferences changes, tell me", so a setting reaches a block that is already on screen instead of waiting
// for the note to be reopened.
//
// It is `PreferenceStore.subscribe` over a declared SET of keys, with the two guards every caller needs:
//   * a key the store has no descriptor for is skipped (a bare test PreferenceStore describes only the
//     builtin theme key, and `subscribe` throws for an undescribed one; in production the experimental
//     gate withholds `authoringControls`/`printPreview` from the catalog until the switch is on, and the
//     catalog cannot change within one plugin load);
//   * the subscriptions are bound to `owner` (F1 §4.5), so unloading it drops every one of them — a view
//     that unloads can never be rebuilt by a later flip.
//
// Used today by `ElementPipeline` for the chrome prefs (collapsibleDefault, authoringControls). SC-645
// ("Edit Recoveries with a popover" does not reach an open stamina bar) is the next consumer: declare its
// key and say what to rebuild.
import type { Component } from 'obsidian';
import type { DsePrefs, PreferenceStore } from './seams/prefs';

/**
 * Calls `onChange(key, value)` after any of `keys` changes, for as long as `owner` is loaded. The store
 * notifies synchronously inside `set()`, before the disk write (D4 §5.2), so the callback runs in the click
 * that flipped the setting; an exception it throws would abort `set()` before it persists, so callers keep
 * their callback from throwing (the pipeline wraps its rebuild).
 */
export function watchPrefs<K extends keyof DsePrefs>(
	prefs: PreferenceStore,
	owner: Component,
	keys: readonly K[],
	onChange: (key: K, value: DsePrefs[K]) => void,
): void {
	const described = new Set(prefs.descriptors().map((d) => d.key as string));
	for (const key of keys) {
		if (!described.has(key)) continue;
		prefs.subscribe(key, owner, (value) => onChange(key, value));
	}
}
