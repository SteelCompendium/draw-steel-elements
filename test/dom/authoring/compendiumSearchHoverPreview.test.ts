// SC-601 — the compendium search opened while a hover preview is a source editor. Obsidian's page-preview popover hides itself on
// any `click` that reaches its window in the BUBBLE phase and is neither default-prevented nor inside the popover (app.js 1.15.1,
// measured: the only `hide()` was that listener). The search is a SuggestModal in `body`, so the first press in its input, its box
// or its backdrop closed the preview, and the pick that followed went into the closed preview's detached editor, silently. The fix is
// the SC-595 document click guard (`guardHoverPreviewClicks`) plus a choose-time Notice for an editor that is gone. The stand-in for
// the popover is a `window` bubble listener that hides it (removes its element, so the editor's element is disconnected) exactly as
// Obsidian's does; the `DseModal` side of the shared guard is covered by the SC-595 suite in test/dom/kit/managedModal.test.ts.
import { App, Editor, Notice, Plugin } from '../../mocks/obsidian';
import { createCompendiumIndex } from '@/services/CompendiumIndex';
import type { CompendiumEntry, CompendiumIndex } from '@/services/CompendiumIndex';
import { SccResolver } from '@/refs/SccResolver';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { loadMdDseFixture } from '../elements/_refHarness';
import { CompendiumSearchModal } from '@/authoring/CompendiumSearchModal';
import {
	CLOSED_EDITOR_NOTICE,
	dispatchBlockChoice,
	dispatchReferenceChoice,
	insertFullBlock,
	registerCompendiumInsertCommands,
} from '@/authoring/compendiumInsert';
import type { CompendiumSyncService } from '@/data/CompendiumSyncService';

const GOBLIN = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';
const KIT = 'mcdm.heroes.v1/kit/panther';

const COMMANDS = ['insert-compendium-reference', 'insert-compendium-block'] as const;

function setup(): { app: App; index: CompendiumIndex } {
	const app = new App();
	loadMdDseFixture(app.vault, 'kit/panther.md');
	loadMdDseFixture(app.vault, 'monster/goblin/statblock/goblin-stinker.md');
	const resolver = new SccResolver(app as any, DEFAULT_SETTINGS);
	return { app, index: createCompendiumIndex(app as any, resolver) };
}

/** Obsidian's page-preview popover, as far as this fix is concerned: `popover` (`.popover.hover-popover`) holds `embed`, the editor's
 *  container (what `editorCallback` hands the command as its context). `state.hidden` once a click reached the window bubble. */
function previewStandIn(inPreview = true, doc: Document = document) {
	const win = doc.defaultView!;
	const popover = doc.body.appendChild(doc.createElement('div'));
	if (inPreview) popover.className = 'popover hover-popover';
	const embed = popover.appendChild(doc.createElement('div'));
	embed.className = 'markdown-embed';
	const state = { hidden: false };
	const closer = (e: Event): void => {
		if (e.defaultPrevented || popover.contains(e.target as Node)) return;
		state.hidden = true;
		popover.remove();
	};
	win.addEventListener('click', closer);
	live.push(() => win.removeEventListener('click', closer));
	return { popover, embed, state };
}
const live: Array<() => void> = [];

/** A task: past the one-task removal of the guard (`setTimeout(…, 0)`). Real timers, as in the SC-595 suite. */
const nextTask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

/** Runs a registered command with `editorCallback`'s arguments and returns the modal it opened (captured from `onOpen`, which still runs
 *  for real, so the test can reach the box and the rows). */
function runCommand(id: (typeof COMMANDS)[number], ctx?: unknown, editor: Editor = new Editor('')) {
	const { app, index } = setup();
	const plugin = new Plugin(app as any) as any;
	plugin.syncCompendium = jest.fn().mockResolvedValue(undefined);
	registerCompendiumInsertCommands(plugin, index, {} as CompendiumSyncService);
	const opened: CompendiumSearchModal[] = [];
	const realOnOpen = CompendiumSearchModal.prototype.onOpen;
	const spy = jest.spyOn(CompendiumSearchModal.prototype, 'onOpen').mockImplementation(function (this: CompendiumSearchModal) {
		opened.push(this);
		return realOnOpen.call(this);
	});
	try {
		plugin.commands.find((c: any) => c.id === id).editorCallback(editor, ctx);
	} finally {
		spy.mockRestore();
	}
	return { app, index, editor, modal: opened[0] };
}

/** A suggestion row wired like Obsidian's (`SuggestModal`'s row click default-prevents and selects). */
function addRow(modal: CompendiumSearchModal, entry: CompendiumEntry): HTMLElement {
	const row = modal.resultContainerEl.createDiv({ cls: 'suggestion-item' });
	row.addEventListener('click', (e) => {
		e.preventDefault();
		modal.selectSuggestion(entry, e);
	});
	return row;
}
/** The `.modal-bg`: Obsidian closes the modal from its own target-phase click listener. */
function addBackdrop(modal: CompendiumSearchModal): HTMLElement {
	const bg = modal.containerEl.createDiv({ cls: 'modal-bg' });
	bg.addEventListener('click', () => modal.close());
	return bg;
}

const entryOf = (index: CompendiumIndex, scc: string): CompendiumEntry => index.query('').find((e) => e.scc === scc)!;

afterEach(() => {
	for (const detach of live.splice(0)) detach();
	document.body.innerHTML = '';
	Notice.notices.length = 0;
});

describe('SC-601: a click in the compendium search keeps the hover preview open', () => {
	let windowClicks: jest.Mock;
	beforeEach(() => {
		windowClicks = jest.fn();
		window.addEventListener('click', windowClicks);
		live.push(() => window.removeEventListener('click', windowClicks));
	});

	describe.each(COMMANDS)('%s', (id) => {
		test.each([
			['input', (m: CompendiumSearchModal) => m.inputEl],
			['box', (m: CompendiumSearchModal) => m.modalEl],
			['results area', (m: CompendiumSearchModal) => m.resultContainerEl],
		])('a press on the search %s never reaches the popover: the preview stays', (_name, pick) => {
			const p = previewStandIn();
			const { modal } = runCommand(id, { containerEl: p.embed });

			pick(modal).click();

			expect(p.state.hidden).toBe(false);
			expect(p.popover.isConnected).toBe(true);
			expect(windowClicks).not.toHaveBeenCalled();
		});

		test('the backdrop press still closes the search, and the preview stays (the closing click is stopped too)', () => {
			const p = previewStandIn();
			const { modal } = runCommand(id, { containerEl: p.embed });
			const bg = addBackdrop(modal);

			bg.click();

			expect(modal.containerEl.isConnected).toBe(false);
			expect(p.state.hidden).toBe(false);
			expect(windowClicks).not.toHaveBeenCalled();
		});

		test('control: an editor that is not in a preview gets no guard, the press reaches the window as it always did', () => {
			const outside = previewStandIn(false);
			const { modal } = runCommand(id, { containerEl: outside.embed });

			modal.inputEl.click();

			expect(windowClicks).toHaveBeenCalledTimes(1);
		});

		test('control: a command run with no context (no anchor to find) gets no guard', () => {
			const { modal } = runCommand(id);

			modal.inputEl.click();

			expect(windowClicks).toHaveBeenCalledTimes(1);
		});

		test('the anchor can come from the CodeMirror element when the context has none', () => {
			const p = previewStandIn();
			const editor = new Editor('');
			(editor as any).cm = { dom: p.embed };
			const { modal } = runCommand(id, {}, editor);

			modal.inputEl.click();

			expect(p.state.hidden).toBe(false);
		});
	});

	test('a click that is not in the search (the preview itself, another element) still reaches the window', () => {
		const p = previewStandIn();
		runCommand('insert-compendium-reference', { containerEl: p.embed });
		const elsewhere = document.body.appendChild(document.createElement('div'));

		elsewhere.click();

		expect(windowClicks).toHaveBeenCalledTimes(1);
		expect(p.state.hidden).toBe(true); // Obsidian's own rule for an outside click: the guard is only for clicks in the search
	});

	test('the click is stopped, never default-prevented', () => {
		const p = previewStandIn();
		const { modal } = runCommand('insert-compendium-reference', { containerEl: p.embed });
		let prevented: boolean | null = null;
		const record = (e: Event): void => {
			prevented = e.defaultPrevented;
		};
		document.addEventListener('click', record);
		live.push(() => document.removeEventListener('click', record));

		modal.inputEl.click();

		expect(prevented).toBe(false);
	});

	test('a document-level listener still sees the click (only the window is cut off)', () => {
		const p = previewStandIn();
		const { modal } = runCommand('insert-compendium-reference', { containerEl: p.embed });
		const docClicks = jest.fn();
		document.addEventListener('click', docClicks);
		live.push(() => document.removeEventListener('click', docClicks));

		modal.inputEl.click();

		expect(docClicks).toHaveBeenCalledTimes(1);
	});

	test('a suggestion press still inserts, in the preview\'s own editor, and the preview stays', () => {
		const p = previewStandIn();
		const { modal, editor, index } = runCommand('insert-compendium-reference', { containerEl: p.embed });
		const row = addRow(modal, entryOf(index, KIT));

		row.click();

		expect(editor.writes).toHaveLength(1);
		expect(editor.writes[0].text).toBe(`\`\`\`ds-scc\n${KIT}\n\`\`\`\n`);
		expect(p.state.hidden).toBe(false);
		expect(Notice.notices).toEqual([]);
	});

	test('the guard binds to the modal\'s own document: a press in the search inside a popout window keeps the popout\'s preview', () => {
		// A popout window has its own document (a jsdom iframe stands in); Obsidian's Modal.open appends the container to
		// activeWindow.document.body BEFORE onOpen, and the popover's hide listener is on that window.
		const frame = document.body.appendChild(document.createElement('iframe'));
		const pdoc = frame.contentDocument!;
		const p = previewStandIn(true, pdoc);
		const realAppend = document.body.appendChild.bind(document.body);
		const append = jest.spyOn(document.body, 'appendChild').mockImplementation(<T extends Node>(n: T): T => {
			if (n instanceof HTMLElement && n.classList.contains('modal-container')) return pdoc.body.appendChild(n);
			return realAppend(n);
		});
		try {
			const { modal } = runCommand('insert-compendium-reference', { containerEl: p.embed });
			expect(modal.containerEl.ownerDocument).toBe(pdoc);

			modal.inputEl.click();

			expect(p.state.hidden).toBe(false);
		} finally {
			append.mockRestore();
		}
	});

	test('the guard is gone one task after the search closes, and not before', async () => {
		const p = previewStandIn();
		const added: EventListenerOrEventListenerObject[] = [];
		const removed: EventListenerOrEventListenerObject[] = [];
		const add = jest.spyOn(document, 'addEventListener').mockImplementation(function (this: Document, type, fn, opts) {
			if (type === 'click') added.push(fn as EventListener);
			return EventTarget.prototype.addEventListener.call(this, type, fn, opts);
		});
		const rem = jest.spyOn(document, 'removeEventListener').mockImplementation(function (this: Document, type, fn, opts) {
			if (type === 'click') removed.push(fn as EventListener);
			return EventTarget.prototype.removeEventListener.call(this, type, fn, opts);
		});
		try {
			const { modal } = runCommand('insert-compendium-reference', { containerEl: p.embed });
			const container = modal.containerEl;
			expect(added).toHaveLength(1);

			modal.close();
			expect(removed).not.toContain(added[0]); // (earlier tests' guards may still be leaving: only this modal's is asked about)

			// same task as the close: a click through the (re-attached) container is still stopped
			document.body.appendChild(container);
			container.click();
			expect(windowClicks).not.toHaveBeenCalled();

			await nextTask();

			expect(removed).toContain(added[0]);
			container.click();
			expect(windowClicks).toHaveBeenCalledTimes(1);
		} finally {
			add.mockRestore();
			rem.mockRestore();
		}
	});
});

describe('SC-601: a pick into an editor that is gone writes nothing and says so', () => {
	const kitEntry = (index: CompendiumIndex) => entryOf(index, KIT);
	const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));
	/** The block command's dispatch is async (`entity.model()`), the command does not return it: wait for the write. */
	async function until(done: () => boolean): Promise<void> {
		for (let i = 0; i < 100 && !done(); i++) await flush();
	}

	test('reference command: the preview was closed behind the open search; the pick shows a Notice and writes nothing', () => {
		const p = previewStandIn();
		const { modal, editor, index, app } = runCommand('insert-compendium-reference', { containerEl: p.embed });
		const hostEditor = new Editor('host note');
		(app.workspace as any).activeEditor = { editor: hostEditor };
		const row = addRow(modal, kitEntry(index));
		p.popover.remove(); // Obsidian hid the preview by some other route (the guard covers only clicks in the search)

		row.click();

		expect(editor.writes).toHaveLength(0);
		expect(hostEditor.writes).toHaveLength(0); // never re-targeted at the active editor
		expect(Notice.notices).toEqual([CLOSED_EDITOR_NOTICE]);
	});

	test('block command: the same, for the snapshot choice', async () => {
		const p = previewStandIn();
		const { modal, editor, index, app } = runCommand('insert-compendium-block', { containerEl: p.embed });
		const hostEditor = new Editor('host note');
		(app.workspace as any).activeEditor = { editor: hostEditor };
		const row = addRow(modal, entryOf(index, GOBLIN));
		p.popover.remove();

		row.click();
		await flush();

		expect(editor.writes).toHaveLength(0);
		expect(hostEditor.writes).toHaveLength(0);
		expect(Notice.notices).toEqual([CLOSED_EDITOR_NOTICE]);
	});

	test('block command, control: the editor is still there, the snapshot lands in it and there is no Notice', async () => {
		const p = previewStandIn();
		const { modal, editor, index } = runCommand('insert-compendium-block', { containerEl: p.embed });
		const row = addRow(modal, entryOf(index, GOBLIN));

		row.click();
		await until(() => editor.writes.length > 0);

		expect(editor.writes).toHaveLength(1);
		expect(editor.writes[0].text.startsWith('```ds-sb\n')).toBe(true);
		expect(Notice.notices).toEqual([]);
	});

	test('the shift (inline link) choice is refused too; ctrl (copy code) never touches the editor, so it still copies', async () => {
		const writeText = jest.fn().mockResolvedValue(undefined);
		(navigator as any).clipboard = { writeText };
		try {
			const p = previewStandIn();
			const { index } = setup();
			const editor = new Editor('');
			const target = { isOpen: () => p.embed.isConnected };
			p.popover.remove();

			dispatchReferenceChoice(editor as any, kitEntry(index), { shiftKey: true }, target.isOpen);
			expect(editor.writes).toHaveLength(0);
			expect(Notice.notices).toEqual([CLOSED_EDITOR_NOTICE]);

			Notice.notices.length = 0;
			dispatchReferenceChoice(editor as any, kitEntry(index), { ctrlKey: true }, target.isOpen);
			await flush();
			expect(writeText).toHaveBeenCalledWith(`scc:${KIT}`);
			expect(Notice.notices).toEqual([`Copied scc:${KIT}`]);
		} finally {
			delete (navigator as any).clipboard;
		}
	});

	test('dispatchBlockChoice on its own: a closed editor refuses before resolving anything; the default still inserts', async () => {
		const { index } = setup();
		const entry = entryOf(index, GOBLIN);
		const closed = new Editor('');
		await dispatchBlockChoice(closed as any, index, entry, () => false);
		expect(closed.writes).toHaveLength(0);
		expect(Notice.notices).toEqual([CLOSED_EDITOR_NOTICE]);

		const open = new Editor('');
		await dispatchBlockChoice(open as any, index, entry);
		expect(open.writes).toHaveLength(1);
	});

	test('a live preview editor and a different live active editor: the pick lands in the captured editor only', () => {
		const p = previewStandIn();
		const { modal, editor, index, app } = runCommand('insert-compendium-reference', { containerEl: p.embed });
		const host = new Editor('host');
		const hostEl = document.body.appendChild(document.createElement('div'));
		(host as any).cm = { dom: hostEl };
		(app.workspace as any).activeEditor = { editor: host, containerEl: hostEl };

		addRow(modal, kitEntry(index)).click();

		expect(editor.writes).toHaveLength(1);
		expect(host.writes).toHaveLength(0);
		expect(Notice.notices).toEqual([]);
	});

	test('a closed pane editor (no preview involved) is refused too: a Notice, nothing written', () => {
		const pane = document.body.appendChild(document.createElement('div'));
		const { modal, editor, index } = runCommand('insert-compendium-reference', { containerEl: pane });
		const row = addRow(modal, kitEntry(index));
		pane.remove();

		row.click();

		expect(editor.writes).toHaveLength(0);
		expect(Notice.notices).toEqual([CLOSED_EDITOR_NOTICE]);
	});

	test('the container is still there but the CodeMirror element is gone: refused (every element found must be connected)', () => {
		const p = previewStandIn();
		const cmEl = p.embed.appendChild(document.createElement('div'));
		const editor = new Editor('');
		(editor as any).cm = { dom: cmEl };
		const { modal, index } = runCommand('insert-compendium-reference', { containerEl: p.embed }, editor);
		const row = addRow(modal, kitEntry(index));
		cmEl.remove();

		row.click();

		expect(editor.writes).toHaveLength(0);
		expect(Notice.notices).toEqual([CLOSED_EDITOR_NOTICE]);
	});

	test('the connection test also reads the CodeMirror element when the context carries none', () => {
		const p = previewStandIn();
		const editor = new Editor('');
		(editor as any).cm = { dom: p.embed };
		const { modal, index } = runCommand('insert-compendium-reference', undefined, editor);
		const row = addRow(modal, kitEntry(index));
		p.popover.remove();

		row.click();

		expect(editor.writes).toHaveLength(0);
		expect(Notice.notices).toEqual([CLOSED_EDITOR_NOTICE]);
	});
});

describe('SC-601: the block command re-checks the editor after its awaits, right before it writes', () => {
	const settle = async (): Promise<void> => {
		for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 5));
	};

	test('the preview closes while the entity is being resolved (after the early check): nothing written, one Notice', async () => {
		const p = previewStandIn();
		const { modal, editor, index } = runCommand('insert-compendium-block', { containerEl: p.embed });
		const real = index.getEntity.bind(index);
		const spy = jest.spyOn(index, 'getEntity').mockImplementation(async (code: string) => {
			p.popover.remove(); // Obsidian hid the preview while the snapshot was being resolved
			return real(code);
		});
		try {
			addRow(modal, entryOf(index, GOBLIN)).click();
			await settle();

			expect(editor.writes).toHaveLength(0);
			expect(Notice.notices).toEqual([CLOSED_EDITOR_NOTICE]);
		} finally {
			spy.mockRestore();
		}
	});

	test('the preview closes while the model is being read (the last await before the write): nothing written, one Notice', async () => {
		const p = previewStandIn();
		const { modal, editor, index } = runCommand('insert-compendium-block', { containerEl: p.embed });
		const real = index.getEntity.bind(index);
		const spy = jest.spyOn(index, 'getEntity').mockImplementation(async (code: string) => {
			const ent = await real(code);
			if (!ent) return ent;
			const model = ent.model;
			return {
				...ent,
				model: async () => {
					const m = await model();
					p.popover.remove();
					return m;
				},
			};
		});
		try {
			addRow(modal, entryOf(index, GOBLIN)).click();
			await settle();

			expect(editor.writes).toHaveLength(0);
			expect(Notice.notices).toEqual([CLOSED_EDITOR_NOTICE]);
		} finally {
			spy.mockRestore();
		}
	});

	test('insertFullBlock on its own with a closed editor: nothing written, one Notice, false; with an open one it writes', async () => {
		const { index } = setup();
		const entity = (await index.getEntity(GOBLIN))!;
		const closed = new Editor('');

		expect(await insertFullBlock(closed as any, entity, () => false)).toBe(false);
		expect(closed.writes).toHaveLength(0);
		expect(Notice.notices).toEqual([CLOSED_EDITOR_NOTICE]);

		const open = new Editor('');
		expect(await insertFullBlock(open as any, entity, () => true)).toBe(true);
		expect(open.writes).toHaveLength(1);
		expect(Notice.notices).toEqual([CLOSED_EDITOR_NOTICE]); // no second Notice
	});
});
