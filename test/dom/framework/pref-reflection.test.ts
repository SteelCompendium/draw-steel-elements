// Plan 13 Task 3 (D4 §1.1/§3) — presentation prefs are ATTRIBUTE-DRIVEN: the
// pipeline reflects catalog attrs onto every element root at first paint and
// re-stamps live on prefs.set — CSS reflows, no re-render. Also pins the CSS
// hooks themselves (grep-pins, theme-print.test.ts style) so a selector rename
// breaks CI, not a user's vault.
import * as fs from 'fs';
import * as path from 'path';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { Component, flushAsync } from '../../mocks/obsidian';

const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

function makeStore() {
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const store = createPreferenceStore(storage);
	store.describe(DSE_PREF_DESCRIPTORS);
	return store;
}

test('reflect() stamps every catalog presentation default on a root (first-paint contract)', () => {
	const store = makeStore();
	const owner: any = new Component();
	owner.load();
	const root = document.createElement('div');
	store.reflect(root, owner);
	expect(root.getAttribute('data-dse-density')).toBe('comfortable');
	expect(root.getAttribute('data-dse-sb-featstyle')).toBe('card');
	expect(root.getAttribute('data-dse-sb-columns')).toBe('single');
	expect(root.getAttribute('data-dse-sb-stats')).toBe('grid');
	expect(root.getAttribute('data-dse-reduce-motion')).toBe('false');
	expect(root.getAttribute('data-dse-print')).toBe('off');
	expect(root.getAttribute('data-dse-portraits')).toBe('on');
	expect(root.hasAttribute('data-dse-theme')).toBe(false); // ThemeService's attribute, never reflect's
});

test('a live prefs.set re-stamps every reflected root IN PLACE (reflow, not re-render)', async () => {
	const store = makeStore();
	const owner: any = new Component();
	owner.load();
	const a = document.createElement('div');
	const b = document.createElement('div');
	store.reflect(a, owner);
	store.reflect(b, owner);
	await store.set('sbDensity', 'compact');
	await flushAsync(1);
	expect(a.getAttribute('data-dse-density')).toBe('compact');
	expect(b.getAttribute('data-dse-density')).toBe('compact');
});

test('styles-source.css keys the statblock pref hooks off the ROOT attributes (built vocabulary)', () => {
	expect(sheet).toMatch(/\[data-dse-element='statblock'\]\[data-dse-density='compact'\] \.dse-sb/);
	expect(sheet).toMatch(/\[data-dse-element='statblock'\]\[data-dse-sb-featstyle='flat'\]/);
	expect(sheet).toMatch(/\[data-dse-element='statblock'\]\[data-dse-sb-columns='wide'\] \.dse-sb > \.dse-feature__nested/);
	expect(sheet).toMatch(/\[data-dse-element='statblock'\]\[data-dse-sb-stats='ledger'\] \.dse-sb__item/);
	expect(sheet).toMatch(/\[data-dse-element\]\[data-dse-reduce-motion='true'\]/);
	// the OLD card-scoped selectors must be gone (they'd shadow the reflected root):
	expect(sheet).not.toMatch(/\.dse-sb\[data-dse-density/);
	expect(sheet).not.toMatch(/\.dse-sb\[data-dse-sb-featstyle/);
});

test('defaults are CSS no-ops: no selector exists for any catalog default value (legacy fidelity)', () => {
	expect(sheet).not.toMatch(/data-dse-density='comfortable'/);
	expect(sheet).not.toMatch(/data-dse-sb-featstyle='card'/);
	expect(sheet).not.toMatch(/data-dse-sb-columns='single'/);
	expect(sheet).not.toMatch(/data-dse-sb-stats='grid'/);
});
