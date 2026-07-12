// Plan 15 Task 3 (D9 §2.2) — the /ds EditorSuggest: triggers on a /ds token, filters the
// registry by name/alias, and on select replaces the trigger token (start..end) with the
// scaffold — never touching anything else on the line.
import { DsElementSuggest } from '../../../src/authoring/suggest';
import { createElementRegistry } from '../../../src/framework/registry';
import { registerFrameworkElementDefinitions } from 'main';
// Editor/App are imported from the mock directly (not the bare 'obsidian' specifier): the
// real obsidian.d.ts declares Editor abstract and EditorSuggestContext.file non-nullable, so
// `new Editor(...)` and the `file: null` context stubs below only type-check against the
// concrete jest-free mock (established pattern — see
// test/dom/framework/register-framework-elements.test.ts).
import { Editor, App } from '../../mocks/obsidian';

function makeSuggest() {
	const registry = createElementRegistry();
	registerFrameworkElementDefinitions(registry);
	return new DsElementSuggest(new App() as any, registry);
}

test('onTrigger fires on a /ds token and reports the token range + query', () => {
	const s = makeSuggest();
	const editor = new Editor('  /dsroll');
	const info = s.onTrigger({ line: 0, ch: 9 }, editor as never, null);
	expect(info).not.toBeNull();
	expect(info!.query).toBe('roll');
	expect(info!.start).toEqual({ line: 0, ch: 2 }); // start of "/dsroll"
	expect(info!.end).toEqual({ line: 0, ch: 9 });
});

test('onTrigger does NOT fire mid-word (no leading boundary)', () => {
	const s = makeSuggest();
	const editor = new Editor('foo/dsx');
	expect(s.onTrigger({ line: 0, ch: 7 }, editor as never, null)).toBeNull();
});

test('onTrigger does NOT fire inside an existing ds-* fence (accepting would corrupt the block)', () => {
	const s = makeSuggest();
	const editor = new Editor('```ds-roll\nroll: /dsroll\n```');
	// cursor sits right after "/dsroll" typed as a value on the fenced block's second line
	expect(s.onTrigger({ line: 1, ch: 13 }, editor as never, null)).toBeNull();
});

test('onTrigger fires again once the cursor is back outside the fence', () => {
	const s = makeSuggest();
	const editor = new Editor('```ds-roll\nroll: 2d6\n```\n/dsroll');
	const info = s.onTrigger({ line: 3, ch: 7 }, editor as never, null);
	expect(info).not.toBeNull();
	expect(info!.query).toBe('roll');
});

// Carried fix from Task 3's re-review: the guard must be fence-TYPE-agnostic. Typing "/ds"
// inside a non-ds fence (e.g. ```js) must still be suppressed — accepting the suggestion
// would replaceRange a ds-* scaffold into the middle of an unrelated fenced code block,
// corrupting it just as badly as doing so inside a ds-* fence would.
test('onTrigger does NOT fire inside a non-ds fence (e.g. ```js) — fence-type-agnostic guard', () => {
	const s = makeSuggest();
	const editor = new Editor('```js\nconst x = /dsroll');
	expect(s.onTrigger({ line: 1, ch: 15 }, editor as never, null)).toBeNull();
});

test('onTrigger does NOT fire inside a ds-* fence indented 0-3 spaces', () => {
	const s = makeSuggest();
	const editor = new Editor('   ```ds-roll\n   roll: /dsroll');
	expect(s.onTrigger({ line: 1, ch: 14 }, editor as never, null)).toBeNull();
});

test('onTrigger does NOT fire inside a ds-* fence quoted in an Obsidian callout/blockquote', () => {
	const s = makeSuggest();
	const editor = new Editor('> ```ds-roll\n> roll: /dsroll');
	expect(s.onTrigger({ line: 1, ch: 14 }, editor as never, null)).toBeNull();
});

test('onTrigger does NOT fire inside a 4-backtick ds-* fence', () => {
	const s = makeSuggest();
	const editor = new Editor('````ds-roll\nroll: /dsroll');
	expect(s.onTrigger({ line: 1, ch: 13 }, editor as never, null)).toBeNull();
});

test('onTrigger fires again once the cursor is back outside a properly-closed fence (regression)', () => {
	const s = makeSuggest();
	const editor = new Editor('```ds-roll\nroll: 2d6\n```\n/dsroll');
	const info = s.onTrigger({ line: 3, ch: 7 }, editor as never, null);
	expect(info).not.toBeNull();
});

test('onTrigger does NOT fire when a still-open ds- fence is followed by a line that only ' +
	'LOOKS like a closer (too short to close a 4-backtick fence) — no first-delimiter-wins mis-clearing', () => {
	const s = makeSuggest();
	// The 4-backtick opener requires a 4+-backtick (or matching) closer; this bare 3-backtick
	// line can't close it, so it's just literal content — the ds- fence is still open at
	// line 3. A walk-upward first-match guard would wrongly stop at line 2 and report "not
	// inside a fence".
	const editor = new Editor('````ds-roll\nfoo: 1\n```\n/dsroll');
	expect(s.onTrigger({ line: 3, ch: 7 }, editor as never, null)).toBeNull();
});

test('getSuggestions filters by name and alias; empty query lists all', () => {
	const s = makeSuggest();
	s.context = { editor: null as never, file: null as never, start: { line: 0, ch: 0 }, end: { line: 0, ch: 0 }, query: '' };
	expect(s.getSuggestions({ ...s.context!, query: '' })).toHaveLength(s['registry'].all().length);
	const stam = s.getSuggestions({ ...s.context!, query: 'stam' });
	expect(stam.some((d) => d.id === 'stamina-bar')).toBe(true);
});

test('selectSuggestion replaces the token range with the scaffold', () => {
	const s = makeSuggest();
	const editor = new Editor('  /dsroll');
	s.context = { editor: editor as never, file: null as never, start: { line: 0, ch: 2 }, end: { line: 0, ch: 9 }, query: 'roll' };
	const roll = s['registry'].get('roll')!;
	s.selectSuggestion(roll, null as never);
	expect(editor.writes).toHaveLength(1);
	expect(editor.writes[0].from).toEqual({ line: 0, ch: 2 });
	expect(editor.writes[0].to).toEqual({ line: 0, ch: 9 });
	expect(editor.writes[0].text.startsWith('```ds-roll\n')).toBe(true);
});

test('selectSuggestion drops the cursor at the scaffold\'s first body character, on a non-zero line', () => {
	const s = makeSuggest();
	const editor = new Editor('l0\nl1\nl2\nl3\nl4\n  /dsroll');
	// trigger token "/dsroll" starts at ch 2 on line 5 (non-zero insertion line)
	s.context = { editor: editor as never, file: null as never, start: { line: 5, ch: 2 }, end: { line: 5, ch: 9 }, query: 'roll' };
	const roll = s['registry'].get('roll')!;
	s.selectSuggestion(roll, null as never);
	// scaffold text starts "```ds-roll\n" (11 chars, one newline) — cursorOffset lands right
	// after that newline, so the cursor moves to the next line, column 0.
	expect(editor.setCursorCalls).toHaveLength(1);
	expect(editor.setCursorCalls[0]).toEqual({ line: 6, ch: 0 });
	expect(editor.cursor).toEqual({ line: 6, ch: 0 });
});
