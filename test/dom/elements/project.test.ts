// D8 Task 7 (spec §5) — Project/Downtime tracker through the REAL ElementPipeline: the
// progress bar (accrued/goal_points), manual + roller "Add project roll" (breakthrough
// AGENT 878's +20-and-another-roll), "Log respite," canPersist gating (F1 §4.4), and the
// optional D6 goal_code resolution (a seeded fake CompendiumIndex — no adapter exists for
// the `project` SCC type, so the view reads getEntity() directly; test/dom/elements/
// refUnwrapView.test.ts established this fakeCompendium convention).
import * as fs from 'fs';
import * as path from 'path';
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import { createRenderContext } from '../../../src/framework/context';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
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
import type { CompendiumIndex, CompendiumEntity } from '../../../src/services/CompendiumIndex';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, parseYaml, makeFakeContext } from '../../mocks/obsidian';
import { projectElement } from '../../../src/elements/project/definition';
import { ProjectView } from '../../../src/elements/project/view';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import { styleGuardFindings } from '../kit/styleGuard';
import projectYaml from '../../../src/elements/project/example.yaml';

const PRJ_ALIASES = ['ds-project'] as const;

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-project', lineStart: 0, lineEnd: 12 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-project::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** A seeded RollService stub (recon §10: resolve(input, dice?) sync, injected DiceSource
 *  — service.ts:37/54), same convention as montage.test.ts's stubRollService. */
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

/** Minimal fake CompendiumIndex (refUnwrapView.test.ts's convention) — only the members
 *  ProjectView actually calls (available/getEntity) do real work. */
function fakeCompendium(over: {
	available?: boolean;
	getEntity?: (code: string) => Promise<CompendiumEntity | null>;
}): CompendiumIndex {
	return {
		available: over.available ?? true,
		getEntry: () => {
			throw new Error('not stubbed');
		},
		getEntity: over.getEntity ?? (async () => null),
		getStatblock: async () => {
			throw new Error('not stubbed');
		},
		query: () => {
			throw new Error('not stubbed');
		},
		resolveSlug: () => [],
		registerWatchers: () => {},
	};
}

const GOAL_CODE = 'mcdm.heroes.v1/project/craft-teleportation-platform';

/** A seeded goal_code-only entity: real corpus prose shape (data-unified's own
 *  `**Project Goal:** 1,500` line) — the view's PROJECT_GOAL_RE parses THIS shape, not a
 *  structured frontmatter field (no SDK/typeAdapters model exists for `project`). */
function fakeProjectEntity(name: string, goalPointsLine: string): CompendiumEntity {
	return {
		scc: GOAL_CODE,
		type: 'project',
		name,
		source: 'mcdm.heroes.v1',
		file: {} as any,
		frontmatter: {},
		body: async () => `**Project Goal:** ${goalPointsLine}\n\nSome flavor text.`,
		model: async () => undefined,
	};
}

function makeDeps(opts: { roll?: RollService; compendium?: CompendiumIndex } = {}): ElementPipelineDeps {
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
		roll: opts.roll ?? stubRollService([5, 6]),
		compendium: opts.compendium,
	};
}

async function renderProject(
	source: string = projectYaml,
	hostOverrides: Partial<BlockHost> = {},
	deps: { roll?: RollService; compendium?: CompendiumIndex } = {},
) {
	const pipeline = new ElementPipeline(makeDeps(deps));
	const host = makeHost(hostOverrides);
	await pipeline.run(projectElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { host, root };
}

/** ProjectView.onMount is ASYNC (the optional D6 resolveGoal() await runs even on the
 *  fast "no goal_code"/"no compendium" path) — a user-driven update() from a click
 *  handler is fire-and-forget (`void this.update(model)`, matching every other kit
 *  view's convention), so its rebuild lands a few microtask ticks after click()
 *  returns. Same flush convention as encounter.test.ts's hand-off click tests; jest
 *  fake timers don't affect Promise microtask resolution, so this is safe under
 *  jest.useFakeTimers(). */
async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

// -- kit-DOM accessors --
const nameEl = (root: HTMLElement) => root.querySelector('.dse-head__primary--left') as HTMLElement;
const eyebrowEl = (root: HTMLElement) => root.querySelector('.dse-head__eyebrow--left') as HTMLElement | null;
const respiteChip = (root: HTMLElement) => root.querySelector('.dse-head__eyebrow--right') as HTMLElement | null;
const progressText = (root: HTMLElement) => (root.querySelector('.dse-prj__progress-text') as HTMLElement).textContent;
const barFill = (root: HTMLElement) => (root.querySelector('.dse-prj__bar-fill') as HTMLElement).style.getPropertyValue('--dse-fill');
const rollInput = (root: HTMLElement) => root.querySelector('.dse-prj__roll-input') as HTMLInputElement;
const pointsInput = (root: HTMLElement) => root.querySelector('.dse-prj__points-input') as HTMLInputElement;
const breakthroughCheckbox = (root: HTMLElement) =>
	root.querySelector('.dse-prj__breakthrough-label input[type="checkbox"]') as HTMLInputElement;
const addRollBtn = (root: HTMLElement) => root.querySelector('[aria-label="Add project roll"]') as HTMLButtonElement | null;
const logRespiteBtn = (root: HTMLElement) => root.querySelector('[aria-label="Log respite"]') as HTMLButtonElement | null;
const rollLogRows = (root: HTMLElement) => Array.from(root.querySelectorAll('.dse-prj__log-row'));
const breakthroughBanner = (root: HTMLElement) => root.querySelector('.dse-prj__breakthrough') as HTMLElement | null;
const rollerBtn = (root: HTMLElement) => root.querySelector('[aria-label="Roll a project test"]') as HTMLButtonElement | null;
const charInput = (root: HTMLElement) => root.querySelector('.dse-prj__char-input') as HTMLInputElement | null;

describe('T-7: project ElementDefinition (spec §5)', () => {
	test('id/name/aliases/shape match the brief; persisted with serialize, NO schema, no auto ref-resolution', () => {
		expect(projectElement.id).toBe('project');
		expect(projectElement.name).toBe('Project / Downtime tracker');
		expect(projectElement.aliases).toEqual([...PRJ_ALIASES]);
		expect(projectElement.shape).toBe('persisted');
		expect(projectElement.schema).toBeUndefined();
		expect(projectElement.autoResolveRefs).toBe(false);
		expect(projectElement.serialize).toBeDefined();
	});

	test('createView returns a ProjectView', () => {
		const deps = makeDeps();
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
			roll: deps.roll,
		});
		expect(projectElement.createView(cx)).toBeInstanceOf(ProjectView);
	});
});

describe('T-7: project rendered through the REAL ElementPipeline (spec §5.2)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('root carries data-dse-element="project" + theme; ONE .dse-prj', async () => {
		const { root } = await renderProject();
		expect(root.getAttribute('data-dse-element')).toBe('project');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
		expect(root.querySelectorAll('.dse-prj')).toHaveLength(1);
	});

	test('cardHead: name + Respite chip from example.yaml; progress bar reflects 340/1500', async () => {
		const { root } = await renderProject();

		expect(nameEl(root).textContent).toBe('Craft Teleportation Platform');
		expect(eyebrowEl(root)?.textContent).toBe('Project');
		expect(respiteChip(root)?.textContent).toBe('Respite 2');

		expect(progressText(root)).toBe('340 / 1500');
		expect(barFill(root)).toBe(`${(340 / 1500) * 100}%`);
	});

	test('prerequisites render when present', async () => {
		const { root } = await renderProject();
		const text = (root.querySelector('.dse-prj__prereqs') as HTMLElement).textContent ?? '';
		expect(text).toContain('planar lodestone');
		expect(text).toContain('Aetheric Cartography (Old Vaslorian)');
	});

	test('an unnamed, goalless project heads as plain "Project" with a 0-pt progress readout (no goal -> no fake percentage)', async () => {
		const { root } = await renderProject('accrued: 0');
		expect(nameEl(root).textContent).toBe('Project');
		expect(eyebrowEl(root)).toBeNull();
		expect(progressText(root)).toBe('0 pts');
		expect(barFill(root)).toBe('0%');
	});

	test('the existing roll log renders from example.yaml, breakthrough row flagged', async () => {
		const { root } = await renderProject();
		const rows = rollLogRows(root);
		expect(rows).toHaveLength(2);
		expect(rows[0].textContent).toContain('Respite 1');
		expect(rows[0].textContent).toContain('Roll 14');
		expect(rows[0].textContent).toContain('+14 pts');
		expect(rows[0].classList.contains('dse-prj__log-row--breakthrough')).toBe(false);
		expect(rows[1].textContent).toContain('Breakthrough');
		expect(rows[1].classList.contains('dse-prj__log-row--breakthrough')).toBe(true);
	});

	test("the example's last roll IS a breakthrough -> the bonus-roll banner shows", async () => {
		const { root } = await renderProject();
		expect(breakthroughBanner(root)?.textContent).toMatch(/breakthrough/i);
		expect(breakthroughBanner(root)?.textContent).toContain('+20');
	});

	test('source hygiene: view.ts passes the shared kit style guard (no inline color, no color literals)', () => {
		const src = fs.readFileSync(path.join(__dirname, '../../../src/elements/project/view.ts'), 'utf8');
		expect(styleGuardFindings(src)).toEqual([]);
	});

	test('CSS contract: .dse-prj scoped under [data-dse-element="project"], tokens only', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		const block = sheet.match(/\[data-dse-element="project"\]\s+\.dse-prj\s*\{[\s\S]*?\n\}/);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/var\(--dse-/);
	});
});

describe('T-7: "Add project roll" — manual entry, breakthrough +20 & bonus-roll affordance (AGENT 878)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('a plain roll (no breakthrough) appends a roll and increments accrued by its own points', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderProject('accrued: 0\ngoal_points: 100');

		rollInput(root).value = '14';
		pointsInput(root).value = '14';
		addRollBtn(root)!.click();
		await flush();

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(progressText(rebuilt)).toBe('14 / 100');
		const rows = rollLogRows(rebuilt);
		expect(rows).toHaveLength(1);
		expect(rows[0].textContent).toContain('Roll 14');
		expect(rows[0].textContent).toContain('+14 pts');
		expect(breakthroughBanner(rebuilt)).toBeNull();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toContain('accrued: 14');
	});

	test('a roll of 20 with breakthrough checked adds 20 + 20 breakthrough points (40 total) and shows the bonus-roll affordance', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderProject('accrued: 0\ngoal_points: 100\ncurrent_respite: 5');

		rollInput(root).value = '20';
		pointsInput(root).value = '20';
		breakthroughCheckbox(root).checked = true;
		addRollBtn(root)!.click();
		await flush();

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(progressText(rebuilt)).toBe('40 / 100');
		const rows = rollLogRows(rebuilt);
		expect(rows).toHaveLength(1);
		expect(rows[0].textContent).toContain('Respite 5');
		expect(rows[0].textContent).toContain('Roll 20');
		expect(rows[0].textContent).toContain('+40 pts');
		expect(rows[0].textContent).toContain('Breakthrough');
		expect(breakthroughBanner(rebuilt)).not.toBeNull();
		expect(breakthroughBanner(rebuilt)!.textContent).toContain('+20');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		const written = host.replaceSource.mock.calls[0][0];
		expect(written).toContain('accrued: 40');
		expect(written).toContain('points: 40');
		expect(written).toContain('breakthrough: true');
	});

	test('logging a further roll after a breakthrough clears the bonus-roll banner', async () => {
		jest.useFakeTimers();
		// update() rebuilds IN PLACE (unloadOwnedChildren + rootEl.empty() + onMount into
		// the SAME rootEl, framework/view.ts) — `root` stays the live node across clicks,
		// no need to re-fetch host.containerEl.firstElementChild.
		const { root } = await renderProject('accrued: 0\ngoal_points: 1000');

		rollInput(root).value = '20';
		pointsInput(root).value = '20';
		breakthroughCheckbox(root).checked = true;
		addRollBtn(root)!.click();
		await flush();
		expect(breakthroughBanner(root)).not.toBeNull();

		rollInput(root).value = '10';
		pointsInput(root).value = '10';
		breakthroughCheckbox(root).checked = false;
		addRollBtn(root)!.click();
		await flush();

		expect(breakthroughBanner(root)).toBeNull();
	});
});

describe('T-7: the optional deterministic roller row (D5 RollService.resolve, injected DiceSource)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('a seeded natural-19 roll (breakthrough) logs roll=natural, points=total (inclusive of the +20 bonus)', async () => {
		jest.useFakeTimers();
		// 9 + 10 = natural 19 -> isNat -> breakthrough. characteristic 3 -> total = 22 base, +20 bonus = 42.
		const roll = stubRollService([9, 10]);
		const { root, host } = await renderProject('accrued: 0\ngoal_points: 1000', {}, { roll });
		expect(rollerBtn(root)).not.toBeNull();

		charInput(root)!.value = '3';
		rollerBtn(root)!.click();
		await flush();

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		const rows = rollLogRows(rebuilt);
		expect(rows).toHaveLength(1);
		expect(rows[0].textContent).toContain('Roll 19');
		expect(rows[0].textContent).toContain('+42 pts');
		expect(rows[0].textContent).toContain('Breakthrough');
		expect(progressText(rebuilt)).toBe('42 / 1000');
	});

	test('a seeded low roll (no breakthrough) logs a plain roll', async () => {
		jest.useFakeTimers();
		const roll = stubRollService([2, 3]); // natural 5, no characteristic -> total 5, not nat
		const { root, host } = await renderProject('accrued: 0\ngoal_points: 1000', {}, { roll });

		rollerBtn(root)!.click();
		await flush();

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		const rows = rollLogRows(rebuilt);
		expect(rows[0].textContent).toContain('Roll 5');
		expect(rows[0].textContent).toContain('+5 pts');
		expect(rows[0].classList.contains('dse-prj__log-row--breakthrough')).toBe(false);
	});

	test('no RollService (cx.roll undefined) degrades to manual-only — no roller row, no throw', async () => {
		const deps = makeDeps({ roll: stubRollService([5, 6]) });
		const bareDeps = { ...deps, roll: undefined as unknown as RollService };
		const host = makeHost();
		const cx = createRenderContext({
			app: bareDeps.app,
			plugin: bareDeps.plugin,
			settings: bareDeps.settings,
			host,
			theme: bareDeps.theme,
			prefs: bareDeps.prefs,
			refs: bareDeps.refs,
			session: bareDeps.session,
			// roll intentionally omitted
		});
		const model = projectElement.parse(parseYaml(projectYaml), projectYaml);
		const view = projectElement.createView(cx);
		view.setSerializer(projectElement.serialize!);
		host.addChild(view);
		await view.mount(host.containerEl, model);

		expect(rollerBtn(host.containerEl)).toBeNull();
		expect(charInput(host.containerEl)).toBeNull();
		expect(addRollBtn(host.containerEl)).not.toBeNull();
	});
});

describe('T-7: "Log respite" — increments current_respite', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('clicking Log respite bumps current_respite and the head chip, and persists', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderProject();

		logRespiteBtn(root)!.click();
		await flush();

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(respiteChip(rebuilt)?.textContent).toBe('Respite 3');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toContain('current_respite: 3');
	});
});

describe('T-7: canPersist=false — read-only renders WITHOUT write affordances, zero writes (F1 §4.4)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('readonly badge attr; no roll form, no Log respite; the progress bar/log still render', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderProject(projectYaml, { canPersist: false });

		expect(root.hasAttribute('data-dse-readonly')).toBe(true);
		expect(addRollBtn(root)).toBeNull();
		expect(logRespiteBtn(root)).toBeNull();
		expect(progressText(root)).toBe('340 / 1500');
		expect(rollLogRows(root)).toHaveLength(2);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('T-7: optional D6 resolution — goal_code resolves goal_name/goal_points via CompendiumIndex.getEntity (spec §5, inline fallback otherwise)', () => {
	test('a goal_code-only model (no inline goal_name/goal_points) resolves BOTH via a seeded CompendiumIndex', async () => {
		const compendium = fakeCompendium({
			getEntity: async (code) => (code === GOAL_CODE ? fakeProjectEntity('Craft Teleportation Platform', '1,500') : null),
		});
		const source = `goal_code: "scc.v1:${GOAL_CODE}"\naccrued: 340`;
		const { root } = await renderProject(source, {}, { compendium });

		expect(nameEl(root).textContent).toBe('Craft Teleportation Platform');
		expect(progressText(root)).toBe('340 / 1500');
	});

	test('an inline goal_name/goal_points ALWAYS wins over the resolved values (never silently overwritten)', async () => {
		const compendium = fakeCompendium({
			getEntity: async () => fakeProjectEntity('Wrong Name', '9999'),
		});
		const source = `goal_name: "My Own Name"\ngoal_code: "scc.v1:${GOAL_CODE}"\ngoal_points: 42\naccrued: 10`;
		const { root } = await renderProject(source, {}, { compendium });

		expect(nameEl(root).textContent).toBe('My Own Name');
		expect(progressText(root)).toBe('10 / 42');
	});

	test('a non-numeric "Project Goal: Varies" body never fabricates a number — inline fallback (no goal shown)', async () => {
		const compendium = fakeCompendium({
			getEntity: async () => fakeProjectEntity('Learn From a Master', 'Varies'),
		});
		const source = `goal_code: "scc.v1:${GOAL_CODE}"\naccrued: 5`;
		const { root } = await renderProject(source, {}, { compendium });

		expect(nameEl(root).textContent).toBe('Learn From a Master');
		expect(progressText(root)).toBe('5 pts');
	});

	test('no compendium wired / not available: degrades to the inline goal_code with no resolution, never a crash', async () => {
		const source = `goal_code: "scc.v1:${GOAL_CODE}"\naccrued: 5`;
		const { root } = await renderProject(source, {}, {});
		expect(nameEl(root).textContent).toBe('Project');
		expect(progressText(root)).toBe('5 pts');

		const { root: root2 } = await renderProject(source, {}, { compendium: fakeCompendium({ available: false }) });
		expect(nameEl(root2).textContent).toBe('Project');
	});
});

describe('T-7: registered EXACTLY ONCE — framework registry owns ds-project, RegisterElements.ts does not', () => {
	test('registerFrameworkElementDefinitions registers project; the alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);

		expect(registry.get('project')?.id).toBe('project');
		for (const alias of PRJ_ALIASES) {
			expect(registry.get(alias)?.id).toBe('project');
		}
	});

	test("through the REAL onload(): ds-project gets exactly one registerMarkdownCodeBlockProcessor call", async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		const registerSpy = jest.spyOn(plugin, 'registerMarkdownCodeBlockProcessor');

		await plugin.onload();

		const calls = registerSpy.mock.calls.filter(([language]: [string]) => language === 'ds-project');
		expect(calls).toHaveLength(1);
		expect(plugin.frameworkV2!.registry.get('ds-project')?.id).toBe('project');

		registerSpy.mockRestore();
	});

	test('rendering a ds-project block through the wired processor produces the kit project DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-project\n' + projectYaml.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-project');

		await handler(projectYaml, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('project');
		expect(root.querySelector('.dse-prj')).not.toBeNull();
	});
});
