// SC-437 [M]: the Malice stepper, the quick-add row and the log disclosure. The value tables (stepper sequences, every rejected and
// accepted quick-add) live in the jsdom matrix (test/dom/elements/initiative-matrix.test.ts); here real pointer and key events drive
// each control and the note + screen are read. Initiative/tracker.md: Malice 3, no log. Initiative/rich.md: Malice 4, round_gain 2,
// one log entry ("Opening Malice", +3, round 1).
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';

const MIN = 'Initiative/tracker.md';
const RICH = 'Initiative/rich.md';
const INIT = 'ds-initiative';

type Scope = ReturnType<typeof dse.block>;
const shown = (root: Scope) => root.control({ css: '.dse-init__malice-value' });
const hint = (root: Scope) => root.control({ css: '.dse-init__malice-quickadd-hint' });

async function open(note = MIN): Promise<Scope> {
	await dse.openNote(note);
	return dse.block(INIT);
}

/** Type an amount and a label into the quick-add row (the fields are real inputs: pointer-click to focus, then keys). */
async function fill(root: Scope, amount: string, label: string): Promise<void> {
	await dse.type(root.control('init.malice.quickadd.amount'), amount, { replace: true });
	await dse.type(root.control('init.malice.quickadd.label'), label, { replace: true });
}

const maliceOf = async (note: string): Promise<{ value: number; log?: Array<{ round: number; amount: number; label: string }> }> =>
	((await dse.expectNoteBlock(note, INIT).value()) as { malice: { value: number; log?: Array<{ round: number; amount: number; label: string }> } }).malice;

describe('initiative: the Malice stepper', () => {
	it('[INIT-M01] - - + from 3 gives 2: the screen follows at once and the note holds the final value', async () => {
		const root = await open();
		await expect(shown(root)).toHaveElementProperty('textContent', 'Malice: 3');
		await dse.waitForWrite(MIN, async () => {
			await dse.click(root.control('init.malice.dec'));
			await dse.click(root.control('init.malice.dec'));
			await dse.click(root.control('init.malice.inc'));
		});
		await expect(shown(root)).toHaveElementProperty('textContent', 'Malice: 2');
		expect((await maliceOf(MIN)).value).toBe(2);
		await expect(root.control('init.malice.dec')).toBeDisplayed(); // both buttons survive every press (CB-7)
		await expect(root.control('init.malice.inc')).toBeDisplayed();
	});

	it('[INIT-M02] + raises Malice from 4 to 5 and writes it', async () => {
		const root = await open(RICH);
		await dse.waitForWrite(RICH, () => dse.click(root.control('init.malice.inc')));
		await expect(shown(root)).toHaveElementProperty('textContent', 'Malice: 5');
		expect((await maliceOf(RICH)).value).toBe(5);
	});

	knownBug(
		'SC-577',
		'[INIT-M07] the Malice stepper stops at 0: pressing - four times from 3 leaves "Malice: 0" (never negative)',
		async () => {
			const root = await open();
			for (let i = 0; i < 4; i++) await dse.click(root.control('init.malice.dec'));
			await expect(shown(root)).toHaveElementProperty('textContent', 'Malice: 0');
		},
		{ failsWith: /Malice: 0/ },
	);
});

describe('initiative: the Malice quick-add row', () => {
	it('[INIT-M03] amount 3, label "Feytouched", the Add button: Malice 6, one log entry, the fields clear', async () => {
		const root = await open();
		await fill(root, '3', 'Feytouched');
		const w = await dse.waitForWrite(MIN, () => dse.click(root.control('init.malice.quickadd.add')));
		expect(w.count).toBe(1);
		const m = await maliceOf(MIN);
		expect(m.value).toBe(6);
		expect(m.log).toEqual([{ round: 1, amount: 3, label: 'Feytouched' }]);
		await expect(shown(root)).toHaveElementProperty('textContent', 'Malice: 6');
		await expect(root.control('init.malice.quickadd.amount')).toHaveValue('');
		await expect(root.control('init.malice.log')).toHaveText('Malice log · 1 entry');
	});

	it('[INIT-M04] Enter in the label field submits, and so does Enter in the amount field', async () => {
		const root = await open();
		await fill(root, '2', 'First');
		await dse.waitForWrite(MIN, () => dse.press('Enter', root.control('init.malice.quickadd.label')));
		await dse.type(root.control('init.malice.quickadd.label'), 'Second', { replace: true });
		await dse.type(root.control('init.malice.quickadd.amount'), '-1', { replace: true }); // last, so the amount field holds focus
		await dse.waitForWrite(MIN, () => dse.press('Enter', root.control('init.malice.quickadd.amount')));
		const m = await maliceOf(MIN);
		expect(m.value).toBe(4);
		expect(m.log).toEqual([{ round: 1, amount: 2, label: 'First' }, { round: 1, amount: -1, label: 'Second' }]);
		await expect(shown(root)).toHaveElementProperty('textContent', 'Malice: 4');
	});

	it('[INIT-M05] a rejected submit writes nothing, says why in words, and puts focus on the offending field', async () => {
		const root = await open();
		await dse.expectNoWrite(MIN, () => dse.click(root.control('init.malice.quickadd.add')));
		await expect(hint(root)).toHaveText('Amount required');
		await expect(root.control('init.malice.quickadd.amount')).toHaveAttribute('aria-invalid', 'true');
		await expect(root.control('init.malice.quickadd.amount')).toBeFocused();
		await fill(root, '2', '');
		await dse.expectNoWrite(MIN, () => dse.click(root.control('init.malice.quickadd.add')));
		await expect(hint(root)).toHaveText('Label required');
		await expect(root.control('init.malice.quickadd.label')).toBeFocused();
		await dse.type(root.control('init.malice.quickadd.label'), 'Ok', { replace: true }); // the first keystroke clears the flag
		await expect(hint(root)).toHaveText('');
		await expect(root.control('init.malice.quickadd.label')).not.toHaveAttribute('aria-invalid', 'true');
	});

	it('[INIT-M08] a typed "+3" is accepted as 3 (the log itself shows gains as "+3")', async () => {
		const root = await open();
		await fill(root, '+3', 'Feytouched');
		await dse.waitForWrite(MIN, () => dse.click(root.control('init.malice.quickadd.add')));
		expect((await maliceOf(MIN)).value).toBe(6);
	});

	knownBug(
		'SC-578',
		'[INIT-M09] a quick-add that the pool clamps logs what it did: the entry matches the change in Malice, or says it was capped',
		async () => {
			const root = await open(); // Malice 3
			await fill(root, '-5', 'Spend');
			await dse.waitForWrite(MIN, () => dse.click(root.control('init.malice.quickadd.add')));
			const m = await maliceOf(MIN);
			const entry = m.log![0];
			expect(m.value).toBe(0);
			expect(entry.amount === m.value - 3 || entry.label !== 'Spend').toBe(true);
		},
		{ failsWith: /Expected: true/ },
	);
});

describe('initiative: the Malice log disclosure', () => {
	it('[INIT-M06] the header opens and closes the entry list; opening it writes nothing', async () => {
		const root = await open(RICH);
		const header = root.control('init.malice.log');
		await expect(header).toHaveText('Malice log · 1 entry');
		await expect(header).toHaveAttribute('aria-expanded', 'false');
		await expect(root.control({ css: '.dse-init__malice-log-entry' })).not.toBeDisplayed();
		await dse.expectNoWrite(RICH, () => dse.click(header));
		await expect(header).toHaveAttribute('aria-expanded', 'true');
		await expect(root.control({ css: '.dse-init__malice-log-entry' })).toHaveText('R1: +3 — Opening Malice');
		await dse.click(header);
		await expect(header).toHaveAttribute('aria-expanded', 'false');
	});
});
