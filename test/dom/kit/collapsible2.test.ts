// Plan 08 Task 3 (D2 §2.3) — kit/collapsible2: the ComponentWrapper replacement.
// Header is a REAL <button aria-expanded> wired to the region via aria-controls;
// the region hides via the `hidden` ATTRIBUTE (never inline display); the chevron
// (setIcon "chevron-right") rotates via CSS keyed to [data-open] (reduced-motion-
// safe); `persist` round-trips open-state through a SessionStore accessor so
// collapse survives a remount WITHOUT the kit importing cx (kit⊥elements).
//
// Named collapsible2 because kit/collapsible.ts (the D1 CollapsibleHeading port)
// still owns the `collapsible` name — Plan 09 renames after the old one is deleted.
import * as fs from 'fs';
import * as path from 'path';
import { collapsible2 } from '../../../src/framework/kit/collapsible2';
import { Component } from '../../mocks/obsidian';
import { createSessionStore } from '../../../src/framework/session';
// The SessionPersist ACCESSOR type now lives in framework/session (Plan 09 Task 0 —
// neutral home; collapsible2.ts is deleted by the rename later in Plan 09).
import type { SessionPersist } from '../../../src/framework/session';
import { styleGuardFindings } from './styleGuard';

function fakeOwner(): any {
	return new Component();
}

describe('Plan 08 Task 3: kit/collapsible2 (D2 §2.3)', () => {
	describe('structure + a11y', () => {
		test('header is a REAL <button type="button" aria-expanded> with aria-controls → the region id', () => {
			const parent = document.createElement('div');
			const handle = collapsible2(parent, { title: 'Skills', open: true }, fakeOwner());

			const rootEl = parent.querySelector('.dse-collapse')!;
			expect(rootEl).not.toBeNull();

			expect(handle.headerEl).toBeInstanceOf(HTMLButtonElement);
			expect(handle.headerEl.getAttribute('type')).toBe('button');
			expect(handle.headerEl.hasClass('dse-collapse__header')).toBe(true);
			expect(handle.headerEl.getAttribute('aria-expanded')).toBe('true');

			expect(handle.contentEl.hasClass('dse-collapse__region')).toBe(true);
			expect(handle.contentEl.id).not.toBe('');
			expect(handle.headerEl.getAttribute('aria-controls')).toBe(handle.contentEl.id);
			expect(handle.headerEl.textContent).toContain('Skills');
		});

		test('two collapsibles get DISTINCT region ids (aria-controls stays unambiguous)', () => {
			const parent = document.createElement('div');
			const first = collapsible2(parent, { title: 'A', open: true }, fakeOwner());
			const second = collapsible2(parent, { title: 'B', open: true }, fakeOwner());
			expect(first.contentEl.id).not.toBe(second.contentEl.id);
		});

		test('chevron is a setIcon("chevron-right") span inside the header', () => {
			const parent = document.createElement('div');
			const handle = collapsible2(parent, { title: 'Skills', open: false }, fakeOwner());
			const chevron = handle.headerEl.querySelector('.dse-collapse__chevron')!;
			expect(chevron).not.toBeNull();
			expect(chevron.getAttribute('data-icon')).toBe('chevron-right');
		});

		test('titleEl option mounts the caller-built node into the header', () => {
			const parent = document.createElement('div');
			const titleEl = document.createElement('em');
			titleEl.textContent = 'Custom title';
			const handle = collapsible2(parent, { titleEl, open: true }, fakeOwner());
			expect(handle.headerEl.contains(titleEl)).toBe(true);
		});
	});

	describe('open/closed state — aria-expanded + the hidden ATTRIBUTE + [data-open]', () => {
		test('open: aria-expanded="true", region visible, [data-open] set (drives the CSS chevron rotate)', () => {
			const parent = document.createElement('div');
			const handle = collapsible2(parent, { title: 'x', open: true }, fakeOwner());
			const rootEl = parent.querySelector('.dse-collapse')!;

			expect(handle.headerEl.getAttribute('aria-expanded')).toBe('true');
			expect(handle.contentEl.hasAttribute('hidden')).toBe(false);
			expect(rootEl.hasAttribute('data-open')).toBe(true);
			expect(handle.isOpen()).toBe(true);
		});

		test('closed: aria-expanded="false", region carries the hidden ATTRIBUTE (no inline display)', () => {
			const parent = document.createElement('div');
			const handle = collapsible2(parent, { title: 'x', open: false }, fakeOwner());
			const rootEl = parent.querySelector('.dse-collapse')!;

			expect(handle.headerEl.getAttribute('aria-expanded')).toBe('false');
			expect(handle.contentEl.hasAttribute('hidden')).toBe(true);
			expect(rootEl.hasAttribute('data-open')).toBe(false);
			// §2.3: the hidden attr, NOT inline display:none.
			expect(handle.contentEl.style.display).toBe('');
			expect(handle.contentEl.getAttribute('style')).toBeNull();
			expect(handle.isOpen()).toBe(false);
		});

		test('header click toggles everything and fires onToggle with the NEW state', () => {
			const parent = document.createElement('div');
			const onToggle = jest.fn();
			const handle = collapsible2(parent, { title: 'x', open: false, onToggle }, fakeOwner());
			const rootEl = parent.querySelector('.dse-collapse')!;

			handle.headerEl.click();
			expect(onToggle).toHaveBeenLastCalledWith(true);
			expect(handle.headerEl.getAttribute('aria-expanded')).toBe('true');
			expect(handle.contentEl.hasAttribute('hidden')).toBe(false);
			expect(rootEl.hasAttribute('data-open')).toBe(true);

			handle.headerEl.click();
			expect(onToggle).toHaveBeenLastCalledWith(false);
			expect(handle.headerEl.getAttribute('aria-expanded')).toBe('false');
			expect(handle.contentEl.hasAttribute('hidden')).toBe(true);
			expect(rootEl.hasAttribute('data-open')).toBe(false);
			expect(onToggle).toHaveBeenCalledTimes(2);
			// Both toggles stayed attribute-driven — never inline display.
			expect(handle.contentEl.getAttribute('style')).toBeNull();
		});
	});

	describe('Handle: setOpen / isOpen (in-place, no onToggle)', () => {
		test('setOpen reflects state onto the SAME nodes without firing onToggle', () => {
			const parent = document.createElement('div');
			const onToggle = jest.fn();
			const handle = collapsible2(parent, { title: 'x', open: false, onToggle }, fakeOwner());
			const regionBefore = handle.contentEl;

			handle.setOpen(true);
			expect(handle.isOpen()).toBe(true);
			expect(handle.contentEl).toBe(regionBefore); // same node, updated in place
			expect(handle.headerEl.getAttribute('aria-expanded')).toBe('true');
			expect(handle.contentEl.hasAttribute('hidden')).toBe(false);
			expect(onToggle).not.toHaveBeenCalled();
		});
	});

	describe('persist — SessionStore accessor (NO cx import; kit⊥elements)', () => {
		// Typed as SessionPersist from framework/session: pins the type's neutral home.
		const persistOf = (session: ReturnType<typeof createSessionStore>): SessionPersist => ({
			session,
			blockKey: 'note.md::ds-skills::12',
			slot: 'collapse',
		});

		test('a user toggle survives a remount (open-state round-trips through the session)', () => {
			const session = createSessionStore();
			const parentA = document.createElement('div');
			const a = collapsible2(parentA, { title: 'x', open: false, persist: persistOf(session) }, fakeOwner());

			a.headerEl.click(); // user opens it
			expect(a.isOpen()).toBe(true);
			parentA.remove(); // echo-rebuild: old DOM goes away

			const parentB = document.createElement('div');
			const b = collapsible2(parentB, { title: 'x', open: false, persist: persistOf(session) }, fakeOwner());
			expect(b.isOpen()).toBe(true); // persisted state beats opts.open
			expect(b.headerEl.getAttribute('aria-expanded')).toBe('true');
			expect(b.contentEl.hasAttribute('hidden')).toBe(false);
		});

		test('without a stored value, opts.open is the initial state (and mounting does NOT write it)', () => {
			const session = createSessionStore();
			const persist = persistOf(session);
			const parent = document.createElement('div');
			const handle = collapsible2(parent, { title: 'x', open: true, persist }, fakeOwner());
			expect(handle.isOpen()).toBe(true);
			// Mount alone must not pollute the store — only real state CHANGES persist.
			expect(session.get(persist.blockKey, persist.slot)).toBeUndefined();
		});

		test('setOpen persists too (a programmatic change also survives the next mount)', () => {
			const session = createSessionStore();
			const persist = persistOf(session);
			const parent = document.createElement('div');
			const handle = collapsible2(parent, { title: 'x', open: false, persist }, fakeOwner());

			handle.setOpen(true);
			expect(session.get<boolean>(persist.blockKey, persist.slot)).toBe(true);
		});

		test('two slots on the same blockKey stay independent', () => {
			const session = createSessionStore();
			const parent = document.createElement('div');
			const a = collapsible2(
				parent,
				{ title: 'a', open: false, persist: { session, blockKey: 'k', slot: 'collapse-a' } },
				fakeOwner(),
			);
			collapsible2(
				parent,
				{ title: 'b', open: false, persist: { session, blockKey: 'k', slot: 'collapse-b' } },
				fakeOwner(),
			);

			a.headerEl.click();
			expect(session.get<boolean>('k', 'collapse-a')).toBe(true);
			expect(session.get<boolean>('k', 'collapse-b')).toBeUndefined();
		});
	});

	test('lifecycle: owner.unload() detaches the header click listener (F1 §4.5)', () => {
		const parent = document.createElement('div');
		const onToggle = jest.fn();
		const owner = fakeOwner();
		const handle = collapsible2(parent, { title: 'x', open: false, onToggle }, owner);

		owner.unload();
		handle.headerEl.click();

		expect(onToggle).not.toHaveBeenCalled();
		expect(handle.headerEl.getAttribute('aria-expanded')).toBe('false');
	});

	describe('CSS contract (styles-source.css)', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

		test('the chevron rotate is keyed to [data-open] (a CSS state, not JS inline styles)', () => {
			expect(sheet).toMatch(
				/\.dse-collapse\[data-open\][^{]*\.dse-collapse__chevron[^{]*\{[^}]*transform:\s*rotate\(90deg\)/,
			);
		});

		test('the chevron transition is prefers-reduced-motion-safe (§4.9)', () => {
			expect(sheet).toMatch(
				/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]{0,400}?\.dse-collapse__chevron[^{]*\{[^}]*transition:\s*none/,
			);
		});

		test('[hidden] regions/panels stay hidden even if a display is themed onto them', () => {
			expect(sheet).toMatch(/\.dse-collapse__region\[hidden\][\s\S]{0,120}?display:\s*none/);
			expect(sheet).toMatch(/\.dse-tabs__panel\[hidden\][\s\S]{0,120}?display:\s*none/);
		});
	});
});

describe('Plan 08 Task 3: kit hygiene guard (D2 §5 — no inline color, tokens only)', () => {
	const kitDir = path.join(__dirname, '../../../src/framework/kit');
	const taskFiles = ['collapsible2.ts', 'tabs.ts', 'managedModal.ts'];

	test.each(taskFiles)('%s: inline color banned; --dse-* geometry setProperty allowed', (file) => {
		const src = fs.readFileSync(path.join(kitDir, file), 'utf8');
		// The reconciled SC-5 rule (Plan 09 Task 0): inline COLOR + color literals are
		// banned, but the D2 Global Constraint's dynamic-geometry escape hatch —
		// el.style.setProperty('--dse-*', …) — is allowed. See ./styleGuard.ts
		// (proof tests live in cardHead.test.ts).
		expect(styleGuardFindings(src)).toEqual([]);
	});

	test.each(taskFiles)('%s does not import from src/elements/ (kit⊥elements)', (file) => {
		const src = fs.readFileSync(path.join(kitDir, file), 'utf8');
		expect(src).not.toMatch(/from\s+['"][^'"]*elements\//);
	});
});
