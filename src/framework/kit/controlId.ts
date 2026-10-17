// SC-408 — stable control ids. `data-dse-control="<surface>.<control>"` names an interactive
// node by WHAT IT IS, never by its copy or classes, so the real-Obsidian e2e driver (and the
// jsdom census) can address and enumerate controls without depending on text that changes
// ("Gain 5 Stamina…") or CSS that gets restyled. ATTRIBUTE ONLY: stamping renders no pixel,
// adds no class and changes no text.
//
// Naming: `<surface>.<control>[.<part>]`, e.g. `sedit.damage`, `sedit.stamina.inc`,
// `stamina.bar`, `recov.catch-breath`, `init.detail.stamina`. The e2e manifests
// (e2e/manifest/*.ts) are the registry of valid ids.

export const CONTROL_ATTR = 'data-dse-control';

/** Stamp `id` on `el` (no-op when `id` is undefined, so callers can pass an optional through). */
export function stampControl(el: Element, id: string | undefined): void {
	if (id) el.setAttribute(CONTROL_ATTR, id);
}
