// SC-511 -- keyboard "Unpin from sidebar" (and the degrade card's "Remove panel") used to throw away the button the
// user pressed and leave focus on <body>. Keyboard only (SC-505's rule: a click with `detail === 0`); a pointer press
// moves nothing. Focus goes to the panel now in the removed panel's place (its header note link), else the panel
// above, else the "No pinned blocks" message (tabindex -1, no Tab stop). Same real-framework harness as
// sidebarChrome.test.ts.
import { App, Plugin, flushAsync } from '../../mocks/obsidian';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { initializeElementFrameworkV2, registerFrameworkElementDefinitions } from 'main';
import { DseSidebarView, VIEW_TYPE_DSE_SIDEBAR } from '@/framework/sidebar/DseSidebarView';
import type { DseSidebarServices } from '@/framework/sidebar/DseSidebarView';

const ANCHORS = ['aaa111', 'bbb222', 'ccc333'];
const counterBlock = (anchorId: string, value: number): string =>
	['```ds-counter', `current_value: ${value}`, `_dse_anchor: ${anchorId}`, '```'].join('\n');

async function setup(panelCount: number) {
	const app = new App();
	const plugin = new Plugin(app);
	const frameworkV2 = initializeElementFrameworkV2(app as any, plugin as any, DEFAULT_SETTINGS);
	registerFrameworkElementDefinitions(frameworkV2.registry);
	const services = { app, plugin, pipeline: frameworkV2.pipeline, registry: frameworkV2.registry } as unknown as DseSidebarServices;
	plugin.registerView(VIEW_TYPE_DSE_SIDEBAR, ((leaf: any) => new DseSidebarView(leaf, services)) as any);
	const leaf = app.workspace.getRightLeaf(false)!;
	await leaf.setViewState({ type: VIEW_TYPE_DSE_SIDEBAR, active: true });
	const view = leaf.view as unknown as DseSidebarView;
	document.body.appendChild(view.contentEl); // focus only sticks to nodes that are in the document
	ANCHORS.slice(0, panelCount).forEach((anchorId, i) => {
		app.vault.setFile(`Note${i}.md`, counterBlock(anchorId, i));
		view.addPanel({ filePath: `Note${i}.md`, alias: 'ds-counter', anchorId });
	});
	await flushAsync();
	return { app, view };
}

const panels = (view: DseSidebarView) => [...view.contentEl.querySelectorAll<HTMLElement>('.dse-sidebar__panel')];
const noteLink = (panel: HTMLElement) => panel.querySelector<HTMLElement>('.dse-sidebar__panel-note')!;
const unpinOf = (panel: HTMLElement) => panel.querySelector<HTMLButtonElement>('[data-dse-chrome-item="unpin"]')!;

/** A keyboard activation (Enter/Space raise a click with detail 0); the user is on the button, as with a Tab press. */
function keyboardPress(button: HTMLElement): void {
	button.focus();
	button.click();
}
/** A pointer press: `detail >= 1`. */
function pointerPress(button: HTMLElement): void {
	button.focus();
	button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
}

afterEach(() => {
	document.body.innerHTML = '';
	jest.restoreAllMocks();
});

describe('SC-511: keyboard Unpin from sidebar hands focus to a neighbouring panel', () => {
	test('the MIDDLE of three: focus goes to the note link of the panel that took its place', async () => {
		const { view } = await setup(3);
		const [, middle, third] = panels(view);
		keyboardPress(unpinOf(middle));
		expect(panels(view)).toHaveLength(2);
		expect(document.activeElement).toBe(noteLink(third));
	});

	test('the FIRST of three: focus goes to the panel that is now first', async () => {
		const { view } = await setup(3);
		const [first, second] = panels(view);
		keyboardPress(unpinOf(first));
		expect(document.activeElement).toBe(noteLink(second));
	});

	test('the LAST of three: focus goes to the panel above it', async () => {
		const { view } = await setup(3);
		const [, middle, last] = panels(view);
		keyboardPress(unpinOf(last));
		expect(panels(view)).toHaveLength(2);
		expect(document.activeElement).toBe(noteLink(middle));
	});

	test('the ONLY panel: focus goes to the "No pinned blocks" message, which is tabindex -1 (focusable by script, no Tab stop)', async () => {
		const { view } = await setup(1);
		keyboardPress(unpinOf(panels(view)[0]));
		const empty = view.contentEl.querySelector<HTMLElement>('.dse-sidebar__empty')!;
		expect(panels(view)).toHaveLength(0);
		expect(empty.getAttribute('tabindex')).toBe('-1');
		expect(document.activeElement).toBe(empty);
	});

	test('the empty-state message is tabindex -1 from the first draw, never a Tab stop', async () => {
		const { view } = await setup(0);
		expect(view.contentEl.querySelector('.dse-sidebar__empty')!.getAttribute('tabindex')).toBe('-1');
	});

	test('every move uses the hand-off focus options (preventScroll, focusVisible)', async () => {
		const { view } = await setup(2);
		const focusSpy = jest.spyOn(HTMLElement.prototype, 'focus');
		keyboardPress(unpinOf(panels(view)[0])); // the press itself focuses with no options; only the hand-off asks for the ring
		const withRing = focusSpy.mock.calls.filter((c) => (c[0] as { focusVisible?: boolean } | undefined)?.focusVisible);
		expect(withRing).toHaveLength(1);
		expect(withRing[0][0]).toEqual({ preventScroll: true, focusVisible: true });
	});

	test('a POINTER press (detail 1) moves nothing: focus is not handed to any neighbour', async () => {
		const { view } = await setup(3);
		const [, middle] = panels(view);
		pointerPress(unpinOf(middle));
		expect(panels(view)).toHaveLength(2);
		expect(document.activeElement).toBe(document.body);
	});

	test('focus the user already moved elsewhere is left alone', async () => {
		const { view } = await setup(3);
		const [, middle] = panels(view);
		const elsewhere = document.body.appendChild(document.createElement('button'));
		const unpin = unpinOf(middle);
		unpin.focus();
		elsewhere.focus(); // the user moved on before the click was handled
		unpin.click();
		expect(panels(view)).toHaveLength(2);
		expect(document.activeElement).toBe(elsewhere);
	});

	test('a removal that is not a keyboard press (file deleted, evicted) moves no focus', async () => {
		const { view } = await setup(2);
		const [first] = panels(view);
		noteLink(first).focus();
		const panel = (view as any).panels[0];
		view.removePanel(panel);
		expect(document.activeElement).toBe(document.body);
	});

	test('with the note link gone, the neighbour\'s first focusable control takes focus, never one inside the hover-revealed chrome', async () => {
		const { view } = await setup(2);
		const [first, second] = panels(view);
		noteLink(second).remove();
		second.prepend(second.querySelector('.dse-chrome')!); // the hover-revealed chrome now comes first in tab order
		keyboardPress(unpinOf(first));
		expect(document.activeElement).toBe(second.querySelector('[data-dse-control="counter.dec"]')); // the counter's own first button
		expect(second.querySelector('.dse-chrome')!.contains(document.activeElement)).toBe(false);
	});
});

describe('SC-511: the degrade card\'s "Remove panel" button follows the same rule', () => {
	async function withDegradedLast() {
		const { app, view } = await setup(3);
		app.vault.setFile('Gone.md', 'no block here');
		// A fourth panel whose block does not exist: it degrades to the card with the "Remove panel" button, last in the stack.
		view.addPanel({ filePath: 'Gone.md', alias: 'ds-counter', anchorId: 'nonexistent' });
		await flushAsync();
		return view;
	}

	test('keyboard: Remove panel on the LAST (degraded) panel puts focus on the panel above', async () => {
		const view = await withDegradedLast();
		const all = panels(view);
		const degraded = all[all.length - 1];
		expect(degraded.getAttribute('data-dse-sidebar-unavailable')).toBe('true');
		keyboardPress(degraded.querySelector<HTMLElement>('[aria-label="Remove panel"]')!);
		expect(panels(view)).toHaveLength(3);
		expect(document.activeElement).toBe(noteLink(all[all.length - 2]));
	});

	test('keyboard: Remove panel on the only (degraded) panel puts focus on the empty-state message', async () => {
		const { view } = await setup(0);
		view.addPanel({ filePath: 'Gone.md', alias: 'ds-counter', anchorId: 'nonexistent' });
		await flushAsync();
		keyboardPress(panels(view)[0].querySelector<HTMLElement>('[aria-label="Remove panel"]')!);
		expect(document.activeElement).toBe(view.contentEl.querySelector('.dse-sidebar__empty'));
	});

	test('pointer: Remove panel moves no focus', async () => {
		const view = await withDegradedLast();
		const all = panels(view);
		pointerPress(all[all.length - 1].querySelector<HTMLElement>('[aria-label="Remove panel"]')!);
		expect(panels(view)).toHaveLength(3);
		expect(document.activeElement).toBe(document.body);
	});
});
