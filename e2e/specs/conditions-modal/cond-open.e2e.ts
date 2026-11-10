// SC-436: reaching the Conditions window from the initiative tracker (a hero row, a creature row, by pointer and by
// keyboard) and every way out of it. Opening and closing write nothing: the window applies live, so only a mutation
// writes. Each no-write test wraps the whole open + leave in one `expectNoWrite`.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { CONDITIONS, INIT, TRACKER, focusedOption, modalRows, openFrom, trackerIcons } from '../../driver/conditions';

/** Open `note`, then run `body` (which opens the window and leaves it) with the note held to zero writes. */
async function noWriteAround(note: string, body: (root: ReturnType<typeof dse.block>) => Promise<void>): Promise<void> {
	await dse.openNote(note);
	const root = dse.block(INIT);
	await dse.expectNoWrite(note, () => body(root));
}

describe('conditions-modal: opening it from the tracker', () => {
	it('[COND-O01] the hero row\'s "Add Condition" opens the window on that hero\'s conditions, focus on its first cog', async () => {
		await dse.openNote(CONDITIONS);
		const root = dse.block(INIT);
		await dse.expectNoWrite(CONDITIONS, async () => {
			const modal = await openFrom(root, 'hero');
			expect(await modal.root.$('.dse-modal__title-text').getProperty('textContent')).toBe('Conditions'); // the Steel theme upper-cases it on screen
			expect(await modalRows()).toEqual([
				{ name: 'Bleeding', custom: false, badges: [], editorOpen: false },
				{ name: 'Dazed', custom: false, badges: ['EoT', 'glow'], editorOpen: false },
				{ name: 'Hexed', custom: true, badges: [], editorOpen: false },
				{ name: 'Slowed', custom: false, badges: ['Save Ends'], editorOpen: false },
			]);
			expect(await focusedOption()).toEqual({ ctl: 'cond.edit', label: 'Customize Bleeding' }); // the first control in the window
			await dse.click(modal.control('modal.close'));
			await expect(modal.root).not.toBeExisting();
		});
	});

	it('[COND-O02] the creature row\'s "Add Condition" opens the window on the selected creature\'s conditions, not the hero\'s', async () => {
		await dse.openNote(CONDITIONS);
		const root = dse.block(INIT);
		await dse.expectNoWrite(CONDITIONS, async () => {
			const modal = await openFrom(root, 'creature');
			expect(await modalRows()).toEqual([
				{ name: 'Grabbed', custom: false, badges: [], editorOpen: false },
				{ name: 'Prone', custom: false, badges: ['Save Ends'], editorOpen: false },
			]);
			await dse.click(modal.control('modal.close'));
			await expect(modal.root).not.toBeExisting();
		});
	});

	it('[COND-O03] Tab to the hero\'s "Add Condition" and Enter opens the window', async () => {
		await dse.openNote(TRACKER);
		const button = dse.block(INIT).control('init.cond.add', { nth: 0 });
		await dse.expectNoWrite(TRACKER, async () => {
			await dse.tabTo(button, 120);
			await dse.press('Enter', button);
			const modal = await dse.modal('conditions');
			await expect(modal.control('cond.add')).toBeFocused();
			await dse.click(modal.control('modal.close'));
			await expect(modal.root).not.toBeExisting();
		});
	});

	it('[COND-O04] "+ Add condition" opens the dropdown on Enter, with the input focused, and writes nothing', async () => {
		await noWriteAround(TRACKER, async (root) => {
			const modal = await openFrom(root, 'hero');
			await dse.press('Enter', modal.control('cond.add'));
			await expect(modal.control('cond.input')).toBeFocused();
			await expect(modal.control('cond.add')).not.toBeExisting();
			await dse.click(modal.control('modal.close'));
			await expect(modal.root).not.toBeExisting();
		});
	});
});

describe('conditions-modal: leaving it', () => {
	it('[COND-X01] Done closes the window and writes nothing', async () => {
		await noWriteAround(CONDITIONS, async (root) => {
			const modal = await openFrom(root, 'hero');
			await dse.click(modal.control('cond.done'));
			await expect(modal.root).not.toBeExisting();
		});
	});

	it('[COND-X02] Tab to Done and Enter closes the window and writes nothing', async () => {
		await noWriteAround(CONDITIONS, async (root) => {
			const modal = await openFrom(root, 'hero');
			const done = modal.control('cond.done');
			await dse.tabTo(done, 40);
			await dse.press('Enter', done);
			await expect(modal.root).not.toBeExisting();
		});
	});

	it('[COND-X03] the X closes the window and writes nothing', async () => {
		await noWriteAround(CONDITIONS, async (root) => {
			const modal = await openFrom(root, 'hero');
			await dse.click(modal.control('modal.close'));
			await expect(modal.root).not.toBeExisting();
		});
	});

	it('[COND-X04] Escape with focus on Done closes the window (no dropdown to back out of) and writes nothing', async () => {
		await noWriteAround(CONDITIONS, async (root) => {
			const modal = await openFrom(root, 'hero');
			await dse.tabTo(modal.control('cond.done'), 40);
			await dse.press('Escape', dse.aimedAt('modal.close'));
			await expect(modal.root).not.toBeExisting();
		});
	});

	it('[COND-X05] Escape with focus on a row\'s cog closes the whole window even with that row\'s editor open', async () => {
		await noWriteAround(CONDITIONS, async (root) => {
			const modal = await openFrom(root, 'hero');
			const cog = modal.control('cond.edit', { nth: 2 });
			await dse.click(cog);
			await expect(cog).toBeFocused();
			await expect(modal.control('cond.swatch', { nth: 0 })).toBeExisting();
			await dse.press('Escape', cog);
			await expect(modal.root).not.toBeExisting();
		});
	});

	it('[COND-X06] a click on the backdrop closes the window and writes nothing', async () => {
		await noWriteAround(CONDITIONS, async (root) => {
			const modal = await openFrom(root, 'hero');
			await dse.click(modal.control('modal.backdrop'), { inset: 5 });
			await expect(modal.root).not.toBeExisting();
		});
	});

	it('[COND-X07] Escape in the icon search field of an open editor closes the whole window and writes nothing [current behaviour — SC-587 may change this]', async () => {
		await noWriteAround(CONDITIONS, async (root) => {
			const modal = await openFrom(root, 'hero');
			await dse.click(modal.control('cond.edit', { nth: 2 }));
			await dse.type(modal.control('cond.icon-search'), 'flam');
			await dse.press('Escape', modal.control('cond.icon-search'));
			await expect(modal.root).not.toBeExisting();
		});
	});

	it('[COND-X08] after a write, Done closes the window with no further write and the tracker row shows the new condition', async () => {
		await dse.openNote(TRACKER);
		const root = dse.block(INIT);
		const modal = await openFrom(root, 'hero');
		await dse.click(modal.control('cond.add'));
		await dse.type(modal.control('cond.input'), 'daz');
		const w = await dse.waitForWrite(TRACKER, () => dse.press('Enter', modal.control('cond.input')));
		expect(w.count).toBe(1);
		await dse.expectNoWrite(TRACKER, () => dse.click(modal.control('cond.done')));
		await expect(modal.root).not.toBeExisting();
		expect(await trackerIcons('hero')).toEqual(['Dazed']);
		await dse.expectNoteBlock(TRACKER, INIT).toMatchObject({ heroes: [{ name: 'Alice Alpha', conditions: [{ key: 'dazed' }] }] });
	});
});
