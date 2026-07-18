// D8 Task 6 (spec §4) — Montage Test tracker through the REAL ElementPipeline: cardHead +
// canPersist-gated Reset menu (negotiation-sibling), the round-track's steppers + live
// outcome-band readout (montageOutcome, model.ts), and the participants "record test"
// row (skill-reuse warning, never a block — AGENT 94) with an optional deterministic
// roll-driven test row. Same harness shape as counter.test.ts (no schema, no compendium
// dep — real service instances, local makeDeps/makeHost).
import * as fs from 'fs';
import * as path from 'path';
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import { createRenderContext } from '../../../src/framework/context';
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
import { resolveRoll } from '../../../src/framework/roll/engine';
import type { RollService } from '../../../src/framework/roll/service';
import type { DiceSource, RollInput } from '../../../src/framework/roll/types';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, Menu, Notice, parseYaml, makeFakeContext } from '../../mocks/obsidian';
import { montageElement } from '../../../src/elements/montage/definition';
import { MontageView } from '../../../src/elements/montage/view';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import { styleGuardFindings } from '../kit/styleGuard';
import montageYaml from '../../../src/elements/montage/example.yaml';

const MT_ALIASES = ['ds-montage'] as const;

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-montage', lineStart: 0, lineEnd: 12 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-montage::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** A seeded RollService stub (recon §10: resolve(input, dice?) sync, injected DiceSource
 *  — recon: service.ts:37/54) — replays `faces` on every resolve() call that doesn't
 *  bring its own dice, mirroring rollTestHelpers.ts's stubService but exercising the
 *  SYNC path montage actually drives (never NATIVE_DICE in tests). */
function stubRollService(faces: number[]): RollService {
	const seeded = (): DiceSource => {
		let i = 0;
		return { rollDie: () => faces[i++] ?? 1 };
	};
	return {
		resolve: (input: RollInput, dice?: DiceSource) => resolveRoll(input, dice ?? seeded()),
		roll: async (input: RollInput) => resolveRoll(input, seeded()),
		dice: seeded(),
		delegate: 'native',
	};
}

/** Real service instances, same convention as counter.test.ts — montage declares no
 *  schema and has no compendium dep, so neither ValidationService nor CompendiumIndex is
 *  ever consulted. ElementPipelineDeps.roll is REQUIRED (the real plugin always wires a
 *  RollService) — the "no cx.roll" degrade is exercised at the bare-RenderContext level
 *  instead (below), never by handing this a falsy roll. */
function makeDeps(roll: RollService = stubRollService([5, 6])): ElementPipelineDeps {
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
		roll,
	};
}

async function renderMontage(
	source: string = montageYaml,
	hostOverrides: Partial<BlockHost> = {},
	roll: RollService = stubRollService([5, 6]),
) {
	const pipeline = new ElementPipeline(makeDeps(roll));
	const host = makeHost(hostOverrides);
	await pipeline.run(montageElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { host, root };
}

// -- kit-DOM accessors --
const outcomeEl = (root: HTMLElement) => root.querySelector('.dse-mt__outcome') as HTMLElement;
const tallyStepper = (root: HTMLElement, label: string) =>
	root.querySelector(`.dse-stepper[aria-label="${label}"]`) as HTMLElement;
const tallyPlus = (root: HTMLElement, label: string) =>
	tallyStepper(root, label).querySelector('[aria-label^="Increase"]') as HTMLButtonElement;
const tallyMinus = (root: HTMLElement, label: string) =>
	tallyStepper(root, label).querySelector('[aria-label^="Decrease"]') as HTMLButtonElement;
/** The stepper's own numeric display: an editable stepper's value lives in the
 *  `<input>`'s `.value` PROPERTY (never `.textContent` — inputs don't have any), while a
 *  read-only stepper renders a plain `.dse-stepper__value` span instead. */
const tallyNumber = (root: HTMLElement, label: string): string => {
	const s = tallyStepper(root, label);
	const input = s.querySelector('.dse-stepper__input') as HTMLInputElement | null;
	return input ? input.value : ((s.querySelector('.dse-stepper__value') as HTMLElement).textContent ?? '');
};
/** The static "/ limit" (or "/ rounds") caption alongside a tally/round stepper. */
const tallyLimit = (root: HTMLElement, label: string): string =>
	(tallyStepper(root, label).parentElement?.querySelector('.dse-mt__tally-limit') as HTMLElement)
		.textContent ?? '';
const menuBtn = (root: HTMLElement) => root.querySelector('.dse-mt__menu') as HTMLButtonElement | null;
const participantEl = (root: HTMLElement, name: string) =>
	Array.from(root.querySelectorAll('.dse-mt__participant')).find(
		(el) => el.querySelector('.dse-mt__participant-name')?.textContent === name,
	) as HTMLElement;
const skillChips = (participant: HTMLElement) =>
	Array.from(participant.querySelectorAll('.dse-mt__skill-chip')).map((el) => el.textContent);
const skillInput = (participant: HTMLElement) =>
	participant.querySelector('.dse-mt__skill-input') as HTMLInputElement;
const successBtn = (participant: HTMLElement) =>
	participant.querySelector('[aria-label^="Record success"]') as HTMLButtonElement;
const failureBtn = (participant: HTMLElement) =>
	participant.querySelector('[aria-label^="Record failure"]') as HTMLButtonElement;
const rollBtn = (participant: HTMLElement) =>
	participant.querySelector('[aria-label^="Roll a test"]') as HTMLButtonElement | null;
const charInput = (participant: HTMLElement) =>
	participant.querySelector('.dse-mt__char-input') as HTMLInputElement | null;

describe('T-6: montage ElementDefinition (spec §4)', () => {
	test('id/name/aliases/shape match the brief; persisted with serialize, NO schema, no auto ref-resolution', () => {
		expect(montageElement.id).toBe('montage');
		expect(montageElement.name).toBe('Montage Test tracker');
		expect(montageElement.aliases).toEqual([...MT_ALIASES]);
		expect(montageElement.shape).toBe('persisted');
		expect(montageElement.schema).toBeUndefined();
		expect(montageElement.autoResolveRefs).toBe(false);
		expect(montageElement.serialize).toBeDefined();
	});

	test('createView returns a MontageView', () => {
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
		expect(montageElement.createView(cx as any)).toBeInstanceOf(MontageView);
	});
});

describe('T-6: montage rendered through the REAL ElementPipeline (spec §4.2)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('root carries data-dse-element="montage" + theme; ONE .dse-mt', async () => {
		const { root } = await renderMontage();
		expect(root.getAttribute('data-dse-element')).toBe('montage');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
		expect(root.querySelectorAll('.dse-mt')).toHaveLength(1);
	});

	test('cardHead: title, success/failure/round steppers, and the live outcome readout render from example.yaml', async () => {
		const { root } = await renderMontage();

		const name = root.querySelector('.dse-head__primary--left') as HTMLElement;
		expect(name.textContent).toBe('Cross the Ashfall Wastes');
		expect(root.querySelector('.dse-head__eyebrow--left')?.textContent).toBe('Montage Test');

		expect(tallyNumber(root, 'Successes')).toBe('0');
		expect(tallyLimit(root, 'Successes')).toBe('/ 5');
		expect(tallyNumber(root, 'Failures')).toBe('0');
		expect(tallyLimit(root, 'Failures')).toBe('/ 3');
		expect(tallyNumber(root, 'Current round')).toBe('1');
		expect(tallyLimit(root, 'Current round')).toBe('/ 2');

		// successes 0, failures 0, current_round 1 of 2 -> not exhausted -> live "failure" band.
		expect(outcomeEl(root).getAttribute('data-outcome')).toBe('failure');
		expect(outcomeEl(root).textContent).toBe('Total Failure');
	});

	test('an unnamed montage heads as plain "Montage Test" — no dangling colon, no duplicated eyebrow', async () => {
		const { root } = await renderMontage('success_limit: 5\nfailure_limit: 3');
		const name = root.querySelector('.dse-head__primary--left') as HTMLElement;
		expect(name.textContent).toBe('Montage Test');
		expect(root.querySelector('.dse-head__eyebrow--left')).toBeNull();
	});

	test('participants: Kira renders with her existing skill chips (Nature, Endurance) from the fixture', async () => {
		const { root } = await renderMontage();
		const kira = participantEl(root, 'Kira');
		expect(kira).toBeDefined();
		expect(skillChips(kira)).toEqual(['Nature', 'Endurance']);
	});

	test('stepping successes to success_limit flips the outcome readout to "Total Success"', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage();

		for (let i = 0; i < 5; i++) tallyPlus(root, 'Successes').click();

		expect(tallyNumber(root, 'Successes')).toBe('5');
		expect(tallyLimit(root, 'Successes')).toBe('/ 5');
		expect(outcomeEl(root).getAttribute('data-outcome')).toBe('total');
		expect(outcomeEl(root).textContent).toBe('Total Success');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
	});

	test('source hygiene: the view + montage sub-views pass the shared kit style guard (no inline color, no color literals)', () => {
		const files = [
			'../../../src/elements/montage/view.ts',
			'../../../src/elements/montage/RoundTrackView.ts',
			'../../../src/elements/montage/ParticipantsView.ts',
		];
		for (const file of files) {
			const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
			expect(styleGuardFindings(src)).toEqual([]);
		}
	});

	test('CSS contract: .dse-mt scoped under [data-dse-element="montage"], tokens only', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		const block = sheet.match(/\[data-dse-element="montage"\]\s+\.dse-mt\s*\{[\s\S]*?\n\}/);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/var\(--dse-accent\)/);
		expect(block![0]).toMatch(/var\(--dse-warn\)/);
	});
});

describe('T-6: record test — skill-reuse warning (AGENT 94), never a block', () => {
	afterEach(() => {
		jest.useRealTimers();
		Notice.notices.length = 0;
	});

	test('recording Nature again for Kira surfaces a reuse warning Notice but STILL records the skill + the tally', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage();
		const kira = participantEl(root, 'Kira');

		skillInput(kira).value = 'Nature';
		successBtn(kira).click();

		expect(Notice.notices.some((n) => n.includes('already used Nature'))).toBe(true);

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		const kiraAfter = participantEl(rebuilt, 'Kira');
		expect(skillChips(kiraAfter)).toEqual(['Nature', 'Endurance', 'Nature']);
		expect(tallyNumber(rebuilt, 'Successes')).toBe('1');
		expect(tallyLimit(rebuilt, 'Successes')).toBe('/ 5');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
	});

	test('recording a NEW skill for Kira appends it with no warning; a failure tallies failures', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage();
		const kira = participantEl(root, 'Kira');

		skillInput(kira).value = 'Intimidate';
		failureBtn(kira).click();

		expect(Notice.notices.some((n) => n.includes('already used'))).toBe(false);
		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(skillChips(participantEl(rebuilt, 'Kira'))).toEqual(['Nature', 'Endurance', 'Intimidate']);
		expect(tallyNumber(rebuilt, 'Failures')).toBe('1');
		expect(tallyLimit(rebuilt, 'Failures')).toBe('/ 3');
	});

	test('recording with NO skill entered tallies the result without touching skills_used', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage();
		const kira = participantEl(root, 'Kira');

		successBtn(kira).click();

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(skillChips(participantEl(rebuilt, 'Kira'))).toEqual(['Nature', 'Endurance']);
		expect(tallyNumber(rebuilt, 'Successes')).toBe('1');
		expect(tallyLimit(rebuilt, 'Successes')).toBe('/ 5');
	});
});

describe('T-6: the deterministic roll-driven test row (D5 RollService.resolve, injected DiceSource)', () => {
	afterEach(() => {
		jest.useRealTimers();
		Notice.notices.length = 0;
	});

	test('a seeded tier-3 roll (natural 19, hits characteristic) records a SUCCESS and appends the skill', async () => {
		jest.useFakeTimers();
		// 9 + 10 = natural 19 -> tier 3 with characteristic +3 -> success (tier >= 2).
		const roll = stubRollService([9, 10]);
		const { root, host } = await renderMontage(montageYaml, {}, roll);
		const kira = participantEl(root, 'Kira');
		expect(rollBtn(kira)).not.toBeNull();

		skillInput(kira).value = 'Nature';
		charInput(kira)!.value = '3';
		rollBtn(kira)!.click();

		expect(Notice.notices.some((n) => n.includes('already used Nature'))).toBe(true);
		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(tallyNumber(rebuilt, 'Successes')).toBe('1');
		expect(tallyLimit(rebuilt, 'Successes')).toBe('/ 5');
		expect(tallyNumber(rebuilt, 'Failures')).toBe('0');
		expect(tallyLimit(rebuilt, 'Failures')).toBe('/ 3');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
	});

	test('a seeded tier-1 roll (low faces, no characteristic bonus) records a FAILURE', async () => {
		jest.useFakeTimers();
		// 2 + 3 = natural 5, no characteristic/skill -> low total -> tier 1 -> failure.
		const roll = stubRollService([2, 3]);
		const { root, host } = await renderMontage(montageYaml, {}, roll);
		const kira = participantEl(root, 'Kira');

		rollBtn(kira)!.click();

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(tallyNumber(rebuilt, 'Successes')).toBe('0');
		expect(tallyLimit(rebuilt, 'Successes')).toBe('/ 5');
		expect(tallyNumber(rebuilt, 'Failures')).toBe('1');
		expect(tallyLimit(rebuilt, 'Failures')).toBe('/ 3');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
	});

	test('no RollService (cx.roll undefined) degrades to manual-only rows — no Roll button, no throw', async () => {
		// ElementPipelineDeps.roll is REQUIRED (the real plugin always supplies one via
		// createRollService) — the only way a view ever sees a genuinely-absent cx.roll
		// is a bare RenderContext built outside the pipeline (main.ts's defensive
		// fallback comment on RollView applies here too). Built directly via
		// createRenderContext + createView + mount, mirroring pipeline.ts's own
		// construction (context.ts's factory omits `roll` when not passed).
		const deps = makeDeps(stubRollService([5, 6]));
		const host = makeHost();
		const cx = createRenderContext({
			app: deps.app,
			plugin: deps.plugin,
			settings: deps.settings,
			host,
			theme: deps.theme,
			prefs: deps.prefs,
			refs: deps.refs,
			session: deps.session,
			// roll intentionally omitted
		});
		const model = montageElement.parse(parseYaml(montageYaml), montageYaml);
		const view = montageElement.createView(cx);
		view.setSerializer(montageElement.serialize!);
		host.addChild(view);
		await view.mount(host.containerEl, model);

		const kira = participantEl(host.containerEl, 'Kira');
		expect(rollBtn(kira)).toBeNull();
		expect(charInput(kira)).toBeNull();
		expect(successBtn(kira)).not.toBeNull();
	});
});

describe('T-6: reset menu — Reset progress clears successes/failures/round/skills_used, keeps config', () => {
	afterEach(() => {
		jest.useRealTimers();
		Notice.notices.length = 0;
		Menu.lastMenu = null;
	});

	test('the options button opens exactly Reset progress; clicking it zeroes progress, clears skill history, rebuilds, and persists', async () => {
		jest.useFakeTimers();
		let { root, host } = await renderMontage();

		tallyPlus(root, 'Successes').click();
		tallyPlus(root, 'Successes').click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);

		const button = menuBtn(root)!;
		expect(button.getAttribute('aria-label')).toBe('Montage options');
		button.click();
		const menu = Menu.lastMenu!;
		expect(menu.items).toHaveLength(1);
		expect(menu.items[0].title).toBe('Reset progress');

		menu.items[0].onClickCallback!();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(Notice.notices).toContain('Montage progress reset');
		root = host.containerEl.firstElementChild as HTMLElement;
		expect(tallyNumber(root, 'Successes')).toBe('0');
		expect(tallyLimit(root, 'Successes')).toBe('/ 5');
		expect(tallyNumber(root, 'Current round')).toBe('1');
		expect(tallyLimit(root, 'Current round')).toBe('/ 2');
		expect(skillChips(participantEl(root, 'Kira'))).toEqual([]);
		// title/rounds/limits/participant roster survive the reset (config, not progress).
		expect((root.querySelector('.dse-head__primary--left') as HTMLElement).textContent).toBe(
			'Cross the Ashfall Wastes',
		);
		expect(host.replaceSource).toHaveBeenCalledTimes(2);
	});
});

describe('T-6: canPersist=false — read-only renders WITHOUT write affordances, zero writes (F1 §4.4)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('readonly badge attr; no menu, no record form; steppers REAL-disabled; interacting never writes', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage(montageYaml, { canPersist: false });

		expect(root.hasAttribute('data-dse-readonly')).toBe(true);
		expect(menuBtn(root)).toBeNull();
		expect(tallyPlus(root, 'Successes').disabled).toBe(true);
		expect(tallyMinus(root, 'Successes').disabled).toBe(true);
		// No record form on a read-only host — the chips still show.
		const kira = participantEl(root, 'Kira');
		expect(skillChips(kira)).toEqual(['Nature', 'Endurance']);
		expect(kira.querySelector('.dse-mt__record')).toBeNull();

		tallyPlus(root, 'Successes').click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('T-6: persisted write path through a REAL ReadingModeBlockHost + FakeVault (F1 §3.4/§4.2)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('a failure stepper click inside a ```ds-montage block -> exactly one Vault write; surrounding note bytes intact', async () => {
		jest.useFakeTimers();
		const app = new App();
		const note = ['# Session notes', '', 'Before text.', '', '```ds-montage', montageYaml.trimEnd(), '```', '', 'After text.'].join(
			'\n',
		);
		app.vault.setFile('Note.md', note);
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, 'Note.md');
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-montage');
		const pipeline = new ElementPipeline(makeDeps());

		await pipeline.run(montageElement, montageYaml, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		tallyPlus(root, 'Failures').click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(app.vault.modifyCalls).toHaveLength(1);
		const updated = app.vault.getContent('Note.md')!;
		expect(updated.startsWith('# Session notes\n\nBefore text.\n\n```ds-montage\n')).toBe(true);
		expect(updated.endsWith('\n```\n\nAfter text.')).toBe(true);
		const body = updated.match(/```ds-montage\n([\s\S]*?)\n```/)?.[1];
		expect(body).toContain('failures: 1');
	});
});

describe('T-6: registered EXACTLY ONCE — framework registry owns ds-montage, RegisterElements.ts does not', () => {
	test('registerFrameworkElementDefinitions registers montage; the alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);

		expect(registry.get('montage')?.id).toBe('montage');
		for (const alias of MT_ALIASES) {
			expect(registry.get(alias)?.id).toBe('montage');
		}
	});

	test("through the REAL onload(): ds-montage gets exactly one registerMarkdownCodeBlockProcessor call", async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		const registerSpy = jest.spyOn(plugin, 'registerMarkdownCodeBlockProcessor');

		await plugin.onload();

		const calls = registerSpy.mock.calls.filter(([language]: [string]) => language === 'ds-montage');
		expect(calls).toHaveLength(1);
		expect(plugin.frameworkV2!.registry.get('ds-montage')?.id).toBe('montage');

		registerSpy.mockRestore();
	});

	test('rendering a ds-montage block through the wired processor produces the kit montage DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-montage\n' + montageYaml.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-montage');

		await handler(montageYaml, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('montage');
		expect(root.querySelector('.dse-mt')).not.toBeNull();
	});
});
