// The Malice quick-add draft across an OUTSIDE refresh of a pinned (sidebar) tracker. When the note changes from outside (sync, another
// pane), the sidebar re-prepares the block and calls `update()` on the SAME view: the typed draft is kept, and a user who was typing in a
// quick-add box keeps focus and caret instead of landing on <body> in mid-word. The jsdom matrix holds the rest ([Q15], [Q16]).
//   Sidebar/initiative-pinned.md  one ds-initiative block (Malice 3) with a fixed `_dse_anchor`, pinned by script (no note write)
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const NOTE = 'Sidebar/initiative-pinned.md';
const ANCHOR = 'sbin01';
const LABEL = `.dse-sidebar [data-dse-control="init.malice.quickadd.label"]`;
const AMOUNT = `.dse-sidebar [data-dse-control="init.malice.quickadd.amount"]`;

const closeSidebar = (): Promise<unknown> => dse.page(`(() => { app.workspace.detachLeavesOfType('dse-sidebar'); return true; })()`);

describe('initiative: the quick-add draft of a pinned tracker across an outside refresh', () => {
	before(() => dse.setPrefs({}, { experimental: true }));
	after(async () => {
		await closeSidebar();
		await dse.setPrefs({});
	});

	it('[INIT-M11] an outside change to the note keeps the draft, the focus and the caret of the sidebar tracker', async () => {
		await dse.openNote(NOTE);
		await closeSidebar();
		await dse.page(`(async () => {
			const leaf = app.workspace.getRightLeaf(false);
			await leaf.setViewState({ type: 'dse-sidebar', active: true });
			await app.workspace.revealLeaf(leaf);
			leaf.view.addPanel({ filePath: ${JSON.stringify(NOTE)}, alias: 'ds-initiative', anchorId: ${JSON.stringify(ANCHOR)} });
			return true;
		})()`);
		await dse.waitFor(`!!document.querySelector('${LABEL}')`, 'the pinned tracker to render in the sidebar');
		// Script setup: a draft, with focus in the label box and "ytou" selected.
		await dse.page(`(() => {
			document.querySelector('${AMOUNT}').value = '7';
			const label = document.querySelector('${LABEL}');
			label.value = 'Feytouched';
			label.focus();
			label.setSelectionRange(2, 6);
			return true;
		})()`);
		await dse.externalEdit(NOTE, `c.replace('value: 3', 'value: 8')`);
		await dse.waitFor(
			`document.querySelector('.dse-sidebar .dse-init__malice-value')?.textContent === 'Malice: 8'`,
			'the sidebar tracker to follow the outside change',
		);
		const after = await dse.page<{ amount: string; label: string; ctl: string | null; inSidebar: boolean; sel: [number | null, number | null] }>(`(() => {
			const a = document.activeElement;
			const label = document.querySelector('${LABEL}');
			return {
				amount: document.querySelector('${AMOUNT}').value,
				label: label.value,
				ctl: a?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null,
				inSidebar: !!a?.closest('.dse-sidebar'),
				sel: [label.selectionStart, label.selectionEnd],
			};
		})()`);
		expect(after).toEqual({ amount: '7', label: 'Feytouched', ctl: 'init.malice.quickadd.label', inSidebar: true, sel: [2, 6] });
		expect(await dse.noteText(NOTE)).not.toContain('Feytouched'); // a draft is view state, never note content
	});
});
