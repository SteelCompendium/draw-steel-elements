// The two editor suggesters (SC-443): the `/ds` element scaffolder (src/authoring/suggest.ts `DsElementSuggest`) and the in-fence key / enum
// autocomplete (src/authoring/schemaSuggest.ts `DsSchemaSuggest`). Both are Obsidian EditorSuggests: the popup (`.suggestion-container >
// .suggestion > .suggestion-item`), its listeners (the click on the list, Obsidian's keymap Scope for the arrows / Enter / Escape) and the
// editor under it are Obsidian's; what OUR code draws is the content of each `.suggestion-item`, so the item row is the control we stamp.
// NOT listed: the container and the list around the rows (Obsidian's own chrome: it holds the delegated click / mousemove / mousedown
// listeners, allowlisted by the real-Obsidian census with that reason), the editor, the command palette.
// Kinds: the suggesters take no DOM focus (focus stays in the editor), so
//   - `type` is the user TYPING the trigger in the editor (`/ds`, `/dsroll`; a key name at the start of a line inside a ds-* fence, or
//     `key: ` for the value list). That has no node of ours to carry an id, so each suggester has one VIRTUAL control, `*.trigger`, that the
//     driver credits for the real keys that opened or narrowed the list (declared here, stamped nowhere);
//   - `click` is a real pointer click on a row (Obsidian accepts the row it lands on, the way Enter accepts the selected one);
//   - `press:<Key>` is a key the list's Scope takes while the editor holds focus (ArrowDown / ArrowUp move the selection, Enter accepts it,
//     Escape closes the list and writes nothing). The recipient is the SELECTED row, so the driver credits the row's id, and only when the
//     list is open and that row carries it. Tab is NOT a pair: Obsidian 1.14 registers no Tab on the list's Scope, so Tab goes to the editor
//     (an indent); a spec pins that as a plain negative, outside the manifest.
// `rows` cite the SC-443 scenario groups: S `/ds` suggest (`AUTH-S<nn>`), K in-fence autocomplete (`AUTH-K<nn>`), G experimental gate on.
import { c, surface } from './surface';

export default surface('authoring-ds-suggest', {
	controls: {
		'authoring.ds.trigger': c(['type'], ['S']),
		'authoring.ds.item': c(['click', 'press:Enter', 'press:ArrowDown', 'press:ArrowUp', 'press:Escape'], ['S', 'G']),
	},
});

/** The ids with no DOM node (the typed trigger), which the jsdom census does not look for in a rendered row. */
export const VIRTUAL_IDS: readonly string[] = ['authoring.ds.trigger'];
