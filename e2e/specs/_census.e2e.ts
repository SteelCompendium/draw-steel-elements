// SC-408 coverage check (b): the real-Obsidian census over the pilot surfaces. Complements the
// jsdom census (test/dom/e2eCensus.test.ts): here the browser reports which nodes actually have
// click / pointer / key listeners (CDP DOMDebugger.getEventListeners), so a div-with-a-listener
// control with no `data-dse-control` id cannot hide. Scoped to the stamina surfaces and the initiative tracker
// (SC-437: by its root container, chrome panel included); on the other surfaces the framework chrome
// (the collapse toolbar, `[data-dse-chrome-item]`) is a separate surface and is excluded.
import { expect } from '@wdio/globals';
import { dse } from '../driver/dse';
import { censusFindings, eventfulNodes } from '../driver/census';
import { openBarModal } from '../driver/stamina';
import { HURT, openPoolModal } from '../driver/pool';
import { CONDITIONS, openConditionsModal } from '../driver/conditions';
import { idsOf } from '../manifest/surface';
import barManifest from '../manifest/stamina-bar';
import modalManifest from '../manifest/stamina-edit-modal';
import conditionsManifest from '../manifest/conditions-modal';
import poolManifest from '../manifest/minion-pool-modal';
import initiativeManifest from '../manifest/initiative';
import resetManifest from '../manifest/reset-encounter-modal';
import chromeManifest from '../manifest/chrome';

const ALL_IDS = new Set([
	...idsOf(barManifest),
	...idsOf(modalManifest),
	...idsOf(conditionsManifest),
	...idsOf(poolManifest),
	...idsOf(initiativeManifest),
	...idsOf(resetManifest),
	...idsOf(chromeManifest),
]);
const BAR_SCOPE = ['.markdown-reading-view [data-dse-element="stamina-bar"] *'];
// SC-437 (R1 L-4): the tracker is scanned by its root container, not by a CSS class per entry point. The ids a node there may
// carry: the initiative and reset-modal manifests, the other surfaces' reach rows into the tracker (stamina, pool, conditions)
// and the framework chrome's.
const TRACKER_SCOPE = '.markdown-reading-view [data-dse-element="initiative"] *';
const TRACKER_IDS = new Set([
	...idsOf(initiativeManifest),
	...idsOf(resetManifest),
	...[modalManifest, conditionsManifest, poolManifest].flatMap((m) => m.reach.filter((r) => r.host === 'initiative').map((r) => r.control)),
	...idsOf(chromeManifest),
]);
// Ids the initiative manifest declares with no interaction (a programmatic focus target): nothing may listen for input on them.
const INERT_IDS = new Set(Object.entries(initiativeManifest.controls).filter(([, spec]) => spec.kinds.length === 0).map(([id]) => id));

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

	it('[CENSUS-04] the whole initiative tracker (SC-437, scoped by its root, chrome panel included): every node that listens for input is an identified control', async () => {
		await dse.openNote('Initiative/rich.md');
		const nodes = await eventfulNodes([TRACKER_SCOPE], null);
		expect(censusFindings(nodes, TRACKER_IDS, INERT_IDS)).toEqual([]);
		const ids = nodes.map((n) => n.id);
		// Sanity that the probe sees every part of the tracker: title, round, Malice, both turn controls, the action
		// checklist, a condition, the roster cells and the stamina entry points, and the chrome panel's two items.
		for (const id of [
			'init.title', 'init.round.advance', 'init.malice.dec', 'init.malice.inc', 'init.malice.quickadd.amount',
			'init.malice.quickadd.label', 'init.malice.quickadd.add', 'init.malice.log', 'init.hero.turn', 'init.hero.turnbox',
			'init.group.turn', 'init.hero.action', 'init.detail.action', 'init.cond.add', 'init.cond.remove', 'init.cell.stamina',
			'init.hero.stamina', 'init.hero.bar', 'init.detail.stamina', 'init.detail.bar', 'init.reset-turns', 'init.reset-encounter',
		]) {
			expect(ids).toContain(id);
		}
	});

	it('[CENSUS-07] the open title editor and a captained squad (SC-437): the textarea, the squad checklist and both captain buttons are identified controls (each rescanned with its row selected)', async () => {
		await dse.openNote('Initiative/rich.md');
		await dse.click(dse.block('ds-initiative').control('init.title'));
		await dse.waitFor(`!!document.querySelector('.markdown-reading-view [data-dse-control="init.title.input"]')`, 'the title editor');
		expect(censusFindings(await eventfulNodes([TRACKER_SCOPE], null), TRACKER_IDS, INERT_IDS)).toEqual([]);
		expect((await eventfulNodes([TRACKER_SCOPE], null)).map((n) => n.id)).toContain('init.title.input');
		await dse.openNote('Initiative/captain.md');
		const nodes = await eventfulNodes([TRACKER_SCOPE], null);
		expect(censusFindings(nodes, TRACKER_IDS, INERT_IDS)).toEqual([]);
		const ids = nodes.map((n) => n.id);
		for (const id of ['init.captain.relieve', 'init.detail.action']) expect(ids).toContain(id);
		// A minion's detail row carries the squad checklist, and an attached creature's carries "Make captain": select each and rescan.
		const root = dse.block('ds-initiative');
		await dse.click(root.control('init.cell.stamina', { nth: 0 }));
		await dse.waitFor(`!!document.querySelector('.markdown-reading-view [data-dse-control="init.detail.squad-action"]')`, 'the squad checklist');
		const squad = await eventfulNodes([TRACKER_SCOPE], null);
		expect(censusFindings(squad, TRACKER_IDS, INERT_IDS)).toEqual([]);
		expect(squad.map((n) => n.id)).toContain('init.detail.squad-action');
		await dse.click(root.control('init.cell.stamina', { nth: 4 }));
		await dse.waitFor(`!!document.querySelector('.markdown-reading-view [data-dse-control="init.captain.make"]')`, 'the Make captain button');
		const rider = await eventfulNodes([TRACKER_SCOPE], null);
		expect(censusFindings(rider, TRACKER_IDS, INERT_IDS)).toEqual([]);
		expect(rider.map((n) => n.id)).toContain('init.captain.make');
	});

	it('[CENSUS-08] the open ResetEncounterModal (SC-437): every node that listens for input is an identified control', async () => {
		await dse.openNote('Initiative/tracker.md');
		const root = dse.block('ds-initiative');
		await dse.hover(root.root);
		await dse.click(root.control('init.reset-encounter'));
		const modal = await dse.modal('reset-encounter');
		await dse.settle();
		const nodes = await eventfulNodes(['.modal-container .dse-modal .modal-content *']);
		expect(censusFindings(nodes, ALL_IDS)).toEqual([]);
		const ids = nodes.map((n) => n.id);
		for (const id of ['init.reset-encounter.cancel', 'init.reset-encounter.confirm']) expect(ids).toContain(id);
		await dse.click(modal.control('modal.close'));
	});
});

describe('real-Obsidian census: the minion stamina pool modal', () => {
	it('[CENSUS-06] the open pool modal (a hurt squad with conditions): every node that listens for input is an identified control', async () => {
		const { modal } = await openPoolModal(HURT);
		await dse.settle();
		const nodes = await eventfulNodes(['.modal-container .dse-modal .modal-content *']);
		expect(censusFindings(nodes, ALL_IDS)).toEqual([]);
		const ids = nodes.map((n) => n.id);
		// The probe sees every kind of control: the stepper's buttons and field, the Apply Damage button, the name
		// labels (div-with-a-listener controls jsdom cannot tell apart) and the condition icons.
		for (const id of ['pool.stamina.dec', 'pool.stamina.input', 'pool.stamina.inc', 'pool.apply-damage', 'pool.minion-name', 'pool.condition', 'pool.reset', 'pool.apply']) {
			expect(ids).toContain(id);
		}
		await dse.click(modal.control('modal.close'));
	});
});

describe('real-Obsidian census: the Conditions window', () => {
	it('[CENSUS-07] the open Conditions window (rows, one editor open, then the Add dropdown): every node that listens for input is an identified control', async () => {
		const { modal } = await openConditionsModal(CONDITIONS, 'hero');
		await dse.click(modal.control('cond.edit', { nth: 1 }));
		await dse.settle();
		const scope = ['.modal-container .dse-modal .modal-content *'];
		const rest = await eventfulNodes(scope);
		expect(censusFindings(rest, ALL_IDS)).toEqual([]);
		for (const id of ['cond.edit', 'cond.remove', 'cond.icon-search', 'cond.icon', 'cond.duration', 'cond.swatch', 'cond.effect', 'cond.add', 'cond.done']) {
			expect(rest.map((n) => n.id)).toContain(id);
		}
		// The dropdown's options are divs with a mousedown listener: only the browser can tell they are controls.
		await dse.click(modal.control('cond.add'));
		const open = await eventfulNodes(scope);
		expect(censusFindings(open, ALL_IDS)).toEqual([]);
		for (const id of ['cond.input', 'cond.option']) expect(open.map((n) => n.id)).toContain(id);
		await dse.click(modal.control('modal.close'));
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
