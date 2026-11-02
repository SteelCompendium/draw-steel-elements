// SC-537 - redraw a Live Preview callout widget Obsidian handed to a twin, driven by the editor.
//
// SC-481 (remountReused.ts) redraws an element Obsidian reused for the next identical block, but it runs when Obsidian calls a
// code-block processor. For two identical CALLOUTS in Live Preview there is no such call: after a write to the upper callout,
// Obsidian gives the lower one the upper's OLD widget (its rebuild matches new callouts to old ones by text and takes the first
// unused old widget of equal text), the widget keeps its cached DOM and the writer's live view, and a callout widget's
// `getSectionInfo` is `() => null` anyway. The lower callout then shows the writer's value, and a click on it writes the UPPER block
// (or, after a block edit form's Save, erases the edit).
//
// The editor, unlike the processor, is told about it: the same transaction that moves the widget updates the editor (and a widget that
// was not in the editor's DOM then is attached by a later scroll or selection update, which is judged too), and the
// editor can say where a widget sits now (`posAtDOM`). So one `EditorView.updateListener` (public CodeMirror API) runs the SC-481
// check for the views drawn in that editor, with the editor's section for a callout widget (`reusedBlockBody(…, scope)`), in the
// SAME update - before the user can click the stale card. It judges only that editor's own widgets, so Reading views and other
// panes keep being judged at processor time as before.
import { editorInfoField } from 'obsidian';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { ReusedElementRemounter } from './remountReused';

/** The CodeMirror extension to pass to `plugin.registerEditorExtension`. Runs on every doc, scroll and selection update of every editor. */
export function livePreviewReconcileExtension(remounter: ReusedElementRemounter): Extension {
	return EditorView.updateListener.of((update) => {
		// A write moves a callout widget in the update that changes the text. But a twin whose widget is not in the editor's DOM at that
		// moment (scrolled far off, or raw source because the cursor is inside it) is handed the writer's widget all the same, and
		// CodeMirror attaches the cached widget later, in a viewport (scroll) or selection update with no text change and no processor
		// call. So those updates are judged too.
		if (!update.docChanged && !update.viewportChanged && !update.selectionSet) return;
		const path = update.state.field(editorInfoField, false)?.file?.path;
		if (!path) return;
		// Cheap when this editor holds no DSE card of the note: one pass over the live views, no note text read.
		void remounter.reconcile(path, update.view);
	});
}
