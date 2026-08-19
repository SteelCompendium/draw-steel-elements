// SC-169 — element chrome (standard menu panel + whole-element collapse). Barrel.
export type {
	ChromeHandle,
	ChromeMenuItem,
	ElementChrome,
	ElementChromeContext,
	ElementSummary,
} from './types';
export { mountChrome, CHROME_COLLAPSE_SLOT, ensureCollapseInvariant } from './mountChrome';
export type { MountChromeOptions } from './mountChrome';
export {
	COLLAPSED_KEY,
	COLLAPSIBLE_KEY,
	COLLAPSE_DEFAULT_KEY,
	extractCollapseKeys,
	peelLeadingCollapseKeys,
	resolveCollapseState,
	withCollapseKeys,
	withPeeledKeys,
} from './collapsedKey';
export type { CollapseKeys, PeeledCollapseKeys } from './collapsedKey';
export { isChromeMobile, setChromeMobileOverride } from './platform';
