// SC-422 — a "stamped chrome root": plugin chrome that sits OUTSIDE every element root and
// every DseModal (the Compendium search modal, the settings preview caption, the sidebar
// view) but still reads the `--dse-fs-*` size roles, so the Small / Large / Control
// text-size prefs must reach it too.
//
// Why a stamp is needed at all: the role tokens are `calc(<r>em * var(--dse-fs-*-scale))`,
// and a var() inside a custom property substitutes on the element the property is DECLARED
// on (styles-source.css "SC-372: THE SCALE-DEPENDENT TYPE-SIZE TOKENS"). So the tokens are
// declared on `:root` plus each root the prefs seam stamps, and a surface that is none of
// those resolves the default 1 forever. This helper makes a surface one of them:
//   1. the class below puts it in the token rule's selector list (and the "applies once"
//      registry's nested-root clause), so the tokens re-declare ON this element;
//   2. `prefs.reflectCss` stamps the three multipliers inline on it and keeps them current.
//
// Never stamp <html> or a whole document (SC-372 O3): popout windows and modals each own a
// scale. Pass the SMALLEST container that holds the text — it stays correct when it nests
// element roots (they re-declare the tokens with their own, identical, stamp).
//
// `owner` is the lifetime: its unload releases the subscription (reflectCss registers the
// unsubscribe on it), so a surface that is torn down and re-created must hand each build its
// own Component — see CompendiumSearchModal (loaded in onOpen, unloaded in onClose).
import type { Component } from 'obsidian';
import type { PreferenceStore } from '../seams/prefs';

/** The class that marks a stamped chrome root. Named in styles-source.css — keep in step. */
export const TEXT_SCALE_ROOT_CLS = 'dse-fs-root';

/**
 * Mark `rootEl` as a stamped chrome root and keep the css-bearing prefs stamped on it for
 * `owner`'s lifetime. `prefs` is optional because the stores are looked up (modals) or
 * threaded (sidebar) and a bare test/harness context may have none: the class is still
 * added, and the root then resolves the same default 1 an unstamped element does.
 */
export function stampTextScaleRoot(
	rootEl: HTMLElement,
	prefs: PreferenceStore | undefined,
	owner: Component,
): void {
	rootEl.addClass(TEXT_SCALE_ROOT_CLS);
	prefs?.reflectCss(rootEl, owner);
}
