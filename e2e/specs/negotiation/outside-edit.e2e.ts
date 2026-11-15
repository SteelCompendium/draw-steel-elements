// An outside edit to the note (Sync, another pane, another plugin) while keyboard focus is on a control of a negotiation card. Obsidian redraws the
// card with a fresh view and no adoption, and focus used to fall to the page, so the next Tab started from the top of the note. Focus now stays on the
// same control of the redrawn card, only when it was in the card, and the note keeps the outside edit. Complete Argument comes back disabled (a redrawn
// card has no tier chosen), so its focus goes where Complete Argument sends it (the first Motivation chip, SC-642 rules).
// Reading view and Live Preview. Negotiation/basic.md: Interest 3 / Patience 3, Higher Authority + Peace unspent.
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { BASIC, blockOf, NEGO, TABS } from '../../driver/negotiation';

/** An outside edit INSIDE the block: the name. */
const RENAME = `c.replace('Convincing Frodo', 'Convincing Sam')`;
const PANES = { reading: '.markdown-reading-view', source: '.markdown-source-view' } as const;

/** What holds focus: its control id, its position among the controls of that id in its card, the card's name line, and whether it draws the ring. */
const focusState = () =>
	dse.page<{ ctl: string | null; nth: number; card: string | null; connected: boolean; ring: boolean; tag: string }>(`(() => {
		const a = document.activeElement;
		const c = a?.closest?.('[data-dse-element="negotiation"]') ?? null;
		const id = a?.closest?.('[data-dse-control]')?.getAttribute('data-dse-control') ?? null;
		return {
			ctl: id,
			nth: c && id ? [...c.querySelectorAll('[data-dse-control="' + id + '"]')].indexOf(a) : -1,
			card: c ? c.textContent : null,
			connected: !!a?.isConnected,
			ring: !!a?.matches?.(':focus-visible'),
			tag: a?.tagName ?? '',
		};
	})()`);
/** The redrawn card shows the outside edit (the name), in the pane the test is in (a leaf keeps a hidden copy of the other mode). */
const waitRenamed = (pane: string) =>
	dse.waitFor(`Array.from(document.querySelectorAll('${pane} [data-dse-element="negotiation"]')).some((r) => r.textContent?.includes('Convincing Sam'))`, 'the redrawn card to show the outside edit');
const noticeCount = () => dse.page<number>(`document.querySelectorAll('.notice').length`);

describe('negotiation: an outside edit redraws the card while a control has keyboard focus', () => {
	it('[NEGO-O01] Reading view, Tab to the Make an Argument tab (the one Tab stop of the tablist): after an outside edit the same tab of the redrawn card holds focus, with the ring and no Notice', async () => {
		await dse.openNote(BASIC);
		const root = dse.block(NEGO, 0);
		const tab = root.control('negotiation.tab.argument');
		await dse.tabTo(tab, TABS);
		await dse.externalEdit(BASIC, RENAME);
		await waitRenamed(PANES.reading);
		await browser.pause(500); // the hand-off must hold, not only land
		const f = await focusState();
		expect(f).toMatchObject({ ctl: 'negotiation.tab.argument', connected: true, ring: true });
		expect(f.card).toContain('Convincing Sam'); // the redrawn card, not the discarded one
		expect(await noticeCount()).toBe(0);
		expect((await blockOf(BASIC)).name).toBe('Convincing Sam to remember the taste of strawberries'); // the outside edit is what the note holds
	});

	it('[NEGO-O02] Reading view, Tab to the second Motivation chip: focus lands on the second chip of the redrawn card', async () => {
		await dse.openNote(BASIC);
		const root = dse.block(NEGO, 0);
		const chip = root.control('negotiation.appeal.motivation', { nth: 1 });
		await dse.tabTo(chip, TABS);
		await dse.externalEdit(BASIC, RENAME);
		await waitRenamed(PANES.reading);
		await browser.pause(500);
		const f = await focusState();
		expect(f).toMatchObject({ ctl: 'negotiation.appeal.motivation', nth: 1, connected: true, ring: true });
		expect(f.card).toContain('Convincing Sam');
	});

	it('[NEGO-O03] Reading view, Tab to Complete Argument (a tier chosen): the redrawn Complete Argument is disabled, so focus lands on the first Motivation chip, not the page', async () => {
		await dse.openNote(BASIC);
		const root = dse.block(NEGO, 0);
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		const complete = root.control('negotiation.complete');
		await dse.tabTo(complete, TABS);
		await dse.externalEdit(BASIC, RENAME);
		await waitRenamed(PANES.reading);
		await browser.pause(500);
		const f = await focusState();
		expect(f).toMatchObject({ ctl: 'negotiation.appeal.motivation', nth: 0, connected: true });
		expect(f.card).toContain('Convincing Sam');
		expect(f.tag).not.toBe('BODY');
	});

	it('[NEGO-O04] Reading view, focus on the page (nothing in the card): an outside edit pulls no focus into the redrawn card', async () => {
		await dse.openNote(BASIC);
		dse.block(NEGO, 0);
		await dse.page(`document.activeElement.blur()`);
		await dse.externalEdit(BASIC, RENAME);
		await waitRenamed(PANES.reading);
		await browser.pause(500);
		expect(await focusState()).toMatchObject({ ctl: null, card: null });
	});

	it('[NEGO-O05] Live Preview, focus on the Learn Motivation/Pitfall tab: after an outside edit the same tab of the redrawn card holds focus', async () => {
		await dse.openNote(BASIC, { mode: 'live-preview' });
		const root = dse.block(NEGO, 0);
		await dse.focusByScript(root.control('negotiation.tab.learn-more')); // a real Tab from the editor would indent the note
		await dse.externalEdit(BASIC, RENAME);
		await waitRenamed(PANES.source);
		await browser.pause(500);
		const f = await focusState();
		expect(f).toMatchObject({ ctl: 'negotiation.tab.learn-more', connected: true });
		expect(f.card).toContain('Convincing Sam');
		expect(await noticeCount()).toBe(0);
		expect((await blockOf(BASIC)).name).toBe('Convincing Sam to remember the taste of strawberries');
	});

	it('[NEGO-O06] Live Preview, focus on the second Motivation chip: focus lands on the second chip of the redrawn card', async () => {
		await dse.openNote(BASIC, { mode: 'live-preview' });
		const root = dse.block(NEGO, 0);
		await dse.focusByScript(root.control('negotiation.appeal.motivation', { nth: 1 }));
		await dse.externalEdit(BASIC, RENAME);
		await waitRenamed(PANES.source);
		await browser.pause(500);
		const f = await focusState();
		expect(f).toMatchObject({ ctl: 'negotiation.appeal.motivation', nth: 1, connected: true });
		expect(f.card).toContain('Convincing Sam');
	});

	it('[NEGO-O07] Live Preview, focus on Complete Argument (a tier chosen): focus lands on the first Motivation chip of the redrawn card', async () => {
		await dse.openNote(BASIC, { mode: 'live-preview' });
		const root = dse.block(NEGO, 0);
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		await dse.focusByScript(root.control('negotiation.complete'));
		await dse.externalEdit(BASIC, RENAME);
		await waitRenamed(PANES.source);
		await browser.pause(500);
		const f = await focusState();
		expect(f).toMatchObject({ ctl: 'negotiation.appeal.motivation', nth: 0, connected: true });
		expect(f.card).toContain('Convincing Sam');
	});

	it('[NEGO-O08] Live Preview, focus in the editor (nothing in the card): an outside edit pulls no focus into the redrawn card', async () => {
		await dse.openNote(BASIC, { mode: 'live-preview' });
		dse.block(NEGO, 0);
		await dse.page(`document.activeElement.blur()`);
		await dse.externalEdit(BASIC, RENAME);
		await waitRenamed(PANES.source);
		await browser.pause(500);
		expect(await focusState()).toMatchObject({ ctl: null, card: null });
	});
});
