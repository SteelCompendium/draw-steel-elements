// Plan 13 Task 1 (D4 §5) — real saveData-backed preference storage: the sparse
// prefs slice on DSESettings, the v0→v1 migration, the debounced storage adapter,
// and the store's sparse/notify-first behavior. Replaces the F1-era no-op
// PrefsStorage stub in initializeElementFrameworkV2 (main.ts).
import { DEFAULT_SETTINGS, migrateSettings } from '@model/Settings';
import type { DSESettings } from '@model/Settings';
import { createSaveDataPrefsStorage } from 'main';
import { createPreferenceStore, BUILTIN_DESCRIPTORS } from '../../../src/framework/seams/prefs';
import type { PrefsStorage, DsePrefs } from '../../../src/framework/seams/prefs';
import { createThemeService } from '../../../src/framework/seams/theme';
import { Component } from '../../mocks/obsidian';
import { flushAsync } from '../../mocks/obsidian';

describe('D4 §5.3 — migrateSettings (v0 → v1, additive & lossless)', () => {
	test('a v0 on-disk object carries its three fields over and gains prefs {} + settingsVersion 1', () => {
		const v0 = {
			compendiumReleaseTag: 'v2.0.0',
			compendiumDestinationDirectory: 'My Compendium',
			defaultImagePath: 'img/tok.png',
		};
		const s = migrateSettings(v0);
		expect(s.compendiumReleaseTag).toBe('v2.0.0');
		expect(s.compendiumDestinationDirectory).toBe('My Compendium');
		expect(s.defaultImagePath).toBe('img/tok.png');
		expect(s.prefs).toEqual({});
		expect(s.settingsVersion).toBe(1);
	});

	test('null/undefined raw (fresh install) yields DEFAULT_SETTINGS shape', () => {
		const s = migrateSettings(undefined);
		expect(s).toEqual(DEFAULT_SETTINGS);
	});

	test('never shares DEFAULT_SETTINGS.prefs by reference (mutation safety)', () => {
		const a = migrateSettings(undefined);
		const b = migrateSettings(undefined);
		(a.prefs as Record<string, unknown>).theme = 'legacy';
		expect(b.prefs).toEqual({});
		expect(DEFAULT_SETTINGS.prefs).toEqual({});
	});

	test('an already-v1 object with stored prefs passes through (cloned, not shared)', () => {
		const v1 = { ...DEFAULT_SETTINGS, settingsVersion: 1, prefs: { theme: 'legacy' } };
		const s = migrateSettings(v1);
		expect(s.prefs).toEqual({ theme: 'legacy' });
		expect(s.prefs).not.toBe(v1.prefs);
	});
});

describe('D4 §5.2 — createSaveDataPrefsStorage (debounced saveData adapter)', () => {
	function makePlugin() {
		const settings: DSESettings = migrateSettings(undefined);
		return { settings, saveSettings: jest.fn(async () => {}) };
	}

	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	test('set() updates settings.prefs IMMEDIATELY but debounces the disk write (~250ms trailing)', async () => {
		const plugin = makePlugin();
		const storage = createSaveDataPrefsStorage(plugin);
		await storage.set({ theme: 'legacy' } as Partial<DsePrefs>);
		expect(plugin.settings.prefs).toEqual({ theme: 'legacy' });
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		jest.advanceTimersByTime(250);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	});

	test('a burst of set() calls collapses into ONE saveSettings (preset batch-write contract)', async () => {
		const plugin = makePlugin();
		const storage = createSaveDataPrefsStorage(plugin);
		await storage.set({ theme: 'legacy' } as Partial<DsePrefs>);
		jest.advanceTimersByTime(100);
		await storage.set({} as Partial<DsePrefs>);
		jest.advanceTimersByTime(100);
		await storage.set({ theme: 'legacy' } as Partial<DsePrefs>);
		jest.advanceTimersByTime(250);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	});

	test('flush() writes a pending save NOW (onunload contract); no pending → no write', () => {
		const plugin = makePlugin();
		const storage = createSaveDataPrefsStorage(plugin);
		storage.flush();
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		void storage.set({ theme: 'legacy' } as Partial<DsePrefs>);
		storage.flush();
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		jest.advanceTimersByTime(500); // the flushed timer must not fire a second write
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	});

	test('get() returns the live prefs slice', async () => {
		const plugin = makePlugin();
		plugin.settings.prefs = { theme: 'legacy' } as Partial<DsePrefs>;
		const storage = createSaveDataPrefsStorage(plugin);
		await expect(storage.get()).resolves.toEqual({ theme: 'legacy' });
	});
});

describe('D4 §5.2 / OD-D4-4 — the store persists SPARSELY and notifies before disk', () => {
	function makeRecordingStorage() {
		const writes: Partial<DsePrefs>[] = [];
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => (release = resolve));
		const storage: PrefsStorage = {
			get: async () => undefined,
			set: async (prefs) => {
				writes.push(prefs);
				await gate; // holds the disk write open so notify-order is observable
			},
		};
		return { storage, writes, release };
	}

	test('set(key, non-default) persists ONLY that key; set(key, default) removes it from the snapshot', async () => {
		const { storage, writes, release } = makeRecordingStorage();
		release();
		const store = createPreferenceStore(storage);
		await store.set('theme', 'legacy');
		expect(writes[writes.length - 1]).toEqual({ theme: 'legacy' });
		await store.set('theme', BUILTIN_DESCRIPTORS[0].default as DsePrefs['theme']);
		expect(writes[writes.length - 1]).toEqual({}); // back to default ⇒ sparse snapshot drops it
	});

	test('subscribers are notified BEFORE the storage write resolves (UI never waits on disk)', async () => {
		const { storage } = makeRecordingStorage(); // gate never released — write hangs
		const store = createPreferenceStore(storage);
		// D4 brief-vs-repo adaptation: every other suite feeds a mock owner into
		// Component-typed params via an `any`-typed local (see e.g.
		// seams.test.ts's fakeOwner()) — the mock Component class here is
		// structurally narrower than the real obsidian.Component that
		// PreferenceStore.subscribe() is typed against, so a bare `new
		// Component()` fails tsc (though ts-jest, diagnostics off, would
		// happily run it). Same runtime object, same test intent.
		const owner: any = new Component();
		owner.load();
		const seen: string[] = [];
		store.subscribe('theme', owner, (v) => seen.push(v as string));
		void store.set('theme', 'legacy');
		await flushAsync(1);
		expect(seen).toEqual(['legacy']); // notified while storage.set is still pending
	});
});

// Supplemental coverage (not in the D4 brief's Step 1 draft, added on self-review):
// closes the reconciliation deltas' ".catch hardening" clause by actually exercising
// each rejection path added in Steps 3-5, rather than only asserting the happy path.
describe('D4 — a rejection at any persistence boundary is caught, never left to vanish silently', () => {
	afterEach(() => jest.restoreAllMocks());

	test('createSaveDataPrefsStorage: a rejecting saveSettings is caught via console.error, not thrown', async () => {
		const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		const plugin = {
			settings: migrateSettings(undefined),
			saveSettings: jest.fn(async () => {
				throw new Error('disk full');
			}),
		};
		const storage = createSaveDataPrefsStorage(plugin, 0);
		await storage.set({ theme: 'legacy' } as Partial<DsePrefs>);
		storage.flush();
		await flushAsync(3);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledWith(
			'Draw Steel Elements: failed to save preferences',
			expect.any(Error),
		);
	});

	test('DsePreferenceStore: a rejecting storage.get() at construction is caught via console.error, not thrown', async () => {
		const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		const storage: PrefsStorage = {
			get: async () => {
				throw new Error('vault read failed');
			},
			set: async () => {},
		};
		expect(() => createPreferenceStore(storage)).not.toThrow();
		await flushAsync(3);
		expect(errorSpy).toHaveBeenCalledWith(
			'Draw Steel Elements: failed to load preferences',
			expect.any(Error),
		);
	});

	test('ThemeService.setActive: a rejecting prefs.set() is caught via console.error, not thrown', async () => {
		const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		const storage: PrefsStorage = {
			get: async () => undefined,
			set: async () => {
				throw new Error('disk full');
			},
		};
		const prefs = createPreferenceStore(storage);
		const owner: any = new Component();
		owner.load();
		const theme = createThemeService(prefs, owner);
		expect(() => theme.setActive('legacy')).not.toThrow();
		await flushAsync(3);
		expect(errorSpy).toHaveBeenCalledWith(
			'Draw Steel Elements: failed to persist theme preference',
			expect.any(Error),
		);
	});
});
