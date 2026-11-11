// SC-436: the inline row editor (Icon, Duration, Color, Effect). Each control writes only its own field, once, and the
// editor stays open on the same row. Initiative/conditions.md: hero Bleeding (a plain string), Dazed (End of Turn, red,
// glow), Hexed (custom, nothing set), Slowed (legacy effect text "save ends"); Ogre #1 Grabbed, Prone (Save Ends).
// The pilot specs (conditions-pick-focus, conditions-dropdown-click) cover focus after a pick and the click-away close.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { CONDITIONS, INIT, focusedOption, iconChoices, modalRows, noteCondition, openConditionsModal, openFrom, pressedIn, pressedSwatches } from '../../driver/conditions';
import type { Row } from '../../driver/conditions';

const [BLEEDING, DAZED, HEXED, SLOWED] = [0, 1, 2, 3];
const DURATION = { removed: 0, eot: 1, saveEnds: 2, eoe: 3 };
const SWATCH = { red: 0, amber: 1, green: 2, blue: 3, purple: 4 };
const EFFECT = { static: 0, blink: 1, glow: 2, glowPulse: 3, breathing: 4, blurPulse: 5 };

/** Open the Conditions window on `row` of conditions.md and the editor of condition `index`. */
async function openEditor(index: number, row: Row = 'hero') {
	const { modal } = await openConditionsModal(CONDITIONS, row);
	await dse.click(modal.control('cond.edit', { nth: index }));
	await expect(modal.control('cond.swatch', { nth: 0 })).toBeExisting();
	return modal;
}

/** Click `control` once and expect exactly one write. */
async function pickOnce(modal: Awaited<ReturnType<typeof openEditor>>, control: string, nth: number): Promise<void> {
	const w = await dse.waitForWrite(CONDITIONS, () => dse.click(modal.control(control, { nth })));
	expect(w.count).toBe(1);
}

describe('conditions-modal: the editor shows each condition\'s current settings', () => {
	it('[COND-D01] opening an editor shows that row\'s duration, colour, effect and icon as pressed options, and writes nothing', async () => {
		await dse.openNote(CONDITIONS);
		const root = dse.block(INIT);
		await dse.expectNoWrite(CONDITIONS, async () => {
			const modal = await openFrom(root, 'hero');
			await dse.click(modal.control('cond.edit', { nth: DAZED }));
			expect(await pressedIn('Duration')).toEqual(['End of Turn']);
			expect(await pressedSwatches()).toEqual(['#c0392b']);
			expect(await pressedIn('Effect')).toEqual(['glow']);
			expect(await pressedIn('Condition icon')).toEqual(['Use default condition icon']);
			await dse.click(modal.control('cond.edit', { nth: SLOWED }));
			expect(await pressedIn('Duration')).toEqual(['Save Ends']); // the legacy text "save ends" still reads as a duration
			expect(await pressedIn('Effect')).toEqual(['static']);
			expect(await pressedSwatches()).toEqual([]);
			await dse.click(modal.control('modal.close'));
		});
	});
});

describe('conditions-modal: the icon picker', () => {
	it('[COND-D02] typing in the search narrows the choices (or says none match) without a write; a click on one sets the icon, keeps the query and moves nothing else', async () => {
		const modal = await openEditor(HEXED);
		await dse.expectNoWrite(CONDITIONS, async () => {
			await dse.type(modal.control('cond.icon-search'), 'flame');
			const labels = await iconChoices();
			expect(labels[0]).toBe('Use default condition icon');
			expect(labels).toContain('Icon: flame');
			await dse.type(modal.control('cond.icon-search'), 'zzqq');
			expect(await iconChoices()).toEqual(['Use default condition icon']);
			expect(await dse.page<string>(`document.querySelector('.dse-cond-icons__grid').textContent`)).toContain('No matching icons.');
			await dse.type(modal.control('cond.icon-search'), 'flame', { replace: true });
		});
		const flame = (await iconChoices()).indexOf('Icon: flame');
		await pickOnce(modal, 'cond.icon', flame);
		expect(await noteCondition(CONDITIONS, 'hero', HEXED)).toEqual({ key: 'hexed', icon: 'flame' });
		expect(await pressedIn('Condition icon')).toEqual(['Icon: flame']);
		expect(await focusedOption()).toEqual({ ctl: 'cond.icon', label: 'Icon: flame' });
		await expect(modal.control('cond.icon-search')).toHaveValue('flame');
		expect(await dse.page<string>(`document.querySelector('.dse-condal__row:nth-child(3) .dse-condal__glyph svg').getAttribute('class')`)).toContain('flame');
		await dse.closeModals();
	});

	it('[COND-D03] "Use default condition icon" removes the icon from the note again', async () => {
		const modal = await openEditor(HEXED);
		await pickOnce(modal, 'cond.icon', 1); // the first suggested icon
		expect(Object.keys(await noteCondition(CONDITIONS, 'hero', HEXED))).toContain('icon');
		await pickOnce(modal, 'cond.icon', 0);
		expect(await noteCondition(CONDITIONS, 'hero', HEXED)).toEqual({ key: 'hexed' });
		expect(await pressedIn('Condition icon')).toEqual(['Use default condition icon']);
		await dse.closeModals();
	});

	it('[COND-D04] Tab to a choice and Enter picks it: one write, focus stays on that choice, which is now pressed', async () => {
		const modal = await openEditor(HEXED);
		const choice = modal.control('cond.icon', { nth: 2 });
		await dse.tabTo(choice, 40);
		const label = (await iconChoices())[2];
		const w = await dse.waitForWrite(CONDITIONS, () => dse.press('Enter', choice));
		expect(w.count).toBe(1);
		expect(await focusedOption()).toEqual({ ctl: 'cond.icon', label });
		expect(await pressedIn('Condition icon')).toEqual([label]);
		expect((await noteCondition(CONDITIONS, 'hero', HEXED)).icon).toBe(label.replace('Icon: ', ''));
		await dse.closeModals();
	});
});

describe('conditions-modal: the duration chips', () => {
	it('[COND-D05] each duration chip writes its own value and badge; "Until removed" clears it (Hexed: none, then every chip in turn)', async () => {
		const modal = await openEditor(HEXED);
		await pickOnce(modal, 'cond.duration', DURATION.eot);
		expect(await noteCondition(CONDITIONS, 'hero', HEXED)).toEqual({ key: 'hexed', duration: 'eot' });
		expect(await pressedIn('Duration')).toEqual(['End of Turn']);
		expect((await modalRows())[HEXED].badges).toEqual(['EoT']);
		await pickOnce(modal, 'cond.duration', DURATION.saveEnds);
		expect(await noteCondition(CONDITIONS, 'hero', HEXED)).toEqual({ key: 'hexed', duration: 'save-ends' });
		expect((await modalRows())[HEXED].badges).toEqual(['Save Ends']);
		await pickOnce(modal, 'cond.duration', DURATION.eoe);
		expect(await noteCondition(CONDITIONS, 'hero', HEXED)).toEqual({ key: 'hexed', duration: 'eoe' });
		expect((await modalRows())[HEXED].badges).toEqual(['EoE']);
		await pickOnce(modal, 'cond.duration', DURATION.removed);
		expect(await noteCondition(CONDITIONS, 'hero', HEXED)).toEqual({ key: 'hexed' });
		expect(await pressedIn('Duration')).toEqual(['Until removed']);
		expect((await modalRows())[HEXED].badges).toEqual([]);
		await dse.closeModals();
	});

	it('[COND-D06] a duration pick keeps the condition\'s colour and effect (Dazed: End of Turn -> Save Ends)', async () => {
		const modal = await openEditor(DAZED);
		await pickOnce(modal, 'cond.duration', DURATION.saveEnds);
		expect(await noteCondition(CONDITIONS, 'hero', DAZED)).toEqual({ key: 'dazed', duration: 'save-ends', color: '#c0392b', effect: 'glow' });
		await dse.closeModals();
	});

	it('[COND-D07] an explicit duration pick on a legacy "save ends" effect text clears that text: "Until removed" really removes the duration', async () => {
		const modal = await openEditor(SLOWED);
		expect((await modalRows())[SLOWED].badges).toEqual(['Save Ends']);
		await pickOnce(modal, 'cond.duration', DURATION.removed);
		expect(await noteCondition(CONDITIONS, 'hero', SLOWED)).toEqual({ key: 'slowed' });
		expect((await modalRows())[SLOWED].badges).toEqual([]);
		expect(await pressedIn('Duration')).toEqual(['Until removed']);
		await dse.closeModals();
	});

	it('[COND-D08] on the creature row a duration pick lands on that creature\'s condition (Ogre #1 Prone: Save Ends -> End of Encounter)', async () => {
		const modal = await openEditor(1, 'creature');
		expect(await pressedIn('Duration')).toEqual(['Save Ends']);
		await pickOnce(modal, 'cond.duration', DURATION.eoe);
		expect(await noteCondition(CONDITIONS, 'creature', 1)).toEqual({ key: 'prone', duration: 'eoe' });
		expect(await noteCondition(CONDITIONS, 'creature', 0)).toEqual('grabbed'); // written as a plain name, still one
		await dse.closeModals();
	});
});

describe('conditions-modal: the colour swatches', () => {
	it('[COND-D09] a swatch click writes its hex and presses it; another swatch replaces it; a duration and effect set earlier stay', async () => {
		const modal = await openEditor(DAZED);
		await pickOnce(modal, 'cond.swatch', SWATCH.blue);
		expect(await noteCondition(CONDITIONS, 'hero', DAZED)).toEqual({ key: 'dazed', duration: 'eot', color: '#2874a6', effect: 'glow' });
		expect(await pressedSwatches()).toEqual(['#2874a6']);
		await pickOnce(modal, 'cond.swatch', SWATCH.purple);
		expect((await noteCondition(CONDITIONS, 'hero', DAZED)).color).toBe('#7d3c98');
		expect(await pressedSwatches()).toEqual(['#7d3c98']);
		await dse.closeModals();
	});

	it('[COND-D10] on a condition with no colour a swatch click sets one (Hexed -> amber); the row\'s glyph takes the colour', async () => {
		const modal = await openEditor(HEXED);
		await pickOnce(modal, 'cond.swatch', SWATCH.amber);
		expect(await noteCondition(CONDITIONS, 'hero', HEXED)).toEqual({ key: 'hexed', color: '#b9770e' });
		expect(await dse.page<string>(`document.querySelector('.modal-container .dse-condal__row:nth-child(3) .dse-condal__glyph').style.getPropertyValue('--dse-condition-color')`)).toBe('#b9770e');
		await dse.closeModals();
	});

	it('[COND-D11] Tab to the custom colour input and Enter opens the browser\'s colour chooser: nothing is written and the window stays up', async () => {
		const modal = await openEditor(HEXED);
		const custom = modal.control('cond.color-custom');
		await dse.tabTo(custom, 60);
		await dse.expectNoWrite(CONDITIONS, () => dse.press('Enter', custom));
		await expect(modal.root).toBeExisting();
		expect(await noteCondition(CONDITIONS, 'hero', HEXED)).toEqual({ key: 'hexed' });
		await dse.closeModals();
	});

	// Not a manifest drive: the input is never clicked or pressed through `dse`, so nothing is recorded for `cond.color-custom`.
	it('[COND-D17] the colour chooser\'s commit (the chooser itself is out of CDP\'s reach, so its input + change events are dispatched page-side) writes the colour once, marks the pipette and leaves focus on the input', async () => {
		const modal = await openEditor(HEXED);
		await dse.tabTo(modal.control('cond.color-custom'), 60);
		const w = await dse.waitForWrite(CONDITIONS, () =>
			dse.page(`(() => {
				const el = document.activeElement;
				el.value = '#123456';
				el.dispatchEvent(new Event('input', { bubbles: true }));
				el.dispatchEvent(new Event('change', { bubbles: true }));
				return true;
			})()`),
		);
		expect(w.count).toBe(1);
		expect(await noteCondition(CONDITIONS, 'hero', HEXED)).toEqual({ key: 'hexed', color: '#123456' });
		expect(await dse.page<boolean>(`document.querySelector('.modal-container .dse-swatch--custom').hasAttribute('data-selected')`)).toBe(true);
		expect(await dse.page<string>(`document.activeElement.getAttribute('aria-label')`)).toBe('Custom condition color #123456, selected');
		expect(await focusedOption()).toEqual({ ctl: 'cond.color-custom', label: 'Custom condition color #123456, selected' });
		expect(await pressedSwatches()).toEqual([]);
		await dse.closeModals();
	});
});

describe('conditions-modal: the effect chips', () => {
	it('[COND-D12] an effect chip writes its effect and a badge; "static" clears it; the glyph carries the effect class (Hexed)', async () => {
		const modal = await openEditor(HEXED);
		await pickOnce(modal, 'cond.effect', EFFECT.glowPulse);
		expect(await noteCondition(CONDITIONS, 'hero', HEXED)).toEqual({ key: 'hexed', effect: 'glow-pulse' });
		expect(await pressedIn('Effect')).toEqual(['glow-pulse']);
		expect((await modalRows())[HEXED].badges).toEqual(['glow-pulse']);
		expect(await dse.page<boolean>(`document.querySelector('.modal-container .dse-condal__row:nth-child(3) .dse-condal__glyph').classList.contains('condition-effect-glow-pulse')`)).toBe(true);
		await pickOnce(modal, 'cond.effect', EFFECT.static);
		expect(await noteCondition(CONDITIONS, 'hero', HEXED)).toEqual({ key: 'hexed' });
		expect(await pressedIn('Effect')).toEqual(['static']);
		expect((await modalRows())[HEXED].badges).toEqual([]);
		await dse.closeModals();
	});

	it('[COND-D13] an effect pick keeps the duration and colour (Dazed: glow -> blink)', async () => {
		const modal = await openEditor(DAZED);
		await pickOnce(modal, 'cond.effect', EFFECT.blink);
		expect(await noteCondition(CONDITIONS, 'hero', DAZED)).toEqual({ key: 'dazed', duration: 'eot', color: '#c0392b', effect: 'blink' });
		await dse.closeModals();
	});

	it('[COND-D14] an effect pick on a legacy "save ends" effect text moves that into the duration first, so it is not lost (Slowed -> glow)', async () => {
		const modal = await openEditor(SLOWED);
		await pickOnce(modal, 'cond.effect', EFFECT.glow);
		expect(await noteCondition(CONDITIONS, 'hero', SLOWED)).toEqual({ key: 'slowed', duration: 'save-ends', effect: 'glow' });
		expect(await pressedIn('Duration')).toEqual(['Save Ends']);
		await dse.closeModals();
	});

	it('[COND-D15] a plain string condition becomes an object on its first edit: Bleeding -> Save Ends is written as { key, duration }', async () => {
		const modal = await openEditor(BLEEDING);
		await pickOnce(modal, 'cond.duration', DURATION.saveEnds);
		expect(await noteCondition(CONDITIONS, 'hero', BLEEDING)).toEqual({ key: 'bleeding', duration: 'save-ends' });
		await dse.closeModals();
	});

	it('[COND-D16] Tab to an effect chip and Enter writes once (the keyboard twin of the click)', async () => {
		const modal = await openEditor(HEXED);
		const chip = modal.control('cond.effect', { nth: EFFECT.breathing });
		await dse.tabTo(chip, 60);
		const w = await dse.waitForWrite(CONDITIONS, () => dse.press('Enter', chip));
		expect(w.count).toBe(1);
		expect(await noteCondition(CONDITIONS, 'hero', HEXED)).toEqual({ key: 'hexed', effect: 'breathing' });
		await dse.closeModals();
	});
});
