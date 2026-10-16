// SC-406 — the 7.0.0 release gate: ONE undocumented boolean, `"experimental": true` in the
// plugin's `data.json` (absent = off). It is read ONCE at load (`main.ts onload`, right
// after `loadSettings`, mirroring the `viewAdoption` kill switch) and this module is the
// single source of truth every other module queries — nothing else ever looks at
// `settings.experimental`.
//
// Not in the Settings UI, not in `DEFAULT_SETTINGS`. When OFF (the shipped state):
//   - the nine deferred elements (`ElementDefinition.deferred`) render an inert
//     "not available in this release" card and are withheld from every discovery
//     surface (`isDefinitionHidden`);
//   - the sidebar is not registered (no view, ribbon icon, commands, pin/unpin items);
//   - the `authoringControls` / `printPreview` descriptors are not in the catalog
//     (`activePrefDescriptors`);
// When ON everything is exactly as it was before the gate existed.
//
// Module state, not a constructor argument, on purpose: the answer is needed in places
// that have no handle on the plugin (the pipeline's chrome builder, the registry's hidden
// check, the catalog filter), and a build-time consumer that never loads a `data.json`
// (the docs/harness tooling) must see the OFF state without wiring anything — so the
// default is OFF. Tests and the visual harness opt IN (`test/setup/experimental.ts`,
// `visual-harness/entry.ts`), so no fixture or gate moves.
let experimental = false;

/** Is the experimental switch on? Default false (the shipped release state). */
export function isExperimental(): boolean {
	return experimental;
}

/** Set the switch. Called once from `onload` with the loaded setting; tests and the
 *  visual harness call it directly. */
export function setExperimental(on: boolean): void {
	experimental = on === true;
}

/** Read the raw `data.json` value. Strictly `=== true`: a string `"true"`, `1` or a typo
 *  never turns the unfinished features on. */
export function readExperimentalSetting(settings: { experimental?: unknown } | null | undefined): boolean {
	return settings?.experimental === true;
}
