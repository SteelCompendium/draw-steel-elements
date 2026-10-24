// SC-505 — the chrome panel sits INSIDE the element it belongs to, so a keyboard Collapse, a keyboard Expand and a
// keyboard Pin to sidebar each used to throw away the focused button and leave focus on <body>. The rule (SC-495's):
//   - only a KEYBOARD activation (the click has `detail === 0`) moves focus; a pointer click (`detail >= 1`) moves nothing;
//   - Collapse -> the one-liner's Expand button; Expand -> the restored Collapse button (or, if that cannot take focus,
//     the tab stop around it); Pin -> the Pin button of the block as it is after the rebuild the pin causes;
//   - every move is `{ preventScroll: true, focusVisible: true }`, and none ever lands on <body>.
// Mounted through the real pipeline on a ds-stamina-bar (its chrome panel is inside the bar's tab stop).
import { describe, test, expect, afterEach, beforeEach } from '@jest/globals';
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementPipelineDeps } from '@/framework/pipeline';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { staminaBarElement } from '@/elements/stamina-bar/definition';
import * as SidebarRegistration from '@/framework/sidebar/registration';
import { disarmChromeFocus } from '@/framework/chrome/focusHandoff';
import { makeCompendiumDeps } from '../elements/_refHarness';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';

const BODY = 'max_stamina: 48\ncurrent_stamina: 31\ntemp_stamina: 0\n';
const KEY = 'Note.md::ds-stamina-bar::0';

function makeDeps(): ElementPipelineDeps {
	const { deps } = makeCompendiumDeps();
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) deps.validation.addDependencySchema(id, schema);
	return deps;
}

function makeHost(): BlockHost & { containerEl: HTMLElement } {
	return {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl: document.createElement('div'),
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-stamina-bar', lineStart: 0, lineEnd: 4 }),
		replaceSource: async () => true,
		blockKey: () => KEY,
	} as unknown as BlockHost & { containerEl: HTMLElement };
}

/** Render the block (a fresh pipeline run, i.e. a rebuild when the key repeats). `attach: false` leaves it detached,
 *  the way Obsidian builds a section before inserting it. */
async function render(opts: { attach?: boolean; hidden?: boolean; leaf?: HTMLElement } = {}): Promise<{ root: HTMLElement; host: ReturnType<typeof makeHost> }> {
	const host = makeHost();
	if (opts.hidden) host.containerEl.setAttribute('data-test-hidden', '');
	if (opts.attach !== false) (opts.leaf ?? document.body).appendChild(host.containerEl);
	await new ElementPipeline(makeDeps()).run(staminaBarElement, BODY, host);
	return { root: host.containerEl.firstElementChild as HTMLElement, host };
}

/** A workspace pane (Obsidian's `.workspace-leaf`); the same note open in two panes renders the same block key twice. */
const makeLeaf = (): HTMLElement => {
	const leaf = document.createElement('div');
	leaf.className = 'workspace-leaf';
	return document.body.appendChild(leaf);
};

const item = (root: HTMLElement, id: string): HTMLButtonElement =>
	root.querySelector<HTMLButtonElement>(`[data-dse-chrome-item="${id}"]`)!;
const click = (el: HTMLElement, detail: number): void => {
	el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
};
const keyboardClick = (el: HTMLElement): void => click(el, 0);
const pointerClick = (el: HTMLElement): void => click(el, 1);
/** Let the pin's promise chain run. */
const flush = async (): Promise<void> => {
	for (let i = 0; i < 4; i++) await Promise.resolve();
};

let focusCalls: Array<{ el: HTMLElement; opts: unknown }>;
let pinToSidebar: jest.SpyInstance;

beforeEach(() => {
	focusCalls = [];
	const realFocus = HTMLElement.prototype.focus;
	jest.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, opts?: FocusOptions) {
		focusCalls.push({ el: this, opts });
		if (this.closest('[data-test-hidden]')) return; // a hidden copy refuses focus, as `display: none` does
		return realFocus.call(this, opts);
	});
	pinToSidebar = jest.spyOn(SidebarRegistration, 'requestPinToSidebar').mockResolvedValue(true); // true: the pin WROTE the note
});

afterEach(() => {
	disarmChromeFocus(KEY); // the request table is module state: no test inherits another's
	jest.restoreAllMocks();
	jest.useRealTimers();
	document.body.innerHTML = '';
});

describe('SC-505 — Collapse and Expand hand keyboard focus to the control that replaces the hidden one', () => {
	test('keyboard Collapse: focus goes to the one-liner\'s Expand button, with { preventScroll, focusVisible }', async () => {
		const { root } = await render();
		const collapse = item(root, 'collapse');
		collapse.focus();
		focusCalls.length = 0;

		keyboardClick(collapse);

		expect(root.hasAttribute('data-dse-collapsed')).toBe(true);
		expect(document.activeElement).toBe(item(root, 'expand'));
		expect(focusCalls).toEqual([{ el: item(root, 'expand'), opts: { preventScroll: true, focusVisible: true } }]);
	});

	test('pointer Collapse and pointer Expand move nothing', async () => {
		const { root } = await render();
		focusCalls.length = 0;

		pointerClick(item(root, 'collapse'));
		expect(root.hasAttribute('data-dse-collapsed')).toBe(true);
		pointerClick(item(root, 'expand'));
		expect(root.hasAttribute('data-dse-collapsed')).toBe(false);

		expect(focusCalls).toEqual([]);
		expect(document.activeElement).toBe(document.body);
	});

	test('keyboard Expand: focus goes to the restored Collapse button, with { preventScroll, focusVisible }', async () => {
		const { root } = await render();
		keyboardClick(item(root, 'collapse'));
		focusCalls.length = 0;

		keyboardClick(item(root, 'expand'));

		expect(root.hasAttribute('data-dse-collapsed')).toBe(false);
		expect(document.activeElement).toBe(item(root, 'collapse'));
		expect(focusCalls).toEqual([{ el: item(root, 'collapse'), opts: { preventScroll: true, focusVisible: true } }]);
	});

	test('keyboard Expand whose Collapse button cannot take focus falls back to the bar (the tab stop around the panel), never <body>', async () => {
		const { root } = await render();
		keyboardClick(item(root, 'collapse'));
		const collapse = item(root, 'collapse');
		collapse.setAttribute('data-test-hidden', ''); // this button refuses focus (a hover-revealed panel that stays hidden)

		keyboardClick(item(root, 'expand'));

		const bar = root.querySelector<HTMLElement>('.dse-stamina')!;
		expect(bar.getAttribute('tabindex')).toBe('0'); // the bar is a real tab stop around the panel
		expect(document.activeElement).toBe(bar);
		expect(document.activeElement).not.toBe(document.body);
	});
});

describe('SC-505 — Pin to sidebar keeps keyboard focus on the block\'s Pin button across the rebuild it causes', () => {
	test('keyboard Pin: the rebuilt block\'s new Pin button takes focus, with { preventScroll, focusVisible }', async () => {
		const first = await render();
		const oldPin = item(first.root, 'pin');
		oldPin.focus();

		keyboardClick(oldPin);
		await flush();
		expect(pinToSidebar).toHaveBeenCalledTimes(1);

		// The note write rebuilds the block from scratch: new root, new panel, new buttons; the old ones are gone.
		first.host.containerEl.remove();
		focusCalls.length = 0;
		const rebuilt = await render();

		const newPin = item(rebuilt.root, 'pin');
		expect(newPin).not.toBe(oldPin);
		expect(document.activeElement).toBe(newPin);
		expect(focusCalls).toEqual([{ el: newPin, opts: { preventScroll: true, focusVisible: true } }]);
	});

	test('a block that is rebuilt twice in a row gets its Pin button focused both times', async () => {
		const first = await render();
		first.root.querySelector<HTMLElement>('[data-dse-chrome-item="pin"]')!.focus();
		keyboardClick(item(first.root, 'pin'));
		await flush();

		first.host.containerEl.remove();
		const second = await render();
		expect(document.activeElement).toBe(item(second.root, 'pin'));
		second.host.containerEl.remove(); // the second discard drops focus to <body> again
		expect(document.activeElement).toBe(document.body);
		const third = await render();

		expect(document.activeElement).toBe(item(third.root, 'pin'));
	});

	test('pointer Pin moves nothing, even when the block is rebuilt', async () => {
		const first = await render();
		pointerClick(item(first.root, 'pin'));
		await flush();
		first.host.containerEl.remove();
		focusCalls.length = 0;

		await render();

		expect(focusCalls).toEqual([]);
		expect(document.activeElement).toBe(document.body);
	});

	test('keyboard Pin that rebuilds nothing: if focus fell to <body>, the same Pin button gets it back once the call returns', async () => {
		const { root } = await render();
		const pin = item(root, 'pin');
		pin.focus();
		pinToSidebar.mockImplementation(async () => {
			pin.blur(); // something (the sidebar opening) took focus away
			return false; // and the pin wrote nothing, so nothing is going to be rebuilt
		});

		keyboardClick(pin);
		await flush();

		expect(document.activeElement).toBe(pin);
	});

	test('the rebuilt block is attached later than it is built: the Pin button is focused once it is in the document', async () => {
		const first = await render();
		first.root.querySelector<HTMLElement>('[data-dse-chrome-item="pin"]')!.focus();
		keyboardClick(item(first.root, 'pin'));
		await flush();
		first.host.containerEl.remove();

		const rebuilt = await render({ attach: false });
		expect(document.activeElement).toBe(document.body); // built, not inserted yet
		document.body.appendChild(rebuilt.host.containerEl);
		await flush(); // MutationObserver callbacks are microtasks

		expect(document.activeElement).toBe(item(rebuilt.root, 'pin'));
	});

	test('a copy that cannot take focus (a hidden Live Preview widget) leaves the request for the visible copy', async () => {
		const first = await render();
		first.root.querySelector<HTMLElement>('[data-dse-chrome-item="pin"]')!.focus();
		keyboardClick(item(first.root, 'pin'));
		await flush();
		first.host.containerEl.remove();

		const hidden = await render({ hidden: true });
		expect(document.activeElement).toBe(document.body);
		const visible = await render();

		expect(document.activeElement).toBe(item(visible.root, 'pin'));
		expect(item(hidden.root, 'pin')).not.toBe(document.activeElement);
	});

	test('focus the user moved elsewhere in the meantime is left alone', async () => {
		const first = await render();
		first.root.querySelector<HTMLElement>('[data-dse-chrome-item="pin"]')!.focus();
		keyboardClick(item(first.root, 'pin'));
		await flush();
		first.host.containerEl.remove();
		const field = document.body.appendChild(document.createElement('input'));
		field.focus();
		focusCalls.length = 0;

		await render();

		expect(document.activeElement).toBe(field);
		expect(focusCalls).toEqual([]);
	});

	test('a request that was never answered lapses: a rebuild long after the pin does not steal focus', async () => {
		jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
		const first = await render();
		first.root.querySelector<HTMLElement>('[data-dse-chrome-item="pin"]')!.focus();
		keyboardClick(item(first.root, 'pin'));
		await flush();
		first.host.containerEl.remove();
		jest.advanceTimersByTime(6000);
		focusCalls.length = 0;

		await render();

		expect(focusCalls).toEqual([]);
		expect(document.activeElement).toBe(document.body);
	});
});

describe('SC-505 r2 HIGH-1 — the same note open in two panes: the request belongs to the pane that was pressed', () => {
	test('the OTHER pane rebuilding first neither disarms the request nor takes focus; the pressed pane then gets its button back', async () => {
		const leafA = makeLeaf();
		const leafB = makeLeaf();
		const a = await render({ leaf: leafA });
		const b = await render({ leaf: leafB });
		const bPin = item(b.root, 'pin');
		bPin.focus();
		keyboardClick(bPin);
		await flush();

		a.host.containerEl.remove();
		const a2 = await render({ leaf: leafA }); // pane A rebuilt first: same block key, its own Pin button
		expect(document.activeElement).toBe(bPin); // focus is still on the pressed button, not A's
		expect(document.activeElement).not.toBe(item(a2.root, 'pin'));

		b.host.containerEl.remove();
		const b2 = await render({ leaf: leafB });
		expect(document.activeElement).toBe(item(b2.root, 'pin'));
	});

	test('with focus already free (the pressed pane torn down first), the other pane\'s rebuild still does not take it', async () => {
		const leafA = makeLeaf();
		const leafB = makeLeaf();
		const a = await render({ leaf: leafA });
		const b = await render({ leaf: leafB });
		item(b.root, 'pin').focus();
		keyboardClick(item(b.root, 'pin'));
		await flush();

		b.host.containerEl.remove();
		a.host.containerEl.remove();
		const a2 = await render({ leaf: leafA });
		expect(document.activeElement).toBe(document.body);
		expect(document.activeElement).not.toBe(item(a2.root, 'pin'));

		const b2 = await render({ leaf: leafB });
		expect(document.activeElement).toBe(item(b2.root, 'pin'));
	});
});

describe('SC-505 r2 MEDIUM-1 — a request nobody answered must not move focus later', () => {
	test('a Pin that wrote nothing (a second press, ds-scc, a Notice) arms nothing: Tab to Collapse, a rebuild, and focus is not pulled to Pin', async () => {
		pinToSidebar.mockResolvedValue(false);
		const first = await render();
		const pin = item(first.root, 'pin');
		pin.focus();
		keyboardClick(pin);
		await flush();

		item(first.root, 'collapse').focus(); // the user moves on within the same block
		first.host.containerEl.remove();
		focusCalls.length = 0;
		await render(); // anything rebuilds the block (an outside edit, Sync, a second pane)

		expect(focusCalls).toEqual([]);
		expect(document.activeElement).toBe(document.body);
	});

	test('focus that lands anywhere but on the Pin button while the request waits cancels it', async () => {
		const first = await render();
		const pin = item(first.root, 'pin');
		pin.focus();
		keyboardClick(pin);
		await flush(); // the pin wrote the note; the rebuild has not arrived yet

		item(first.root, 'collapse').focus(); // Tab: the user is no longer waiting for the Pin button
		first.host.containerEl.remove();
		focusCalls.length = 0;
		await render();

		expect(focusCalls).toEqual([]);
		expect(document.activeElement).toBe(document.body);
	});
});
