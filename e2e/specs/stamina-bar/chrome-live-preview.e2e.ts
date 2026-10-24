// SC-502: in Live Preview the chrome panel hangs above the block, outside the box of the CodeMirror widget Obsidian draws the
// block in, and Obsidian clips that widget - so the panel was never painted and a click at the Collapse button's centre went to
// the editor line above (nothing collapsed, and the editor cursor jumped there). A real mouse click must reach the button, as it
// does in Reading view. The Edit pencil (experimental) and the hidden-panel click-through are covered by lifecycle G-S44, which
// runs the newest installed Obsidian; this suite's pinned 1.14.4 has only the hover half of the clip.
//   basic.md  one ds-stamina-bar, 15/20 +5 temp; the cursor is parked on line 0 by openNote, the blank line above the fence is line 3
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const NOTE = 'Stamina/basic.md';
const BAR = 'ds-stamina-bar';
const BLOCK = '.markdown-source-view [data-dse-element="stamina-bar"]';

const cursorLine = (): Promise<number> => dse.page<number>(`app.workspace.getMostRecentLeaf().view.editor.getCursor().line`);

describe('stamina bar chrome: the panel is clickable in Live Preview (SC-502)', () => {
	it('[CHR-L01] a real mouse click on Collapse in Live Preview collapses the block and leaves the editor cursor where it was', async () => {
		await dse.openNote(NOTE, { mode: 'live-preview' });
		const root = dse.block(BAR);
		// The collapse toggle is session state keyed by the block and outlives openNote: start expanded whatever an earlier test left.
		await dse.page(`(() => { const r = document.querySelector('${BLOCK}'); if (r.hasAttribute('data-dse-collapsed')) r.querySelector('[data-dse-control="chrome.expand"]').click(); })()`);
		expect(await cursorLine()).toBe(0);
		await dse.hover(root.root);
		await dse.click(root.control('chrome.collapse'));
		await dse.waitFor(`document.querySelector('${BLOCK}').hasAttribute('data-dse-collapsed')`, 'the block to collapse after a real click on Collapse');
		expect(await cursorLine()).toBe(0); // on the blank line above the fence (line 3) if the click had fallen through to the editor
		await dse.page(`document.querySelector('${BLOCK}').querySelector('[data-dse-control="chrome.expand"]').click()`);
	});
});
