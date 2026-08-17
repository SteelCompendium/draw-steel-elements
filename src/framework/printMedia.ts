// src/framework/printMedia.ts — SC-170: make REAL print render the print scheme.
//
// The plugin has two print surfaces and, until SC-170, only one of them was the
// print scheme:
//   • [data-dse-print="on"]  — the on-screen export-PREVIEW twin (the `printPreview`
//                              preference stamps it; the freeze gate photographs it)
//   • @media print           — real Ctrl-P / "Export to PDF" from Obsidian
//
// The neutral print VALUES are shared by both surfaces (styles-source.css, the
// print/export layer). The print RULES (force collapsibles open, hide inert chrome,
// page-break hygiene) are mirrored for both too. But ~297 Steel rules carry the guard
// `[data-dse-theme='steel']:not([data-dse-print="on"])`, and a media query cannot make
// an attribute selector false — so on paper that `:not(...)` was TRUE and every Steel
// STRUCTURE rule still applied: the forged card plate, its literal
// `0 8px 22px rgba(0,0,0,.34)` lift shadow, boxed statgrid cells, small-caps. Paper did
// not match the preview the user was shown.
//
// Rather than duplicate the print scheme into a second, real-print-only copy of those
// declarations (two sources of truth for "what print looks like", guaranteed to drift),
// this module makes real print USE the twin: while the root's window is in print media,
// the root carries `data-dse-print="on"`, so paper and preview resolve through exactly
// the same rules.
//
// GROUND TRUTH (measured 2026-08-17 on a scratch Obsidian, Xvfb): Obsidian's PDF export
// goes through Electron's `webContents.printToPDF`, and that path DOES fire, in the
// renderer that owns the element roots, in this order:
//     beforeprint → matchMedia('print') change=true → afterprint → change=false
// so the DOM mutation below lands before the print layout is captured. `beforeprint` is
// the trigger that matters (it fires synchronously ahead of the print layout);
// matchMedia is kept as the belt to `beforeprint`'s braces, and as the mount-time check
// for a root created while print media is already active.
//
// Popout safety (D3 §2.5): state is per-root. The listeners are attached to the root's
// OWN window (`rootEl.ownerDocument.defaultView`), never a captured `window`, so a root
// living in a popout observes that popout's print state.
//
// Restore, not reset: the previous attribute value is remembered and put back on
// `afterprint`. That matters because `data-dse-print` is also the `printPreview`
// preference's reflected attribute (and can be pinned per block via `prefs:`) — a
// user printing with the preview toggle ON must still have it on afterwards.
import type { Component } from 'obsidian';

const PRINT_ATTR = 'data-dse-print';

/**
 * Stamp `data-dse-print="on"` on `rootEl` for the duration of real print media in the
 * root's own window, restoring the previous value afterwards. Registered on `owner`, so
 * it is torn down with the view.
 *
 * Safe to call on any element root; a no-op in environments without `matchMedia`.
 */
export function watchPrintMedia(rootEl: HTMLElement, owner: Component): void {
	const win = rootEl.ownerDocument?.defaultView;
	if (!win || typeof win.matchMedia !== 'function') return;
	const mql = win.matchMedia('print');

	let printing = false;
	let previous: string | null = null;

	const enter = () => {
		if (printing) return;
		printing = true;
		previous = rootEl.getAttribute(PRINT_ATTR);
		rootEl.setAttribute(PRINT_ATTR, 'on');
	};
	const leave = () => {
		if (!printing) return;
		printing = false;
		if (previous === null) rootEl.removeAttribute(PRINT_ATTR);
		else rootEl.setAttribute(PRINT_ATTR, previous);
		previous = null;
	};

	// A root mounted while print media is ALREADY active (an export that renders its
	// own copy of the note under an emulated print medium) never sees a change event.
	if (mql.matches) enter();

	const onMediaChange = (e: MediaQueryListEvent) => (e.matches ? enter() : leave());
	mql.addEventListener('change', onMediaChange);
	owner.register(() => mql.removeEventListener('change', onMediaChange));
	owner.registerDomEvent(win, 'beforeprint', enter);
	owner.registerDomEvent(win, 'afterprint', leave);
}
