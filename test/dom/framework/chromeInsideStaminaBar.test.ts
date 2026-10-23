// SC-492 — with the experimental authoring controls on, the "Edit Stamina bar" pencil used
// to open the block edit form AND the Stamina modal on top of it. The pencil is a chrome
// item, and the chrome panel (`.dse-chrome`) is mounted INSIDE the `.dse-stamina__cluster`
// plate, which is itself inside the clickable `.dse-stamina` bar — so a click on any chrome
// button bubbled up to the bar's own click handler (kit/StaminaBarPanel.ts). The fix makes
// that handler ignore clicks that come from inside `.dse-chrome`; a click anywhere else on
// the bar still opens the Stamina modal.
//
// Keyboard: a focused chrome button's Enter/Space is turned into a click with `detail === 0`
// by the browser (the second case below). Since SC-498 the bar is ALSO a tab stop with its own
// Enter/Space handler, so the keydown itself bubbles from a chrome button to the bar: the last
// describe pins that the bar ignores it and leaves the button's own activation alone.
import { describe, test, expect, afterEach, beforeEach } from '@jest/globals';
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementPipelineDeps } from '@/framework/pipeline';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { staminaBarElement } from '@/elements/stamina-bar/definition';
import * as FormModal from '@/authoring/FormModal';
import * as SidebarRegistration from '@/framework/sidebar/registration';
import { makeCompendiumDeps } from '../elements/_refHarness';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';

const BODY = 'max_stamina: 48\ncurrent_stamina: 31\ntemp_stamina: 0\n';

function makeDeps(): ElementPipelineDeps {
	const { deps } = makeCompendiumDeps();
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) {
		deps.validation.addDependencySchema(id, schema);
	}
	return deps;
}

function makeHost() {
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl: document.createElement('div'),
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-stamina', lineStart: 0, lineEnd: 4 }),
		replaceSource: async () => true,
		blockKey: () => 'Note.md::ds-stamina::0',
	};
	return host as unknown as BlockHost & { containerEl: HTMLElement };
}

async function mountWithAuthoring(): Promise<HTMLElement> {
	const deps = makeDeps();
	await deps.prefs.set('authoringControls', true);
	const host = makeHost();
	await new ElementPipeline(deps).run(staminaBarElement, BODY, host);
	return host.containerEl.firstElementChild as HTMLElement;
}

const staminaModals = (): number => document.body.querySelectorAll('.dse-modal').length;

let openForm: jest.SpyInstance;
let pinToSidebar: jest.SpyInstance;

beforeEach(() => {
	openForm = jest.spyOn(FormModal, 'openFormEditor').mockImplementation(() => ({}) as never);
	pinToSidebar = jest.spyOn(SidebarRegistration, 'requestPinToSidebar').mockResolvedValue(undefined);
});

afterEach(() => {
	openForm.mockRestore();
	pinToSidebar.mockRestore();
	document.body.innerHTML = '';
});

describe('SC-492 — a chrome button inside the stamina bar does not also open the Stamina modal', () => {
	test('the Edit pencil opens only the edit form', async () => {
		const root = await mountWithAuthoring();
		const bar = root.querySelector<HTMLElement>('.dse-stamina')!;
		const pencil = bar.querySelector<HTMLElement>('.dse-chrome .dse-btn[aria-label="Edit Stamina bar"]');
		expect(pencil).not.toBeNull(); // the chrome really is inside the clickable bar

		pencil!.click();

		expect(openForm).toHaveBeenCalledTimes(1);
		expect(staminaModals()).toBe(0);
	});

	test('a keyboard-activated click on the pencil (Enter/Space, detail 0) opens only the edit form', async () => {
		const root = await mountWithAuthoring();
		const pencil = root.querySelector<HTMLElement>('.dse-chrome .dse-btn[aria-label="Edit Stamina bar"]')!;

		pencil.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));

		expect(openForm).toHaveBeenCalledTimes(1);
		expect(staminaModals()).toBe(0);
	});

	test('the collapse button (the same chrome panel) does not open the Stamina modal either', async () => {
		const root = await mountWithAuthoring();
		const collapse = root.querySelector<HTMLElement>('.dse-chrome [data-dse-chrome-item="collapse"]')!;

		collapse.click();

		expect(root.hasAttribute('data-dse-collapsed')).toBe(true);
		expect(staminaModals()).toBe(0);
	});

	test('the Pin to sidebar button (experimental) pins and does not open the Stamina modal', async () => {
		const root = await mountWithAuthoring();
		const pin = root.querySelector<HTMLElement>('.dse-chrome [data-dse-chrome-item="pin"]');
		expect(pin).not.toBeNull();

		pin!.click();

		expect(pinToSidebar).toHaveBeenCalledTimes(1);
		expect(staminaModals()).toBe(0);
	});

	test('a click anywhere else on the bar still opens the Stamina modal, and not the edit form', async () => {
		const root = await mountWithAuthoring();
		const bar = root.querySelector<HTMLElement>('.dse-stamina')!;

		bar.querySelector<HTMLElement>('.dse-stamina__track')!.click();

		expect(staminaModals()).toBe(1);
		expect(document.body.querySelector('.dse-modal__title')?.textContent).toBe('Stamina');
		expect(openForm).not.toHaveBeenCalled();
	});

	test('a .dse-chrome ABOVE the bar does not swallow a click on the bar', async () => {
		const root = await mountWithAuthoring();
		const outer = document.createElement('div');
		outer.className = 'dse-chrome';
		outer.appendChild(root);

		root.querySelector<HTMLElement>('.dse-stamina__track')!.click();

		expect(staminaModals()).toBe(1);
	});
});

describe('SC-498 — Enter/Space on a chrome button inside the stamina bar do not also open the Stamina modal', () => {
	const keydown = (target: Element, key: string): KeyboardEvent => {
		const evt = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
		target.dispatchEvent(evt);
		return evt;
	};

	test.each([
		['the Edit pencil', '.dse-chrome .dse-btn[aria-label="Edit Stamina bar"]'],
		['the collapse button', '.dse-chrome [data-dse-chrome-item="collapse"]'],
		['the Pin to sidebar button', '.dse-chrome [data-dse-chrome-item="pin"]'],
	])('%s: Enter and Space open no modal and are not swallowed', async (_name, selector) => {
		const root = await mountWithAuthoring();
		const button = root.querySelector<HTMLElement>(selector);
		expect(button).not.toBeNull();
		expect(root.querySelector('.dse-stamina')!.contains(button)).toBe(true); // really inside the bar

		const enter = keydown(button!, 'Enter');
		const space = keydown(button!, ' ');

		expect(staminaModals()).toBe(0);
		expect(openForm).not.toHaveBeenCalled(); // a keydown alone is not the click the browser adds
		expect(enter.defaultPrevented).toBe(false);
		expect(space.defaultPrevented).toBe(false);
	});

	test('Enter and Space on the bar itself open the Stamina modal (and not the edit form)', async () => {
		const root = await mountWithAuthoring();
		const bar = root.querySelector<HTMLElement>('.dse-stamina')!;

		keydown(bar, 'Enter');
		expect(staminaModals()).toBe(1);
		document.body.innerHTML = '';

		keydown(bar, ' ');
		expect(staminaModals()).toBe(1);
		expect(openForm).not.toHaveBeenCalled();
	});
});
