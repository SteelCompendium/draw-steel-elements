// SC-408 P2b — L1 (jsdom) logic matrix for the Recoveries surfaces that sit next to the
// stamina modal on ds-stamina: the strip's Catch Breath button and the ALT stepper
// popover's own "Catch breath" button. Row ids ([R03], [R08], [R09]) are the S1
// inventory's (.superpowers/sdd/sc408/sc408-s1-stamina-inventory.md section 2).
//
// Known-bug convention (SC-408 ledger): a test of the CORRECT behaviour that fails today
// because of a filed bug is a `test.failing` citing the ticket; it fails once the bug is
// fixed so the marker gets removed. (SC-428 flipped this file's markers to plain tests.)
import { ElementPipeline } from '../../../src/framework/pipeline';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { staminaBarElement } from '../../../src/elements/stamina-bar/definition';
import { Notice } from '../../mocks/obsidian';
import { lastWrite, makeDeps, makeHost } from '../_staminaHarness';

afterEach(() => {
	jest.useRealTimers();
	document.body.innerHTML = '';
	Notice.notices.length = 0;
});

/** max 48 -> recovery value floor(48/3) = 16. */
function yaml(current: number, recoveries: number, temp = 0): string {
	return [`max_stamina: 48`, `current_stamina: ${current}`, `temp_stamina: ${temp}`, `recoveries: ${recoveries}`, `recoveries_max: 10`].join('\n');
}

async function mount(source: string, o: { popover?: boolean; canPersist?: boolean } = {}) {
	jest.useFakeTimers();
	const deps = makeDeps();
	if (o.popover) await deps.prefs.set('staminaRecoveryPopover', true);
	const host = makeHost('ds-stam', o.canPersist === false ? { canPersist: false } : {});
	await new ElementPipeline(deps).run(staminaBarElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { root, host };
}

const catchBreathBtn = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('button:has([data-icon="wind"])')!;
const popoverCatchBreath = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('.dse-stamina-rec__pop-cb');
const openPopover = (root: HTMLElement) => (root.querySelector('.dse-stamina-rec__pips') as HTMLElement).click();
const pipsRow = (root: HTMLElement) => root.querySelector<HTMLElement>('.dse-stamina-rec__pips')!;
const recoveriesOf = (written: string | null) => written?.match(/recoveries: (\d+)/)?.[1] ?? null;
const staminaOf = (written: string | null) => written?.match(/current_stamina: (-?\d+)/)?.[1] ?? null;

describe('[R01][R02] Catch Breath button: enabled state and effect across positions (ds-stamina, recovery value 16)', () => {
	type Case = { name: string; cur: number; rec: number; enabled: boolean; healed?: number };
	const cases: Case[] = [
		{ name: 'mid stamina, Recoveries left', cur: 31, rec: 6, enabled: true, healed: 16 },
		{ name: 'winded (<= 24) still allowed', cur: 20, rec: 6, enabled: true, healed: 16 },
		{ name: 'one Recovery left', cur: 31, rec: 1, enabled: true, healed: 16 },
		{ name: 'heal is capped at the gap to max (40 -> 48)', cur: 40, rec: 6, enabled: true, healed: 8 },
		{ name: 'zero Recoveries', cur: 31, rec: 0, enabled: false },
		{ name: 'dying at exactly 0', cur: 0, rec: 6, enabled: false },
		{ name: 'dying below 0', cur: -3, rec: 6, enabled: false },
		{ name: 'dying with no Recoveries', cur: 0, rec: 0, enabled: false },
	];
	test.each(cases)('$name (cur $cur, rec $rec) -> enabled: $enabled', async ({ cur, rec, enabled, healed }) => {
		const { root, host } = await mount(yaml(cur, rec));
		const cb = catchBreathBtn(root);
		expect(cb.disabled).toBe(!enabled);
		cb.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		if (!enabled) {
			expect(host.replaceSource).not.toHaveBeenCalled();
			return;
		}
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(staminaOf(lastWrite(host))).toBe(String(cur + healed!));
		expect(recoveriesOf(lastWrite(host))).toBe(String(rec - 1));
	});
});

describe('[R03] Catch Breath at full Stamina must not spend a Recovery for +0 (SC-428)', () => {
	// The modal's own Spend Recovery real-disables in exactly this state ("Already at
	// maximum Stamina", SC-133 I3); SC-428 gave the strip's button the same gate + reason.
	test('[R03] 48/48 with 6 Recoveries: the button is disabled, with the reason as its tooltip', async () => {
		const { root } = await mount(yaml(48, 6));
		expect(catchBreathBtn(root).disabled).toBe(true);
		expect(catchBreathBtn(root).getAttribute('aria-label')).toBe('Already at maximum Stamina');
	});

	test('[R03] 48/48 with 6 Recoveries: a click writes nothing and keeps all 6', async () => {
		const { root, host } = await mount(yaml(48, 6));
		catchBreathBtn(root).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(recoveriesOf(lastWrite(host))).not.toBe('5');
	});

	test('[R03] 48/48 with 6 Recoveries: a click raises no "Caught breath: +0" toast', async () => {
		const { root } = await mount(yaml(48, 6));
		catchBreathBtn(root).click();
		expect(Notice.notices.filter((m) => m.includes('Caught breath'))).toEqual([]);
	});
});

describe('[R07][R08] popover editor: its "Catch breath" button honours the same availability as the strip button', () => {
	test('open popover: it carries the Catch breath button, enabled when the strip button is', async () => {
		const { root } = await mount(yaml(31, 6), { popover: true });
		openPopover(root);
		expect(popoverCatchBreath(root)).not.toBeNull();
		expect(popoverCatchBreath(root)!.disabled).toBe(false);
		expect(catchBreathBtn(root).disabled).toBe(false);
	});

	test('mid stamina + Recoveries: clicking it heals 16, spends 1, and closes the popover', async () => {
		const { root, host } = await mount(yaml(31, 6), { popover: true });
		openPopover(root);
		popoverCatchBreath(root)!.click();
		expect(root.querySelector('.dse-stamina-rec__pop')).toBeNull();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(staminaOf(lastWrite(host))).toBe('47');
		expect(recoveriesOf(lastWrite(host))).toBe('5');
	});

	test('0 Recoveries left: the popover button does nothing and writes nothing (view backstop; data stays safe)', async () => {
		const { root, host } = await mount(yaml(20, 0), { popover: true });
		openPopover(root);
		popoverCatchBreath(root)!.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});

	test('dying: the popover button does nothing and writes nothing (view backstop; data stays safe)', async () => {
		const { root, host } = await mount(yaml(0, 6), { popover: true });
		openPopover(root);
		popoverCatchBreath(root)!.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});

	test.each([
		{ name: '0 Recoveries left', cur: 20, rec: 0, reason: 'No Recoveries remaining' },
		{ name: 'dying (current 0)', cur: 0, rec: 6, reason: "Can't catch breath while dying" },
		{ name: 'dying (current below 0)', cur: -3, rec: 6, reason: "Can't catch breath while dying" },
		{ name: 'at full Stamina (48/48)', cur: 48, rec: 6, reason: 'Already at maximum Stamina' },
	])('[R08] popover Catch breath is real-disabled when $name, with the strip button\'s reason (SC-428)', async ({ cur, rec, reason }) => {
		const { root } = await mount(yaml(cur, rec), { popover: true });
		expect(catchBreathBtn(root).disabled).toBe(true); // the strip button is too
		openPopover(root);
		expect(popoverCatchBreath(root)!.disabled).toBe(true);
		// One source of truth: the same wording on both surfaces.
		expect(catchBreathBtn(root).getAttribute('aria-label')).toBe(reason);
		expect(popoverCatchBreath(root)!.getAttribute('aria-label')).toBe(reason);
	});

	test('[R08] recovery value 0 (max 2): both Catch Breath buttons are disabled and say the recovery value is 0 (SC-428)', async () => {
		const { root } = await mount(['max_stamina: 2', 'current_stamina: 1', 'recoveries: 3', 'recoveries_max: 3'].join('\n'), { popover: true });
		openPopover(root);
		expect(catchBreathBtn(root).disabled).toBe(true);
		expect(popoverCatchBreath(root)!.disabled).toBe(true);
		expect(catchBreathBtn(root).getAttribute('aria-label')).toBe('Recovery value is 0');
		expect(popoverCatchBreath(root)!.getAttribute('aria-label')).toBe('Recovery value is 0');
	});

	test('[R08] a disabled popover Catch breath click writes nothing and leaves the popover open (SC-428)', async () => {
		const { root, host } = await mount(yaml(48, 6), { popover: true });
		openPopover(root);
		popoverCatchBreath(root)!.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).not.toHaveBeenCalled();
		expect(root.querySelector('.dse-stamina-rec__pop')).not.toBeNull();
	});

	test('[R08] an OPEN popover follows the state in place: spending the last Recovery disables it, restoring one re-enables it and clears the reason (SC-428)', async () => {
		const { root } = await mount(yaml(31, 1), { popover: true });
		openPopover(root);
		const cb = popoverCatchBreath(root)!;
		expect(cb.disabled).toBe(false);
		expect(cb.getAttribute('aria-label')).toBeNull();
		root.querySelector<HTMLButtonElement>('button[aria-label="Spend a recovery"]')!.click(); // 1 -> 0
		expect(popoverCatchBreath(root)).toBe(cb); // same node: updated in place, not re-rendered
		expect(cb.disabled).toBe(true);
		expect(cb.getAttribute('aria-label')).toBe('No Recoveries remaining');
		root.querySelector<HTMLButtonElement>('button[aria-label="Restore a recovery"]')!.click(); // 0 -> 1
		expect(cb.disabled).toBe(false);
		expect(cb.getAttribute('aria-label')).toBeNull();
		expect(catchBreathBtn(root).getAttribute('aria-label')).toBe('Catch Breath');
	});
});

describe('[R09] Escape on the markers row', () => {
	test('closes an open popover', async () => {
		const { root } = await mount(yaml(31, 6), { popover: true });
		openPopover(root);
		expect(root.querySelector('.dse-stamina-rec__pop')).not.toBeNull();
		pipsRow(root).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(root.querySelector('.dse-stamina-rec__pop')).toBeNull();
	});

	test('with no popover open it changes nothing (no value change, no write)', async () => {
		const { root, host } = await mount(yaml(31, 6), { popover: true });
		pipsRow(root).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(pipsRow(root).getAttribute('aria-valuenow')).toBe('6');
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});

	test('with the popover setting OFF there is no popover to close and Escape is inert', async () => {
		const { root, host } = await mount(yaml(31, 6));
		pipsRow(root).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(root.querySelector('.dse-stamina-rec__pop')).toBeNull();
		expect(pipsRow(root).getAttribute('aria-valuenow')).toBe('6');
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});
