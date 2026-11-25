// SC-690 — "Remove a hero", the montage's ⋯ menu item that takes a hero (and the actions logged for them) off the board: the item and where it
// sits, the window (the board's heroes in board order, Remove disabled until one is picked, the plain line saying what will go), the ways out
// that write nothing, the one write, a hero an outside edit took off while the window was open, and where focus goes afterwards.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import type { RollService } from '../../../src/framework/roll/service';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Notice, Plugin, parseYaml } from '../../mocks/obsidian';
import { montageElement } from '../../../src/elements/montage/definition';
import { MontageView } from '../../../src/elements/montage/view';
import { parse } from '../../../src/elements/montage/model';
import type { MontageRemoveHeroModal } from '../../../src/elements/montage/ConfigModals';
import montageMidYaml from '../../../src/elements/montage/fixture-mid.yaml';
import { attachObsidianKeymap, pressEscape } from '../_obsidianKeymap';

const OPEN_TRACKED = (MontageView.prototype as any).openTrackedModal;

beforeEach(() => {
	Notice.notices.length = 0;
});

function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme: createThemeService(prefs, plugin as any),
		prefs,
		refs: createReferenceService(app as any, DEFAULT_SETTINGS),
		validation: createValidationService(),
		session: createSessionStore(),
		roll: { resolve: () => ({ total: 0, tier: 1 }) } as unknown as RollService,
	};
}

/** Mount a montage through the real pipeline. `view` is the live MontageView; `modal` fills in when "Remove a hero" opens. */
async function mount(source: string, canPersist = true) {
	let view!: MontageView;
	const containerEl = document.body.appendChild(document.createElement('div'));
	const replaceSource = jest.fn(async (_body: string) => true);
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist,
		addChild: (child: unknown) => ((view = child as MontageView), child),
		getBlockInfo: () => ({ language: 'ds-montage', lineStart: 0, lineEnd: 12 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-montage::0',
	} as unknown as BlockHost;
	await new ElementPipeline(makeDeps()).run(montageElement, source, host);
	const state: { modal?: MontageRemoveHeroModal } = {};
	jest.spyOn(MontageView.prototype as any, 'openTrackedModal').mockImplementation(function (this: unknown, ...args: unknown[]) {
		return (state.modal = OPEN_TRACKED.apply(this, args));
	});
	return { view, replaceSource, containerEl, state, root: () => containerEl.firstElementChild as HTMLElement };
}

const item = (root: HTMLElement, id: string) => root.querySelector<HTMLButtonElement>(`[data-dse-chrome-item="${id}"]`);
const itemIds = (root: HTMLElement) =>
	Array.from(root.querySelectorAll('.dse-chrome [data-dse-chrome-item]')).map((el) => el.getAttribute('data-dse-chrome-item')).filter((id) => id?.startsWith('montage-'));
const windowEl = (): HTMLElement => document.querySelector('.modal-container') as HTMLElement;
const chips = (): HTMLButtonElement[] => Array.from(windowEl().querySelectorAll<HTMLButtonElement>('[data-dse-control="montage.remove-hero.hero"]'));
const chipOf = (name: string): HTMLButtonElement => chips().find((c) => c.getAttribute('data-dse-focus-at') === name)!;
const removeBtn = (): HTMLButtonElement => windowEl().querySelector('[data-dse-control="montage.remove-hero.submit"]') as HTMLButtonElement;
const cancelBtn = (): HTMLButtonElement => windowEl().querySelector('[data-dse-control="montage.remove-hero.cancel"]') as HTMLButtonElement;
const line = (): HTMLElement => windowEl().querySelector('.dse-mt__sheet-consequence') as HTMLElement;
const rows = (root: HTMLElement): string[] => Array.from(root.querySelectorAll('.dse-mt__board-who')).map((el) => el.textContent ?? '');
const tallyOf = (root: HTMLElement, hero: string): string => root.querySelector(`.dse-mt__board-total[data-hero="${hero}"]`)?.getAttribute('aria-label') ?? '';
const focused = (): string | null => document.activeElement?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null;

const TWO = ['rounds: 3', 'success_limit: 6', 'failure_limit: 3', 'participants:', '  - name: Kira', '  - name: Bram'].join('\n');
const ONE = ['rounds: 3', 'participants:', '  - name: Kira', 'entries:', '  - hero: Kira', '    round: 1', '    result: success', 'successes: 1', 'current_round: 1'].join('\n');

describe('SC-690: the "Remove a hero" menu item', () => {
	afterEach(() => {
		jest.restoreAllMocks();
		jest.useRealTimers();
		document.body.innerHTML = '';
	});

	test('it is the fifth montage item and sits right after "Add a hero", with its own icon and control id', async () => {
		const { root } = await mount(montageMidYaml);
		expect(itemIds(root())).toEqual(['montage-add-round', 'montage-add-hero', 'montage-remove-hero', 'montage-set-limits', 'montage-reset-progress']);
		const el = item(root(), 'montage-remove-hero')!;
		expect(el.getAttribute('aria-label')).toBe('Remove a hero');
		expect(el.getAttribute('data-dse-control')).toBe('montage.chrome.remove-hero');
	});

	test('a read-only host offers none of the montage items, this one included', async () => {
		const { root } = await mount(montageMidYaml, false);
		expect(item(root(), 'montage-remove-hero')).toBeNull();
	});

	test('a montage with no heroes does not offer it, and it comes back once a hero is added', async () => {
		jest.useFakeTimers();
		const { root } = await mount('rounds: 2');
		expect(itemIds(root())).not.toContain('montage-remove-hero');
		item(root(), 'montage-add-hero')!.click();
		const input = windowEl().querySelector('input') as HTMLInputElement;
		input.value = 'Kira';
		input.dispatchEvent(new Event('input'));
		(windowEl().querySelector('[data-dse-control="montage.add-hero.submit"]') as HTMLButtonElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(itemIds(root())).toContain('montage-remove-hero');
	});
});

describe('SC-690: the "Remove a hero" window', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		jest.restoreAllMocks();
		jest.useRealTimers();
		document.body.innerHTML = '';
	});

	const open = async (source = montageMidYaml) => {
		const m = await mount(source);
		item(m.root(), 'montage-remove-hero')!.click();
		return m;
	};

	test('it lists the heroes in board order with nothing picked, and Remove is disabled', async () => {
		await open();
		expect(windowEl().querySelector('.dse-modal__title')?.textContent).toBe('Remove a hero');
		expect(chips().map((c) => c.getAttribute('aria-label'))).toEqual(['Kira', 'Bram', 'Osric', 'Yenna', 'Talin']);
		expect(chips().every((c) => c.getAttribute('aria-pressed') === 'false')).toBe(true);
		expect(removeBtn().disabled).toBe(true);
		expect(removeBtn().textContent).toBe('Remove');
		expect(removeBtn().getAttribute('aria-label')).toBe('Remove');
		expect(cancelBtn().disabled).toBe(false);
	});

	test('the line that says what will go is in the accessibility tree from the start (a live region, empty, never hidden) and sits outside the scrolling body, with the footer', async () => {
		await open();
		expect(line().getAttribute('role')).toBe('status');
		expect(line().getAttribute('aria-live')).toBe('polite');
		expect(line().hidden).toBe(false);
		expect(line().textContent).toBe('');
		expect(line().closest('.dse-modal__body')).toBeNull();
		expect(line().nextElementSibling).toBe(windowEl().querySelector('.dse-modal__footer'));
		chipOf('Kira').click();
		expect(line().hidden).toBe(false);
		expect(line().closest('.dse-modal__body')).toBeNull();
	});

	test('once a hero is picked Remove reads "Remove <name>" and its accessible name is the same text; picking another changes both', async () => {
		await open();
		chipOf('Bram').click();
		expect(removeBtn().textContent).toBe('Remove Bram');
		expect(removeBtn().getAttribute('aria-label')).toBe('Remove Bram');
		chipOf('Osric').click();
		expect(removeBtn().textContent).toBe('Remove Osric');
		expect(removeBtn().getAttribute('aria-label')).toBe('Remove Osric');
		expect(removeBtn().getAttribute('data-dse-control')).toBe('montage.remove-hero.submit');
	});

	test('picking a hero enables Remove, marks only that hero (aria-pressed and a check, not colour alone) and says what will go', async () => {
		await open();
		chipOf('Osric').click();
		expect(removeBtn().disabled).toBe(false);
		expect(chips().map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false', 'false']);
		expect(chipOf('Osric').querySelector('.dse-mt__sheet-chipglyph svg, .dse-mt__sheet-chipglyph')).not.toBeNull();
		expect(chipOf('Osric').hasAttribute('data-pressed')).toBe(true);
		expect(chipOf('Kira').hasAttribute('data-pressed')).toBe(false);
		expect(line().hidden).toBe(false);
		expect(line().textContent).toBe('Osric has 2 logged actions. They are removed too, and the tally follows.');
		chipOf('Kira').click();
		expect(chips().map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false']);
		expect(line().textContent).toContain('Kira has 2 logged actions');
	});

	test('the line is singular for one action, says "no logged actions" for none, and does not promise a removal when another hero keeps the name', async () => {
		const one = ['rounds: 2', 'participants:', '  - name: Kira', '  - name: Bram', '  - name: Kira', 'entries:', '  - hero: Bram', '    round: 1', '    result: success', 'successes: 1'].join('\n');
		await open(one);
		chipOf('Bram').click();
		expect(line().textContent).toBe('Bram has 1 logged action. It is removed too, and the tally follows.');
		chips()[0].click(); // the first Kira
		expect(line().textContent).toBe('Kira has no logged actions.');
		const shared = ['rounds: 2', 'participants:', '  - name: Kira', '  - name: Kira', 'entries:', '  - hero: Kira', '    round: 1', '    result: success', 'successes: 1'].join('\n');
		document.body.innerHTML = '';
		await open(shared);
		chips()[0].click();
		expect(line().textContent).toBe('Another hero is also named Kira, so the logged actions stay with that row.');
	});

	test('a long name wraps inside its chip: the name is whole text in the chip, not cut', async () => {
		const long = 'Ser Thaddeus-Alaric Montgomery-Featherstonehaugh of the Nine Hundred Ashen Vales';
		await open(`rounds: 2\nparticipants:\n  - name: ${long}`);
		expect(chips()[0].textContent).toBe(long);
		expect(chips()[0].getAttribute('aria-label')).toBe(long);
		chips()[0].click();
		// the button holds the whole name (CSS cuts it with an ellipsis, which jsdom cannot show; MONT-D17 measures it in Obsidian)
		expect(removeBtn().getAttribute('aria-label')).toBe(`Remove ${long}`);
		expect(removeBtn().querySelector('.dse-btn__text')?.textContent).toBe(`Remove ${long}`);
		expect(removeBtn().classList.contains('dse-mt__sheet-removebtn')).toBe(true);
	});

	test('Cancel closes the window and writes nothing', async () => {
		const { replaceSource, root } = await open();
		chipOf('Kira').click();
		cancelBtn().click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(document.querySelector('.modal-container')).toBeNull();
		expect(replaceSource).not.toHaveBeenCalled();
		expect(rows(root())).toHaveLength(5);
		expect(Notice.notices).not.toContain('Removed Kira from the montage');
	});

	test('Escape closes the window and writes nothing', async () => {
		const { replaceSource, state, root } = await open();
		attachObsidianKeymap(state.modal!);
		chipOf('Kira').click();
		pressEscape(chipOf('Kira'));
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(document.querySelector('.modal-container')).toBeNull();
		expect(replaceSource).not.toHaveBeenCalled();
		expect(rows(root())).toHaveLength(5);
	});

	test('Remove writes once: the hero\'s row goes, their actions go, the tally follows, the window closes and a Notice says so', async () => {
		const { replaceSource, root } = await open();
		expect(tallyOf(root(), 'Bram')).toBe('Bram: 1 success, 1 failure');
		chipOf('Bram').click();
		removeBtn().click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(document.querySelector('.modal-container')).toBeNull();
		expect(replaceSource).toHaveBeenCalledTimes(1);
		const written = replaceSource.mock.calls[0][0] as string;
		expect(written).not.toContain('Bram');
		expect(written).toContain('successes: 4');
		expect(written).toContain('failures: 1');
		expect(rows(root())).toEqual(['Kira', 'Osric', 'Yenna', 'Talin']);
		expect(root().querySelector('.dse-mt__cell[data-hero="Bram"]')).toBeNull();
		expect(Notice.notices).toContain('Removed Bram from the montage');
	});

	test('a hero with nothing logged: only the row goes and the stored tally is written as it was', async () => {
		const { replaceSource } = await open(['rounds: 3', 'successes: 2', 'failures: 1', 'participants:', '  - name: Kira', '  - name: Osric', 'entries:', '  - hero: Kira', '    round: 1', '    result: success', 'current_round: 1'].join('\n'));
		chipOf('Osric').click();
		removeBtn().click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const written = parseYaml(replaceSource.mock.calls[0][0] as string);
		expect([written.successes, written.failures]).toEqual([2, 1]);
		expect(written.participants).toEqual([{ name: 'Kira' }]);
		expect(written.entries).toHaveLength(1);
	});

	test('an outside edit that takes the picked hero off the board while the window is open: Remove writes nothing, removes nobody twice and the window closes', async () => {
		const { view, replaceSource, root } = await open(TWO);
		chipOf('Kira').click();
		const outside = TWO.replace('  - name: Kira\n', '');
		(view as any).model = parse(parseYaml(outside), outside); // a real outside edit REPLACES the view's model
		removeBtn().click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(replaceSource).not.toHaveBeenCalled();
		expect(document.querySelector('.modal-container')).toBeNull();
		expect(Notice.notices).not.toContain('Removed Kira from the montage');
		expect(rows(root())).toEqual(['Kira', 'Bram']); // the old card is untouched until the outside refresh redraws it
	});

	test('two heroes with one name: the second chip removes the second one, and the first keeps her skills', async () => {
		const twins = ['rounds: 3', 'participants:', '  - name: Kira', '    skills_used: [Nature]', '  - name: Kira', '    skills_used: [Climb]', '  - name: Bram'].join('\n');
		const { replaceSource } = await open(twins);
		expect(chips().map((c) => c.getAttribute('aria-label'))).toEqual(['Kira', 'Kira', 'Bram']);
		chips()[1].click();
		expect(chips().map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
		removeBtn().click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(parseYaml(replaceSource.mock.calls[0][0] as string).participants).toEqual([{ name: 'Kira', skills_used: ['Nature'] }, { name: 'Bram' }]);
	});

	test('an outside edit that reorders the roster so another hero stands at the picked place: Remove writes nothing', async () => {
		const { view, replaceSource } = await open(TWO);
		chipOf('Kira').click(); // roster place 0
		const outside = TWO.replace('  - name: Kira\n  - name: Bram', '  - name: Bram\n  - name: Kira');
		(view as any).model = parse(parseYaml(outside), outside);
		removeBtn().click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(replaceSource).not.toHaveBeenCalled();
		expect(document.querySelector('.modal-container')).toBeNull();
	});

	test('an outside edit that adds actions for the picked hero is counted when they are picked, and removed with them', async () => {
		const { view, replaceSource } = await open(TWO);
		const outside = `${TWO}\nsuccesses: 1\nentries:\n  - hero: Kira\n    round: 1\n    result: success`;
		(view as any).model = parse(parseYaml(outside), outside);
		chipOf('Kira').click();
		expect(line().textContent).toBe('Kira has 1 logged action. It is removed too, and the tally follows.');
		removeBtn().click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const written = parseYaml(replaceSource.mock.calls[0][0] as string);
		expect(written.successes).toBe(0);
		expect(written.entries).toBeUndefined();
	});
});

describe('SC-690: where focus goes', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		jest.restoreAllMocks();
		jest.useRealTimers();
		document.body.innerHTML = '';
	});

	test('opened from the keyboard and closed by Remove: the rebuilt "Remove a hero" item holds focus while there are heroes left', async () => {
		const { root } = await mount(TWO);
		item(root(), 'montage-remove-hero')!.focus();
		item(root(), 'montage-remove-hero')!.click();
		chipOf('Kira').click();
		removeBtn().click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(rows(root())).toEqual(['Bram']);
		expect(focused()).toBe('montage.chrome.remove-hero');
	});

	test('after the LAST hero goes the item is not offered, and focus lands on "Add a hero" beside it', async () => {
		const { root } = await mount(ONE);
		item(root(), 'montage-remove-hero')!.focus();
		item(root(), 'montage-remove-hero')!.click();
		chipOf('Kira').click();
		removeBtn().click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(item(root(), 'montage-remove-hero')).toBeNull();
		expect(root().querySelector('.dse-mt__board-empty')?.textContent).toContain('No heroes yet');
		expect(focused()).toBe('montage.chrome.add-hero');
	});

	test('opened with the mouse (focus was not in the card) and closed by Remove: no focus is pulled into the montage', async () => {
		const { root } = await mount(TWO);
		item(root(), 'montage-remove-hero')!.click();
		(document.activeElement as HTMLElement | null)?.blur();
		chipOf('Kira').click();
		removeBtn().click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(root().contains(document.activeElement)).toBe(false);
	});
});
