// SC-690 [D]: the Remove a hero window: one chip per hero on the board (nothing picked at first), the plain line saying what the picked hero's removal takes with it,
// Remove (disabled until a hero is picked), Cancel and every way out, by pointer and keyboard; then what the write leaves ALONE in the note: the text around the block,
// another block, a twin, keys the product does not know, hand-written and quoted values. Opened from the chrome item (chrome.e2e.ts checks the item itself).
// Montage/mid.md: Kira, Bram, Osric (no skills list) and Yenna, round 2 of 3, 1 success 1 failure. Montage/two-blocks.md: Kira alone, then Bram with one success.
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { setWindowSize } from '../../driver/recorders';
import { readFixture } from '../../driver/state';
import {
	blockOf, cellOf, clickChrome, dismiss, expectText, FRESH, HAND, MID, modalsOpen, MONTAGE, openRemoveHero, TABS, trackTail, TWINS, TWO, UNKNOWN,
} from '../../driver/montage';

const QUOTED = 'Montage/quoted-successes.md'; // `successes: "2"` typed in quotes, Kira alone
const OUTSIDE_NOTICE = 'The note changed outside, so this window closed without saving';

type Modal = Awaited<ReturnType<typeof dse.modal>>;
/** The n-th hero's chip, in board order. */
const chip = (modal: Modal, n: number) => modal.control('montage.remove-hero.hero', { nth: n });
/** The window's chips: the hero each is for and whether it is pressed. */
const picked = () =>
	dse.page<Array<{ hero: string | null; pressed: string | null; glyph: string }>>(
		`Array.from(document.querySelectorAll('.modal-container [data-dse-control="montage.remove-hero.hero"]')).map((e) => ({ hero: e.getAttribute('data-dse-focus-at'), pressed: e.getAttribute('aria-pressed'), glyph: getComputedStyle(e.querySelector('.dse-mt__sheet-chipglyph')).visibility }))`,
	);
/** What the note holds outside every montage fence, and each montage fence whole. */
const FENCE = /```ds-montage\n[\s\S]*?\n```/g;
const outside = (text: string): string[] => text.split(FENCE);
const fences = (text: string): string[] => text.match(FENCE) ?? [];
/** Replace the first montage block of `note` from OUTSIDE (the driver exempts the note), wait for the board to show `heroes` rows. */
const reseed = async (note: string, yaml: string, heroes: number): Promise<void> => {
	await dse.openNote(note);
	await dse.externalEdit(note, 'c.replace(/```ds-montage[\\s\\S]*?```/, () => ' + JSON.stringify('```ds-montage\n' + yaml + '\n```') + ')');
	await dse.waitFor(`document.querySelectorAll('.markdown-reading-view [data-dse-element="montage"] .dse-mt__board-name').length === ${heroes}`, 'the reseeded board');
};
/** The window, opened on the note `reseed` just edited (`openRemoveHero` would open the note again, which puts the fixture back). */
const openReseeded = async (): Promise<{ modal: Modal }> => {
	await clickChrome(dse.block(MONTAGE), 'montage.chrome.remove-hero');
	return { modal: await dse.modal('montage-remove-hero') };
};
const noticeShown = (text: string) => dse.waitFor(`Array.from(document.querySelectorAll('.notice')).some((n) => n.textContent === ${JSON.stringify(text)})`, `the Notice "${text}"`);

describe('montage: the Remove a hero window', () => {
	it('[MONT-D01] it lists the heroes in board order with nothing picked; Remove is disabled and a click on it writes nothing', async () => {
		const { modal } = await openRemoveHero(MID);
		await expectText(modal.control({ css: '.dse-modal__title-text' }), 'Remove a hero');
		expect((await picked()).map((c) => c.hero)).toEqual(['Kira', 'Bram', 'Osric', 'Yenna']);
		expect((await picked()).every((c) => c.pressed === 'false' && c.glyph === 'hidden')).toBe(true);
		await expectText(modal.control({ css: '.dse-mt__sheet-consequence' }), ''); // in the accessibility tree already, empty until a pick
		await expectText(modal.control('montage.remove-hero.submit'), 'Remove');
		await expect(modal.control('montage.remove-hero.submit')).toBeDisabled();
		await dse.expectNoWrite(MID, () => dse.click(modal.control('montage.remove-hero.submit')));
		await expect(modal.root).toBeExisting();
		await dismiss(modal);
	});

	it('[MONT-D02] picking a hero marks that chip (pressed, with a check, not colour alone), enables Remove and says what will go; picking another moves the mark', async () => {
		const { modal } = await openRemoveHero(MID);
		const line = modal.control({ css: '.dse-mt__sheet-consequence' });
		await dse.click(chip(modal, 1));
		expect((await picked()).map((c) => [c.hero, c.pressed, c.glyph])).toEqual([['Kira', 'false', 'hidden'], ['Bram', 'true', 'visible'], ['Osric', 'false', 'hidden'], ['Yenna', 'false', 'hidden']]);
		await expect(modal.control('montage.remove-hero.submit')).toBeEnabled();
		await expectText(modal.control('montage.remove-hero.submit'), 'Remove Bram');
		await expect(modal.control('montage.remove-hero.submit')).toHaveAttribute('aria-label', 'Remove Bram');
		await expectText(line, 'Bram has 1 logged action. It is removed too, and the tally follows.');
		await dse.click(chip(modal, 3));
		expect((await picked()).map((c) => c.pressed)).toEqual(['false', 'false', 'false', 'true']);
		await expectText(line, 'Yenna has no logged actions.');
		await expect(modal.control('montage.remove-hero.submit')).toBeEnabled();
		await dismiss(modal);
	});

	it('[MONT-D03] Remove on a hero with logged actions: one write takes the row, the skills and the actions, the tally follows, and the note holds exactly that', async () => {
		const before = readFixture(MID);
		const { root, modal } = await openRemoveHero(MID);
		await expectText(trackTail(root, 'failure'), '2 more end it');
		await dse.click(chip(modal, 1));
		const w = await dse.waitForWrite(MID, () => dse.click(modal.control('montage.remove-hero.submit')));
		expect(w.count).toBe(1);
		await expect(modal.root).not.toBeExisting();
		const b = await blockOf(MID);
		expect(b).toMatchObject({ title: 'Cross the Ashfall', rounds: 3, success_limit: 4, failure_limit: 3, successes: 1, failures: 0, current_round: 2 });
		expect(b.participants).toEqual([{ name: 'Kira', skills_used: ['Nature'] }, { name: 'Osric' }, { name: 'Yenna', skills_used: [] }]);
		expect(b.entries).toEqual([{ hero: 'Kira', round: 1, result: 'success', skill: 'Nature' }, { hero: 'Osric', round: 1, result: 'assist' }]);
		const after = await dse.noteText(MID);
		expect(outside(after)).toEqual(outside(before));
		expect(after).not.toContain('Bram');
		await expect(root.control({ css: '.dse-mt__board-name[data-hero="Bram"]' })).not.toBeExisting();
		await expect(root.control({ css: '.dse-mt__board-name[data-hero="Kira"]' })).toBeExisting();
		await expectText(trackTail(root, 'failure'), '3 more end it');
		await noticeShown('Removed Bram from the montage');
	});

	it('[MONT-D04] Cancel by click closes the window with a hero picked and writes nothing; Enter on the focused Cancel does the same', async () => {
		let { modal } = await openRemoveHero(MID);
		await dse.click(chip(modal, 0));
		await dse.expectNoWrite(MID, () => dse.click(modal.control('montage.remove-hero.cancel')));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openRemoveHero(MID));
		await dse.click(chip(modal, 2));
		const cancel = modal.control('montage.remove-hero.cancel');
		await dse.tabTo(cancel, 8);
		await dse.expectNoWrite(MID, () => dse.press('Enter', cancel));
		await expect(modal.root).not.toBeExisting();
		const b = await blockOf(MID);
		expect(b.participants).toHaveLength(4);
		expect(b.entries).toHaveLength(3);
	});

	it('[MONT-D05] Escape on a picked chip, Escape aimed at the X, the X and the backdrop each dismiss the window without removing anyone', async () => {
		let { modal } = await openRemoveHero(MID);
		const first = chip(modal, 0);
		await dse.click(first);
		await dse.expectNoWrite(MID, () => dse.press('Escape', first));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openRemoveHero(MID));
		await dse.click(chip(modal, 1));
		await dse.expectNoWrite(MID, () => dse.press('Escape', dse.aimedAt('modal.close')));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openRemoveHero(MID));
		await dse.click(chip(modal, 1));
		await dse.expectNoWrite(MID, () => dse.click(modal.control('modal.close')));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openRemoveHero(MID));
		await dse.click(chip(modal, 1));
		await dse.expectNoWrite(MID, () => dse.click(modal.control('modal.backdrop'), { inset: 5 }));
		await expect(modal.root).not.toBeExisting();
		expect(await modalsOpen()).toBe(0);
		expect((await blockOf(MID)).participants).toHaveLength(4);
	});

	it('[MONT-D06] from the keyboard: Enter on the focused chip picks the hero, Tab to Remove and Enter removes them', async () => {
		await dse.openNote(MID);
		const root = dse.block(MONTAGE);
		const item = root.control('montage.chrome.remove-hero');
		await dse.tabTo(item, TABS);
		await dse.press('Enter', item);
		const modal = await dse.modal('montage-remove-hero');
		const first = chip(modal, 0); // the window opens with focus on its first control
		await dse.press('Enter', first);
		expect((await picked())[0].pressed).toBe('true');
		const remove = modal.control('montage.remove-hero.submit');
		await dse.tabTo(remove, 8);
		const w = await dse.waitForWrite(MID, () => dse.press('Enter', remove));
		expect(w.count).toBe(1);
		await expect(modal.root).not.toBeExisting();
		const b = await blockOf(MID);
		expect(b.participants!.map((p) => p.name)).toEqual(['Bram', 'Osric', 'Yenna']);
		expect([b.successes, b.failures]).toEqual([0, 1]);
		await expect(root.control({ css: '.dse-mt__board-name[data-hero="Kira"]' })).not.toBeExisting();
	});

	it('[MONT-D07] the last hero: the board shows its empty state, `participants` is gone from the note, the item is not offered any more and the second block is untouched', async () => {
		const before = readFixture(TWO);
		const { root, modal } = await openRemoveHero(TWO, 0); // First Crossing: Kira alone
		await dse.click(chip(modal, 0));
		await dse.waitForWrite(TWO, () => dse.click(modal.control('montage.remove-hero.submit')));
		await dse.settle();
		const first = await blockOf(TWO, 0);
		expect(first.participants).toBeUndefined();
		expect(first).toMatchObject({ title: 'First Crossing', rounds: 3, success_limit: 3, failure_limit: 2, successes: 0, failures: 0, current_round: 1 });
		expect(Object.keys(first)).toEqual(['title', 'rounds', 'success_limit', 'failure_limit', 'successes', 'failures', 'current_round']);
		await expect(root.control({ css: '.dse-mt__board-empty' })).toBeExisting();
		await expect(root.control('montage.chrome.remove-hero')).not.toBeExisting();
		await expect(root.control('montage.chrome.add-hero')).toBeExisting();
		const after = await dse.noteText(TWO);
		expect(outside(after)).toEqual(outside(before));
		expect(fences(after)[1]).toBe(fences(before)[1]);
	});

	it('[MONT-D08] in a note with two different blocks only the block acted on changes, byte for byte, and the text above, between and below is untouched', async () => {
		const before = readFixture(TWO);
		const { modal } = await openRemoveHero(TWO, 1); // Second Crossing: Bram, one success
		await dse.click(chip(modal, 0));
		await dse.waitForWrite(TWO, () => dse.click(modal.control('montage.remove-hero.submit')));
		await dse.settle();
		const after = await dse.noteText(TWO);
		expect(outside(after)).toEqual(outside(before));
		expect(fences(after)[0]).toBe(fences(before)[0]);
		expect(fences(after)[1]).not.toBe(fences(before)[1]);
		const second = await blockOf(TWO, 1);
		expect(second).toMatchObject({ title: 'Second Crossing', rounds: 2, success_limit: 4, failure_limit: 4, successes: 0, failures: 0, current_round: 2 });
		expect(second.participants).toBeUndefined();
		expect(second.entries).toBeUndefined();
	});

	it('[MONT-D09] in a note with two IDENTICAL blocks the one acted on loses the hero and its twin keeps her, Reading view', async () => {
		const before = readFixture(TWINS);
		const { modal } = await openRemoveHero(TWINS, 1);
		await dse.click(chip(modal, 0));
		await dse.waitForWrite(TWINS, () => dse.click(modal.control('montage.remove-hero.submit')));
		await dse.settle();
		const after = await dse.noteText(TWINS);
		expect(outside(after)).toEqual(outside(before));
		expect(fences(after)[0]).toBe(fences(before)[0]);
		expect((await blockOf(TWINS, 1)).participants).toBeUndefined();
		expect((await blockOf(TWINS, 0)).participants).toEqual([{ name: 'Kira', skills_used: [] }]);
		await expect(cellOf(dse.block(MONTAGE, 0), 'Kira', 1)).toBeExisting();
	});

	it('[MONT-D10] Live Preview: the same in the FIRST of two identical blocks, the second keeps her', async () => {
		const before = readFixture(TWINS);
		await dse.openNote(TWINS, { mode: 'live-preview' });
		const root = dse.block(MONTAGE, 0);
		await clickChrome(root, 'montage.chrome.remove-hero');
		const modal = await dse.modal('montage-remove-hero');
		await dse.click(chip(modal, 0));
		await dse.waitForWrite(TWINS, () => dse.click(modal.control('montage.remove-hero.submit')));
		await dse.settle();
		const after = await dse.noteText(TWINS);
		expect(outside(after)).toEqual(outside(before));
		expect(fences(after)[1]).toBe(fences(before)[1]);
		expect((await blockOf(TWINS, 0)).participants).toBeUndefined();
		expect((await blockOf(TWINS, 1)).participants).toEqual([{ name: 'Kira', skills_used: [] }]);
	});

	it('[MONT-D11] a key the product does not know (`table_notes`, an action\'s `dc`, a hero\'s `player`) is gone with the hero it belonged to, and the top-level key stays after the known keys', async () => {
		const { modal } = await openRemoveHero(UNKNOWN); // Kira alone, with `player: Sam` and an action with `dc: 12`
		await dse.click(chip(modal, 0));
		await dse.waitForWrite(UNKNOWN, () => dse.click(modal.control('montage.remove-hero.submit')));
		await dse.settle();
		const b = await blockOf(UNKNOWN);
		expect(b).toMatchObject({ table_notes: 'keep me', title: 'Unknown Keys', successes: 0 });
		expect(b.participants).toBeUndefined();
		expect(b.entries).toBeUndefined();
		expect(Object.keys(b)).toEqual(['title', 'rounds', 'success_limit', 'failure_limit', 'successes', 'failures', 'current_round', 'table_notes']);
	});

	it('[MONT-D12] hand-written YAML: removing Bram (no skills list, an unrecognised result) leaves Kira\'s scalar skills and her action as typed and the tally where it was', async () => {
		const { modal } = await openRemoveHero(HAND);
		await dse.click(chip(modal, 1));
		await dse.waitForWrite(HAND, () => dse.click(modal.control('montage.remove-hero.submit')));
		await dse.settle();
		const b = await blockOf(HAND);
		expect(b.participants).toEqual([{ name: 'Kira', skills_used: 'Nature' }] as never);
		expect(b.entries).toEqual([{ hero: 'Kira', round: 1, result: 'success', skill: 'Nature' }]);
		expect([b.successes, b.failures]).toEqual([1, 0]); // the unrecognised result added nothing, so it takes nothing off
	});

	it('[MONT-D13] hand-written YAML: removing Kira leaves Bram, with no skills list and his unrecognised result, exactly as typed', async () => {
		const { modal } = await openRemoveHero(HAND);
		await dse.click(chip(modal, 0));
		await dse.waitForWrite(HAND, () => dse.click(modal.control('montage.remove-hero.submit')));
		await dse.settle();
		const b = await blockOf(HAND);
		expect(b.participants).toEqual([{ name: 'Bram' }] as never);
		expect(b.entries).toEqual([{ hero: 'Bram', round: 1, result: 'dodged' }]);
		expect([b.successes, b.failures]).toEqual([0, 0]);
	});

	it('[MONT-D14] a tally typed in quotes is written back as typed when the hero took nothing off it', async () => {
		const { modal } = await openRemoveHero(QUOTED);
		await dse.click(chip(modal, 0));
		await dse.waitForWrite(QUOTED, () => dse.click(modal.control('montage.remove-hero.submit')));
		await dse.settle();
		const text = await dse.noteText(QUOTED);
		expect(text).toContain('successes: "2"');
		expect(text).not.toContain('Kira');
		expect(outside(text)).toEqual(outside(readFixture(QUOTED)));
	});

	it('[MONT-D15] removing a hero and adding the same name again gives a clean hero: an empty skills list and none of the old actions', async () => {
		const { modal } = await openRemoveHero(MID);
		await dse.click(chip(modal, 0)); // Kira: a success with Nature
		await dse.waitForWrite(MID, () => dse.click(modal.control('montage.remove-hero.submit')));
		await dse.settle();
		await clickChrome(dse.block(MONTAGE), 'montage.chrome.add-hero');
		const add = await dse.modal('montage-add-hero');
		await dse.type(add.control('montage.add-hero.name'), 'Kira');
		await dse.waitForWrite(MID, () => dse.click(add.control('montage.add-hero.submit')));
		await dse.settle();
		const b = await blockOf(MID);
		expect(b.participants).toEqual([{ name: 'Bram', skills_used: ['Endurance'] }, { name: 'Osric' }, { name: 'Yenna', skills_used: [] }, { name: 'Kira', skills_used: [] }]);
		expect(b.entries!.map((e) => e.hero)).toEqual(['Bram', 'Osric']);
		expect([b.successes, b.failures]).toEqual([0, 1]);
		await expect(cellOf(dse.block(MONTAGE), 'Kira', 1)).toHaveAttribute('data-kind', 'none');
	});

	it('[MONT-D16] an outside edit that takes the picked hero off the note while the window is open closes the window with the Notice, and Remove writes nothing over it', async () => {
		const before = readFixture(MID);
		const { modal } = await openRemoveHero(MID);
		await dse.click(chip(modal, 1)); // Bram
		await dse.externalEdit(MID, `c.replace('  - name: Bram\\n    skills_used: [Endurance]\\n', '')`);
		await expect(modal.root).not.toBeExisting();
		await noticeShown(OUTSIDE_NOTICE);
		await browser.pause(500);
		await dse.settle();
		expect(await dse.noteText(MID)).toBe(before.replace('  - name: Bram\n    skills_used: [Endurance]\n', ''));
	});

	it('[MONT-D17] a short window, twelve heroes and an 80-character name: only the list scrolls, the line and "Remove <name>" stay on screen, and the name is cut inside the button', async () => {
		const long = 'Ser Thaddeus-Alaric Montgomery-Featherstonehaugh of the Nine Hundred Ashen Vales';
		const names = [long, 'Kira', 'Bram', 'Osric', 'Yenna', 'Talin', 'Maren', 'Dov', 'Ilsabet', 'Corwin', 'Fenna', 'Quill'];
		await reseed(FRESH, ['title: Crowd', 'rounds: 3', 'participants:', ...names.map((n) => `  - name: ${n}`), 'current_round: 1'].join('\n'), 12);
		await setWindowSize(1440, 620);
		try {
			const { modal } = await openReseeded();
			await dse.click(chip(modal, 0));
			const g = await dse.page<Record<string, number | string>>(`(() => {
				const d = document.querySelector('.modal-container .dse-modal');
				const box = (el) => el.getBoundingClientRect();
				const list = d.querySelector('.dse-mt__sheet-herolist'), body = d.querySelector('.dse-modal__body'), line = d.querySelector('.dse-mt__sheet-consequence');
				const foot = d.querySelector('.dse-modal__footer'), btn = d.querySelector('[data-dse-control="montage.remove-hero.submit"]'), text = btn.querySelector('.dse-btn__text');
				const cont = d.closest('.modal-container');
				return {
					winH: innerHeight, dialogScroll: d.scrollHeight - d.clientHeight, bodyScroll: body.scrollHeight - body.clientHeight, containerScroll: cont.scrollHeight - cont.clientHeight,
					listScroll: list.scrollHeight - list.clientHeight, lineTop: box(line).top, lineBottom: box(line).bottom, footerBottom: box(foot).bottom,
					btnRight: box(btn).right, dialogRight: box(d).right, btnLabel: btn.getAttribute('aria-label'), textCut: text.scrollWidth - text.clientWidth, lineInList: list.contains(line) ? 1 : 0,
				};
			})()`);
			expect(g.winH).toBe(620);
			expect([g.dialogScroll, g.bodyScroll, g.containerScroll]).toEqual([0, 0, 0]); // no scrollbar but the list's own
			expect(g.listScroll).toBeGreaterThan(0);
			expect(g.lineInList).toBe(0);
			expect(g.lineTop).toBeGreaterThan(0);
			expect(g.lineBottom).toBeLessThanOrEqual(g.footerBottom as number);
			expect(g.footerBottom).toBeLessThanOrEqual(620);
			expect(g.btnRight).toBeLessThanOrEqual(g.dialogRight as number);
			expect(g.btnLabel).toBe(`Remove ${long}`);
			expect(g.textCut).toBeGreaterThan(0); // cut with an ellipsis inside the button; the full name is its accessible name
			await dismiss(modal);
		} finally {
			await setWindowSize(1440, 1100);
		}
	});

	it('[MONT-D18] two heroes with one name: the second chip removes the second one (the first keeps her skills list)', async () => {
		const yaml = ['title: Twins', 'rounds: 3', 'success_limit: 3', 'failure_limit: 2', 'successes: 0', 'failures: 0', 'participants:', '  - name: Kira', '    skills_used: [Nature]', '  - name: Kira', '    skills_used: [Climb]', '  - name: Bram', 'current_round: 1'].join('\n');
		await reseed(FRESH, yaml, 3);
		const { modal } = await openReseeded();
		await dse.click(chip(modal, 1));
		await expectText(modal.control('montage.remove-hero.submit'), 'Remove Kira');
		await dse.waitForWrite(FRESH, () => dse.click(modal.control('montage.remove-hero.submit')));
		await dse.settle();
		expect((await blockOf(FRESH)).participants).toEqual([{ name: 'Kira', skills_used: ['Nature'] }, { name: 'Bram' }]);
	});
});
