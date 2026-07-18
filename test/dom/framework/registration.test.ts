// D8 Task 2 review fix round 1 (finding #3, LOW — contingent on #4) — registration.ts's
// "Send block to sidebar" command: now that anchor.ts's scanner is shared/uniform (finding
// #4), sendToSidebar binds the block AT the cursor rather than always the first occurrence
// of an alias in the note, falling back to the first with a Notice when the cursor's own
// block can't be pinpointed.
import { App, Editor, Notice, Plugin, flushAsync } from '../../mocks/obsidian';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { initializeElementFrameworkV2, registerFrameworkElementDefinitions } from 'main';
import { registerDseSidebar, sendToSidebar } from '@/framework/sidebar/registration';
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
});
