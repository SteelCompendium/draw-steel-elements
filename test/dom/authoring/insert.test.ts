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

test('registers exactly one insert-<id> command per ADVERTISED element, sentence-cased', () => {
	const plugin = new Plugin(new App());
	const registry = makeRegistry();
	registerInsertCommands(plugin as never, registry);
	// SC-190: `hidden` defs (`ds-hero`) stay registered but get no command — one command per
	// NON-hidden element, not one per registered element.
	const advertisedCount = registry.all().filter((d) => !d.hidden).length;
	expect(plugin.commands).toHaveLength(advertisedCount);
	const roll = plugin.commands.find((c) => c.id === 'insert-roll');
	expect(roll.name).toBe('Insert Draw Steel: Roll');
	expect(typeof roll.editorCallback).toBe('function');
});

// SC-190: `ds-hero`'s edit modal and rendered card need more QoL work before the element is
// advertised as supported (Scott's ruling) — it stays registered (an existing block still
// renders, see heroSheet.test.ts) but must not get a command-palette entry, or the palette
// itself is the thing that lets a user stumble onto it.
test('ds-hero stays registered but gets no insert-<id> command (SC-190, unadvertised)', () => {
	const plugin = new Plugin(new App());
	const registry = makeRegistry();
	expect(registry.get('hero')).toBeDefined(); // still registered — existing notes keep working
	registerInsertCommands(plugin as never, registry);
	expect(plugin.commands.find((c) => c.id === 'insert-hero')).toBeUndefined();
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
