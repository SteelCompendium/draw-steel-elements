// SC-443 coverage check (b) for the authoring surface: the real-Obsidian census (see _census.e2e.ts for the method: CDP event listeners). Scoped by
// CONTAINER, not by class: the suggestion popup while one of our suggesters is open (`body > .suggestion-container`), the compendium search
// window (`.modal-container .prompt`). Obsidian draws those and holds their listeners on its own nodes (the delegated click / mousemove on
// `.suggestion` and `.prompt-results`, the mousedown guard on the container, the input's clear button): those host nodes are allowlisted below,
// each with its reason, and anything else that listens for input must carry a manifest id. A `.suggestion-item` row holds no listener of its
// own, so the CDP cannot see it: a page-side check says every row carries a manifest id.
// (A separate file from _census.e2e.ts on purpose: SC-442 is adding to that one; ids continue at CENSUS-30.)
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { censusFindings, eventfulNodes, type EventfulNode } from '../../driver/census';
import { closeList, installCompendium, openEditor, palette, pressSearch, searchRows, setCursor, typeKeys, waitList } from '../../driver/authoring';
import { idsOf } from '../../manifest/surface';
import dsManifest from '../../manifest/authoring-ds-suggest';
import schemaManifest from '../../manifest/authoring-schema-suggest';
import searchManifest from '../../manifest/authoring-search';

const DS_IDS = new Set(idsOf(dsManifest));
const SCHEMA_IDS = new Set(idsOf(schemaManifest));
const SEARCH_IDS = new Set(idsOf(searchManifest));
const SUGGEST_SCOPE = ['body > .suggestion-container', 'body > .suggestion-container *'];
const PROMPT_SCOPE = ['.modal-container .prompt', '.modal-container .prompt *'];

/** Obsidian's own listener-holding nodes: the popup container (mousedown guard), the list (delegated click / mousemove), the SuggestModal's result list and clear button. */
const HOST = /^(suggestion-container|suggestion|prompt-results|search-input-clear-button)(\s|$)/;
const isHost = (n: EventfulNode): boolean => n.id === null && HOST.test(n.cls);

/** Findings for the nodes that are not Obsidian's own, plus the host nodes the probe saw (it must see the delegated listeners, or it sees nothing). */
async function scan(scope: string[], allowed: ReadonlySet<string>): Promise<{ findings: string[]; host: string[] }> {
	const nodes = await eventfulNodes(scope, null);
	return { findings: censusFindings(nodes.filter((n) => !isHost(n)), allowed), host: nodes.filter(isHost).map((n) => n.cls.split(' ')[0]) };
}
/** Every `.suggestion-item` of the open popup / window carries one of `ids`, and there is at least one. */
const rowIds = (root: string): Promise<string[]> => dse.page<string[]>(`Array.from(document.querySelectorAll(${JSON.stringify(root)} + ' .suggestion-item')).map((r) => r.getAttribute('data-dse-control') ?? '(none)')`);

describe('real-Obsidian census: the authoring surface (SC-443)', () => {
	it('[CENSUS-30] the open /ds list: every node that listens for input is Obsidian\'s own (allowlisted) or an identified control, and every row is authoring.ds.item', async () => {
		await openEditor('Authoring/census-ds.md', 'x\n\n', 'live-preview', { line: 1, ch: 0 });
		await typeKeys('/ds');
		await waitList(13);
		const { findings, host } = await scan(SUGGEST_SCOPE, DS_IDS);
		expect(findings).toEqual([]);
		expect(host).toContain('suggestion'); // the delegated click / mousemove listeners: the probe sees them
		const ids = await rowIds('body > .suggestion-container');
		expect(ids).toHaveLength(13);
		expect(new Set(ids)).toEqual(new Set(['authoring.ds.item']));
		await closeList();
	});

	it('[CENSUS-31] the open key list inside a ds-stam block: the same holds, every row is authoring.schema.key', async () => {
		await openEditor('Authoring/census-key.md', '```ds-stam\n\n```\n', 'live-preview', { line: 1, ch: 0 });
		await typeKeys('c');
		await waitList(3);
		const { findings, host } = await scan(SUGGEST_SCOPE, SCHEMA_IDS);
		expect(findings).toEqual([]);
		expect(host).toContain('suggestion');
		expect(new Set(await rowIds('body > .suggestion-container'))).toEqual(new Set(['authoring.schema.key']));
		await closeList();
	});

	it('[CENSUS-32] the open compendium search window (13 entries): the input and every result row are identified, the rest is Obsidian\'s own', async () => {
		await openEditor('Authoring/census-search.md', 'x\n\n', 'live-preview', { line: 1, ch: 0 });
		await installCompendium();
		await palette('insert-compendium-reference', 'Insert Draw Steel: compendium reference', { opensSearch: true });
		const { findings, host } = await scan(PROMPT_SCOPE, SEARCH_IDS);
		expect(findings).toEqual([]);
		expect(host).toContain('prompt-results');
		expect(await dse.page<string | null>(`document.querySelector('.modal-container .prompt-input').getAttribute('data-dse-control')`)).toBe('authoring.search.input');
		const ids = await rowIds('.modal-container .prompt');
		expect(ids).toHaveLength(13);
		expect(new Set(ids)).toEqual(new Set(['authoring.search.result']));
		await pressSearch('Escape');
	});

	it('[CENSUS-33] the open search window with nothing indexed: the Sync row is the identified control', async () => {
		await openEditor('Authoring/census-empty.md', 'x\n\n', 'live-preview', { line: 1, ch: 0 });
		await palette('insert-compendium-block', 'Insert Draw Steel: compendium block (snapshot)', { opensSearch: true });
		const { findings } = await scan(PROMPT_SCOPE, SEARCH_IDS);
		expect(findings).toEqual([]);
		expect((await searchRows()).map((r) => r.id)).toEqual(['authoring.search.sync']);
		await pressSearch('Escape');
	});
});

describe('real-Obsidian census: the authoring surface with the experimental gate on (SC-443)', () => {
	before(async () => {
		await dse.setPrefs({}, { experimental: true });
	});
	after(async () => {
		await dse.setPrefs({});
	});

	it('[CENSUS-34] the open enum value list inside a ds-roll block (gate on): every row is authoring.schema.value', async () => {
		await openEditor('Authoring/census-value.md', '```ds-roll\n\n```\n', 'live-preview', { line: 1, ch: 0 });
		await typeKeys('mode: ');
		await waitList(4);
		const { findings, host } = await scan(SUGGEST_SCOPE, SCHEMA_IDS);
		expect(findings).toEqual([]);
		expect(host).toContain('suggestion');
		expect(new Set(await rowIds('body > .suggestion-container'))).toEqual(new Set(['authoring.schema.value']));
		await setCursor({ line: 1, ch: 6 });
		await closeList();
	});
});
