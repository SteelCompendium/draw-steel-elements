// SC-437 [T]: the encounter title edit. Click, Enter or Space on the title text opens a textarea; Enter, Shift+Enter or a real blur
// commits (trimmed), Escape reverts. The permutations (empty, whitespace, line breaks, special characters) live in the jsdom matrix
// (test/dom/elements/initiative-matrix.test.ts); here real pointer and key events drive each gesture and the note + screen are read.
// Initiative/tracker.md has no title; Initiative/rich.md is titled "Warren Ambush".
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const MIN = 'Initiative/tracker.md';
const RICH = 'Initiative/rich.md';
const INIT = 'ds-initiative';

type Scope = ReturnType<typeof dse.block>;
const titleText = (root: Scope) => root.control({ css: '.dse-init__title-text' });
/** A neutral node of the tracker to click, to move focus off the editor the way a user does. */
const clickAway = (root: Scope) => root.control({ css: '.dse-init__group--heroes h3' });
const nameOf = async (note: string): Promise<unknown> => ((await dse.expectNoteBlock(note, INIT).value()) as { name?: string }).name;

async function openTitled(): Promise<Scope> {
	await dse.openNote(RICH);
	return dse.block(INIT);
}

describe('initiative: the title edit', () => {
	it('[INIT-T01] clicking an untitled tracker\'s title, typing a name and pressing Enter writes it first in the block and shows it', async () => {
		await dse.openNote(MIN);
		const root = dse.block(INIT);
		await dse.click(root.control('init.title'));
		const input = root.control('init.title.input');
		await expect(input).toHaveValue('');
		await dse.type(input, 'Night Watch', { replace: true });
		const w = await dse.waitForWrite(MIN, () => dse.press('Enter', input));
		expect(w.count).toBe(1);
		expect(await nameOf(MIN)).toBe('Night Watch');
		expect((await dse.noteText(MIN)).split('```ds-initiative\n')[1].startsWith('name: Night Watch\n')).toBe(true);
		await expect(root.control('init.title.input')).not.toBeExisting();
		await expect(titleText(root)).toHaveText('Night Watch');
	});

	it('[INIT-T02] Enter on the focused title text opens the editor seeded with the name; Escape closes it and writes nothing', async () => {
		const root = await openTitled();
		const title = root.control('init.title');
		await dse.tabTo(title, 40);
		await dse.press('Enter', title);
		const input = root.control('init.title.input');
		await expect(input).toHaveValue('Warren Ambush');
		await expect(input).toBeFocused();
		await dse.expectNoWrite(RICH, () => dse.press('Escape', input));
		await expect(root.control('init.title.input')).not.toBeExisting();
		await expect(titleText(root)).toHaveText('Warren Ambush');
	});

	it('[INIT-T03] Space on the focused title text opens the editor too', async () => {
		const root = await openTitled();
		const title = root.control('init.title');
		await dse.tabTo(title, 40);
		await dse.press('Space', title);
		const input = root.control('init.title.input');
		await expect(input).toHaveValue('Warren Ambush');
		await expect(input).toBeFocused();
		await dse.expectNoWrite(RICH, () => dse.press('Escape', input));
	});

	it('[INIT-T04] renaming a titled tracker: typed text replaces the name, Enter commits it, and the other keys of the block are untouched', async () => {
		const root = await openTitled();
		await dse.click(root.control('init.title'));
		const input = root.control('init.title.input');
		await dse.type(input, '  Dawn Raid  ', { replace: true });
		const w = await dse.waitForWrite(RICH, () => dse.press('Enter', input));
		expect(w.count).toBe(1);
		expect(await nameOf(RICH)).toBe('Dawn Raid');
		await dse.expectNoteBlock(RICH, INIT).toMatchObject({ round: 2, malice: { value: 4, round_gain: 2 } });
		await expect(titleText(root)).toHaveText('Dawn Raid');
	});

	it('[INIT-T05] Shift+Enter commits as Enter does and never inserts a line break', async () => {
		const root = await openTitled();
		await dse.click(root.control('init.title'));
		const input = root.control('init.title.input');
		await dse.type(input, 'Second Wave', { replace: true });
		const w = await dse.waitForWrite(RICH, () => dse.press('Shift+Enter', input));
		expect(w.count).toBe(1);
		expect(await nameOf(RICH)).toBe('Second Wave');
		await expect(root.control('init.title.input')).not.toBeExisting();
	});

	it('[INIT-T06] Escape reverts: the typed text is dropped, the old title stays and nothing is written', async () => {
		const root = await openTitled();
		await dse.click(root.control('init.title'));
		const input = root.control('init.title.input');
		await dse.type(input, 'Discarded', { replace: true });
		await dse.expectNoWrite(RICH, () => dse.press('Escape', input));
		await expect(root.control('init.title.input')).not.toBeExisting();
		await expect(titleText(root)).toHaveText('Warren Ambush');
		expect(await nameOf(RICH)).toBe('Warren Ambush');
	});

	it('[INIT-T07] a real blur (a click elsewhere in the tracker) commits the typed title', async () => {
		const root = await openTitled();
		await dse.click(root.control('init.title'));
		const input = root.control('init.title.input');
		await dse.type(input, 'Blurred Name', { replace: true });
		const w = await dse.waitForWrite(RICH, () => dse.blur(input, clickAway(root)));
		expect(w.count).toBe(1);
		expect(await nameOf(RICH)).toBe('Blurred Name');
		await expect(titleText(root)).toHaveText('Blurred Name');
	});
});
