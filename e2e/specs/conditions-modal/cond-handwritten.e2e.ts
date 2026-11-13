// SC-586: three hand-written YAML spellings the Conditions window must show as what they are. Initiative/hand-written.md: hero
// Alice Alpha has Dazed with `color: teal` (a CSS name, not a hex; H01), Hexed with `icon: ""` (a blank icon, which draws the default
// glyph; H02) and Prone with `color: "oklch(0.6 0.1 180)"` (a CSS Color 4 spelling; H03). H01 and H03 are about the browser's own
// colour parsing, so only a real Obsidian can prove them; the jsdom matrix owns the other spellings (#rgb, rgb(), hsl(), alpha) and
// the unparseable case.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { HANDWRITTEN, noteCondition, openConditionsModal, pressedIn } from '../../driver/conditions';

const [DAZED, HEXED, PRONE] = [0, 1, 2];

describe('conditions-modal: hand-written colour and icon', () => {
	it('[COND-H01] a colour written as a CSS name (`teal`) opens the colour chooser at that colour (#008080), the pipette reads selected, and looking at it writes nothing', async () => {
		const { modal } = await openConditionsModal(HANDWRITTEN, 'hero');
		await dse.expectNoWrite(HANDWRITTEN, async () => {
			await dse.click(modal.control('cond.edit', { nth: DAZED }));
			await expect(modal.control('cond.swatch', { nth: 0 })).toBeExisting();
			const input = modal.control('cond.color-custom');
			await expect(input).toHaveValue('#008080');
			expect(await dse.page<string>(`document.querySelector('.modal-container .dse-swatch--custom input[type="color"]').getAttribute('aria-label')`)).toBe('Custom condition color teal, selected');
			expect(await dse.page<boolean>(`document.querySelector('.modal-container .dse-swatch--custom').hasAttribute('data-selected')`)).toBe(true);
			await dse.click(modal.control('modal.close'));
		});
		expect(await noteCondition(HANDWRITTEN, 'hero', DAZED)).toEqual({ key: 'dazed', color: 'teal' });
		expect(await dse.noteText(HANDWRITTEN)).toContain('      - key: dazed\n        color: teal\n');
	});

	it('[COND-H02] `icon: ""` draws the default glyph and "Use default condition icon" is the pressed choice, with no blank Icon chip; looking at it writes nothing', async () => {
		const { modal } = await openConditionsModal(HANDWRITTEN, 'hero');
		await dse.expectNoWrite(HANDWRITTEN, async () => {
			await dse.click(modal.control('cond.edit', { nth: HEXED }));
			await expect(modal.control('cond.icon', { nth: 0 })).toBeExisting();
			expect(await pressedIn('Condition icon')).toEqual(['Use default condition icon']);
			expect(await dse.page<string[]>(`Array.from(document.querySelectorAll('.modal-container [data-dse-control="cond.icon"]')).map((b) => b.getAttribute('aria-label')).filter((l) => l.trim() === 'Icon:')`)).toEqual([]);
			await dse.click(modal.control('modal.close'));
		});
		expect(await noteCondition(HANDWRITTEN, 'hero', HEXED)).toEqual({ key: 'hexed', icon: '' });
		expect(await dse.noteText(HANDWRITTEN)).toContain('      - key: hexed\n        icon: ""\n');
	});

	it('[COND-H03] a colour written in a CSS Color 4 spelling (`oklch(0.6 0.1 180)`) opens the colour chooser at the sRGB colour the row draws (#239382), the pipette reads selected, and looking at it writes nothing', async () => {
		const { modal } = await openConditionsModal(HANDWRITTEN, 'hero');
		await dse.expectNoWrite(HANDWRITTEN, async () => {
			await dse.click(modal.control('cond.edit', { nth: PRONE }));
			await expect(modal.control('cond.swatch', { nth: 0 })).toBeExisting();
			await expect(modal.control('cond.color-custom')).toHaveValue('#239382');
			expect(await dse.page<boolean>(`document.querySelector('.modal-container .dse-swatch--custom').hasAttribute('data-selected')`)).toBe(true);
			await dse.click(modal.control('modal.close'));
		});
		expect(await noteCondition(HANDWRITTEN, 'hero', PRONE)).toEqual({ key: 'prone', color: 'oklch(0.6 0.1 180)' });
	});
});
