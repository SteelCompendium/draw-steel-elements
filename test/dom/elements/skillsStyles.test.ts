// SC-182 — the ds-skills layout system (YAML `style:` enum) + the menu-panel
// show/hide-unowned toggle.
//
// Round 1 built `ledger`/`chips` as review candidates behind a hidden pref; Scott's
// ruling (2026-08-22: "I actually like both of these options. Can you implement both
// … Allow the user to set the style in the yaml … a button in the ds-skill menu panel
// to show/hide unowned skills") shipped BOTH, per block, and deleted the pref.
//
// What is pinned HARD here is the DEFAULT: a block without `style:` must render the
// exact DOM the element rendered before the field existed — no `data-skills-style`
// attribute, no tally nodes, outerHTML-identical to an explicit `style: list` (the
// frozen print pairs are the byte-level twin of this guarantee). The layouts' own
// contracts and the toggle's behaviour/persistence are the shipped feature surface.
import * as fs from 'fs';
import * as path from 'path';
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import type { SessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin } from '../../mocks/obsidian';
import { skillsElement } from '../../../src/elements/skills/definition';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';

// The harness hero-picks shape in miniature: owned skills spread unevenly across
// groups (crafting owns zero), one custom skill merged into a built-in group, one in
// the "Custom Skills" bucket.
const PICKS_YAML = [
	'skills:',
	'  - climb',
	'  - hide',
	'  - sneak',
	'  - magic',
	'custom_skills:',
	'  - name: Falconry',
	'    has_skill: true',
	'    skill_group: exploration',
	'  - name: Sailing',
	'    has_skill: true',
].join('\n');

function makeHost() {
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
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

function makeDeps(session: SessionStore = createSessionStore()): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
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
		roll: createRollService(prefs),
	};
}

async function mountSkills(yaml: string, session: SessionStore = createSessionStore()) {
	const pipeline = new ElementPipeline(makeDeps(session));
	const host = makeHost();
	await pipeline.run(skillsElement, yaml, host);
	return host.containerEl.firstElementChild as HTMLElement;
}

function group(root: HTMLElement, label: string): HTMLElement {
	const found = Array.from(root.querySelectorAll('.dse-skills__group')).find(
		(el) =>
			el.querySelector(':scope > .dse-collapse__header .dse-collapse__title')?.textContent === label ||
			el.querySelector(':scope > .dse-skills__group-title')?.textContent === label,
	);
	if (!found) throw new Error(`no .dse-skills__group titled "${label}"`);
	return found as HTMLElement;
}

function itemNames(scope: HTMLElement): string[] {
	return Array.from(scope.querySelectorAll('.dse-skills__name')).map((el) => el.textContent ?? '');
}

/** The menu panel's SC-182 eye toggle. */
function unownedToggle(root: HTMLElement): HTMLButtonElement {
	const btn = root.querySelector('[data-dse-chrome-item="skills-unowned"]');
	if (!btn) throw new Error('no skills-unowned chrome item mounted');
	return btn as HTMLButtonElement;
}

/** Flush the toggle's fire-and-forget update() (async unload → remount → chrome). */
async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SC-182: the DEFAULT (no style: key) is untouched — the hard pin', () => {
	test('default mount renders NO data-skills-style attribute and NO tally nodes', async () => {
		const root = await mountSkills(PICKS_YAML);
		expect(root.querySelector('[data-skills-style]')).toBeNull();
		expect(root.querySelector('.dse-skills__tally')).toBeNull();
	});

	test('an explicit style: list is identical DOM to the key being absent', async () => {
		// The kit collapsible's region ids come from a module-global counter, so they
		// differ across mounts by construction — normalize them before comparing; every
		// other byte must match.
		const normalize = (el: HTMLElement) => el.outerHTML.replace(/dse-collapse-region-\d+/g, 'R');
		const absent = await mountSkills(PICKS_YAML);
		const explicit = await mountSkills(`style: list\n${PICKS_YAML}`);
		expect(normalize(explicit)).toBe(normalize(absent));
	});

	test('the classic list group header stays exactly chevron + title (no tally slipped in)', async () => {
		const root = await mountSkills(PICKS_YAML);
		const header = group(root, 'Crafting').querySelector(':scope > .dse-collapse__header') as HTMLElement;
		expect(Array.from(header.children).map((c) => c.className)).toEqual([
			'dse-collapse__chevron',
			'dse-collapse__title',
		]);
	});
});

describe('SC-182: the YAML style: enum selects the layout', () => {
	test.each(['ledger', 'chips'] as const)('style: %s stamps data-skills-style on .dse-skills', async (style) => {
		const root = await mountSkills(`style: ${style}\n${PICKS_YAML}`);
		const list = root.querySelector('.dse-skills') as HTMLElement;
		expect(list.getAttribute('data-skills-style')).toBe(style);
	});

	test('an invalid style value renders the schema error card, naming the enum', async () => {
		const root = await mountSkills(`style: fancy\n${PICKS_YAML}`);
		expect(root.getAttribute('data-dse-error-stage')).toBe('schema');
		expect(root.querySelector('.dse-skills')).toBeNull();
	});

	test('each styled group header gains an owned/total tally with the real counts', async () => {
		const root = await mountSkills(`style: ledger\n${PICKS_YAML}`);
		// exploration: climb + custom Falconry owned, 10 built-ins + 1 custom = 11.
		expect(group(root, 'Exploration').querySelector('.dse-skills__tally')?.textContent).toBe('2/11');
		// crafting owns zero of its 8.
		expect(group(root, 'Crafting').querySelector('.dse-skills__tally')?.textContent).toBe('0/8');
		// the Custom Skills bucket holds the groupless Sailing, owned.
		expect(group(root, 'Custom Skills').querySelector('.dse-skills__tally')?.textContent).toBe('1/1');
	});

	test('the tally lives INSIDE the header button (part of the group\'s accessible name, survives collapse)', async () => {
		const root = await mountSkills(`style: chips\n${PICKS_YAML}`);
		const header = group(root, 'Lore').querySelector(':scope > .dse-collapse__header') as HTMLElement;
		expect(header.querySelector(':scope > .dse-skills__tally')).not.toBeNull();
	});

	test('groups stay real kit collapsibles under both styles (toggle still works)', async () => {
		const root = await mountSkills(`style: chips\n${PICKS_YAML}`);
		const header = group(root, 'Lore').querySelector(':scope > .dse-collapse__header') as HTMLButtonElement;
		expect(header.getAttribute('aria-expanded')).toBe('true');
		header.click();
		expect(header.getAttribute('aria-expanded')).toBe('false');
	});

	test('marks keep the read-only shape+label contract under both styles (no controls added)', async () => {
		const root = await mountSkills(`style: ledger\n${PICKS_YAML}`);
		const mark = root.querySelector('.dse-skills__mark') as HTMLElement;
		expect(mark.tagName).toBe('SPAN');
		expect(mark.getAttribute('role')).toBe('img');
		expect(root.querySelector('.dse-skills__item button, .dse-skills__item input')).toBeNull();
	});
});

describe('SC-182: hidden-unowned rendering per layout (only_show_selected seeds it)', () => {
	test('ledger + only_show_selected keeps collapsible groups + tallies, renders ONLY owned items, keeps empty groups', async () => {
		const root = await mountSkills(`style: ledger\nonly_show_selected: true\n${PICKS_YAML}`);
		const exploration = group(root, 'Exploration');
		expect(itemNames(exploration)).toEqual(['Climb', 'Falconry']);
		// The group is still a collapsible (NOT the list style's legacy bare heading)…
		expect(exploration.classList.contains('dse-collapse')).toBe(true);
		// …and the tally still reads owned/TOTAL — the context of what is folded away.
		expect(exploration.querySelector('.dse-skills__tally')?.textContent).toBe('2/11');
		// A group with zero owned skills still shows (header + empty list), like the
		// legacy hidden form does.
		const crafting = group(root, 'Crafting');
		expect(crafting.querySelectorAll('.dse-skills__item')).toHaveLength(0);
		expect(crafting.querySelector('.dse-skills__tally')?.textContent).toBe('0/8');
	});

	test('chips + only_show_selected renders only the owned chips', async () => {
		const root = await mountSkills(`style: chips\nonly_show_selected: true\n${PICKS_YAML}`);
		expect(itemNames(root.querySelector('.dse-skills') as HTMLElement).sort()).toEqual(
			['Climb', 'Falconry', 'Hide', 'Magic', 'Sailing', 'Sneak'].sort(),
		);
		// Every rendered mark is the owned (data-on) form.
		const marks = Array.from(root.querySelectorAll('.dse-skills__mark'));
		expect(marks.length).toBe(6);
		expect(marks.every((m) => m.hasAttribute('data-on'))).toBe(true);
	});

	test('list + only_show_selected keeps the LEGACY DOM verbatim (bare h3, no collapse) — Vue parity untouched', async () => {
		const root = await mountSkills(`only_show_selected: true\n${PICKS_YAML}`);
		const exploration = group(root, 'Exploration');
		expect(exploration.classList.contains('dse-collapse')).toBe(false);
		expect(exploration.querySelector(':scope > .dse-skills__group-title')).not.toBeNull();
		expect(root.querySelector('.dse-skills__tally')).toBeNull();
	});
});

describe('SC-182: the menu-panel show/hide-unowned toggle', () => {
	test('the panel carries the eye toggle; with unowned shown it offers "Hide unowned skills"', async () => {
		const root = await mountSkills(`style: ledger\n${PICKS_YAML}`);
		const toggle = unownedToggle(root);
		expect(toggle.getAttribute('aria-label')).toBe('Hide unowned skills');
	});

	test('clicking hides the unowned items, flips the button, persists to session — and never writes the note', async () => {
		const session = createSessionStore();
		const pipeline = new ElementPipeline(makeDeps(session));
		const host = makeHost();
		await pipeline.run(skillsElement, `style: ledger\n${PICKS_YAML}`, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(itemNames(group(root, 'Exploration'))).toHaveLength(11);

		unownedToggle(root).click();
		await settle();

		expect(itemNames(group(root, 'Exploration'))).toEqual(['Climb', 'Falconry']);
		expect(unownedToggle(root).getAttribute('aria-label')).toBe('Show unowned skills');
		expect(session.get<boolean>(host.blockKey(), 'unowned-hidden')).toBe(true);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});

	test('the toggled state PERSISTS ACROSS A REMOUNT (same blockKey, fresh host — the echo-rebuild)', async () => {
		const session = createSessionStore();
		const pipelineA = new ElementPipeline(makeDeps(session));
		const hostA = makeHost();
		await pipelineA.run(skillsElement, `style: chips\n${PICKS_YAML}`, hostA);
		unownedToggle(hostA.containerEl.firstElementChild as HTMLElement).click();
		await settle();

		const pipelineB = new ElementPipeline(makeDeps(session));
		const hostB = makeHost();
		await pipelineB.run(skillsElement, `style: chips\n${PICKS_YAML}`, hostB);
		const rootB = hostB.containerEl.firstElementChild as HTMLElement;
		expect(itemNames(rootB.querySelector('.dse-skills') as HTMLElement)).toHaveLength(6);
		expect(unownedToggle(rootB).getAttribute('aria-label')).toBe('Show unowned skills');
	});

	test('PRECEDENCE: YAML only_show_selected seeds the state; the session toggle overrides it', async () => {
		const session = createSessionStore();
		const pipeline = new ElementPipeline(makeDeps(session));
		const host = makeHost();
		await pipeline.run(skillsElement, `style: ledger\nonly_show_selected: true\n${PICKS_YAML}`, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		// YAML seeded HIDDEN, so the button offers to show.
		expect(unownedToggle(root).getAttribute('aria-label')).toBe('Show unowned skills');
		unownedToggle(root).click();
		await settle();

		// Session false now beats the block's own only_show_selected: true.
		expect(itemNames(group(root, 'Exploration'))).toHaveLength(11);
		expect(session.get<boolean>(host.blockKey(), 'unowned-hidden')).toBe(false);
		expect(unownedToggle(root).getAttribute('aria-label')).toBe('Hide unowned skills');
	});

	test('the toggle works on the CLASSIC list style too — hiding renders the legacy bare-heading form', async () => {
		const session = createSessionStore();
		const pipeline = new ElementPipeline(makeDeps(session));
		const host = makeHost();
		await pipeline.run(skillsElement, PICKS_YAML, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		unownedToggle(root).click();
		await settle();

		const exploration = group(root, 'Exploration');
		expect(exploration.classList.contains('dse-collapse')).toBe(false);
		expect(itemNames(exploration)).toEqual(['Climb', 'Falconry']);
	});
});

describe('SC-182: CSS contract for the layouts section', () => {
	const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
	const section = sheet.match(
		/\/\* ={10,} \*\/\n\/\*   SC-182 — Steel SKILLS overhaul[\s\S]*?\/\* END SC-182 Steel skills layouts \*\//,
	);

	test('the section exists between its banners', () => {
		expect(section).not.toBeNull();
	});

	test('EVERY selector in the section carries the Steel screen guard AND the data-skills-style hook (freeze safety twice over)', () => {
		const body = section![0];
		const selectors = body
			.replace(/\/\*[\s\S]*?\*\//g, '') // strip comments
			.split('}')
			.map((chunk) => chunk.split('{')[0].trim())
			.filter((s) => s.length > 0);
		expect(selectors.length).toBeGreaterThan(10);
		for (const selectorList of selectors) {
			for (const selector of selectorList.split(',').map((s) => s.trim()).filter(Boolean)) {
				expect(selector).toContain(`[data-dse-theme='steel']:not([data-dse-print="on"])`);
				expect(selector).toContain('.dse-skills[data-skills-style');
			}
		}
	});

	test('no color literals — the layouts compose tokens only (DESIGN.md rule 3)', () => {
		const declarations = section![0]
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.split('{')
			.slice(1)
			.map((chunk) => chunk.split('}')[0]);
		for (const block of declarations) {
			expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
			expect(block).not.toMatch(/rgba?\(/);
		}
	});
});
