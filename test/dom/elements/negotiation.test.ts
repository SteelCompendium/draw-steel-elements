// Plan 09 Task 7 (D2 §3.10) — Negotiation Tracker redesigned onto the D2 kit: cardHead
// (CB-16: the name slot, never a dangling "Negotiation: " prefix), kit tabs (a REAL
// tablist; active tab in cx.session, OD-7), powerRollPanel(selectable) (the Task-0
// radiogroup — role="radio" + aria-checked, exactly one tier), and iconButton bubbles
// (aria-pressed) for the Patience track + Interest ladder. Every legacy click-<div>
// becomes a real, keyboard-operable control. CB-4 (the legacy singleton-processor reset
// that clobbered the last-rendered tracker) is pinned per-instance here.
//
// Same harness as counter/stamina-bar: the element drives through the REAL
// ElementPipeline with real framework services, plus the persisted write path through a
// REAL ReadingModeBlockHost + FakeVault ("exactly one replaceSource, surrounding note
// intact").
//
// BYTE-COMPAT oracle (unchanged from Plan 05 Task 4/5 — the redesign touches ONLY the
// DOM): the legacy writer did exactly `stringifyYaml(<the live NegotiationData
// instance>).trim()`, so expected bytes are always
// `stringifyYaml(parseNegotiationData(src) + the same mutation).trim()`.
//
// Deliberate behavior pinned here (documented in the view): rendering NEVER writes —
// persist() is scheduled only by USER mutations (the legacy processor wrote the file on
// every render).
import * as fs from 'fs';
import * as path from 'path';
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
import { createElementRegistry } from '../../../src/framework/registry';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { NegotiationData, parseNegotiationData } from '@model/NegotiationData';
import { App, Plugin, Menu, Notice, stringifyYaml, makeFakeContext } from '../../mocks/obsidian';
import { negotiationElement } from '../../../src/elements/negotiation/definition';
import { NegotiationView } from '../../../src/elements/negotiation/view';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import { styleGuardFindings } from '../kit/styleGuard';
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
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	const theme = createThemeService(prefs, plugin as any);
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
		roll: createRollService(prefs),
	};
}

/** Renders the frodo fixture through the real pipeline; returns the element root. */
async function renderFrodo(pipeline: ElementPipeline, host: BlockHost): Promise<HTMLElement> {
	await pipeline.run(negotiationElement, frodoYaml, host);
	return host.containerEl.firstElementChild as HTMLElement;
}

// -- kit-DOM accessors (D2 §3.10 grammar) --
const patienceBubble = (root: HTMLElement, i: number) =>
	root.querySelector(`.dse-nt__patience .dse-nt__bubble[data-value="${i}"]`) as HTMLButtonElement;
const pressedPatience = (root: HTMLElement): number[] =>
	[0, 1, 2, 3, 4, 5].filter((i) => patienceBubble(root, i).getAttribute('aria-pressed') === 'true');
const interestRow = (root: HTMLElement, i: number) =>
	root.querySelector(`.dse-nt__interest-row[data-interest="${i}"]`) as HTMLElement;
const interestBubble = (root: HTMLElement, i: number) =>
	interestRow(root, i).querySelector('.dse-nt__bubble') as HTMLButtonElement;
const pressedInterest = (root: HTMLElement): number[] =>
	[0, 1, 2, 3, 4, 5].filter((i) => interestBubble(root, i).getAttribute('aria-pressed') === 'true');
const interestOffer = (root: HTMLElement, i: number) =>
	interestRow(root, i).querySelector('.dse-nt__interest-offer') as HTMLElement;
const tabEls = (root: HTMLElement) =>
	Array.from(root.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
const tierRadios = (root: HTMLElement) =>
	Array.from(root.querySelectorAll('.dse-nt__argument .dse-pr__row')) as HTMLButtonElement[];
const completeBtn = (root: HTMLElement) =>
	root.querySelector('.dse-nt__argument-footer .dse-btn') as HTMLButtonElement | null;
const menuBtn = (root: HTMLElement) =>
	root.querySelector('.dse-nt__menu') as HTMLButtonElement | null;

function pressKey(el: HTMLElement, key: string): void {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('T-7: negotiation ElementDefinition (unchanged by the D2 redesign)', () => {
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

describe('T-7: negotiation rendered through the REAL ElementPipeline (D2 §3.10 kit DOM)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('root carries data-dse-element="negotiation" + theme; ONE .dse-nt; NO legacy .ds-nt-* DOM; NOT kit-wrapped', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		expect(root.getAttribute('data-dse-element')).toBe('negotiation');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
		expect(root.querySelectorAll('.dse-nt')).toHaveLength(1);
		expect(root.querySelector('[class*="ds-nt-"]')).toBeNull();
		// Negotiation is NOT collapsible — no ComponentWrapper chrome (legacy parity).
		expect(root.querySelector('.ds-kit-component-wrapper')).toBeNull();
		expect(root.querySelector('.ds-kit-eye-container')).toBeNull();
	});

	test('CB-16: cardHead — the name slot is a heading with the RAW name (eyebrow carries the kind-noun; no "Negotiation: " prefix anywhere)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		const head = root.querySelector('.dse-nt__head .dse-head') as HTMLElement;
		expect(head).not.toBeNull();
		const name = head.querySelector('.dse-head__primary--left') as HTMLElement;
		expect(name.textContent).toBe('Convincing Frodo to remember the taste of strawberries');
		expect(name.getAttribute('role')).toBe('heading');
		expect(head.querySelector('.dse-head__eyebrow--left')?.textContent).toBe('Negotiation');
		expect(root.textContent).not.toContain('Negotiation:');
	});

	test('CB-16: an UNNAMED negotiation heads as plain "Negotiation" — no dangling colon, no duplicated eyebrow', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		await pipeline.run(negotiationElement, 'initial_patience: 2', host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const name = root.querySelector('.dse-head__primary--left') as HTMLElement;
		expect(name.textContent).toBe('Negotiation');
		expect(root.querySelector('.dse-head__eyebrow--left')).toBeNull();
		expect(root.textContent).not.toContain('Negotiation:');
	});

	test('patience: 6 REAL <button aria-pressed> bubbles (labelled, type=button), 0..3 pressed from initial_patience: 3', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		const bubbles = root.querySelectorAll('.dse-nt__patience .dse-nt__bubble');
		expect(bubbles).toHaveLength(6);
		for (let i = 0; i <= 5; i++) {
			const bubble = patienceBubble(root, i);
			expect(bubble.tagName).toBe('BUTTON');
			expect(bubble.getAttribute('type')).toBe('button');
			expect(bubble.getAttribute('aria-label')).toBe(`Set patience to ${i}`);
			expect(bubble.textContent).toBe(String(i));
		}
		expect(pressedPatience(root)).toEqual([0, 1, 2, 3]);
	});

	test('interest: ladder rows 5..0 (fixture offers), REAL bubble buttons; current row [data-current]; passed rungs [data-reached]', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		const rows = Array.from(root.querySelectorAll('.dse-nt__interest-row'));
		expect(rows.map((r) => r.getAttribute('data-interest'))).toEqual(['5', '4', '3', '2', '1', '0']);
		expect(interestOffer(root, 5).textContent).toBe('Remembers the taste of strawberries and cream!');
		expect(interestOffer(root, 0).textContent).toBe("Thinks you're after the ring; becomes hostile");
		for (let i = 0; i <= 5; i++) {
			expect(interestBubble(root, i).tagName).toBe('BUTTON');
			expect(interestBubble(root, i).getAttribute('aria-label')).toBe(`Set interest to ${i}`);
		}
		// initial_interest: 3 — bubbles 0..3 pressed, row 3 is the accent-glow current…
		expect(pressedInterest(root)).toEqual([0, 1, 2, 3]);
		expect(interestRow(root, 3).hasAttribute('data-current')).toBe(true);
		expect(interestRow(root, 4).hasAttribute('data-current')).toBe(false);
		// …and only the PASSED rungs (below current) fade via [data-reached].
		expect([0, 1, 2, 3, 4, 5].filter((i) => interestOffer(root, i).hasAttribute('data-reached'))).toEqual([
			0, 1, 2,
		]);
	});

	test('tabs: a REAL tablist (aria-selected + roving tabindex); argument selected by default; panels are tabpanels hidden via the hidden ATTRIBUTE; both bodies mounted up front', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		expect(root.querySelector('.dse-tabs [role="tablist"], .dse-tabs[role="tablist"], [role="tablist"]')).not.toBeNull();
		const [argTab, learnTab] = tabEls(root);
		expect(argTab.tagName).toBe('BUTTON');
		expect(argTab.textContent).toContain('Make an Argument');
		expect(learnTab.textContent).toContain('Learn Motivation/Pitfall');
		expect(argTab.getAttribute('aria-selected')).toBe('true');
		expect(argTab.getAttribute('tabindex')).toBe('0');
		expect(learnTab.getAttribute('aria-selected')).toBe('false');
		expect(learnTab.getAttribute('tabindex')).toBe('-1');

		const panels = Array.from(root.querySelectorAll('[role="tabpanel"]')) as HTMLElement[];
		expect(panels).toHaveLength(2);
		expect(panels[0].hidden).toBe(false);
		expect(panels[1].hidden).toBe(true);
		// Both tab bodies are populated (legacy parity: both built at mount).
		expect(panels[0].querySelector('.dse-nt__argument')).not.toBeNull();
		expect(panels[1].querySelector('.dse-nt__learn-more')).not.toBeNull();
	});

	test('argument power roll: a TRUE radiogroup — 4 REAL <button role="radio" aria-checked> tiers, none checked initially, first is the single Tab stop; legacy head + tier wording', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		const rowsEl = root.querySelector('.dse-nt__argument .dse-pr__rows') as HTMLElement;
		expect(rowsEl.getAttribute('role')).toBe('radiogroup');
		expect(root.querySelector('.dse-nt__argument .dse-pr__head')?.textContent).toBe(
			'Power Roll + Reason, Intuition, or Presence',
		);

		const radios = tierRadios(root);
		expect(radios).toHaveLength(4);
		for (const radio of radios) {
			expect(radio.tagName).toBe('BUTTON');
			expect(radio.getAttribute('role')).toBe('radio');
			expect(radio.getAttribute('aria-checked')).toBe('false');
		}
		expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
		// Baseline argument (no motivation/pitfall/lie/reuse): the legacy tier outcomes.
		expect(radios[0].textContent).toContain('-1 Interest, -1 Patience');
		expect(radios[1].textContent).toContain('-1 Patience');
		expect(radios[2].textContent).toContain('+1 Interest, -1 Patience');
		expect(radios[3].textContent).toContain('+1 Interest');
		// The Complete Argument button is a REAL kit button, disabled until a tier is picked.
		expect(completeBtn(root)!.tagName).toBe('BUTTON');
		expect(completeBtn(root)!.disabled).toBe(true);
	});

	test('learn-more tab: rules text + a STATIC (non-selectable) 3-tier power roll panel', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		const learn = root.querySelector('.dse-nt__learn-more') as HTMLElement;
		expect(learn.textContent).toContain('learn one of the NPC’s motivations or pitfalls');
		const rows = learn.querySelectorAll('.dse-pr__row');
		expect(rows).toHaveLength(3);
		// Static grammar: plain rows, no radio semantics.
		expect(learn.querySelector('[role="radiogroup"]')).toBeNull();
		expect(rows[0].tagName).not.toBe('BUTTON');
	});

	test('details: motivations (checkboxes) and pitfalls from the fixture under .dse-nt__motivations', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		const details = root.querySelector('.dse-nt__motivations') as HTMLElement;
		const motivationNames = Array.from(details.querySelectorAll('.dse-nt__details-name')).map(
			(el) => el.textContent,
		);
		expect(motivationNames).toEqual(['Higher Authority: ', 'Peace: ', 'Power: ']);
		expect(details.querySelectorAll('input[type="checkbox"]')).toHaveLength(2); // pitfalls have none
		expect(details.textContent).toContain('The ring is too powerful to ignore');
	});

	test('rendering performs ZERO writes (legacy wrote the file on every render — deliberately dropped)', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await renderFrodo(pipeline, host);
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);

		expect(host.replaceSource).not.toHaveBeenCalled();
	});

	test('source hygiene: the view + every negotiation sub-view pass the shared kit style guard (no inline color, no color literals)', () => {
		const files = [
			'../../../src/elements/negotiation/view.ts',
			'../../../src/drawSteelAdmonition/negotiation/PatienceInterestView.ts',
			'../../../src/drawSteelAdmonition/negotiation/ArgumentView.ts',
			'../../../src/drawSteelAdmonition/negotiation/LearnMoreView.ts',
			'../../../src/drawSteelAdmonition/negotiation/MotivationsPitfallsView.ts',
		];
		for (const file of files) {
			const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
			expect(styleGuardFindings(src)).toEqual([]);
		}
	});

	test('CSS contract: .dse-nt scoped under [data-dse-element="negotiation"], on the §3.10 tokens — and the legacy .ds-nt-* block is GONE', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

		const block = sheet.match(/\[data-dse-element="negotiation"\]\s+\.dse-nt\s*\{[\s\S]*?\n\}/);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/var\(--dse-accent\)/); // the current-interest glow
		expect(block![0]).toMatch(/var\(--dse-fg-faint\)/); // faded/reached rungs
		expect(block![0]).toMatch(/var\(--dse-border\)/); // track/ladder connectors

		// The whole legacy class block is evicted (comments may still cite the old names).
		const noComments = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
		expect(noComments).not.toMatch(/\.ds-nt-/);
	});
});

describe('T-7: tab switching — kit tablist, session UI state, never document state (F1 §4.3 / OD-7)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('clicking Learn Motivation/Pitfall flips aria-selected + panel hidden-ness, with zero vault writes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		const [argTab, learnTab] = tabEls(root);
		learnTab.click();

		expect(learnTab.getAttribute('aria-selected')).toBe('true');
		expect(argTab.getAttribute('aria-selected')).toBe('false');
		const panels = Array.from(root.querySelectorAll('[role="tabpanel"]')) as HTMLElement[];
		expect(panels[0].hidden).toBe(true);
		expect(panels[1].hidden).toBe(false);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});

	test('the tablist is keyboard-operable: ArrowRight moves selection (selection follows focus)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		const [argTab, learnTab] = tabEls(root);
		pressKey(argTab, 'ArrowRight');

		expect(learnTab.getAttribute('aria-selected')).toBe('true');
		expect(learnTab.getAttribute('tabindex')).toBe('0');
		expect(argTab.getAttribute('tabindex')).toBe('-1');
	});

	test('the active tab survives a re-render via SessionStore (same blockKey, fresh mount)', async () => {
		const deps = makeDeps();
		const pipeline = new ElementPipeline(deps);
		const host1 = makeHost();
		const root1 = await renderFrodo(pipeline, host1);
		tabEls(root1)[1].click();

		// Fresh render of the same block (same blockKey, same SessionStore).
		const host2 = makeHost();
		const root2 = await renderFrodo(pipeline, host2);

		const [argTab2, learnTab2] = tabEls(root2);
		expect(learnTab2.getAttribute('aria-selected')).toBe('true');
		expect(argTab2.getAttribute('aria-selected')).toBe('false');
	});
});

describe('T-7: persisted mutations — exactly ONE debounced replaceSource, byte-compatible with the legacy writer', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('clicking patience bubble 1 repaints aria-pressed IN PLACE, then persists exactly once with legacy bytes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		patienceBubble(root, 1).click();

		// Sub-view updated its own DOM in place (no rebuild) — still inside the debounce.
		expect(pressedPatience(root)).toEqual([0, 1]);
		expect(host.replaceSource).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(legacyBytes(frodoYaml, (m) => (m.current_patience = 1)));
	});

	test('clicking interest bubble 2 repaints the ladder (pressed/current/reached) in place + one write with legacy bytes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		interestBubble(root, 2).click();

		expect(pressedInterest(root)).toEqual([0, 1, 2]);
		expect(interestRow(root, 2).hasAttribute('data-current')).toBe(true);
		expect(interestRow(root, 3).hasAttribute('data-current')).toBe(false);
		expect([0, 1, 2, 3, 4, 5].filter((i) => interestOffer(root, i).hasAttribute('data-reached'))).toEqual([
			0, 1,
		]);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(legacyBytes(frodoYaml, (m) => (m.current_interest = 2)));
	});

	test('rapid mutations coalesce into ONE write serializing the final model state', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		patienceBubble(root, 1).click();
		interestBubble(root, 2).click();

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
			'.dse-nt__motivations input[type="checkbox"]',
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
			'.dse-nt__argument-motivations input[type="checkbox"]',
		) as HTMLInputElement;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change'));

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(frodoYaml, (m) => m.currentArgument.motivationsUsed.push('Higher Authority')),
		);
	});

	test('tier radiogroup: click checks EXACTLY ONE radio (roving tabindex) and enables Complete — selection alone never writes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		const radios = tierRadios(root);
		radios[2].click(); // tier 3: +1 Interest, -1 Patience

		expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true', 'false']);
		expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '-1', '0', '-1']);
		expect(completeBtn(root)!.disabled).toBe(false);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});

	test('tier radiogroup is keyboard-operable: ArrowDown moves the checked tier (selection follows focus)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		const radios = tierRadios(root);
		radios[2].click();
		pressKey(radios[2], 'ArrowDown');

		expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'true']);
	});

	test('Complete Argument applies the selected tier (interest/patience deltas), resets the current argument, re-disables itself, and persists ONCE with legacy bytes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		tierRadios(root)[2].click(); // +1 Interest, -1 Patience
		completeBtn(root)!.click();

		expect(completeBtn(root)!.disabled).toBe(true); // armed again only by a new tier pick

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(frodoYaml, (m) => {
				m.current_interest = 4;
				m.current_patience = 2;
			}),
		);
	});

	test('Complete Argument marks used motivations as appealed-to (currentArgument resets to defaults in the same write)', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		const checkbox = root.querySelector(
			'.dse-nt__argument-motivations input[type="checkbox"]',
		) as HTMLInputElement;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change')); // schedules a persist…
		tierRadios(root)[3].click(); // crit: +1 Interest
		completeBtn(root)!.click(); // …which COALESCES with the complete's persist

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		// One debounced flush serializing the FINAL model state (F1 §4.2): the used
		// motivation is appealed-to, the tier applied, currentArgument back to defaults.
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(frodoYaml, (m) => {
				m.motivations[0].hasBeenAppealedTo = true;
				m.current_interest = 4;
			}),
		);
	});
});

describe('T-7: reset menu — per-instance (CB-4), resetData + rebuild + persist', () => {
	afterEach(() => {
		jest.useRealTimers();
		Notice.notices.length = 0;
		Menu.lastMenu = null;
	});

	test('the options button is a REAL labelled button; its menu offers exactly Reset Negotiation; clicking resets the model, rebuilds the DOM, and persists the reset bytes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		let root = await renderFrodo(pipeline, host);

		// Mutate first so the reset is observable: patience 3 -> 1 (flushed write #1).
		patienceBubble(root, 1).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(pressedPatience(root)).toEqual([0, 1]);

		const button = menuBtn(root)!;
		expect(button.tagName).toBe('BUTTON');
		expect(button.getAttribute('aria-label')).toBe('Negotiation options');
		button.click();
		const menu = Menu.lastMenu!;
		expect(menu.items).toHaveLength(1);
		expect(menu.items[0].title).toBe('Reset Negotiation');
		expect(menu.items[0].icon).toBe('rotate-ccw');

		menu.items[0].onClickCallback!();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(Notice.notices).toContain('Negotiation reset to initial state');
		// The DOM was rebuilt from the reset model (framework default update()).
		root = host.containerEl.firstElementChild as HTMLElement;
		expect(pressedPatience(root)).toEqual([0, 1, 2, 3]);
		// Write #2 is the reset state — byte-identical to a fresh parse of the fixture.
		expect(host.replaceSource).toHaveBeenCalledTimes(2);
		expect(host.replaceSource.mock.calls[1][0]).toBe(legacyBytes(frodoYaml));
	});

	test('CB-4: with TWO trackers rendered, resetting tracker A never touches tracker B (the legacy singleton reset hit the last-rendered block)', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const hostA = makeHost();
		const hostB = makeHost({
			blockKey: () => 'Note.md::ds-nt::40',
			getBlockInfo: () => ({ language: 'ds-nt', lineStart: 40, lineEnd: 60 }),
		});
		const rootA = await renderFrodo(pipeline, hostA);
		const rootB = await renderFrodo(pipeline, hostB); // B renders LAST (the CB-4 trap)

		// Mutate both: A -> patience 2, B -> patience 1 (each flushes its own write #1).
		patienceBubble(rootA, 2).click();
		patienceBubble(rootB, 1).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(hostA.replaceSource).toHaveBeenCalledTimes(1);
		expect(hostB.replaceSource).toHaveBeenCalledTimes(1);

		// Reset tracker A through ITS OWN menu.
		menuBtn(rootA)!.click();
		Menu.lastMenu!.items[0].onClickCallback!();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		// A got the reset write and rebuilt to the fixture-initial state…
		expect(hostA.replaceSource).toHaveBeenCalledTimes(2);
		expect(hostA.replaceSource.mock.calls[1][0]).toBe(legacyBytes(frodoYaml));
		expect(pressedPatience(hostA.containerEl.firstElementChild as HTMLElement)).toEqual([0, 1, 2, 3]);
		// …and B is untouched: no extra write, DOM still shows ITS mutation.
		expect(hostB.replaceSource).toHaveBeenCalledTimes(1);
		expect(pressedPatience(rootB)).toEqual([0, 1]);
	});
});

describe('T-7: canPersist=false — read-only renders WITHOUT write affordances, zero writes (F1 §4.4)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('readonly badge attr; no menu/Complete buttons; bubbles + checkboxes REAL-disabled; tiers render STATIC; interacting never writes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost({ canPersist: false });
		const root = await renderFrodo(pipeline, host);

		// Framework-level read-only affordance (the CSS badge hangs off this attribute).
		expect(root.hasAttribute('data-dse-readonly')).toBe(true);
		// Write actions are gated off entirely (no dead-end affordances)…
		expect(menuBtn(root)).toBeNull();
		expect(completeBtn(root)).toBeNull();
		// …state displays stay visible but inert: REAL disabled (CB-8 — the kit guard
		// also swallows synthetic clicks), and the tier panel is plain static rows.
		for (let i = 0; i <= 5; i++) {
			expect(patienceBubble(root, i).disabled).toBe(true);
			expect(interestBubble(root, i).disabled).toBe(true);
		}
		root.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
			expect((cb as HTMLInputElement).disabled).toBe(true);
		});
		expect(root.querySelector('[role="radiogroup"]')).toBeNull();
		expect(root.querySelector('.dse-nt__argument .dse-pr')).not.toBeNull();

		patienceBubble(root, 1).click();
		expect(pressedPatience(root)).toEqual([0, 1, 2, 3]); // unchanged
		const checkbox = root.querySelector('.dse-nt__motivations input[type="checkbox"]') as HTMLInputElement;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change'));
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);

		expect(host.replaceSource).not.toHaveBeenCalled();
	});

	test('tabs still switch read-only (session UI state is not a document write)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost({ canPersist: false });
		const root = await renderFrodo(pipeline, host);

		const [argTab, learnTab] = tabEls(root);
		learnTab.click();
		expect(learnTab.getAttribute('aria-selected')).toBe('true');
		expect(argTab.getAttribute('aria-selected')).toBe('false');
	});
});

describe('T-7: persisted write path through a REAL ReadingModeBlockHost + FakeVault (F1 §3.4/§4.2)', () => {
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
		patienceBubble(root, 1).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(app.vault.modifyCalls).toHaveLength(1);
		const updated = app.vault.getContent('Note.md')!;
		expect(updated.startsWith('# Session notes\n\nBefore text.\n\n```ds-nt\n')).toBe(true);
		expect(updated.endsWith('\n```\n\nAfter text.')).toBe(true);
		const body = updated.match(/```ds-nt\n([\s\S]*?)\n```/)?.[1];
		expect(body).toBe(legacyBytes(frodoYaml, (m) => (m.current_patience = 1)));
	});
});

describe('T-7: registered EXACTLY ONCE — framework registry owns ds-nt*, RegisterElements.ts does not', () => {
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

	test('rendering a ds-nt block through the wired processor produces the kit negotiation DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-nt\n' + frodoYaml.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-nt');

		await handler(frodoYaml, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('negotiation');
		expect(root.querySelector('.dse-nt')).not.toBeNull();
		expect(root.querySelectorAll('.dse-nt__patience .dse-nt__bubble')).toHaveLength(6);
	});
});
