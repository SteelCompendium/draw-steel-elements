// F1 §3.6 — Seam (b): preferences.
//
// F1 ships the storage + reflection machinery with a near-empty pref surface (just
// the built-in `theme` key); D4 owns the pref catalog — extends DsePrefs (module
// augmentation), defines PrefDescriptors, builds the settings UI.
//
// Storage backend: plugin saveData, merged into the existing settings object under
// a `prefs` key (F1 OD-2). That merge into the plugin's full settings object is
// real main.ts wiring (later task); this seam only needs to get/set its own slice,
// so the constructor takes an injected saveData-like async get/set pair — testable
// without a real Plugin.
//
// Critical cross-spec contract (also independently specified by D3, F1 §3.5): the
// built-in `theme` PrefDescriptor below carries NO `attr`. reflect() only stamps
// attr-bearing descriptors, so data-dse-theme is never double-stamped here —
// ThemeService.apply() owns that attribute exclusively.
import type { Component } from 'obsidian';
import { DEFAULT_THEME_ID, type DseThemeId } from './theme';

export interface DsePrefs {
	theme: DseThemeId;
	// D4 extends this interface (module augmentation) with e.g. cardStyle, density, …
}

export interface PrefDescriptor<K extends keyof DsePrefs = keyof DsePrefs> {
	key: K;
	default: DsePrefs[K];
	/** Reflected onto element roots as data-dse-<attr>="<value>" when set. */
	attr?: string;
	/** Settings-tab metadata (label, control type, options) — shape finalized by D4. */
	ui?: unknown;
}

export interface PreferenceStore {
	get<K extends keyof DsePrefs>(key: K): DsePrefs[K];
	set<K extends keyof DsePrefs>(key: K, value: DsePrefs[K]): Promise<void>;
	/** Live subscription; auto-unsubscribed when owner unloads. */
	subscribe<K extends keyof DsePrefs>(key: K, owner: Component, cb: (value: DsePrefs[K]) => void): void;
	/** Stamp all attr-bearing prefs on rootEl as data-dse-* and keep them current
	 *  for owner's lifetime. Called by the pipeline on every element root. */
	reflect(rootEl: HTMLElement, owner: Component): void;
	/** D4: register descriptors (defaults, attrs, settings UI rows). */
	describe(descriptors: readonly PrefDescriptor[]): void;
	/** All registered descriptors, in registration order (D4: drives the settings
	 *  renderer and per-block `prefs:` validation). */
	descriptors(): readonly PrefDescriptor[];
}

/**
 * Injected saveData-like storage backend (F1 OD-2). Mirrors the shape of
 * Plugin.loadData()/saveData() closely enough to be a thin adapter over it, while
 * staying independently unit-testable (no real Plugin/App needed).
 */
export interface PrefsStorage {
	/** Load the persisted prefs slice, or undefined when nothing has been saved yet. */
	get(): Promise<Partial<DsePrefs> | undefined>;
	/** Persist the full current prefs slice (already scoped — real wiring merges
	 *  this under the plugin settings object's `prefs` key). */
	set(prefs: Partial<DsePrefs>): Promise<void>;
}

/** Built-in descriptors seeded into every store. Exported for tests and for D4's
 *  settings tab (which renders each descriptor's `ui`). */
export const BUILTIN_DESCRIPTORS: readonly PrefDescriptor[] = [
	// NO attr — see the module doc comment above (hard D3→D4 contract, D3 §7.1:
	// ThemeService.apply() is the single writer of data-dse-theme; an attr here
	// would double-stamp it via reflect()). The `ui` is the D4 settings-picker
	// row (D3 OD-5 labels — "Match Obsidian (Legacy)" clarifies that Legacy
	// defers to the active Obsidian theme).
	{
		key: 'theme',
		default: DEFAULT_THEME_ID,
		ui: {
			group: 'Appearance',
			label: 'Theme',
			control: 'select',
			options: [
				{ value: 'legacy', label: 'Match Obsidian (Legacy)' },
				{ value: 'steel', label: 'Steel' },
			],
		},
	},
];

class DsePreferenceStore implements PreferenceStore {
	private readonly descriptorMap = new Map<string, PrefDescriptor>();
	private readonly values = new Map<string, unknown>();
	private readonly listeners = new Map<string, Set<(value: unknown) => void>>();
	/** Raw snapshot from storage.get(), kept so a descriptor described() AFTER the
	 *  async load resolves can still pick up its already-loaded persisted value. */
	private persistedSnapshot: Partial<Record<string, unknown>> = {};

	constructor(private readonly storage: PrefsStorage) {
		this.describe(BUILTIN_DESCRIPTORS);
		// Fire-and-forget: get() must stay synchronous (§3.6), so persisted values
		// are applied (and subscribers notified) whenever the load resolves. D4:
		// a load failure must not vanish silently (Plan 10 follow-up).
		this.load().catch((error) => {
			console.error('Draw Steel Elements: failed to load preferences', error);
		});
	}

	private async load(): Promise<void> {
		const persisted = await this.storage.get();
		if (!persisted) return;
		this.persistedSnapshot = persisted;
		for (const key of Object.keys(persisted)) {
			this.applyPersistedValue(key, (persisted as Record<string, unknown>)[key]);
		}
	}

	private applyPersistedValue(key: string, value: unknown): void {
		if (value === undefined) return;
		if (!this.descriptorMap.has(key)) return; // no descriptor yet; describe() will re-apply
		this.values.set(key, value);
		this.notify(key, value);
	}

	describe(descriptors: readonly PrefDescriptor[]): void {
		for (const descriptor of descriptors) {
			const key = descriptor.key as string;
			this.descriptorMap.set(key, descriptor as PrefDescriptor);
			if (!this.values.has(key)) {
				this.values.set(key, descriptor.default);
			}
			if (Object.prototype.hasOwnProperty.call(this.persistedSnapshot, key)) {
				this.applyPersistedValue(key, this.persistedSnapshot[key]);
			}
		}
	}

	private descriptorFor(key: string): PrefDescriptor {
		const descriptor = this.descriptorMap.get(key);
		if (!descriptor) {
			throw new Error(`Unknown preference "${key}" — register a PrefDescriptor via describe() before use.`);
		}
		return descriptor;
	}

	descriptors(): readonly PrefDescriptor[] {
		return [...this.descriptorMap.values()];
	}

	get<K extends keyof DsePrefs>(key: K): DsePrefs[K] {
		const k = key as string;
		const descriptor = this.descriptorFor(k);
		return (this.values.has(k) ? this.values.get(k) : descriptor.default) as DsePrefs[K];
	}

	async set<K extends keyof DsePrefs>(key: K, value: DsePrefs[K]): Promise<void> {
		const k = key as string;
		this.descriptorFor(k);
		this.values.set(k, value);
		this.notify(k, value); // D4 §5.2: reflect/subscribers fire before the disk write
		await this.persist();
	}

	private async persist(): Promise<void> {
		const snapshot: Record<string, unknown> = {};
		for (const [key, descriptor] of this.descriptorMap) {
			if (!this.values.has(key)) continue;
			const value = this.values.get(key);
			if (value === descriptor.default) continue; // sparse: defaults are implicit
			snapshot[key] = value;
		}
		this.persistedSnapshot = snapshot;
		await this.storage.set(snapshot as Partial<DsePrefs>);
	}

	private notify(key: string, value: unknown): void {
		const subs = this.listeners.get(key);
		if (!subs) return;
		for (const cb of [...subs]) cb(value);
	}

	subscribe<K extends keyof DsePrefs>(key: K, owner: Component, cb: (value: DsePrefs[K]) => void): void {
		const k = key as string;
		this.descriptorFor(k);
		let subs = this.listeners.get(k);
		if (!subs) {
			subs = new Set();
			this.listeners.set(k, subs);
		}
		const wrapped = (value: unknown) => cb(value as DsePrefs[K]);
		subs.add(wrapped);
		owner.register(() => subs!.delete(wrapped));
	}

	reflect(rootEl: HTMLElement, owner: Component): void {
		for (const descriptor of this.descriptorMap.values()) {
			if (!descriptor.attr) continue; // e.g. `theme` — ThemeService.apply() owns it
			const attrName = `data-dse-${descriptor.attr}`;
			const stamp = (value: unknown) => rootEl.setAttribute(attrName, String(value));
			stamp(this.get(descriptor.key));
			this.subscribe(descriptor.key, owner, stamp);
		}
	}
}

/** Construct a fresh PreferenceStore bound to an injected storage backend. */
export function createPreferenceStore(storage: PrefsStorage): PreferenceStore {
	return new DsePreferenceStore(storage);
}
