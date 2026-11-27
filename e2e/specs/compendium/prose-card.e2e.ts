// SC-391: a `ds-scc` block pointing at a prose compendium entry (here a skill and a chapter) draws a real card in Reading view instead of the
// "has no renderer in this plugin" card, and the compact chapter card's "Open chapter" link opens the synced note when clicked with the real
// pointer. The compendium is two real md-dse files (test/fixtures/md-dse), written into the vault at run time; the notes are the specs' own.
import { expect } from '@wdio/globals';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { dse } from '../../driver/dse';
import { openEditor, toReading, drawn } from '../../driver/authoring';
import { ev, waitFor } from '../../driver/page';

const FIXTURES = path.resolve(__dirname, '..', '..', '..', 'test', 'fixtures', 'md-dse');
const SKILL = { code: 'mcdm.heroes.v1/skill.crafting/alchemy', rel: 'skill/crafting/alchemy.md' };
const CHAPTER = { code: 'mcdm.heroes.v1/chapter/combat', rel: 'chapter/combat.md' };

/** Write the given md-dse fixtures into the compendium folder and wait for the plugin's index to hold them. */
async function installFiles(rels: string[]): Promise<void> {
	const files = rels.map((rel) => [rel, fs.readFileSync(path.join(FIXTURES, rel), 'utf8')] as const);
	await ev(`(async () => {
		const root = app.plugins.plugins['draw-steel-elements'].settings.compendiumDestinationDirectory;
		for (const [rel, text] of ${JSON.stringify(files)}) {
			const full = root + '/' + rel;
			let at = '';
			for (const part of full.slice(0, full.lastIndexOf('/')).split('/')) { at = at ? at + '/' + part : part; if (!app.vault.getAbstractFileByPath(at)) await app.vault.createFolder(at); }
			await app.vault.create(full, text);
		}
	})()`);
	await waitFor(`app.plugins.plugins['draw-steel-elements'].compendiumIndex.query('').length === ${files.length}`, `the compendium index to hold ${files.length} entries`);
}

const cardText = (): Promise<string> => dse.page<string>(`document.querySelector('.workspace-leaf.mod-active .markdown-reading-view [data-dse-element="prose"]').textContent`);

describe('ds-scc prose cards (SC-391)', () => {
	it('[PROSE-C01] a skill code draws the prose card in Reading view: its eyebrow, name and text, and no "has no renderer"', async () => {
		const rel = 'Prose/skill-card.md';
		await openEditor(rel, '```ds-scc\n' + SKILL.code + '\n```\n', 'source');
		await installFiles([SKILL.rel]);
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['prose'], errors: [] });
		const text = await cardText();
		expect(text).toContain('Skill');
		expect(text).toContain('Alchemy');
		expect(text).toContain('Make bombs and potions.');
		expect(text).not.toContain('has no renderer');
	});

	it('[PROSE-C02] a chapter code draws the compact card (first paragraph only) and a real click on "Open chapter" opens the synced note', async () => {
		const rel = 'Prose/chapter-card.md';
		await openEditor(rel, '```ds-scc\n' + CHAPTER.code + '\n```\n', 'source');
		await installFiles([CHAPTER.rel]);
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['prose'], errors: [] });
		const text = await cardText();
		expect(text).toContain('Chapter');
		expect(text).toContain('When the heroes face a problem');
		expect(text).not.toContain('Set the Map');
		const note = await ev<string>(`app.plugins.plugins['draw-steel-elements'].settings.compendiumDestinationDirectory + '/${CHAPTER.rel}'`);
		await dse.click(dse.control('prose.open-chapter'));
		await waitFor(`app.workspace.getActiveFile()?.path === ${JSON.stringify(note)}`, `the chapter note ${note} to open`);
	});
});
