// SC-408 pilot: initiative's stamina entry points (hero numeric control and row bar, creature
// detail-row numeric control and bar, roster-cell double-click) opening the StaminaEditModal
// and writing the edit back to the note. Initiative/tracker.md: hero Alice Alpha 30/30 and
// three Ogres 60/60 (cells 0-1..0-3). The Steel theme stands the numeric controls down
// visually (keyboard / assistive-tech write path), so those are reached with Tab + Enter and
// the pointer path is the row bar. Steel is the shipped default.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { applyAmount, applyAndWrite, expectApplyLabel } from '../../driver/stamina';

const NOTE = 'Initiative/tracker.md';
const HURT = 'Initiative/hurt.md'; // Ogre #1 at 20/60, Ogre #2 at 60/60
const INIT = 'ds-initiative';

type Scope = ReturnType<typeof dse.block>;

async function openTracker(): Promise<Scope> {
	await dse.openNote(NOTE);
	return dse.block(INIT);
}

/** Reach a numeric control the way a keyboard user does, then activate it. */
async function enterNumeric(root: Scope, id: 'init.hero.stamina' | 'init.detail.stamina') {
	const control = root.control(id);
	await dse.tabTo(control, 40);
	await dse.press('Enter', control);
	return dse.modal('stamina-edit');
}

const modalTitle = (modal: Awaited<ReturnType<typeof dse.modal>>) => modal.control({ css: '.dse-modal__title-text' });

describe('initiative: heroes', () => {
	it('[INIT-STAM-E07] the hero numeric control (keyboard) opens a hero modal; Apply writes the hero and repaints the row', async () => {
		const root = await openTracker();
		const modal = await enterNumeric(root, 'init.hero.stamina');
		await expect(modalTitle(modal)).toHaveText('Alice Alpha Stamina', { ignoreCase: true });
		await applyAmount(modal, '5', 'sedit.damage');
		await expectApplyLabel(modal, 'Lose 5 Stamina');
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, INIT).toMatchObject({ heroes: [{ name: 'Alice Alpha', current_stamina: 25, max_stamina: 30 }] });
		await expect(root.control({ css: '.dse-init__health .dse-init__stamina' })).toHaveText('25/30');
	});

	it('[INIT-STAM-E08] clicking the hero row bar opens the same modal; Healing is capped at max and the bar repaints', async () => {
		const root = await openTracker();
		await dse.click(root.control('init.hero.bar'));
		const modal = await dse.modal('stamina-edit');
		await expect(modalTitle(modal)).toHaveText('Alice Alpha Stamina', { ignoreCase: true });
		await applyAmount(modal, '8', 'sedit.damage');
		await applyAndWrite(modal, NOTE);
		await dse.click(root.control('init.hero.bar'));
		const again = await dse.modal('stamina-edit');
		await applyAmount(again, '99', 'sedit.healing');
		await expectApplyLabel(again, 'Gain 8 Stamina');
		await applyAndWrite(again, NOTE);
		await dse.expectNoteBlock(NOTE, INIT).toMatchObject({ heroes: [{ current_stamina: 30 }] });
		await expect(root.control({ css: '.dse-init__row > .dse-init__bar .dse-stamina__ccur' })).toHaveText('30');
	});
});

describe('initiative: creatures', () => {
	it('[INIT-STAM-E09] the detail-row numeric control (keyboard) opens a creature modal; Apply writes that instance and repaints detail and cell', async () => {
		const root = await openTracker();
		const modal = await enterNumeric(root, 'init.detail.stamina');
		await expect(modalTitle(modal)).toHaveText('Ogre Stamina', { ignoreCase: true });
		await applyAmount(modal, '10', 'sedit.damage');
		await expectApplyLabel(modal, 'Lose 10 Stamina'); // a creature has no temp here and no dying floor
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, INIT).toMatchObject({
			enemy_groups: [{ creatures: [{ instances: [{ id: 1, current_stamina: 50 }, { id: 2, current_stamina: 60 }, { id: 3, current_stamina: 60 }] }] }],
		});
		await expect(root.control('init.detail.stamina')).toHaveText('50/60');
		await expect(root.control({ css: '.dse-init__cell[data-instance-key="0-1"] .dse-init__cell-stamina' })).toHaveText('50/60');
	});

	it('[INIT-STAM-E10] clicking the detail-row bar opens the creature modal; a creature dies at 0, so Kill floors at 0', async () => {
		const root = await openTracker();
		await dse.click(root.control('init.detail.bar'));
		const modal = await dse.modal('stamina-edit');
		await dse.click(modal.control('sedit.kill'));
		await expectApplyLabel(modal, 'Lose 60 Stamina'); // creature floor is 0, not a hero's -max/2
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, INIT).toMatchObject({
			enemy_groups: [{ creatures: [{ instances: [{ id: 1, current_stamina: 0 }, { id: 2, current_stamina: 60 }, { id: 3, current_stamina: 60 }] }] }],
		});
	});

	it('[INIT-STAM-E21] the stood-down numeric control does not cover the row bar: a real press at the bar centre hits the bar', async () => {
		const root = await openTracker();
		const bar = root.control('init.detail.bar');
		await bar.waitForDisplayed();
		const hit = await dse.page<string | null>(`(() => {
			const bar = document.querySelector('.markdown-reading-view [data-dse-control="init.detail.bar"]');
			const r = bar.getBoundingClientRect();
			return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null;
		})()`);
		expect(hit).toBe('init.detail.bar');
		await dse.click(bar);
		const modal = await dse.modal('stamina-edit');
		await dse.expectNoWrite(NOTE, () => dse.click(modal.control('modal.close')));
	});

	it('[INIT-STAM-E11] a single click on a roster cell selects that instance: the detail row switches and the selection is saved', async () => {
		const root = await openTracker();
		const cell = root.control('init.cell.stamina', { nth: 1 });
		const w = await dse.waitForWrite(NOTE, () => dse.click(cell));
		expect(w.count).toBe(1);
		await expect(root.control('init.detail.stamina')).toHaveAttribute('aria-label', 'Edit stamina: Ogre #2');
		await dse.expectNoteBlock(NOTE, INIT).toMatchObject({ enemy_groups: [{ selectedInstanceKey: '0-2' }] });
	});

	// E20 / S1: a REAL double-click is press, release, press, release - the first click selects the
	// cell and schedules a debounced write, the second opens the modal. That selection write lands
	// (and the view is adopted) while the modal is open; the modal must stay open and edit the
	// instance that was double-clicked.
	it('[INIT-STAM-E20] a real double-click on a roster cell opens the modal for THAT instance, and the selection write does not disturb it', async () => {
		const root = await openTracker();
		await dse.dblclick(root.control('init.cell.stamina', { nth: 1 }));
		const modal = await dse.modal('stamina-edit');
		await expect(modalTitle(modal)).toHaveText('Ogre Stamina', { ignoreCase: true });
		await dse.settle(); // the selection write (and any rebuild) lands now, with the modal open
		await expect(modal.root).toBeExisting();
		await dse.expectNoteBlock(NOTE, INIT).toMatchObject({ enemy_groups: [{ selectedInstanceKey: '0-2' }] });
		await applyAmount(modal, '7', 'sedit.damage');
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, INIT).toMatchObject({
			enemy_groups: [{ creatures: [{ instances: [{ id: 1, current_stamina: 60 }, { id: 2, current_stamina: 53 }, { id: 3, current_stamina: 60 }] }] }],
		});
		await expect(root.control({ css: '.dse-init__cell[data-instance-key="0-2"] .dse-init__cell-stamina' })).toHaveText('53/60');
	});

	// Q13 / S1 B5, ruled by Scott 2026-10-18 (SC-432): "disable Spend Recovery for creatures". A creature
	// has no Recoveries at all, yet today Spend Recovery heals it for free, with no limit (20/60 -> 60/60
	// in three presses). The creature is hurt on purpose: at full Stamina the button is disabled anyway.
	knownBug(
		'SC-432',
		'[INIT-STAM-Q13] Spend Recovery is disabled for a creature',
		async () => {
			await dse.openNote(HURT);
			await dse.click(dse.block(INIT).control('init.detail.bar'));
			const modal = await dse.modal('stamina-edit');
			await expect(modal.control('sedit.spend-recovery')).toBeDisabled({ wait: 1500, message: 'Spend Recovery should be disabled for a creature' });
			await dse.click(modal.control('modal.close'));
		},
		{ failsWith: /Spend Recovery should be disabled for a creature/ },
	);

	// B2 / S1 (SC-426, fixed): a roster-cell edit of the instance shown in the detail row repaints the
	// detail row too (number, bar and state chip), not just the cell. The detail row follows the edit.
	it(
		'[INIT-STAM-B2] a roster-cell edit of the instance shown in the detail row updates the detail readout too',
		async () => {
			const root = await openTracker();
			await dse.dblclick(root.control('init.cell.stamina', { nth: 0 }));
			const modal = await dse.modal('stamina-edit');
			await applyAmount(modal, '10', 'sedit.damage');
			await applyAndWrite(modal, NOTE);
			await dse.settle();
			await dse.expectNoteBlock(NOTE, INIT).toMatchObject({
				enemy_groups: [{ creatures: [{ instances: [{ id: 1, current_stamina: 50 }, { id: 2, current_stamina: 60 }, { id: 3, current_stamina: 60 }] }] }],
			});
			await expect(root.control({ css: '.dse-init__cell[data-instance-key="0-1"] .dse-init__cell-stamina' })).toHaveText('50/60');
			await expect(root.control('init.detail.stamina')).toHaveText('50/60');
		},
	);
});
