// SC-608 — an outside edit to the note while a tracker window (a modal the tracker opened) is open. Obsidian redraws the block, the old
// view unloads and its window closes with it (as it always did); what was missing was telling the user and focus: the control that
// opened the window is gone, so focus fell to <body>. The window now closes with a Notice ("closed without saving"), and focus lands
// on the redrawn tracker's replacement of the control that opened the window. The sidebar half (the window stays open and its Apply
// is silently lost) is in test/dom/framework/sidebarInitiative.test.ts.
//
// Harness: the real ElementPipeline mounts the tracker twice into one pane (the old section and the section Obsidian draws for the
// edit) with real, loaded views; "Obsidian redraws" is `old.view.unload()` before or after the second mount, the two orders measured
// in real Obsidian (Reading view draws the new section first, Live Preview closes first and the new widget arrives ~10 ms later).
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Component, Modal, Notice, Plugin } from '../../mocks/obsidian';
import { initiativeElement } from '../../../src/elements/initiative/definition';
import type { InitiativeView } from '../../../src/elements/initiative/view';

const HEROES = ['heroes:', '  - name: "Alice"', '    max_stamina: 30'];
const OGRES = ['enemy_groups:', '  - name: "Ogres"', '    creatures:', '      - name: "Ogre"', '        max_stamina: 60', '        amount: 3'];
const SQUAD_GROUP = [
	'enemy_groups:', '  - name: "Goblin Squad"', '    is_squad: true', '    creatures:',
	'      - { name: Goblin, max_stamina: 4, amount: 5, squad_role: minion }',
];
const src = (...parts: string[][]): string => parts.map((p) => p.join('\n')).join('\n');
const malice = (value: number): string[] => ['malice:', `  value: ${value}`];
const SQUAD = src(HEROES, SQUAD_GROUP, malice(3));
const SQUAD_EDITED = src(HEROES, SQUAD_GROUP, malice(9)); // Sync / another device changed the Malice: the block is different
const TRACKER = src(HEROES, OGRES, malice(3));
const TRACKER_EDITED = src(HEROES, OGRES, malice(9));
const NOTICE = 'The note changed outside, so this window closed without saving';

interface Mounted {
	view: InitiativeView;
	root: HTMLElement;
	pane: HTMLElement;
}

function makeDeps(): ElementPipelineDeps {
	const app = new App();
	app.vault.setFile('Media/token_1.png', '');
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme: createThemeService(prefs, plugin as any),
		prefs,
		refs: createReferenceService(app as any, DEFAULT_SETTINGS),
		validation: createValidationService(),
		session: createSessionStore(),
		roll: createRollService(prefs),
	};
}

/** A pane like Obsidian's (`.workspace-leaf` > `.markdown-reading-view`), or the one handed in (a second section of the same pane). */
function newPane(): HTMLElement {
	const leaf = document.body.appendChild(document.createElement('div'));
	leaf.className = 'workspace-leaf';
	const pane = leaf.appendChild(document.createElement('div'));
	pane.className = 'markdown-reading-view';
	return pane;
}

async function mount(source: string, pane: HTMLElement = newPane(), sourcePath = 'Encounter.md'): Promise<Mounted> {
	const deps = makeDeps();
	const containerEl = pane.appendChild(document.createElement('div'));
	const views: Component[] = [];
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath,
		containerEl,
		canPersist: true,
		addChild: (child: Component) => {
			child.load(); // real Obsidian's BlockHost is a loaded Component: a loaded view is the faithful fixture
			views.push(child);
			return child;
		},
		getBlockInfo: () => ({ language: 'ds-initiative', lineStart: 0, lineEnd: 40 }),
		replaceSource: jest.fn(async () => true),
		blockKey: () => `${sourcePath}::ds-initiative::0`,
	} as unknown as BlockHost;
	await new ElementPipeline(deps).run(initiativeElement, source, host);
	return { view: views[0] as unknown as InitiativeView, root: containerEl.firstElementChild as HTMLElement, pane };
}

const ctl = <T extends HTMLElement = HTMLElement>(root: Element, id: string, n = 0): T => {
	const el = root.querySelectorAll<T>(`[data-dse-control="${id}"]`)[n];
	if (!el) throw new Error(`no [data-dse-control="${id}"][${n}]`);
	return el;
};
const modalEl = (): HTMLElement | null => document.querySelector('.dse-modal');
const focused = (): string | null => document.activeElement?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null;
const later = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const notices = (): string[] => Notice.notices.filter((n) => n === NOTICE);

/** Open the pool window from the keyboard-focused detail row Stamina control (what a keyboard user does). */
function openPool(root: HTMLElement): HTMLElement {
	const opener = ctl(root, 'init.detail.stamina');
	opener.focus();
	opener.click();
	expect(modalEl()).not.toBeNull();
	return opener;
}

beforeEach(() => {
	Notice.notices.length = 0;
	// Real Obsidian hands focus back to the control that held it when a modal opened, synchronously inside `close()`, and only while
	// that control is still in the document. The shared Modal mock does not, so the two ends of it are stood in for.
	const openers = new WeakMap<object, Element | null>();
	const open = Modal.prototype.open;
	const close = Modal.prototype.close;
	jest.spyOn(Modal.prototype, 'open').mockImplementation(function (this: Modal) {
		openers.set(this, document.activeElement);
		open.call(this);
	});
	jest.spyOn(Modal.prototype, 'close').mockImplementation(function (this: Modal) {
		close.call(this);
		const opener = openers.get(this) as HTMLElement | null | undefined;
		if (opener && opener !== document.body && opener.isConnected) opener.focus();
	});
});
afterEach(() => {
	jest.restoreAllMocks();
	document.body.innerHTML = '';
});

describe('SC-608: an outside edit redraws the tracker while a window is open (Reading view, Live Preview)', () => {
	test('[O01] Reading view order (the new section is drawn first): the window closes, one Notice, focus on the rebuilt Stamina control with the ring', async () => {
		const old = await mount(SQUAD);
		openPool(old.root);
		const fresh = await mount(SQUAD_EDITED, old.pane);
		old.view.unload(); // Obsidian throws the old section away
		old.root.remove();
		await later();
		expect(modalEl()).toBeNull();
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(ctl(fresh.root, 'init.detail.stamina'));
		expect(document.activeElement?.matches(':focus-visible') ?? true).toBe(true);
	});

	test('[O02] Live Preview order (the window closes first, the new widget arrives later): focus lands once it is built', async () => {
		const old = await mount(SQUAD);
		openPool(old.root);
		old.view.unload();
		old.root.remove();
		await later(5);
		expect(modalEl()).toBeNull();
		expect(document.activeElement).toBe(document.body); // nothing to hand it to yet
		const fresh = await mount(SQUAD_EDITED, old.pane);
		await later();
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(ctl(fresh.root, 'init.detail.stamina'));
	});

	test('[O03] the Conditions window: focus lands on the rebuilt Add Condition button, the same hero\'s', async () => {
		const old = await mount(TRACKER);
		const opener = ctl(old.root, 'init.cond.add');
		opener.focus();
		opener.click();
		const input = ctl<HTMLInputElement>(modalEl()!, 'cond.add');
		input.click();
		ctl<HTMLInputElement>(modalEl()!, 'cond.input').value = 'daz'; // half typed: dropped with the window
		const fresh = await mount(TRACKER_EDITED, old.pane);
		old.view.unload();
		old.root.remove();
		await later();
		expect(modalEl()).toBeNull();
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(ctl(fresh.root, 'init.cond.add', 0));
	});

	test('[O04] the hero Stamina window: focus lands on the rebuilt hero Stamina control', async () => {
		const old = await mount(TRACKER);
		const opener = ctl(old.root, 'init.hero.stamina');
		opener.focus();
		opener.click();
		const fresh = await mount(TRACKER_EDITED, old.pane);
		old.view.unload();
		old.root.remove();
		await later();
		expect(modalEl()).toBeNull();
		expect(document.activeElement).toBe(ctl(fresh.root, 'init.hero.stamina'));
	});

	test('[O05] the creature Stamina window: focus lands on the rebuilt control of the same creature', async () => {
		const old = await mount(TRACKER);
		const cell = ctl(old.root, 'init.cell.stamina', 1); // Ogre #2
		cell.focus();
		cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(modalEl()).not.toBeNull();
		const fresh = await mount(TRACKER_EDITED, old.pane);
		old.view.unload();
		old.root.remove();
		await later();
		expect(modalEl()).toBeNull();
		expect(document.activeElement).toBe(ctl(fresh.root, 'init.cell.stamina', 1));
	});

	test('[O06] the Reset encounter confirm hands off its own token: focus lands on the rebuilt Reset encounter item', async () => {
		const old = await mount(TRACKER);
		const item = ctl(old.root, 'init.reset-encounter');
		item.focus();
		item.click();
		expect(modalEl()).not.toBeNull();
		const fresh = await mount(TRACKER_EDITED, old.pane);
		old.view.unload();
		old.root.remove();
		await later();
		expect(modalEl()).toBeNull();
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(ctl(fresh.root, 'init.reset-encounter'));
	});

	test('[O07] opened with the mouse (focus was not inside the tracker): the Notice shows, nothing is focused', async () => {
		const old = await mount(SQUAD);
		ctl(old.root, 'init.detail.stamina').click(); // nothing held focus
		const fresh = await mount(SQUAD_EDITED, old.pane);
		old.view.unload();
		old.root.remove();
		await later();
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(document.body);
		expect(fresh.root.hasAttribute('tabindex')).toBe(false);
	});

	test('[O08] the control that held focus is gone from the redrawn tracker: its family\'s last control, else the tracker root, never <body>', async () => {
		const old = await mount(TRACKER);
		const opener = ctl(old.root, 'init.cell.stamina', 2); // Ogre #3
		opener.focus();
		opener.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const shrunk = TRACKER_EDITED.replace('amount: 3', 'amount: 2'); // the edit removed an Ogre
		const fresh = await mount(shrunk, old.pane);
		old.view.unload();
		old.root.remove();
		await later();
		expect(document.activeElement).toBe(ctl(fresh.root, 'init.cell.stamina', 1));
		// ...and with no control of that family at all (every creature gone), the root takes it
		const second = await mount(TRACKER);
		const cell = ctl(second.root, 'init.cell.stamina', 0);
		cell.focus();
		cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const none = await mount(src(HEROES, ['enemy_groups: []'], malice(9)), second.pane);
		second.view.unload();
		second.root.remove();
		await later();
		expect(document.activeElement).toBe(none.root);
	});

	test('[O09] the redrawn block has the same content (the view\'s own save, a re-render): no Notice and nothing is moved, as before', async () => {
		const old = await mount(SQUAD);
		openPool(old.root);
		await mount(SQUAD, old.pane);
		old.view.unload();
		old.root.remove();
		await later();
		expect(modalEl()).toBeNull();
		expect(notices()).toHaveLength(0);
		expect(document.activeElement).toBe(document.body);
	});

	test('[O10] the tracker is gone (the note was closed, the edit deleted the block): nothing is shown or focused', async () => {
		const old = await mount(SQUAD);
		openPool(old.root);
		old.view.unload();
		old.root.remove();
		await later(60);
		expect(modalEl()).toBeNull();
		expect(notices()).toHaveLength(0);
		expect(document.activeElement).toBe(document.body);
	});

	test('[O11] focus that the user has put elsewhere is not taken; the Notice still follows the redraw', async () => {
		const old = await mount(SQUAD);
		openPool(old.root);
		const other = document.body.appendChild(document.createElement('input'));
		const fresh = await mount(SQUAD_EDITED, old.pane);
		old.view.unload();
		old.root.remove();
		other.focus(); // the user clicked into another field before the hand-off ran
		await later();
		expect(document.activeElement).toBe(other);
		expect(notices()).toHaveLength(1);
		expect(fresh.root.contains(document.activeElement)).toBe(false);
	});

	test('[O12] focus sitting on the dying view\'s own control (Obsidian\'s focus return, Live Preview) counts as free', async () => {
		const old = await mount(SQUAD);
		const opener = openPool(old.root);
		old.view.unload(); // closes the window; the mock's focus return lands on the still-connected opener
		expect(document.activeElement).toBe(opener);
		const fresh = await mount(SQUAD_EDITED, old.pane);
		old.root.remove();
		await later();
		expect(document.activeElement).toBe(ctl(fresh.root, 'init.detail.stamina'));
	});

	test('[O13] only the tracker at the same slot takes it: another pane\'s copy of the note, and another note\'s tracker in this pane, do not', async () => {
		const old = await mount(SQUAD);
		openPool(old.root);
		const otherPane = await mount(SQUAD_EDITED); // the same note in another leaf
		const embed = old.pane.appendChild(document.createElement('div'));
		embed.className = 'internal-embed';
		const otherNote = await mount(SQUAD_EDITED, embed, 'Other.md'); // another note's tracker, embedded in this pane
		old.view.unload();
		old.root.remove();
		await later();
		expect(document.activeElement).toBe(document.body);
		expect(notices()).toHaveLength(0);
		const mine = await mount(SQUAD_EDITED, old.pane);
		await later();
		expect(document.activeElement).toBe(ctl(mine.root, 'init.detail.stamina'));
		expect([otherPane.root, otherNote.root].some((r) => r.contains(document.activeElement))).toBe(false);
	});

	test('[O15] two trackers in one note: the window of the SECOND one hands focus to the second, not to the first', async () => {
		const first = await mount(TRACKER);
		const second = await mount(SQUAD, first.pane); // the same pane, below the first
		openPool(second.root);
		const fresh = await mount(SQUAD_EDITED, first.pane); // only the second block was edited: the first section is not redrawn
		second.view.unload();
		second.root.remove();
		await later();
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(ctl(fresh.root, 'init.detail.stamina'));
		expect(first.root.contains(document.activeElement)).toBe(false);
	});

	test('[O14] the tracker\'s own Apply shows no Notice and keeps its focus hand-back', async () => {
		const old = await mount(SQUAD);
		openPool(old.root);
		const modal = modalEl()!;
		ctl<HTMLInputElement>(modal, 'pool.damage-amount').value = '3';
		ctl<HTMLInputElement>(modal, 'pool.minion-count').value = '1';
		ctl(modal, 'pool.apply-damage').click();
		ctl(modal, 'pool.apply').click();
		await later();
		expect(modalEl()).toBeNull();
		expect(notices()).toHaveLength(0);
		expect(document.activeElement).toBe(ctl(old.root, 'init.detail.stamina'));
	});
});
