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
// The gaps between a press and the outside edit are in-page timers (50 ms), shorter than the write's 400 ms debounce.
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const NOTICE = 'The note changed outside, so this window closed without saving';
const NOT_SAVED = 'Draw Steel Elements: a change to a block in counter was not saved — the block changed on disk first.';
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
		await keyboardOpen('.dse-cond-strip__add');
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
		expect(await dse.page<boolean>(`document.activeElement?.closest('${SIDEBAR}') !== null && document.activeElement !== document.body`)).toBe(true);
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
