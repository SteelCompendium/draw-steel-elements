// SC-408 pilot: initiative's stamina entry points (hero numeric control and row bar, creature
// detail-row numeric control and bar, roster-cell double-click) opening the StaminaEditModal
// and writing the edit back to the note. Initiative/tracker.md: hero Alice Alpha 30/30 and
// three Ogres 60/60 (cells 0-1..0-3). The Steel theme stands the numeric controls down
// visually (keyboard / assistive-tech write path), so those are reached with Tab + Enter and
// the pointer path is the row bar. Steel is the shipped default.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
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
	// has no Recoveries at all, so the button stays but is disabled with the reason, and a click does
	// nothing. The creature is hurt on purpose: at full Stamina the button was disabled anyway.
	it('[INIT-STAM-Q13] Spend Recovery is disabled for a creature, with the reason, and a click does nothing', async () => {
		await dse.openNote(HURT);
		await dse.click(dse.block(INIT).control('init.detail.bar'));
		const modal = await dse.modal('stamina-edit');
		const spend = modal.control('sedit.spend-recovery');
		await expect(spend).toHaveText('Spend Recovery');
		await expect(spend).toBeDisabled();
		await expect(spend).toHaveAttribute('aria-label', 'Spend Recovery: Creatures have no Recoveries');
		await dse.click(spend);
		await expectApplyLabel(modal, 'No Stamina Change');
		await dse.expectNoWrite(HURT, () => dse.click(modal.control('modal.close')));
	});

	// An initiative hero never has a Recoveries pool (the tracker keeps only Stamina), so it gets the same
	// relabelled, confirmed free heal as a pool-less bar. Damage first: Alice starts at full Stamina.
	it('[INIT-STAM-Q13H] an initiative hero has no pool: the relabelled heal asks first, and Confirm stages it', async () => {
		const root = await openTracker();
		await dse.click(root.control('init.hero.bar'));
		const modal = await dse.modal('stamina-edit');
		await applyAmount(modal, '15', 'sedit.damage');
		const heal = modal.control('sedit.spend-recovery');
		await expect(heal).toHaveText('Heal Recovery Value');
		await dse.click(heal);
		const dialog = await dse.modal('free-heal-confirm');
		await expectApplyLabel(modal, 'Lose 15 Stamina'); // nothing staged until Confirm
		await dse.click(dialog.control('sedit.free-heal.confirm'));
		await expectApplyLabel(modal, 'Lose 5 Stamina'); // -15 + a recovery value of 10
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, INIT).toMatchObject({ heroes: [{ name: 'Alice Alpha', current_stamina: 25 }] });
	});

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
			// The Steel layer stands the detail numeric down visually (a screen reader / keyboard write path), so
			// read its text as a property; the bar's number is what a player sees.
			await expect(root.control('init.detail.stamina')).toHaveElementProperty('textContent', '50/60');
			await expect(root.control({ css: '.dse-init__detail > .dse-init__bar .dse-stamina__ccur' })).toHaveText('50');
		},
	);
});
