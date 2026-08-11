// T-4 (Plan 02) + D3 Plan 10 Task 2: theme + prefs seam implementations (F1 §3.5/§3.6,
// D3 §2.2/§2.5).
//
//   - ThemeService (D3 §2.2): PreferenceStore-backed — `active` IS the persisted
//     `theme` pref; `setActive` persists via prefs.set; the pref's change
//     notification (ONE long-lived upstream subscription, owned by the plugin)
//     drives the onChange fan-out and every apply()'d root's re-stamp.
//   - PreferenceStore: storage + reflection machinery, with only the built-in
//     `theme` pref described; D4 extends DsePrefs (module augmentation) and
//     registers its own descriptors via describe().
//
// Critical cross-spec contract (D3 §7.1 — hard contract to D4): the built-in
// `theme` PrefDescriptor carries NO `attr`, so PreferenceStore.reflect() never
// stamps data-dse-theme — that attribute is ThemeService.apply()'s alone to own
// (single-writer). It DOES carry the D4 settings-picker `ui` (OD-5 labels).
import { createThemeService } from '../../../src/framework/seams/theme';
import type { ThemeServiceInternal } from '../../../src/framework/seams/theme';
import {
	BUILTIN_DESCRIPTORS,
	createPreferenceStore,
	prefsForApp,
	registerPrefsForApp,
} from '../../../src/framework/seams/prefs';
import type { PrefDescriptor, PreferenceStore, PrefsStorage } from '../../../src/framework/seams/prefs';
import { App, Component } from '../../mocks/obsidian';

// ---------------------------------------------------------------- prefs test helpers

/** In-memory fake standing in for the injected saveData-like storage backend. */
function makeStorage(initial?: Record<string, unknown>): PrefsStorage & { savedCalls: Record<string, unknown>[] } {
	let data: Record<string, unknown> | undefined = initial;
	const savedCalls: Record<string, unknown>[] = [];
	return {
		savedCalls,
		async get() {
			return data as any;
		},
		async set(prefs: any) {
			data = prefs;
			savedCalls.push(prefs);
		},
	};
}

// The mock Component's self-referencing generics (addChild<T extends Component>)
// don't structurally satisfy the real `obsidian` package's Component type under
// tsc (a pre-existing test-harness friction — see CounterView.test.ts's
// `new Plugin(app) as any`); jest itself doesn't type-check (diagnostics: false).
// Follow the same established convention here.
function fakeOwner(): any {
	return new Component();
}

// D4 extends DsePrefs via module augmentation with real pref keys (e.g. cardStyle);
// F1's test surface only ships `theme`, so exercising reflect()'s generic
// attr-stamping mechanism needs one test-only key. Widen rather than augment the
// real DsePrefs interface, so this stays scoped to this test file.
type WidePreferenceStore = {
	get(key: string): unknown;
	set(key: string, value: unknown): Promise<void>;
	subscribe(key: string, owner: Component, cb: (value: unknown) => void): void;
	reflect(rootEl: HTMLElement, owner: Component): void;
	reflectCss(rootEl: HTMLElement, owner: Component): void;
	describe(descriptors: readonly PrefDescriptor[]): void;
};
function widen(store: PreferenceStore): WidePreferenceStore {
	return store as unknown as WidePreferenceStore;
}
function fakeDescriptor(key: string, def: unknown, attr?: string): PrefDescriptor {
	return { key, default: def, attr } as unknown as PrefDescriptor;
}

// SC-112 (Plan 23 Task 2): a css-bearing descriptor, stub `toCss` mirroring the
// real remove-on-default contract — the sentinel default value maps to `null`
// ("remove the override"), anything else passes through as-is (real descriptors
// build a font stack / snap a scale; the sentinel-vs-not distinction is what these
// tests exercise, not any particular formatting).
function fakeCssDescriptor(key: string, def: unknown, varName: string, attr?: string): PrefDescriptor {
	return {
		key,
		default: def,
		attr,
		css: { varName, toCss: (v: unknown) => (v === def ? null : String(v)) },
	} as unknown as PrefDescriptor;
}

// --------------------------------------------------------------- theme test helpers

/** Prefs-backed theme harness (D3 §2.2): a PreferenceStore over `makeStorage` plus
 *  the ThemeService built on it. `pluginOwner` stands in for the real plugin — the
 *  owner of the service's single long-lived upstream `prefs.subscribe`. */
function makeTheme(initial?: Record<string, unknown>) {
	const storage = makeStorage(initial);
	const prefs = createPreferenceStore(storage);
	const pluginOwner = fakeOwner();
	pluginOwner.load();
	const theme: ThemeServiceInternal = createThemeService(prefs, pluginOwner);
	return { storage, prefs, pluginOwner, theme };
}

/** setActive persists via a fire-and-forget prefs.set (notify lands after the async
 *  storage write) — settle those microtasks before asserting fan-out effects. */
async function flushAsync(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('D3 §2.2 (Plan 10 Task 2): PreferenceStore-backed ThemeService', () => {
	test('active reads the persisted "theme" pref — fresh prefs resolve the default "steel"', () => {
		const { theme } = makeTheme();
		expect(theme.active).toBe('steel');
	});

	test('active tracks the pref: a direct prefs.set("theme") changes active', async () => {
		const { prefs, theme } = makeTheme();
		await prefs.set('theme', 'parchment');
		expect(theme.active).toBe('parchment');
	});

	test('a theme already in storage resolves once the async load lands', async () => {
		const { theme } = makeTheme({ theme: 'parchment' });
		await flushAsync();
		expect(theme.active).toBe('parchment');
	});

	test('setActive persists through prefs.set (storage write, prefs round-trip)', async () => {
		const { storage, prefs, theme } = makeTheme();
		theme.setActive('parchment');
		await flushAsync();
		expect(prefs.get('theme')).toBe('parchment');
		expect(storage.savedCalls).toContainEqual({ theme: 'parchment' });
	});

	test('cssVar(name) maps a token name to a --dse-* custom property reference', () => {
		const { theme } = makeTheme();
		expect(theme.cssVar('accent')).toBe('var(--dse-accent)');
	});

	test('onChange fires exactly ONCE per setActive (fan-out driven only by the pref subscription)', async () => {
		const { theme } = makeTheme();
		const seen: string[] = [];
		theme.onChange((t) => seen.push(t));

		theme.setActive('parchment');
		await flushAsync();
		// A double-fire (setActive notifying listeners directly AND via the
		// prefs.subscribe fan-out) would yield ['parchment', 'parchment'].
		expect(seen).toEqual(['parchment']);
	});

	test('onChange fires when the pref changes without setActive (external prefs.set)', async () => {
		const { prefs, theme } = makeTheme();
		const seen: string[] = [];
		theme.onChange((t) => seen.push(t));

		await prefs.set('theme', 'parchment');
		expect(seen).toEqual(['parchment']);
	});

	test('onChange unsubscribe silences the listener', async () => {
		const { theme } = makeTheme();
		const seen: string[] = [];
		const unsubscribe = theme.onChange((t) => seen.push(t));

		theme.setActive('parchment');
		await flushAsync();
		expect(seen).toEqual(['parchment']);

		unsubscribe();
		theme.setActive('steel');
		await flushAsync();
		expect(seen).toEqual(['parchment']); // no further notifications after unsubscribe
	});

	test('apply(rootEl, owner) stamps data-dse-theme with the active theme immediately', () => {
		const { theme } = makeTheme();
		const root = document.createElement('div');
		theme.apply(root, fakeOwner());
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
	});

	test('apply() re-stamps data-dse-theme when the theme changes', async () => {
		const { theme } = makeTheme();
		const root = document.createElement('div');
		const owner = fakeOwner();
		owner.load();
		theme.apply(root, owner);

		theme.setActive('parchment');
		await flushAsync();
		expect(root.getAttribute('data-dse-theme')).toBe('parchment');
	});

	test('two apply()\'d roots (popout simulation, §2.5) both re-stamp on one change', async () => {
		const { theme } = makeTheme();
		// Two roots with independent owners, standing in for a main-window view and
		// a popout-window view — the fan-out is per-root, not per-document.
		const mainRoot = document.createElement('div');
		const popoutRoot = document.createElement('div');
		const mainOwner = fakeOwner();
		const popoutOwner = fakeOwner();
		mainOwner.load();
		popoutOwner.load();
		theme.apply(mainRoot, mainOwner);
		theme.apply(popoutRoot, popoutOwner);

		theme.setActive('parchment');
		await flushAsync();
		expect(mainRoot.getAttribute('data-dse-theme')).toBe('parchment');
		expect(popoutRoot.getAttribute('data-dse-theme')).toBe('parchment');
	});

	test('apply() never touches document.body (popout safety, §2.5)', async () => {
		const { theme } = makeTheme();
		const root = document.createElement('div');
		const owner = fakeOwner();
		owner.load();
		theme.apply(root, owner);
		theme.setActive('parchment');
		await flushAsync();

		expect(document.body.hasAttribute('data-dse-theme')).toBe(false);
		expect(document.documentElement.hasAttribute('data-dse-theme')).toBe(false);
	});

	test('apply() subscription auto-unsubscribes via owner.register() when owner unloads', async () => {
		const { theme } = makeTheme();
		const root = document.createElement('div');
		const owner = fakeOwner();
		owner.load();
		theme.apply(root, owner);
		expect(root.getAttribute('data-dse-theme')).toBe('steel');

		owner.unload();
		theme.setActive('parchment');
		await flushAsync();
		// Root was never re-stamped: apply()'s onChange subscription was torn down.
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
	});

	test('the upstream pref subscription is owned by the plugin: unload tears down all fan-out', async () => {
		const { prefs, pluginOwner, theme } = makeTheme();
		const seen: string[] = [];
		theme.onChange((t) => seen.push(t));

		pluginOwner.unload();
		await prefs.set('theme', 'parchment');
		// No fan-out after the plugin unloads — the single long-lived subscription died
		// with its owner (no leak past plugin lifetime).
		expect(seen).toEqual([]);
	});
});

describe('T-4 (Plan 02): PreferenceStore (F1 §3.6)', () => {
	test('get() returns the "theme" descriptor default before any persisted value loads', () => {
		const store = createPreferenceStore(makeStorage());
		expect(store.get('theme')).toBe('steel');
	});

	test('set()/get() round-trip and persist via the injected storage.set', async () => {
		const storage = makeStorage();
		const store = createPreferenceStore(storage);

		await store.set('theme', 'parchment');

		expect(store.get('theme')).toBe('parchment');
		expect(storage.savedCalls).toContainEqual({ theme: 'parchment' });
	});

	test('constructor-time load picks up a value already in storage.get() (async)', async () => {
		const storage = makeStorage({ theme: 'parchment' });
		const store = createPreferenceStore(storage);

		// The constructor kicks off an async load (get() must stay synchronous);
		// let it settle before asserting.
		await Promise.resolve();
		await Promise.resolve();

		expect(store.get('theme')).toBe('parchment');
	});

	test('subscribe(key, owner, cb) fires on change and auto-unsubscribes when owner unloads', async () => {
		const store = createPreferenceStore(makeStorage());
		const owner = fakeOwner();
		owner.load();
		const seen: string[] = [];
		store.subscribe('theme', owner, (v) => seen.push(v));

		await store.set('theme', 'parchment');
		expect(seen).toEqual(['parchment']);

		owner.unload();
		await store.set('theme', 'steel');
		expect(seen).toEqual(['parchment']); // no notification after owner unload
	});

	describe('the built-in "theme" descriptor (D3 §7.1 — contract to D4)', () => {
		test('carries NO attr (single-writer: ThemeService.apply owns data-dse-theme)', () => {
			const descriptor = BUILTIN_DESCRIPTORS.find((d) => d.key === 'theme');
			expect(descriptor).toBeDefined();
			// Truly omitted — not even `attr: undefined` — so reflect() can never
			// grow a second writer of data-dse-theme.
			expect(Object.prototype.hasOwnProperty.call(descriptor, 'attr')).toBe(false);
		});

		// SC-144 — the D4 settings-picker `ui` (the OD-5 "Match Obsidian (Legacy)" /
		// "Steel" select) is GONE: with one theme there is nothing to pick. The
		// descriptor survives so prefs.get('theme') still resolves; SettingsTab is
		// descriptor-driven, so the absent `ui` is what removes the row.
		test('carries NO ui — there is no theme picker (Steel is the only theme)', () => {
			const descriptor = BUILTIN_DESCRIPTORS.find((d) => d.key === 'theme');
			expect(descriptor?.ui).toBeUndefined();
		});
	});

	describe('reflect(rootEl, owner)', () => {
		test('the built-in "theme" descriptor has NO attr: reflect() never stamps data-dse-theme', () => {
			const store = createPreferenceStore(makeStorage());
			const root = document.createElement('div');
			store.reflect(root, fakeOwner());
			expect(root.hasAttribute('data-dse-theme')).toBe(false);
		});

		test('stamps data-dse-<attr> for an attr-bearing descriptor and updates it on change', async () => {
			const store = widen(createPreferenceStore(makeStorage()));
			store.describe([fakeDescriptor('cardStyle', 'plain', 'card-style')]);

			const root = document.createElement('div');
			const owner = fakeOwner();
			owner.load();
			store.reflect(root, owner);
			expect(root.getAttribute('data-dse-card-style')).toBe('plain');

			await store.set('cardStyle', 'ornate');
			expect(root.getAttribute('data-dse-card-style')).toBe('ornate');
		});

		test('stops updating the stamped attr once owner unloads (auto-unsubscribe)', async () => {
			const store = widen(createPreferenceStore(makeStorage()));
			store.describe([fakeDescriptor('cardStyle', 'plain', 'card-style')]);

			const root = document.createElement('div');
			const owner = fakeOwner();
			owner.load();
			store.reflect(root, owner);

			owner.unload();
			await store.set('cardStyle', 'ornate');
			expect(root.getAttribute('data-dse-card-style')).toBe('plain');
		});

		describe('css-bearing descriptors (SC-112, Plan 23 Task 2)', () => {
			test('at the default value, the inline custom property is absent (toCss → null → no setProperty)', () => {
				const store = widen(createPreferenceStore(makeStorage()));
				store.describe([fakeCssDescriptor('fontTitle', '', '--dse-font-title')]);

				const root = document.createElement('div');
				store.reflect(root, fakeOwner());

				expect(root.style.getPropertyValue('--dse-font-title')).toBe('');
				expect(root.hasAttribute('style')).toBe(false);
			});

			test('a non-default value is stamped as an inline custom property, and updates on change', async () => {
				const store = widen(createPreferenceStore(makeStorage()));
				store.describe([fakeCssDescriptor('fontTitle', '', '--dse-font-title')]);

				const root = document.createElement('div');
				const owner = fakeOwner();
				owner.load();
				store.reflect(root, owner);

				await store.set('fontTitle', 'Georgia');
				expect(root.style.getPropertyValue('--dse-font-title')).toBe('Georgia');

				await store.set('fontTitle', 'Times New Roman');
				expect(root.style.getPropertyValue('--dse-font-title')).toBe('Times New Roman');
			});

			test('setting back to the default removes the property (style attribute goes clean)', async () => {
				const store = widen(createPreferenceStore(makeStorage()));
				store.describe([fakeCssDescriptor('fontTitle', '', '--dse-font-title')]);

				const root = document.createElement('div');
				const owner = fakeOwner();
				owner.load();
				store.reflect(root, owner);

				await store.set('fontTitle', 'Georgia');
				expect(root.style.getPropertyValue('--dse-font-title')).toBe('Georgia');

				await store.set('fontTitle', '');
				expect(root.style.getPropertyValue('--dse-font-title')).toBe('');
				// removeProperty (not just setProperty('', '')) leaves an empty inline
				// style — the site's exact remove-on-default semantics
				// (settings-panel.js:80-103). Assert via cssText, not
				// hasAttribute('style'): jsdom leaves a bare `style=""` attribute behind
				// once one has ever been written (verified against jsdom directly —
				// setProperty then removeProperty yields `<div style="">`), so
				// hasAttribute('style') would report true even though nothing is set.
				expect(root.style.cssText).toBe('');
			});

			test('stops updating the css var once owner unloads (auto-unsubscribe, same lifecycle as attrs)', async () => {
				const store = widen(createPreferenceStore(makeStorage()));
				store.describe([fakeCssDescriptor('fontTitle', '', '--dse-font-title')]);

				const root = document.createElement('div');
				const owner = fakeOwner();
				owner.load();
				store.reflect(root, owner);

				owner.unload();
				await store.set('fontTitle', 'Georgia');
				expect(root.style.getPropertyValue('--dse-font-title')).toBe('');
			});

			test('attr and css are independent: a descriptor carrying both gets both stamped', () => {
				const store = widen(createPreferenceStore(makeStorage()));
				store.describe([fakeCssDescriptor('fontTitle', '', '--dse-font-title', 'font-title')]);

				const root = document.createElement('div');
				store.reflect(root, fakeOwner());

				// Default: attr is always stamped (String('') === ''); css is absent
				// (toCss('') === null).
				expect(root.getAttribute('data-dse-font-title')).toBe('');
				expect(root.style.getPropertyValue('--dse-font-title')).toBe('');
			});
		});
	});

	describe('reflectCss(rootEl, owner) — SC-112 (Plan 23 Task 2): the css-only twin of reflect()', () => {
		test('stamps css-bearing descriptors but does NOT stamp attr-only descriptors', () => {
			const store = widen(createPreferenceStore(makeStorage()));
			store.describe([
				fakeDescriptor('cardStyle', 'plain', 'card-style'), // attr-only
				fakeCssDescriptor('fontTitle', '', '--dse-font-title'), // css-only
			]);

			const root = document.createElement('div');
			store.reflectCss(root, fakeOwner());

			expect(root.hasAttribute('data-dse-card-style')).toBe(false);
			expect(root.hasAttribute('style')).toBe(false); // css descriptor at default → no-op
		});

		test('for a descriptor carrying BOTH attr and css, reflectCss stamps only the css var, never the attr', async () => {
			const store = widen(createPreferenceStore(makeStorage()));
			store.describe([fakeCssDescriptor('fontTitle', '', '--dse-font-title', 'font-title')]);

			const root = document.createElement('div');
			const owner = fakeOwner();
			owner.load();
			store.reflectCss(root, owner);

			await store.set('fontTitle', 'Georgia');
			expect(root.style.getPropertyValue('--dse-font-title')).toBe('Georgia');
			expect(root.hasAttribute('data-dse-font-title')).toBe(false);
		});

		test('re-stamps on change and stops once owner unloads (same subscription lifecycle as reflect())', async () => {
			const store = widen(createPreferenceStore(makeStorage()));
			store.describe([fakeCssDescriptor('fontTitle', '', '--dse-font-title')]);

			const root = document.createElement('div');
			const owner = fakeOwner();
			owner.load();
			store.reflectCss(root, owner);

			await store.set('fontTitle', 'Georgia');
			expect(root.style.getPropertyValue('--dse-font-title')).toBe('Georgia');

			owner.unload();
			await store.set('fontTitle', 'Times New Roman');
			expect(root.style.getPropertyValue('--dse-font-title')).toBe('Georgia'); // frozen at unload
		});
	});
});

describe('SC-112 (Plan 23 Task 2): registerPrefsForApp / prefsForApp — the WeakMap<App, PreferenceStore> registry', () => {
	// Mirrors theme.ts's themeServiceByApp registry test coverage pattern
	// (test/dom/kit/managedModal.test.ts's "theme stamping" describe block) — same
	// registry shape, one level down the seam.

	test('prefsForApp returns undefined for an App that never registered a store', () => {
		const app = new App() as any;
		expect(prefsForApp(app)).toBeUndefined();
	});

	test('registerPrefsForApp registers the store; prefsForApp retrieves the SAME instance', () => {
		const app = new App() as any;
		const store = createPreferenceStore(makeStorage());

		registerPrefsForApp(app, store);

		expect(prefsForApp(app)).toBe(store);
	});

	test('re-registering the same App overwrites the prior entry (last write wins, safe on reload)', () => {
		const app = new App() as any;
		const first = createPreferenceStore(makeStorage());
		const second = createPreferenceStore(makeStorage());

		registerPrefsForApp(app, first);
		registerPrefsForApp(app, second);

		expect(prefsForApp(app)).toBe(second);
	});

	test('two distinct Apps get independently registered stores', () => {
		const appA = new App() as any;
		const appB = new App() as any;
		const storeA = createPreferenceStore(makeStorage());
		const storeB = createPreferenceStore(makeStorage());

		registerPrefsForApp(appA, storeA);
		registerPrefsForApp(appB, storeB);

		expect(prefsForApp(appA)).toBe(storeA);
		expect(prefsForApp(appB)).toBe(storeB);
	});
});
