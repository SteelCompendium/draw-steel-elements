// SC-495: a READ-ONLY kit stepper (the roll bar's Edges and Banes, 0..9, shown as plain text) hands keyboard
// focus to its value node when "+" reaches the maximum. The node is `tabindex="-1"`: focusable by script, never a
// Tab stop. Needs the shipped "Enable rolling" preference. Feature/feature.md: one ds-feature with a Power Roll.
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const NOTE = 'Feature/feature.md';

/** The focused element's ring, as the browser computes it (a dropped CSS rule shows up here). */
const focusState = (): Promise<{ tag: string; tabindex: string | null; visible: boolean; outline: string; width: string }> =>
	dse.page(
		`(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { tag: a.tagName, tabindex: a.getAttribute('tabindex'), visible: a.matches(':focus-visible'), outline: cs.outlineStyle, width: cs.outlineWidth }; })()`,
	);
/** Shift+Tab: wdio keeps a modifier pressed until it is sent again. */
async function shiftTab(): Promise<void> {
	await browser.keys(['Shift', 'Tab']);
	await browser.keys('Shift');
}

describe('roll bar: a read-only stepper keeps keyboard focus when "+" reaches its maximum (SC-495)', () => {
	before(() => dse.setPrefs({ rollingEnabled: true }));
	after(() => dse.setPrefs({}));

	it('[ROLL-SF01] Edges and Banes "+" with Enter up to 9: focus goes to the value text (ring shown, not a Tab stop), and Tab / Shift+Tab continue in order', async () => {
		await dse.openNote(NOTE);
		const root = dse.block('ds-feature');
		await dse.click(root.control('roll.launch'));
		await dse.click(root.control('roll.modifiers'));
		const edgesInc = root.control('roll.edges.inc');
		await dse.waitFor(`!!document.querySelector('[data-dse-control="roll.edges.inc"]')?.offsetParent`, 'the Edges stepper is visible');

		await dse.tabTo(edgesInc, 40);
		for (let i = 0; i < 9; i++) await dse.press('Enter', edgesInc); // 0 -> 9: the last press disables "+" while it holds focus
		await expect(edgesInc).toBeDisabled();
		expect(await dse.focusedControl()).toBe('roll.edges.value');
		const edges = await focusState();
		expect(edges).toMatchObject({ tag: 'SPAN', tabindex: '-1', visible: true, outline: 'solid', width: '2px' });
		await dse.press('Tab');
		expect(await dse.focusedControl()).toBe('roll.banes.inc'); // Banes "-" is disabled at 0; the value text is no stop
		await shiftTab();
		expect(await dse.focusedControl()).toBe('roll.edges.dec'); // back past the value text, which is not a Tab stop

		const banesInc = root.control('roll.banes.inc');
		await dse.tabTo(banesInc, 10);
		for (let i = 0; i < 9; i++) await dse.press('Enter', banesInc);
		await expect(banesInc).toBeDisabled();
		expect(await dse.focusedControl()).toBe('roll.banes.value');
		expect(await focusState()).toMatchObject({ tag: 'SPAN', tabindex: '-1', visible: true, outline: 'solid', width: '2px' });
		await shiftTab();
		expect(await dse.focusedControl()).toBe('roll.banes.dec'); // the value text is skipped going back
	});
});
