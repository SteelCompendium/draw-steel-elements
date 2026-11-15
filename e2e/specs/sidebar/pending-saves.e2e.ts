// SC-662: a pinned (sidebar) card is refreshed in place when the note changes from outside (Sync, another pane, another card's write), and that
// refresh used to lose data: the card's own save still waiting out its 400 ms debounce (a counter press, a montage Log; SC-550 is the case where
// the outside change is a note card's own write), a ds-conditions window that saved its staged list over the outside edit, and a stamina bar
// window whose Apply went to the OLD copy of the bar. Now a refresh whose block did not change does nothing (the window stays, the save is
// written), and one whose block changed closes every window over the card WITHOUT saving it, with the SC-608 Notice.
//   Sidebar/pending-counter.md      two ds-counter blocks (Health 1/3, Other 2/5), fixed `_dse_anchor`s, pinned by script (no note write)
//   Sidebar/pending-stamina.md      one ds-stamina-bar (15/20 +5)
//   Sidebar/pending-two-stamina.md  two ds-stamina-bar blocks (15/20 +5, 25/30 +4)
//   Sidebar/pending-conditions.md   one ds-conditions block (bleeding)
//   Sidebar/pending-montage.md      one ds-montage block (Kira, Bram, round 1)
//   Sidebar/pending-resource.md     one ds-resource block (fury 4), fixed anchor: its schema forbids extra keys (the block edit form)
// The gaps between a press and the outside edit are in-page timers (50 ms), shorter than the write's 400 ms debounce.
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const NOTICE = 'The note changed outside, so this window closed without saving';
const NOT_SAVED = 'Draw Steel Elements: a change to a block in pending-counter was not saved — the block changed on disk first.';
const SIDEBAR = '.dse-sidebar';

const closeSidebar = (): Promise<unknown> => dse.page(`(() => { app.workspace.detachLeavesOfType('dse-sidebar'); return true; })()`);
const notices = (text: string): Promise<number> =>
	dse.page<number>(`Array.from(document.querySelectorAll('.notice')).filter((n) => n.textContent === ${JSON.stringify(text)}).length`);
const modalCount = (): Promise<number> => dse.page<number>(`document.querySelectorAll('.modal-container').length`);

/** Pin the block(s) of `note` to the sidebar by script (no note write): one panel per anchor, and wait until `ready` is drawn in the last one. */
async function pin(note: string, alias: string, anchors: string[], ready: string): Promise<void> {
	await dse.openNote(note);
	await dse.externalEdit(note, 'c'); // the test writes this note from the page itself (and the plugin does), so the driver's fence checks stand aside
	await closeSidebar();
	await dse.page(`(async () => {
		const leaf = app.workspace.getRightLeaf(false);
		await leaf.setViewState({ type: 'dse-sidebar', active: true });
		await app.workspace.revealLeaf(leaf);
		for (const anchorId of ${JSON.stringify(anchors)}) leaf.view.addPanel({ filePath: ${JSON.stringify(note)}, alias: ${JSON.stringify(alias)}, anchorId });
		document.querySelectorAll('.notice-container').forEach((n) => { n.style.display = 'none'; });
		return true;
	})()`);
	await dse.waitFor(`document.querySelectorAll('${SIDEBAR} ${ready}').length >= ${anchors.length}`, `the pinned ${alias} to render in the sidebar`);
}

/** Focus a sidebar control by script and press Enter on it (a keyboard open of a window; a real Tab from the page would not reach the sidebar). */
async function keyboardOpen(selector: string): Promise<void> {
	await dse.page(`(() => { document.querySelector('${SIDEBAR} ${selector}').focus({ focusVisible: true }); return true; })()`);
	await browser.keys('Enter');
}

/** Click a sidebar control in the page, wait `gap` ms in the page, then run an outside edit of `note` in the same script (no driver round trip between). */
const clickThenEdit = (selector: string, gap: number, note: string, edit: string): Promise<unknown> =>
	dse.page(`(async () => {
		document.querySelector('${SIDEBAR} ${selector}').click();
		await new Promise((r) => setTimeout(r, ${gap}));
		await app.vault.process(app.vault.getAbstractFileByPath(${JSON.stringify(note)}), (c) => ${edit});
		return true;
	})()`);

/** Put the prose an outside edit changed back (the driver's integrity check wants the text between the blocks as the fixture had it). */
const restoreBelow = (note: string): Promise<void> => dse.externalEdit(note, `c.replace('BELOW and more', 'BELOW')`);

const field = (text: string, key: string): string | undefined => new RegExp(`^${key}: (.*)$`, 'm').exec(text)?.[1];
const fieldN = (text: string, key: string, n: number): string | undefined => [...text.matchAll(new RegExp(`^${key}: (.*)$`, 'gm'))][n]?.[1];

describe('sidebar: an outside change never drops the user\'s save or the outside edit (SC-662)', () => {
	before(() => dse.setPrefs({}, { experimental: true }));
	after(async () => {
		await closeSidebar();
		await dse.setPrefs({});
	});
	afterEach(() => dse.page(`(() => { document.querySelectorAll('.modal-container').forEach((m) => m.remove()); return true; })()`));

	// -------------------------------------------------------------------------------------------------- a pending own save
	it('[SIDE-OE01] a montage Log submitted, then an outside edit elsewhere in the note 50 ms later: the logged action reaches the note, and so does the outside edit', async () => {
		const NOTE = 'Sidebar/pending-montage.md';
		await pin(NOTE, 'ds-montage', ['spm01'], '[data-dse-control="montage.bar.log"]');
		await dse.page(`document.querySelector('${SIDEBAR} [data-dse-control="montage.bar.log"]').click()`);
		await dse.modal('montage-log');
		await dse.page(`(async () => {
			document.querySelector('.modal-container [data-dse-control="montage.log.submit"]').click();
			await new Promise((r) => setTimeout(r, 50));
			await app.vault.process(app.vault.getAbstractFileByPath(${JSON.stringify(NOTE)}), (c) => c.replace('BELOW', 'BELOW and more'));
			return true;
		})()`);
		await browser.pause(1500);
		const text = await dse.noteText(NOTE);
		expect(text).toMatch(/entries:\n\s+- hero: Kira/);
		expect(text).toContain('BELOW and more');
		expect(await notices(NOTICE)).toBe(0);
		await restoreBelow(NOTE);
	});

	it('[SIDE-OE02] a note card\'s counter pressed, then the pinned sidebar counter 60 ms later, before the card\'s write lands (SC-550): both presses reach the note', async () => {
		const NOTE = 'Sidebar/pending-counter.md';
		await pin(NOTE, 'ds-counter', ['spc01'], '[data-dse-control="counter.inc"]');
		await dse.page(`(async () => {
			document.querySelectorAll('.markdown-reading-view [data-dse-control="counter.inc"]')[1].click();
			await new Promise((r) => setTimeout(r, 60));
			document.querySelector('${SIDEBAR} [data-dse-control="counter.inc"]').click();
			return true;
		})()`);
		await browser.pause(1800);
		const text = await dse.noteText(NOTE);
		expect(fieldN(text, 'current_value', 0)).toBe('2'); // Health, pressed in the sidebar
		expect(fieldN(text, 'current_value', 1)).toBe('3'); // Other, pressed in the note
	});

	it('[SIDE-OE03] a sidebar counter pressed, then an outside edit to the SAME block 50 ms later: the outside edit is kept and the press is refused with the dropped-write Notice (as a Reading-view card does)', async () => {
		const NOTE = 'Sidebar/pending-counter.md';
		await pin(NOTE, 'ds-counter', ['spc01'], '[data-dse-control="counter.inc"]');
		await clickThenEdit('[data-dse-control="counter.inc"]', 50, NOTE, `c.replace('max_value: 3', 'max_value: 9')`);
		await browser.pause(1500);
		const text = await dse.noteText(NOTE);
		expect(fieldN(text, 'max_value', 0)).toBe('9');
		expect(fieldN(text, 'current_value', 0)).toBe('1');
		await dse.page(`document.querySelectorAll('.notice-container').forEach((n) => { n.style.display = ''; })`);
		expect(await notices(NOT_SAVED)).toBe(1);
	});

	// ---------------------------------------------------------------------------------------------------- ds-conditions
	const stageDazed = async (): Promise<void> => {
		const modal = await dse.modal('conditions');
		await dse.click(modal.control('cond.add'));
		await dse.type(modal.control('cond.input'), 'dazed');
		await dse.page(`(() => { document.querySelector('.modal-container [data-dse-control="cond.input"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); return true; })()`);
		await browser.pause(200);
	};

	it('[SIDE-OE04] a Conditions window with "dazed" staged, an outside edit adds "prone": the window closes without saving, with one Notice, and the note ends with "bleeding, prone"', async () => {
		const NOTE = 'Sidebar/pending-conditions.md';
		await pin(NOTE, 'ds-conditions', ['spk01'], '.dse-cond-strip__add');
		// The note draws its own strip too (and Obsidian keeps hidden copies): find the pinned card's button among them.
		const nth = await dse.page<number>(`Array.from(document.querySelectorAll('[data-dse-control="cond.strip.add"]')).findIndex((e) => !!e.closest('${SIDEBAR}'))`);
		const add = dse.control('cond.strip.add', { nth });
		await dse.focusByScript(add);
		await dse.press('Enter', add); // a real Enter key on the pinned card's own button
		await stageDazed();
		await dse.externalEdit(NOTE, `c.replace('  - bleeding\\n', '  - bleeding\\n  - prone\\n')`);
		await dse.waitFor(`document.querySelectorAll('.modal-container').length === 0`, 'the window to close');
		await browser.pause(1000);
		const text = await dse.noteText(NOTE);
		expect(text).toContain('  - prone');
		expect(text).toContain('  - bleeding');
		expect(text).not.toMatch(/dazed/i);
		expect(text).toContain('_dse_anchor: spk01');
		await dse.page(`document.querySelectorAll('.notice-container').forEach((n) => { n.style.display = ''; })`);
		expect(await notices(NOTICE)).toBe(1);
		expect(await dse.focusedControl()).toBe('cond.strip.add'); // the control that opened the window, rebuilt (SC-662 r3)
		expect(await dse.page<boolean>(`!!document.activeElement?.closest('${SIDEBAR}')`)).toBe(true);
	});

	it('[SIDE-OE05] a Conditions window with nothing staged, an outside edit elsewhere in the note: the window stays open, no Notice, and what is staged afterwards is saved with the outside edit kept', async () => {
		const NOTE = 'Sidebar/pending-conditions.md';
		await pin(NOTE, 'ds-conditions', ['spk01'], '.dse-cond-strip__add');
		await keyboardOpen('.dse-cond-strip__add');
		await dse.modal('conditions');
		await dse.externalEdit(NOTE, `c.replace('BELOW', 'BELOW and more')`);
		await browser.pause(1000);
		expect(await modalCount()).toBe(1);
		expect(await notices(NOTICE)).toBe(0);
		await stageDazed();
		await dse.page(`document.querySelector('.modal-container [data-dse-control="cond.done"]').click()`);
		await browser.pause(1500);
		const text = await dse.noteText(NOTE);
		expect(text).toMatch(/dazed/i);
		expect(text).toContain('  - bleeding');
		expect(text).toContain('BELOW and more');
		expect(text).toContain('_dse_anchor: spk01'); // the first own save kept the anchor line (SC-662 r3)...
		expect(await dse.page<boolean>(`!document.querySelector('${SIDEBAR} .dse-sidebar__panel[data-dse-sidebar-unavailable]') && !!document.querySelector('${SIDEBAR} .dse-cond-strip__add')`)).toBe(true); // ...so the panel is still live
		await restoreBelow(NOTE);
	});

	// ------------------------------------------------------------------------------------------------- ds-stamina-bar
	it('[SIDE-OE06] 3 damage staged in the stamina window, an outside edit elsewhere in the note, then Apply: the Apply reaches the note (temp_stamina 5 -> 2) and so does the outside edit', async () => {
		const NOTE = 'Sidebar/pending-stamina.md';
		await pin(NOTE, 'ds-stamina-bar', ['sps01'], '[data-dse-control="stamina.bar"]');
		await keyboardOpen('[data-dse-control="stamina.bar"]');
		const modal = await dse.modal('stamina-edit');
		await dse.type(modal.control('sedit.apply-amount'), '3', { replace: true });
		await dse.click(modal.control('sedit.damage'));
		await dse.externalEdit(NOTE, `c.replace('BELOW', 'BELOW and more')`);
		await browser.pause(1000);
		expect(await modalCount()).toBe(1);
		await dse.click(modal.control('sedit.apply'));
		await browser.pause(1500);
		const text = await dse.noteText(NOTE);
		expect(field(text, 'temp_stamina')).toBe('2');
		expect(text).toContain('BELOW and more');
		expect(await notices(NOTICE)).toBe(0);
		await restoreBelow(NOTE);
	});

	it('[SIDE-OE07] 3 damage staged, an outside edit to the block itself: the window closes without applying, with one Notice; the outside value stays and focus returns to the rebuilt bar', async () => {
		const NOTE = 'Sidebar/pending-stamina.md';
		await pin(NOTE, 'ds-stamina-bar', ['sps01'], '[data-dse-control="stamina.bar"]');
		await keyboardOpen('[data-dse-control="stamina.bar"]');
		const modal = await dse.modal('stamina-edit');
		await dse.type(modal.control('sedit.apply-amount'), '3', { replace: true });
		await dse.click(modal.control('sedit.damage'));
		await dse.externalEdit(NOTE, `c.replace('current_stamina: 15', 'current_stamina: 9')`);
		await dse.waitFor(`document.querySelectorAll('.modal-container').length === 0`, 'the window to close');
		await browser.pause(1000);
		const text = await dse.noteText(NOTE);
		expect(field(text, 'current_stamina')).toBe('9');
		expect(field(text, 'temp_stamina')).toBe('5');
		await dse.page(`document.querySelectorAll('.notice-container').forEach((n) => { n.style.display = ''; })`);
		expect(await notices(NOTICE)).toBe(1);
		expect(await dse.focusedControl()).toBe('stamina.bar');
		expect(await dse.page<boolean>(`!!document.activeElement?.closest('${SIDEBAR}')`)).toBe(true);
	});

	it('[SIDE-OE08] two pinned stamina bars: an outside edit to the first leaves a window on the second open, its Apply writes, the first redraws, and the text above, between and below survives', async () => {
		const NOTE = 'Sidebar/pending-two-stamina.md';
		await pin(NOTE, 'ds-stamina-bar', ['spt01', 'spt02'], '[data-dse-control="stamina.bar"]');
		await dse.page(`document.querySelectorAll('${SIDEBAR} [data-dse-control="stamina.bar"]')[1].click()`);
		const modal = await dse.modal('stamina-edit');
		await dse.type(modal.control('sedit.apply-amount'), '3', { replace: true });
		await dse.click(modal.control('sedit.damage'));
		await dse.externalEdit(NOTE, `c.replace('current_stamina: 15', 'current_stamina: 9')`);
		await browser.pause(1000);
		expect(await modalCount()).toBe(1);
		expect(await dse.page<string>(`document.querySelectorAll('${SIDEBAR} [data-dse-element="stamina-bar"]')[0].textContent`)).toContain('9');
		await dse.click(modal.control('sedit.apply'));
		await browser.pause(1500);
		const text = await dse.noteText(NOTE);
		expect(fieldN(text, 'current_stamina', 0)).toBe('9');
		expect(fieldN(text, 'temp_stamina', 1)).toBe('1');
		for (const keep of ['ABOVE', 'BETWEEN', 'BELOW', '# Pending two stamina']) expect(text).toContain(keep);
		expect(await notices(NOTICE)).toBe(0);
	});
});

describe('sidebar: the block edit form\'s Save never overwrites an outside edit to its block (SC-662, authoringControls on)', () => {
	before(() => dse.setPrefs({ authoringControls: true }, { experimental: true }));
	after(async () => {
		await closeSidebar();
		await dse.setPrefs({});
	});
	afterEach(() => dse.page(`(() => { document.querySelectorAll('.modal-container').forEach((m) => m.remove()); return true; })()`));

	/** Open the pinned counter's edit form from its chrome item. */
	async function openForm(): Promise<void> {
		await dse.page(`document.querySelector('${SIDEBAR} [data-dse-chrome-item="edit"]').click()`);
		await dse.waitFor(`!!document.querySelector('.modal-container .dse-form__raw')`, 'the form to open');
	}
	/** Change `name: Health` to `name: Healed` in the form and press Save. */
	const editAndSave = (): Promise<unknown> =>
		dse.page(`(async () => {
			const ta = document.querySelector('.modal-container .dse-form__raw');
			ta.value = ta.value.replace('name: Health', 'name: Healed');
			ta.dispatchEvent(new Event('input', { bubbles: true }));
			await new Promise((r) => setTimeout(r, 500));
			const save = Array.from(document.querySelectorAll('.modal-container button')).find((b) => /^Save$/.test(b.textContent.trim()) || b.getAttribute('aria-label') === 'Save');
			save.click();
			return true;
		})()`);

	it('[SIDE-OE09] the block is edited from outside after the form opened: Save is refused with the dropped-write Notice, the outside edit stays and the form stays open', async () => {
		const NOTE = 'Sidebar/pending-counter.md';
		await pin(NOTE, 'ds-counter', ['spc01'], '[data-dse-control="counter.inc"]');
		await openForm();
		await dse.externalEdit(NOTE, `c.replace('max_value: 3', 'max_value: 7')`);
		await browser.pause(1000);
		await editAndSave();
		await browser.pause(1200);
		const text = await dse.noteText(NOTE);
		expect(fieldN(text, 'max_value', 0)).toBe('7');
		expect(fieldN(text, 'name', 0)).toBe('Health');
		expect(await notices(NOT_SAVED)).toBe(1);
		expect(await dse.page<boolean>(`!!document.querySelector('.modal-container .dse-form__raw')`)).toBe(true);
		await dse.page(`(() => { const b = Array.from(document.querySelectorAll('.modal-container button')).find((x) => /^Cancel$/.test(x.textContent.trim()) || x.getAttribute('aria-label') === 'Cancel'); b.click(); return true; })()`);
	});

	it('[SIDE-OE10] an outside edit elsewhere in the note after the form opened: Save lands and the outside edit stays', async () => {
		const NOTE = 'Sidebar/pending-counter.md';
		await pin(NOTE, 'ds-counter', ['spc01'], '[data-dse-control="counter.inc"]');
		await openForm();
		await dse.externalEdit(NOTE, `c.replace('BELOW', 'BELOW and more')`);
		await browser.pause(1000);
		await editAndSave();
		await browser.pause(1500);
		const text = await dse.noteText(NOTE);
		expect(fieldN(text, 'name', 0)).toBe('Healed');
		expect(text).toContain('BELOW and more');
		expect(await notices(NOT_SAVED)).toBe(0);
		await restoreBelow(NOTE);
	});
});

describe('sidebar: the block edit form of a block that carries the sidebar\'s `_dse_anchor` line can be saved (SC-662, authoringControls on)', () => {
	before(() => dse.setPrefs({ authoringControls: true }, { experimental: true }));
	after(async () => {
		await closeSidebar();
		await dse.setPrefs({});
	});
	afterEach(() => dse.page(`(() => { document.querySelectorAll('.modal-container').forEach((m) => m.remove()); return true; })()`));

	const NOTE = 'Sidebar/pending-resource.md';
	/** In the open form: set the "Current" field to `value` and press Save. Returns whether Save was enabled. */
	const setCurrentAndSave = (value: number): Promise<boolean> =>
		dse.page<boolean>(`(async () => {
			const row = Array.from(document.querySelectorAll('.modal-container .setting-item')).find((r) => /^Current$/i.test(r.querySelector('.setting-item-name')?.textContent.trim() ?? ''));
			const input = row.querySelector('input');
			input.value = ${JSON.stringify(String(value))};
			input.dispatchEvent(new Event('input', { bubbles: true }));
			await new Promise((r) => setTimeout(r, 500));
			const save = Array.from(document.querySelectorAll('.modal-container button')).find((b) => /^Save$/.test(b.textContent.trim()) || b.getAttribute('aria-label') === 'Save');
			const enabled = !save.disabled;
			if (enabled) save.click();
			return enabled;
		})()`);

	it('[SIDE-OE11] pinned ds-resource: the Edit form\'s Save is enabled and lands, the anchor line stays and the sidebar card is still live', async () => {
		await pin(NOTE, 'ds-resource', ['spr01'], '[data-dse-element="heroic-resource"], [data-dse-element="resource"]');
		await dse.page(`document.querySelector('${SIDEBAR} [data-dse-chrome-item="edit"]').click()`);
		await dse.waitFor(`!!document.querySelector('.modal-container .setting-item')`, 'the form to open');
		expect(await setCurrentAndSave(7)).toBe(true);
		await browser.pause(1500);
		const text = await dse.noteText(NOTE);
		expect(field(text, 'current')).toBe('7');
		expect(text).toContain('_dse_anchor: spr01');
		expect(await dse.page<boolean>(`!document.querySelector('${SIDEBAR} .dse-sidebar__panel[data-dse-sidebar-unavailable]') && document.querySelector('${SIDEBAR} [data-dse-element] input')?.value === '7'`)).toBe(true); // the redrawn card shows the saved value
	});

	it('[SIDE-OE12] the same block in Reading view (it carries an anchor): the card\'s Edit form can be saved and keeps the anchor line', async () => {
		await dse.openNote(NOTE);
		await dse.externalEdit(NOTE, 'c');
		await dse.page(`document.querySelector('.markdown-reading-view [data-dse-chrome-item="edit"]').click()`);
		await dse.waitFor(`!!document.querySelector('.modal-container .setting-item')`, 'the form to open');
		expect(await setCurrentAndSave(9)).toBe(true);
		await browser.pause(1500);
		const text = await dse.noteText(NOTE);
		expect(field(text, 'current')).toBe('9');
		expect(text).toContain('_dse_anchor: spr01');
	});
});
