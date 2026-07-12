// Plan 15 Task 3 (D9 §2.1) — one insert command per registered element; each inserts a
// scaffold at the cursor (replaceSelection), never rewriting existing text.
import { registerInsertCommands, insertScaffold } from '../../../src/authoring/insert';
import { createElementRegistry } from '../../../src/framework/registry';
import { registerFrameworkElementDefinitions } from 'main';
// Plugin/Editor/App are imported from the mock directly (not the bare 'obsidian' specifier):
// the real obsidian.d.ts declares Plugin and Editor abstract, so `new Plugin(...)` / `new
// Editor(...)` only type-checks against the concrete jest-free mock (established pattern —
// see test/dom/framework/register-framework-elements.test.ts).
import { Editor, Plugin, App } from '../../mocks/obsidian';

function makeRegistry() {
	const r = createElementRegistry();
	registerFrameworkElementDefinitions(r);
	return r;
}

test('registers exactly one insert-<id> command per element, sentence-cased', () => {
	const plugin = new Plugin(new App());
	const registry = makeRegistry();
	registerInsertCommands(plugin as never, registry);
	expect(plugin.commands).toHaveLength(registry.all().length); // 12
	const roll = plugin.commands.find((c) => c.id === 'insert-roll');
	expect(roll.name).toBe('Insert Draw Steel: Roll');
	expect(typeof roll.editorCallback).toBe('function');
});

test('the command callback inserts the element scaffold at the cursor only', () => {
	const editor = new Editor('existing line');
	editor.cursor = { line: 0, ch: 13 };
	const def = makeRegistry().get('roll')!;
	insertScaffold(editor as never, def);
	expect(editor.writes).toHaveLength(1);
	expect(editor.writes[0].text.startsWith('```ds-roll\n')).toBe(true);
	expect(editor.writes[0].from).toEqual(editor.writes[0].to); // pure insert, no range replace
	expect(editor.getValue()).toBe('existing line'); // mock records, never mangles
});
