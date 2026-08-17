// SC-169 — the ONE place the chrome asks "are we on mobile?".
//
// Scott's ruling 4: on mobile there is no hover, so the panel is ALWAYS visible and the
// element reserves extra top space for it; on desktop it stays hover-reveal with no
// reserved space. Obsidian answers the question via `Platform.isMobile`.
//
// Two reasons this is a module rather than an inline `Platform.isMobile` read:
//   - it is a SEAM. jsdom tests and the visual harness need to render the mobile branch
//     without a mobile Obsidian; `setChromeMobileOverride(true)` gives them that without
//     monkey-patching the `obsidian` module.
//   - `Platform` is a host-provided global on a module that is `external` in the build;
//     a defensive read keeps a bare/older host from throwing during element render.
import { Platform } from 'obsidian';

let override: boolean | undefined;

/**
 * Force the mobile branch on (or off) regardless of the host. `undefined` restores the
 * real `Platform.isMobile` read. Test/harness seam ONLY — production never calls it.
 */
export function setChromeMobileOverride(value: boolean | undefined): void {
	override = value;
}

/** True when the chrome should render its always-visible mobile form. */
export function isChromeMobile(): boolean {
	if (override !== undefined) return override;
	// `Platform` is host-provided (the `obsidian` module is external in the build), so this
	// stays a defensive read rather than a bare `Platform.isMobile`.
	return Platform?.isMobile === true;
}
