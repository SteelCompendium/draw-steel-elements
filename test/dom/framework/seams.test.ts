// T-4 (Plan 02): theme + prefs seam default implementations (F1 §3.5/§3.6).
//
// F1 ships the machinery + a near-empty surface for both seams:
//   - ThemeService: `active` defaults to a constant ("steel"); D3 finalizes the
//     DseThemeId value space and the real token sheet.
//   - PreferenceStore: storage + reflection machinery, with only the built-in
//     `theme` pref described; D4 extends DsePrefs (module augmentation) and
//     registers its own descriptors via describe().
//
// Critical cross-spec contract (D3 + D4 independently specified this): the
// built-in `theme` PrefDescriptor carries NO `attr`, so PreferenceStore.reflect()
// never stamps data-dse-theme — that attribute is ThemeService.apply()'s alone to
// own. See "theme descriptor has no attr" below.
import { createThemeService } from '../../../src/framework/seams/theme';
import type { ThemeServiceInternal } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefDescriptor, PreferenceStore, PrefsStorage } from '../../../src/framework/seams/prefs';
import { Component } from '../../mocks/obsidian';

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
	describe(descriptors: readonly PrefDescriptor[]): void;
};
function widen(store: PreferenceStore): WidePreferenceStore {
	return store as unknown as WidePreferenceStore;
}
function fakeDescriptor(key: string, def: unknown, attr?: string): PrefDescriptor {
	return { key, default: def, attr } as unknown as PrefDescriptor;
}

describe('T-4 (Plan 02): ThemeService (F1 §3.5)', () => {
	test('apply(rootEl, owner) stamps data-dse-theme with the active theme', () => {
		const theme = createThemeService();
		const root = document.createElement('div');
		theme.apply(root, fakeOwner());
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
	});

	test('cssVar(name) maps a token name to a --dse-* custom property reference', () => {
		const theme = createThemeService();
		expect(theme.cssVar('accent')).toBe('var(--dse-accent)');
	});

	test('active defaults to the "steel" constant', () => {
		const theme = createThemeService();
		expect(theme.active).toBe('steel');
	});

	test('onChange(cb) fires on change and the returned unsubscribe silences it', () => {
		const theme = createThemeService() as ThemeServiceInternal;
		const seen: string[] = [];
		const unsubscribe = theme.onChange((t) => seen.push(t));

		theme.setActive('legacy');
		expect(seen).toEqual(['legacy']);

		unsubscribe();
		theme.setActive('steel');
		expect(seen).toEqual(['legacy']); // no further notifications after unsubscribe
	});

	test('apply() re-stamps data-dse-theme on change, for the lifetime of owner', () => {
		const theme = createThemeService() as ThemeServiceInternal;
		const root = document.createElement('div');
		const owner = fakeOwner();
		owner.load();
		theme.apply(root, owner);

		theme.setActive('legacy');
		expect(root.getAttribute('data-dse-theme')).toBe('legacy');
	});

	test('apply() subscription auto-unsubscribes via owner.register() when owner unloads', () => {
		const theme = createThemeService() as ThemeServiceInternal;
		const root = document.createElement('div');
		const owner = fakeOwner();
		owner.load();
		theme.apply(root, owner);
		expect(root.getAttribute('data-dse-theme')).toBe('steel');

		owner.unload();
		theme.setActive('legacy');
		// Root was never re-stamped: apply()'s onChange subscription was torn down.
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
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

		await store.set('theme', 'legacy');

		expect(store.get('theme')).toBe('legacy');
		expect(storage.savedCalls).toContainEqual({ theme: 'legacy' });
	});

	test('constructor-time load picks up a value already in storage.get() (async)', async () => {
		const storage = makeStorage({ theme: 'legacy' });
		const store = createPreferenceStore(storage);

		// The constructor kicks off an async load (get() must stay synchronous);
		// let it settle before asserting.
		await Promise.resolve();
		await Promise.resolve();

		expect(store.get('theme')).toBe('legacy');
	});

	test('subscribe(key, owner, cb) fires on change and auto-unsubscribes when owner unloads', async () => {
		const store = createPreferenceStore(makeStorage());
		const owner = fakeOwner();
		owner.load();
		const seen: string[] = [];
		store.subscribe('theme', owner, (v) => seen.push(v));

		await store.set('theme', 'legacy');
		expect(seen).toEqual(['legacy']);

		owner.unload();
		await store.set('theme', 'steel');
		expect(seen).toEqual(['legacy']); // no notification after owner unload
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
	});
});
