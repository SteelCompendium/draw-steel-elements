// SC-439 [W]: hand-written values that are not what the element expects, and blocks that are nearly empty. Each marker states the CORRECT
// behaviour only as far as its ticket rules: SC-638 (no raw JS error text on the card; the seal shown agrees with the ending), SC-640 (every
// motivation chip has a name to read; no chip is announced as "Appeal to "), SC-641 (a block without Interest does not open ended; Reset of a
// block that declares only its current standing does not end it). Never a specific fix or default value. SC-638 is fixed: W02 and W03 are plain tests,
// and W08..W11 pin its rulings (a plain error card that writes nothing for a wrong-shaped block, a typed value written back as typed).
// Negotiation/quoted.md: `current_interest: "3"`, `current_patience: "2"`. wrong-name.md: `name: 2024`. fraction.md: `current_interest: 0.4`.
// dup-names.md: two motivations named Higher Authority. nameless.md: a motivation with a reason and no name. minimal.md: `name:` only.
// current-only.md: `current_interest: 3`, `current_patience: 2`, no initial_*. wrong-item.md: `- Legacy` as the second motivation. wrong-argument.md: `currentArgument: hello`. wrong-block.md: the block is the text `hello`.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { blockOf, CURRENT_ONLY, DUPLICATES, FRACTION, MINIMAL, NAMELESS, NEGO, openMenu, openNego, patienceSeal, QUOTED, chooseReset, shown, WRONG_ARGUMENT, WRONG_BLOCK, WRONG_ITEM, WRONG_NAME } from '../../driver/negotiation';

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

	knownBug('SC-640', '[NEGO-W04] two motivations with the same name: every appeal chip has its name to read', async () => {
		await dse.openNote(DUPLICATES);
		const labels = await dse.page<string[]>(`[...document.querySelectorAll('.markdown-reading-view [data-dse-control="negotiation.appeal.motivation"]')].map((c) => (c.textContent ?? '').replace(/[◆◇]/g, '').trim())`);
		expect(labels.length).toBeGreaterThanOrEqual(1); // a setup check; the count itself is not the ticket's to rule
		expect(labels.filter((label) => label === '').length).toBe(0); // every chip that is drawn has a name to read
	}, { failsWith: /Expected: 0/ });

	knownBug('SC-640', '[NEGO-W05] a motivation with no name: its appeal chip is not announced as "Appeal to "', async () => {
		await dse.openNote(NAMELESS);
		const names = await dse.page<string[]>(`[...document.querySelectorAll('.markdown-reading-view [data-dse-control="negotiation.appeal.motivation"]')].map((c) => c.getAttribute('aria-label') ?? '')`);
		expect(names.length).toBeGreaterThanOrEqual(1);
		expect(names.filter((name) => /^Appeal to\s*$/.test(name))).toEqual([]); // no chip is announced as a bare "Appeal to "
	}, { failsWith: /Appeal to/ });

	knownBug('SC-641', '[NEGO-W06] a block that declares no Interest does not open already ended', async () => {
		await dse.openNote(MINIMAL);
		expect((await shown()).ended).toBeNull();
	}, { failsWith: /hostile/ });

	knownBug('SC-641', '[NEGO-W07] Reset on a block that declares only its current standing does not end the negotiation', async () => {
		const root = await openNego(CURRENT_ONLY);
		expect((await shown()).ended).toBeNull(); // live to begin with: Interest 3, Patience 2
		await openMenu(root);
		await chooseReset(CURRENT_ONLY);
		expect((await shown()).ended).toBeNull();
	}, { failsWith: /hostile/ });
});
