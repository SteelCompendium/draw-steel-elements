// test/dom/elements/proseCard.test.ts — SC-391: the internal prose family (`ds-prose`), the
// card nine prose compendium types (skill, skill-group, monster group lore, saint, god,
// chapter, project, movement, negotiation) render through in `ds-scc` instead of the
// "has no renderer in this plugin" card. Mirrors ruleCard.test.ts: real md-dse files through
// the real by-SCC stack (_refHarness), with the jest MarkdownRenderer mock recording what the
// card hands to `renderMarkdown`. The type -> family routing itself (and "an unknown type is
// still refused") is pinned in sccElement.test.ts next to the other dispatch cases.
import { ElementPipeline } from '@/framework/pipeline';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { proseElement } from '@/elements/display';
import { proseLayout, proseLabel, firstParagraph, PROSE_TYPE_STYLE } from '@/elements/display/prose';
import { PROSE_TYPES, PROSE_TYPE_RE } from '@/services/typeAdapters';
import type { GenericNote } from '@/services/typeAdapters';
import { sccElement } from '@/elements/scc/definition';
import { MarkdownRenderer } from '../../mocks/obsidian';
import { makeHost, makeCompendiumDeps, loadMdDseFixture, MD_DSE_FIXTURES } from './_refHarness';
import * as fs from 'fs';
import * as path from 'path';

const CHAPTER = { code: 'mcdm.heroes.v1/chapter/combat', rel: 'chapter/combat.md' };
const EMPTY_CHAPTER = { code: 'mcdm.summoner.v1/chapter/the-summoner-class', rel: 'chapter/the-summoner-class.md' };

/** The nine real files: [type, code, fixture path, expected title, expected eyebrow]. */
const NINE: [string, string, string, string, string][] = [
	['skill', 'mcdm.heroes.v1/skill.crafting/alchemy', 'skill/crafting/alchemy.md', 'Alchemy', 'Skill'],
	['skill-group', 'mcdm.heroes.v1/skill.group/crafting', 'skill/group/crafting.md', 'Crafting Skills', 'Skill group'],
	['monster', 'mcdm.monsters.v1/monster.group/goblin', 'monster/group/goblin.md', 'Goblins', 'Monster group'],
	['saint', 'mcdm.heroes.v1/religion.saint/atossa-the-shepherd', 'religion/saint/atossa-the-shepherd.md', 'Atossa the Shepherd', 'Saint'],
	['god', 'mcdm.heroes.v1/religion.god/adun', 'religion/god/adun.md', 'Adûn', 'God'],
	['chapter', CHAPTER.code, CHAPTER.rel, 'Combat', 'Chapter'],
	['project', 'mcdm.heroes.v1/project/build-airship', 'project/build-airship.md', 'Build Airship', 'Project'],
	['movement', 'mcdm.heroes.v1/movement/climb-or-swim', 'movement/climb-or-swim.md', 'Climb or Swim', 'Movement'],
	['negotiation', 'mcdm.heroes.v1/negotiation/discovery', 'negotiation/discovery.md', 'Discovery', 'Negotiation'],
];

async function render(code: string, rel: string): Promise<HTMLElement> {
	const { vault, deps } = makeCompendiumDeps();
	loadMdDseFixture(vault, rel);
	const host = makeHost('ds-scc');
	await new ElementPipeline(deps).run(sccElement, code, host);
	return host.containerEl.firstElementChild as HTMLElement;
}

/** A fixture's body, frontmatter stripped — what the card hands to renderMarkdown. */
function bodyOf(rel: string): string {
	return fs.readFileSync(path.join(MD_DSE_FIXTURES, rel), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
}

function renderedMarkdown(spy: jest.SpyInstance): string[] {
	return spy.mock.calls.map((c) => c[1] as string);
}

describe('SC-391 the prose family is exactly the nine types', () => {
	test('PROSE_TYPE_RE matches the nine and nothing near them; every type has an eyebrow + crest row', () => {
		expect([...PROSE_TYPES].sort()).toEqual(NINE.map((n) => n[0]).sort());
		for (const type of PROSE_TYPES) expect(PROSE_TYPE_RE.test(type)).toBe(true);
		for (const near of ['', 'skills', 'monsters', 'monster.group', 'chapter.intro', 'rule', 'statblock', 'god-class', 'saga']) {
			expect(PROSE_TYPE_RE.test(near)).toBe(false);
		}
		expect(Object.keys(PROSE_TYPE_STYLE).sort()).toEqual([...PROSE_TYPES].sort());
	});

	test('the family id is not one that carries element-scoped tracker CSS (negotiation, project, skills)', () => {
		expect(proseElement.base.id).toBe('prose');
		expect(['negotiation', 'project', 'skills']).not.toContain(proseElement.base.id);
	});
});

describe('SC-391 each prose type renders a real card through ds-scc', () => {
	test.each(NINE)('%s: title, plain type eyebrow, crest, no error and no "no renderer"', async (type, code, rel, title, eyebrow) => {
		const root = await render(code, rel);
		expect(root.querySelector('.dse-ref-notice, .dse-error-card')).toBeNull();
		expect(root.textContent).not.toContain('has no renderer');
		expect(root.getAttribute('data-dse-element')).toBe('prose');
		const head = root.querySelector(':scope > .dse-card > .dse-head') as HTMLElement;
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe(title);
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe(eyebrow);
		expect(head.querySelector('.dse-crest .dse-crest__glyph')!.getAttribute('data-icon')).toBe(PROSE_TYPE_STYLE[type as keyof typeof PROSE_TYPE_STYLE].crest);
	});

	// Every type except `chapter` shows its FULL body: the whole markdown, frontmatter
	// stripped, reaches renderMarkdown in one call. (skill-group: a table + a ###### heading;
	// monster lore: #### subsections; the table/heading rendering itself is Obsidian's.)
	test.each(NINE.filter((n) => n[0] !== 'chapter'))('%s renders its full body, with no "Open chapter" link', async (_type, code, rel) => {
		const spy = jest.spyOn(MarkdownRenderer, 'render');
		try {
			const root = await render(code, rel);
			expect(renderedMarkdown(spy)).toContain(bodyOf(rel));
			expect(root.querySelector('a.dse-prose__open')).toBeNull();
		} finally {
			spy.mockRestore();
		}
	});

	test('a skill-group body keeps its markdown table and a monster lore body keeps its ### headings', async () => {
		const spy = jest.spyOn(MarkdownRenderer, 'render');
		try {
			await render(NINE[1][1], NINE[1][2]);
			await render(NINE[2][1], NINE[2][2]);
			const rendered = renderedMarkdown(spy).join('\n=====\n');
			expect(rendered).toMatch(/^\| Skill +\| Use +\|$/m);
			expect(rendered).toMatch(/^\|-+\|-+\|$/m);
			expect(rendered).toMatch(/^#{4} Encountered in Groups$/m);
			expect(rendered).toMatch(/^#{4} Mobile and Sneaky$/m);
		} finally {
			spy.mockRestore();
		}
	});

	test('the collapsed one-line form names the entry by its type ("Skill: Alchemy"), not "Prose"', () => {
		const note: GenericNote = { name: 'Alchemy', type: 'skill', body: 'x' };
		const ctx = { model: note, def: { id: 'prose', name: 'Prose' } };
		expect(proseElement.base.chrome!.summary(ctx)).toEqual({ label: 'Skill', name: 'Alchemy' });
		expect(proseElement.base.chrome!.summary({ ...ctx, model: { ...note, type: 'skill-group' } }).label).toBe('Skill group');
	});

	// Same machinery as a rule card: the post-render pass rewrites each `scc.v1:` link. The
	// jest MarkdownRenderer mock only appends raw text, so this scoped override stands in
	// for Obsidian turning `[text](href)` into anchors (ruleCard.test.ts does the same).
	test('inline scc.v1: links in a prose body are rewritten as in a rule card: a synced code is a vault link, the rest fall back to the web', async () => {
		const spy = jest.spyOn(MarkdownRenderer, 'render').mockImplementation(async (_app: unknown, markdown: string, el: HTMLElement) => {
			for (const m of markdown.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
				const a = el.ownerDocument.createElement('a');
				a.textContent = m[1];
				a.setAttribute('href', m[2]);
				a.classList.add('external-link');
				el.appendChild(a);
			}
		});
		try {
			// Discovery links to itself (a synced code) and to rules that are not synced here.
			const root = await render(NINE[8][1], NINE[8][2]);
			const own = root.querySelector('a.internal-link[data-scc="mcdm.heroes.v1/negotiation/discovery"]') as HTMLElement;
			expect(own).not.toBeNull();
			expect(own.getAttribute('data-href')).toBe(`${DEFAULT_SETTINGS.compendiumDestinationDirectory}/negotiation/discovery.md`);
			expect(root.querySelectorAll('a.ds-scc-web').length).toBeGreaterThan(0);
		} finally {
			spy.mockRestore();
		}
	});
});

describe('SC-391 chapters render compact', () => {
	test('title + the first paragraph only (not the rest of the chapter) + an "Open chapter" link to the synced note', async () => {
		const spy = jest.spyOn(MarkdownRenderer, 'render');
		try {
			const root = await render(CHAPTER.code, CHAPTER.rel);
			const first = firstParagraph(bodyOf(CHAPTER.rel))!;
			expect(first).toMatch(/^When the heroes face a problem/);
			expect(renderedMarkdown(spy)).toEqual([first]);
			expect(root.textContent).not.toContain('Set the Map');
			const link = root.querySelector('a.internal-link.dse-prose__open') as HTMLElement;
			expect(link.textContent).toBe('Open chapter');
			const note = `${DEFAULT_SETTINGS.compendiumDestinationDirectory}/${CHAPTER.rel}`;
			expect(link.getAttribute('data-href')).toBe(note);
			expect(link.getAttribute('href')).toBe(note);
		} finally {
			spy.mockRestore();
		}
	});

	test('an empty chapter is a title-only card: no body, no link', async () => {
		const root = await render(EMPTY_CHAPTER.code, EMPTY_CHAPTER.rel);
		expect(root.querySelector('.dse-head__primary--left')!.textContent).toBe('The Summoner Class');
		expect(root.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Chapter');
		expect(root.querySelector('.dse-card__band')).toBeNull();
		expect(root.querySelector('a')).toBeNull();
		expect(root.textContent).not.toContain('has no renderer');
	});

	// The link needs the resolved file; a card with no source file (never produced by ds-scc,
	// which always resolves one) shows the paragraph and omits the link rather than a dead one.
	test('with no source file the paragraph shows and the link is omitted', async () => {
		const note: GenericNote = { name: 'Combat', type: 'chapter', body: 'First paragraph.\n\nSecond paragraph.' };
		const [band] = proseLayout.steel!.bands(note, undefined);
		const container = document.createElement('div');
		const md: string[] = [];
		await band.render(container, async (markdown) => void md.push(markdown), undefined as never);
		expect(md).toEqual(['First paragraph.']);
		expect(container.querySelector('a')).toBeNull();
	});

	test('firstParagraph skips headings, tables, quotes, lists and fences; none -> undefined', () => {
		expect(firstParagraph('## Heading\n\nThe real paragraph.\nOver two lines.\n\nLater.')).toBe('The real paragraph.\nOver two lines.');
		expect(firstParagraph('###### Table\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n> quote\n\n- item\n\nFinally prose.')).toBe('Finally prose.');
		expect(firstParagraph('| a | b |\n|---|---|\n\n> quote')).toBeUndefined();
		expect(firstParagraph('')).toBeUndefined();
		expect(firstParagraph('\n  \n')).toBeUndefined();
	});
});

describe('SC-391 eyebrow guard and fallbacks', () => {
	test('an eyebrow that would restate the title is suppressed (case-insensitive), like the rule card', () => {
		expect(proseLayout.steel!.eyebrow({ name: 'God', type: 'god', body: 'x' }, undefined)).toBeUndefined();
		expect(proseLayout.steel!.eyebrow({ name: 'Alchemy', type: 'skill', body: 'x' }, undefined)).toBe('Skill');
	});

	test('a type outside the table (never routed here by ds-scc) degrades to title-case, and to no eyebrow with no type', () => {
		expect(proseLabel('some-thing')).toBe('Some Thing');
		expect(proseLabel('')).toBeUndefined();
		expect(proseLayout.steel!.crestIcon({ name: 'x', type: '', body: '' }, undefined)).toBe('book-open');
	});
});
