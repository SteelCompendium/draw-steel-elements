// D1 Task 2 (Plan 03) — Skills: the second element on Framework v2 and the first
// *interactive* one (F1 §6 step 3). Session-only collapse (both whole-element and
// per-group) via SessionStore, keyed by host.blockKey() — never written back to the note
// (Skills has no `serialize`). Mirrors horizontal-rule.test.ts's convention of driving
// elements through the REAL ElementPipeline with real framework services.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import type { SessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin } from '../../mocks/obsidian';
import { skillsElement } from '../../../src/elements/skills/definition';
import { SkillsView } from '../../../src/elements/skills/view';
// SkillsSchema.yaml $refs the shared component-wrapper dependency schema (F1 §5) — main.ts
// registers it once at plugin load; tests driving the REAL ValidationService need to do the
// same, so pull the same constant onload() uses rather than duplicating the schema id/text.
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';

const BASE_SKILLS_YAML = [
	'skills:',
	'  - climb',
	'  - alchemy',
	'custom_skills:',
	'  - name: Falconry',
	'    has_skill: true',
	'    skill_group: exploration',
	'    description: "Train and fly a falcon."',
	'  - name: Juggling',
	'    has_skill: false',
].join('\n');

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-skills', lineStart: 0, lineEnd: 2 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-skills::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real service instances, same convention as horizontal-rule.test.ts's makeDeps(). An
 *  optional shared SessionStore lets the "persists across a re-render" test simulate two
 *  separate pipeline.run() calls (as Obsidian's postprocessor re-invocation would produce)
 *  against the SAME session-scoped state. */
function makeDeps(session: SessionStore = createSessionStore()): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const theme = createThemeService();
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) {
		validation.addDependencySchema(id, schema);
	}
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

function groupEl(root: HTMLElement, label: string): HTMLElement {
	const found = Array.from(root.querySelectorAll('.ds-skill-group')).find(
		(el) => el.querySelector('h3')?.textContent === label,
	);
	if (!found) throw new Error(`no .ds-skill-group with heading "${label}" found`);
	return found as HTMLElement;
}

describe('D1 Task 2: skills ElementDefinition (F1 §6 step 3)', () => {
	test('id/aliases/shape/schema match the preserved ds-skills contract; no serialize (interactive, not persisted)', () => {
		expect(skillsElement.id).toBe('skills');
		expect(skillsElement.aliases).toEqual(['ds-skills']);
		expect(skillsElement.shape).toBe('interactive');
		expect(skillsElement.schema).toBeDefined();
		expect(skillsElement.serialize).toBeUndefined();
	});

	test('createView returns a SkillsView', () => {
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
		expect(skillsElement.createView(cx as any)).toBeInstanceOf(SkillsView);
	});
});

describe('D1 Task 2: skills rendered through the REAL ElementPipeline', () => {
	test('root carries data-dse-element="skills" and data-dse-theme (F1 §3.5 contract)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('skills');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
	});

	test('renders the built-in skill groups with correct enabled/disabled indicators', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelector('.ds-skills-container')).not.toBeNull();

		const exploration = groupEl(root, 'Exploration');
		const climbItem = Array.from(exploration.querySelectorAll('.ds-skill-item')).find(
			(li) => li.querySelector('.ds-skill-name')?.textContent === 'Climb',
		)!;
		expect(climbItem.querySelector('.ds-skill-indicator')?.classList.contains('enabled')).toBe(true);
		const jumpItem = Array.from(exploration.querySelectorAll('.ds-skill-item')).find(
			(li) => li.querySelector('.ds-skill-name')?.textContent === 'Jump',
		)!;
		expect(jumpItem.querySelector('.ds-skill-indicator')?.classList.contains('disabled')).toBe(true);
	});

	test('custom_skills with a matching skill_group are merged into that built-in group', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const exploration = groupEl(root, 'Exploration');
		const falconryItem = Array.from(exploration.querySelectorAll('.ds-skill-item')).find(
			(li) => li.querySelector('.ds-skill-name')?.textContent === 'Falconry',
		)!;
		expect(falconryItem).toBeDefined();
		expect(falconryItem.querySelector('.ds-skill-indicator')?.classList.contains('enabled')).toBe(true);
		expect(falconryItem.querySelector('.ds-skill-name')?.getAttribute('title')).toBe('Train and fly a falcon.');
	});

	test('custom_skills with no (or unmatched) skill_group land in the "Custom Skills" bucket (fixes the Vue crash bug)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const customSkills = groupEl(root, 'Custom Skills');
		const juggling = Array.from(customSkills.querySelectorAll('.ds-skill-item')).find(
			(li) => li.querySelector('.ds-skill-name')?.textContent === 'Juggling',
		)!;
		expect(juggling).toBeDefined();
		expect(juggling.querySelector('.ds-skill-indicator')?.classList.contains('disabled')).toBe(true);
	});

	test('an unmatched skill_group does not crash — also lands in "Custom Skills"', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const yaml = ['custom_skills:', '  - name: Riddling', '    skill_group: nonsense-group'].join('\n');

		await pipeline.run(skillsElement, yaml, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const customSkills = groupEl(root, 'Custom Skills');
		expect(
			Array.from(customSkills.querySelectorAll('.ds-skill-name')).some((el) => el.textContent === 'Riddling'),
		).toBe(true);
	});

	describe('group-level collapse (interactive, session-only, F1 §4.3)', () => {
		test('clicking a group heading collapses it (removes the list) and writes SessionStore — NO vault write', async () => {
			const session = createSessionStore();
			const deps = makeDeps(session);
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);
			const root = host.containerEl.firstElementChild as HTMLElement;
			const crafting = groupEl(root, 'Crafting');
			expect(crafting.querySelector('.ds-skill-list')).not.toBeNull();

			const indicator = crafting.querySelector('.heading-collapse-indicator') as HTMLElement;
			indicator.click();

			expect(crafting.querySelector('.ds-skill-list')).toBeNull();
			expect(session.get<boolean>(host.blockKey(), 'group:crafting')).toBe(true);
			expect(host.replaceSource).not.toHaveBeenCalled();
		});

		test('the collapsed state PERSISTS ACROSS A RE-RENDER via SessionStore (same blockKey)', async () => {
			const session = createSessionStore();
			const deps = makeDeps(session);
			const pipeline = new ElementPipeline(deps);

			// First render: mount, then collapse the "Crafting" group.
			const hostA = makeHost();
			await pipeline.run(skillsElement, BASE_SKILLS_YAML, hostA);
			const rootA = hostA.containerEl.firstElementChild as HTMLElement;
			(groupEl(rootA, 'Crafting').querySelector('.heading-collapse-indicator') as HTMLElement).click();
			expect(groupEl(rootA, 'Crafting').querySelector('.ds-skill-list')).toBeNull();

			// Second render: a FRESH host/container (simulating Obsidian re-running the
			// postprocessor) with the SAME blockKey() — the group must start collapsed.
			const hostB = makeHost();
			await pipeline.run(skillsElement, BASE_SKILLS_YAML, hostB);
			const rootB = hostB.containerEl.firstElementChild as HTMLElement;
			expect(groupEl(rootB, 'Crafting').querySelector('.ds-skill-list')).toBeNull();
			// An untouched group is unaffected — persistence is per-group, not global.
			expect(groupEl(rootB, 'Exploration').querySelector('.ds-skill-list')).not.toBeNull();
		});

		test('clicking again re-expands the group', async () => {
			const session = createSessionStore();
			const deps = makeDeps(session);
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);
			const root = host.containerEl.firstElementChild as HTMLElement;
			const indicator = groupEl(root, 'Crafting').querySelector('.heading-collapse-indicator') as HTMLElement;

			indicator.click();
			indicator.click();

			expect(groupEl(root, 'Crafting').querySelector('.ds-skill-list')).not.toBeNull();
			expect(session.get<boolean>(host.blockKey(), 'group:crafting')).toBe(false);
		});
	});

	describe('whole-element ComponentWrapper collapse (collapsible / collapse_default, preserved YAML contract)', () => {
		test('collapsible: false hides the eye-toggle indicator', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();
			const yaml = ['collapsible: false', 'skills:', '  - climb'].join('\n');

			await pipeline.run(skillsElement, yaml, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelector('.ds-kit-eye-container')).toBeNull();
			expect(root.querySelector('.ds-skills-container')).not.toBeNull();
		});

		test('collapse_default: true starts the whole element collapsed', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();
			const yaml = ['collapse_default: true', 'skills:', '  - climb'].join('\n');

			await pipeline.run(skillsElement, yaml, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelector('.ds-kit-collapsed-wrapper')).not.toBeNull();
			expect(root.querySelector('.ds-skills-container')).toBeNull();
			expect(root.querySelector('.ds-kit-collapsed-wrapper strong')?.textContent).toBe('Skill List');
		});

		test('toggling the whole-element eye indicator writes SessionStore and never touches the vault', async () => {
			const session = createSessionStore();
			const deps = makeDeps(session);
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);
			const root = host.containerEl.firstElementChild as HTMLElement;
			const eye = root.querySelector('.ds-kit-eye-indicator') as HTMLElement;

			eye.click();

			expect(root.querySelector('.ds-skills-container')).toBeNull();
			expect(session.get<boolean>(host.blockKey(), 'collapsed')).toBe(true);
			expect(host.replaceSource).not.toHaveBeenCalled();
		});
	});

	describe('only_show_selected (preserved YAML contract)', () => {
		test('filters skill items to only the selected skills; group headers still show, with NO collapse toggle', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();
			const yaml = ['only_show_selected: true', 'skills:', '  - climb'].join('\n');

			await pipeline.run(skillsElement, yaml, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const exploration = groupEl(root, 'Exploration');
			expect(exploration.querySelectorAll('.ds-skill-item')).toHaveLength(1);
			expect(exploration.querySelector('.ds-skill-name')?.textContent).toBe('Climb');
			expect(exploration.querySelector('.heading-collapse-indicator')).toBeNull();

			// A group with zero selected skills still shows its header (docs/skills-element.md).
			const crafting = groupEl(root, 'Crafting');
			expect(crafting.querySelectorAll('.ds-skill-item')).toHaveLength(0);
			expect(crafting.querySelector('h3')).not.toBeNull();
		});
	});

	describe('schema validation failure', () => {
		test('an unknown skill enum value renders the error card (schema stage), not the skill list', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();
			const yaml = ['skills:', '  - not-a-real-skill'].join('\n');

			await pipeline.run(skillsElement, yaml, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.getAttribute('data-dse-error-stage')).toBe('schema');
			expect(root.querySelector('.dse-error-card')).not.toBeNull();
			expect(root.querySelector('.ds-skills-container')).toBeNull();
			expect(root.querySelectorAll('.dse-error-card-list-item').length).toBeGreaterThan(0);
		});
	});

	test('ties SkillsView to host.addChild (block lifecycle)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const addChild = jest.fn((child: unknown) => child);
		const hostWithSpy = { ...host, addChild };

		await pipeline.run(skillsElement, BASE_SKILLS_YAML, hostWithSpy as BlockHost);

		expect(addChild).toHaveBeenCalledTimes(1);
		expect(addChild.mock.calls[0][0]).toBeInstanceOf(SkillsView);
	});
});
