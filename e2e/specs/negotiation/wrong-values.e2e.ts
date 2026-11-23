// SC-439 [W]: hand-written values that are not what the element expects, and blocks that are nearly empty. No marker is open: SC-641 is fixed
// (W06 and W07 are plain tests: a block without Interest opens at Interest 2 / Patience 5, and Reset falls back to those defaults, writing
// no initial_* key). SC-638 is fixed: W02 and W03 are plain tests, and W08..W11 pin its
// rulings (a plain error card that writes nothing for a wrong-shaped block, a typed value written back as typed). SC-640 is fixed: W04 and W05
// are plain tests, and W12 and W13 pin its rulings (same-named entries share one labelled chip and a notice, each row's Spent is its own, a
// nameless entry is labelled "Unnamed Motivation" and works).
// Negotiation/quoted.md: `current_interest: "3"`, `current_patience: "2"`. wrong-name.md: `name: 2024`. fraction.md: `current_interest: 0.4`.
// dup-names.md: two motivations named Higher Authority. nameless.md: a motivation with a reason and no name. minimal.md: `name:` only.
// current-only.md: `current_interest: 3`, `current_patience: 2`, no initial_*. wrong-item.md: `- Legacy` as the second motivation. wrong-argument.md: `currentArgument: hello`. wrong-block.md: the block is the text `hello`.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { argOf, blockOf, CURRENT_ONLY, DUPLICATES, dossier, FRACTION, MINIMAL, NAMELESS, NEGO, openMenu, openNego, patienceSeal, pressedOf, QUOTED, chooseReset, shown, WRONG_ARGUMENT, WRONG_BLOCK, WRONG_ITEM, WRONG_NAME } from '../../driver/negotiation';

describe('negotiation: values the Director typed by hand', () => {
	it('[NEGO-W01] quoted standing numbers are numbers: "2" Patience and "3" Interest are shown on those seals, and a crit makes Interest 4 (not the text "31")', async () => {
		const root = await openNego(QUOTED);
		expect(await shown()).toMatchObject({ patience: [2], interest: [3], ended: null });
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		await dse.waitForWrite(QUOTED, () => dse.click(root.control('negotiation.complete')));
		const b = await blockOf(QUOTED);
		expect(Number(b.current_interest)).toBe(4);
		expect(typeof b.current_interest).toBe('number');
		expect(Number(b.current_patience)).toBe(2);
		expect(await shown()).toMatchObject({ interest: [4], patience: [2] });
	});

	it('[NEGO-W02] a number as the name (`name: 2024`) does not leave a raw JavaScript error on the card', async () => {
		await dse.openNote(WRONG_NAME);
		const text = await dse.page<string>(`document.querySelector('.markdown-reading-view [data-dse-element="negotiation"]')?.textContent ?? ''`);
		expect(text).not.toMatch(/is not a function|Cannot read properties|undefined/);
		expect(await dse.page<boolean>(`!!document.querySelector('.markdown-reading-view [data-dse-element="negotiation"] .dse-error-card')`)).toBe(false); // it is a negotiation, not an error card
		expect(await dse.page<string>(`document.querySelector('.markdown-reading-view [data-dse-element="negotiation"] .dse-nt__head')?.textContent ?? ''`)).toContain('2024'); // and it shows the name
	});

	it('[NEGO-W03] a fractional Interest (0.4) is drawn on the seal that agrees with the ending: seal 0 only while the negotiation is over (hostile)', async () => {
		await dse.openNote(FRACTION);
		const s = await shown();
		expect(s.interest).toHaveLength(1);
		if ((s.interest[0] === 0) !== (s.ended === 'hostile')) throw new Error(`the seal shown disagrees with the ending: seal ${s.interest[0]}, ending ${s.ended}`);
	});

	/** What the card of the first negotiation says, and how many controls it has. */
	const cardOf = (): Promise<{ title: string; message: string; controls: number; stage: string | null }> =>
		dse.page(`(() => {
			const c = document.querySelector('.markdown-reading-view [data-dse-element="negotiation"]');
			return { title: c.querySelector('.dse-error-card-title')?.textContent ?? '', message: c.querySelector('.dse-error-card-message')?.textContent ?? '', controls: c.querySelectorAll('[data-dse-control]').length, stage: c.closest('[data-dse-error-stage]')?.getAttribute('data-dse-error-stage') ?? c.getAttribute('data-dse-error-stage') };
		})()`);

	it('[NEGO-W08] a motivation written as `- Legacy` is a plain error naming the list and the item, the card has no control, and the note is byte-identical after a click on it', async () => {
		await dse.openNote(WRONG_ITEM, { errorCard: true });
		const before = await dse.noteText(WRONG_ITEM);
		const card = await cardOf();
		expect(card).toMatchObject({ message: "Invalid data: 'motivations' item 2 must be an object.", controls: 0, stage: 'render' });
		expect(card.title).toBe('Negotiation tracker: failed to render (render)');
		await dse.expectNoWrite(WRONG_ITEM, () => dse.block(NEGO).root.click()) // a real click on the card; it is not a control, so it drives no coverage pair and does not declare the block edited (the driver then also checks its fence);
		expect(await dse.noteText(WRONG_ITEM)).toBe(before);
		expect(before).toContain('  - Legacy\n');
	});

	it('[NEGO-W09] `currentArgument: hello` is a plain error naming the key, the card has no control, and the note is byte-identical after a click on it', async () => {
		await dse.openNote(WRONG_ARGUMENT, { errorCard: true });
		const before = await dse.noteText(WRONG_ARGUMENT);
		const card = await cardOf();
		expect(card).toMatchObject({ message: "Invalid data: 'currentArgument' field must be an object.", controls: 0, stage: 'render' });
		await dse.expectNoWrite(WRONG_ARGUMENT, () => dse.block(NEGO).root.click()) // a real click on the card; it is not a control, so it drives no coverage pair and does not declare the block edited (the driver then also checks its fence);
		expect(await dse.noteText(WRONG_ARGUMENT)).toBe(before);
		expect(before).toContain('currentArgument: hello\n');
	});

	it('[NEGO-W11] a block that is just the text `hello` is a plain error, the card has no control, and the note is byte-identical after a click on it', async () => {
		await dse.openNote(WRONG_BLOCK, { errorCard: true });
		const before = await dse.noteText(WRONG_BLOCK);
		const card = await cardOf();
		expect(card).toMatchObject({ message: 'Invalid data: the block must be a map of keys.', controls: 0, stage: 'render' });
		await dse.expectNoWrite(WRONG_BLOCK, () => dse.block(NEGO).root.click()); // a real click on the card; it is not a control, so it drives no coverage pair and does not declare the block edited
		expect(await dse.noteText(WRONG_BLOCK)).toBe(before);
		expect(before).toContain('```ds-negotiation\nhello\n```');
	});

	it('[NEGO-W10] a number typed as the name (`name: 2024`) is drawn as text and a Patience click writes it back as the number, not as the text "2024"', async () => {
		const root = await openNego(WRONG_NAME);
		expect(await dse.page<string>(`document.querySelector('.markdown-reading-view [data-dse-element="negotiation"] .dse-nt__head')?.textContent ?? ''`)).toContain('2024');
		await dse.waitForWrite(WRONG_NAME, () => dse.click(patienceSeal(root, 1)));
		const b = await blockOf(WRONG_NAME);
		expect(b.name).toBe(2024);
		expect(typeof b.name).toBe('number');
		expect(await dse.noteText(WRONG_NAME)).toMatch(/^name: 2024$/m);
		expect(b).toMatchObject({ current_patience: 1 });
	});

	it('[NEGO-W04] two motivations with the same name: ONE appeal chip with its name to read, and a notice under it that it stands for both; the card keeps both rows', async () => {
		await dse.openNote(DUPLICATES);
		const labels = await dse.page<string[]>(`[...document.querySelectorAll('.markdown-reading-view [data-dse-control="negotiation.appeal.motivation"]')].map((c) => (c.textContent ?? '').replace(/[◆◇]/g, '').trim())`);
		expect(labels).toEqual(['Higher Authority']);
		const notices = await dse.page<string[]>(`[...document.querySelectorAll('.markdown-reading-view .dse-nt__appeals-group [data-note="shared-name"]')].map((n) => n.textContent ?? '')`);
		expect(notices).toEqual(['Higher Authority is listed twice; this chip stands for both.']);
		expect(await dossier()).toMatchObject({ count: '2 of 2 open', chips: ['Mark spent', 'Mark spent'] });
	});

	it('[NEGO-W12] the second of two same-named motivations has its own Spent: a click writes only the second entry, and the one chip is drawn spent', async () => {
		const root = await openNego(DUPLICATES);
		await dse.waitForWrite(DUPLICATES, () => dse.click(root.control('negotiation.spent', { nth: 1 })));
		expect(await dossier()).toMatchObject({ count: '1 of 2 open', spent: [false, true], chips: ['Mark spent', 'Spent'] });
		const b = await blockOf(DUPLICATES);
		expect(b.motivations!.map((m) => m.hasBeenAppealedTo ?? false)).toEqual([false, true]);
		await expect(root.control('negotiation.appeal.motivation')).toHaveText(expect.stringContaining('spent')); // any entry spent: the shared chip is spent
	});

	it('[NEGO-W05] a motivation with no name: its appeal chip is labelled "Unnamed Motivation" and announced as "Appeal to Unnamed Motivation"', async () => {
		await dse.openNote(NAMELESS);
		const chips = await dse.page<Array<{ text: string; label: string }>>(`[...document.querySelectorAll('.markdown-reading-view [data-dse-control="negotiation.appeal.motivation"]')].map((c) => ({ text: (c.textContent ?? '').replace(/[◆◇]/g, '').trim(), label: c.getAttribute('aria-label') ?? '' }))`);
		expect(chips).toEqual([
			{ text: 'Higher Authority', label: 'Appeal to Higher Authority' },
			{ text: 'Unnamed Motivation', label: 'Appeal to Unnamed Motivation' },
		]);
	});

	it('[NEGO-W13] the chip of a motivation with no name works: a click presses it and writes the empty string, never the label, and a second click takes it off', async () => {
		const root = await openNego(NAMELESS);
		await dse.waitForWrite(NAMELESS, () => dse.click(root.control('negotiation.appeal.motivation', { nth: 1 })));
		expect(await pressedOf('negotiation.appeal.motivation')).toEqual(['false', 'true']);
		const b = await blockOf(NAMELESS);
		expect(b.currentArgument?.motivationsUsed).toEqual(['']);
		expect(await dse.noteText(NAMELESS)).not.toContain('Unnamed');
		await dse.waitForWrite(NAMELESS, () => dse.click(root.control('negotiation.appeal.motivation', { nth: 1 })));
		expect(await pressedOf('negotiation.appeal.motivation')).toEqual(['false', 'false']);
		expect(argOf(await blockOf(NAMELESS)).motivationsUsed).toEqual([]);
	});

	it('[NEGO-W06] a block that declares no Interest opens at Interest 2 / Patience 5, not already ended (SC-641)', async () => {
		await dse.openNote(MINIMAL);
		expect(await shown()).toMatchObject({ interest: [2], patience: [5], ended: null });
	});

	it('[NEGO-W07] Reset on a block that declares only its current standing lands on Interest 2 / Patience 5 and adds no initial_* key (SC-641)', async () => {
		const root = await openNego(CURRENT_ONLY);
		expect(await shown()).toMatchObject({ interest: [3], patience: [2], ended: null }); // live to begin with
		await openMenu(root);
		await chooseReset(CURRENT_ONLY);
		expect(await shown()).toMatchObject({ interest: [2], patience: [5], ended: null });
		const b = await blockOf(CURRENT_ONLY);
		expect([b.current_interest, b.current_patience]).toEqual([2, 5]);
		expect(await dse.noteText(CURRENT_ONLY)).not.toContain('initial_');
	});
});
