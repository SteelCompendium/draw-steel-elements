// Plan 09 Task 7 (D2 §3.10) — Negotiation Tracker redesigned onto the D2 kit: cardHead
// (CB-16: the name slot, never a dangling "Negotiation: " prefix), kit tabs (a REAL
// tablist; active tab in cx.session, OD-7), powerRollPanel(selectable) (the Task-0
// radiogroup — role="radio" + aria-checked, exactly one tier). SC-379 replaced the
// iconButton bubbles with two kit track() radiogroups of numbered seals (Patience across,
// Interest down) plus the "negotiation over" band. Every legacy click-<div> becomes a
// real, keyboard-operable control. CB-4 (the legacy singleton-processor reset
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
import { App, Plugin, Menu, Notice, parseYaml, stringifyYaml, makeFakeContext } from '../../mocks/obsidian';
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

// -- kit-DOM accessors (D2 §3.10 grammar; SC-379 track() seals) --
const patienceSlot = (root: HTMLElement, i: number) =>
	root.querySelector(`.dse-nt__patience .dse-track__slot[data-value="${i}"]`) as HTMLButtonElement;
const checkedPatience = (root: HTMLElement): number[] =>
	[0, 1, 2, 3, 4, 5].filter((i) => patienceSlot(root, i).getAttribute('aria-checked') === 'true');
const interestSlot = (root: HTMLElement, i: number) =>
	root.querySelector(`.dse-nt__interest .dse-track__slot[data-value="${i}"]`) as HTMLButtonElement;
const checkedInterest = (root: HTMLElement): number[] =>
	[0, 1, 2, 3, 4, 5].filter((i) => interestSlot(root, i).getAttribute('aria-checked') === 'true');
const interestOffer = (root: HTMLElement, i: number) =>
	interestSlot(root, i).querySelector('.dse-track__text') as HTMLElement;
const motivationChip = (root: HTMLElement, name: string) =>
	Array.from(root.querySelectorAll('.dse-nt__argument .dse-nt__chip[data-kind="motivation"]')).find((c) =>
		c.textContent!.includes(name),
	) as HTMLButtonElement;
const pitfallChip = (root: HTMLElement, name: string) =>
	Array.from(root.querySelectorAll('.dse-nt__argument .dse-nt__chip[data-kind="pitfall"]')).find((c) =>
		c.textContent!.includes(name),
	) as HTMLButtonElement;
const spentChip = (root: HTMLElement, name: string) =>
	Array.from(root.querySelectorAll('.dse-nt__dossier-col[data-kind="motivation"] .dse-nt__dos')).find((r) =>
		r.querySelector('.dse-nt__dos-name')!.textContent === name,
	)!.querySelector('.dse-nt__chip') as HTMLButtonElement;
const bandEl = (root: HTMLElement) => root.querySelector('.dse-nt__end') as HTMLElement | null;
const tabEls = (root: HTMLElement) =>
	Array.from(root.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
const tierRadios = (root: HTMLElement) =>
	Array.from(root.querySelectorAll('.dse-nt__argument .dse-pr__row')) as HTMLButtonElement[];
const completeBtn = (root: HTMLElement) =>
	root.querySelector('.dse-nt__complete .dse-btn') as HTMLButtonElement | null;
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

	test('patience: a horizontal track of 6 REAL <button role="radio"> seals — aria-checked only on 3, data-fill on/spent/floor, ONE Tab stop, "3 / 5" readout', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		const group = root.querySelector('.dse-nt__patience .dse-track') as HTMLElement;
		expect(group.classList.contains('dse-track--horizontal')).toBe(true);
		expect(group.getAttribute('role')).toBe('radiogroup');
		expect(group.getAttribute('aria-label')).toBe('Patience');
		expect(root.querySelectorAll('.dse-nt__patience .dse-track__slot')).toHaveLength(6);
		for (let i = 0; i <= 5; i++) {
			const slot = patienceSlot(root, i);
			expect(slot.tagName).toBe('BUTTON');
			expect(slot.getAttribute('type')).toBe('button');
			expect(slot.getAttribute('role')).toBe('radio');
			expect(slot.getAttribute('aria-label')).toBe(`Patience ${i}`);
			expect(slot.textContent).toBe(String(i));
		}
		// initial_patience: 3 — only seal 3 is checked; 1..3 remain (on), 4..5 spent, 0 the floor.
		expect(checkedPatience(root)).toEqual([3]);
		expect([0, 1, 2, 3, 4, 5].map((i) => patienceSlot(root, i).getAttribute('data-fill'))).toEqual([
			'floor', 'on', 'on', 'on', 'spent', 'spent',
		]);
		expect(patienceSlot(root, 3).hasAttribute('data-current')).toBe(true);
		expect([0, 1, 2, 3, 4, 5].map((i) => patienceSlot(root, i).getAttribute('tabindex'))).toEqual([
			'-1', '-1', '-1', '0', '-1', '-1',
		]);
		expect(root.querySelector('.dse-nt__readout')!.getAttribute('aria-hidden')).toBe('true');
		expect(root.querySelector('.dse-nt__readout')!.textContent).toBe('3/ 5');
	});

	test('interest: a vertical track, rows 5..0 in DOM order carrying the fixture offers; the checked row holds the "now" tag; NO legacy data-reached anywhere', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		const root = await renderFrodo(pipeline, host);

		const group = root.querySelector('.dse-nt__interest .dse-track') as HTMLElement;
		expect(group.classList.contains('dse-track--vertical')).toBe(true);
		expect(group.getAttribute('role')).toBe('radiogroup');
		expect(group.getAttribute('aria-label')).toBe('Interest');
		const rows = Array.from(root.querySelectorAll('.dse-nt__interest .dse-track__slot'));
		expect(rows.map((r) => r.getAttribute('data-value'))).toEqual(['5', '4', '3', '2', '1', '0']);
		expect(interestOffer(root, 5).textContent).toBe('Remembers the taste of strawberries and cream!');
		expect(interestOffer(root, 0).textContent).toBe("Thinks you're after the ring; becomes hostile");
		for (let i = 0; i <= 5; i++) {
			expect(interestSlot(root, i).tagName).toBe('BUTTON');
			expect(interestSlot(root, i).getAttribute('role')).toBe('radio');
			// the row's name carries the offer, so AT does not hear a bare number
			expect(interestSlot(root, i).getAttribute('aria-label')).toContain(`Interest ${i}: `);
			// every Interest seal is plain — the track paints no "remaining" fill
			expect(interestSlot(root, i).getAttribute('data-fill')).toBe('plain');
		}
		expect(checkedInterest(root)).toEqual([3]);
		// the "now" tag sits on row 3 only; the legacy reached/passed-rung fade is gone
		const tags = root.querySelectorAll('.dse-nt__now');
		expect(tags).toHaveLength(1);
		expect(tags[0].parentElement).toBe(interestSlot(root, 3));
		expect(tags[0].textContent).toBe('now');
		expect(root.querySelector('[data-reached]')).toBeNull();
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

	test('dossier cards: a motivation row has exactly ONE control (the Spent chip); a pitfall row has none; the open count is "1 of 2 open" after one is spent', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		const dossier = root.querySelector('.dse-nt__dossier') as HTMLElement;
		const names = Array.from(dossier.querySelectorAll('.dse-nt__dos-name')).map((el) => el.textContent);
		expect(names).toEqual(['Higher Authority', 'Peace', 'Power']);
		for (const row of dossier.querySelectorAll('.dse-nt__dossier-col[data-kind="motivation"] .dse-nt__dos')) {
			expect(row.querySelectorAll('button, input')).toHaveLength(1);
			const chip = row.querySelector('button') as HTMLButtonElement;
			expect(chip.getAttribute('data-kind')).toBe('spent');
			expect(chip.getAttribute('aria-pressed')).toBe('false');
			expect(chip.textContent).toBe('Mark spent');
		}
		for (const row of dossier.querySelectorAll('.dse-nt__dossier-col[data-kind="pitfall"] .dse-nt__dos')) {
			expect(row.querySelector('button, input')).toBeNull();
		}
		expect(dossier.textContent).toContain('The ring is too powerful to ignore');
		expect(dossier.querySelector('.dse-nt__dossier-col[data-kind="motivation"] .dse-nt__dossier-count')!.textContent).toBe('2 of 2 open');
		expect(dossier.querySelector('.dse-nt__dossier-col[data-kind="pitfall"] .dse-nt__dossier-count')!.textContent).toBe('1 known');
		// no checkbox anywhere on the cards (the legacy checkbox is gone)
		expect(dossier.querySelector('input[type="checkbox"]')).toBeNull();
	});

	test('chips live ONLY inside the argument tabpanel: every appeal/mention chip is there, and the cards hold none', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		const panel = root.querySelector('[role="tabpanel"]') as HTMLElement;
		const appeal = Array.from(root.querySelectorAll('.dse-nt__chip[data-kind="motivation"], .dse-nt__chip[data-kind="pitfall"]'));
		expect(appeal).toHaveLength(3); // Higher Authority, Peace, Power
		for (const chip of appeal) {
			expect(chip.tagName).toBe('BUTTON');
			expect(panel.contains(chip)).toBe(true);
			expect(chip.classList.contains('dse-optchip')).toBe(true);
			expect(chip.getAttribute('aria-pressed')).toBe('false');
		}
		expect(root.querySelector('.dse-nt__dossier .dse-nt__chip:not([data-kind="spent"])')).toBeNull();
		expect(root.querySelectorAll('.dse-nt__dossier .dse-nt__chip')).toHaveLength(2); // the two Spent chips only
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
			'../../../src/drawSteelAdmonition/negotiation/EndBandView.ts',
			'../../../src/framework/kit/track.ts',
			'../../../src/drawSteelAdmonition/negotiation/ArgumentView.ts',
			'../../../src/drawSteelAdmonition/negotiation/LearnMoreView.ts',
			'../../../src/drawSteelAdmonition/negotiation/MotivationsPitfallsView.ts',
		];
		for (const file of files) {
			const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
			expect(styleGuardFindings(src)).toEqual([]);
		}
	});

	test('CSS contract: .dse-nt scoped under [data-dse-element="negotiation"], on tokens; the kit .dse-track rules exist; the legacy bubble/ladder + root hairline rules are GONE; every Steel rule is print-excluded', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		const noComments = sheet.replace(/\/\*[\s\S]*?\*\//g, '');

		// The structure block: a container-queried flex column on the --dse-pad plate.
		const block = noComments.match(/\[data-dse-element="negotiation"\]\s+\.dse-nt\s*\{[\s\S]*?\n\}/);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/container-name:\s*dse-nt/);
		expect(block![0]).toMatch(/@container dse-nt \(max-width: 420px\)/);
		expect(block![0]).toMatch(/var\(--dse-border\)/); // base-tier hairlines (print keeps them)
		// …and carries NO colour/ring/gradient of its own — that is the Steel tier's job.
		expect(block![0]).not.toMatch(/var\(--dse-(accent|metal|vp|surface-sunken)\b/);

		// The kit track rules live in the sheet, beside .dse-pr.
		for (const sel of ['.dse-track', '.dse-track__slot', '.dse-track__mark', '.dse-track--vertical .dse-track__slot::before']) {
			expect(noComments).toContain(sel);
		}

		// The seal is opaque in the BASE tier too (print never reaches the Steel tier), or the
		// rails strike through the numerals on paper.
		const baseMark = noComments.match(/\n\.dse-track__mark\s*\{([^}]*)\}/);
		expect(baseMark![1]).toMatch(/background-color:\s*var\(--dse-surface\)/);

		// The legacy bubble/ladder/connector rules and the root hairline pair are evicted.
		expect(noComments).not.toMatch(/\.ds-nt-/);
		expect(noComments).not.toMatch(/\.dse-nt__bubble/);
		expect(noComments).not.toMatch(/\.dse-nt__interest-(ladder|row|offer|header)/);
		expect(noComments).not.toMatch(/\.dse-nt__patience-track/);
		expect(noComments).not.toMatch(/\[data-reached\]/);
		const root = noComments.match(/\[data-dse-element="negotiation"\]:not\(\[data-dse-error-stage\]\)\s*\{[^}]*\}/);
		expect(root![0]).not.toMatch(/letter-spacing/);
		expect(noComments).not.toMatch(/\[data-dse-element="negotiation"\]:not\(\[data-dse-error-stage\]\)::(before|after)/);

		// Every Steel-material rule for the card AND the track opens print-excluded.
		const steelRules = [...noComments.matchAll(/([^{}]*\.(?:dse-nt__(?:patience|readout|interest|now|end|label|complete-hint)[\w-]*|dse-track[\w-]*)[^{}]*)\{([^{}]*)\}/g)]
			.filter((m) => /\[data-dse-theme='steel'\]/.test(m[1]));
		expect(steelRules.length).toBeGreaterThan(15);
		for (const m of steelRules) {
			expect(m[1]).toContain(`:not([data-dse-print="on"])`);
		}
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

	test('clicking Patience seal 1 repaints the track IN PLACE (checked + fill + readout), then persists exactly once with legacy bytes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);
		const sealBefore = patienceSlot(root, 1);

		patienceSlot(root, 1).click();

		// Sub-view updated its own DOM in place (no rebuild) — still inside the debounce.
		expect(patienceSlot(root, 1)).toBe(sealBefore);
		expect(checkedPatience(root)).toEqual([1]);
		expect([0, 1, 2, 3, 4, 5].map((i) => patienceSlot(root, i).getAttribute('data-fill'))).toEqual([
			'floor', 'on', 'spent', 'spent', 'spent', 'spent',
		]);
		expect(root.querySelector('.dse-nt__readout-value')!.textContent).toBe('1');
		expect(host.replaceSource).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(legacyBytes(frodoYaml, (m) => (m.current_patience = 1)));
	});

	test('clicking Interest row 2 repaints the track in place (checked + [data-current] + the now-tag moves) + one write with legacy bytes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		interestSlot(root, 2).click();

		expect(checkedInterest(root)).toEqual([2]);
		expect(interestSlot(root, 2).hasAttribute('data-current')).toBe(true);
		expect(interestSlot(root, 3).hasAttribute('data-current')).toBe(false);
		expect(root.querySelectorAll('.dse-nt__now')).toHaveLength(1);
		expect(root.querySelector('.dse-nt__now')!.parentElement).toBe(interestSlot(root, 2));

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(legacyBytes(frodoYaml, (m) => (m.current_interest = 2)));
	});

	test('rapid mutations coalesce into ONE write serializing the final model state', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		patienceSlot(root, 1).click();
		interestSlot(root, 2).click();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(frodoYaml, (m) => {
				m.current_patience = 1;
				m.current_interest = 2;
			}),
		);
	});

	test('argument-tab appeal chip -> aria-pressed + currentArgument.motivationsUsed -> one write with legacy bytes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		motivationChip(root, 'Higher Authority').click();

		expect(motivationChip(root, 'Higher Authority').getAttribute('aria-pressed')).toBe('true');
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(frodoYaml, (m) => m.currentArgument.motivationsUsed.push('Higher Authority')),
		);
	});

	test('a pitfall chip writes pitfallsUsed (legacy bytes) and toggles back off', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		pitfallChip(root, 'Power').click();
		expect(pitfallChip(root, 'Power').getAttribute('aria-pressed')).toBe('true');
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(frodoYaml, (m) => m.currentArgument.pitfallsUsed.push('Power')),
		);

		pitfallChip(root, 'Power').click();
		expect(pitfallChip(root, 'Power').getAttribute('aria-pressed')).toBe('false');
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource.mock.calls[1][0]).toBe(legacyBytes(frodoYaml));
	});

	test('dossier Spent chip -> setMotivationUsed -> one write with legacy bytes; the row, chip and count repaint in place', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);
		const chip = spentChip(root, 'Higher Authority');

		chip.click();

		expect(spentChip(root, 'Higher Authority')).toBe(chip); // same node, no rebuild
		expect(chip.getAttribute('aria-pressed')).toBe('true');
		expect(chip.textContent).toBe('Spent');
		expect(chip.querySelector('.dse-nt__chip-check')).not.toBeNull();
		expect(chip.closest('.dse-nt__dos')!.classList.contains('is-spent')).toBe(true);
		expect(chip.closest('.dse-nt__dos')!.querySelector('.dse-nt__dos-glyph')!.textContent).toBe('◇');
		expect(root.querySelector('.dse-nt__dossier-col[data-kind="motivation"] .dse-nt__dossier-count')!.textContent).toBe('1 of 2 open');
		// the argument tab follows: the appeal chip now reads spent
		expect(motivationChip(root, 'Higher Authority').classList.contains('is-spent')).toBe(true);
		expect(motivationChip(root, 'Higher Authority').querySelector('.dse-nt__chip-note')!.textContent).toBe('spent');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(frodoYaml, (m) => m.setMotivationUsed('Higher Authority', true)),
		);

		chip.click(); // and back: unspent
		expect(chip.getAttribute('aria-pressed')).toBe('false');
		expect(motivationChip(root, 'Higher Authority').classList.contains('is-spent')).toBe(false);
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

		motivationChip(root, 'Higher Authority').click(); // schedules a persist…
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

	test('the options button is a REAL labelled button; its menu offers exactly Reset negotiation; clicking resets the model, rebuilds the DOM, and persists the reset bytes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		let root = await renderFrodo(pipeline, host);

		// Mutate first so the reset is observable: patience 3 -> 1 (flushed write #1).
		patienceSlot(root, 1).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(checkedPatience(root)).toEqual([1]);

		const button = menuBtn(root)!;
		expect(button.tagName).toBe('BUTTON');
		expect(button.getAttribute('aria-label')).toBe('Negotiation options');
		button.click();
		const menu = Menu.lastMenu!;
		expect(menu.items).toHaveLength(1);
		expect(menu.items[0].title).toBe('Reset negotiation');
		expect(menu.items[0].icon).toBe('rotate-ccw');

		menu.items[0].onClickCallback!();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(Notice.notices).toContain('Negotiation reset to initial state');
		// The DOM was rebuilt from the reset model (framework default update()).
		root = host.containerEl.firstElementChild as HTMLElement;
		expect(checkedPatience(root)).toEqual([3]);
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
		patienceSlot(rootA, 2).click();
		patienceSlot(rootB, 1).click();
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
		expect(checkedPatience(hostA.containerEl.firstElementChild as HTMLElement)).toEqual([3]);
		// …and B is untouched: no extra write, DOM still shows ITS mutation.
		expect(hostB.replaceSource).toHaveBeenCalledTimes(1);
		expect(checkedPatience(rootB)).toEqual([1]);
	});
});

describe('T-7: canPersist=false — read-only renders WITHOUT write affordances, zero writes (F1 §4.4)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('readonly badge attr; no menu/Complete buttons; seals + checkboxes REAL-disabled; tiers render STATIC; interacting never writes', async () => {
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
			expect(patienceSlot(root, i).disabled).toBe(true);
			expect(interestSlot(root, i).disabled).toBe(true);
		}
		root.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
			expect((cb as HTMLInputElement).disabled).toBe(true);
		});
		// every chip — the three appeal/mention chips AND the two Spent chips — is REAL-disabled
		const chips = Array.from(root.querySelectorAll('.dse-nt__chip')) as HTMLButtonElement[];
		expect(chips).toHaveLength(5);
		for (const chip of chips) expect(chip.disabled).toBe(true);
		// the two standing tracks are radiogroups; the TIER panel is not (static rows)
		expect(root.querySelector('.dse-nt__argument [role="radiogroup"]')).toBeNull();
		expect(root.querySelector('.dse-nt__argument .dse-pr')).not.toBeNull();

		patienceSlot(root, 1).click();
		expect(checkedPatience(root)).toEqual([3]); // unchanged
		spentChip(root, 'Higher Authority').click();
		motivationChip(root, 'Higher Authority').click();
		expect(motivationChip(root, 'Higher Authority').getAttribute('aria-pressed')).toBe('false');
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
		patienceSlot(root, 1).click();
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
		expect(root.querySelectorAll('.dse-nt__patience .dse-track__slot')).toHaveLength(6);
	});
});

// ---------------------------------------------------------------------------------------
// SC-379 slice 1 — the standing region's keyboard, the 0..5 clamp, the ended band, and the
// "no YAML shape change" guarantee.
// ---------------------------------------------------------------------------------------

/** frodoYaml with a different live standing (the model reads current_* ahead of initial_*). */
function frodoAt(interest: number, patience: number): string {
	return `current_interest: ${interest}\ncurrent_patience: ${patience}\n${frodoYaml}`;
}

const PICK_HINT = 'Choose the test result to complete the argument';
const OVER_HINT = 'The negotiation is over — use ⋮ → Reset negotiation to start again.';
const hintEl = (root: HTMLElement) => root.querySelector('.dse-nt__complete-hint') as HTMLElement;
const nt = (root: HTMLElement) => root.querySelector('.dse-nt') as HTMLElement;
/** The bytes of the most recent write. */
const lastWritten = (host: { replaceSource: jest.Mock }) =>
	host.replaceSource.mock.calls[host.replaceSource.mock.calls.length - 1][0] as string;

describe('SC-379: the standing tracks are keyboard-operable (selection follows focus, one debounced write)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('ArrowRight on Patience 3 -> 4: the track repaints in place and ONE debounced write carries current_patience 4', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		pressKey(patienceSlot(root, 3), 'ArrowRight');

		expect(checkedPatience(root)).toEqual([4]);
		expect(host.replaceSource).not.toHaveBeenCalled();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(legacyBytes(frodoYaml, (m) => (m.current_patience = 4)));
	});

	test('ArrowDown on Interest 3 -> 2 (the descending list: down is a LOWER interest) with one write', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		pressKey(interestSlot(root, 3), 'ArrowDown');

		expect(checkedInterest(root)).toEqual([2]);
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(legacyBytes(frodoYaml, (m) => (m.current_interest = 2)));
	});

	test('clicking the already-checked seal writes nothing', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		patienceSlot(root, 3).click();
		interestSlot(root, 3).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);

		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('SC-379: Complete Argument keeps Interest and Patience inside 0..5', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('NegotiationData.clampStanding pins the scale: below 0 -> 0, above 5 -> 5, in range untouched', () => {
		expect(NegotiationData.clampStanding(-2)).toBe(0);
		expect(NegotiationData.clampStanding(0)).toBe(0);
		expect(NegotiationData.clampStanding(3)).toBe(3);
		expect(NegotiationData.clampStanding(5)).toBe(5);
		expect(NegotiationData.clampStanding(6)).toBe(5);
	});

	test('a lie at Interest 1 + the failing tier would write Interest -1: the written bytes are 0 (and Patience 0), in range', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		// "NPC caught a lie": a failing tier costs an extra Interest (-2), -1 Patience.
		await pipeline.run(negotiationElement, `currentArgument:\n  lieUsed: true\n${frodoAt(1, 1)}`, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		tierRadios(root)[0].click();
		expect(tierRadios(root)[0].textContent).toContain('-2 Interest');
		completeBtn(root)!.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		const written = parseYaml(lastWritten(host)) as { current_interest: number; current_patience: number };
		expect(written.current_interest).toBe(0);
		expect(written.current_patience).toBe(0);
	});

	test('the clamp does the work at BOTH ends (each would write an out-of-range number with the clamp deleted): authored 4.5 + crit is 5, not 5.5; authored 0.5 + a pitfall tier is 0, not -0.5', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		await pipeline.run(negotiationElement, frodoAt(4.5, 3), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		tierRadios(root)[3].click(); // crit: +1 Interest -> 5.5 unclamped
		completeBtn(root)!.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect((parseYaml(lastWritten(host)) as any).current_interest).toBe(5);

		const host2 = makeHost();
		await pipeline.run(negotiationElement, frodoAt(0.5, 0.5), host2);
		const root2 = host2.containerEl.firstElementChild as HTMLElement;
		tierRadios(root2)[0].click(); // -1 Interest, -1 Patience: -0.5 unclamped on both
		completeBtn(root2)!.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const w = parseYaml(lastWritten(host2)) as any;
		expect(w.current_interest).toBe(0);
		expect(w.current_patience).toBe(0);
	});

	test('a QUOTED authored number is a number: "3" + 1 is 4 (not "31" -> 5) and "2" - 1 is 1 (not .nan); the written values are numbers', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		await pipeline.run(negotiationElement, `current_interest: "3"\ncurrent_patience: "2"\n${frodoYaml}`, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(checkedInterest(root)).toEqual([3]); // the track already reads it as 3

		tierRadios(root)[2].click(); // tier 3: +1 Interest, -1 Patience
		completeBtn(root)!.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		const w = parseYaml(lastWritten(host)) as any;
		expect(w.current_interest).toBe(4);
		expect(w.current_patience).toBe(1);
		expect(lastWritten(host)).not.toMatch(/\.nan/i);
	});

	test('junk (non-numeric) authored standing is never turned into NaN: clampStanding is finite and Complete leaves the junk as authored', async () => {
		expect(NegotiationData.clampStanding('lots' as any)).toBe(0);
		expect(NegotiationData.clampStanding('4' as any)).toBe(4);
		expect(NegotiationData.clampStanding(-Infinity)).toBe(0);
		expect(NegotiationData.clampStanding(Infinity)).toBe(5);
		expect(NegotiationData.advanceStanding('lots', 1)).toBe('lots');
		expect(NegotiationData.advanceStanding('2', -1)).toBe(1);
		expect(parseNegotiationData(`current_interest: "5"\n${frodoYaml}`).ending()).toBe('deal');
		expect(parseNegotiationData(`current_interest: lots\n${frodoYaml}`).ending()).toBeNull();
	});
});

describe('SC-379: the "negotiation over" band (final / deal / hostile)', () => {
	afterEach(() => {
		jest.useRealTimers();
		Menu.lastMenu = null;
	});

	const CASES = [
		{
			kind: 'final',
			yaml: frodoAt(3, 0),
			label: 'Final offer',
			text: 'Patience is spent — the NPC makes a final offer at Interest 3: Remembers the taste of unripe strawberries',
			tag: 'final offer',
		},
		{
			kind: 'deal',
			yaml: frodoAt(5, 2),
			label: 'Negotiation over',
			text: 'Interest reached 5 — the NPC agrees: Remembers the taste of strawberries and cream!',
			tag: 'outcome',
		},
		{
			kind: 'hostile',
			yaml: frodoAt(0, 2),
			label: 'Negotiation over',
			text: "Interest fell to 0 — the NPC ends it: Thinks you're after the ring; becomes hostile",
			tag: 'outcome',
		},
	] as const;

	test.each(CASES)('$kind: data-ended, the band (flag + label + words), the now-tag, Complete disabled with the over-hint, the roll static', async ({ kind, yaml, label, text, tag }) => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		await pipeline.run(negotiationElement, yaml, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(nt(root).getAttribute('data-ended')).toBe(kind);
		const band = bandEl(root)!;
		expect(band).not.toBeNull();
		expect(band.getAttribute('data-kind')).toBe(kind);
		expect(band.querySelector('.dse-nt__end-flag')!.getAttribute('data-icon')).toBe('flag');
		expect(band.querySelector('.dse-nt__end-label')!.textContent).toBe(label);
		expect(band.querySelector('.dse-nt__end-text')!.textContent).toBe(text);
		expect(band.querySelector('.dse-nt__end-text strong')).not.toBeNull();
		// seated between the Interest board and the tabs
		expect(band.previousElementSibling).toBe(root.querySelector('.dse-nt__interest'));
		expect(band.nextElementSibling).toBe(root.querySelector('.dse-nt__actions'));
		// the now-tag, with the flag glyph once the negotiation is over
		const now = root.querySelector('.dse-nt__now')!;
		expect(now.textContent).toBe(tag);
		expect(now.querySelector('.dse-nt__now-flag')).not.toBeNull();
		// Complete: REAL disabled, with the over-hint beside it
		expect(completeBtn(root)!.disabled).toBe(true);
		expect(hintEl(root).textContent).toBe(OVER_HINT);
		// the tier panel is static: no radios leading nowhere
		expect(root.querySelector('.dse-nt__argument [role="radiogroup"]')).toBeNull();
		expect(tierRadios(root)).toHaveLength(4);
		expect(tierRadios(root)[0].tagName).not.toBe('BUTTON');
	});

	test('a live negotiation has NO data-ended, NO band and the choose-a-result hint', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		expect(nt(root).hasAttribute('data-ended')).toBe(false);
		expect(bandEl(root)).toBeNull();
		expect(hintEl(root).textContent).toBe(PICK_HINT);
		expect(root.querySelector('.dse-nt__now')!.textContent).toBe('now');
		expect(root.querySelector('.dse-nt__now-flag')).toBeNull();
	});

	test('the tracks stay operable: moving Patience back to 1 removes data-ended, the band, the over-hint (back to the choose-a-result hint) and the static roll IN PLACE (same nodes)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		await pipeline.run(negotiationElement, frodoAt(3, 0), host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		const sealBefore = patienceSlot(root, 1);
		const trackBefore = root.querySelector('.dse-nt__patience .dse-track');

		patienceSlot(root, 1).click();

		expect(host.containerEl.firstElementChild).toBe(root);
		expect(patienceSlot(root, 1)).toBe(sealBefore);
		expect(root.querySelector('.dse-nt__patience .dse-track')).toBe(trackBefore);
		expect(nt(root).hasAttribute('data-ended')).toBe(false);
		expect(bandEl(root)).toBeNull();
		expect(hintEl(root).textContent).toBe(PICK_HINT);
		expect(root.querySelector('.dse-nt__now')!.textContent).toBe('now');
		// the roll is re-armed: a live radiogroup again, Complete disabled until a pick
		expect(root.querySelector('.dse-nt__argument [role="radiogroup"]')).not.toBeNull();
		expect(tierRadios(root)[0].tagName).toBe('BUTTON');
		expect(completeBtn(root)!.disabled).toBe(true);
		tierRadios(root)[2].click();
		expect(completeBtn(root)!.disabled).toBe(false);
	});

	test('the band follows the standing live: Complete Argument that spends the last Patience raises it in place, then Interest 5 flips it to a deal', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		await pipeline.run(negotiationElement, frodoAt(3, 1), host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(bandEl(root)).toBeNull();

		tierRadios(root)[1].click(); // tier 2: no Interest change, -1 Patience -> 0
		completeBtn(root)!.click();

		expect(host.containerEl.firstElementChild).toBe(root);
		expect(nt(root).getAttribute('data-ended')).toBe('final');
		expect(bandEl(root)!.querySelector('.dse-nt__end-label')!.textContent).toBe('Final offer');
		expect(completeBtn(root)!.disabled).toBe(true);
		expect(hintEl(root).textContent).toBe(OVER_HINT);
		expect(root.querySelector('.dse-nt__argument [role="radiogroup"]')).toBeNull();
		expect(checkedPatience(root)).toEqual([0]);

		// the Director corrects the board: Interest 5 outranks spent Patience -> a deal
		interestSlot(root, 5).click();
		expect(nt(root).getAttribute('data-ended')).toBe('deal');
		expect(bandEl(root)!.querySelector('.dse-nt__end-label')!.textContent).toBe('Negotiation over');
		expect(root.querySelector('.dse-nt__now')!.textContent).toBe('outcome');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(frodoAt(3, 1), (m) => {
				m.current_patience = 0;
				m.current_interest = 5;
			}),
		);
	});

	test('Reset negotiation clears the band (the rebuilt view is live again) and writes the initial bytes', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		await pipeline.run(negotiationElement, frodoAt(3, 0), host);
		let root = host.containerEl.firstElementChild as HTMLElement;
		expect(bandEl(root)).not.toBeNull();

		menuBtn(root)!.click();
		Menu.lastMenu!.items[0].onClickCallback!();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		root = host.containerEl.firstElementChild as HTMLElement;
		expect(bandEl(root)).toBeNull();
		expect(nt(root).hasAttribute('data-ended')).toBe(false);
		expect(checkedPatience(root)).toEqual([3]);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(legacyBytes(frodoAt(3, 0), (m) => m.resetData()));
	});

	test('read-only hosts still show the band (information, not a control) — with disabled seals, no Complete', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost({ canPersist: false });
		await pipeline.run(negotiationElement, frodoAt(3, 0), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(bandEl(root)).not.toBeNull();
		expect(nt(root).getAttribute('data-ended')).toBe('final');
		expect(completeBtn(root)).toBeNull();
		expect(patienceSlot(root, 0).disabled).toBe(true);
		expect(root.querySelector('.dse-nt__argument [role="radiogroup"]')).toBeNull();
	});
});

describe('SC-379: NO YAML shape change — the model gains methods only', () => {
	afterEach(() => {
		jest.useRealTimers();
		Menu.lastMenu = null;
	});

	const LEGACY_KEYS = [
		'name', 'initial_patience', 'current_patience', 'initial_interest', 'current_interest',
		'motivations', 'pitfalls', 'currentArgument', 'i5', 'i4', 'i3', 'i2', 'i1', 'i0',
	];

	test('ending/clampStanding/offerFor are prototype methods, never own keys, and the ending precedence is deal > hostile > final', () => {
		const m = parseNegotiationData(frodoYaml);

		for (const key of ['ending', 'clampStanding', 'offerFor']) {
			expect(Object.prototype.hasOwnProperty.call(m, key)).toBe(false);
		}
		// (`_dse_anchor` is the pre-existing sidebar passthrough: an own key, but undefined here,
		// and a YAML dump skips undefined — so it is not part of the serialized key set.)
		expect(Object.keys(m).filter((k) => (m as any)[k] !== undefined)).toEqual(LEGACY_KEYS);
		expect(m.ending()).toBeNull();
		m.current_patience = 0;
		expect(m.ending()).toBe('final');
		m.current_interest = 5;
		expect(m.ending()).toBe('deal'); // Interest 5 outranks spent Patience
		m.current_interest = 0;
		expect(m.ending()).toBe('hostile');
		expect(m.offerFor(9)).toBe(m.i5); // clamped onto the scale
		expect(m.offerFor(-1)).toBe(m.i0);
	});

	test('after a full UI session (seals, appeal, choose, complete, reset) every write has exactly the legacy key set, in the legacy order', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		let root = await renderFrodo(pipeline, host);
		const keysOfLastWrite = () => Object.keys(parseYaml(lastWritten(host)) as object);
		const flush = () => jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		patienceSlot(root, 4).click();
		interestSlot(root, 2).click();
		await flush();
		expect(keysOfLastWrite()).toEqual(LEGACY_KEYS);

		motivationChip(root, 'Higher Authority').click();
		tierRadios(root)[3].click();
		completeBtn(root)!.click();
		await flush();
		expect(keysOfLastWrite()).toEqual(LEGACY_KEYS);

		menuBtn(root)!.click();
		Menu.lastMenu!.items[0].onClickCallback!();
		await flush();
		root = host.containerEl.firstElementChild as HTMLElement;
		expect(keysOfLastWrite()).toEqual(LEGACY_KEYS);
		expect(lastWritten(host)).toBe(legacyBytes(frodoYaml));
	});

	test('the shipped example.yaml parses and renders exactly as before (both standing tracks, the 5..0 offers)', async () => {
		const example = fs.readFileSync(path.join(__dirname, '../../../src/elements/negotiation/example.yaml'), 'utf8');
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		await pipeline.run(negotiationElement, example, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(checkedPatience(root)).toEqual([3]);
		expect(checkedInterest(root)).toEqual([3]);
		expect(bandEl(root)).toBeNull();
		expect(interestOffer(root, 4).textContent).toBe('Remembers the taste of strawberries');
	});
});

// ---------------------------------------------------------------------------------------
// SC-379 slice 2 — the argument tab: chips, modifiers + why-hints, the tiers recomputed on the
// spot, the chosen mark, Complete's arming, and a tab that never goes stale after Complete.
// ---------------------------------------------------------------------------------------

const ARMED_HINT = 'Applies the chosen tier to Interest and Patience';
/** frodoYaml with "Higher Authority" already spent (a previous argument used it). */
const frodoHaSpent = frodoYaml.replace(
	`reason: "It's Frodo's duty to destroy the ring"`,
	`reason: "It's Frodo's duty to destroy the ring"\n    hasBeenAppealedTo: true`,
);
const modLine = (root: HTMLElement, startsWith: string) =>
	Array.from(root.querySelectorAll('.dse-nt__mods .dse-nt__check')).find((l) =>
		l.querySelector('span')!.textContent!.startsWith(startsWith),
	) as HTMLElement;
const modBox = (root: HTMLElement, startsWith: string) => modLine(root, startsWith).querySelector('input') as HTMLInputElement;
const tierTexts = (root: HTMLElement) => tierRadios(root).map((r) => r.querySelector('.dse-pr__text')!.textContent);

describe('SC-379: the argument tab — chips, modifiers, recompute-in-place', () => {
	afterEach(() => {
		jest.useRealTimers();
		document.body.innerHTML = '';
	});

	test('the tooltip says Medium (the Heroes book), never Easy', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const root = await renderFrodo(pipeline, makeHost());

		const heads = Array.from(root.querySelectorAll('.dse-nt__appeals-head')) as HTMLElement[];
		expect(heads[0].getAttribute('aria-label')).toContain('Difficulty of the Argument Test is Medium.');
		expect(root.innerHTML).not.toContain('is Easy');
	});

	test('chip grammar: a motivation chip is ◆ (◇ + a struck "spent" note once used before), a pressed chip carries a check, the pitfall chip carries the warning triangle', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		await pipeline.run(negotiationElement, frodoHaSpent, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const ha = motivationChip(root, 'Higher Authority');
		const peace = motivationChip(root, 'Peace');
		expect(ha.querySelector('.dse-nt__chip-glyph')!.textContent).toBe('◇');
		expect(ha.classList.contains('is-spent')).toBe(true);
		expect(ha.querySelector('.dse-nt__chip-note')!.textContent).toBe('spent');
		expect(peace.querySelector('.dse-nt__chip-glyph')!.textContent).toBe('◆');
		expect(peace.querySelector('.dse-nt__chip-note')).toBeNull();
		expect(pitfallChip(root, 'Power').querySelector('.dse-nt__chip-icon')!.getAttribute('data-icon')).toBe('triangle-alert');

		expect(peace.querySelector('.dse-nt__chip-check')).toBeNull();
		peace.click();
		expect(peace.getAttribute('aria-pressed')).toBe('true');
		expect(peace.querySelector('.dse-nt__chip-check')!.getAttribute('data-icon')).toBe('check');
	});

	test('toggling the Higher Authority chip recomputes the tiers to the motivation table BEFORE any write echo, in the same panel slot', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);
		expect(tierTexts(root)[0]).toContain('-1 Interest, -1 Patience'); // the plain-argument table

		motivationChip(root, 'Higher Authority').click();

		// motivation table: tier 1 = no Interest, -1 Patience; tier 2 = +1 Interest, -1 Patience; tier 3/crit = +1 Interest
		expect(tierTexts(root)).toEqual(['-1 Patience', '+1 Interest, -1 Patience', '+1 Interest', '+1 Interest']);
		expect(host.replaceSource).not.toHaveBeenCalled(); // nothing echoed yet
		expect(root.querySelectorAll('.dse-nt__roll-slot .dse-pr')).toHaveLength(1);

		motivationChip(root, 'Higher Authority').click(); // and back
		expect(tierTexts(root)[0]).toContain('-1 Interest, -1 Patience');
		pitfallChip(root, 'Power').click(); // a pitfall: every tier is -1/-1
		expect(new Set(tierTexts(root))).toEqual(new Set(['-1 Interest, -1 Patience']));
	});

	test('keyboard focus stays on the chip across the recompute (chips and boxes are updated, never recreated)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);
		document.body.appendChild(host.containerEl);
		const chip = motivationChip(root, 'Higher Authority');
		chip.focus();
		expect(document.activeElement).toBe(chip);

		chip.click();

		expect(motivationChip(root, 'Higher Authority')).toBe(chip);
		expect(document.activeElement).toBe(chip);

		const lie = modBox(root, 'NPC caught a lie');
		lie.focus();
		lie.checked = true;
		lie.dispatchEvent(new Event('change'));
		expect(modBox(root, 'NPC caught a lie')).toBe(lie);
		expect(document.activeElement).toBe(lie);
		expect(tierTexts(root)[1]).toContain('Interest'); // recomputed too
	});

	test('a previously CHOSEN tier stays chosen across a chip/modifier change (its result recomputed from the new table)', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		tierRadios(root)[2].click(); // tier 3 (17+): +1 Interest, -1 Patience on the plain table
		motivationChip(root, 'Higher Authority').click(); // tier 3 is now +1 Interest only

		expect(tierRadios(root).map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true', 'false']);
		expect(completeBtn(root)!.disabled).toBe(false);
		completeBtn(root)!.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		// the NEW table's tier 3 was applied: Interest +1, Patience unchanged
		const w = parseYaml(lastWritten(host)) as any;
		expect(w.current_interest).toBe(4);
		expect(w.current_patience).toBe(3);
	});

	test('why-hints: shown ONLY while a modifier is greyed out, and the lines enable/disable in place with the chips', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		await pipeline.run(negotiationElement, frodoHaSpent, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		const whys = () => Array.from(root.querySelectorAll('.dse-nt__why')).map((w) => w.textContent);

		// no motivation appealed: "reuse" is greyed (no spent one appealed), "same argument" is live
		expect(modBox(root, 'Reuses').disabled).toBe(true);
		expect(modLine(root, 'Reuses').classList.contains('is-disabled')).toBe(true);
		expect(modBox(root, 'Argument has already').disabled).toBe(false);
		expect(modBox(root, 'NPC caught').disabled).toBe(false);
		expect(whys()).toEqual(['only when a spent Motivation is appealed to']);

		motivationChip(root, 'Higher Authority').click(); // appeal the SPENT motivation
		expect(modBox(root, 'Reuses').disabled).toBe(false);
		expect(modBox(root, 'Reuses').checked).toBe(true); // reuse is known, flagged for the Director
		expect(modBox(root, 'Argument has already').disabled).toBe(true);
		expect(whys()).toEqual(['not while a Motivation is appealed to']);

		motivationChip(root, 'Higher Authority').click(); // off again
		expect(modBox(root, 'Reuses').disabled).toBe(true);
		expect(modBox(root, 'Reuses').checked).toBe(false);
		expect(whys()).toEqual(['only when a spent Motivation is appealed to']);
	});

	test('the chosen tier row carries the "chosen" mark (check + word); only that row; Complete arms with the accent variant and says what it will do', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const root = await renderFrodo(pipeline, makeHost());
		expect(root.querySelector('.dse-nt__chosen')).toBeNull();
		expect(completeBtn(root)!.classList.contains('dse-btn--accent')).toBe(false);
		expect(hintEl(root).textContent).toBe(PICK_HINT);

		tierRadios(root)[1].click();

		const marks = root.querySelectorAll('.dse-nt__roll-slot .dse-nt__chosen');
		expect(marks).toHaveLength(1);
		expect(marks[0].parentElement).toBe(tierRadios(root)[1]);
		expect(marks[0].textContent).toBe('chosen');
		expect(marks[0].querySelector('[data-icon="check"]')).not.toBeNull();
		expect(completeBtn(root)!.classList.contains('dse-btn--accent')).toBe(true);
		expect(hintEl(root).textContent).toBe(ARMED_HINT);

		tierRadios(root)[3].click(); // the mark MOVES with the selection
		expect(root.querySelectorAll('.dse-nt__chosen')).toHaveLength(1);
		expect(root.querySelector('.dse-nt__chosen')!.parentElement).toBe(tierRadios(root)[3]);
	});

	test('modifier checkboxes write the legacy fields (legacy bytes) and recompute', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		const lie = modBox(root, 'NPC caught');
		lie.checked = true;
		lie.dispatchEvent(new Event('change'));
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(legacyBytes(frodoYaml, (m) => (m.currentArgument.lieUsed = true)));
		expect(tierTexts(root)[0]).toContain('-2 Interest');
	});

	test('chips and modifiers stay operable once the negotiation is over (the next Reset clears them)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		await pipeline.run(negotiationElement, frodoAt(3, 0), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(motivationChip(root, 'Peace').disabled).toBe(false);
		motivationChip(root, 'Peace').click();
		expect(motivationChip(root, 'Peace').getAttribute('aria-pressed')).toBe('true');
		expect(root.querySelector('.dse-nt__argument [role="radiogroup"]')).toBeNull(); // still static
		expect(completeBtn(root)!.disabled).toBe(true);
	});
});

describe('SC-379: the tab is never stale after a live Complete Argument (M3)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('after Complete (negotiation still live): chips unpressed, modifiers cleared and re-evaluated, NO tier checked, no chosen mark, Complete disarmed — the tab matches the reset model', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const root = await renderFrodo(pipeline, host);

		motivationChip(root, 'Higher Authority').click();
		pitfallChip(root, 'Power').click();
		const lie = modBox(root, 'NPC caught');
		lie.checked = true;
		lie.dispatchEvent(new Event('change'));
		tierRadios(root)[1].click();
		expect(completeBtn(root)!.disabled).toBe(false);

		completeBtn(root)!.click();

		// the view was NOT rebuilt (SC-340 adoption keeps it across our own write) …
		expect(host.containerEl.firstElementChild).toBe(root);
		// … yet the tab already matches the model's reset currentArgument
		for (const chip of root.querySelectorAll('.dse-nt__argument .dse-nt__chip')) {
			expect(chip.getAttribute('aria-pressed')).toBe('false');
		}
		expect(modBox(root, 'NPC caught').checked).toBe(false);
		expect(modBox(root, 'Reuses').checked).toBe(false);
		expect(modBox(root, 'Argument has already').disabled).toBe(false);
		expect(root.querySelector('.dse-nt__why')?.textContent).toBe('only when a spent Motivation is appealed to');
		expect(tierRadios(root).map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false']);
		expect(root.querySelector('.dse-nt__chosen')).toBeNull();
		expect(tierTexts(root)[0]).toContain('-1 Interest, -1 Patience'); // the plain table again
		expect(completeBtn(root)!.disabled).toBe(true);
		expect(completeBtn(root)!.classList.contains('dse-btn--accent')).toBe(false);
		expect(hintEl(root).textContent).toBe(PICK_HINT);
		// the cards followed: Higher Authority is now spent, and its appeal chip says so
		expect(spentChip(root, 'Higher Authority').getAttribute('aria-pressed')).toBe('true');
		expect(motivationChip(root, 'Higher Authority').classList.contains('is-spent')).toBe(true);
		expect(root.querySelector('.dse-nt__dossier-count')!.textContent).toBe('1 of 2 open');

		// and the model really was reset: the written YAML carries an empty current argument
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const w = parseYaml(lastWritten(host)) as any;
		expect(w.currentArgument).toEqual({
			motivationsUsed: [],
			pitfallsUsed: [],
			lieUsed: false,
			sameArgumentUsed: false,
			reusedMotivation: false,
		});

		// the next argument works from a clean slate: re-ticking the chip adds it again
		motivationChip(root, 'Higher Authority').click();
		expect(motivationChip(root, 'Higher Authority').getAttribute('aria-pressed')).toBe('true');
		tierRadios(root)[1].click();
		expect(completeBtn(root)!.disabled).toBe(false);
	});
});
