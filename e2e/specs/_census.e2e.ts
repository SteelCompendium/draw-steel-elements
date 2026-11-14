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
import { EXHAUSTED, MID, openAddHero, openLimits, openLogFromBar, openMontage } from '../driver/montage';
import { back, closeSettings, idsOnPage, openSettings, SETTINGS_CENSUS_EXCLUDE, SETTINGS_SCOPE, showPage } from '../driver/settings';
import { idsOf } from '../manifest/surface';
import barManifest from '../manifest/stamina-bar';
import modalManifest from '../manifest/stamina-edit-modal';
import conditionsManifest from '../manifest/conditions-modal';
import poolManifest from '../manifest/minion-pool-modal';
import initiativeManifest from '../manifest/initiative';
import resetManifest from '../manifest/reset-encounter-modal';
import chromeManifest from '../manifest/chrome';
import negotiationManifest from '../manifest/negotiation';
import montageManifest from '../manifest/montage';
import montageLogManifest from '../manifest/montage-log-modal';
import montageAddHeroManifest from '../manifest/montage-add-hero-modal';
import montageLimitsManifest from '../manifest/montage-limits-modal';
import settingsManifest from '../manifest/settings-tab';

const ALL_IDS = new Set([
	...idsOf(barManifest),
	...idsOf(modalManifest),
	...idsOf(conditionsManifest),
	...idsOf(poolManifest),
	...idsOf(initiativeManifest),
	...idsOf(resetManifest),
	...idsOf(chromeManifest),
	...idsOf(montageManifest),
	...idsOf(montageLogManifest),
	...idsOf(montageAddHeroManifest),
	...idsOf(montageLimitsManifest),
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
// SC-438: the montage is scanned by its root container too (its own chrome-panel items included). A node there may carry an id of the
// montage manifest or the framework chrome's; the three modals' ids are only expected inside their own windows (ALL_IDS).
const MONTAGE_SCOPE = '.markdown-reading-view [data-dse-element="montage"] *';
const MONTAGE_IDS = new Set([...idsOf(montageManifest), ...idsOf(chromeManifest)]);
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
		// One scan feeds both assertions (SC-593: the page does not change between them, so a second scan only costs time under load).
		const editing = await eventfulNodes([TRACKER_SCOPE], null);
		expect(censusFindings(editing, TRACKER_IDS, INERT_IDS)).toEqual([]);
		expect(editing.map((n) => n.id)).toContain('init.title.input');
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
	it('[CENSUS-09] the open Conditions window (rows, one editor open, then the Add dropdown): every node that listens for input is an identified control', async () => {
		const { modal } = await openConditionsModal(CONDITIONS, 'hero');
		await dse.click(modal.control('cond.edit', { nth: 1 }));
		await dse.settle();
		const scope = ['.modal-container .dse-modal .modal-content *'];
		const rest = await eventfulNodes(scope);
		expect(censusFindings(rest, ALL_IDS)).toEqual([]);
		for (const id of ['cond.edit', 'cond.remove', 'cond.icon', 'cond.duration', 'cond.swatch', 'cond.effect', 'cond.add', 'cond.done']) {
			expect(rest.map((n) => n.id)).toContain(id);
		}
		// (The icon search and the custom colour input listen only for input / change, so the jsdom census owns those two.)
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

describe('real-Obsidian census: the montage tracker (SC-438)', () => {
	it('[CENSUS-10] the whole montage (scoped by its root, chrome panel included), mid-game and then complete: every node that listens for input is an identified control', async () => {
		const root = await openMontage(MID);
		await dse.hover(root.root);
		const mid = await eventfulNodes([MONTAGE_SCOPE], null);
		expect(censusFindings(mid, MONTAGE_IDS)).toEqual([]);
		const ids = mid.map((n) => n.id);
		// Sanity that the probe sees every part of the board: the Heroes "+", a hero's row button, a filled cell, the open socket
		// and its quick trio, the action bar, both disclosures and the chrome panel's four items.
		for (const id of [
			'montage.board.add-hero', 'montage.board.row-act', 'montage.cell', 'montage.cell.socket', 'montage.quick.success',
			'montage.quick.failure', 'montage.quick.assist', 'montage.bar.log', 'montage.bar.undo', 'montage.bar.back',
			'montage.bar.end-round', 'montage.strip', 'montage.guide', 'montage.chrome.add-round', 'montage.chrome.add-hero',
			'montage.chrome.set-limits', 'montage.chrome.reset-progress',
		]) {
			expect(ids).toContain(id);
		}
		// A montage that ran out of rounds has the other bar: Reopen and Clear all.
		await openMontage(EXHAUSTED);
		const done = await eventfulNodes([MONTAGE_SCOPE], null);
		expect(censusFindings(done, MONTAGE_IDS)).toEqual([]);
		for (const id of ['montage.bar.reopen', 'montage.bar.clear-all', 'montage.bar.back']) expect(done.map((n) => n.id)).toContain(id);
	});

	it('[CENSUS-11] the open Log an action sheet, new then edit: every node that listens for input is an identified control', async () => {
		const scope = ['.modal-container .dse-modal .modal-content *'];
		const { root, modal } = await openLogFromBar(MID);
		await dse.settle();
		const fresh = await eventfulNodes(scope);
		expect(censusFindings(fresh, ALL_IDS)).toEqual([]);
		for (const id of ['montage.log.result.success', 'montage.log.result.failure', 'montage.log.result.assist', 'montage.log.cancel', 'montage.log.submit']) {
			expect(fresh.map((n) => n.id)).toContain(id);
		}
		await dse.click(modal.control('modal.close'));
		// A filled cell opens the edit sheet, which adds Remove.
		await dse.click(root.control('montage.cell', { nth: 0 }));
		const edit = await dse.modal('montage-log');
		await dse.settle();
		const editing = await eventfulNodes(scope);
		expect(censusFindings(editing, ALL_IDS)).toEqual([]);
		expect(editing.map((n) => n.id)).toContain('montage.log.remove');
		await dse.click(edit.control('modal.close'));
	});

	it('[CENSUS-12] the open Add a hero and Set limits windows: every node that listens for input is an identified control', async () => {
		const scope = ['.modal-container .dse-modal .modal-content *'];
		const hero = await openAddHero(MID);
		await dse.settle();
		const adding = await eventfulNodes(scope);
		expect(censusFindings(adding, ALL_IDS)).toEqual([]);
		for (const id of ['montage.add-hero.cancel', 'montage.add-hero.submit']) expect(adding.map((n) => n.id)).toContain(id);
		await dse.click(hero.modal.control('modal.close'));
		const limits = await openLimits(MID);
		await dse.settle();
		const setting = await eventfulNodes(scope);
		expect(censusFindings(setting, ALL_IDS)).toEqual([]);
		for (const id of ['montage.limits.cancel', 'montage.limits.save']) expect(setting.map((n) => n.id)).toContain(id);
		// (The name field and the two limit fields listen only for input, so the jsdom census owns those three.)
		await dse.click(limits.modal.control('modal.close'));
	});
});

// SC-439: the negotiation tracker is scanned by its root container (chrome panel included), like the initiative tracker. The ids a
// node there may carry: the negotiation manifest's and the framework chrome's (Collapse / Expand).
const NEGO_SCOPE = '.markdown-reading-view [data-dse-element="negotiation"] *';
const NEGO_IDS = new Set([...idsOf(negotiationManifest), ...idsOf(chromeManifest)]);

describe('real-Obsidian census: the negotiation tracker', () => {
	it('[CENSUS-13] the whole negotiation tracker (scoped by its root, chrome panel included, one motivation already spent): every node that listens for input is an identified control', async () => {
		await dse.openNote('Negotiation/spent.md');
		const nodes = await eventfulNodes([NEGO_SCOPE], null);
		expect(censusFindings(nodes, NEGO_IDS)).toEqual([]);
		const ids = nodes.map((n) => n.id);
		// Sanity that the probe sees every part of the card: the options button, the tablist and a tab, both tracks and their seals,
		// the chips on the argument tab, the tier radiogroup and its rows, Complete Argument, a Spent chip, and the chrome panel's
		// Collapse button. (The three modifier checkboxes listen only for `change`, so the jsdom census owns those.)
		for (const id of [
			'negotiation.menu', 'negotiation.tablist', 'negotiation.tab.argument', 'negotiation.tab.learn-more',
			'negotiation.patience', 'negotiation.patience.seal', 'negotiation.interest', 'negotiation.interest.seal',
			'negotiation.appeal.motivation', 'negotiation.appeal.pitfall', 'negotiation.tier', 'negotiation.tier.row',
			'negotiation.complete', 'negotiation.spent', 'chrome.collapse', 'chrome.expand',
		]) {
			expect(ids).toContain(id);
		}
	});

	it('[CENSUS-14] the open options menu (Obsidian\'s native Menu): its Reset item is an identified control', async () => {
		await dse.openNote('Negotiation/basic.md');
		await dse.click(dse.block('ds-negotiation').control('negotiation.menu'));
		await dse.waitFor(`!!document.querySelector('.menu [data-dse-control="negotiation.menu.reset"]')`, 'the Reset item in the open menu');
		const nodes = await eventfulNodes(['.menu *'], null);
		expect(censusFindings(nodes, NEGO_IDS)).toEqual([]);
		expect(nodes.map((n) => n.id)).toContain('negotiation.menu.reset');
		await dse.press('Escape');
		await dse.waitFor(`document.querySelectorAll('.menu').length === 0`, 'the menu to close');
	});

	it('[CENSUS-15] an ended negotiation (static tier rows, Complete disabled) and its Learn Motivation/Pitfall tab: every node that listens for input is an identified control', async () => {
		await dse.openNote('Negotiation/ended.md');
		const ended = await eventfulNodes([NEGO_SCOPE], null);
		expect(censusFindings(ended, NEGO_IDS)).toEqual([]);
		// Over: the tier rows are plain divs nothing listens on, but the group-less panel still leaves Complete (disabled) and the chips.
		for (const id of ['negotiation.complete', 'negotiation.appeal.motivation', 'negotiation.patience.seal']) expect(ended.map((n) => n.id)).toContain(id);
		expect(ended.map((n) => n.id)).not.toContain('negotiation.tier.row');
		await dse.click(dse.block('ds-negotiation').control('negotiation.tab.learn-more'));
		await dse.waitFor(`document.querySelector('.markdown-reading-view [data-dse-element="negotiation"] .dse-nt__learn-more')?.closest('[role="tabpanel"]')?.hidden === false`, 'the Learn Motivation/Pitfall panel');
		const learn = await eventfulNodes([NEGO_SCOPE], null);
		expect(censusFindings(learn, NEGO_IDS)).toEqual([]);
		expect(learn.map((n) => n.id)).toContain('negotiation.tablist');
	});
});

// SC-440: the settings tab, scanned by its container (Obsidian's `.vertical-tab-content-container` in the settings window), page by page:
// the index, every section page and each nested Advanced page. The listeners are Obsidian's own on its native rows, so only the browser can
// say a node is a control. Left out: Obsidian's page titlebar (the back button) and the live preview's stage (another surface's elements).
const SETTINGS_IDS = new Set(idsOf(settingsManifest));
/** Each page of the shipped tab (gate off), the ids it must show, and its nested Advanced page when it has one. */
const SHIPPED_PAGES: Array<{ link: string; ids: string[]; advanced?: { link: string; ids: string[] } }> = [
	{ link: 'settings.page.appearance', ids: ['settings.reduce-motion', 'settings.portraits', 'settings.reset.appearance'] },
	{
		link: 'settings.page.typography',
		ids: [
			'settings.font-title', 'settings.font-title.custom', 'settings.font-title.list', 'settings.font-body', 'settings.font-body.custom',
			'settings.font-body.list', 'settings.font-controls', 'settings.font-controls.custom', 'settings.font-controls.list',
			'settings.text-scale', 'settings.card-scale', 'settings.small-text-scale', 'settings.large-text-scale', 'settings.control-text-scale',
			'settings.advanced.typography', 'settings.reset.typography',
		],
		advanced: {
			link: 'settings.advanced.typography',
			ids: [
				'settings.font-card-body', 'settings.font-card-body.custom', 'settings.font-card-body.list', 'settings.font-label',
				'settings.font-label.custom', 'settings.font-label.list', 'settings.font-mono', 'settings.font-mono.custom', 'settings.font-mono.list',
			],
		},
	},
	{
		link: 'settings.page.statblock-display',
		ids: [
			'settings.sb-preset', 'settings.sb-feature-style', 'settings.sb-density', 'settings.sb-columns', 'settings.sb-stats', 'settings.sb-sticky',
			'settings.sb-sticky-meta', 'settings.advanced.statblock-display', 'settings.reset.statblock-display',
		],
		advanced: { link: 'settings.advanced.statblock-display', ids: ['settings.sb-char-line', 'settings.sb-char-box', 'settings.sb-villain'] },
	},
	{ link: 'settings.page.featureblock-display', ids: ['settings.fb-feature-style', 'settings.fb-stats', 'settings.reset.featureblock-display'] },
	{ link: 'settings.page.feature-display', ids: ['settings.kw-usage', 'settings.dist-target', 'settings.reset.feature-display'] },
	{
		link: 'settings.page.element-defaults',
		ids: ['settings.collapsible-default', 'settings.collapse-default', 'settings.advanced.element-defaults', 'settings.reset.element-defaults'],
		advanced: { link: 'settings.advanced.element-defaults', ids: ['settings.stamina-recovery-popover'] },
	},
	{ link: 'settings.page.rolling', ids: ['settings.rolling-enabled', 'settings.roller-engine', 'settings.roll-click-to-roll', 'settings.reset.rolling'] },
	{
		link: 'settings.page.compendium',
		ids: ['settings.compendium.destination', 'settings.compendium.release', 'settings.compendium.locale', 'settings.compendium.sync', 'settings.compendium.check'],
	},
	{ link: 'settings.page.links', ids: ['settings.links.scc-web-fallback'] },
	{ link: 'settings.page.initiative-tracker', ids: ['settings.initiative.default-image', 'settings.initiative.default-image.clear'] },
];

/** One scan of the page on screen: every eventful node is an id the manifest declares, and every id the page must show is there. */
async function expectPageIdentified(label: string, mustShow: string[]): Promise<void> {
	const nodes = await eventfulNodes([SETTINGS_SCOPE], SETTINGS_CENSUS_EXCLUDE);
	expect({ page: label, findings: censusFindings(nodes, SETTINGS_IDS) }).toEqual({ page: label, findings: [] });
	const stamped = await idsOnPage();
	expect({ page: label, stamped: stamped.filter((id) => !SETTINGS_IDS.has(id)) }).toEqual({ page: label, stamped: [] });
	for (const id of mustShow) expect({ page: label, id, shown: stamped.includes(id) }).toEqual({ page: label, id, shown: true });
}

describe('real-Obsidian census: the settings tab (SC-440)', () => {
	it('[CENSUS-16] the shipped settings tab (gate off), the index and every page and Advanced page: every node that listens for input is an identified control, and the gated controls are absent', async () => {
		await dse.openNote('Stamina/basic.md');
		await openSettings();
		try {
			const index = SHIPPED_PAGES.map((p) => p.link);
			await expectPageIdentified('index', [...index, 'settings.reset-all']);
			expect(await idsOnPage()).not.toContain('settings.page.authoring');
			for (const page of SHIPPED_PAGES) {
				await showPage(page.link);
				await expectPageIdentified(page.link, page.ids);
				if (page.advanced) {
					await showPage(page.advanced.link);
					await expectPageIdentified(page.advanced.link, page.advanced.ids);
					await back();
				}
				await back();
			}
			// The two gated rows are not drawn at all: Print preview on Appearance, the whole Authoring page.
			await showPage('settings.page.appearance');
			expect(await idsOnPage()).not.toContain('settings.print-preview');
		} finally {
			await closeSettings();
		}
	});
});

describe('real-Obsidian census: the settings tab with the experimental gate on (SC-440)', () => {
	before(async () => {
		await dse.setPrefs({}, { experimental: true });
	});
	after(async () => {
		await dse.setPrefs({});
	});

	it('[CENSUS-17] gate on: Print preview, the Authoring page and its reset row appear, and every node that listens for input is still an identified control', async () => {
		await dse.openNote('Stamina/basic.md');
		await openSettings();
		try {
			await expectPageIdentified('index', ['settings.page.authoring', 'settings.page.appearance', 'settings.reset-all']);
			await showPage('settings.page.appearance');
			await expectPageIdentified('appearance', ['settings.reduce-motion', 'settings.print-preview', 'settings.portraits', 'settings.reset.appearance']);
			await back();
			await showPage('settings.page.authoring');
			await expectPageIdentified('authoring', ['settings.authoring-controls', 'settings.reset.authoring']);
		} finally {
			await closeSettings();
		}
	});
});
