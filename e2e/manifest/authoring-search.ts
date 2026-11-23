// The compendium search window (src/authoring/CompendiumSearchModal.ts, opened by `insert-compendium-reference` and
// `insert-compendium-block`; src/authoring/compendiumInsert.ts decides what a choice writes) (SC-443). It is an Obsidian SuggestModal: the
// dialog (`.modal.prompt`), its input field, its result list and the key handling (ArrowUp / ArrowDown / Enter / Escape, Ctrl+P / Ctrl+N) are
// Obsidian's; what OUR code draws is the content of each result row, and it names the input (`inputEl`) and each row (`.suggestion-item`).
// NOT listed: the backdrop around the dialog (`modal.backdrop`, a host id other surfaces already declare; a spec may click it and the
// pair is credited there), Obsidian's own list container (it holds the delegated click / mousemove listeners) and the input's clear button
// (`.search-input-clear-button`), both allowlisted by the real-Obsidian census with that reason; the Sync that a "Sync compendium" row
// starts (SC-441's windows and the network: the pairs below stop where a sync would start; `openEditor` puts the guard in that makes the sync service's
// `requestUrlFn` throw, and a test that drives the Sync row installs `releaseStub` first, whose stub answers from the page and records the request).
// Kinds:
//   - the input: `type` (the query, `type:` / `source:` filters included), `press:ArrowDown` / `press:ArrowUp` (move the selected row),
//     `press:Enter` (accept the selected row: always the plain action, Obsidian's Scope takes Enter with NO modifier only, so there is no
//     keyboard route to the Shift / Ctrl variants) and `press:Escape` (close, write nothing);
//   - the result row: `click` (a plain pick: the default action of the command, a reference block or a snapshot), `click:Middle` and `click:Right`
//     (Obsidian's chooser hands every mouse button to the row, so each does the default action and closes the window: pinned as they are; two
//     pairs because they are two physical buttons a user can press), `click:Shift` and
//     `click:Control` (the modifier routing `dispatchReferenceChoice` reads off the MouseEvent: Shift inserts an inline `[Name](scc.v1:code)`
//     link, Ctrl / Cmd copies `scc:code` and writes nothing; the snapshot command ignores both). Declared as their own kinds because they
//     are different outcomes on the same row; the driver credits them after the real modified click happened;
//   - the Sync row, shown alone when nothing is indexed: `click` and `press:Enter` (through the input) both start a sync, driven only to the
//     point it would start (the request itself is the guard that throws unless a test installs its own stub).
// `rows` cite the SC-443 scenario groups: C compendium search + insert (`AUTH-C<nn>`).
import { c, surface } from './surface';

export default surface('authoring-search', {
	controls: {
		'authoring.search.input': c(['type', 'press:ArrowDown', 'press:ArrowUp', 'press:Enter', 'press:Escape'], ['C']),
		'authoring.search.result': c(['click', 'click:Middle', 'click:Right', 'click:Shift', 'click:Control'], ['C']),
		'authoring.search.sync': c(['click', 'press:Enter'], ['C']),
	},
});
