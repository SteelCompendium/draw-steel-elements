// Plan 05 Task 5 — Negotiation Tracker on Framework v2 (F1 §6 step 8): the element view +
// definition + registration, retiring the legacy NegotiationTrackerProcessor. Mirrors
// stamina-bar.test.ts's convention of driving the element through the REAL ElementPipeline
// with real framework services, plus the persisted write path through a REAL
// ReadingModeBlockHost + FakeVault ("exactly one replaceSource, surrounding note intact").
//
// BYTE-COMPAT oracle (ties to Task 4): the legacy writer did exactly
// `stringifyYaml(<the live NegotiationData instance>).trim()` — so expected bytes here are
// always `stringifyYaml(parseNegotiationData(src) + the same mutation).trim()`.
//
// Deliberate behavior change pinned here (documented in the view): the LEGACY processor
// wrote the file on EVERY render (PatienceInterestView.build initialized the display via
// setPatience/setInterest, which called CodeBlocks.updateNegotiationTracker). On Framework
// v2 rendering never writes — persist() is scheduled only by USER mutations.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { createElementRegistry } from '../../../src/framework/registry';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { NegotiationData, parseNegotiationData } from '@model/NegotiationData';
import { App, Plugin, Menu, Notice, stringifyYaml, makeFakeContext } from '../../mocks/obsidian';
import { negotiationElement } from '../../../src/elements/negotiation/definition';
import { NegotiationView } from '../../../src/elements/negotiation/view';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import frodoYaml from '../../fixtures/negotiation/frodo.yaml';

const NT_ALIASES = ['ds-nt', 'ds-negotiation', 'ds-negotiation-tracker'] as const;

/** The exact bytes the LEGACY writer (CodeBlocks.updateNegotiationTracker) would put back
 *  into the note for this source after `mutate` — the byte-compat oracle. */
function legacyBytes(source: string, mutate?: (m: NegotiationData) => void): string {
	const model = parseNegotiationData(source);
	mutate?.(model);
	return stringifyYaml(model).trim();
}

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-nt', lineStart: 0, lineEnd: 20 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-nt::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real service instances, same convention as stamina-bar.test.ts (negotiation declares no
 *  schema, so no dependency schemas are needed). */
function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const theme = createThemeService();
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	const session = createSessionStore();
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme,
		prefs,
		refs,
		validation,
		session,
	};
}

/** Renders the frodo fixture through the real pipeline; returns the element root. */
async function renderFrodo(pipeline: ElementPipeline, host: BlockHost): Promise<HTMLElement> {
	await pipeline.run(negotiationElement, frodoYaml, host);
	return host.containerEl.firstElementChild as HTMLElement;
}

const selectedPatience = (root: HTMLElement): number[] =>
	[0, 1, 2, 3, 4, 5].filter((i) =>
		(root.querySelector(`.ds-nt-patience-bubble-${i}`) as HTMLElement).classList.contains('ds-nt-patience-selected'),
	);

describe('T-5: negotiation ElementDefinition (F1 §6 step 8)', () => {
	test('id/name/aliases/shape match the brief; persisted with serialize, NO schema, no auto ref-resolution', () => {
		expect(negotiationElement.id).toBe('negotiation');
		expect(negotiationElement.name).toBe('Negotiation tracker');
		expect(negotiationElement.aliases).toEqual([...NT_ALIASES]);
		expect(negotiationElement.shape).toBe('persisted');
		expect(negotiationElement.schema).toBeUndefined();
		expect(negotiationElement.autoResolveRefs).toBe(false);
		expect(negotiationElement.serialize).toBeDefined();
	});

	test('createView returns a NegotiationView', () => {
		const deps = makeDeps();
		const host = makeHost();
		const cx = {
			app: deps.app,
			plugin: deps.plugin,
			settings: deps.settings,
			host,
			mode: host.mode,
			theme: deps.theme,
			prefs: deps.prefs,
			refs: deps.refs,
			session: deps.session,
		};
		expect(negotiationElement.createView(cx as any)).toBeInstanceOf(NegotiationView);
	});
});

describe('T-5: negotiation rendered through the REAL ElementPipeline (frodo fixture)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('root carries data-dse-element="negotiation" + theme; legacy container classes preserved; NOT kit-wrapped', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		expect(root.getAttribute('data-dse-element')).toBe('negotiation');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
		const container = root.querySelector('.ds-nt-container') as HTMLElement;
		expect(container).not.toBeNull();
		expect(container.classList.contains('ds-container')).toBe(true);
		// Negotiation is NOT collapsible — no ComponentWrapper chrome (legacy parity).
		expect(root.querySelector('.ds-kit-component-wrapper')).toBeNull();
		expect(root.querySelector('.ds-kit-eye-container')).toBeNull();
	});

	test('name line renders "Negotiation: <name>"', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		expect(root.querySelector('.ds-nt-name-value')?.textContent).toBe(
			'Negotiation: Convincing Frodo to remember the taste of strawberries',
		);
		expect(root.querySelector('.ds-nt-settings-menu')).not.toBeNull();
	});

	test('patience: 6 bubbles, 0..3 selected (current_patience from initial_patience: 3)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		expect(root.querySelectorAll('.ds-nt-patience-bubble')).toHaveLength(6);
		expect(selectedPatience(root)).toEqual([0, 1, 2, 3]);
	});

	test('interest: lines 5..0 with fixture offers, interest 3 current (from initial_interest: 3)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		expect(root.querySelectorAll('.ds-nt-interest-line')).toHaveLength(6);
		expect(root.querySelector('.ds-nt-interest-5-offer')?.textContent).toBe(
			'Remembers the taste of strawberries and cream!',
		);
		expect(root.querySelector('.ds-nt-interest-0-offer')?.textContent).toBe(
			"Thinks you're after the ring; becomes hostile",
		);
		const line3 = root.querySelector('.ds-nt-interest-3-line') as HTMLElement;
		expect(line3.classList.contains('ds-nt-interest-current')).toBe(true);
		expect(line3.classList.contains('ds-nt-interest-selected')).toBe(true);
		const line4 = root.querySelector('.ds-nt-interest-4-line') as HTMLElement;
		expect(line4.classList.contains('ds-nt-interest-selected')).toBe(false);
	});

	test('details: motivations and pitfalls from the fixture', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		const details = root.querySelector('.ds-nt-details') as HTMLElement;
		const motivationNames = Array.from(details.querySelectorAll('.ds-nt-motivation-name')).map(
			(el) => el.textContent,
		);
		expect(motivationNames).toEqual(['Higher Authority: ', 'Peace: ']);
		expect(details.querySelector('.ds-nt-pitfall-name')?.textContent).toBe('Power: ');
		expect(details.querySelector('.ds-nt-pitfall-reason')?.textContent).toBe(
			'The ring is too powerful to ignore',
		);
	});

	test('tabs: argument tab + container active by default; learn-more content mounted but inactive', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		const argumentTab = root.querySelector('.ds-nt-argument-tab') as HTMLElement;
		const learnMoreTab = root.querySelector('.ds-nt-learn-more-tab') as HTMLElement;
		const argumentContainer = root.querySelector('.ds-nt-argument-container') as HTMLElement;
		const learnMoreContainer = root.querySelector('.ds-nt-learn-more-container') as HTMLElement;
		expect(argumentTab.classList.contains('active')).toBe(true);
		expect(argumentContainer.classList.contains('active')).toBe(true);
		expect(learnMoreTab.classList.contains('active')).toBe(false);
		expect(learnMoreContainer.classList.contains('active')).toBe(false);
		// Both tab bodies are populated (legacy parity: both built at mount).
		expect(argumentContainer.querySelector('.ds-nt-complete-argument-button')).not.toBeNull();
		expect(learnMoreContainer.querySelector('.ds-nt-learn-more-body')).not.toBeNull();
	});

	test('rendering performs ZERO writes (legacy wrote the file on every render — deliberately dropped)', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await renderFrodo(pipeline, host);
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);

		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('T-5: tab switching — session UI state, never document state (F1 §4.3)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('clicking Learn Motivation/Pitfall flips .active on tab + container, with zero vault writes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		(root.querySelector('.ds-nt-learn-more-tab') as HTMLElement).click();

		expect((root.querySelector('.ds-nt-learn-more-tab') as HTMLElement).classList.contains('active')).toBe(true);
		expect(
			(root.querySelector('.ds-nt-learn-more-container') as HTMLElement).classList.contains('active'),
		).toBe(true);
		expect((root.querySelector('.ds-nt-argument-tab') as HTMLElement).classList.contains('active')).toBe(false);
		expect(
			(root.querySelector('.ds-nt-argument-container') as HTMLElement).classList.contains('active'),
		).toBe(false);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});

	test('the active tab survives a re-render via SessionStore (same blockKey, fresh mount)', async () => {
		const deps = makeDeps();
		const pipeline = new ElementPipeline(deps);
		const host1 = makeHost();
		const root1 = await renderFrodo(pipeline, host1);
		(root1.querySelector('.ds-nt-learn-more-tab') as HTMLElement).click();

		// Fresh render of the same block (same blockKey, same SessionStore).
		const host2 = makeHost();
		const root2 = await renderFrodo(pipeline, host2);

		expect((root2.querySelector('.ds-nt-learn-more-tab') as HTMLElement).classList.contains('active')).toBe(true);
		expect((root2.querySelector('.ds-nt-argument-tab') as HTMLElement).classList.contains('active')).toBe(false);
	});
});

describe('T-5: persisted mutations — exactly ONE debounced replaceSource, byte-compatible with the legacy writer', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('clicking patience bubble 1 updates the DOM in place, then persists exactly once with legacy bytes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		(root.querySelector('.ds-nt-patience-bubble-1') as HTMLElement).click();

		// Sub-view updated its own DOM in place (no rebuild) — still inside the debounce.
		expect(selectedPatience(root)).toEqual([0, 1]);
		expect(host.replaceSource).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(legacyBytes(frodoYaml, (m) => (m.current_patience = 1)));
	});

	test('rapid mutations coalesce into ONE write serializing the final model state', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		(root.querySelector('.ds-nt-patience-bubble-1') as HTMLElement).click();
		(root.querySelector('.ds-nt-interest-2-label') as HTMLElement).click();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(frodoYaml, (m) => {
				m.current_patience = 1;
				m.current_interest = 2;
			}),
		);
	});

	test('details motivation checkbox -> setMotivationUsed -> one write with legacy bytes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		const checkbox = root.querySelector(
			'.ds-nt-details .ds-nt-motivation-checkbox',
		) as HTMLInputElement;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change'));

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(frodoYaml, (m) => m.setMotivationUsed('Higher Authority', true)),
		);
	});

	test('argument-tab motivation checkbox -> currentArgument.motivationsUsed -> one write with legacy bytes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		const checkbox = root.querySelector(
			'.ds-nt-argument-container .ds-nt-argument-modifier-motivation-checkbox',
		) as HTMLInputElement;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change'));

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(frodoYaml, (m) => m.currentArgument.motivationsUsed.push('Higher Authority')),
		);
	});
});

describe('T-5: reset menu — resetData + rebuild + persist', () => {
	afterEach(() => {
		jest.useRealTimers();
		Notice.notices.length = 0;
		Menu.lastMenu = null;
	});

	test('the settings menu offers exactly Reset Negotiation; clicking it resets the model, rebuilds the DOM, and persists the reset bytes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		let root = await renderFrodo(pipeline, host);

		// Mutate first so the reset is observable: patience 3 -> 1 (flushed write #1).
		(root.querySelector('.ds-nt-patience-bubble-1') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(selectedPatience(root)).toEqual([0, 1]);

		(root.querySelector('.ds-nt-settings-menu') as HTMLElement).click();
		const menu = Menu.lastMenu!;
		expect(menu.items).toHaveLength(1);
		expect(menu.items[0].title).toBe('Reset Negotiation');
		expect(menu.items[0].icon).toBe('rotate-ccw');

		menu.items[0].onClickCallback!();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(Notice.notices).toContain('Negotiation reset to initial state');
		// The DOM was rebuilt from the reset model (framework default update()).
		root = host.containerEl.firstElementChild as HTMLElement;
		expect(selectedPatience(root)).toEqual([0, 1, 2, 3]);
		// Write #2 is the reset state — byte-identical to a fresh parse of the fixture.
		expect(host.replaceSource).toHaveBeenCalledTimes(2);
		expect(host.replaceSource.mock.calls[1][0]).toBe(legacyBytes(frodoYaml));
	});
});

describe('T-5: canPersist=false — read-only, zero writes (F1 §4.4)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('renders without the reset menu; interacting never writes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost({ canPersist: false });
		const root = await renderFrodo(pipeline, host);

		// The reset menu is a write action — gated off entirely.
		expect(root.querySelector('.ds-nt-settings-menu')).toBeNull();
		// The tracker still renders (visible, not an error card).
		expect(root.querySelector('.ds-nt-container')).not.toBeNull();

		(root.querySelector('.ds-nt-patience-bubble-1') as HTMLElement).click();
		const checkbox = root.querySelector('.ds-nt-details .ds-nt-motivation-checkbox') as HTMLInputElement;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change'));
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);

		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('T-5: persisted write path through a REAL ReadingModeBlockHost + FakeVault (F1 §3.4/§4.2)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('patience edit inside a ```ds-nt block -> exactly one Vault write; alias + surrounding note bytes intact; body = legacy writer bytes', async () => {
		jest.useFakeTimers();
		const app = new App();
		const note = ['# Session notes', '', 'Before text.', '', '```ds-nt', frodoYaml.trimEnd(), '```', '', 'After text.'].join(
			'\n',
		);
		app.vault.setFile('Note.md', note);
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, 'Note.md');
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-nt');
		const pipeline = new ElementPipeline(makeDeps());

		await pipeline.run(negotiationElement, frodoYaml, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		(root.querySelector('.ds-nt-patience-bubble-1') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(app.vault.modifyCalls).toHaveLength(1);
		const updated = app.vault.getContent('Note.md')!;
		expect(updated.startsWith('# Session notes\n\nBefore text.\n\n```ds-nt\n')).toBe(true);
		expect(updated.endsWith('\n```\n\nAfter text.')).toBe(true);
		const body = updated.match(/```ds-nt\n([\s\S]*?)\n```/)?.[1];
		expect(body).toBe(legacyBytes(frodoYaml, (m) => (m.current_patience = 1)));
	});
});

describe('T-5: registered EXACTLY ONCE — framework registry owns ds-nt*, RegisterElements.ts does not', () => {
	test('registerFrameworkElementDefinitions registers negotiation; every alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);

		expect(registry.get('negotiation')?.id).toBe('negotiation');
		for (const alias of NT_ALIASES) {
			expect(registry.get(alias)?.id).toBe('negotiation');
		}
	});

	test('through the REAL onload(): each ds-nt* alias gets exactly one registerMarkdownCodeBlockProcessor call (no legacy double-registration)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		const registerSpy = jest.spyOn(plugin, 'registerMarkdownCodeBlockProcessor');

		await plugin.onload();

		for (const alias of NT_ALIASES) {
			const calls = registerSpy.mock.calls.filter(([language]) => language === alias);
			expect(calls).toHaveLength(1);
		}
		expect(plugin.frameworkV2!.registry.get('ds-nt')?.id).toBe('negotiation');

		registerSpy.mockRestore();
	});

	test('rendering a ds-nt block through the wired processor produces the negotiation DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-nt\n' + frodoYaml.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-nt');

		await handler(frodoYaml, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('negotiation');
		expect(root.querySelector('.ds-nt-container')).not.toBeNull();
	});
});
