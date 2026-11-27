// Plan 15 Task 3 (D9 §2.1) — insert commands: one per registered element, each dropping a
// scaffold at the cursor. INSERT ONLY (replaceSelection) — never a range-replace over
// existing content (editor-mutation safety, Global Constraints / OD-D9-12). SC-675: where the block goes
// relative to the cursor's line (own lines, container prefix) is blockInsert.ts's job; it is still one
// replaceSelection that removes only the selection. SC-692: with several cursors every one gets its own block, in one editor.transaction.
import type { Editor, Plugin } from 'obsidian';
import { isDefinitionHidden } from '@/framework/registry';
import type { ElementDefinition, ElementRegistry } from '@/framework/registry';
import { insertBlock } from './blockInsert';
import { buildScaffold } from './scaffold';

/**
 * Insert the element's scaffold at the cursor (or over the current selection), then drop
 * the cursor at the scaffold's `cursorOffset` (its first body character). SC-675: the block
 * always starts and ends on its own lines (text before / after the cursor is kept on separate
 * lines) and every line carries the cursor line's list / callout prefix — see blockInsert.ts,
 * which also captures the insertion point before the write (replaceSelection() leaves
 * getCursor() at the post-insertion position). SC-687: with the cursor inside an existing block or the note's
 * properties nothing is written (blockInsert.ts shows a Notice); returns whether the block was written.
 */
export function insertScaffold(editor: Editor, def: ElementDefinition): boolean {
	return insertBlock(editor, buildScaffold(def));
}

/**
 * Register `insert-<id>` for every ADVERTISED element in the registry (loop, no
 * per-element code). SC-190: a `hidden` def (e.g. `ds-hero`) stays fully registered — it
 * just gets no command-palette entry, so it isn't a thing a user stumbles onto. SC-406: a
 * `deferred` def is hidden the same way while the experimental switch is off.
 */
export function registerInsertCommands(plugin: Plugin, registry: ElementRegistry): void {
	for (const def of registry.all()) {
		if (isDefinitionHidden(def)) continue;
		plugin.addCommand({
			id: `insert-${def.id}`,
			name: `Insert Draw Steel: ${def.name}`,
			editorCallback: (editor: Editor) => insertScaffold(editor, def),
		});
	}
}
