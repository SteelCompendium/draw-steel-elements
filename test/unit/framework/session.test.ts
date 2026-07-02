import { createSessionStore } from '../../../src/framework/session';
import type { SessionStore } from '../../../src/framework/session';

// F1 §4.3: plugin-scoped SessionStore. Best-effort in-memory store for session UI state
// (tab/collapse/selection), keyed by (blockKey, slot). Cleared on plugin unload.
describe('T-2 (Plan 02): SessionStore (F1 §4.3)', () => {
	let store: SessionStore;

	beforeEach(() => {
		store = createSessionStore();
	});

	test('set then get returns the value', () => {
		store.set('block-1', 'tab', 'settings');
		expect(store.get('block-1', 'tab')).toBe('settings');
	});

	test('different blockKeys are isolated', () => {
		store.set('block-1', 'tab', 'settings');
		store.set('block-2', 'tab', 'overview');
		expect(store.get('block-1', 'tab')).toBe('settings');
		expect(store.get('block-2', 'tab')).toBe('overview');
	});

	test('different slots are isolated', () => {
		store.set('block-1', 'tab', 'settings');
		store.set('block-1', 'collapse', true);
		expect(store.get('block-1', 'tab')).toBe('settings');
		expect(store.get('block-1', 'collapse')).toBe(true);
	});

	test('missing key/slot returns undefined', () => {
		expect(store.get('missing', 'slot')).toBeUndefined();
		store.set('block-1', 'tab', 'value');
		expect(store.get('block-1', 'missing-slot')).toBeUndefined();
	});

	test('typed round-trip works', () => {
		const data = { x: 1, y: 2 };
		store.set<typeof data>('block-1', 'state', data);
		const retrieved = store.get<typeof data>('block-1', 'state');
		expect(retrieved).toEqual(data);
	});

	test('clear() empties the store', () => {
		store.set('block-1', 'tab', 'value');
		store.set('block-2', 'state', { x: 1 });
		store.clear();
		expect(store.get('block-1', 'tab')).toBeUndefined();
		expect(store.get('block-2', 'state')).toBeUndefined();
	});
});
