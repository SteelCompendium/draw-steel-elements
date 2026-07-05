/**
 * F1 §4.3: SessionStore — plugin-scoped, in-memory best-effort store for session UI state
 * (tab active, collapse open/closed, selected creature cell, etc.), keyed by (blockKey, slot).
 *
 * Cleared when the plugin unloads. Pure — no Obsidian imports.
 */

export interface SessionStore {
	/**
	 * Get a value from session state.
	 *
	 * @param blockKey Best-effort stable key for the block (from BlockHost.blockKey()).
	 *                 Key format: `${sourcePath}::${language}::${lineStart}` when block info available,
	 *                 else content-hash fallback.
	 * @param slot     Slot name within the block (e.g. "tab", "collapse", "selectedCreatureId").
	 * @returns        The stored value, or undefined if missing.
	 */
	get<T>(blockKey: string, slot: string): T | undefined;

	/**
	 * Set a value in session state.
	 *
	 * @param blockKey Block key.
	 * @param slot     Slot name.
	 * @param value    Arbitrary value to store (typically primitives or plain objects).
	 */
	set<T>(blockKey: string, slot: string, value: T): void;

	/**
	 * Clear all session state. Called on plugin unload.
	 */
	clear(): void;
}

/**
 * SessionStore accessor for kit widgets (collapsible2, tabs, …): the caller — who
 * has cx — passes the store and the (blockKey, slot) address; the kit stays cx-free
 * (kit⊥elements). Lives here, NOT in a kit widget module, so it survives widget
 * renames/deletions (Plan 09 Task 0 — it originally lived in kit/collapsible2.ts,
 * which the collapsible2→collapsible rename deletes).
 */
export interface SessionPersist {
	session: SessionStore;
	/** Best-effort stable block key (BlockHost.blockKey()). */
	blockKey: string;
	/** Slot within the block (e.g. "collapse", "collapse.skills.crafting"). */
	slot: string;
}

/**
 * Create a new plugin-scoped SessionStore instance.
 */
export function createSessionStore(): SessionStore {
	// Nested Map: blockKey → (slot → value)
	const storage = new Map<string, Map<string, unknown>>();

	return {
		get<T>(blockKey: string, slot: string): T | undefined {
			const blockMap = storage.get(blockKey);
			if (!blockMap) return undefined;
			return blockMap.get(slot) as T | undefined;
		},

		set<T>(blockKey: string, slot: string, value: T): void {
			let blockMap = storage.get(blockKey);
			if (!blockMap) {
				blockMap = new Map<string, unknown>();
				storage.set(blockKey, blockMap);
			}
			blockMap.set(slot, value);
		},

		clear(): void {
			storage.clear();
		},
	};
}
