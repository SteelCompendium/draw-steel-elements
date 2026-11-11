// SC-595 -- a block edit form opened from a hover preview survives a mouse click inside it.
//
// Obsidian's page-preview popover hides itself (which unloads the block, which closes the form and loses what was typed) on any
// `click` that reaches its window and is not inside the popover. The stand-in here is a `window` bubble spy: a click inside the
// form must not reach it. Everything else is the real path: the real pencil opens the real FormModal on a block drawn through the
// real pipeline and ReadingModeBlockHost inside a `.popover.hover-popover`, and Save goes through the real replaceSource.
import { ElementPipeline } from '@/framework/pipeline';
import { ReadingModeBlockHost } from '@/framework/host/ReadingModeBlockHost';
import { featureElement } from '@/elements/feature/definition';
import featureExample from '@/elements/feature/example.yaml';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';
import { makeCompendiumDeps } from '../elements/_refHarness';
import { Plugin, Scope, makeFakeContext } from '../../mocks/obsidian';

const PATH = 'Note.md';
const SOURCE = featureExample.trim();
const NOTE = ['# Note', '', 'Above.', '', '```ds-feature', SOURCE, '```', '', 'After.'].join('\n');

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

async function setup(inPreview: boolean) {
	const h = makeCompendiumDeps();
	await h.deps.prefs.set('authoringControls', true);
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) h.deps.validation.addDependencySchema(id, schema);
	h.app.vault.setFile(PATH, NOTE);
	const plugin = new Plugin(h.app);
	const ctx = makeFakeContext(h.app, PATH);
	const popover = document.body.appendChild(document.createElement('div'));
	if (inPreview) popover.className = 'popover hover-popover';
	popover.appendChild(ctx.el);
	const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-feature');
	host.setMountedBody(SOURCE);
	await new ElementPipeline(h.deps).run(featureElement, SOURCE, host);
	ctx.el.querySelector<HTMLElement>('.dse-btn[aria-label^="Edit "]')!.click();
	const raw = document.querySelector<HTMLTextAreaElement>('.modal-container textarea.dse-form__raw')!;
	const save = document.querySelector<HTMLButtonElement>('.modal-container .dse-modal__footer button[aria-label="Save"]')!;
	const type = (text: string): void => {
		raw.value = text;
		raw.dispatchEvent(new Event('input'));
	};
	return { h, raw, save, type, formOpen: () => document.body.contains(raw) };
}

let windowClicks: jest.Mock;
let documentClicks: jest.Mock;
beforeEach(() => {
	windowClicks = jest.fn();
	documentClicks = jest.fn();
	window.addEventListener('click', windowClicks);
	document.addEventListener('click', documentClicks);
});
afterEach(() => {
	window.removeEventListener('click', windowClicks);
	document.removeEventListener('click', documentClicks);
	document.body.innerHTML = '';
});

describe('SC-595: the block edit form opened from a hover preview', () => {
	test('a click in the raw box and on Save never reaches the window (the popover\'s hide); the form stays open for the first and the edit is saved by the second', async () => {
		const { h, raw, save, type, formOpen } = await setup(true);
		windowClicks.mockClear(); // the pencil's own click is the opening event

		raw.click();
		expect(formOpen()).toBe(true);
		type(SOURCE.replace('Coverage Strike', 'Edited Strike'));
		save.click();
		await settle();

		expect(windowClicks).not.toHaveBeenCalled();
		expect(documentClicks).toHaveBeenCalled(); // document-level listeners (click-outside handlers, capture handlers) still see it
		expect(h.app.vault.getContent(PATH)).toContain('name: Edited Strike');
		expect(formOpen()).toBe(false); // closed by Save, not by the preview going away
	});

	test('control: the same form opened from a block that is not in a hover preview: a click inside reaches the window as it always did', async () => {
		const { raw } = await setup(false);
		windowClicks.mockClear();

		raw.click();

		expect(windowClicks).toHaveBeenCalledTimes(1);
	});

	test('Escape closes the form: the popover\'s keymap scope was pushed above the form\'s by the opening click, and the form\'s is put back on top', async () => {
		const { h, raw, formOpen } = await setup(true);
		h.app.keymap.pushScope(new Scope()); // the popover's, pushed by the pencil click while it was still being dispatched
		await settle();
		// Obsidian's Keymap runs the TOP scope from a window keydown capture listener
		const onKey = (e: KeyboardEvent): void => {
			const result = h.app.keymap.top!.handleKey(e, { modifiers: '', key: e.key, vkey: e.code });
			if (result === false) e.preventDefault();
		};
		window.addEventListener('keydown', onKey, true);
		try {
			raw.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
		} finally {
			window.removeEventListener('keydown', onKey, true);
		}

		expect(formOpen()).toBe(false);
	});
});
