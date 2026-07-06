// Plan 08 Task 3 (D2 §2.4) — kit/tabs: accessible tablist. Full tablist/tab/tabpanel
// role set with aria-selected + ROVING tabindex (only the selected tab is 0), arrow-key
// + Home/End keyboard selection (selection follows focus, wrapping), exactly one
// visible panel (`hidden` attr on the rest), and session-persisted selection via the
// same SessionStore accessor pattern as collapsible (no cx import — kit⊥elements).
import { tabs } from '../../../src/framework/kit/tabs';
import { Component } from '../../mocks/obsidian';
import { createSessionStore } from '../../../src/framework/session';

function fakeOwner(): any {
	return new Component();
}

function keydown(el: HTMLElement, key: string): boolean {
	return el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const THREE_TABS = [
	{ id: 'argument', label: 'Make an Argument' },
	{ id: 'learn', label: 'Learn Motivation/Pitfall' },
	{ id: 'notes', label: 'Notes', icon: 'info' },
];

function mount(over: Record<string, unknown> = {}, owner = fakeOwner()) {
	const parent = document.createElement('div');
	document.body.appendChild(parent); // needed for focus assertions
	const onSelect = jest.fn();
	const handle = tabs(
		parent,
		{ tabs: THREE_TABS, selected: 'argument', onSelect, ...over } as any,
		owner,
	);
	const tabEls = Array.from(handle.rootEl.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
	const panelEls = Array.from(handle.rootEl.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
	return { parent, handle, tabEls, panelEls, onSelect, owner };
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('Plan 08 Task 3: kit/tabs (D2 §2.4)', () => {
	describe('structure + a11y wiring', () => {
		test('renders role="tablist" of REAL <button role="tab">s and one tabpanel per tab', () => {
			const { handle, tabEls, panelEls } = mount();

			expect(handle.rootEl.hasClass('dse-tabs')).toBe(true);
			const tablist = handle.rootEl.querySelector('[role="tablist"]')!;
			expect(tablist).not.toBeNull();

			expect(tabEls).toHaveLength(3);
			for (const tabEl of tabEls) {
				expect(tabEl).toBeInstanceOf(HTMLButtonElement);
				expect(tabEl.getAttribute('type')).toBe('button');
				expect(tabEl.hasClass('dse-tabs__tab')).toBe(true);
				expect(tablist.contains(tabEl)).toBe(true);
			}
			expect(tabEls.map((t) => t.textContent)).toEqual([
				'Make an Argument',
				'Learn Motivation/Pitfall',
				'Notes',
			]);

			expect(panelEls).toHaveLength(3);
			for (const panelEl of panelEls) {
				expect(panelEl.hasClass('dse-tabs__panel')).toBe(true);
				expect(tablist.contains(panelEl)).toBe(false); // panels live OUTSIDE the tablist
			}
		});

		test('tab↔panel cross-references: aria-controls → panel id, aria-labelledby → tab id', () => {
			const { tabEls, panelEls } = mount();
			for (let i = 0; i < 3; i++) {
				expect(tabEls[i].id).not.toBe('');
				expect(panelEls[i].id).not.toBe('');
				expect(tabEls[i].getAttribute('aria-controls')).toBe(panelEls[i].id);
				expect(panelEls[i].getAttribute('aria-labelledby')).toBe(tabEls[i].id);
			}
		});

		test('two tabs mounts get DISTINCT ids (no cross-widget aria collisions)', () => {
			const a = mount();
			const b = mount();
			expect(a.tabEls[0].id).not.toBe(b.tabEls[0].id);
		});

		test('a tab with an icon renders a setIcon glyph beside its label', () => {
			const { tabEls } = mount();
			const icon = tabEls[2].querySelector('[data-icon="info"]');
			expect(icon).not.toBeNull();
		});
	});

	describe('selection state — aria-selected + ROVING tabindex + one visible panel', () => {
		test('initially: selected tab is aria-selected="true" tabindex="0"; the others "-1"; only its panel shows', () => {
			const { tabEls, panelEls } = mount();

			expect(tabEls[0].getAttribute('aria-selected')).toBe('true');
			expect(tabEls[0].getAttribute('tabindex')).toBe('0');
			expect(panelEls[0].hasAttribute('hidden')).toBe(false);

			for (const i of [1, 2]) {
				expect(tabEls[i].getAttribute('aria-selected')).toBe('false');
				expect(tabEls[i].getAttribute('tabindex')).toBe('-1');
				expect(panelEls[i].hasAttribute('hidden')).toBe(true);
			}
		});

		test('clicking a tab moves selection, roves tabindex, swaps the visible panel, fires onSelect once', () => {
			const { tabEls, panelEls, onSelect } = mount();

			tabEls[1].click();

			expect(onSelect).toHaveBeenCalledTimes(1);
			expect(onSelect).toHaveBeenCalledWith('learn');
			expect(tabEls[1].getAttribute('aria-selected')).toBe('true');
			expect(tabEls[1].getAttribute('tabindex')).toBe('0');
			expect(tabEls[0].getAttribute('aria-selected')).toBe('false');
			expect(tabEls[0].getAttribute('tabindex')).toBe('-1');
			expect(panelEls[1].hasAttribute('hidden')).toBe(false);
			expect(panelEls[0].hasAttribute('hidden')).toBe(true);
			expect(panelEls[2].hasAttribute('hidden')).toBe(true);
			// Attribute-driven visibility — never inline display.
			expect(panelEls[0].getAttribute('style')).toBeNull();
		});

		test('clicking the ALREADY-selected tab is a no-op (no onSelect)', () => {
			const { tabEls, onSelect } = mount();
			tabEls[0].click();
			expect(onSelect).not.toHaveBeenCalled();
		});
	});

	describe('keyboard — ArrowLeft/ArrowRight (wrapping) + Home/End move selection AND focus (§4.4)', () => {
		test('ArrowRight selects the next tab and focuses it', () => {
			const { tabEls, onSelect } = mount();
			tabEls[0].focus();

			keydown(tabEls[0], 'ArrowRight');

			expect(onSelect).toHaveBeenLastCalledWith('learn');
			expect(tabEls[1].getAttribute('aria-selected')).toBe('true');
			expect(document.activeElement).toBe(tabEls[1]);
		});

		test('ArrowRight on the LAST tab wraps to the first', () => {
			const { handle, tabEls, onSelect } = mount({ selected: 'notes' });
			expect(tabEls[2].getAttribute('aria-selected')).toBe('true');
			void handle;

			keydown(tabEls[2], 'ArrowRight');

			expect(onSelect).toHaveBeenLastCalledWith('argument');
			expect(tabEls[0].getAttribute('aria-selected')).toBe('true');
			expect(document.activeElement).toBe(tabEls[0]);
		});

		test('ArrowLeft selects the previous tab; on the FIRST tab it wraps to the last', () => {
			const { tabEls, onSelect } = mount();

			keydown(tabEls[0], 'ArrowLeft');

			expect(onSelect).toHaveBeenLastCalledWith('notes');
			expect(tabEls[2].getAttribute('aria-selected')).toBe('true');
			expect(document.activeElement).toBe(tabEls[2]);
		});

		test('Home selects the first tab; End the last', () => {
			const { tabEls, onSelect } = mount({ selected: 'learn' });

			keydown(tabEls[1], 'End');
			expect(onSelect).toHaveBeenLastCalledWith('notes');
			expect(tabEls[2].getAttribute('aria-selected')).toBe('true');
			expect(document.activeElement).toBe(tabEls[2]);

			keydown(tabEls[2], 'Home');
			expect(onSelect).toHaveBeenLastCalledWith('argument');
			expect(tabEls[0].getAttribute('aria-selected')).toBe('true');
			expect(document.activeElement).toBe(tabEls[0]);
		});

		test('handled keys are preventDefault-ed; other keys pass through untouched', () => {
			const { tabEls, onSelect } = mount();
			expect(keydown(tabEls[0], 'ArrowRight')).toBe(false); // canceled
			expect(keydown(tabEls[1], 'a')).toBe(true); // not canceled
			expect(onSelect).toHaveBeenCalledTimes(1);
		});
	});

	describe('Handle: select(id) / getSelected — programmatic, in place, silent', () => {
		test('select(id) updates the DOM without firing onSelect and without stealing focus', () => {
			const { handle, tabEls, panelEls, onSelect } = mount();
			const focusBefore = document.activeElement;

			handle.select('notes');

			expect(handle.getSelected()).toBe('notes');
			expect(tabEls[2].getAttribute('aria-selected')).toBe('true');
			expect(tabEls[2].getAttribute('tabindex')).toBe('0');
			expect(panelEls[2].hasAttribute('hidden')).toBe(false);
			expect(panelEls[0].hasAttribute('hidden')).toBe(true);
			expect(onSelect).not.toHaveBeenCalled();
			expect(document.activeElement).toBe(focusBefore);
		});

		test('select() with an unknown id is a safe no-op', () => {
			const { handle, tabEls } = mount();
			handle.select('does-not-exist');
			expect(handle.getSelected()).toBe('argument');
			expect(tabEls[0].getAttribute('aria-selected')).toBe('true');
		});

		test('panels are exposed by tab id so callers can fill them', () => {
			const { handle, panelEls } = mount();
			expect(handle.panels['argument']).toBe(panelEls[0]);
			expect(handle.panels['learn']).toBe(panelEls[1]);
			expect(handle.panels['notes']).toBe(panelEls[2]);
		});
	});

	describe('persist — SessionStore accessor (selection survives the echo-rebuild)', () => {
		const persistOf = (session: ReturnType<typeof createSessionStore>) => ({
			session,
			blockKey: 'note.md::ds-negotiation::4',
			slot: 'tab',
		});

		test('a user selection round-trips through the session across a remount', () => {
			const session = createSessionStore();
			const a = mount({ persist: persistOf(session) });

			a.tabEls[1].click(); // user picks "learn"
			a.parent.remove();

			const b = mount({ persist: persistOf(session) });
			expect(b.handle.getSelected()).toBe('learn');
			expect(b.tabEls[1].getAttribute('aria-selected')).toBe('true');
			expect(b.panelEls[1].hasAttribute('hidden')).toBe(false);
		});

		test('a stale persisted id (tab no longer exists) falls back to opts.selected', () => {
			const session = createSessionStore();
			const persist = persistOf(session);
			session.set(persist.blockKey, persist.slot, 'gone-tab');

			const { handle } = mount({ persist });
			expect(handle.getSelected()).toBe('argument');
		});

		test('mounting alone does NOT write to the session (only real selection changes persist)', () => {
			const session = createSessionStore();
			const persist = persistOf(session);
			mount({ persist });
			expect(session.get(persist.blockKey, persist.slot)).toBeUndefined();
		});
	});

	test('lifecycle: owner.unload() detaches click AND keyboard listeners (F1 §4.5)', () => {
		const owner = fakeOwner();
		const { tabEls, onSelect } = mount({}, owner);

		owner.unload();
		tabEls[1].click();
		keydown(tabEls[0], 'ArrowRight');

		expect(onSelect).not.toHaveBeenCalled();
		expect(tabEls[0].getAttribute('aria-selected')).toBe('true'); // unchanged
	});
});
