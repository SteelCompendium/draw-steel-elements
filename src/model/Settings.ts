import type { DsePrefs } from '@/framework/seams/prefs';

export interface DSESettings {
	compendiumReleaseTag?: string; // Optional: if not set, fetch the latest release
	compendiumDestinationDirectory: string;
	/** F2 Task 10 — data locale segment for the data-unified release asset name
	 *  (`{format}-unified-{locale}.zip`, e.g. `md-dse-unified-en.zip`). Only "en" is
	 *  published today. */
	compendiumLocale: string;
	defaultImagePath: string;
	/** OD-7 (F2 §4.2): when an SCC code is not resolvable in the vault, link out to
	 *  steelcompendium.io instead of rendering unresolved (click-time only — never
	 *  binds content, just a redirect target). */
	sccWebFallback: boolean;
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
	compendiumLocale: 'en',
	defaultImagePath: 'Media/token_1.png',
	sccWebFallback: true,
	settingsVersion: 2,
	prefs: {},
};

/**
 * D4 §5.3 — migrate whatever loadData() returned to the current shape. v0 → v1 is
 * purely additive and lossless: the three operational fields carry over verbatim;
 * `prefs` initializes empty (⇒ every pref resolves to its default ⇒ zero visual
 * change for existing vaults); `settingsVersion` stamps 1. Future structural
 * changes add `if (priorVersion < N) { … }` branches here — checked against the
 * RAW on-disk version (captured before Object.assign fills in the current default),
 * so an old on-disk object with no settingsVersion field at all is never mistaken
 * for "already migrated".
 *
 * v1 → v2 (F2 Task 10, the 6.0.0 data-unified switch): pre-2.x `compendiumReleaseTag`
 * values are release tags from the now-retired `data-md-dse` repo (the legacy
 * CompendiumDownloader's `repo.zip` asset) — meaningless, and potentially
 * resolution-breaking, against data-unified's own tag series. Never replayed:
 * wiped so the next sync resolves `latest` (or whatever the user re-pins).
 */
export function migrateSettings(raw: unknown): DSESettings {
	const base =
		raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Partial<DSESettings>) : {};
	const priorVersion = typeof base.settingsVersion === 'number' ? base.settingsVersion : 0;
	const s: DSESettings = Object.assign({}, DEFAULT_SETTINGS, base);
	// Always own a FRESH prefs object — never share DEFAULT_SETTINGS.prefs (or the
	// caller's raw object) by reference.
	s.prefs =
		base.prefs && typeof base.prefs === 'object' && !Array.isArray(base.prefs)
			? { ...base.prefs }
			: {};
	if (priorVersion < 2) {
		s.compendiumReleaseTag = '';
	}
	s.settingsVersion = DEFAULT_SETTINGS.settingsVersion;
	return s;
}
