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
/** How many tier rows are chosen in the pane's card. */
const tierChosen = (pane: string) => dse.page<number>(`document.querySelectorAll('${pane} [data-dse-control="negotiation.tier.row"][aria-checked="true"]').length`);
/** The window Notice only (Obsidian's own, such as "Indexing complete.", come and go). The hand-off is silent, so this stays 0. */
const noticeCount = () => dse.page<number>(`Array.from(document.querySelectorAll('.notice')).filter((n) => n.textContent === 'The note changed outside, so this window closed without saving').length`);

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

	it('[NEGO-O03] Reading view, Tab to Complete Argument (a tier chosen), an outside edit that leaves the argument and the standing alone: the tier is kept and the redrawn Complete Argument holds focus', async () => {
		await dse.openNote(BASIC);
		const root = dse.block(NEGO, 0);
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		const complete = root.control('negotiation.complete');
		await dse.tabTo(complete, TABS);
		await dse.externalEdit(BASIC, RENAME);
		await waitRenamed(PANES.reading);
		await browser.pause(500);
		const f = await focusState();
		expect(f).toMatchObject({ ctl: 'negotiation.complete', connected: true, ring: true });
		expect(f.card).toContain('Convincing Sam');
		expect(await tierChosen(PANES.reading)).toBe(1);
		expect(await dse.page<boolean>(`document.activeElement.disabled`)).toBe(false);
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

	it('[NEGO-O07] Live Preview, focus on Complete Argument (a tier chosen), an outside edit that leaves the argument and the standing alone: the tier is kept and the redrawn Complete Argument holds focus', async () => {
		await dse.openNote(BASIC, { mode: 'live-preview' });
		const root = dse.block(NEGO, 0);
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		await dse.focusByScript(root.control('negotiation.complete'));
		await dse.externalEdit(BASIC, RENAME);
		await waitRenamed(PANES.source);
		await browser.pause(500);
		const f = await focusState();
		expect(f).toMatchObject({ ctl: 'negotiation.complete', connected: true });
		expect(f.card).toContain('Convincing Sam');
		expect(await tierChosen(PANES.source)).toBe(1);
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

describe('negotiation: an outside edit while a control has focus, the cases around the redraw', () => {
	/** An outside edit that spends one Patience (an argument completed elsewhere): the chosen tier no longer applies. */
	const SPEND = `c.replace('initial_patience: 3', 'initial_patience: 2')`;

	it('[NEGO-O10] Reading view, a chip pressed with Enter, then an outside edit 500 ms later (the card\'s own write is adopted, nothing unloaded): focus is on the same chip', async () => {
		await dse.openNote(BASIC);
		const root = dse.block(NEGO, 0);
		const chip = root.control('negotiation.appeal.motivation', { nth: 1 });
		await dse.tabTo(chip, TABS);
		await dse.waitForWrite(BASIC, () => dse.press('Enter', chip));
		await browser.pause(500);
		await dse.externalEdit(BASIC, RENAME);
		await waitRenamed(PANES.reading);
		await browser.pause(500);
		const f = await focusState();
		expect(f).toMatchObject({ ctl: 'negotiation.appeal.motivation', nth: 1, connected: true });
		expect(f.card).toContain('Convincing Sam');
	});

	it('[NEGO-O11] Reading view, "Argument has already been made" focused, the outside edit appeals to a motivation (the box is now disabled): focus lands on the lie box, not the page', async () => {
		await dse.openNote(BASIC);
		const root = dse.block(NEGO, 0);
		await dse.tabTo(root.control('negotiation.mod.same'), TABS);
		await dse.externalEdit(BASIC, `c.replace('pitfalls:', 'currentArgument:\\n  motivationsUsed:\\n    - Higher Authority\\npitfalls:')`);
		await dse.waitFor(`!!document.querySelector('${PANES.reading} [data-dse-control="negotiation.mod.same"]:disabled')`, 'the redrawn box to be disabled');
		await browser.pause(500);
		expect(await focusState()).toMatchObject({ ctl: 'negotiation.mod.lie', connected: true });
	});

	it('[NEGO-O12] Reading view, Complete Argument focused, the outside edit spends Patience (an argument completed elsewhere): the tier is dropped, Complete is disabled, focus lands on the first chip', async () => {
		await dse.openNote(BASIC);
		const root = dse.block(NEGO, 0);
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		await dse.tabTo(root.control('negotiation.complete'), TABS);
		await dse.externalEdit(BASIC, SPEND);
		await dse.waitFor(`!!document.querySelector('${PANES.reading} [data-dse-control="negotiation.complete"]:disabled')`, 'the redrawn Complete to be disabled');
		await browser.pause(500);
		expect(await focusState()).toMatchObject({ ctl: 'negotiation.appeal.motivation', nth: 0, connected: true });
		expect(await tierChosen(PANES.reading)).toBe(0);
	});

	// A long note, a card far down: the focused top card scrolls out of the page (Reading view renders lazily, CodeMirror drops the widget), focus falls
	// to the page and the view lives on. A later outside edit to the TOP card must not pull focus into the bottom card the user is looking at.
	const LONG = 'Negotiation/long-top-bottom.md';
	/** A long note, the focused top card scrolled away, an outside edit to it: nothing is pulled into the bottom card. */
	async function topCardScrolledAway(mode: 'reading' | 'live-preview'): Promise<void> {
		const pane = PANES[mode === 'reading' ? 'reading' : 'source'];
		await dse.openNote(BASIC);
		const block = (await dse.noteText(BASIC)).split('\n').slice(4, 23).join('\n');
		const paras = Array.from({ length: 400 }, (_, i) => `Paragraph ${i} lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.`).join('\n\n');
		const text = 'TOP\n\n' + block + '\n\n' + paras + '\n\n' + block.replace('Convincing Frodo', 'Bottom Frodo') + '\n\nEND\n';
		await dse.page(`(async () => { await app.vault.create(${JSON.stringify(LONG)}, ${JSON.stringify(text)}); return true; })()`);
		await dse.page(`(async () => { const leaf = app.workspace.getLeaf('tab'); await leaf.setViewState({ type: 'markdown', state: { file: ${JSON.stringify(LONG)}, mode: ${mode === 'reading' ? "'preview'" : "'source', source: false"} }, active: true }); app.workspace.setActiveLeaf(leaf, { focus: true }); window.__nego656leaf = leaf; return true; })()`);
		await dse.waitFor(`!!window.__nego656leaf.view.containerEl.querySelector('${pane} [data-dse-control="negotiation.appeal.motivation"]')`, 'the top card');
		await browser.pause(800);
		if (mode === 'live-preview') await dse.page(`(() => { window.__nego656leaf.view.editor.setCursor({ line: 0, ch: 0 }); return true; })()`);
		const held = await dse.page<boolean>(`(() => { const r = window.__nego656leaf.view.containerEl.querySelector('${pane} [data-dse-element="negotiation"]'); const el = r.querySelectorAll('[data-dse-control="negotiation.appeal.motivation"]')[1]; el.focus({ focusVisible: true }); return document.activeElement === el; })()`);
		expect(held).toBe(true);
		await dse.page(`(async () => { const sc = window.__nego656leaf.view.containerEl.querySelector('${mode === 'reading' ? '.markdown-preview-view' : '.cm-scroller'}'); for (let i = 0; i < 40; i++) { sc.scrollTop += 2000; await new Promise((r) => setTimeout(r, 50)); } await new Promise((r) => setTimeout(r, 800)); return true; })()`);
		await dse.externalEdit(LONG, `c.replace('Convincing Frodo', 'Convincing Sam')`);
		await browser.pause(2000);
		const f = await dse.page<{ ctl: string | null; inCard: boolean }>(`(() => { const a = document.activeElement; return { ctl: a?.closest?.('[data-dse-control]')?.getAttribute('data-dse-control') ?? null, inCard: !!a?.closest?.('[data-dse-element="negotiation"]') }; })()`);
		await dse.page(`(() => { window.__nego656leaf.detach(); return true; })()`);
		expect(f).toEqual({ ctl: null, inCard: false });
	}
	it('[NEGO-O13] Reading view, a long note: the focused top card scrolled away, an outside edit to it pulls no focus into the bottom card', () => topCardScrolledAway('reading'));
	it('[NEGO-O14] Live Preview, a long note: the focused top card scrolled away, an outside edit to it pulls no focus into the bottom card', () => topCardScrolledAway('live-preview'));
});

describe('negotiation: a re-render with no change to the note, and a collapse made outside', () => {
	const rerender = () => dse.page(`(() => { app.workspace.getMostRecentLeaf().view.previewMode.rerender(true); return true; })()`);
	const active = () => dse.page<{ ctl: string | null; inCard: boolean; card: string | null }>(`(() => { const a = document.activeElement; const c = a?.closest?.('[data-dse-element="negotiation"]') ?? null; return { ctl: a?.closest?.('[data-dse-control]')?.getAttribute('data-dse-control') ?? null, inCard: !!c, card: c ? c.textContent : null }; })()`);

	it('[NEGO-O17] Reading view, a chip pressed (the card\'s own write), the user clicks away to the page, then the note is re-rendered with no change: nothing is pulled back into the card', async () => {
		await dse.openNote(BASIC);
		const root = dse.block(NEGO, 0);
		const chip = root.control('negotiation.appeal.motivation', { nth: 1 });
		await dse.tabTo(chip, TABS);
		await dse.waitForWrite(BASIC, () => dse.press('Enter', chip));
		await browser.pause(500);
		await dse.page(`document.activeElement.blur()`);
		await rerender();
		await browser.pause(1000);
		expect(await active()).toMatchObject({ ctl: null, inCard: false });
	});

	it('[NEGO-O18] Reading view, a long note: the top card pressed, scrolled away, then the note is re-rendered with no change: no focus lands in the bottom card', async () => {
		const LONG2 = 'Negotiation/long-rerender.md';
		await dse.openNote(BASIC);
		const block = (await dse.noteText(BASIC)).split('\n').slice(4, 23).join('\n');
		const paras = Array.from({ length: 400 }, (_, i) => `Paragraph ${i} lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.`).join('\n\n');
		await dse.page(`(async () => { await app.vault.create(${JSON.stringify(LONG2)}, ${JSON.stringify('TOP\n\n' + block + '\n\n' + paras + '\n\n' + block.replace('Convincing Frodo', 'Bottom Frodo') + '\n\nEND\n')}); return true; })()`);
		await dse.page(`(async () => { const leaf = app.workspace.getLeaf('tab'); await leaf.setViewState({ type: 'markdown', state: { file: ${JSON.stringify(LONG2)}, mode: 'preview' }, active: true }); app.workspace.setActiveLeaf(leaf, { focus: true }); window.__nego656leaf2 = leaf; return true; })()`);
		await dse.waitFor(`!!window.__nego656leaf2.view.containerEl.querySelector('.markdown-reading-view [data-dse-control="negotiation.appeal.motivation"]')`, 'the top card');
		await browser.pause(800);
		await dse.page(`(() => { const r = window.__nego656leaf2.view.containerEl.querySelector('.markdown-reading-view [data-dse-element="negotiation"]'); r.querySelectorAll('[data-dse-control="negotiation.appeal.motivation"]')[1].focus({ focusVisible: true }); return true; })()`);
		await dse.page(`(() => { const r = window.__nego656leaf2.view.containerEl.querySelector('.markdown-reading-view [data-dse-element="negotiation"]'); r.querySelectorAll('[data-dse-control="negotiation.appeal.motivation"]')[1].click(); return true; })()`); // the card's own write
		await browser.pause(3500);
		await dse.page(`(async () => { const sc = window.__nego656leaf2.view.containerEl.querySelector('.markdown-preview-view'); for (let i = 0; i < 40; i++) { sc.dispatchEvent(new WheelEvent('wheel', { deltaY: 2000, bubbles: true })); sc.scrollTop += 2000; await new Promise((r) => setTimeout(r, 50)); } await new Promise((r) => setTimeout(r, 800)); return true; })()`);
		await dse.page(`(() => { window.__nego656leaf2.view.previewMode.rerender(true); return true; })()`);
		await browser.pause(1500);
		const f = await active();
		await dse.page(`(() => { window.__nego656leaf2.detach(); return true; })()`);
		expect(f).toMatchObject({ ctl: null, inCard: false });
	});

	it('[NEGO-O19] Reading view, Complete Argument focused with a tier chosen, the outside edit also collapses the card: the control is hidden, so focus lands on the card, not the page', async () => {
		await dse.openNote(BASIC);
		const root = dse.block(NEGO, 0);
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		await dse.tabTo(root.control('negotiation.complete'), TABS);
		await dse.externalEdit(BASIC, `c.replace('i5:', 'collapsed: true\\ni5:')`);
		await dse.waitFor(`!!document.querySelector('${PANES.reading} [data-dse-element="negotiation"][data-dse-collapsed]')`, 'the card to be collapsed');
		await browser.pause(500);
		const f = await dse.page<{ tag: string; isCard: boolean }>(`(() => { const a = document.activeElement; return { tag: a?.tagName ?? '', isCard: a?.getAttribute?.('data-dse-element') === 'negotiation' }; })()`);
		expect(f).toEqual({ tag: 'DIV', isCard: true });
	});
});

// The pinned sidebar does not redraw the card: its view is refreshed in place (SidebarPanel.handleExternalChange -> view.update(model)), which empties
// the card too. The pinned note is made at runtime (a copy of basic.md with an anchor); the driver deletes it again with the next openNote.
describe('negotiation: an outside edit refreshes the pinned card while a control has keyboard focus', () => {
	const PINNED = 'Sidebar/negotiation-pinned.md';
	const ANCHOR = 'oe656';
	const closeSidebar = (): Promise<unknown> => dse.page(`(() => { app.workspace.detachLeavesOfType('dse-sidebar'); return true; })()`);
	before(() => dse.setPrefs({}, { experimental: true }));
	after(async () => {
		await closeSidebar();
		await dse.setPrefs({});
	});
	afterEach(closeSidebar);

	async function pin(): Promise<void> {
		await dse.openNote(BASIC); // resets the vault to fixture state first
		const text = (await dse.noteText(BASIC)).replace('```\n\nBELOW', `_dse_anchor: ${ANCHOR}\n\`\`\`\n\nBELOW`);
		await dse.page(`(async () => {
			await app.vault.create(${JSON.stringify(PINNED)}, ${JSON.stringify(text)});
			document.querySelectorAll('.notice-container').forEach((n) => n.style.display = 'none'); // Obsidian's "Update Available" Notice sits over the panel
			const leaf = app.workspace.getRightLeaf(false);
			await leaf.setViewState({ type: 'dse-sidebar', active: true });
			await app.workspace.revealLeaf(leaf);
			leaf.view.addPanel({ filePath: ${JSON.stringify(PINNED)}, alias: 'ds-negotiation', anchorId: ${JSON.stringify(ANCHOR)} });
			return true;
		})()`);
		await dse.waitFor(`!!document.querySelector('.dse-sidebar [data-dse-control="negotiation.appeal.motivation"]')`, 'the pinned negotiation to render in the sidebar');
	}

	it('[NEGO-O09] pinned sidebar, focus on the second Motivation chip: after an outside edit the refreshed card holds focus on the same chip', async () => {
		await pin();
		await dse.page(`document.querySelectorAll('.dse-sidebar [data-dse-control="negotiation.appeal.motivation"]')[1].focus({ focusVisible: true })`);
		await dse.externalEdit(PINNED, RENAME);
		await dse.waitFor(`document.querySelector('.dse-sidebar [data-dse-element="negotiation"]')?.textContent?.includes('Convincing Sam')`, 'the pinned card to show the outside edit');
		await browser.pause(500);
		const f = await dse.page<{ ctl: string | null; nth: number; sidebar: boolean }>(`(() => {
			const a = document.activeElement;
			const id = a?.closest?.('[data-dse-control]')?.getAttribute('data-dse-control') ?? null;
			const c = a?.closest?.('[data-dse-element="negotiation"]');
			return { ctl: id, nth: c && id ? [...c.querySelectorAll('[data-dse-control="' + id + '"]')].indexOf(a) : -1, sidebar: !!a?.closest?.('.dse-sidebar') };
		})()`);
		expect(f).toEqual({ ctl: 'negotiation.appeal.motivation', nth: 1, sidebar: true });
		expect(await dse.noteText(PINNED)).toContain('Convincing Sam');
	});

	it('[NEGO-O15] pinned sidebar, Complete Argument focused with a tier chosen, an outside edit that leaves the argument and the standing alone: the tier is kept and Complete holds focus', async () => {
		await pin();
		await dse.page(`document.querySelector('.dse-sidebar [data-dse-control="negotiation.tier.row"][data-tier="crit"]').click()`);
		await dse.page(`document.querySelector('.dse-sidebar [data-dse-control="negotiation.complete"]').focus({ focusVisible: true })`);
		await dse.externalEdit(PINNED, RENAME);
		await dse.waitFor(`document.querySelector('.dse-sidebar [data-dse-element="negotiation"]')?.textContent?.includes('Convincing Sam')`, 'the pinned card to show the outside edit');
		await browser.pause(500);
		const f = await dse.page<{ ctl: string | null; tiers: number }>(`(() => ({ ctl: document.activeElement?.closest?.('[data-dse-control]')?.getAttribute('data-dse-control') ?? null, tiers: document.querySelectorAll('.dse-sidebar [data-dse-control="negotiation.tier.row"][aria-checked="true"]').length }))()`);
		expect(f).toEqual({ ctl: 'negotiation.complete', tiers: 1 });
	});

	it('[NEGO-O16] pinned sidebar, Complete Argument focused with a tier chosen, the outside edit spends Patience: the tier is dropped and focus lands on the first Motivation chip', async () => {
		await pin();
		await dse.page(`document.querySelector('.dse-sidebar [data-dse-control="negotiation.tier.row"][data-tier="crit"]').click()`);
		await dse.page(`document.querySelector('.dse-sidebar [data-dse-control="negotiation.complete"]').focus({ focusVisible: true })`);
		await dse.externalEdit(PINNED, `c.replace('initial_patience: 3', 'initial_patience: 2')`);
		await dse.waitFor(`!!document.querySelector('.dse-sidebar [data-dse-control="negotiation.complete"]:disabled')`, 'the refreshed Complete to be disabled');
		await browser.pause(500);
		const f = await dse.page<{ ctl: string | null; nth: number; tiers: number }>(`(() => {
			const a = document.activeElement;
			const id = a?.closest?.('[data-dse-control]')?.getAttribute('data-dse-control') ?? null;
			const c = a?.closest?.('[data-dse-element="negotiation"]');
			return { ctl: id, nth: c && id ? [...c.querySelectorAll('[data-dse-control="' + id + '"]')].indexOf(a) : -1, tiers: document.querySelectorAll('.dse-sidebar [data-dse-control="negotiation.tier.row"][aria-checked="true"]').length };
		})()`);
		expect(f).toEqual({ ctl: 'negotiation.appeal.motivation', nth: 0, tiers: 0 });
	});
});
