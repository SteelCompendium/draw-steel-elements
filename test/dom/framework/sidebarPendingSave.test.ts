// SC-662 — the pinned sidebar never loses a pending save or an outside edit. When the pinned note changes from outside (Sync, another pane,
// another card's write) the sidebar refreshes its card in place, and that refresh used to lose data three ways:
//   - the card's own save, still waiting out the 400 ms debounce, was thrown away with the model the refresh replaced (a counter click,
//     a montage Log; SC-550 is the counter case, the note card's write being the outside change);
//   - a window the card owns through a child component (ds-conditions) closed with the old card and saved its staged list over the new note;
//   - a window the view owns (the stamina bar's) stayed open on the OLD model, so its Apply mutated an object nobody serializes.
// The rules now (SidebarPanel.handleExternalChange): a refresh whose block text is what the view last loaded or wrote does nothing at all (the
// window stays, the live model stays the live one, a pending save is written on time); a refresh whose block changed first starts the view's own
// pending save (which the host refuses if the block changed on disk first, with the dropped-write Notice a Reading-view card shows for the same
// sequence), closes every window over the card WITHOUT saving what it staged, rebuilds the card, and says so (OUTSIDE_CLOSE_NOTICE).
//
// Harness: the real stack (sendToSidebar -> DseSidebarView -> SidebarPanel -> SidebarBlockHost -> ElementPipeline), as sidebarInitiative.test.ts,
// with a FAKE clock: the 400 ms write and every gap between steps are literal fake-time numbers, never the product's constant.
import { App, Notice, Plugin, TFile, flushAsync, parseYaml } from '../../mocks/obsidian';
import { Modal } from '../../mocks/obsidian';
import { initializeElementFrameworkV2, registerFrameworkElementDefinitions } from 'main';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { DseSidebarView, VIEW_TYPE_DSE_SIDEBAR } from '@/framework/sidebar/DseSidebarView';
import type { DseSidebarServices } from '@/framework/sidebar/DseSidebarView';
import { sendToSidebar } from '@/framework/sidebar/registration';

const NOTICE = 'The note changed outside, so this window closed without saving';
const NOT_SAVED = 'Draw Steel Elements: a change to a block in counter was not saved — the block changed on disk first.';

/** Real "modify" delivery on this test's own vault (the shared mock's `on` is a no-op); see sidebarInitiative.test.ts. */
function withRealModifyEvents(app: App): { fireModify: (file: TFile) => void } {
	const listeners: Array<(file: TFile) => void> = [];
	const vault = app.vault as unknown as {
		on: (name: string, cb: (...args: any[]) => any) => any;
		process: (file: TFile, fn: (data: string) => string) => Promise<string>;
	};
	vault.on = (name: string, cb: (...args: any[]) => any) => {
		if (name === 'modify') listeners.push(cb);
		return { unsubscribe: () => {} };
	};
	const originalProcess = vault.process.bind(vault);
	vault.process = async (file: TFile, fn: (data: string) => string) => {
		const result = await originalProcess(file, fn);
		for (const cb of listeners.slice()) cb(file);
		return result;
	};
	return { fireModify: (file: TFile) => { for (const cb of listeners.slice()) cb(file); } };
}

interface Env {
	app: App;
	services: DseSidebarServices;
	fireModify: (file: TFile) => void;
}
function setup(): Env {
	const app = new App();
	const plugin = new Plugin(app);
	const frameworkV2 = initializeElementFrameworkV2(app as any, plugin as any, DEFAULT_SETTINGS);
	registerFrameworkElementDefinitions(frameworkV2.registry);
	const services = {
		app,
		plugin,
		pipeline: frameworkV2.pipeline,
		registry: frameworkV2.registry,
		refs: frameworkV2.services.refs,
		validation: frameworkV2.services.validation,
		prefs: frameworkV2.services.prefs,
	} as unknown as DseSidebarServices;
	plugin.registerView(VIEW_TYPE_DSE_SIDEBAR, ((leaf: any) => new DseSidebarView(leaf, services)) as any);
	const { fireModify } = withRealModifyEvents(app);
	return { app, services, fireModify };
}

/** Await `p` while the fake clock ticks 1 ms at a time: the mock vault's reads take a `setTimeout(0)` hop each, which a frozen clock never delivers. */
async function pump<T>(p: Promise<T>): Promise<T> {
	let done = false;
	const finished = p.finally(() => {
		done = true;
	});
	while (!done) await jest.advanceTimersByTimeAsync(1);
	return finished;
}
/** Time passes on the fake clock. */
const later = (ms: number): Promise<void> => jest.advanceTimersByTimeAsync(ms);

const noticeCount = (text: string): number => Notice.notices.filter((n) => n === text).length;
const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string, n = 0): T => {
	const el = root.querySelectorAll<T>(sel)[n];
	if (!el) throw new Error(`no ${sel}[${n}]`);
	return el;
};
const control = <T extends HTMLElement = HTMLElement>(root: ParentNode, id: string, n = 0): T => q<T>(root, `[data-dse-control="${id}"]`, n);
const anyWindow = (): boolean => document.querySelector('.dse-modal') !== null;
const windowEl = (): HTMLElement => q(document, '.dse-modal');

/** Pin the `n`-th block of `alias` in `path` (the note is seeded first) and wait for it to draw. */
async function pin(env: Env, path: string, content: string, alias: string, cursorLine?: number): Promise<HTMLElement> {
	if (!env.app.vault.getAbstractFileByPath(path)) env.app.vault.setFile(path, content);
	await pump(sendToSidebar(env.services, path, alias, cursorLine));
	await later(20);
	const view = env.app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0].view as unknown as DseSidebarView;
	const panels = view.contentEl.querySelectorAll<HTMLElement>('.dse-sidebar__panel');
	return panels[panels.length - 1];
}

/** An edit by someone else: the note is rewritten and the vault says so. */
async function outsideEdit(env: Env, path: string, edit: (content: string) => string): Promise<void> {
	const file = env.app.vault.getAbstractFileByPath(path) as TFile;
	env.app.vault.setFile(path, edit(env.app.vault.getContent(path)!));
	env.fireModify(file);
	await later(20);
}
const content = (env: Env, path: string): string => env.app.vault.getContent(path)!;

/** The parsed body of the `n`-th fence of `lang` in `path`. */
function blockOf(env: Env, path: string, lang: string, n = 0): any {
	const lines = content(env, path).split('\n');
	let seen = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i] !== '```' + lang) continue;
		if (++seen !== n) continue;
		const end = lines.indexOf('```', i + 1);
		return parseYaml(lines.slice(i + 1, end).join('\n'));
	}
	throw new Error(`no ${lang}[${n}] in ${path}`);
}

let closeOriginal: () => void = () => undefined;
beforeEach(() => {
	jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
	Notice.notices.length = 0;
	// Real Obsidian hands focus back to the control that held it when a modal opened, synchronously inside `close()`; the shared mock does not.
	const openers = new WeakMap<object, Element | null>();
	const open = Modal.prototype.open;
	const close = Modal.prototype.close;
	closeOriginal = close;
	jest.spyOn(Modal.prototype, 'open').mockImplementation(function (this: InstanceType<typeof Modal>) {
		openers.set(this, document.activeElement);
		open.call(this);
	});
	jest.spyOn(Modal.prototype, 'close').mockImplementation(function (this: InstanceType<typeof Modal>) {
		close.call(this);
		const opener = openers.get(this) as HTMLElement | null | undefined;
		if (opener && opener !== document.body && opener.isConnected) opener.focus();
	});
});
afterEach(() => {
	jest.restoreAllMocks();
	jest.useRealTimers();
	document.body.innerHTML = '';
	void closeOriginal;
});

// ----------------------------------------------------------------------------------------------------------------------- notes
const COUNTER_NOTE = ['# Session', '', 'ABOVE', '', '```ds-counter', 'name: Health', 'current_value: 1', 'max_value: 3', 'min_value: 0', '```', '', 'BELOW', ''].join('\n');
const STAMINA_NOTE = ['# Session', '', 'ABOVE', '', '```ds-stamina-bar', 'max_stamina: 20', 'current_stamina: 15', 'temp_stamina: 5', '```', '', 'BELOW', ''].join('\n');
const CONDITIONS_NOTE = ['# Session', '', 'ABOVE', '', '```ds-conditions', 'conditions:', '  - bleeding', '```', '', 'BELOW', ''].join('\n');
const MONTAGE_NOTE = [
	'# Session', '', 'ABOVE', '', '```ds-montage', 'title: Heist', 'rounds: 3', 'success_limit: 5', 'failure_limit: 3', 'successes: 0', 'failures: 0',
	'participants:', '  - name: Kira', '  - name: Bram', 'current_round: 1', '```', '', 'BELOW', '',
].join('\n');

describe('SC-662: a pending save of a pinned card is never lost by a refresh', () => {
	test('[PS01] a counter press, then an outside edit elsewhere in the note inside the debounce: the press reaches the note and so does the outside edit (SC-550)', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', COUNTER_NOTE, 'ds-counter');
		control(panel, 'counter.inc').click(); // 1 -> 2, written 400 ms later
		await later(50);
		await outsideEdit(env, 'Session.md', (c) => c.replace('BELOW', 'BELOW and more'));
		await later(600);
		expect(blockOf(env, 'Session.md', 'ds-counter').current_value).toBe(2);
		expect(content(env, 'Session.md')).toContain('BELOW and more');
		expect(content(env, 'Session.md')).toContain('ABOVE');
		expect(Notice.notices).toEqual([]);
	});

	test('[PS02] a montage Log, then an outside edit elsewhere inside the debounce: the logged action reaches the note', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', MONTAGE_NOTE, 'ds-montage');
		control(panel, 'montage.bar.log').click();
		control(document, 'montage.log.submit').click(); // the window closes, the write waits out its 400 ms
		await later(50);
		await outsideEdit(env, 'Session.md', (c) => c.replace('BELOW', 'BELOW and more'));
		await later(600);
		expect(blockOf(env, 'Session.md', 'ds-montage').entries).toEqual([{ hero: 'Kira', round: 1, result: 'success' }]);
		expect(content(env, 'Session.md')).toContain('BELOW and more');
		expect(Notice.notices).toEqual([]);
	});

	test('[PS03] the press and an outside edit to the SAME block inside the debounce: the outside edit is kept, the press is refused with the Reading view\'s dropped-write Notice, the card shows the outside block', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', COUNTER_NOTE, 'ds-counter');
		control(panel, 'counter.inc').click();
		await later(50);
		await outsideEdit(env, 'Session.md', (c) => c.replace('max_value: 3', 'max_value: 5'));
		await later(600);
		const block = blockOf(env, 'Session.md', 'ds-counter');
		expect(block.max_value).toBe(5); // the outside edit survives
		expect(block.current_value).toBe(1); // the press was written over nothing
		expect(noticeCount(NOT_SAVED)).toBe(1); // said so, as a Reading-view card does for the same sequence (measured in real Obsidian)
		expect(control(panel, 'counter.input', 0).getAttribute('value') ?? (control(panel, 'counter.input') as HTMLInputElement).value).toBe('1');
		expect(panel.textContent).toContain('5'); // the card was redrawn from the outside block
	});

	test('[PS04] a write the view makes after the block changed on disk (its card not refreshed yet) is refused, never written over the outside edit', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', COUNTER_NOTE, 'ds-counter');
		const file = env.app.vault.getAbstractFileByPath('Session.md') as TFile;
		env.app.vault.setFile('Session.md', content(env, 'Session.md').replace('max_value: 3', 'max_value: 5')); // no modify event yet: the refresh has not run
		control(panel, 'counter.inc').click();
		await later(600);
		expect(blockOf(env, 'Session.md', 'ds-counter').max_value).toBe(5);
		expect(blockOf(env, 'Session.md', 'ds-counter').current_value).toBe(1);
		expect(noticeCount(NOT_SAVED)).toBe(1);
		void file;
	});
});

describe('SC-662: a refresh whose block did not change does nothing', () => {
	test('[PS05] an outside edit elsewhere in the note: the card is not rebuilt (its nodes stay), a later press still writes', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', COUNTER_NOTE, 'ds-counter');
		const inc = control(panel, 'counter.inc');
		await outsideEdit(env, 'Session.md', (c) => c.replace('BELOW', 'BELOW and more'));
		expect(inc.isConnected).toBe(true);
		expect(control(panel, 'counter.inc')).toBe(inc);
		inc.click();
		await later(600);
		expect(blockOf(env, 'Session.md', 'ds-counter').current_value).toBe(2);
	});

	test('[PS06] an outside edit that changes the block redraws the card (the new text shows) and no Notice is shown when no window was open', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', COUNTER_NOTE, 'ds-counter');
		const inc = control(panel, 'counter.inc');
		await outsideEdit(env, 'Session.md', (c) => c.replace('current_value: 1', 'current_value: 3'));
		expect(control(panel, 'counter.inc')).not.toBe(inc);
		expect((control(panel, 'counter.input') as HTMLInputElement).value).toBe('3');
		expect(Notice.notices).toEqual([]);
	});

	test('[PS07] the echo of the view\'s own write redraws nothing', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', COUNTER_NOTE, 'ds-counter');
		control(panel, 'counter.inc').click();
		await later(600);
		const inc = control(panel, 'counter.inc');
		await outsideEdit(env, 'Session.md', (c) => c); // the vault announces the file again
		expect(control(panel, 'counter.inc')).toBe(inc);
		expect(Notice.notices).toEqual([]);
	});
});

describe('SC-662: ds-conditions (a window owned by a child component)', () => {
	/** "+ add condition" opens the window; "dazed" is typed and picked in it (applied live to the window, written when it closes). */
	async function stageDazed(panel: HTMLElement): Promise<void> {
		q(panel, '.dse-cond-strip__add').click();
		control(windowEl(), 'cond.add').click();
		const input = control<HTMLInputElement>(windowEl(), 'cond.input');
		input.value = 'dazed';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		await later(30);
	}
	const conditionKeys = (env: Env): string[] => (blockOf(env, 'Session.md', 'ds-conditions').conditions as Array<string | { key: string }>).map((c) => (typeof c === 'string' ? c : c.key));

	test('[PS08] dazed staged in the window, an outside edit adds prone: the window closes without saving, one Notice, and the note ends with the outside edit (never overwritten)', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', CONDITIONS_NOTE, 'ds-conditions');
		await stageDazed(panel);
		expect(anyWindow()).toBe(true);
		await outsideEdit(env, 'Session.md', (c) => c.replace('  - bleeding\n', '  - bleeding\n  - prone\n'));
		await later(600);
		expect(anyWindow()).toBe(false);
		expect(noticeCount(NOTICE)).toBe(1);
		expect(conditionKeys(env)).toEqual(['bleeding', 'prone']);
		expect(panel.textContent?.toLowerCase()).toContain('prone');
		expect(panel.textContent?.toLowerCase()).not.toContain('dazed');
	});

	test('[PS09] nothing staged, an outside edit elsewhere in the note: the window stays open (the block did not change) with no Notice; what is staged after that is saved with the outside edit kept', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', CONDITIONS_NOTE, 'ds-conditions');
		q(panel, '.dse-cond-strip__add').click();
		await outsideEdit(env, 'Session.md', (c) => c.replace('BELOW', 'BELOW and more'));
		expect(anyWindow()).toBe(true);
		expect(Notice.notices).toEqual([]);
		control(windowEl(), 'cond.add').click();
		const input = control<HTMLInputElement>(windowEl(), 'cond.input');
		input.value = 'dazed';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		control(windowEl(), 'cond.done').click(); // the window closes and writes what it holds
		await later(600);
		expect(conditionKeys(env)).toEqual(['bleeding', 'dazed']);
		expect(content(env, 'Session.md')).toContain('BELOW and more');
	});

	test('[PS10] nothing staged, an outside edit to the block: the window closes with the Notice and nothing is written', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', CONDITIONS_NOTE, 'ds-conditions');
		const before = content(env, 'Session.md');
		q(panel, '.dse-cond-strip__add').click();
		const edited = before.replace('  - bleeding\n', '  - bleeding\n  - prone\n');
		await outsideEdit(env, 'Session.md', () => edited);
		await later(600);
		expect(anyWindow()).toBe(false);
		expect(noticeCount(NOTICE)).toBe(1);
		expect(content(env, 'Session.md')).toBe(edited);
	});
});

describe('SC-662: ds-stamina-bar (a window owned by the view)', () => {
	function stageDamage(amount: string): void {
		const input = q<HTMLInputElement>(windowEl(), '.dse-sedit__apply-input');
		input.value = amount;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		q(windowEl(), 'button[aria-label="Damage"]').click();
	}
	const apply = (): void => control(windowEl(), 'sedit.apply').click();

	test('[PS11] 3 damage staged, an outside edit elsewhere in the note, then Apply: the window stayed open and the Apply reaches the note (temp_stamina 5 -> 2)', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', STAMINA_NOTE, 'ds-stamina-bar');
		control(panel, 'stamina.bar').click();
		stageDamage('3');
		await outsideEdit(env, 'Session.md', (c) => c.replace('BELOW', 'BELOW and more'));
		expect(anyWindow()).toBe(true);
		apply();
		await later(600);
		expect(blockOf(env, 'Session.md', 'ds-stamina-bar').temp_stamina).toBe(2);
		expect(content(env, 'Session.md')).toContain('BELOW and more');
		expect(Notice.notices).toEqual([]);
	});

	test('[PS12] 3 damage staged, an outside edit to the block: the window closes without applying, one Notice, the outside value stays in the note and on the card', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', STAMINA_NOTE, 'ds-stamina-bar');
		control(panel, 'stamina.bar').click();
		stageDamage('3');
		await outsideEdit(env, 'Session.md', (c) => c.replace('current_stamina: 15', 'current_stamina: 9'));
		await later(600);
		expect(anyWindow()).toBe(false);
		expect(noticeCount(NOTICE)).toBe(1);
		const block = blockOf(env, 'Session.md', 'ds-stamina-bar');
		expect(block.current_stamina).toBe(9);
		expect(block.temp_stamina).toBe(5);
		expect(panel.textContent).toContain('9');
	});

	test('[PS13] opened from the keyboard (focus on the bar), the window closed by an outside edit hands focus to the rebuilt bar', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', STAMINA_NOTE, 'ds-stamina-bar');
		const bar = control(panel, 'stamina.bar');
		bar.focus();
		bar.click();
		expect(anyWindow()).toBe(true);
		await outsideEdit(env, 'Session.md', (c) => c.replace('current_stamina: 15', 'current_stamina: 9'));
		await later(600);
		expect(anyWindow()).toBe(false);
		expect(document.activeElement).toBe(control(panel, 'stamina.bar'));
		expect(document.activeElement).not.toBe(bar);
	});

	test('[PS14] opened with the mouse (focus was not in the card), the window closed by an outside edit moves no focus and still shows the Notice', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', STAMINA_NOTE, 'ds-stamina-bar');
		control(panel, 'stamina.bar').click(); // no focus on the card
		await outsideEdit(env, 'Session.md', (c) => c.replace('current_stamina: 15', 'current_stamina: 9'));
		await later(600);
		expect(noticeCount(NOTICE)).toBe(1);
		expect(panel.contains(document.activeElement) && document.activeElement !== document.body).toBe(false);
	});
});

describe('SC-662: ds-montage (already handled by SC-650) through the real sidebar', () => {
	test('[PS15] a Log window open, an outside edit to the block: one Notice, nothing staged is written, the card shows the outside block', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', MONTAGE_NOTE, 'ds-montage');
		control(panel, 'montage.bar.log').click();
		await outsideEdit(env, 'Session.md', (c) => c.replace('success_limit: 5', 'success_limit: 6'));
		await later(600);
		expect(anyWindow()).toBe(false);
		expect(noticeCount(NOTICE)).toBe(1);
		expect(blockOf(env, 'Session.md', 'ds-montage').entries).toBeUndefined();
		expect(panel.textContent).toContain('6 from Total Success');
	});

	test('[PS16] a Log window open, an outside edit elsewhere in the note: the window stays and its Log writes', async () => {
		const env = setup();
		const panel = await pin(env, 'Session.md', MONTAGE_NOTE, 'ds-montage');
		control(panel, 'montage.bar.log').click();
		await outsideEdit(env, 'Session.md', (c) => c.replace('BELOW', 'BELOW and more'));
		expect(anyWindow()).toBe(true);
		control(document, 'montage.log.submit').click();
		await later(600);
		expect(blockOf(env, 'Session.md', 'ds-montage').entries).toHaveLength(1);
		expect(Notice.notices).toEqual([]);
	});
});

describe('SC-662: integrity', () => {
	const TWO_STAMINA = [
		'# Session', '', 'ABOVE', '', '```ds-stamina-bar', 'max_stamina: 20', 'current_stamina: 15', 'temp_stamina: 5', '```', '', 'MIDDLE', '',
		'```ds-stamina-bar', 'max_stamina: 30', 'current_stamina: 25', 'temp_stamina: 4', '```', '', 'BELOW', '',
	].join('\n');

	test('[PS17] two pinned blocks of one kind: an outside edit to the first leaves the second\'s window open and its Apply writes; the first redraws; content above, between and below survives', async () => {
		const env = setup();
		const first = await pin(env, 'Session.md', TWO_STAMINA, 'ds-stamina-bar', 4);
		const second = await pin(env, 'Session.md', TWO_STAMINA, 'ds-stamina-bar', 13);
		expect(first).not.toBe(second);
		control(second, 'stamina.bar').click();
		const input = q<HTMLInputElement>(windowEl(), '.dse-sedit__apply-input');
		input.value = '3';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		q(windowEl(), 'button[aria-label="Damage"]').click();
		await outsideEdit(env, 'Session.md', (c) => c.replace('current_stamina: 15', 'current_stamina: 9')); // the FIRST block
		expect(anyWindow()).toBe(true);
		expect(Notice.notices).toEqual([]);
		expect(first.textContent).toContain('9');
		control(windowEl(), 'sedit.apply').click();
		await later(600);
		expect(blockOf(env, 'Session.md', 'ds-stamina-bar', 0).current_stamina).toBe(9);
		expect(blockOf(env, 'Session.md', 'ds-stamina-bar', 1).temp_stamina).toBe(1);
		const text = content(env, 'Session.md');
		for (const keep of ['ABOVE', 'MIDDLE', 'BELOW', '# Session']) expect(text).toContain(keep);
	});
});
