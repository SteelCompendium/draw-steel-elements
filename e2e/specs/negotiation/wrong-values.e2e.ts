// SC-439 [W]: hand-written values that are not what the element expects, and blocks that are nearly empty. Each marker states the CORRECT
// behaviour only as far as its ticket rules: SC-638 (no raw JS error text on the card; the seal shown agrees with the ending), SC-640 (every
// motivation chip has a name to read; no chip is announced as "Appeal to "), SC-641 (a block without Interest does not open ended; Reset of a
// block that declares only its current standing does not end it). Never a specific fix or default value.
// Negotiation/quoted.md: `current_interest: "3"`, `current_patience: "2"`. wrong-name.md: `name: 2024`. fraction.md: `current_interest: 0.4`.
// dup-names.md: two motivations named Higher Authority. nameless.md: a motivation with a reason and no name. minimal.md: `name:` only.
// current-only.md: `current_interest: 3`, `current_patience: 2`, no initial_*.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { blockOf, CURRENT_ONLY, DUPLICATES, FRACTION, MINIMAL, NAMELESS, openMenu, openNego, QUOTED, chooseReset, shown, WRONG_NAME } from '../../driver/negotiation';

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

	knownBug('SC-638', '[NEGO-W02] a number as the name (`name: 2024`) does not leave a raw JavaScript error on the card', async () => {
		await dse.openNote(WRONG_NAME);
		const text = await dse.page<string>(`document.querySelector('.markdown-reading-view [data-dse-element="negotiation"]')?.textContent ?? ''`);
		expect(text).not.toMatch(/is not a function|Cannot read properties|undefined/);
	}, { failsWith: /not a function/ });

	knownBug('SC-638', '[NEGO-W03] a fractional Interest (0.4) is drawn on the seal that agrees with the ending: seal 0 only while the negotiation is over (hostile)', async () => {
		await dse.openNote(FRACTION);
		const s = await shown();
		expect(s.interest).toHaveLength(1);
		if ((s.interest[0] === 0) !== (s.ended === 'hostile')) throw new Error(`the seal shown disagrees with the ending: seal ${s.interest[0]}, ending ${s.ended}`);
	}, { failsWith: /the seal shown disagrees with the ending/ });

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
