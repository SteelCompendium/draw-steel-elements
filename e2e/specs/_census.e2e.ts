// SC-408 coverage check (b): the real-Obsidian census over the pilot surfaces. Complements the
// jsdom census (test/dom/e2eCensus.test.ts): here the browser reports which nodes actually have
// click / pointer / key listeners (CDP DOMDebugger.getEventListeners), so a div-with-a-listener
// control with no `data-dse-control` id cannot hide. Scoped to the stamina surfaces; framework
// chrome (the collapse toolbar, `[data-dse-chrome-item]`) is a separate surface and is excluded.
import { expect } from '@wdio/globals';
import { dse } from '../driver/dse';
import { censusFindings, eventfulNodes } from '../driver/census';
import { openBarModal } from '../driver/stamina';
import { idsOf } from '../manifest/surface';
import barManifest from '../manifest/stamina-bar';
import modalManifest from '../manifest/stamina-edit-modal';
import conditionsManifest from '../manifest/conditions-modal';
import initiativeManifest from '../manifest/initiative';

const ALL_IDS = new Set([...idsOf(barManifest), ...idsOf(modalManifest), ...idsOf(conditionsManifest), ...idsOf(initiativeManifest)]);
const BAR_SCOPE = ['.markdown-reading-view [data-dse-element="stamina-bar"] *'];

describe('real-Obsidian census (pilot surfaces)', () => {
	it('[CENSUS-01] ds-stamina-bar with Recoveries: every node that listens for input is an identified control', async () => {
		await dse.openNote('Stamina/recoveries.md');
		const nodes = await eventfulNodes(BAR_SCOPE);
		expect(censusFindings(nodes, ALL_IDS)).toEqual([]);
		// Sanity that the probe sees what it should: the bar, the marker row and Catch Breath listen.
		// (Plain inputs with no DSE listener, like the Apply box, are the jsdom census's job.)
		const ids = nodes.map((n) => n.id);
		for (const id of ['stamina.bar', 'recov.markers', 'recov.catch-breath']) expect(ids).toContain(id);
	});

	it('[CENSUS-02] the open StaminaEditModal: every node that listens for input is an identified control', async () => {
		const modal = await openBarModal('Stamina/recoveries.md');
		await dse.settle();
		const nodes = await eventfulNodes(['.modal-container .dse-modal .modal-content *']);
		expect(censusFindings(nodes, ALL_IDS)).toEqual([]);
		const ids = nodes.map((n) => n.id);
		for (const id of ['sedit.damage', 'sedit.stamina.input', 'sedit.temp.inc', 'sedit.spend-recovery', 'sedit.apply']) {
			expect(ids).toContain(id);
		}
		await dse.click(modal.control('modal.close'));
	});

	it('[CENSUS-03] the undo toast action is an identified control', async () => {
		const bar = (await dse.openNote('Stamina/recoveries.md'), dse.block('ds-stamina-bar'));
		await dse.click(bar.control('recov.catch-breath'));
		await dse.waitFor(`!!document.querySelector('.notice .dse-undo-notice__action')`, 'the undo toast');
		const nodes = await eventfulNodes(['.notice-container .notice *']);
		expect(censusFindings(nodes, ALL_IDS)).toEqual([]);
		expect(nodes.map((n) => n.id)).toContain('undo.action');
		await dse.settle();
	});

	it('[CENSUS-04] initiative stamina entry points: the hero / detail numeric controls, the row bars and the roster cells', async () => {
		await dse.openNote('Initiative/tracker.md');
		const nodes = await eventfulNodes([
			'.markdown-reading-view [data-dse-element="initiative"] .dse-init__health *',
			'.markdown-reading-view [data-dse-element="initiative"] .dse-init__bar',
			'.markdown-reading-view [data-dse-element="initiative"] .dse-init__bar *',
			'.markdown-reading-view [data-dse-element="initiative"] .dse-init__cell',
		]);
		expect(censusFindings(nodes, ALL_IDS)).toEqual([]);
		const ids = nodes.map((n) => n.id);
		for (const id of ['init.hero.stamina', 'init.hero.bar', 'init.detail.stamina', 'init.detail.bar', 'init.cell.stamina']) {
			expect(ids).toContain(id);
		}
	});
});

describe('real-Obsidian census: the optional popover editor', () => {
	before(async () => {
		await dse.setPrefs({ staminaRecoveryPopover: true });
	});
	after(async () => {
		await dse.setPrefs({});
	});

	it('[CENSUS-05] with the popover open its buttons are identified controls', async () => {
		await dse.openNote('Stamina/recoveries.md');
		await dse.click(dse.block('ds-stamina-bar').control('recov.marker', { nth: 4 }));
		await dse.waitFor(`!!document.querySelector('.dse-stamina-rec__pop')`, 'the popover');
		const nodes = await eventfulNodes(BAR_SCOPE);
		expect(censusFindings(nodes, ALL_IDS)).toEqual([]);
		const ids = nodes.map((n) => n.id);
		for (const id of ['recov.pop.dec', 'recov.pop.inc', 'recov.pop.catch-breath']) expect(ids).toContain(id);
	});
});
