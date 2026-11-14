// SC-439 — filed negotiation bugs as `test.failing`: each encodes the CORRECT behaviour with its ticket in the title, passes while the bug
// exists and FAILS once it is fixed (remove the marker then). The real-Obsidian twins are the `knownBug` markers in
// e2e/specs/negotiation/ (integrity, focus, wrong-values). Each marker asserts only what its ticket rules, never a specific fix or default.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, Menu, parseYaml, makeFakeContext } from '../../mocks/obsidian';
import { negotiationElement } from '../../../src/elements/negotiation/definition';

function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme: createThemeService(prefs, plugin as any),
		prefs,
		refs: createReferenceService(app as any, DEFAULT_SETTINGS),
		validation: createValidationService(),
		session: createSessionStore(),
		roll: createRollService(prefs),
	};
}

/** Mount `body` in a note through a real ReadingModeBlockHost over a real FakeVault (fake timers; `flush()` lands the debounced write). */
async function mount(body: string) {
	jest.useFakeTimers();
	const app = new App();
	app.vault.setFile('Note.md', '# T\n\n```ds-negotiation\n' + body + '\n```\n');
	const plugin = new Plugin(app);
	const ctx = makeFakeContext(app, 'Note.md', 0);
	document.body.appendChild(ctx.el);
	const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-negotiation');
	await new ElementPipeline(makeDeps()).run(negotiationElement, body, host);
	const root = (): HTMLElement => host.containerEl.firstElementChild as HTMLElement;
	const flush = (): Promise<void> => jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS + 50);
	const written = (): any => parseYaml(/```ds-negotiation\n([\s\S]*?)\n```/.exec(app.vault.getContent('Note.md')!)![1]);
	return { root, flush, written };
}

const OFFERS = 'i5: five\ni4: four\ni3: three\ni2: two\ni1: one\ni0: zero\n';
const sealOf = (root: HTMLElement, id: 'patience' | 'interest', value: number): HTMLElement =>
	root.querySelector(`[data-dse-control="negotiation.${id}.seal"][data-value="${value}"]`) as HTMLElement;
const checked = (root: HTMLElement, id: 'patience' | 'interest'): number[] =>
	Array.from(root.querySelectorAll<HTMLElement>(`[data-dse-control="negotiation.${id}.seal"]`)).filter((s) => s.getAttribute('aria-checked') === 'true').map((s) => Number(s.dataset.value));

afterEach(() => {
	jest.useRealTimers();
	document.body.innerHTML = '';
	Menu.lastMenu = null;
});

describe('SC-439 filed bugs', () => {
	const UNKNOWN =
		'name: The Duke\ninitial_interest: 3\ninitial_patience: 3\nnote_to_self: keep me\nmotivations:\n  - name: Legacy\n    reason: heir\n    gm_note: ask about the sister\n' +
		'pitfalls:\n  - name: Pride\n    reason: charity\n    gm_note: never mention the war\n' +
		OFFERS;

	test.failing('[K01] a write keeps a top-level key the element does not know [known bug SC-637]', async () => {
		const { root, flush, written } = await mount(UNKNOWN);
		sealOf(root(), 'patience', 1).click();
		await flush();
		expect(written().note_to_self).toBe('keep me');
	});

	test.failing('[K02] a write keeps a key the element does not know inside a motivation and inside a pitfall [known bug SC-637]', async () => {
		const { root, flush, written } = await mount(UNKNOWN);
		sealOf(root(), 'patience', 1).click();
		await flush();
		expect(written().motivations[0].gm_note).toBe('ask about the sister');
		expect(written().pitfalls[0].gm_note).toBe('never mention the war');
	});

	test.failing('[K03] a number as the name does not leave a raw JavaScript error on the card [known bug SC-638]', async () => {
		const { root } = await mount('name: 2024\ninitial_interest: 3\ninitial_patience: 3\n' + OFFERS);
		expect(root().textContent).not.toMatch(/is not a function|Cannot read properties|undefined/);
	});

	test.failing('[K04] a fractional Interest (0.4) is drawn on the seal that agrees with the ending: seal 0 only while the negotiation is over [known bug SC-638]', async () => {
		const { root } = await mount('name: x\ninitial_interest: 3\ninitial_patience: 3\ncurrent_interest: 0.4\n' + OFFERS);
		const seals = checked(root(), 'interest');
		expect(seals).toHaveLength(1);
		const ended = root().querySelector('.dse-nt')!.getAttribute('data-ended');
		expect(seals[0] === 0).toBe(ended === 'hostile');
	});

	test.failing('[K05] Reset negotiation, chosen from the focused options button, leaves keyboard focus inside the card [known bug SC-639]', async () => {
		const { root, flush } = await mount('name: x\ninitial_interest: 3\ninitial_patience: 3\ncurrent_patience: 1\n' + OFFERS);
		const menu = root().querySelector<HTMLElement>('[data-dse-control="negotiation.menu"]')!;
		menu.focus();
		menu.click();
		Menu.lastMenu!.items[0].onClickCallback!();
		await flush();
		expect(root().contains(document.activeElement)).toBe(true);
	});

	test.failing('[K06] two motivations with the same name: every appeal chip has its name to read [known bug SC-640]', async () => {
		const { root } = await mount(
			'name: x\ninitial_interest: 3\ninitial_patience: 3\nmotivations:\n  - name: Peace\n    reason: a\n  - name: Peace\n    reason: b\n' + OFFERS,
		);
		const labels = Array.from(root().querySelectorAll('[data-dse-control="negotiation.appeal.motivation"]')).map((c) => (c.textContent ?? '').replace(/[◆◇]/g, '').trim());
		expect(labels).toHaveLength(2);
		for (const label of labels) expect(label).not.toBe('');
	});

	test.failing('[K07] a motivation with no name: its appeal chip is not announced as "Appeal to " [known bug SC-640]', async () => {
		const { root } = await mount('name: x\ninitial_interest: 3\ninitial_patience: 3\nmotivations:\n  - name: Peace\n    reason: a\n  - reason: b\n' + OFFERS);
		const names = Array.from(root().querySelectorAll('[data-dse-control="negotiation.appeal.motivation"]')).map((c) => c.getAttribute('aria-label') ?? '');
		expect(names).toHaveLength(2);
		for (const name of names) expect(name).not.toMatch(/^Appeal to\s*$/);
	});

	test.failing('[K08] a block that declares no Interest does not open already ended [known bug SC-641]', async () => {
		const { root } = await mount('name: A quick haggle');
		expect(root().querySelector('.dse-nt')!.hasAttribute('data-ended')).toBe(false);
	});

	test.failing('[K09] Reset on a block that declares only its current standing does not end the negotiation [known bug SC-641]', async () => {
		const { root, flush } = await mount('name: x\ncurrent_interest: 3\ncurrent_patience: 2\n' + OFFERS);
		expect(checked(root(), 'interest')).toEqual([3]); // live to begin with
		expect(root().querySelector('.dse-nt')!.hasAttribute('data-ended')).toBe(false);
		root().querySelector<HTMLElement>('[data-dse-control="negotiation.menu"]')!.click();
		Menu.lastMenu!.items[0].onClickCallback!();
		await flush();
		expect(root().querySelector('.dse-nt')!.hasAttribute('data-ended')).toBe(false);
	});
});
