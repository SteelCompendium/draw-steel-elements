// Plan 23 Task 6 (SC-112) — end-to-end smoke via the seam: the REAL catalog
// descriptors through the REAL PreferenceStore reflection machinery, pinning the
// whole chain descriptor → reflect() → inline custom property on a registered
// root. (seams.test.ts covers the mechanism with fake descriptors; this is the
// one test proving the shipped font descriptors ride it correctly.)
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { Component } from '../../mocks/obsidian';

function makeStore() {
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const store = createPreferenceStore(storage);
	store.describe(DSE_PREF_DESCRIPTORS);
	return store;
}

test('set(fontTitle) stamps the inline --dse-font-title on a reflected root; back to \'\' removes it', async () => {
	const store = makeStore();
	const root = document.createElement('div');
	// mock Component vs. real obsidian Component: established `any` convention
	// (seams.test.ts fakeOwner()).
	const owner: any = new Component();
	owner.load();
	store.reflect(root, owner);

	// Defaults are INERT: no font slot leaves an inline property behind.
	for (const varName of [
		'--dse-font-title', '--dse-font-body', '--dse-font-controls',
		'--dse-font-card-body', '--dse-font-label', '--dse-font-mono',
	]) {
		expect(root.style.getPropertyValue(varName)).toBe('');
	}

	await store.set('fontTitle', 'Georgia');
	expect(root.style.getPropertyValue('--dse-font-title')).toBe('"Georgia", var(--font-text)');
	// Sibling slots stay untouched — the slots are independent.
	expect(root.style.getPropertyValue('--dse-font-body')).toBe('');

	await store.set('fontTitle', '');
	expect(root.style.getPropertyValue('--dse-font-title')).toBe('');
});

// SC-112 Task 7: the size-scale descriptors ride the same css-reflection chain.
test('set(textScale/cardScale) stamps snapped inline scale vars; back to 1 removes them', async () => {
	const store = makeStore();
	const root = document.createElement('div');
	const owner: any = new Component();
	owner.load();
	store.reflect(root, owner);

	// Defaults are INERT — no inline scale override at 1 (the :root default rules).
	expect(root.style.getPropertyValue('--dse-text-scale')).toBe('');
	expect(root.style.getPropertyValue('--dse-card-scale')).toBe('');

	await store.set('textScale', 1.4);
	expect(root.style.getPropertyValue('--dse-text-scale')).toBe('1.4');
	expect(root.style.getPropertyValue('--dse-card-scale')).toBe(''); // independent

	// Off-step / out-of-range values are SNAPPED before stamping (site snap()).
	await store.set('cardScale', 0.79);
	expect(root.style.getPropertyValue('--dse-card-scale')).toBe('0.8');
	await store.set('cardScale', 99);
	expect(root.style.getPropertyValue('--dse-card-scale')).toBe('1.2');

	await store.set('textScale', 1);
	await store.set('cardScale', 1);
	expect(root.style.getPropertyValue('--dse-text-scale')).toBe('');
	expect(root.style.getPropertyValue('--dse-card-scale')).toBe('');
});
