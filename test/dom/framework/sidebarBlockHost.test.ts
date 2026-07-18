// D8 Task 2 — SidebarBlockHost: the file-backed-by-anchor-id BlockHost the sidebar uses
// instead of ReadingModeBlockHost's ctx.getSectionInfo. Uses test/fakes/fakeObsidian.ts
// (not test/mocks/obsidian-core.ts's FakeVault) because THIS is the fake with real
// vault.on/emit event delivery — see that file's process()/cachedRead() doc comments —
// which the self-echo / external-modify assertions below need to actually exercise.
import { Component } from 'obsidian';
import type { App, Plugin, TFile } from 'obsidian';
import { flushAsync } from '../../mocks/obsidian';
import { makeFakeApp, seedNote, fakeTFile } from '../../fakes/fakeObsidian';
import { SidebarBlockHost } from '@/framework/host/SidebarBlockHost';

const ANCHOR_ID = 'abc123';
const ALIAS = 'ds-counter';

function fencedNote(): string {
	return ['# Notes', '', '```ds-counter', 'current_value: 1', `_dse_anchor: ${ANCHOR_ID}`, '```', '', 'tail'].join(
		'\n',
	);
}

function setup(content = fencedNote()) {
	const { app, vault } = makeFakeApp();
	const file = seedNote(vault, 'Note.md', content);
	return { app, vault, file };
}

function makeHost(app: App, file: TFile, onExternalChange: (body: string) => void = () => {}) {
	// Structural stub: SidebarBlockHost only ever touches plugin.app.vault.{on,cachedRead,
	// process} (registerEvent is called against `owner`, not `plugin` — see that file's
	// ctor doc). A real mock Plugin instance would need its OWN `.app` reassigned to this
	// `app` anyway to share the fake vault's real event delivery, so a minimal stub is
	// both simpler and exactly as correct.
	const plugin = { app } as unknown as Plugin;
	const owner = new Component();
	const containerEl = document.createElement('div');
	const host = new SidebarBlockHost(plugin, file, ALIAS, ANCHOR_ID, containerEl, owner, onExternalChange);
	return { host, owner, containerEl };
}

describe('D8 Task 2: SidebarBlockHost (spec §1.4)', () => {
	test('getBlockInfo locates the anchored fence by id, surviving line drift elsewhere in the note', async () => {
		const { vault, file, app } = setup();
		const { host } = makeHost(app, file);
		await host.refresh();

		expect(host.getBlockInfo()).toEqual({ language: ALIAS, lineStart: 2, lineEnd: 5 });

		// Prepend unrelated lines directly in the vault (simulating an external edit
		// elsewhere in the note) and deliver the real "modify" event — the id, not a
		// cached lineStart, must relocate the block.
		const drifted = ['New heading', '', 'More prose above the block.', '', fencedNote()].join('\n');
		vault.setText('Note.md', drifted);
		vault.emit('modify', fakeTFile('Note.md'));
		await flushAsync();

		expect(host.getBlockInfo()).toEqual({ language: ALIAS, lineStart: 6, lineEnd: 9 });
	});

	test('replaceSource writes byte-stably: fences + alias + anchor preserved, no spurious blank line before the close fence', async () => {
		const { vault, file, app } = setup();
		const { host } = makeHost(app, file);
		await host.refresh();

		const ok = await host.replaceSource(`current_value: 5\n_dse_anchor: ${ANCHOR_ID}`);

		expect(ok).toBe(true);
		const updated = vault.text('Note.md')!;
		const lines = updated.split('\n');
		expect(lines[0]).toBe('# Notes');
		expect(lines[2]).toBe('```ds-counter'); // original alias preserved
		expect(lines[3]).toBe('current_value: 5');
		expect(lines[4]).toBe(`_dse_anchor: ${ANCHOR_ID}`);
		expect(lines[5]).toBe('```'); // no spurious blank line inserted before the close fence
		expect(lines[6]).toBe('');
		expect(lines[7]).toBe('tail');
	});

	test('canPersist flips false and replaceSource resolves false (never throws) once the anchored block is deleted from the note', async () => {
		const { vault, file, app } = setup();
		const { host } = makeHost(app, file);
		await host.refresh();
		expect(host.canPersist).toBe(true);

		vault.setText('Note.md', 'the block is gone; only prose remains');
		vault.emit('modify', fakeTFile('Note.md'));
		await flushAsync();

		expect(host.canPersist).toBe(false);
		await expect(host.replaceSource('current_value: 9')).resolves.toBe(false);
		expect(vault.text('Note.md')).toBe('the block is gone; only prose remains'); // untouched
	});

	test('self-echo guard: our own replaceSource does not fire onExternalChange; a genuine external edit does', async () => {
		const { vault, file, app } = setup();
		const onExternalChange = jest.fn();
		const { host } = makeHost(app, file, onExternalChange);
		await host.refresh();

		await host.replaceSource(`current_value: 9\n_dse_anchor: ${ANCHOR_ID}`);
		await flushAsync(); // let our own write's "modify" event propagate through the host
		expect(onExternalChange).not.toHaveBeenCalled();

		const afterOwnWrite = vault.text('Note.md')!;
		const externallyEdited = afterOwnWrite.replace('current_value: 9', 'current_value: 42');
		vault.setText('Note.md', externallyEdited);
		vault.emit('modify', fakeTFile('Note.md'));
		await flushAsync();

		expect(onExternalChange).toHaveBeenCalledTimes(1);
		expect(onExternalChange).toHaveBeenCalledWith(`current_value: 42\n_dse_anchor: ${ANCHOR_ID}`);
	});

	test('blockKey is filePath::alias::anchorId', async () => {
		const { file, app } = setup();
		const { host } = makeHost(app, file);
		expect(host.blockKey()).toBe(`Note.md::${ALIAS}::${ANCHOR_ID}`);
	});

	test('addChild proxies to the owner Component (not the plugin)', async () => {
		const { file, app } = setup();
		const { host, owner } = makeHost(app, file);
		const child = new Component();
		const returned = host.addChild(child);
		expect(returned).toBe(child);
		let unloaded = false;
		child.onunload = () => {
			unloaded = true;
		};
		owner.removeChild(child);
		expect(unloaded).toBe(true);
	});
});
