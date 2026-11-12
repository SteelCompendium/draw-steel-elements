// SC-436: note integrity around the Conditions window's live writes. The text above, between and below the tracker
// blocks survives byte for byte, and a second tracker in the same note is never touched (the driver also fails any test
// that writes into a block it did not edit). Plus "or just start typing" (SC-580: a printable key opens the Add search) and the
// two open tickets that reach this window from outside: SC-384 (Live Preview) and SC-355 (the dialog role).
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { INIT, TRACKER, TWO, addByKeyboard, menuOptions, modalNames, modalRows, noteCondition, openConditionsModal, openFrom, pressedIn, pressedSwatches, trackerIcons } from '../../driver/conditions';

const FIRST_BLOCK =
	'```ds-initiative\nheroes:\n  - name: Alice Alpha\n    max_stamina: 30\nenemy_groups:\n  - name: Ogres\n    creatures:\n      - name: Ogre\n        max_stamina: 60\n        amount: 1\nmalice:\n  value: 1\n```\n';
const SECOND_BLOCK =
	'```ds-initiative\nheroes:\n  - name: Bob Beta\n    max_stamina: 25\n    conditions:\n      - grabbed\n      - key: hexed\n        duration: eoe\nenemy_groups:\n  - name: Goblins\n    creatures:\n      - name: Goblin\n        max_stamina: 10\n        amount: 1\nmalice:\n  value: 2\n```\n';
const HEAD = '# Two trackers\n\nABOVE\n\n';
const BETWEEN = '\nBETWEEN\n\n';
const TAIL = '\nBELOW\n';

describe('conditions-modal: a second tracker in the same note', () => {
	it('[COND-N01] edits through the SECOND tracker\'s window (add, duration, remove) leave the first tracker and the prose byte-identical', async () => {
		const { modal } = await openConditionsModal(TWO, 'hero', 1);
		expect(await modalNames()).toEqual(['Grabbed', 'Hexed']);
		await addByKeyboard(modal, 'daz');
		await dse.settle();
		await dse.click(modal.control('cond.edit', { nth: 2 }));
		await dse.waitForWrite(TWO, () => dse.click(modal.control('cond.duration', { nth: 1 }))); // Dazed -> End of Turn
		await dse.waitForWrite(TWO, () => dse.click(modal.control('cond.remove', { nth: 0 }))); // Grabbed
		expect(await modalNames()).toEqual(['Hexed', 'Dazed']);
		await dse.closeModals();
		const text = await dse.noteText(TWO);
		expect(text.startsWith(HEAD + FIRST_BLOCK + BETWEEN)).toBe(true);
		expect(text.endsWith('```\n' + TAIL)).toBe(true);
		await dse.expectNoteBlock(TWO, INIT, 1).toMatchObject({
			heroes: [{ name: 'Bob Beta', conditions: [{ key: 'hexed', duration: 'eoe' }, { key: 'dazed', duration: 'eot' }] }],
		});
		await dse.expectNoteBlock(TWO, INIT, 0).toMatchObject({ heroes: [{ name: 'Alice Alpha', max_stamina: 30 }], malice: { value: 1 } });
	});

	it('[COND-N02] edits through the FIRST tracker\'s window leave the second tracker (its conditions, spelling and all) and the prose byte-identical', async () => {
		const { modal } = await openConditionsModal(TWO, 'hero', 0);
		await addByKeyboard(modal, 'hexed');
		await dse.settle();
		await dse.closeModals();
		const text = await dse.noteText(TWO);
		expect(text.startsWith(HEAD + '```ds-initiative\n')).toBe(true);
		expect(text.endsWith(BETWEEN + SECOND_BLOCK + TAIL)).toBe(true);
		await dse.expectNoteBlock(TWO, INIT, 0).toMatchObject({ heroes: [{ name: 'Alice Alpha', conditions: [{ key: 'hexed' }] }] });
		expect(await trackerIcons('hero', 1)).toEqual(['Grabbed', 'Hexed']);
	});

	it('[COND-N03] a whole session on one tracker (custom add, Save Ends, removal) rewrites only the block body: the fence lines and the prose stay', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'hero');
		await addByKeyboard(modal, 'Fire Aura');
		await dse.settle();
		await dse.click(modal.control('cond.edit', { nth: 0 }));
		await dse.waitForWrite(TRACKER, () => dse.click(modal.control('cond.duration', { nth: 2 })));
		expect(await noteCondition(TRACKER, 'hero', 0)).toEqual({ key: 'fire-aura', duration: 'save-ends' });
		await dse.waitForWrite(TRACKER, () => dse.click(modal.control('cond.remove', { nth: 0 })));
		await dse.closeModals();
		const text = await dse.noteText(TRACKER);
		expect(text.startsWith('# Initiative tracker\n\nABOVE\n\n```ds-initiative\nheroes:\n')).toBe(true);
		expect(text.endsWith('```\n\nBELOW\n')).toBe(true);
		expect(text.match(/```/g)).toHaveLength(2);
		expect(await trackerIcons('hero')).toEqual([]);
	});
});

describe('conditions-modal: what it writes is what the tracker reads back', () => {
	it('[COND-N06] a condition set up in the window (icon, duration, colour, effect) survives a re-render from the note: reopened, it shows every setting', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'creature');
		await addByKeyboard(modal, 'Fire Aura');
		await dse.settle();
		await dse.click(modal.control('cond.edit'));
		await dse.type(modal.control('cond.icon-search'), 'skull');
		await dse.waitForWrite(TRACKER, () => dse.click(modal.control('cond.icon', { nth: 1 })));
		await dse.waitForWrite(TRACKER, () => dse.click(modal.control('cond.duration', { nth: 2 })));
		await dse.waitForWrite(TRACKER, () => dse.click(modal.control('cond.swatch', { nth: 3 })));
		await dse.waitForWrite(TRACKER, () => dse.click(modal.control('cond.effect', { nth: 3 })));
		await dse.closeModals();
		const entry = { key: 'fire-aura', icon: 'skull', duration: 'save-ends', color: '#2874a6', effect: 'glow-pulse' };
		expect(await noteCondition(TRACKER, 'creature', 0)).toEqual(entry);
		// Draw the tracker again from the note's text (not from the objects the window handed over) and reopen the window.
		await dse.page(`(() => { for (const r of document.querySelectorAll('.markdown-reading-view [data-dse-element]')) r.__old = true; return true; })()`);
		await dse.page(`(app.workspace.getMostRecentLeaf().view.previewMode.rerender(true), true)`);
		await dse.waitFor(`Array.from(document.querySelectorAll('.markdown-reading-view [data-dse-element]')).some((r) => !r.__old)`, 'the tracker to draw again');
		await dse.settle();
		const again = await openFrom(dse.block(INIT), 'creature');
		expect(await modalRows()).toEqual([{ name: 'Fire Aura', custom: true, badges: ['Save Ends', 'glow-pulse'], editorOpen: false }]);
		await dse.click(again.control('cond.edit'));
		expect(await pressedIn('Condition icon')).toEqual(['Icon: skull']);
		expect(await pressedIn('Duration')).toEqual(['Save Ends']);
		expect(await pressedSwatches()).toEqual(['#2874a6']);
		expect(await pressedIn('Effect')).toEqual(['glow-pulse']);
		await dse.closeModals();
	});
});

describe('conditions-modal: "or just start typing" opens the Add search (SC-580)', () => {
	it('[COND-N07] typing "daz" with focus on "+ Add condition" opens the dropdown with it typed, as the docs say ("or just start typing"): nothing lost, nothing doubled, Dazed offered', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'hero');
		await expect(modal.control('cond.add')).toBeFocused();
		await dse.expectNoWrite(TRACKER, async () => {
			await dse.press('daz'); // a page-level key (focus is asserted above): three quick keys, the first opens, the next two are the input's own
			await expect(modal.control('cond.input')).toBeFocused();
			await expect(modal.control('cond.input')).toHaveValue('daz');
			expect((await menuOptions()).names).toEqual(['Dazed', 'Add custom: "daz"']);
		});
		await dse.waitForWrite(TRACKER, () => dse.press('Enter', modal.control('cond.input')));
		expect(await modalNames()).toEqual(['Dazed']);
		await expect(modal.control('cond.input')).toHaveValue('');
		await dse.closeModals();
	});

	it('[COND-N08] Space on the focused "+ Add condition" activates the button as it always did: the dropdown opens empty, no space is typed', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'hero');
		await dse.press('Space', modal.control('cond.add'));
		await expect(modal.control('cond.input')).toBeFocused();
		expect(await dse.page<string>(`JSON.stringify(document.querySelector('.modal-container .dse-condal__input').value)`)).toBe('""'); // the raw value: toHaveValue trims, so it would not see a typed space
		await dse.closeModals();
	});

	it('[COND-N09] a Ctrl or Meta chord with focus on "+ Add condition" is not typing: the dropdown stays closed, focus stays, nothing is written', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'hero');
		await dse.expectNoWrite(TRACKER, async () => {
			await dse.press('Control+d'); // (page-level keys: no target, so not a manifest pair)
			await dse.press('Meta+d');
			await expect(modal.control('cond.input')).not.toBeExisting();
			await expect(modal.control('cond.add')).toBeFocused();
		});
		await dse.closeModals();
	});

	it('[COND-N10] with the dropdown already open and focus elsewhere in the window, a letter goes to the end of the typed text and focus returns to the input', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'hero');
		await dse.click(modal.control('cond.add'));
		await dse.type(modal.control('cond.input'), 'da');
		await dse.press('Tab'); // out of the input (page-level: not a manifest pair)
		await expect(modal.control('cond.input')).not.toBeFocused();
		await dse.press('z');
		await expect(modal.control('cond.input')).toBeFocused();
		await expect(modal.control('cond.input')).toHaveValue('daz');
		expect((await menuOptions()).names).toEqual(['Dazed', 'Add custom: "daz"']);
		await dse.closeModals();
	});

	it('[COND-N11] a letter on a focused Duration chip opens the search over the open editor, and Escape closes just the search and gives focus back to the chip; a second Escape closes the window', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'hero');
		await addByKeyboard(modal, 'daz');
		await dse.settle();
		await dse.press('Escape', modal.control('cond.input')); // the dropdown a pick keeps open
		await dse.click(modal.control('cond.edit', { nth: 0 }));
		await dse.waitForWrite(TRACKER, () => dse.click(modal.control('cond.duration', { nth: 1 }))); // End of Turn: the chip keeps focus
		await expect(modal.control('cond.duration', { nth: 1 })).toBeFocused();
		await dse.press('d'); // page-level: the chip is the recipient, and it is not a manifest pair
		await expect(modal.control('cond.input')).toBeFocused();
		await expect(modal.control('cond.input')).toHaveValue('d');
		await expect(modal.control('cond.duration', { nth: 1 })).toBeExisting(); // the editor stays open under the search
		await dse.press('Escape', modal.control('cond.input'));
		await expect(modal.control('cond.input')).not.toBeExisting();
		await expect(modal.root).toBeExisting();
		await expect(modal.control('cond.duration', { nth: 1 })).toBeFocused();
		await dse.press('Escape'); // the window is second
		await expect(modal.root).not.toBeExisting();
	});
});

describe('conditions-modal: tickets that reach it from outside', () => {
	knownBug('SC-384', '[COND-N04] in Live Preview the window stays open when the write it caused lands', async () => {
		await dse.openNote(TRACKER, { mode: 'live-preview' });
		const modal = await openFrom(dse.block(INIT), 'hero');
		await addByKeyboard(modal, 'daz');
		await dse.settle();
		await expect(modal.root).toBeExisting({ message: 'the Conditions window closed when its own write landed' });
		await dse.closeModals();
	}, { failsWith: /closed when its own write landed/ });

	knownBug('SC-355', '[COND-N05] the Conditions window is exposed to assistive technology as a dialog', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'hero');
		expect(await modal.root.getComputedRole()).toBe('dialog');
		await dse.closeModals();
	}, { failsWith: /Received: "generic"/ });
});
