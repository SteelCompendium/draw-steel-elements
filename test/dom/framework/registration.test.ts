// D8 Task 2 review fix round 1 (finding #3, LOW — contingent on #4) — registration.ts's
// "Send block to sidebar" command: now that anchor.ts's scanner is shared/uniform (finding
// #4), sendToSidebar binds the block AT the cursor rather than always the first occurrence
// of an alias in the note, falling back to the first with a Notice when the cursor's own
// block can't be pinpointed.
import { App, Editor, Notice, Plugin, flushAsync } from '../../mocks/obsidian';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { initializeElementFrameworkV2, registerFrameworkElementDefinitions } from 'main';
import {
	registerDseSidebar,
	requestPinToSidebar,
	sendToSidebar,
	unregisterDseSidebar,
} from '@/framework/sidebar/registration';
import { ReadingModeBlockHost } from '@/framework/host/ReadingModeBlockHost';
import { DseSidebarView, VIEW_TYPE_DSE_SIDEBAR } from '@/framework/sidebar/DseSidebarView';
import type { DseSidebarServices } from '@/framework/sidebar/DseSidebarView';

function twoCounterBlocks(): string {
	return [
		'```ds-counter', // 0
		'current_value: 1', // 1
		'```', // 2
		'', // 3
		'```ds-counter', // 4
		'current_value: 2', // 5
		'```', // 6
	].join('\n');
}

function setup() {
	const app = new App();
	const plugin = new Plugin(app);
	// Same real-ambient-vs-mock cast as dseSidebarView.test.ts.
	const frameworkV2 = initializeElementFrameworkV2(app as any, plugin as any, DEFAULT_SETTINGS);
	registerFrameworkElementDefinitions(frameworkV2.registry);
	const services = {
		app,
		plugin,
		pipeline: frameworkV2.pipeline,
		registry: frameworkV2.registry,
	} as unknown as DseSidebarServices;
	plugin.registerView(VIEW_TYPE_DSE_SIDEBAR, ((leaf: any) => new DseSidebarView(leaf, services)) as any);
	return { app, plugin, services };
}

describe('D8 Task 2 review fix — registration.ts (finding #3)', () => {
	beforeEach(() => {
		Notice.notices.length = 0;
	});

	test('"Send block to sidebar" command gating: enabled with the cursor inside a ds-* fence, disabled outside one', () => {
		const { plugin, services } = setup();
		registerDseSidebar(plugin as any, services);
		const command = plugin.commands.find((c) => c.id === 'send-block-to-sidebar');
		expect(command).toBeDefined();

		const editor = new Editor(twoCounterBlocks());
		const ctx = { file: { path: 'Note.md' } } as any;

		editor.cursor = { line: 1, ch: 0 }; // inside the first block
		expect(command.editorCheckCallback(true, editor, ctx)).toBe(true);

		editor.cursor = { line: 3, ch: 0 }; // the blank line between blocks
		expect(command.editorCheckCallback(true, editor, ctx)).toBe(false);
	});

	test('sendToSidebar binds the occurrence AT the cursor, not always the first, when a note has multiple same-alias blocks', async () => {
		const { app, services } = setup();
		app.vault.setFile('Note.md', twoCounterBlocks());

		await sendToSidebar(services, 'Note.md', 'ds-counter', 5); // cursor inside the SECOND block
		await flushAsync();

		const content = app.vault.getContent('Note.md')!;
		const lines = content.split('\n');
		// The FIRST block must be untouched (no anchor stamped into it)...
		expect(lines.slice(0, 3).join('\n')).toBe('```ds-counter\ncurrent_value: 1\n```');
		// ...and the SECOND block (containing the cursor) got the anchor appended after its
		// body (current_value: 2 at line 5, anchor inserted right after it at line 6).
		expect(lines[5]).toBe('current_value: 2');
		expect(lines[6]).toMatch(/^_dse_anchor: [A-Za-z0-9_-]+$/);
		expect(Notice.notices).toHaveLength(0); // unambiguous — cursor pinpointed it, no Notice needed

		const view = app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0]?.view as unknown as DseSidebarView;
		expect(view).toBeInstanceOf(DseSidebarView);
		expect(view.getState()).toEqual({
			panels: [{ filePath: 'Note.md', alias: 'ds-counter', anchorId: lines[6].replace('_dse_anchor: ', '') }],
		});
	});

	test('sendToSidebar without a usable cursor position falls back to the FIRST block and surfaces a Notice naming it', async () => {
		const { app, services } = setup();
		app.vault.setFile('Note.md', twoCounterBlocks());

		await sendToSidebar(services, 'Note.md', 'ds-counter'); // no cursorLine — ambiguous fallback
		await flushAsync();

		const content = app.vault.getContent('Note.md')!;
		const lines = content.split('\n');
		expect(lines[1]).toMatch(/current_value: 1/);
		expect(lines[2]).toMatch(/^_dse_anchor: [A-Za-z0-9_-]+$/); // the FIRST block got the anchor
		// The whole note shifted down one line from the inserted anchor; the second block
		// (now at lines 5-7) is otherwise untouched.
		expect(lines[6]).toBe('current_value: 2');

		expect(Notice.notices).toHaveLength(1);
		expect(Notice.notices[0]).toContain('ds-counter');
		expect(Notice.notices[0]).toContain('line 1'); // 1-based line of the block that was chosen
	});

	test('sendToSidebar with only ONE block of the alias never fires a Notice, cursor or not', async () => {
		const { app, services } = setup();
		app.vault.setFile('Note.md', '```ds-counter\ncurrent_value: 1\n```');

		await sendToSidebar(services, 'Note.md', 'ds-counter');
		await flushAsync();

		expect(Notice.notices).toHaveLength(0);
	});

	// SC-184 fix round (MEDIUM-2) — sendToSidebar reports whether it actually bound
	// anything, so requestPinToSidebar (the chrome "Pin to sidebar" item's caller) can turn
	// a "found nothing" outcome into a Notice instead of the pre-fix-round silent no-op.
	describe('SC-184 fix round (MEDIUM-2): sendToSidebar return value + requestPinToSidebar audibility', () => {
		afterEach(() => unregisterDseSidebar());

		test('sendToSidebar resolves true when it binds a block, false when the note has no matching fence', async () => {
			const { app, services } = setup();
			app.vault.setFile('Note.md', '```ds-counter\ncurrent_value: 1\n```');
			app.vault.setFile('Empty.md', 'just some prose, no fence at all');

			await expect(sendToSidebar(services, 'Note.md', 'ds-counter')).resolves.toBe(true);
			await expect(sendToSidebar(services, 'Empty.md', 'ds-counter')).resolves.toBe(false);
			await expect(sendToSidebar(services, 'Nonexistent.md', 'ds-counter')).resolves.toBe(false);
		});

		test('requestPinToSidebar posts an audible Notice (and mounts nothing) when the block cannot be found', async () => {
			const { app, plugin, services } = setup();
			registerDseSidebar(plugin as any, services);
			app.vault.setFile('Empty.md', 'just some prose, no fence at all');

			await requestPinToSidebar('Empty.md', 'ds-counter');
			await flushAsync();

			expect(Notice.notices).toHaveLength(1);
			expect(Notice.notices[0]).toContain("couldn't find that block");
			expect(Notice.notices[0]).toContain('Empty.md');
			expect(app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0]?.view).toBeUndefined();
		});

		// SC-360 (r4 re-review LOW-B) - the pin item's own refusal wording: a hand-edited `_dse_anchor` line the
		// sidebar cannot read must NOT be answered with "couldn't find that block" (it exists), and must not
		// write a second key.
		test('requestPinToSidebar says WHY when the block\'s `_dse_anchor` line is unreadable - one Notice, note untouched, nothing mounted', async () => {
			const { app, plugin, services } = setup();
			registerDseSidebar(plugin as any, services);
			const note = '```ds-counter\ncurrent_value: 1\n_dse_anchor: abc123 # mine\n```';
			app.vault.setFile('Note.md', note);

			await requestPinToSidebar('Note.md', 'ds-counter');
			await flushAsync();

			expect(Notice.notices).toHaveLength(1);
			expect(Notice.notices[0]).toContain('_dse_anchor');
			expect(Notice.notices[0]).not.toContain("couldn't find that block");
			expect(app.vault.getContent('Note.md')).toBe(note);
			expect(app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0]?.view).toBeUndefined();
		});

		// The review's exact reproduction (probe B5): the chrome pin item hands
		// requestPinToSidebar the bare LANGUAGE token (`getBlockInfo().language`, first
		// fence-info-string token only — see ReadingModeBlockHost's OPEN_FENCE), but the
		// actual fence in the note carries extra info-string content past it. Before the
		// MEDIUM-2b alias reconciliation, anchor.ts's iterateFences compared against the
		// FULL trimmed rest of the fence-open line ("ds-counter extra"), which the bare
		// "ds-counter" alias could never match — silent no-op, no Notice, no panel.
		test('an info-string fence (```ds-counter extra```) pins correctly — no Notice, one mounted panel', async () => {
			const { app, plugin, services } = setup();
			registerDseSidebar(plugin as any, services);
			app.vault.setFile('Note.md', '```ds-counter extra\ncurrent_value: 5\n```');

			// "ds-counter" — exactly what ReadingModeBlockHost.getBlockInfo().language derives
			// for this fence (first token only), i.e. what pipeline.ts's "pin" item passes.
			await requestPinToSidebar('Note.md', 'ds-counter');
			await flushAsync();

			expect(Notice.notices).toHaveLength(0);
			const view = app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0]?.view as unknown as DseSidebarView;
			expect(view).toBeInstanceOf(DseSidebarView);
			expect(view.getState()).toMatchObject({
				panels: [expect.objectContaining({ filePath: 'Note.md', alias: 'ds-counter' })],
			});
			// The note carries the stamped anchor and is otherwise unmodified — same
			// byte-integrity guarantee every other pin path gets.
			expect(app.vault.getContent('Note.md')).toContain('```ds-counter extra');
		});

		// The two entry points must now agree — see aliasAtLine's own doc (registration.ts)
		// for why it derives its alias the same way (`fenceAlias`) as iterateFences.
		test('the older "Send block to sidebar" command pins the SAME info-string fence, identically', async () => {
			const { app, plugin, services } = setup();
			registerDseSidebar(plugin as any, services);
			app.vault.setFile('Note.md', '```ds-counter extra\ncurrent_value: 5\n```');
			const command = plugin.commands.find((c) => c.id === 'send-block-to-sidebar');
			const editor = new Editor('```ds-counter extra\ncurrent_value: 5\n```');
			const ctx = { file: { path: 'Note.md' } } as any;
			editor.cursor = { line: 1, ch: 0 }; // inside the block

			expect(command.editorCheckCallback(true, editor, ctx)).toBe(true);
			command.editorCheckCallback(false, editor, ctx);
			await flushAsync();

			expect(Notice.notices).toHaveLength(0);
			const view = app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0]?.view as unknown as DseSidebarView;
			expect(view).toBeInstanceOf(DseSidebarView);
			expect(view.getState()).toMatchObject({
				panels: [expect.objectContaining({ filePath: 'Note.md', alias: 'ds-counter' })],
			});
		});
	});

	// SC-457 — a fence with whitespace before the language. Its language is `ds-counter` for every entry point:
	// the command's cursor scan (`aliasAtLine`) and the alias the chrome pin item passes (getBlockInfo().language).
	describe('SC-457: pinning a fence with whitespace before the language', () => {
		test.each([
			['one space', '``` ds-counter'],
			['a tab', '```\tds-counter'],
		])('the "Send block to sidebar" command pins it (%s), the note otherwise unmodified', async (_label, opener) => {
			const { app, plugin, services } = setup();
			registerDseSidebar(plugin as any, services);
			const note = `${opener}\ncurrent_value: 5\n\`\`\``;
			app.vault.setFile('Note.md', note);
			const command = plugin.commands.find((c) => c.id === 'send-block-to-sidebar');
			const editor = new Editor(note);
			const ctx = { file: { path: 'Note.md' } } as any;
			editor.cursor = { line: 1, ch: 0 };

			expect(command.editorCheckCallback(true, editor, ctx)).toBe(true);
			command.editorCheckCallback(false, editor, ctx);
			await flushAsync();

			expect(Notice.notices).toHaveLength(0);
			const view = app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0]?.view as unknown as DseSidebarView;
			expect(view.getState()).toMatchObject({ panels: [expect.objectContaining({ filePath: 'Note.md', alias: 'ds-counter' })] });
			expect(app.vault.getContent('Note.md')!.split('\n')[0]).toBe(opener);
		});
	});

	// SC-457 re-review r3 — the chrome "Pin to sidebar" item passes the HOST's `getBlockInfo().language` to
	// requestPinToSidebar. For a block with extra info words after a no-break space / U+3000 that used to be
	// `ds-counter<U+3000>`: the pin stamped an `_dse_anchor` but bound a panel that could never find its block.
	describe('SC-457: the pin-to-sidebar path for a block with extra info words', () => {
		test.each([
			['two spaces then a word', 'ds-counter  extra'],
			['a trailing U+3000 then a word', 'ds-counter\u3000 extra'],
			['a no-break space right after the name (Live Preview renders it as the block)', 'ds-counter\u00a0x'],
			['one space then a word', 'ds-counter x'],
			['a leading space, a trailing no-break space, then a word', ' ds-counter\u00a0 extra'],
			// SC-487: Live Preview renders these as the block (it ends the name at a zero-width character); the pin used to bind an alias
			// with the character in it, stamp an anchor, and mount the "unavailable" card
			['a trailing zero-width space (Live Preview renders it as the block)', 'ds-counter\u200b'],
			['a zero-width non-joiner, then a word', 'ds-counter\u200cx'],
			['a word joiner, then a word', 'ds-counter\u2060 extra'],
		])('%s: the host reports ds-counter, and pinning that alias binds the block (anchor stamped, panel holds it)', async (_label, info) => {
			const { app, plugin, services } = setup();
			registerDseSidebar(plugin as any, services);
			const note = ['# N', '', `\`\`\`${info}`, 'current_value: 5', '```'].join('\n');
			app.vault.setFile('Note.md', note);
			const ctx = { docId: 'd', sourcePath: 'Note.md', frontmatter: undefined, addChild: () => {}, getSectionInfo: () => ({ text: note, lineStart: 2, lineEnd: 4 }) };
			const host = new ReadingModeBlockHost(plugin as any, document.createElement('div'), ctx as any, 'ds-counter');
			const alias = host.getBlockInfo()!.language;
			expect(alias).toBe('ds-counter');

			await requestPinToSidebar('Note.md', alias, host.getBlockInfo()!.lineStart);
			await flushAsync();

			expect(Notice.notices).toHaveLength(0);
			const stamped = app.vault.getContent('Note.md')!;
			const id = /_dse_anchor: ([A-Za-z0-9_-]+)/.exec(stamped)?.[1];
			expect(id).toBeDefined();
			expect(stamped.split('\n')[2]).toBe(`\`\`\`${info}`);
			const view = app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0]?.view as unknown as DseSidebarView;
			expect(view.getState()).toMatchObject({ panels: [expect.objectContaining({ filePath: 'Note.md', alias: 'ds-counter', anchorId: id })] });
		});
	});

	// SC-487 — a block whose type the sidebar cannot mount (no element registered under that alias) must not get an
	// `_dse_anchor` stamped into the note: the panel could only ever show "unavailable" and a save from it is lost.
	// The check sits in the shared bind path, so every entry point that stamps refuses alike: note bytes unchanged,
	// one Notice, nothing mounted.
	describe('SC-487: no anchor for a type the sidebar cannot mount', () => {
		const ZWSP = String.fromCharCode(0x200b);
		const unmountable: Array<[string, string]> = [
			['an unregistered name', 'ds-nonesuch'],
			['a registered name plus a zero-width space', `ds-counter${ZWSP}`],
			['an element ID (no code-block processor is registered under it)', 'statblock'],
			['an unrelated language', 'js'],
		];
		const noteFor = (alias: string) => ['# N', '', `\`\`\`${alias}`, 'current_value: 5', '```', ''].join('\n');
		const sidebarLeaf = (app: App) => app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0]?.view;

		test.each(unmountable)('requestPinToSidebar (the chrome "Pin to sidebar" item) refuses %s: note byte-identical, one Notice, nothing mounted', async (_label, alias) => {
			const { app, plugin, services } = setup();
			registerDseSidebar(plugin as any, services);
			const note = noteFor(alias);
			app.vault.setFile('Note.md', note);

			await requestPinToSidebar('Note.md', alias, 2);
			await flushAsync();

			expect(app.vault.getContent('Note.md')).toBe(note);
			expect(Notice.notices).toHaveLength(1);
			expect(Notice.notices[0]).toContain('sidebar can show');
			expect(Notice.notices[0]).not.toContain("couldn't find that block");
			expect(sidebarLeaf(app)).toBeUndefined();
		});

		test.each(unmountable)('sendToSidebar (the initiative command and the encounter hand-off call it) refuses %s: resolves false, note byte-identical, one Notice', async (_label, alias) => {
			const { app, services } = setup();
			const note = noteFor(alias);
			app.vault.setFile('Note.md', note);

			await expect(sendToSidebar(services, 'Note.md', alias, 2)).resolves.toBe(false);
			await flushAsync();

			expect(app.vault.getContent('Note.md')).toBe(note);
			expect(Notice.notices).toHaveLength(1);
			expect(sidebarLeaf(app)).toBeUndefined();
		});

		test('the "Send block to sidebar" command refuses a fence of another plugin (```js): note byte-identical, one Notice, nothing mounted', async () => {
			const { app, plugin, services } = setup();
			registerDseSidebar(plugin as any, services);
			const note = noteFor('js');
			app.vault.setFile('Note.md', note);
			const command = plugin.commands.find((c) => c.id === 'send-block-to-sidebar');
			const editor = new Editor(note);
			editor.cursor = { line: 3, ch: 0 };

			command.editorCheckCallback(false, editor, { file: { path: 'Note.md' } } as any);
			await flushAsync();

			expect(app.vault.getContent('Note.md')).toBe(note);
			expect(Notice.notices).toHaveLength(1);
			expect(sidebarLeaf(app)).toBeUndefined();
		});

		test('a registered alias is unaffected: the pin stamps an anchor and mounts the panel, no Notice', async () => {
			const { app, plugin, services } = setup();
			registerDseSidebar(plugin as any, services);
			app.vault.setFile('Note.md', noteFor('ds-counter'));

			await requestPinToSidebar('Note.md', 'ds-counter', 2);
			await flushAsync();

			expect(Notice.notices).toHaveLength(0);
			expect(app.vault.getContent('Note.md')).toMatch(/_dse_anchor: [A-Za-z0-9_-]+/);
			expect(sidebarLeaf(app)).toBeInstanceOf(DseSidebarView);
		});
	});

	// SC-453 — stamping a `_dse_anchor` into a CRLF note: the pin used to find NO fence at all
	// (FENCE_LINE never matches `\r`), so nothing bound; once found, the stamped line must carry
	// the note's own ending so the note does not turn mixed-ending on first pin.
	describe('SC-453: sendToSidebar on a CRLF note', () => {
		const crlf = (lines: string[]): string => lines.join('\r\n');

		test('binds the block and stamps the anchor with CRLF: the note stays all-CRLF, content outside the block byte-identical', async () => {
			const { app, services } = setup();
			app.vault.setFile('Note.md', crlf(['# Notes', '', '```ds-counter', 'current_value: 1', '```', '', 'tail']));

			await expect(sendToSidebar(services, 'Note.md', 'ds-counter')).resolves.toBe(true);

			const out = app.vault.getContent('Note.md')!;
			expect(out).toMatch(/^# Notes\r\n\r\n```ds-counter\r\ncurrent_value: 1\r\n_dse_anchor: [A-Za-z0-9_-]+\r\n```\r\n\r\ntail$/);
			expect(out.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
		});

		test('binds the occurrence AT the cursor among two same-kind blocks and leaves the other untouched', async () => {
			const { app, services } = setup();
			const note = crlf(['```ds-counter', 'current_value: 1', '```', '', '```ds-counter', 'current_value: 2', '```']);
			app.vault.setFile('Note.md', note);

			await sendToSidebar(services, 'Note.md', 'ds-counter', 5);

			const out = app.vault.getContent('Note.md')!;
			expect(out.startsWith(crlf(['```ds-counter', 'current_value: 1', '```', '', '```ds-counter', 'current_value: 2', '_dse_anchor: ']))).toBe(true);
			expect(out.match(/_dse_anchor/g)).toHaveLength(1);
			expect(out.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
		});

		test('a block that is already anchored is bound without a write (note byte-identical)', async () => {
			const { app, services } = setup();
			const note = crlf(['```ds-counter', 'current_value: 1', '_dse_anchor: abc123', '```']);
			app.vault.setFile('Note.md', note);

			await expect(sendToSidebar(services, 'Note.md', 'ds-counter')).resolves.toBe(true);

			expect(app.vault.getContent('Note.md')).toBe(note);
		});

		test('a strict-body block (ds-scc) in a CRLF note is bound by its LF body and the note is left byte-identical', async () => {
			const { app, services } = setup();
			const note = crlf(['# Notes', '', '```ds-scc', 'mcdm.heroes.v1/feature.ability.fury.level-1/gouge', '```']);
			app.vault.setFile('Note.md', note);

			await expect(sendToSidebar(services, 'Note.md', 'ds-scc')).resolves.toBe(true);

			expect(app.vault.getContent('Note.md')).toBe(note);
			const view = app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0]?.view as unknown as DseSidebarView;
			expect(view.getState()).toMatchObject({
				panels: [expect.objectContaining({ alias: 'ds-scc', body: 'mcdm.heroes.v1/feature.ability.fury.level-1/gouge' })],
			});
		});

		test('an all-LF note is stamped exactly as before (LF joiner, byte-identical regression guard)', async () => {
			const { app, services } = setup();
			app.vault.setFile('Note.md', ['# Notes', '', '```ds-counter', 'current_value: 1', '```', 'tail'].join('\n'));

			await sendToSidebar(services, 'Note.md', 'ds-counter');

			expect(app.vault.getContent('Note.md')).toMatch(/^# Notes\n\n```ds-counter\ncurrent_value: 1\n_dse_anchor: [A-Za-z0-9_-]+\n```\ntail$/);
		});

		test('a CRLF block with an empty body is stamped with CRLF too', async () => {
			const { app, services } = setup();
			app.vault.setFile('Note.md', crlf(['```ds-counter', '```', 'tail']));

			await sendToSidebar(services, 'Note.md', 'ds-counter');

			expect(app.vault.getContent('Note.md')).toMatch(/^```ds-counter\r\n_dse_anchor: [A-Za-z0-9_-]+\r\n```\r\ntail$/);
		});
	});
});

// SC-455 — pinning a block that sits inside a blockquote / callout: the command sees the fence under
// the cursor, the anchor is stamped INSIDE the quote with the block's own prefix, and nothing else in
// the note moves.
describe('SC-455: sendToSidebar on a block inside a blockquote / callout', () => {
	beforeEach(() => {
		Notice.notices.length = 0;
	});
	const calloutNote = (): string =>
		['# Notes', '', '> [!note] Title', '> text above', '> ```ds-counter', '> current_value: 1', '> ```', '> text below', '', 'tail'].join('\n');

	test('"Send block to sidebar" is enabled with the cursor inside a fence in a callout, disabled on the callout text', () => {
		const { plugin, services } = setup();
		registerDseSidebar(plugin as any, services);
		const command = plugin.commands.find((c) => c.id === 'send-block-to-sidebar');
		const editor = new Editor(calloutNote());
		const ctx = { file: { path: 'Note.md' } } as any;

		editor.cursor = { line: 5, ch: 0 }; // `> current_value: 1`
		expect(command.editorCheckCallback(true, editor, ctx)).toBe(true);
		editor.cursor = { line: 3, ch: 0 }; // `> text above`
		expect(command.editorCheckCallback(true, editor, ctx)).toBe(false);
		editor.cursor = { line: 7, ch: 0 }; // `> text below`, after the quoted fence closed
		expect(command.editorCheckCallback(true, editor, ctx)).toBe(false);
	});

	test('the anchor is stamped inside the callout with the `> ` prefix; everything else is byte-identical', async () => {
		const { app, services } = setup();
		app.vault.setFile('Note.md', calloutNote());

		await expect(sendToSidebar(services, 'Note.md', 'ds-counter', 5)).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toMatch(
			/^# Notes\n\n> \[!note\] Title\n> text above\n> ```ds-counter\n> current_value: 1\n> _dse_anchor: [A-Za-z0-9_-]+\n> ```\n> text below\n\ntail$/,
		);
	});

	test('a nested `> > ` block, a `>` with no space and a CRLF callout are stamped with their own prefix and ending', async () => {
		const { app, services } = setup();
		app.vault.setFile('Note.md', ['> [!a]', '> > [!b]', '> > ```ds-counter', '> > current_value: 1', '> > ```'].join('\n'));
		await sendToSidebar(services, 'Note.md', 'ds-counter');
		expect(app.vault.getContent('Note.md')).toMatch(/^> \[!a\]\n> > \[!b\]\n> > ```ds-counter\n> > current_value: 1\n> > _dse_anchor: [A-Za-z0-9_-]+\n> > ```$/);

		app.vault.setFile('Note.md', ['>```ds-counter', '>current_value: 1', '>```'].join('\n'));
		await sendToSidebar(services, 'Note.md', 'ds-counter');
		expect(app.vault.getContent('Note.md')).toMatch(/^>```ds-counter\n>current_value: 1\n>_dse_anchor: [A-Za-z0-9_-]+\n>```$/);

		app.vault.setFile('Note.md', ['> [!a]', '> ```ds-counter', '> current_value: 1', '> ```'].join('\r\n'));
		await sendToSidebar(services, 'Note.md', 'ds-counter');
		const out = app.vault.getContent('Note.md')!;
		expect(out).toMatch(/^> \[!a\]\r\n> ```ds-counter\r\n> current_value: 1\r\n> _dse_anchor: [A-Za-z0-9_-]+\r\n> ```$/);
		expect(out.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
	});

	test('with two blocks in the callout, the cursor picks the right one and the other is untouched', async () => {
		const { app, services } = setup();
		app.vault.setFile('Note.md', ['> [!note]', '> ```ds-counter', '> current_value: 1', '> ```', '> mid', '> ```ds-counter', '> current_value: 2', '> ```'].join('\n'));

		await sendToSidebar(services, 'Note.md', 'ds-counter', 6);

		const out = app.vault.getContent('Note.md')!;
		expect(out.startsWith(['> [!note]', '> ```ds-counter', '> current_value: 1', '> ```', '> mid', '> ```ds-counter', '> current_value: 2', '> _dse_anchor: '].join('\n'))).toBe(true);
		expect(out.match(/_dse_anchor/g)).toHaveLength(1);
	});

	test('a strict-body block (ds-scc) in a callout is bound by its prefix-free body and the note is left byte-identical', async () => {
		const { app, services } = setup();
		const note = ['> [!note]', '> ```ds-scc', '> mcdm.heroes.v1/feature.ability.fury.level-1/gouge', '> ```'].join('\n');
		app.vault.setFile('Note.md', note);

		await expect(sendToSidebar(services, 'Note.md', 'ds-scc')).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(note);
		const view = app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0]?.view as unknown as DseSidebarView;
		expect(view.getState()).toMatchObject({
			panels: [expect.objectContaining({ alias: 'ds-scc', body: 'mcdm.heroes.v1/feature.ability.fury.level-1/gouge' })],
		});
	});

	test('a block already anchored inside a callout is bound without a write', async () => {
		const { app, services } = setup();
		const note = ['> [!note]', '> ```ds-counter', '> current_value: 1', '> _dse_anchor: abc123', '> ```'].join('\n');
		app.vault.setFile('Note.md', note);

		await expect(sendToSidebar(services, 'Note.md', 'ds-counter')).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(note);
	});
});

// SC-460 — a lone CR above the block. The editor cursor line (CodeMirror) and Obsidian's section line
// numbers both count a lone CR as a break, so the block "at the cursor" must be found in that numbering
// or a pin from the close fence of a block picks the wrong one.
describe('SC-460: sendToSidebar on a note with lone CRs', () => {
	beforeEach(() => {
		Notice.notices.length = 0;
	});
	const twoBlocks = (): string =>
		[
			'# Notes', // 0
			'a\rb', // 1, 2
			'```ds-counter', // 3
			'current_value: 1', // 4
			'```', // 5
			'mid\rdle', // 6, 7
			'```ds-counter', // 8
			'current_value: 2', // 9
			'```', // 10
			'tail', // 11
		].join('\n');

	test('the cursor on the CLOSE fence of the second block pins the second block, with no "multiple blocks" Notice', async () => {
		const { app, services } = setup();
		app.vault.setFile('Note.md', twoBlocks());

		await expect(sendToSidebar(services, 'Note.md', 'ds-counter', 10)).resolves.toBe(true);

		const out = app.vault.getContent('Note.md')!;
		expect(out).toMatch(/^# Notes\na\rb\n```ds-counter\ncurrent_value: 1\n```\nmid\rdle\n```ds-counter\ncurrent_value: 2\n_dse_anchor: [A-Za-z0-9_-]+\n```\ntail$/);
		expect(Notice.notices).toHaveLength(0);
	});

	test('a pin from the chrome menu (the cursor line is the block\'s own Obsidian line) picks the right block', async () => {
		const { app, services, plugin } = setup();
		registerDseSidebar(plugin as any, services);
		app.vault.setFile('Note.md', twoBlocks());

		await requestPinToSidebar('Note.md', 'ds-counter', 8);

		const out = app.vault.getContent('Note.md')!;
		expect(out.match(/_dse_anchor/g)).toHaveLength(1);
		expect(out).toMatch(/current_value: 2\n_dse_anchor: [A-Za-z0-9_-]+\n```\ntail$/);
		expect(Notice.notices).toHaveLength(0);
		unregisterDseSidebar();
	});

	test('a CRLF note with a lone CR above is stamped with CRLF and the lone CR is kept', async () => {
		const { app, services } = setup();
		app.vault.setFile('Note.md', ['# Notes', 'a\rb', '```ds-counter', 'current_value: 1', '```', 'tail'].join('\r\n'));

		await expect(sendToSidebar(services, 'Note.md', 'ds-counter')).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toMatch(/^# Notes\r\na\rb\r\n```ds-counter\r\ncurrent_value: 1\r\n_dse_anchor: [A-Za-z0-9_-]+\r\n```\r\ntail$/);
	});

	test('a CR-only note is stamped with CR terminators: the note stays CR-only', async () => {
		const { app, services } = setup();
		app.vault.setFile('Note.md', ['# Notes', '', '```ds-counter', 'current_value: 1', '```', 'tail', ''].join('\r'));

		await expect(sendToSidebar(services, 'Note.md', 'ds-counter')).resolves.toBe(true);

		const out = app.vault.getContent('Note.md')!;
		expect(out).toMatch(/^# Notes\r\r```ds-counter\rcurrent_value: 1\r_dse_anchor: [A-Za-z0-9_-]+\r```\rtail\r$/);
		expect(out).not.toContain('\n');
	});

	test('a note with no lone CR is stamped exactly as before (regression guard)', async () => {
		const { app, services } = setup();
		app.vault.setFile('Note.md', twoBlocks().replace(/\r/g, '\n'));

		await sendToSidebar(services, 'Note.md', 'ds-counter', 10);

		expect(app.vault.getContent('Note.md')).toMatch(/current_value: 2\n_dse_anchor: [A-Za-z0-9_-]+\n```\ntail$/);
	});
});
