// SC-438 [W]: hand-written values that are not what the product expects, and a state the band words badly. SC-628 is fixed: W01 and W02 are plain tests
// and W04..W08 pin its rulings (a number or boolean title is shown as text and written back as typed; a quoted number is read as a number and a write that
// changes it writes a plain number; a map or list as the title is a plain error card that writes nothing). SC-629 (the verdict word and the rule line
// below it must agree, in whatever words) is still a marker.
// Montage/wrong-title.md (`title: 2024`), wrong-title-bool.md (`title: true`), wrong-title-map.md (a map as the title), quoted-rounds.md (`rounds: "3"`),
// quoted-current-round.md (`current_round: "1"`), quoted-successes.md (`successes: "2"`), no-action.md.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { blockOf, MONTAGE } from '../../driver/montage';

describe('montage: values the Director typed by hand', () => {
	it('[MONT-W01] a title that is a YAML number (`title: 2024`) renders the montage, not an error card', async () => {
		await dse.openNote('Montage/wrong-title.md');
		const root = dse.block(MONTAGE);
		await expect(root.control({ css: '.dse-error-card' })).not.toBeExisting();
		await expect(root.control({ css: '.dse-mt' })).toBeExisting();
	});

	it('[MONT-W04] `title: true` is shown as the text "true", and a write (Add a round) gives it back as the boolean the Director typed', async () => {
		await dse.openNote('Montage/wrong-title-bool.md');
		const root = dse.block(MONTAGE);
		await expect(root.control({ css: '.dse-error-card' })).not.toBeExisting();
		expect(await root.control({ css: '.dse-head__primary--left' }).getProperty('textContent')).toBe('true'); // the text itself: the card may draw it in capitals
		await dse.hover(root.root);
		await dse.waitForWrite('Montage/wrong-title-bool.md', () => dse.click(root.control('montage.chrome.add-round')));
		const b = await blockOf('Montage/wrong-title-bool.md');
		expect(b.title as unknown).toBe(true);
		expect(b.rounds).toBe(4);
		expect(await dse.noteText('Montage/wrong-title-bool.md')).toMatch(/^title: true$/m);
	});

	it('[MONT-W05] `current_round: "1"` then End round writes the number 2 (not the text "11")', async () => {
		await dse.openNote('Montage/quoted-current-round.md');
		const root = dse.block(MONTAGE);
		expect(await root.control({ css: '.dse-head__eyebrow--right' }).getProperty('textContent')).toBe('Round 1 / 3');
		await dse.waitForWrite('Montage/quoted-current-round.md', () => dse.click(root.control('montage.bar.end-round')));
		const b = await blockOf('Montage/quoted-current-round.md');
		expect(b.current_round).toBe(2);
		expect(await dse.noteText('Montage/quoted-current-round.md')).toMatch(/^current_round: 2$/m);
		expect(await root.control({ css: '.dse-head__eyebrow--right' }).getProperty('textContent')).toBe('Round 2 / 3');
	});

	it('[MONT-W06] `successes: "2"` then a quick success writes the number 3 (not the text "21") and reaches the limit of 3', async () => {
		await dse.openNote('Montage/quoted-successes.md');
		const root = dse.block(MONTAGE);
		await dse.waitForWrite('Montage/quoted-successes.md', () => dse.click(root.control('montage.quick.success', { nth: 0 })));
		const b = await blockOf('Montage/quoted-successes.md');
		expect(b.successes).toBe(3);
		expect(b.entries).toEqual([{ hero: 'Kira', round: 1, result: 'success' }]);
		expect(await root.control({ css: '.dse-mt__verdict-word' }).getProperty('textContent')).toBe('Total Success');
	});

	it('[MONT-W07] a write that does not touch a typed value gives it back as typed: `title: 2024` stays a number, `rounds: "3"` stays a quoted number', async () => {
		await dse.openNote('Montage/wrong-title.md');
		const root = dse.block(MONTAGE);
		await dse.waitForWrite('Montage/wrong-title.md', () => dse.click(root.control('montage.quick.success', { nth: 0 })));
		const b = await blockOf('Montage/wrong-title.md');
		expect(b.title as unknown).toBe(2024);
		expect(await dse.noteText('Montage/wrong-title.md')).toMatch(/^title: 2024$/m);
		expect(b.entries).toEqual([{ hero: 'Kira', round: 1, result: 'success' }]);
		await dse.openNote('Montage/quoted-rounds.md');
		await dse.waitForWrite('Montage/quoted-rounds.md', () => dse.click(dse.block(MONTAGE).control('montage.quick.failure', { nth: 0 })));
		expect((await blockOf('Montage/quoted-rounds.md')).rounds as unknown).toBe('3');
		expect(await dse.noteText('Montage/quoted-rounds.md')).toMatch(/^rounds: ["']3["']$/m);
	});

	it('[MONT-W08] a map as the title is a plain error card that names `title`, has no control, and leaves the note byte-identical after a click on it', async () => {
		await dse.openNote('Montage/wrong-title-map.md');
		const before = await dse.noteText('Montage/wrong-title-map.md');
		const card = await dse.page<{ title: string; message: string; controls: number; stage: string | null }>(`(() => {
			const c = document.querySelector('.markdown-reading-view [data-dse-element="montage"]');
			return { title: c.querySelector('.dse-error-card-title')?.textContent ?? '', message: c.querySelector('.dse-error-card-message')?.textContent ?? '', controls: c.querySelectorAll('[data-dse-control]').length, stage: c.closest('[data-dse-error-stage]')?.getAttribute('data-dse-error-stage') ?? c.getAttribute('data-dse-error-stage') };
		})()`);
		expect(card).toMatchObject({ message: "Invalid data: 'title' must be text.", controls: 0, stage: 'render' });
		expect(card.title).toBe('Montage Test tracker: failed to render (render)');
		// a real click on the card; it is not a control, so it drives no coverage pair and does not declare the block edited (the driver then also checks its fence)
		await dse.expectNoWrite('Montage/wrong-title-map.md', () => dse.block(MONTAGE).root.click());
		expect(await dse.noteText('Montage/wrong-title-map.md')).toBe(before);
		expect(before).toContain('title:\n  name: Cross the Gap\n');
	});

	it('[MONT-W02] Add a round on `rounds: "3"` makes it 4 rounds (not the text "31")', async () => {
		await dse.openNote('Montage/quoted-rounds.md');
		const root = dse.block(MONTAGE);
		await dse.hover(root.root);
		await dse.waitForWrite('Montage/quoted-rounds.md', () => dse.click(root.control('montage.chrome.add-round')));
		expect(Number((await blockOf('Montage/quoted-rounds.md')).rounds)).toBe(4);
	});

	knownBug('SC-629', '[MONT-W03] the verdict word and the rule line agree when the rounds ran out with nothing logged (both claim a failure, or neither does)', async () => {
		await dse.openNote('Montage/no-action.md');
		const root = dse.block(MONTAGE);
		const word = (await root.control({ css: '.dse-mt__verdict-word' }).getProperty('textContent')) as string;
		const rule = (await root.control({ css: '.dse-mt__verdict-rule' }).getProperty('textContent')) as string;
		// "total failure" as a phrase: a neutral rule line that merely says "failures" must not count as a claim
		const claimsTotalFailure = (text: string): boolean => /\btotal failure\b/i.test(text);
		expect(claimsTotalFailure(word)).toBe(claimsTotalFailure(rule));
	});
});
