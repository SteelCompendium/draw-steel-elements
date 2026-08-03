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
import type { App, Component } from 'obsidian';
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
	/**
	 * SC-112 (Plan 23 Task 2): reflected onto element roots as an inline custom
	 * property, in parallel with (independent of) `attr` — a descriptor may carry
	 * either, both, or neither. `varName` is the full custom-property name (e.g.
	 * `'--dse-font-title'`); `toCss(value)` returns the string to
	 * `rootEl.style.setProperty(varName, …)`, or `null` to mean "default — remove
	 * the override" (`rootEl.style.removeProperty(varName)`), matching the site's
	 * remove-on-default semantics (`v2/docs/javascripts/settings-panel.js:80-103`).
	 * Written per element root, never `document.documentElement` — same popout-safe
	 * stamping discipline as `attr` and `ThemeService.apply()` (`theme.ts:16-17`).
	 */
	css?: {
		varName: string;
		toCss(value: DsePrefs[K]): string | null;
	};
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
	/**
	 * SC-112 (Plan 23 Task 2): stamp all CSS-bearing prefs on rootEl as inline
	 * custom properties and keep them current for owner's lifetime — the modal
	 * twin of `reflect()`, restricted to `css`-bearing descriptors only (no
	 * `data-dse-*` attrs). Called from `DseModal.open()` via the `prefsForApp`
	 * registry below, since `.dse-modal` is a first-class Steel token scope
	 * member (`styles-source.css:3144`) that never runs through the pipeline's
	 * own `reflect()` call (`pipeline.ts:381`).
	 */
	reflectCss(rootEl: HTMLElement, owner: Component): void;
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
			const key = descriptor.key;
			this.descriptorMap.set(key, descriptor);
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
		await this.storage.set(snapshot);
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
		owner.register(() => subs.delete(wrapped));
	}

	reflect(rootEl: HTMLElement, owner: Component): void {
		for (const descriptor of this.descriptorMap.values()) {
			if (descriptor.attr) {
				const attrName = `data-dse-${descriptor.attr}`;
				const stamp = (value: unknown) => rootEl.setAttribute(attrName, String(value));
				stamp(this.get(descriptor.key));
				this.subscribe(descriptor.key, owner, stamp);
			}
			// SC-112: attr and css are independent — a descriptor may carry either,
			// both, or neither, so this is a second `if`, not an `else if`.
			if (descriptor.css) {
				this.stampCss(rootEl, owner, descriptor);
			}
		}
	}

	reflectCss(rootEl: HTMLElement, owner: Component): void {
		for (const descriptor of this.descriptorMap.values()) {
			if (!descriptor.css) continue;
			this.stampCss(rootEl, owner, descriptor);
		}
	}

	/** Shared by reflect() and reflectCss(): stamp (and keep current) one
	 *  css-bearing descriptor's inline custom property on rootEl. */
	private stampCss(rootEl: HTMLElement, owner: Component, descriptor: PrefDescriptor): void {
		const css = descriptor.css;
		if (!css) return;
		const stamp = (value: unknown) => {
			const cssValue = css.toCss(value as never);
			if (cssValue === null) {
				rootEl.style.removeProperty(css.varName);
			} else {
				rootEl.style.setProperty(css.varName, cssValue);
			}
		};
		stamp(this.get(descriptor.key));
		this.subscribe(descriptor.key, owner, stamp);
	}
}

/** Construct a fresh PreferenceStore bound to an injected storage backend. */
export function createPreferenceStore(storage: PrefsStorage): PreferenceStore {
	return new DsePreferenceStore(storage);
}

// SC-112 (Plan 23 Task 2) — mirrors theme.ts:120-145 verbatim (same doc-comment
// rationale): DseModal.open() needs to reach the live PreferenceStore to stamp
// css-bearing prefs (font/scale custom properties) on the modal's dialog root, but
// modals are constructed with only `app: App` at 6 of 7 call sites (no `cx`/`prefs`
// in scope — see the SC-104 design recon this reuses,
// .superpowers/sdd/sc104-modal-theming-design.md §1/§3). Threading `prefs` through
// every modal constructor would churn 6 subclasses + ~10 call sites for one lookup.
// Instead: a WeakMap<App, PreferenceStore> registry, keyed by the same `App`
// instance every modal already carries — App is a stable per-plugin-instance
// singleton, so the registry entry outlives any one modal and is reclaimed
// automatically once the App itself is (WeakMap precedent:
// src/model/ComponentWrapper.ts:47, and theme.ts's themeServiceByApp). The plugin
// registers its store once (main.ts, right beside registerThemeServiceForApp); no
// unregister is needed — a reload's fresh App gets its own key, and re-registering
// the SAME app id (as tests do per-case) simply overwrites the prior entry.
const prefsByApp = new WeakMap<App, PreferenceStore>();

/** Register `store` as the live PreferenceStore for `app` (main.ts, once, right
 *  beside registerThemeServiceForApp). Last write wins — safe to call again on
 *  reload. */
export function registerPrefsForApp(app: App, store: PreferenceStore): void {
	prefsByApp.set(app, store);
}

/** Look up the PreferenceStore registered for `app`, or `undefined` if none was
 *  (e.g. a bare test/harness App that never called registerPrefsForApp). Callers
 *  must treat the miss as a graceful no-op — see DseModal.open(). */
export function prefsForApp(app: App): PreferenceStore | undefined {
	return prefsByApp.get(app);
}
