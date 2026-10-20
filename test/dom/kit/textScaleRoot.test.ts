// SC-422 — stampTextScaleRoot: the one way a piece of plugin chrome that sits outside every
// element root and DseModal becomes a root the Small / Large / Control text-size prefs reach.
// The CSS half (the `.dse-fs-root` member of the token rule) is pinned source-side by
// test/unit/build/scaleTokenScope.test.ts; the real-browser resolution by the `text scale
// OK` / `text scale once OK` gates in `npm run shots`. This pins the TS half: the class, the
// three stamps, the live updates, and the release when the owner unloads.
import { stampTextScaleRoot, TEXT_SCALE_ROOT_CLS } from '@/framework/kit/textScaleRoot';
import { createPreferenceStore } from '@/framework/seams/prefs';
import type { PreferenceStore } from '@/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '@/prefs/catalog';
import { Component } from '../../mocks/obsidian';

const VARS = ['--dse-fs-small-scale', '--dse-fs-large-scale', '--dse-fs-control-scale'] as const;

function makeStore(): PreferenceStore {
	const store = createPreferenceStore({ get: async () => undefined, set: async () => {} });
	store.describe(DSE_PREF_DESCRIPTORS);
	return store;
}

// `any`: the jest mock Component does not structurally satisfy the real ambient obsidian type (managedModal.test.ts does the same).
function loadedOwner(): any {
	const owner = new Component();
	owner.load();
	return owner;
}

const stampsOf = (el: HTMLElement) => VARS.map((v) => el.style.getPropertyValue(v));

describe('SC-422: stampTextScaleRoot', () => {
	test('marks the element a chrome root with the class the token rule selects', () => {
		const el = document.createElement('div');
		stampTextScaleRoot(el, makeStore(), loadedOwner());
		expect(TEXT_SCALE_ROOT_CLS).toBe('dse-fs-root');
		expect(el.classList.contains('dse-fs-root')).toBe(true);
	});

	test('stamps nothing at default prefs (remove-on-default), then all three knobs as they change', async () => {
		const el = document.createElement('div');
		const prefs = makeStore();
		stampTextScaleRoot(el, prefs, loadedOwner());
		expect(stampsOf(el)).toEqual(['', '', '']);
		await prefs.set('smallTextScale', 1.2);
		await prefs.set('largeTextScale', 0.8);
		await prefs.set('controlTextScale', 1.2);
		expect(stampsOf(el)).toEqual(['1.2', '0.8', '1.2']);
		await prefs.set('smallTextScale', 1);
		expect(stampsOf(el)).toEqual(['', '0.8', '1.2']);
	});

	test('the owner unloading releases the subscription: a later change no longer writes', async () => {
		const el = document.createElement('div');
		const prefs = makeStore();
		const owner = loadedOwner();
		stampTextScaleRoot(el, prefs, owner);
		await prefs.set('smallTextScale', 1.2);
		owner.unload();
		await prefs.set('smallTextScale', 0.8);
		expect(el.style.getPropertyValue('--dse-fs-small-scale')).toBe('1.2');
	});

	test('with no prefs store (a bare context) it still adds the class and stamps nothing', () => {
		const el = document.createElement('div');
		stampTextScaleRoot(el, undefined, loadedOwner());
		expect(el.classList.contains('dse-fs-root')).toBe(true);
		expect(stampsOf(el)).toEqual(['', '', '']);
	});
});
