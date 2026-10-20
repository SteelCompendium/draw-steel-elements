// D8 Task 2 — SidebarBlockHost: the file-backed-by-anchor-id BlockHost the sidebar uses
// instead of ReadingModeBlockHost's ctx.getSectionInfo. Uses test/fakes/fakeObsidian.ts
// (not test/mocks/obsidian-core.ts's FakeVault) because THIS is the fake with real
// vault.on/emit event delivery — see that file's process()/cachedRead() doc comments —
// which the self-echo / external-modify assertions below need to actually exercise.
import { Component } from 'obsidian';
import type { App, Plugin, TFile } from 'obsidian';
import { Notice, flushAsync } from '../../mocks/obsidian';
import { droppedWriteMessage, resetDroppedWriteNotices } from '@/framework/host/droppedWriteNotice';
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

function makeHost(
	app: App,
	file: TFile,
	onExternalChange: (body: string) => void = () => {},
	onAnchorLost: () => void = () => {},
	// SC-184 added the removal-request slot (`onRemoveRequested`) after `onAnchorLost`;
	// every existing caller here doesn't care about it, so it defaults to a no-op.
	onRemoveRequested: () => void = () => {},
) {
	// Structural stub: SidebarBlockHost only ever touches plugin.app.vault.{on,cachedRead,
	// process} (registerEvent is called against `owner`, not `plugin` — see that file's
	// ctor doc). A real mock Plugin instance would need its OWN `.app` reassigned to this
	// `app` anyway to share the fake vault's real event delivery, so a minimal stub is
	// both simpler and exactly as correct.
	const plugin = { app } as unknown as Plugin;
	// SC-337: Component.unload/addChild are now guarded by `_loaded` (matching Obsidian
	// 1.14.2) — real Obsidian's sidebar view (this host's owner) is already loaded by the
	// time it constructs a SidebarBlockHost, so a loaded owner is the faithful fixture.
	const owner = new Component();
	owner.load();
	const containerEl = document.createElement('div');
	// SC-158 added the strict-body identity slot (`boundBody`) after `anchorId`; an
	// anchored host passes null — it addresses by id, exactly as before.
	const host = new SidebarBlockHost(
		plugin,
		file,
		ALIAS,
		ANCHOR_ID,
		null,
		containerEl,
		owner,
		onExternalChange,
		onAnchorLost,
		onRemoveRequested,
	);
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

	// SC-290: replaceSource re-emits the opening fence line from the LIVE document and must
	// keep everything past the fence characters (the info string), not just the first token.
	// The close fence is untouched by this ticket: it is still the live close line's run.
	test.each([
		['an extra token', '```', 'ds-counter extra', '```'],
		['extra tokens and wider spacing', '```', 'ds-counter  foo bar', '```'],
		['a tilde fence with an info string', '~~~', 'ds-counter extra', '~~~'],
		['a 4-backtick fence with an info string', '````', 'ds-counter extra', '````'],
		['a space before the language', '```', ' ds-counter extra', '```'],
		['tabs between tokens', '```', 'ds-counter\textra\tmore', '```'],
		['a language-only fence (unchanged)', '```', 'ds-counter', '```'],
		['a language-only tilde fence (unchanged)', '~~~', 'ds-counter', '~~~'],
	])('SC-290: replaceSource keeps the full info string on %s', async (_label, fence, info, close) => {
		const opener = `${fence}${info}`;
		const note = ['# Notes', '', opener, 'current_value: 1', `_dse_anchor: ${ANCHOR_ID}`, close, '', 'tail'].join('\n');
		const { vault, file, app } = setup(note);
		const { host } = makeHost(app, file);
		await host.refresh();

		const ok = await host.replaceSource(`current_value: 5\n_dse_anchor: ${ANCHOR_ID}`);

		expect(ok).toBe(true);
		expect(vault.text('Note.md')).toBe(
			['# Notes', '', opener, 'current_value: 5', `_dse_anchor: ${ANCHOR_ID}`, close, '', 'tail'].join('\n'),
		);
	});

	test('SC-290: a language-only fence with trailing whitespace still re-emits without the trailing whitespace (as before)', async () => {
		const note = ['# Notes', '', '```ds-counter  ', 'current_value: 1', `_dse_anchor: ${ANCHOR_ID}`, '```'].join('\n');
		const { vault, file, app } = setup(note);
		const { host } = makeHost(app, file);
		await host.refresh();

		await host.replaceSource(`current_value: 5\n_dse_anchor: ${ANCHOR_ID}`);

		expect(vault.text('Note.md')!.split('\n')[2]).toBe('```ds-counter');
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

	// SC-184 — BlockHost's optional removal seam: SidebarBlockHost's implementation is a
	// bare delegate to whatever SidebarPanel wired at construction.
	test('requestRemoval delegates to onRemoveRequested exactly once per call', async () => {
		const { file, app } = setup();
		const onRemoveRequested = jest.fn();
		const { host } = makeHost(app, file, undefined, undefined, onRemoveRequested);
		host.requestRemoval();
		expect(onRemoveRequested).toHaveBeenCalledTimes(1);
		host.requestRemoval();
		expect(onRemoveRequested).toHaveBeenCalledTimes(2);
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

	// SC-288 — the forget half of lastMountedChild: SidebarPanel calls this everywhere it
	// removes the mounted child (handleAnchorLost, handleExternalChange's remount branch),
	// so a stale reference does not survive a removal SidebarPanel performs itself, and so
	// cannot be mistaken for a still-live view by the in-place update() fast path.
	test('forgetMountedChild nulls lastMountedChild without touching the addChild-owned Component', async () => {
		const { file, app } = setup();
		const { host, owner } = makeHost(app, file);
		const child = new Component();
		host.addChild(child);
		expect(host.lastMountedChild).toBe(child);

		host.forgetMountedChild();

		expect(host.lastMountedChild).toBeNull();
		// Forgetting is bookkeeping only — it does not itself unload/remove the child;
		// callers (SidebarPanel) are responsible for removeChild before forgetting.
		let unloaded = false;
		child.onunload = () => {
			unloaded = true;
		};
		owner.removeChild(child);
		expect(unloaded).toBe(true);
	});

	// D8 Task 2 review fix round 1 (finding #1, HIGH) — the safety net: the self-echo guard
	// means a self-write that drops the `_dse_anchor` line (the passthrough-field gap this
	// file's header documents) would otherwise never tell anyone canPersist just flipped
	// false. replaceSource must detect that flip on its OWN write and call onAnchorLost.
	describe('review fix round 1, finding #1 (HIGH): anchor-lost safety net on self-persist', () => {
		test('replaceSource whose newSource drops `_dse_anchor` flips canPersist false and fires onAnchorLost exactly once', async () => {
			const { vault, file, app } = setup();
			const onAnchorLost = jest.fn();
			const { host } = makeHost(app, file, undefined, onAnchorLost);
			await host.refresh();
			expect(host.canPersist).toBe(true);

			// Simulates the real failure mode: a persisted element's serialize() (e.g.
			// Counter's) doesn't pass the `_dse_anchor` key through — the write still
			// succeeds (the fence is found and replaced), but the new body has no anchor.
			const ok = await host.replaceSource('current_value: 99'); // no _dse_anchor line

			expect(ok).toBe(true); // the write itself succeeded — not a corruption/abort case
			expect(onAnchorLost).toHaveBeenCalledTimes(1);
			expect(host.canPersist).toBe(false); // the panel must now treat this as unaddressable

			// And the safety net doesn't re-fire on every subsequent read of the same state.
			vault.emit('modify', fakeTFile('Note.md'));
			await flushAsync();
			expect(onAnchorLost).toHaveBeenCalledTimes(1);
		});

		test('a normal replaceSource that PRESERVES the anchor never calls onAnchorLost', async () => {
			const { file, app } = setup();
			const onAnchorLost = jest.fn();
			const { host } = makeHost(app, file, undefined, onAnchorLost);
			await host.refresh();

			await host.replaceSource(`current_value: 5\n_dse_anchor: ${ANCHOR_ID}`);

			expect(onAnchorLost).not.toHaveBeenCalled();
			expect(host.canPersist).toBe(true);
		});
	});

	// D8 Task 2 review fix round 1 (finding #5, MEDIUM) — the vault "modify" listener must
	// not go live until the initial cachedContent priming read (refresh()) has resolved, so
	// a genuine external edit landing in that window can't race a not-yet-mounted panel.
	describe('review fix round 1, finding #5 (MEDIUM): listener registered only after refresh() resolves', () => {
		test('a "modify" emitted while refresh() is still pending is NOT delivered; the listener goes live only once refresh() resolves', async () => {
			const { vault, file, app } = setup();
			const onExternalChange = jest.fn();
			const { host } = makeHost(app, file, onExternalChange);

			const gate = vault.gateRead('Note.md');
			const refreshing = host.refresh(); // cachedRead is now blocked on the gate

			// A genuine external modify lands WHILE the priming read is still in flight —
			// pre-fix, the ctor had already registered the listener synchronously, so this
			// would race a second mount in through onExternalChange before the panel's own
			// first pipeline.run() had even happened.
			vault.emit('modify', fakeTFile('Note.md'));
			await flushAsync();
			expect(onExternalChange).not.toHaveBeenCalled(); // no listener yet — event is a no-op

			gate.release();
			await refreshing;

			// NOW the listener is live: a subsequent external edit is delivered normally.
			const edited = fencedNote().replace('current_value: 1', 'current_value: 77');
			vault.setText('Note.md', edited);
			vault.emit('modify', fakeTFile('Note.md'));
			await flushAsync();

			expect(onExternalChange).toHaveBeenCalledTimes(1);
			expect(onExternalChange).toHaveBeenCalledWith(`current_value: 77\n_dse_anchor: ${ANCHOR_ID}`);
		});
	});
});

// SC-453 — a CRLF note: the host used to miss its block (FENCE_LINE never matches a `\r`), so
// no write ever landed; and once it could, the rewritten block was LF in an otherwise-CRLF
// note. Policy: a note that is all-CRLF stays all-CRLF after a write; an all-LF note is
// byte-identical to the pre-SC-453 output; a mixed note follows its dominant ending
// (a tie goes to the first line break) and loses no content.
describe('SC-453: SidebarBlockHost on CRLF / mixed-ending notes', () => {
	const toCrlf = (s: string): string => s.replace(/\n/g, '\r\n');
	const NEW_BODY = `current_value: 5\n_dse_anchor: ${ANCHOR_ID}`;

	test('locates the anchored block in a CRLF note and exposes an LF body to the element', async () => {
		const { file, app } = setup(toCrlf(fencedNote()));
		const { host } = makeHost(app, file);
		await host.refresh();

		expect(host.canPersist).toBe(true);
		expect(host.getBlockInfo()).toEqual({ language: ALIAS, lineStart: 2, lineEnd: 5 });
		expect(host.currentBody()).toBe(`current_value: 1\n_dse_anchor: ${ANCHOR_ID}`);
	});

	test('a write lands in a CRLF note: the whole note is all-CRLF afterward and content above/below is byte-identical', async () => {
		const note = toCrlf(fencedNote());
		const { vault, file, app } = setup(note);
		const { host } = makeHost(app, file);
		await host.refresh();

		await expect(host.replaceSource(NEW_BODY)).resolves.toBe(true);

		const updated = vault.text('Note.md')!;
		expect(updated).toBe(toCrlf(['# Notes', '', '```ds-counter', 'current_value: 5', `_dse_anchor: ${ANCHOR_ID}`, '```', '', 'tail'].join('\n')));
		expect(updated.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/); // every break is CRLF: no bare LF, no bare CR
		expect(updated.startsWith('# Notes\r\n\r\n```ds-counter\r\n')).toBe(true);
		expect(updated.endsWith('```\r\n\r\ntail')).toBe(true);
	});

	test('an all-LF note stays byte-identical to the pre-SC-453 output', async () => {
		const { vault, file, app } = setup();
		const { host } = makeHost(app, file);
		await host.refresh();

		await host.replaceSource(NEW_BODY);

		expect(vault.text('Note.md')).toBe(
			['# Notes', '', '```ds-counter', 'current_value: 5', `_dse_anchor: ${ANCHOR_ID}`, '```', '', 'tail'].join('\n'),
		);
	});

	test('our own write in a CRLF note is not mistaken for an external edit (self-echo guard compares LF bodies)', async () => {
		const { file, app } = setup(toCrlf(fencedNote()));
		const onExternalChange = jest.fn();
		const { host } = makeHost(app, file, onExternalChange);
		await host.refresh();

		await host.replaceSource(NEW_BODY);
		await flushAsync();

		expect(onExternalChange).not.toHaveBeenCalled();
	});

	test('a new source that itself carries CRLF is still recognised as our own write (self-echo compares LF bodies)', async () => {
		const { file, app } = setup(toCrlf(fencedNote()));
		const onExternalChange = jest.fn();
		const { host } = makeHost(app, file, onExternalChange);
		await host.refresh();

		await host.replaceSource(`current_value: 5\r\n_dse_anchor: ${ANCHOR_ID}`);
		await flushAsync();

		expect(onExternalChange).not.toHaveBeenCalled();
	});

	test('LF note, new body ending in a lone CR: our own write is still not mistaken for an external edit', async () => {
		const { file, app } = setup();
		const onExternalChange = jest.fn();
		const { host } = makeHost(app, file, onExternalChange);
		await host.refresh();

		// Written as-is into the LF note; the lone CR then sits in front of the close fence's LF, so
		// the read-back (extractBody) strips it. The self-echo record must be what is READ BACK.
		await expect(host.replaceSource(`current_value: 5\n_dse_anchor: ${ANCHOR_ID}\r`)).resolves.toBe(true);
		await flushAsync();

		expect(onExternalChange).not.toHaveBeenCalled();
	});

	test('two same-kind blocks in one CRLF note: writing one leaves the other byte-identical', async () => {
		const other = ['```ds-counter', 'current_value: 2', '_dse_anchor: other9', '```'].join('\n');
		const note = toCrlf(['# Notes', '', other, '', '```ds-counter', 'current_value: 1', `_dse_anchor: ${ANCHOR_ID}`, '```', '', 'tail'].join('\n'));
		const { vault, file, app } = setup(note);
		const { host } = makeHost(app, file);
		await host.refresh();
		expect(host.getBlockInfo()).toEqual({ language: ALIAS, lineStart: 7, lineEnd: 10 });

		await host.replaceSource(NEW_BODY);

		const updated = vault.text('Note.md')!;
		expect(updated.startsWith(toCrlf(['# Notes', '', other, ''].join('\n')))).toBe(true);
		expect(updated).toContain('current_value: 5');
		expect(updated.match(/current_value: 2/g)).toHaveLength(1);
		expect(updated.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
	});

	test('a hand-edited CRLF note is re-located by id after a write, and a second write still lands', async () => {
		const { vault, file, app } = setup(toCrlf(fencedNote()));
		const { host } = makeHost(app, file);
		await host.refresh();
		await host.replaceSource(NEW_BODY);

		// The user hand-edits above the block in an editor that keeps CRLF, shifting it down 3 lines.
		const edited = toCrlf(['one', 'two', 'three'].join('\n')) + '\r\n' + vault.text('Note.md')!;
		vault.setText('Note.md', edited);
		vault.emit('modify', fakeTFile('Note.md'));
		await flushAsync();
		expect(host.getBlockInfo()).toEqual({ language: ALIAS, lineStart: 5, lineEnd: 8 });

		await expect(host.replaceSource(`current_value: 9\n_dse_anchor: ${ANCHOR_ID}`)).resolves.toBe(true);
		const updated = vault.text('Note.md')!;
		expect(updated).toContain('current_value: 9');
		expect(updated.startsWith('one\r\ntwo\r\nthree\r\n# Notes\r\n')).toBe(true);
		expect(updated.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
	});

	test('a CRLF note whose close fence is its last line with no trailing newline: the write lands and no CR is invented at EOF', async () => {
		const note = toCrlf(['# Notes', '', '```ds-counter', 'current_value: 1', `_dse_anchor: ${ANCHOR_ID}`, '```'].join('\n'));
		const { vault, file, app } = setup(note);
		const { host } = makeHost(app, file);
		await host.refresh();

		await expect(host.replaceSource(NEW_BODY)).resolves.toBe(true);

		expect(vault.text('Note.md')).toBe(
			toCrlf(['# Notes', '', '```ds-counter', 'current_value: 5', `_dse_anchor: ${ANCHOR_ID}`, '```'].join('\n')),
		);
	});

	test('a CRLF-dominant mixed note: the block is written CRLF, a stray LF line below it is untouched, nothing is lost', async () => {
		const note = `# Notes\r\n\r\n\`\`\`ds-counter\r\ncurrent_value: 1\r\n_dse_anchor: ${ANCHOR_ID}\r\n\`\`\`\r\nstray-lf\ntail\r\n`;
		const { vault, file, app } = setup(note);
		const { host } = makeHost(app, file);
		await host.refresh();

		await expect(host.replaceSource(NEW_BODY)).resolves.toBe(true);

		expect(vault.text('Note.md')).toBe(
			`# Notes\r\n\r\n\`\`\`ds-counter\r\ncurrent_value: 5\r\n_dse_anchor: ${ANCHOR_ID}\r\n\`\`\`\r\nstray-lf\ntail\r\n`,
		);
	});

	test('an LF-dominant mixed note: the block is written LF, a stray CRLF line is untouched, nothing is lost', async () => {
		const note = `# Notes\n\n\`\`\`ds-counter\ncurrent_value: 1\n_dse_anchor: ${ANCHOR_ID}\n\`\`\`\nstray-crlf\r\ntail\n`;
		const { vault, file, app } = setup(note);
		const { host } = makeHost(app, file);
		await host.refresh();

		await expect(host.replaceSource(NEW_BODY)).resolves.toBe(true);

		expect(vault.text('Note.md')).toBe(
			`# Notes\n\n\`\`\`ds-counter\ncurrent_value: 5\n_dse_anchor: ${ANCHOR_ID}\n\`\`\`\nstray-crlf\r\ntail\n`,
		);
	});

	test('a strict-body (unanchored) host binds by body in a CRLF note and its write keeps the binding', async () => {
		const note = toCrlf(['# Notes', '', '```ds-counter', 'current_value: 1', '```', '', 'tail'].join('\n'));
		const { vault, file, app } = setup(note);
		const plugin = { app } as unknown as Plugin;
		const owner = new Component();
		owner.load();
		const host = new SidebarBlockHost(plugin, file, ALIAS, null, 'current_value: 1', document.createElement('div'), owner, () => {}, () => {}, () => {});
		await host.refresh();
		expect(host.canPersist).toBe(true);

		await expect(host.replaceSource('current_value: 2')).resolves.toBe(true);

		expect(vault.text('Note.md')).toBe(toCrlf(['# Notes', '', '```ds-counter', 'current_value: 2', '```', '', 'tail'].join('\n')));
		expect(host.canPersist).toBe(true);
	});
});

// SC-455 — an anchored block inside a blockquote / callout. The anchor scan sees through the `> `
// prefix, the body the element parses is prefix-free, and a write re-emits the block's own prefix on
// every line it writes while leaving every other byte of the note alone.
describe('SC-455: SidebarBlockHost on a block inside a blockquote / callout', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	const BODY = (n: number): string => `current_value: ${n}\n_dse_anchor: ${ANCHOR_ID}`;
	const block = (n: number, info = ''): string[] => [`\`\`\`ds-counter${info}`, `current_value: ${n}`, `_dse_anchor: ${ANCHOR_ID}`, '```'];
	const under = (prefix: string, lines: string[]): string[] => lines.map((l) => (l === '' ? prefix.trimEnd() : prefix + l));
	const toCrlf = (s: string): string => s.replace(/\n/g, '\r\n');

	async function mounted(note: string, onExternalChange: (b: string) => void = () => {}) {
		const { vault, file, app } = setup(note);
		const { host } = makeHost(app, file, onExternalChange);
		await host.refresh();
		return { vault, host, file, app };
	}

	test('the anchor is found through a callout prefix; getBlockInfo is the fence, currentBody is prefix-free', async () => {
		const note = ['# Notes', '', '> [!note] Title', '> text above', ...under('> ', block(1)), '> text below', '', 'tail'].join('\n');
		const { host } = await mounted(note);

		expect(host.getBlockInfo()).toEqual({ language: ALIAS, lineStart: 4, lineEnd: 7 });
		expect(host.canPersist).toBe(true);
		expect(host.currentBody()).toBe(`current_value: 1\n_dse_anchor: ${ANCHOR_ID}`);
	});

	test('a write keeps the `> ` on every written line; the header, the lines around the block and the rest of the note are byte-identical', async () => {
		const note = ['# Notes', '', '> [!note] Title', '> text above', ...under('> ', block(1)), '> text below', '', 'tail'].join('\n');
		const { vault, host } = await mounted(note);

		await expect(host.replaceSource(`current_value: 5\nmax_value: 9\n_dse_anchor: ${ANCHOR_ID}`)).resolves.toBe(true);

		expect(vault.text('Note.md')).toBe(
			['# Notes', '', '> [!note] Title', '> text above', '> ```ds-counter', '> current_value: 5', '> max_value: 9', `> _dse_anchor: ${ANCHOR_ID}`, '> ```', '> text below', '', 'tail'].join('\n'),
		);
	});

	test('a plain blockquote, a nested `> > ` callout and `>` with no space all round-trip their own prefix', async () => {
		for (const prefix of ['> ', '> > ', '>', '>> ']) {
			const note = ['top', ...under(prefix, ['[!note] x', ...block(1), 'tail']), 'bottom'].join('\n');
			const { vault, host } = await mounted(note);

			await expect(host.replaceSource(BODY(2))).resolves.toBe(true);

			expect(vault.text('Note.md')).toBe(['top', ...under(prefix, ['[!note] x', ...block(2), 'tail']), 'bottom'].join('\n'));
		}
	});

	test.each([
		['`>`', '>'],
		['`> `', '> '],
	])('an empty body line written as %s survives a write', async (_label, blank) => {
		const note = ['top', '> ```ds-counter', '> current_value: 1', blank, `> _dse_anchor: ${ANCHOR_ID}`, '> ```', 'bottom'].join('\n');
		const { vault, host } = await mounted(note);

		await expect(host.replaceSource(`current_value: 2\n\n_dse_anchor: ${ANCHOR_ID}`)).resolves.toBe(true);

		expect(vault.text('Note.md')).toBe(['top', '> ```ds-counter', '> current_value: 2', blank, `> _dse_anchor: ${ANCHOR_ID}`, '> ```', 'bottom'].join('\n'));
	});

	test('the info string on the opening fence survives inside the prefix (SC-290)', async () => {
		const note = ['> [!note]', ...under('> ', block(1, '  extra words'))].join('\n');
		const { vault, host } = await mounted(note);

		await host.replaceSource(BODY(3));

		expect(vault.text('Note.md')).toBe(['> [!note]', ...under('> ', block(3, '  extra words'))].join('\n'));
	});

	test('two same-kind blocks in one callout, and in two callouts, do not cross-talk (both write orders)', async () => {
		const other = (n: number): string[] => ['```ds-counter', `current_value: ${n}`, '_dse_anchor: other9', '```'];
		const inOne = (a: number, b: number): string => ['> [!note]', ...under('> ', other(a)), '> mid', ...under('> ', block(b))].join('\n');
		const inTwo = (a: number, b: number): string => [['> [!note]', ...under('> ', other(a))].join('\n'), '', ['> [!tip]', ...under('> ', block(b))].join('\n')].join('\n');
		for (const [make, label] of [[inOne, 'one callout'], [inTwo, 'two callouts']] as const) {
			const { vault, host } = await mounted(make(2, 1));

			await host.replaceSource(BODY(7));

			expect([label, vault.text('Note.md')]).toEqual([label, make(2, 7)]);
		}
	});

	test('a CRLF callout stays all-CRLF after a write (SC-453)', async () => {
		const note = toCrlf(['# Notes', '', '> [!note]', ...under('> ', block(1)), '> tail', '', 'end'].join('\n'));
		const { vault, host } = await mounted(note);

		await expect(host.replaceSource(BODY(4))).resolves.toBe(true);

		const out = vault.text('Note.md')!;
		expect(out).toBe(toCrlf(['# Notes', '', '> [!note]', ...under('> ', block(4)), '> tail', '', 'end'].join('\n')));
		expect(out.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
	});

	test('a hand-edited callout is re-located by id after a write, and our own write is not mistaken for an external edit', async () => {
		const onExternalChange = jest.fn();
		const note = ['> [!note]', ...under('> ', block(1))].join('\n');
		const { vault, host } = await mounted(note, onExternalChange);
		await host.replaceSource(BODY(2));
		await flushAsync();
		expect(onExternalChange).not.toHaveBeenCalled();

		vault.setText('Note.md', ['one', 'two', vault.text('Note.md')!].join('\n'));
		vault.emit('modify', fakeTFile('Note.md'));
		await flushAsync();
		expect(host.getBlockInfo()).toEqual({ language: ALIAS, lineStart: 3, lineEnd: 6 });
		expect(onExternalChange).not.toHaveBeenCalled(); // only lines shifted: the body is still what we wrote

		await expect(host.replaceSource(BODY(9))).resolves.toBe(true);
		expect(vault.text('Note.md')).toBe(['one', 'two', '> [!note]', ...under('> ', block(9))].join('\n'));
	});

	test('a strict-body (unanchored) host binds by its prefix-free body inside a callout and its write keeps the binding', async () => {
		const note = ['> [!note]', '> ```ds-counter', '> current_value: 1', '> ```'].join('\n');
		const { vault, file, app } = setup(note);
		const owner = new Component();
		owner.load();
		const host = new SidebarBlockHost({ app } as unknown as Plugin, file, ALIAS, null, 'current_value: 1', document.createElement('div'), owner, () => {}, () => {}, () => {});
		await host.refresh();
		expect(host.canPersist).toBe(true);

		await expect(host.replaceSource('current_value: 2')).resolves.toBe(true);

		expect(vault.text('Note.md')).toBe(['> [!note]', '> ```ds-counter', '> current_value: 2', '> ```'].join('\n'));
		expect(host.canPersist).toBe(true);
	});

	test('a `>` (no space) callout with nested YAML: our own write is not mistaken for an external edit, and indentation is intact', async () => {
		const onExternalChange = jest.fn();
		const body = ['heroes:', ' - name: Alice', '   max_stamina: 30', `_dse_anchor: ${ANCHOR_ID}`].join('\n');
		const note = ['>```ds-counter', ...body.split('\n').map((l) => (l.startsWith(' ') ? `> ${l}` : `>${l}`)), '>```'].join('\n');
		const { vault, host } = await mounted(note, onExternalChange);

		await expect(host.replaceSource(body)).resolves.toBe(true);
		await flushAsync();

		expect(vault.text('Note.md')).toBe(note);
		expect(onExternalChange).not.toHaveBeenCalled();
		const next = body.replace('30', '31');
		await expect(host.replaceSource(next)).resolves.toBe(true);
		await flushAsync();
		expect(vault.text('Note.md')).toBe(note.replace('30', '31'));
		expect(onExternalChange).not.toHaveBeenCalled();
	});

	test('a lost block reports it: lastWriteReported is true, and false after a write that lands', async () => {
		const note = ['> [!note]', ...under('> ', block(1))].join('\n');
		const { vault, host } = await mounted(note);
		vault.setText('Note.md', '> [!note]\n> the block was deleted');
		await host.replaceSource(BODY(2));
		expect(host.lastWriteReported).toBe(true);

		vault.setText('Note.md', note);
		vault.emit('modify', fakeTFile('Note.md'));
		await flushAsync();
		await expect(host.replaceSource(BODY(3))).resolves.toBe(true);
		expect(host.lastWriteReported).toBe(false);
	});

	test('regression guard: an un-nested block with a quote elsewhere in the note is written exactly as before', async () => {
		const note = ['> a quote', '', ...block(1), '', '> another'].join('\n');
		const { vault, host } = await mounted(note);

		await host.replaceSource(BODY(2));

		expect(vault.text('Note.md')).toBe(['> a quote', '', ...block(2), '', '> another'].join('\n'));
	});

	test('a write whose block has vanished from the LIVE note says so (a Notice) instead of returning false silently', async () => {
		const note = ['> [!note]', ...under('> ', block(1))].join('\n');
		const { vault, host } = await mounted(note);
		// The note changed on disk but the vault event has not reached the host's cache yet.
		vault.setText('Note.md', '> [!note]\n> the block was deleted');

		await expect(host.replaceSource(BODY(2))).resolves.toBe(false);

		expect(vault.text('Note.md')).toBe('> [!note]\n> the block was deleted');
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});

	test('an identical-content write is a no-op without a Notice', async () => {
		const note = ['> [!note]', ...under('> ', block(1))].join('\n');
		const { vault, host } = await mounted(note);

		await expect(host.replaceSource(BODY(1))).resolves.toBe(true);

		expect(vault.text('Note.md')).toBe(note);
		expect(Notice.notices).toHaveLength(0);
	});
});

// SC-460 — a lone CR above the block. Obsidian (and the editor cursor the sidebar is pinned from)
// count it as a line break, so the host's block positions are in that numbering and the splice lands
// on the right lines without touching the lone CR.
describe('SC-460: SidebarBlockHost on a note with lone CRs', () => {
	const toCrlf = (s: string): string => s.replace(/\n/g, '\r\n');
	const NEW_BODY = `current_value: 5\n_dse_anchor: ${ANCHOR_ID}`;
	const blockLines = (n: number): string[] => ['```ds-counter', `current_value: ${n}`, `_dse_anchor: ${ANCHOR_ID}`, '```'];
	const noteWith = (n: number): string => ['# Notes', 'a\rb', '', ...blockLines(n), 'x\ry', 'tail'].join('\n');

	test('locates the anchored block below a lone CR, in Obsidian\'s numbering, with an LF body', async () => {
		const { file, app } = setup(noteWith(1));
		const { host } = makeHost(app, file);
		await host.refresh();

		expect(host.canPersist).toBe(true);
		expect(host.getBlockInfo()).toEqual({ language: ALIAS, lineStart: 4, lineEnd: 7 });
		expect(host.currentBody()).toBe(`current_value: 1\n_dse_anchor: ${ANCHOR_ID}`);
	});

	test('a write lands in an LF note with a lone CR above and one below: both survive, nothing else moves', async () => {
		const { vault, file, app } = setup(noteWith(1));
		const { host } = makeHost(app, file);
		await host.refresh();

		await expect(host.replaceSource(NEW_BODY)).resolves.toBe(true);

		expect(vault.text('Note.md')).toBe(noteWith(5));
	});

	test('a write lands in a CRLF note with a lone CR above: the CRLF block and the lone CR are both kept', async () => {
		const { vault, file, app } = setup(toCrlf(noteWith(1)));
		const { host } = makeHost(app, file);
		await host.refresh();

		await expect(host.replaceSource(NEW_BODY)).resolves.toBe(true);

		expect(vault.text('Note.md')).toBe(toCrlf(noteWith(5)));
	});

	test('two same-kind blocks with a lone CR between them: writing one leaves the other byte-identical', async () => {
		const other = ['```ds-counter', 'current_value: 2', '_dse_anchor: other9', '```'].join('\n');
		const note = ['# Notes', 'a\rb', other, 'mid\rdle', ...blockLines(1), 'tail'].join('\n');
		const { vault, file, app } = setup(note);
		const { host } = makeHost(app, file);
		await host.refresh();
		expect(host.getBlockInfo()).toEqual({ language: ALIAS, lineStart: 8, lineEnd: 11 });

		await expect(host.replaceSource(NEW_BODY)).resolves.toBe(true);

		expect(vault.text('Note.md')).toBe(['# Notes', 'a\rb', other, 'mid\rdle', ...blockLines(5), 'tail'].join('\n'));
	});

	test('our own write is not mistaken for an external edit', async () => {
		const { file, app } = setup(noteWith(1));
		const onExternalChange = jest.fn();
		const { host } = makeHost(app, file, onExternalChange);
		await host.refresh();

		await host.replaceSource(NEW_BODY);
		await flushAsync();

		expect(onExternalChange).not.toHaveBeenCalled();
	});

	test('a block that is gone from the note: exactly one Notice, the note is unchanged', async () => {
		const { vault, file, app } = setup(noteWith(1));
		const { host } = makeHost(app, file);
		await host.refresh();
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		vault.setText('Note.md', 'a\rb\nno block any more\n');

		await expect(host.replaceSource(NEW_BODY)).resolves.toBe(false);

		expect(vault.text('Note.md')).toBe('a\rb\nno block any more\n');
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});
});
