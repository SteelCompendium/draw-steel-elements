// Plan 09 Task 2 (D2 §3.4) — Skills on the D2 kit: the whole-element wrapper AND each
// skill group are kit `collapsible` regions (real <button aria-expanded> headers,
// hidden-attr regions, open-state round-tripped through SessionStore via the
// SessionPersist accessor — F1 §4.3, never written back to the note; Skills has no
// `serialize`). Items are `.dse-skills__item` with a `.dse-skills__mark[data-on]`
// whose enabled/disabled state is conveyed by shape + aria-label, not color alone
// (D2 §4). Replaces the D1 golden tests that pinned the OLD
// mountComponentWrapper/mountCollapsibleHeading DOM (Plan 09 global: golden DOM tests
// are REPLACED with kit-DOM + a11y tests). Mirrors values-row.test.ts's convention of
// driving the element through the REAL ElementPipeline with real framework services.
import * as fs from 'fs';
import * as path from 'path';
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
import { styleGuardFindings } from '../kit/styleGuard';
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

/** Real service instances, same convention as values-row.test.ts's makeDeps(). An
 *  optional shared SessionStore lets the "persists across a re-render" tests simulate two
 *  separate pipeline.run() calls (as Obsidian's postprocessor re-invocation would produce)
 *  against the SAME session-scoped state. */
function makeDeps(session: SessionStore = createSessionStore()): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	const theme = createThemeService(prefs, plugin as any);
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

/** A skill group container: a kit collapsible root (`.dse-collapse` — header title span)
 *  in normal mode, or a plain div with an h3 `.dse-skills__group-title` when
 *  only_show_selected. Both carry `.dse-skills__group`. */
function groupEl(root: HTMLElement, label: string): HTMLElement {
	const found = Array.from(root.querySelectorAll('.dse-skills__group')).find(
		(el) =>
			el.querySelector(':scope > .dse-collapse__header .dse-collapse__title')?.textContent === label ||
			el.querySelector(':scope > .dse-skills__group-title')?.textContent === label,
	);
	if (!found) throw new Error(`no .dse-skills__group with title "${label}" found`);
	return found as HTMLElement;
}

/** The group's collapsible header button (normal mode). */
function groupHeader(root: HTMLElement, label: string): HTMLButtonElement {
	const header = groupEl(root, label).querySelector(':scope > .dse-collapse__header');
	if (!header) throw new Error(`group "${label}" has no .dse-collapse__header`);
	return header as HTMLButtonElement;
}

/** The item <li> for a named skill within a group container. */
function itemEl(group: HTMLElement, name: string): HTMLElement {
	const found = Array.from(group.querySelectorAll('.dse-skills__item')).find(
		(li) => li.querySelector('.dse-skills__name')?.textContent === name,
	);
	if (!found) throw new Error(`no .dse-skills__item named "${name}" found`);
	return found as HTMLElement;
}

describe('Task 2: skills ElementDefinition (preserved contract)', () => {
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

describe('Plan 09 Task 2: skills rendered through the REAL ElementPipeline (kit DOM)', () => {
	test('root carries data-dse-element="skills" and data-dse-theme (F1 §3.5 contract)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('skills');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
	});

	test('kit DOM only: NO legacy .ds-skill*/.ds-kit-* DOM survives the redesign', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelector('[class*="ds-skill"]')).toBeNull();
		expect(root.querySelector('[class*="ds-kit-"]')).toBeNull();
		expect(root.querySelector('.heading-collapse-indicator')).toBeNull();
		expect(root.querySelector('.dse-skills')).not.toBeNull();
	});

	describe('whole-element wrapper = kit collapsible (collapsible/collapse_default YAML contract, F1 §1.4)', () => {
		test('default (collapsible, expanded): root wraps the list in ONE collapsible titled "Skill List" with a real <button aria-expanded="true">', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();

			await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const wrapper = root.querySelector(':scope > .dse-collapse') as HTMLElement;
			expect(wrapper).not.toBeNull();
			const header = wrapper.querySelector(':scope > .dse-collapse__header') as HTMLButtonElement;
			expect(header.tagName).toBe('BUTTON');
			expect(header.getAttribute('aria-expanded')).toBe('true');
			expect(header.querySelector('.dse-collapse__title')?.textContent).toBe('Skill List');
			// aria-controls wires the header to the region that holds the list.
			const region = wrapper.querySelector(':scope > .dse-collapse__region') as HTMLElement;
			expect(header.getAttribute('aria-controls')).toBe(region.id);
			expect(region.hidden).toBe(false);
			expect(region.querySelector('.dse-skills')).not.toBeNull();
		});

		test('collapsible: false renders the list bare — NO whole-element collapsible (groups keep theirs)', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();
			const yaml = ['collapsible: false', 'skills:', '  - climb'].join('\n');

			await pipeline.run(skillsElement, yaml, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelector(':scope > .dse-collapse')).toBeNull();
			expect(root.querySelector(':scope > .dse-skills')).not.toBeNull();
			// The per-group collapsibles are untouched by the whole-element key.
			expect(groupHeader(root, 'Exploration').getAttribute('aria-expanded')).toBe('true');
		});

		test('collapse_default: true starts the whole element collapsed (aria-expanded="false", region hidden — content stays in the DOM)', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();
			const yaml = ['collapse_default: true', 'skills:', '  - climb'].join('\n');

			await pipeline.run(skillsElement, yaml, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const header = root.querySelector(':scope > .dse-collapse > .dse-collapse__header') as HTMLButtonElement;
			const region = root.querySelector(':scope > .dse-collapse > .dse-collapse__region') as HTMLElement;
			expect(header.getAttribute('aria-expanded')).toBe('false');
			expect(region.hidden).toBe(true);
			// collapsible hides via the hidden ATTRIBUTE — the list is rendered, not destroyed.
			expect(region.querySelector('.dse-skills')).not.toBeNull();
		});

		test('toggling the whole-element header writes SessionStore (slot "open") and never touches the vault', async () => {
			const session = createSessionStore();
			const pipeline = new ElementPipeline(makeDeps(session));
			const host = makeHost();

			await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);
			const root = host.containerEl.firstElementChild as HTMLElement;
			const header = root.querySelector(':scope > .dse-collapse > .dse-collapse__header') as HTMLButtonElement;
			const region = root.querySelector(':scope > .dse-collapse > .dse-collapse__region') as HTMLElement;

			header.click();

			expect(header.getAttribute('aria-expanded')).toBe('false');
			expect(region.hidden).toBe(true);
			expect(session.get<boolean>(host.blockKey(), 'open')).toBe(false);
			expect(host.replaceSource).not.toHaveBeenCalled();
		});

		test('the whole-element collapse PERSISTS ACROSS A REMOUNT via SessionPersist (same blockKey, fresh host)', async () => {
			const session = createSessionStore();
			const pipeline = new ElementPipeline(makeDeps(session));

			const hostA = makeHost();
			await pipeline.run(skillsElement, BASE_SKILLS_YAML, hostA);
			const rootA = hostA.containerEl.firstElementChild as HTMLElement;
			(rootA.querySelector(':scope > .dse-collapse > .dse-collapse__header') as HTMLButtonElement).click();

			const hostB = makeHost();
			await pipeline.run(skillsElement, BASE_SKILLS_YAML, hostB);
			const rootB = hostB.containerEl.firstElementChild as HTMLElement;
			const headerB = rootB.querySelector(':scope > .dse-collapse > .dse-collapse__header') as HTMLButtonElement;
			expect(headerB.getAttribute('aria-expanded')).toBe('false');
			expect(
				(rootB.querySelector(':scope > .dse-collapse > .dse-collapse__region') as HTMLElement).hidden,
			).toBe(true);
		});
	});

	describe('items: .dse-skills__mark[data-on] + aria-label — state by shape + label, not color (D2 §4)', () => {
		test('an owned skill\'s mark carries [data-on] + aria-label "enabled"; an unowned one carries neither data-on nor the enabled label', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();

			await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const exploration = groupEl(root, 'Exploration');

			const climbMark = itemEl(exploration, 'Climb').querySelector('.dse-skills__mark') as HTMLElement;
			expect(climbMark.hasAttribute('data-on')).toBe(true);
			expect(climbMark.getAttribute('aria-label')).toBe('enabled');

			const jumpMark = itemEl(exploration, 'Jump').querySelector('.dse-skills__mark') as HTMLElement;
			expect(jumpMark.hasAttribute('data-on')).toBe(false);
			expect(jumpMark.getAttribute('aria-label')).toBe('disabled');
		});

		test('marks are read-only display — a <span role="img">, NOT a control (no button/checkbox), and clicking one writes nothing', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();

			await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const mark = root.querySelector('.dse-skills__mark') as HTMLElement;
			expect(mark.tagName).toBe('SPAN');
			expect(mark.getAttribute('role')).toBe('img');
			expect(root.querySelector('.dse-skills__item button, .dse-skills__item input')).toBeNull();

			mark.click();
			expect(host.replaceSource).not.toHaveBeenCalled();
		});

		test('D2 §5: zero inline color — no element carries style.color or any non---dse-* inline declaration', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();

			await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
				expect(el.style.color).toBe('');
				const inline = el.getAttribute('style');
				if (inline !== null) {
					for (const decl of inline.split(';')) {
						if (decl.trim() === '') continue;
						expect(decl.trim().startsWith('--dse-')).toBe(true);
					}
				}
			}
		});
	});

	describe('grouping semantics (unchanged content rules)', () => {
		test('custom_skills with a matching skill_group are merged into that built-in group (name title = description)', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();

			await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const exploration = groupEl(root, 'Exploration');
			const falconry = itemEl(exploration, 'Falconry');
			expect(falconry.querySelector('.dse-skills__mark')?.getAttribute('aria-label')).toBe('enabled');
			expect(falconry.querySelector('.dse-skills__name')?.getAttribute('title')).toBe('Train and fly a falcon.');
		});

		test('custom_skills with no (or unmatched) skill_group land in the "Custom Skills" bucket (preserves the Vue-crash fix)', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();

			await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const customSkills = groupEl(root, 'Custom Skills');
			const juggling = itemEl(customSkills, 'Juggling');
			expect(juggling.querySelector('.dse-skills__mark')?.getAttribute('aria-label')).toBe('disabled');
		});

		test('an unmatched skill_group does not crash — also lands in "Custom Skills"', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();
			const yaml = ['custom_skills:', '  - name: Riddling', '    skill_group: nonsense-group'].join('\n');

			await pipeline.run(skillsElement, yaml, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
			expect(itemEl(groupEl(root, 'Custom Skills'), 'Riddling')).toBeDefined();
		});
	});

	describe('per-group collapse = kit collapsible (interactive, session-only, F1 §4.3)', () => {
		test('every group renders as a collapsible with a real <button aria-expanded> wired to its region', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();

			await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const groups = root.querySelectorAll('.dse-skills > .dse-skills__group');
			expect(groups.length).toBeGreaterThanOrEqual(6); // 5 built-in + Custom Skills
			for (const group of Array.from(groups)) {
				expect(group.classList.contains('dse-collapse')).toBe(true);
				const header = group.querySelector(':scope > .dse-collapse__header') as HTMLButtonElement;
				expect(header.tagName).toBe('BUTTON');
				expect(header.getAttribute('aria-expanded')).toBe('true');
				const region = group.querySelector(':scope > .dse-collapse__region') as HTMLElement;
				expect(header.getAttribute('aria-controls')).toBe(region.id);
				expect(region.querySelector('.dse-skills__list')).not.toBeNull();
			}
		});

		test('clicking a group header collapses it (region hidden, aria-expanded="false") and writes SessionStore — NO vault write', async () => {
			const session = createSessionStore();
			const pipeline = new ElementPipeline(makeDeps(session));
			const host = makeHost();

			await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);
			const root = host.containerEl.firstElementChild as HTMLElement;
			const crafting = groupEl(root, 'Crafting');
			const region = crafting.querySelector(':scope > .dse-collapse__region') as HTMLElement;
			expect(region.hidden).toBe(false);

			groupHeader(root, 'Crafting').click();

			expect(groupHeader(root, 'Crafting').getAttribute('aria-expanded')).toBe('false');
			expect(region.hidden).toBe(true);
			// collapsible persists the OPEN state at slot group:<key>.
			expect(session.get<boolean>(host.blockKey(), 'group:crafting')).toBe(false);
			expect(host.replaceSource).not.toHaveBeenCalled();
		});

		test('the collapsed state PERSISTS ACROSS A RE-RENDER via SessionPersist (same blockKey; untouched groups unaffected)', async () => {
			const session = createSessionStore();
			const pipeline = new ElementPipeline(makeDeps(session));

			// First render: mount, then collapse the "Crafting" group.
			const hostA = makeHost();
			await pipeline.run(skillsElement, BASE_SKILLS_YAML, hostA);
			const rootA = hostA.containerEl.firstElementChild as HTMLElement;
			groupHeader(rootA, 'Crafting').click();

			// Second render: a FRESH host/container (simulating Obsidian re-running the
			// postprocessor) with the SAME blockKey() — the group must start collapsed.
			const hostB = makeHost();
			await pipeline.run(skillsElement, BASE_SKILLS_YAML, hostB);
			const rootB = hostB.containerEl.firstElementChild as HTMLElement;
			expect(groupHeader(rootB, 'Crafting').getAttribute('aria-expanded')).toBe('false');
			expect(
				(groupEl(rootB, 'Crafting').querySelector(':scope > .dse-collapse__region') as HTMLElement).hidden,
			).toBe(true);
			// An untouched group is unaffected — persistence is per-group, not global.
			expect(groupHeader(rootB, 'Exploration').getAttribute('aria-expanded')).toBe('true');
		});

		test('clicking again re-expands the group (session round-trips back to open)', async () => {
			const session = createSessionStore();
			const pipeline = new ElementPipeline(makeDeps(session));
			const host = makeHost();

			await pipeline.run(skillsElement, BASE_SKILLS_YAML, host);
			const root = host.containerEl.firstElementChild as HTMLElement;

			groupHeader(root, 'Crafting').click();
			groupHeader(root, 'Crafting').click();

			expect(groupHeader(root, 'Crafting').getAttribute('aria-expanded')).toBe('true');
			expect(
				(groupEl(root, 'Crafting').querySelector(':scope > .dse-collapse__region') as HTMLElement).hidden,
			).toBe(false);
			expect(session.get<boolean>(host.blockKey(), 'group:crafting')).toBe(true);
			expect(host.replaceSource).not.toHaveBeenCalled();
		});
	});

	describe('only_show_selected (preserved YAML contract)', () => {
		test('filters items to only the selected skills; group headers are PLAIN headings (no collapsible), and empty groups still show', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();
			const yaml = ['only_show_selected: true', 'skills:', '  - climb'].join('\n');

			await pipeline.run(skillsElement, yaml, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const exploration = groupEl(root, 'Exploration');
			expect(exploration.querySelectorAll('.dse-skills__item')).toHaveLength(1);
			expect(exploration.querySelector('.dse-skills__name')?.textContent).toBe('Climb');
			// No collapse affordance in this mode (Vue parity): bare heading, no button.
			expect(exploration.classList.contains('dse-collapse')).toBe(false);
			expect(exploration.querySelector('button')).toBeNull();
			expect(exploration.querySelector(':scope > .dse-skills__group-title')).not.toBeNull();

			// A group with zero selected skills still shows its header (docs/skills-element.md).
			const crafting = groupEl(root, 'Crafting');
			expect(crafting.querySelectorAll('.dse-skills__item')).toHaveLength(0);
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
			expect(root.querySelector('.dse-skills')).toBeNull();
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

	test('view source hygiene: no old-kit imports (mountComponentWrapper/mountCollapsibleHeading), kit imported from @/framework/kit, style guard clean', () => {
		const src = fs.readFileSync(path.join(__dirname, '../../../src/elements/skills/view.ts'), 'utf8');
		expect(src).not.toMatch(/mountComponentWrapper|mountCollapsibleHeading/);
		expect(src).toMatch(/from '@\/framework\/kit'/);
		expect(styleGuardFindings(src)).toEqual([]);
	});

	test('CSS contract: .dse-skills* scoped under [data-dse-element="skills"], mark state via --dse-accent on [data-on]; the old .ds-skill* block is gone', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

		const block = sheet.match(/\[data-dse-element="skills"\]\s+\.dse-skills\s*\{[\s\S]*?\n\}/);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/\.dse-skills__mark\[data-on\]/);
		expect(block![0]).toMatch(/var\(--dse-accent\)/);
		expect(block![0]).toMatch(/var\(--dse-fg-muted\)/);

		// The old legacy class block is fully evicted (Skills was its only consumer).
		expect(sheet).not.toMatch(/\.ds-skill/);
	});
});
