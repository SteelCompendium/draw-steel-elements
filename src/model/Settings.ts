import type { DsePrefs } from '@/framework/seams/prefs';

export interface DSESettings {
	compendiumReleaseTag?: string; // Optional: if not set, fetch the latest release
	compendiumDestinationDirectory: string;
	defaultImagePath: string;
	/** D4 §5.3 — migration marker. Bump ONLY for structural pref changes (key
	 *  renames / option-set changes); sparse storage makes default changes and new
	 *  prefs migration-free. */
	settingsVersion: number;
	/** D4 §5.2 / OD-D4-4 — the SPARSE pref slice: only keys whose value differs
	 *  from the descriptor default are ever written here. */
	prefs: Partial<DsePrefs>;
}

export const DEFAULT_SETTINGS: DSESettings = {
	compendiumReleaseTag: '', // Leave empty to fetch the latest release
	compendiumDestinationDirectory: 'DS Compendium', // Default directory in the vault
	defaultImagePath: 'Media/token_1.png',
	settingsVersion: 1,
	prefs: {},
};

/**
 * D4 §5.3 — migrate whatever loadData() returned to the current shape. v0 → v1 is
 * purely additive and lossless: the three operational fields carry over verbatim;
 * `prefs` initializes empty (⇒ every pref resolves to its default ⇒ zero visual
 * change for existing vaults); `settingsVersion` stamps 1. Future structural
 * changes add `if (s.settingsVersion < N) { … }` branches here.
 */
export function migrateSettings(raw: unknown): DSESettings {
	const base =
		raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Partial<DSESettings>) : {};
	const s: DSESettings = Object.assign({}, DEFAULT_SETTINGS, base);
	// Always own a FRESH prefs object — never share DEFAULT_SETTINGS.prefs (or the
	// caller's raw object) by reference.
	s.prefs =
		base.prefs && typeof base.prefs === 'object' && !Array.isArray(base.prefs)
			? { ...base.prefs }
			: {};
	if (typeof s.settingsVersion !== 'number') s.settingsVersion = 1;
	return s;
}
