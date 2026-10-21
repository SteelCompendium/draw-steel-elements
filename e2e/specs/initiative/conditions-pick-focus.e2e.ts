// SC-468: picking an option in a condition row's inline editor (duration chip, color swatch, effect
// chip) re-renders the list. Focus used to be sent to the row's cog afterwards, yanking a keyboard
// user out of the group; it now stays on the (rebuilt) option they pressed. A pointer pick must not
// grow a focus ring it never had (programmatic focus() after a mouse click is not :focus-visible).
// SC-361: the picked swatch shows BOTH marks at once - the shared kit ring (focus, outside) and the check (selection, inside).
// Initiative/tracker.md: hero Alice Alpha plus three Ogres; the first "Add Condition" button is the hero's.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import type { Scope } from '../../driver/dse';

const NOTE = 'Initiative/tracker.md';
const INIT = 'ds-initiative';
const SWATCH_GREEN = 2; // Red, Amber, Green, Blue, Purple
const EFFECT_GLOW = 2; // static, blink, glow, glow-pulse, breathing, blur-pulse
const DURATION_SAVE_ENDS = 2; // Until removed, End of Turn, Save Ends, End of Encounter

/** Open the hero's Conditions window, add Dazed with the keyboard and open its inline editor with the mouse. */
async function openDazedEditor(): Promise<Scope> {
	await dse.openNote(NOTE);
	await dse.click(dse.block(INIT).control('init.cond.add'));
	const modal = await dse.modal('conditions');
	await dse.click(modal.control('cond.add'));
	await dse.type(modal.control('cond.input'), 'daz');
	await dse.press('Enter', modal.control('cond.input'));
	// The Add dropdown is still open here (a pick keeps it open); the cog click closes it (SC-474).
	await dse.click(modal.control('cond.edit'));
	await expect(modal.control('cond.swatch', { nth: 0 })).toBeExisting();
	return modal;
}

/** What holds focus: the option's group + label, its pressed state, and whether it draws the ring. */
const focusState = () =>
	dse.page<{ ctl: string | null; group: string | null; label: string | null; pressed: string | null; ring: boolean }>(`(() => {
		const a = document.activeElement;
		return {
			ctl: a?.getAttribute('data-dse-control') ?? null,
			group: a?.closest('[role="group"]')?.getAttribute('aria-label') ?? null,
			label: a?.getAttribute('aria-label') ?? null,
			pressed: a?.getAttribute('aria-pressed') ?? null,
			ring: !!a && a.matches(':focus-visible'),
		};
	})()`);

describe('conditions-modal: focus after a pick in the row editor (SC-468)', () => {
	it('[COND-E02] Enter on a duration chip, a swatch and an effect chip each keeps focus on the option just pressed, with a ring', async () => {
		const modal = await openDazedEditor();

		const duration = modal.control('cond.duration', { nth: DURATION_SAVE_ENDS });
		await dse.tabTo(duration, 80);
		await dse.waitForWrite(NOTE, () => dse.press('Enter', duration));
		expect(await focusState()).toEqual({ ctl: 'cond.duration', group: 'Duration', label: 'Save Ends', pressed: 'true', ring: true });

		const swatch = modal.control('cond.swatch', { nth: SWATCH_GREEN });
		await dse.tabTo(swatch, 20);
		await dse.waitForWrite(NOTE, () => dse.press('Enter', swatch));
		expect(await focusState()).toEqual({ ctl: 'cond.swatch', group: 'Color', label: 'Color #1e8449', pressed: 'true', ring: true });

		const effect = modal.control('cond.effect', { nth: EFFECT_GLOW });
		await dse.tabTo(effect, 20);
		await dse.waitForWrite(NOTE, () => dse.press('Enter', effect));
		expect(await focusState()).toEqual({ ctl: 'cond.effect', group: 'Effect', label: 'glow', pressed: 'true', ring: true });

		await dse.settle();
		await dse.expectNoteBlock(NOTE, INIT).toMatchObject({
			heroes: [{ name: 'Alice Alpha', conditions: [{ key: 'dazed', duration: 'save-ends', color: '#1e8449', effect: 'glow' }] }],
		});
		await dse.closeModals();
	});

	it('[COND-E03] a mouse click on a swatch also leaves focus on that swatch, and draws no focus ring', async () => {
		const modal = await openDazedEditor();
		await dse.waitForWrite(NOTE, () => dse.click(modal.control('cond.swatch', { nth: SWATCH_GREEN })));
		expect(await focusState()).toEqual({ ctl: 'cond.swatch', group: 'Color', label: 'Color #1e8449', pressed: 'true', ring: false });
		await dse.closeModals();
	});

	it('[COND-E07] after a keyboard pick the focused, selected swatch shows both the focus ring and the check', async () => {
		const modal = await openDazedEditor();
		const swatch = modal.control('cond.swatch', { nth: SWATCH_GREEN });
		// An unselected, unfocused swatch has neither mark.
		const marks = () =>
			dse.page<{ ring: string; pressed: string | null; checkContent: string; checkImage: string }>(`(() => {
				const a = document.activeElement;
				const o = getComputedStyle(a);
				const c = getComputedStyle(a, '::after');
				return { ring: o.outlineStyle + ' ' + o.outlineWidth, pressed: a.getAttribute('aria-pressed'), checkContent: c.content, checkImage: c.backgroundImage };
			})()`);
		await dse.tabTo(swatch, 80);
		const before = await marks();
		expect(before.pressed).toBe('false');
		expect(before.ring).toBe('solid 2px'); // focused: the ring
		expect(before.checkContent).toBe('none'); // ...but not selected: no check

		await dse.waitForWrite(NOTE, () => dse.press('Enter', swatch));
		const after = await marks();
		expect(after.pressed).toBe('true');
		expect(after.ring).toBe('solid 2px'); // still focused: the ring
		expect(after.checkContent).not.toBe('none'); // ...and selected: the check
		expect(after.checkImage).toContain('url(');
		await dse.closeModals();
	});
});
