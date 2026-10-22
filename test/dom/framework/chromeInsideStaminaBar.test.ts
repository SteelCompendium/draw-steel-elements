// SC-492 — with the experimental authoring controls on, the "Edit Stamina bar" pencil used
// to open the block edit form AND the Stamina modal on top of it. The pencil is a chrome
// item, and the chrome panel (`.dse-chrome`) is mounted INSIDE the `.dse-stamina__cluster`
// plate, which is itself inside the clickable `.dse-stamina` bar — so a click on any chrome
// button bubbled up to the bar's own click handler (kit/StaminaBarPanel.ts). The fix makes
// that handler ignore clicks that come from inside `.dse-chrome`; a click anywhere else on
// the bar still opens the Stamina modal.
//
// The bar has no keyboard path of its own (a plain div, no tabindex, no keydown handler);
// the only keyboard route onto this region is Enter/Space on a focused chrome button, which
// the browser turns into a click with `detail === 0`. That is the second case below.
import { describe, test, expect, afterEach, beforeEach } from '@jest/globals';
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementPipelineDeps } from '@/framework/pipeline';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { staminaBarElement } from '@/elements/stamina-bar/definition';
import * as FormModal from '@/authoring/FormModal';
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

beforeEach(() => {
	openForm = jest.spyOn(FormModal, 'openFormEditor').mockImplementation(() => ({}) as never);
});

afterEach(() => {
	openForm.mockRestore();
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

	test('a click anywhere else on the bar still opens the Stamina modal, and not the edit form', async () => {
		const root = await mountWithAuthoring();
		const bar = root.querySelector<HTMLElement>('.dse-stamina')!;

		bar.querySelector<HTMLElement>('.dse-stamina__track')!.click();

		expect(staminaModals()).toBe(1);
		expect(document.body.querySelector('.dse-modal__title')?.textContent).toBe('Stamina');
		expect(openForm).not.toHaveBeenCalled();
	});
});
