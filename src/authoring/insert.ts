// Plan 15 Task 3 (D9 §2.1) — insert commands: one per registered element, each dropping a
// scaffold at the cursor. INSERT ONLY (replaceSelection) — never a range-replace over
// existing content (editor-mutation safety, Global Constraints / OD-D9-12).
import type { Editor, Plugin } from 'obsidian';
import type { ElementDefinition, ElementRegistry } from '@/framework/registry';
import { buildScaffold } from './scaffold';

/** Insert the element's scaffold at the cursor (or over the current selection). */
export function insertScaffold(editor: Editor, def: ElementDefinition): void {
	editor.replaceSelection(buildScaffold(def).text);
}

/** Register `insert-<id>` for every element in the registry (loop, no per-element code). */
export function registerInsertCommands(plugin: Plugin, registry: ElementRegistry): void {
	for (const def of registry.all()) {
		plugin.addCommand({
			id: `insert-${def.id}`,
			name: `Insert Draw Steel: ${def.name}`,
			editorCallback: (editor: Editor) => insertScaffold(editor, def),
		});
	}
}
