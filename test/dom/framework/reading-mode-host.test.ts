// T-5 (Plan 02): ReadingModeBlockHost — the reading-mode mode adapter + persisted-write
// path (F1 §3.4, §4.2, §4.3, §4.4).
//
// This is the fixed-and-proven counterpart to the legacy CB-3/CB-5 bugs still tracked
// (as test.failing) against CodeBlocks in test/unit/utils/code-blocks.test.ts:
//   - CB-3 (lost update): legacy vault.read → splice → vault.modify is non-atomic; the
//     host below uses Vault.process (atomic on the vault fake by construction — see
//     FakeVault.process's doc comment) and re-resolves the block's position at write
//     time, so concurrent writes to different blocks in the same note both survive.
//   - CB-5 (alias rewrite): legacy always re-emits the *canonical* language passed to
//     updateCodeBlock, losing whatever alias the user actually typed. The host below
//     re-parses the fence line from the live document on every write and reuses
//     exactly what it finds — the constructor's `alias` argument is never used to
//     reconstruct the fence.
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { App, Component, Plugin, makeFakeContext } from '../../mocks/obsidian';
import type { MarkdownPostProcessorContext } from '../../mocks/obsidian';

const NOTE = [
	'# Session notes',
	'',
	'Before text.',
	'',
	'```ds-it',
	'heroes: []',
	'enemy_groups: []',
	'```',
	'',
	'After text.',
].join('\n');

describe('T-5 (Plan 02): ReadingModeBlockHost (F1 §3.4)', () => {
	describe('replaceSource', () => {
		test('splices exactly the block body; surrounding note intact; fence + alias preserved', async () => {
			const app = new App();
			app.vault.setFile('Note.md', NOTE);
			const plugin = new Plugin(app);
			const ctx = makeFakeContext(app, 'Note.md');
			// Constructed with the CANONICAL alias ("ds-initiative"), matching how the
			// pipeline would register the definition's canonical language — but the
			// document actually opens the block with "ds-it". The written fence must
			// stay "ds-it" (CB-5 fix): replaceSource never rewrites to the canonical form.
			const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-initiative');

			const ok = await host.replaceSource('heroes: []\nenemy_groups: [goblins]');

			expect(ok).toBe(true);
			const updated = app.vault.getContent('Note.md')!;
			const lines = updated.split('\n');
			expect(lines[0]).toBe('# Session notes');
			expect(lines[2]).toBe('Before text.');
			expect(lines[4]).toBe('```ds-it'); // original alias preserved, not "ds-initiative"
			expect(updated).toContain('enemy_groups: [goblins]');
			expect(updated).not.toContain('enemy_groups: []');
			expect(lines[7]).toBe('```');
			expect(lines[9]).toBe('After text.');
			expect(app.vault.modifyCalls).toHaveLength(1);
		});

		test('resolves false (no write) when the vault has no file at sourcePath', async () => {
			const app = new App();
			const plugin = new Plugin(app);
			const el = document.createElement('div');
			// Hand-rolled ctx: section info resolves (so canPersist is true), but there is
			// no backing vault file — isolates the file-lookup guard inside replaceSource
			// from the canPersist/getSectionInfo check exercised elsewhere in this file.
			const ctx: MarkdownPostProcessorContext = {
				docId: 'fake-doc-missing',
				sourcePath: 'Missing.md',
				frontmatter: undefined,
				addChild: () => {},
				getSectionInfo: () => ({ text: '```ds-counter\nname: A\n```', lineStart: 0, lineEnd: 2 }),
			};
			const host = new ReadingModeBlockHost(plugin as any, el, ctx as any, 'ds-counter');

			expect(host.canPersist).toBe(true);
			await expect(host.replaceSource('name: B')).resolves.toBe(false);
			expect(app.vault.modifyCalls).toHaveLength(0);
		});

		test('block vanished under us: fence unlocatable inside Vault.process aborts without corrupting the note, resolves false', async () => {
			// Hand-rolled ctx (like the "no backing vault file" case above): getSectionInfo
			// is a fixed stub — it keeps returning a section (so the canPersist guard and
			// replaceSource's own pre-process snapshot both pass), but the actual vault
			// content at that lineStart is NOT a fence line. This models the file header's
			// "block moved/vanished under us" case: something changed the live document
			// (e.g. the fence was deleted/edited) between when the section was located and
			// when Vault.process's callback runs against the real content — replaceSource
			// must detect that inside the callback (parseOpenFence returns null) and abort
			// rather than splice garbage into the note.
			const app = new App();
			const original = 'no fence here\nsecond line\nthird line';
			app.vault.setFile('Note.md', original);
			const plugin = new Plugin(app);
			const el = document.createElement('div');
			const ctx: MarkdownPostProcessorContext = {
				docId: 'fake-doc-vanished',
				sourcePath: 'Note.md',
				frontmatter: undefined,
				addChild: () => {},
				getSectionInfo: () => ({ text: '```ds-counter\nname: A\n```', lineStart: 0, lineEnd: 2 }),
			};
			const host = new ReadingModeBlockHost(plugin as any, el, ctx as any, 'ds-counter');

			expect(host.canPersist).toBe(true); // past the pre-checks; the abort must happen INSIDE process()
			await expect(host.replaceSource('name: B')).resolves.toBe(false); // documented "no write" value
			expect(app.vault.getContent('Note.md')).toBe(original); // content returned unchanged, no corruption
		});
	});

	describe('CB-3 fix: atomic concurrent writes', () => {
		test('two concurrent replaceSource calls to different (shifting) blocks both survive', async () => {
			const app = new App();
			const note = [
				'```ds-counter',
				'name: A',
				'current_value: 1',
				'```',
				'',
				'```ds-counter',
				'name: B',
				'current_value: 1',
				'```',
			].join('\n');
			app.vault.setFile('Note.md', note);
			const plugin = new Plugin(app);
			const ctxA = makeFakeContext(app, 'Note.md', 0);
			const ctxB = makeFakeContext(app, 'Note.md', 1);
			const hostA = new ReadingModeBlockHost(plugin as any, ctxA.el, ctxA as any, 'ds-counter');
			const hostB = new ReadingModeBlockHost(plugin as any, ctxB.el, ctxB as any, 'ds-counter');

			// A's write GROWS the block by a line, shifting block B's actual position in
			// the document. This proves replaceSource re-resolves the block's position at
			// write time (via a fresh getSectionInfo + fence re-parse inside the Vault.process
			// callback) rather than trusting a lineStart cached before A's concurrent write
			// landed — a naive cache would either corrupt the note or silently drop B's write.
			const [okA, okB] = await Promise.all([
				hostA.replaceSource('name: A\ncurrent_value: 2\nnote: extra'),
				hostB.replaceSource('name: B\ncurrent_value: 2'),
			]);

			expect(okA).toBe(true);
			expect(okB).toBe(true);
			const updated = app.vault.getContent('Note.md')!;
			expect(updated).toContain('name: A\ncurrent_value: 2\nnote: extra');
			expect(updated).toContain('name: B\ncurrent_value: 2');
			// Exactly two open fences survive — no duplication/corruption from the race.
			expect(updated.split('```ds-counter')).toHaveLength(3);
			expect(app.vault.modifyCalls).toHaveLength(2);
		});
	});

	describe('getBlockInfo', () => {
		test('returns {language, lineStart, lineEnd} parsed from the live fence', () => {
			const app = new App();
			app.vault.setFile('Note.md', NOTE);
			const plugin = new Plugin(app);
			const ctx = makeFakeContext(app, 'Note.md');
			const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-initiative');

			expect(host.getBlockInfo()).toEqual({ language: 'ds-it', lineStart: 4, lineEnd: 7 });
		});

		test('returns null when the block cannot be located (section info null)', () => {
			const app = new App();
			app.vault.setFile('Note.md', '# No block here');
			const plugin = new Plugin(app);
			const ctx = makeFakeContext(app, 'Note.md');
			const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-counter');

			expect(host.getBlockInfo()).toBeNull();
		});
	});

	describe('canPersist / non-addressable contexts (F1 §4.4)', () => {
		test('canPersist is false and replaceSource resolves false when section info is null', async () => {
			const app = new App();
			app.vault.setFile('Note.md', '# No block here');
			const plugin = new Plugin(app);
			const ctx = makeFakeContext(app, 'Note.md');
			const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-counter');

			expect(host.canPersist).toBe(false);
			await expect(host.replaceSource('a: 1')).resolves.toBe(false);
			expect(app.vault.modifyCalls).toHaveLength(0);
		});

		test('canvas context (sourcePath === "") is never persistable, even if section info resolves', async () => {
			// Models the legacy quirk (CodeBlocks.findCanvasNodeAndUpdate) where
			// ctx.getSectionInfo(ctx.el) CAN resolve for a canvas text node despite there
			// being no addressable vault file. F1 §4.4/§9 quarantines (does not port) the
			// canvas selection-matching fallback: sourcePath === "" always short-circuits
			// to canPersist=false / replaceSource=false, never a console.log.
			const app = new App();
			const plugin = new Plugin(app);
			const el = document.createElement('div');
			const canvasCtx: MarkdownPostProcessorContext = {
				docId: 'fake-doc-canvas',
				sourcePath: '',
				frontmatter: undefined,
				addChild: () => {},
				getSectionInfo: () => ({ text: '```ds-counter\nname: A\n```', lineStart: 0, lineEnd: 2 }),
			};
			const host = new ReadingModeBlockHost(plugin as any, el, canvasCtx as any, 'ds-counter');

			expect(host.canPersist).toBe(false);
			expect(host.getBlockInfo()).toBeNull();
			await expect(host.replaceSource('name: B')).resolves.toBe(false);
			expect(app.vault.modifyCalls).toHaveLength(0);
		});
	});

	describe('addChild', () => {
		test('ties a Component to the MarkdownRenderChild; unloading the ctx child cascades', () => {
			const app = new App();
			app.vault.setFile('Note.md', NOTE);
			const plugin = new Plugin(app);
			const ctx = makeFakeContext(app, 'Note.md');
			const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-initiative');

			// The host must have registered exactly one render child via ctx.addChild.
			expect(ctx.addedChildren).toHaveLength(1);
			const renderChild = ctx.addedChildren[0];

			const owned = new Component();
			const returned = host.addChild(owned as any);
			expect(returned).toBe(owned);

			renderChild.load();
			expect((owned as any)._loaded).toBe(true);

			renderChild.unload();
			expect((owned as any)._loaded).toBe(false);
		});
	});

	describe('blockKey', () => {
		test('is stable across calls and derived from sourcePath/language/lineStart', () => {
			const app = new App();
			const note = ['```ds-counter', 'name: A', '```', '', '```ds-counter', 'name: B', '```'].join('\n');
			app.vault.setFile('Note.md', note);
			const plugin = new Plugin(app);
			const ctxA = makeFakeContext(app, 'Note.md', 0);
			const ctxB = makeFakeContext(app, 'Note.md', 1);
			const hostA = new ReadingModeBlockHost(plugin as any, ctxA.el, ctxA as any, 'ds-counter');
			const hostB = new ReadingModeBlockHost(plugin as any, ctxB.el, ctxB as any, 'ds-counter');

			expect(hostA.blockKey()).toBe(hostA.blockKey());
			expect(hostA.blockKey()).toBe('Note.md::ds-counter::0');
			expect(hostB.blockKey()).toBe('Note.md::ds-counter::4');
			expect(hostA.blockKey()).not.toBe(hostB.blockKey());
		});
	});
});
