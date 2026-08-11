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
	expect(plugin.commands).toHaveLength(registry.all().length); // one per registered element
	const roll = plugin.commands.find((c) => c.id === 'insert-roll');
	expect(roll.name).toBe('Insert Draw Steel: Roll');
	expect(typeof roll.editorCallback).toBe('function');
});

// D6 Task 11 (wiring sweep), retargeted by SC-149: same pure-loop guarantee — the public
// compendium-reference elements get an insert-<id> command with zero per-element code.
// The ten typed display elements are no longer registered, so they must NOT appear here:
// an "Insert Draw Steel: Kit" command in the palette is exactly the public commitment
// Scott's ruling removes.
test('ds-scc gets an insert-<id> command; the eleven display elements do not', () => {
	const plugin = new Plugin(new App());
	registerInsertCommands(plugin as never, makeRegistry());
	const scc = plugin.commands.find((c) => c.id === 'insert-scc');
	expect(scc).toBeDefined();
	expect(typeof scc.editorCallback).toBe('function');
	for (const id of ['kit', 'condition', 'treasure', 'ancestry', 'culture', 'career', 'class', 'title', 'perk', 'complication', 'rule']) {
		expect(plugin.commands.find((c) => c.id === `insert-${id}`)).toBeUndefined();
	}
});

// SC-149 (deliverable 7): the ONE authoring surface the ten used to have — a starter
// block — must now offer only ds-scc, and its starter body must be an SCC code
// placeholder, not YAML.
test('the ds-scc insert scaffold is a ds-scc fence whose body is a bare SCC code', () => {
	const editor = new Editor('');
	insertScaffold(editor as never, makeRegistry().get('scc')!);
	expect(editor.writes[0].text).toBe('```ds-scc\nmcdm.heroes.v1/kit/panther\n```');
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

test('the command callback drops the cursor at the scaffold\'s first body character, on a non-zero line', () => {
	const editor = new Editor('l0\nl1\nl2\nl3\nl4\nline 5 xyz');
	editor.cursor = { line: 5, ch: 7 }; // insertion point captured BEFORE the write
	const def = makeRegistry().get('roll')!;
	insertScaffold(editor as never, def);
	// scaffold text starts "```ds-roll\n" (11 chars, one newline) — cursorOffset lands right
	// after that newline, so the cursor moves to the next line, column 0.
	expect(editor.setCursorCalls).toHaveLength(1);
	expect(editor.setCursorCalls[0]).toEqual({ line: 6, ch: 0 });
	expect(editor.cursor).toEqual({ line: 6, ch: 0 });
});
