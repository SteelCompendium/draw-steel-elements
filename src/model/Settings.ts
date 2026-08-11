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
	settingsVersion: 3,
	prefs: {},
};

/**
 * D4 §5.3 — migrate whatever loadData() returned to the current shape. v0 → v1 is
 * purely additive and lossless: the three operational fields carry over verbatim;
 * `prefs` initializes empty (⇒ every pref resolves to its default ⇒ zero visual
 * change for existing vaults). Every migration run stamps `settingsVersion` to
 * whatever `DEFAULT_SETTINGS.settingsVersion` currently is (line below — NOT a
 * hardcoded literal), so this doc comment's version number tracks that constant,
 * not a fixed "1": it was 1 when D4 shipped this migration; F2 Task 10 bumped it to
 * 2 (see the v1 → v2 paragraph next) and a future structural change bumps it again.
 * Future structural changes add `if (priorVersion < N) { … }` branches here —
 * checked against the RAW on-disk version (captured before Object.assign fills in
 * the current default), so an old on-disk object with no settingsVersion field at
 * all is never mistaken for "already migrated".
 *
 * v1 → v2 (F2 Task 10, the 7.0.0 data-unified switch): pre-2.x `compendiumReleaseTag`
 * values are release tags from the now-retired `data-md-dse` repo (the legacy
 * CompendiumDownloader's `repo.zip` asset) — meaningless, and potentially
 * resolution-breaking, against data-unified's own tag series. Never replayed:
 * wiped so the next sync resolves `latest` (or whatever the user re-pins).
 *
 * v2 → v3 (SC-144, the "legacy" theme removal): the `theme` pref's option set lost
 * its `legacy` member, so a stored `theme: 'legacy'` is now an orphan value that no
 * descriptor option can produce. Drop the key outright — sparse storage means the
 * deletion lands the pref back on its descriptor default (`steel`), which is exactly
 * the desired outcome. Deliberately SILENT: no Notice, no error. The theme picker
 * never shipped (latest tag 6.0.1; the picker is unreleased-7.0.0 work), so only
 * BRAT/beta vaults can hold the key at all, and warning a released user about a
 * preference they never had would be noise. Deleting unconditionally (rather than
 * only when the value is 'legacy') also normalises any hand-set snippet id from the
 * same era; a fresh install has no `theme` key, so this is a no-op for it.
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
	if (priorVersion < 3) {
		delete (s.prefs as Record<string, unknown>).theme;
	}
	s.settingsVersion = DEFAULT_SETTINGS.settingsVersion;
	return s;
}
