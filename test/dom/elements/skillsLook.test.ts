// SC-182 — the ds-skills layout candidates behind the hidden `skillsLook` pref
// (the SC-154 round-3 `initControls` pattern).
//
// What is pinned HARD here is the DEFAULT: `list` must render the exact DOM the element
// rendered before the pref existed — no `data-skills-look` attribute, no tally nodes,
// outerHTML identical to a mount that predates any candidate machinery (the frozen
// print pairs are the byte-level twin of this guarantee). The candidates' own contracts
// are pinned MINIMALLY on purpose: they are disposable until Scott picks one, at which
// point the winner is promoted to the default (permanent tests then move here) and the
// loser + the pref are deleted.
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

function makeDeps(): ElementPipelineDeps {
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
		session: createSessionStore(),
		roll: createRollService(prefs),
	};
}

async function mountWithLook(look: 'list' | 'ledger' | 'chips' | undefined, yaml = PICKS_YAML) {
	const deps = makeDeps();
	if (look !== undefined) await deps.prefs.set('skillsLook', look);
	const pipeline = new ElementPipeline(deps);
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

describe('SC-182: the DEFAULT look is untouched (the hard pin)', () => {
	test('default mount renders NO data-skills-look attribute and NO tally nodes', async () => {
		const root = await mountWithLook(undefined);
		expect(root.querySelector('[data-skills-look]')).toBeNull();
		expect(root.querySelector('.dse-skills__tally')).toBeNull();
	});

	test('an explicit skillsLook=list is identical DOM to the pref never being set', async () => {
		// The kit collapsible's region ids come from a module-global counter, so they
		// differ across mounts by construction — normalize them before comparing; every
		// other byte must match.
		const normalize = (el: HTMLElement) => el.outerHTML.replace(/dse-collapse-region-\d+/g, 'R');
		const untouched = await mountWithLook(undefined);
		const explicit = await mountWithLook('list');
		expect(normalize(explicit)).toBe(normalize(untouched));
	});

	test('candidate machinery leaves the default checklist DOM alone even on the picks-heavy fixture', async () => {
		const root = await mountWithLook(undefined);
		// Same structural facts skills.test.ts pins, re-asserted on this fixture: kit
		// collapsible groups, 1em box marks by class only, no extra children in the
		// group header beyond chevron + title.
		const crafting = group(root, 'Crafting');
		const header = crafting.querySelector(':scope > .dse-collapse__header') as HTMLElement;
		expect(Array.from(header.children).map((c) => c.className)).toEqual([
			'dse-collapse__chevron',
			'dse-collapse__title',
		]);
	});
});

describe('SC-182: candidate contracts (minimal — disposable until the pick)', () => {
	test.each(['ledger', 'chips'] as const)('%s stamps data-skills-look on .dse-skills', async (look) => {
		const root = await mountWithLook(look);
		const list = root.querySelector('.dse-skills') as HTMLElement;
		expect(list.getAttribute('data-skills-look')).toBe(look);
	});

	test('each group header gains an owned/total tally with the real counts', async () => {
		const root = await mountWithLook('ledger');
		// exploration: climb + custom Falconry owned, 10 built-ins + 1 custom = 11.
		expect(group(root, 'Exploration').querySelector('.dse-skills__tally')?.textContent).toBe('2/11');
		// crafting owns zero of its 8.
		expect(group(root, 'Crafting').querySelector('.dse-skills__tally')?.textContent).toBe('0/8');
		// the Custom Skills bucket holds the groupless Sailing, owned.
		expect(group(root, 'Custom Skills').querySelector('.dse-skills__tally')?.textContent).toBe('1/1');
	});

	test('the tally lives INSIDE the header button (part of the group\'s accessible name, survives collapse)', async () => {
		const root = await mountWithLook('chips');
		const header = group(root, 'Lore').querySelector(':scope > .dse-collapse__header') as HTMLElement;
		expect(header.querySelector(':scope > .dse-skills__tally')).not.toBeNull();
	});

	test('groups stay real kit collapsibles under a candidate (toggle still works)', async () => {
		const root = await mountWithLook('chips');
		const header = group(root, 'Lore').querySelector(':scope > .dse-collapse__header') as HTMLButtonElement;
		expect(header.getAttribute('aria-expanded')).toBe('true');
		header.click();
		expect(header.getAttribute('aria-expanded')).toBe('false');
	});

	test('marks keep the read-only shape+label contract under a candidate (no controls added)', async () => {
		const root = await mountWithLook('ledger');
		const mark = root.querySelector('.dse-skills__mark') as HTMLElement;
		expect(mark.tagName).toBe('SPAN');
		expect(mark.getAttribute('role')).toBe('img');
		expect(root.querySelector('.dse-skills__item button, .dse-skills__item input')).toBeNull();
	});

	test('only_show_selected under a candidate: attr stamped, plain h3 headers, NO tally (it would always read n/n)', async () => {
		const yaml = ['only_show_selected: true', PICKS_YAML].join('\n');
		const root = await mountWithLook('ledger', yaml);
		expect((root.querySelector('.dse-skills') as HTMLElement).getAttribute('data-skills-look')).toBe('ledger');
		expect(root.querySelector('.dse-skills__tally')).toBeNull();
		expect(group(root, 'Exploration').querySelector(':scope > .dse-skills__group-title')).not.toBeNull();
	});
});

describe('SC-182: CSS contract for the candidates section', () => {
	const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
	const section = sheet.match(
		/\/\* ={10,} \*\/\n\/\*   SC-182 — Steel SKILLS overhaul[\s\S]*?\/\* END SC-182 Steel skills candidates \*\//,
	);

	test('the section exists between its banners', () => {
		expect(section).not.toBeNull();
	});

	test('EVERY selector in the section carries the Steel screen guard AND the data-skills-look hook (freeze safety twice over)', () => {
		const body = section![0];
		// Each top-level rule's selector list: everything between a `}` (or the banner)
		// and the next `{`, filtered to lines that look like selectors.
		const selectors = body
			.replace(/\/\*[\s\S]*?\*\//g, '') // strip comments
			.split('}')
			.map((chunk) => chunk.split('{')[0].trim())
			.filter((s) => s.length > 0);
		expect(selectors.length).toBeGreaterThan(10);
		for (const selectorList of selectors) {
			for (const selector of selectorList.split(',').map((s) => s.trim()).filter(Boolean)) {
				expect(selector).toContain(`[data-dse-theme='steel']:not([data-dse-print="on"])`);
				expect(selector).toContain('.dse-skills[data-skills-look');
			}
		}
	});

	test('no color literals — the candidates compose tokens only (DESIGN.md rule 3)', () => {
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
