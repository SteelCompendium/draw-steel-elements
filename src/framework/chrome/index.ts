// SC-169 — element chrome (standard menu panel + whole-element collapse). Barrel.
export type {
	ChromeHandle,
	ChromeMenuItem,
	ElementChrome,
	ElementChromeContext,
	ElementSummary,
} from './types';
export { mountChrome, CHROME_COLLAPSE_SLOT } from './mountChrome';
export type { MountChromeOptions } from './mountChrome';
export { COLLAPSED_KEY, extractCollapsedDefault, withCollapsedDefault } from './collapsedKey';
export { isChromeMobile, setChromeMobileOverride } from './platform';
