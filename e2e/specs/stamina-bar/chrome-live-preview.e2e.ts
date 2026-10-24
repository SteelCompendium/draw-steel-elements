// SC-502: in Live Preview the chrome panel hangs above the block, outside the box of the CodeMirror widget Obsidian draws the
// block in, and Obsidian clips that widget - so the panel was never painted and a click at the Collapse button's centre went to
// the editor line above (nothing collapsed, and the editor cursor jumped there). A real mouse click must reach the button, as it
// does in Reading view; so must a click on the collapsed one-liner's Expand button. The Edit pencil (experimental) and the hidden-panel click-through are covered by lifecycle G-S44, which
// runs the newest installed Obsidian; this suite's pinned 1.14.4 has only the hover half of the clip.
//   basic.md  one ds-stamina-bar, 15/20 +5 temp; the cursor is parked on line 0 by openNote, the blank line above the fence is line 3
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const NOTE = 'Stamina/basic.md';
const BAR = 'ds-stamina-bar';
const BLOCK = '.markdown-source-view [data-dse-element="stamina-bar"]';

const cursorLine = (): Promise<number> => dse.page<number>(`app.workspace.getMostRecentLeaf().view.editor.getCursor().line`);

const panelRevealed = (): Promise<boolean> =>
	dse.page<boolean>(`getComputedStyle(document.querySelector('${BLOCK}').querySelector('.dse-chrome')).pointerEvents === 'auto'`);

/** Resolve once the block's rect is identical on three consecutive reads (about 100 ms). */
async function waitStable(): Promise<void> {
	let last = '';
	let same = 0;
	await browser.waitUntil(
		async () => {
			const now = await dse.page<string>(
				`(() => { const r = document.querySelector('${BLOCK}').getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 10)).join(','); })()`,
			);
			same = now === last ? same + 1 : 0;
			last = now;
			return same >= 2;
		},
		{ timeout: 5000, interval: 50, timeoutMsg: 'the block never stopped moving' },
	);
}

describe('stamina bar chrome: the panel is clickable in Live Preview (SC-502)', () => {
	it('[CHR-L01] a real mouse click on Collapse in Live Preview collapses the block, a real click on Expand expands it, and the editor cursor stays where it was', async () => {
		await dse.openNote(NOTE, { mode: 'live-preview' });
		const root = dse.block(BAR);
		// The collapse toggle is session state keyed by the block and outlives openNote: start expanded whatever an earlier test left.
		await dse.page(`(() => { const r = document.querySelector('${BLOCK}'); if (r.hasAttribute('data-dse-collapsed')) r.querySelector('[data-dse-control="chrome.expand"]').click(); })()`);
		expect(await cursorLine()).toBe(0);
		// Live Preview may still be laying the note out right after openNote: a single hover then lands on a text line and nothing re-hovers
		// (a flake in 1 of 2 full runs). Wait for the block to stop moving, hover until the panel is revealed, then hover the button itself.
		await waitStable();
		const collapse = root.control('chrome.collapse');
		for (let attempt = 0; attempt < 3 && !(await panelRevealed()); attempt++) await dse.hover(root.root);
		await dse.waitFor(`getComputedStyle(document.querySelector('${BLOCK}').querySelector('.dse-chrome')).pointerEvents === 'auto'`, 'the chrome panel to be revealed by the hover');
		await dse.hover(collapse);
		await dse.click(collapse);
		await dse.waitFor(`document.querySelector('${BLOCK}').hasAttribute('data-dse-collapsed')`, 'the block to collapse after a real click on Collapse');
		expect(await cursorLine()).toBe(0); // on the blank line above the fence (line 3) if the click had fallen through to the editor
		// Obsidian's own `</>` edit-block button used to sit over the collapsed one-liner's Expand button (a click there entered the block's source).
		await dse.click(root.control('chrome.expand'));
		await dse.waitFor(`!document.querySelector('${BLOCK}').hasAttribute('data-dse-collapsed')`, 'the block to expand after a real click on Expand');
		expect(await cursorLine()).toBe(0);
	});
});
