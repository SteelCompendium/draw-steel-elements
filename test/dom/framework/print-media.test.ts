// SC-170 — watchPrintMedia: real @media print must render the print scheme.
//
// The CSS half of this ticket (specificity) is asserted in theme-print.test.ts. This file
// covers the other half: the plugin has ~297 Steel rules guarded by
// `:not([data-dse-print="on"])`, and a media query cannot make an attribute selector
// false — so real paper only matches the print scheme if something puts the attribute
// there for the duration of the print. That is this module.
//
// Every case below can fail: delete the corresponding listener (or the mount-time
// `mql.matches` check) in src/framework/printMedia.ts and exactly one goes red.
import { watchPrintMedia } from '../../../src/framework/printMedia';
import { Component } from '../../mocks/obsidian';

// Same convention as conditionIcons.test.ts / iconButton.test.ts: the mock Component's
// runtime shape (register / registerDomEvent / unload) is what matters here, not
// structural tsc satisfaction against the real obsidian.d.ts Component.
const fakeOwner = (): any => new Component();

type Listener = (e: { matches: boolean }) => void;

/** Replace jsdom's inert matchMedia with a controllable one; returns the driver. */
function installMatchMedia(initial = false) {
	const listeners = new Set<Listener>();
	const state = { matches: initial };
	const original = (window as unknown as { matchMedia?: unknown }).matchMedia;
	(window as unknown as { matchMedia: unknown }).matchMedia = (media: string) => ({
		media,
		get matches() {
			return state.matches;
		},
		addEventListener: (_type: string, cb: Listener) => listeners.add(cb),
		removeEventListener: (_type: string, cb: Listener) => listeners.delete(cb),
	});
	return {
		listenerCount: () => listeners.size,
		fire(matches: boolean) {
			state.matches = matches;
			for (const cb of [...listeners]) cb({ matches });
		},
		restore() {
			(window as unknown as { matchMedia?: unknown }).matchMedia = original;
		},
	};
}

function makeRoot(printAttr?: string): HTMLElement {
	const root = document.createElement('div');
	root.setAttribute('data-dse-element', 'statblock');
	root.setAttribute('data-dse-theme', 'steel');
	if (printAttr !== undefined) root.setAttribute('data-dse-print', printAttr);
	document.body.appendChild(root);
	return root;
}

describe('SC-170 watchPrintMedia', () => {
	let mm: ReturnType<typeof installMatchMedia>;
	let owner: any;

	afterEach(() => {
		owner?.unload();
		mm?.restore();
		document.body.innerHTML = '';
	});

	test('a matchMedia print change stamps data-dse-print="on" and removes it again', () => {
		mm = installMatchMedia(false);
		owner = fakeOwner();
		const root = makeRoot();
		watchPrintMedia(root, owner);

		expect(root.hasAttribute('data-dse-print')).toBe(false);
		mm.fire(true);
		expect(root.getAttribute('data-dse-print')).toBe('on');
		mm.fire(false);
		expect(root.hasAttribute('data-dse-print')).toBe(false);
	});

	test('beforeprint/afterprint drive the same stamp (Electron printToPDF fires these)', () => {
		// Measured on a real Obsidian 1.13.7 (2026-08-17): its "Export to PDF" goes through
		// webContents.printToPDF, which fires beforeprint → matchMedia change → afterprint
		// in the renderer that owns the element roots.
		mm = installMatchMedia(false);
		owner = fakeOwner();
		const root = makeRoot();
		watchPrintMedia(root, owner);

		window.dispatchEvent(new Event('beforeprint'));
		expect(root.getAttribute('data-dse-print')).toBe('on');
		window.dispatchEvent(new Event('afterprint'));
		expect(root.hasAttribute('data-dse-print')).toBe(false);
	});

	test('the printPreview preference value is RESTORED, not clobbered, after printing', () => {
		// data-dse-print is also the `printPreview` pref's reflected attribute (and can be
		// pinned per block); printing must not silently turn a user's preview toggle off.
		mm = installMatchMedia(false);
		owner = fakeOwner();
		const root = makeRoot('off');
		watchPrintMedia(root, owner);

		window.dispatchEvent(new Event('beforeprint'));
		expect(root.getAttribute('data-dse-print')).toBe('on');
		window.dispatchEvent(new Event('afterprint'));
		expect(root.getAttribute('data-dse-print')).toBe('off');
	});

	test('a root mounted while print media is ALREADY active is stamped at once', () => {
		// An export that renders its own copy of the note under an emulated print medium
		// never delivers a change event to that fresh root.
		mm = installMatchMedia(true);
		owner = fakeOwner();
		const root = makeRoot();
		watchPrintMedia(root, owner);
		expect(root.getAttribute('data-dse-print')).toBe('on');
	});

	test('entering print twice in a row does not lose the value to restore', () => {
		mm = installMatchMedia(false);
		owner = fakeOwner();
		const root = makeRoot('off');
		watchPrintMedia(root, owner);

		window.dispatchEvent(new Event('beforeprint'));
		mm.fire(true); // the second signal for the SAME print job
		expect(root.getAttribute('data-dse-print')).toBe('on');
		mm.fire(false);
		window.dispatchEvent(new Event('afterprint'));
		expect(root.getAttribute('data-dse-print')).toBe('off');
	});

	test('unloading the owner detaches every listener (no stamping on a dead root)', () => {
		mm = installMatchMedia(false);
		owner = fakeOwner();
		const root = makeRoot();
		watchPrintMedia(root, owner);
		expect(mm.listenerCount()).toBe(1);

		owner.unload();
		expect(mm.listenerCount()).toBe(0);
		window.dispatchEvent(new Event('beforeprint'));
		expect(root.hasAttribute('data-dse-print')).toBe(false);
	});

	test('a window without matchMedia is a no-op, not a crash', () => {
		const original = (window as unknown as { matchMedia?: unknown }).matchMedia;
		delete (window as unknown as { matchMedia?: unknown }).matchMedia;
		owner = fakeOwner();
		const root = makeRoot();
		expect(() => watchPrintMedia(root, owner)).not.toThrow();
		expect(root.hasAttribute('data-dse-print')).toBe(false);
		(window as unknown as { matchMedia?: unknown }).matchMedia = original;
	});
});
