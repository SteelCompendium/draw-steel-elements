// SC-440: the settings that are READ WHEN A BLOCK (OR A LINK) IS DRAWN rather than reflected as an attribute, so whether an already-open note
// changes with them is its own question. Each scenario seeds the shipped data.json, opens a note, flips the setting in the settings window with a
// real click, and looks at the open note in the main window with no re-open. The attribute settings (reduce motion, fonts, sliders, the statblock
// rows) and the rolling pair are live and are asserted in toggles / dropdowns / fonts / sliders; the ones below are not, and carry markers.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { closeSettings, ctl, diskData, mainAttr, mainCount, onMain, openAt, readSettings } from '../../driver/settingsDrive';

const STAMINA = '[data-dse-element="stamina-bar"]';
/** The previous scenario's flip is saved on a debounce; `setPrefs` disables the plugin, whose unload flushes that pending save over the `{}` it just wrote, so a
 *  scenario that needs the shipped defaults reads the disk first (`diskData` flushes the save and waits for it) and then resets. */
const shippedPrefs = async (): Promise<void> => {
	await diskData();
	await dse.setPrefs({});
};

const LINKS = 'settings.page.links';
const FALLBACK = 'settings.links.scc-web-fallback';
const SCC_NOTE = 'Settings/scc-link.md';
const CODE_URL = 'https://steelcompendium.io/scc/mcdm.heroes.v1/feature.ability.fury.level-1/gouge/';

describe('settings tab: settings read when a block or link is drawn', () => {
	it('[SET-L01] Collapsible by default: switched off, the Collapse button leaves a stamina bar that is already open', async () => {
		await dse.setPrefs({});
		await dse.openNote('Stamina/basic.md');
		expect(await mainCount('[data-dse-control="chrome.collapse"]')).toBe(1);
		await openAt('settings.page.element-defaults');
		try {
			await dse.click(ctl('settings.collapsible-default'));
			expect(await mainCount('[data-dse-control="chrome.collapse"]')).toBe(0);
		} finally {
			await closeSettings();
		}
	});

	// SC-644 rulings: a block with no Collapse control is never left collapsed, and switching the setting back on does not fold it again.
	it('[SET-L05] Collapsible by default: switched off, a stamina bar the reader had collapsed opens (no stuck one-liner); switched back on, it stays open', async () => {
		await shippedPrefs();
		await dse.openNote('Stamina/basic.md');
		await onMain(async () => {
			const bar = dse.block('ds-stamina-bar');
			await dse.hover(bar.root);
			await dse.click(bar.control('chrome.collapse'));
		});
		expect(await mainAttr(STAMINA, 'data-dse-collapsed')).toBe('on');
		expect(await mainCount('[data-dse-control="chrome.expand"]')).toBe(1);
		await openAt('settings.page.element-defaults');
		try {
			await dse.click(ctl('settings.collapsible-default')); // off
			expect({
				collapsedAttr: await mainAttr(STAMINA, 'data-dse-collapsed'),
				collapse: await mainCount('[data-dse-control="chrome.collapse"]'),
				expand: await mainCount('[data-dse-control="chrome.expand"]'),
			}).toEqual({ collapsedAttr: null, collapse: 0, expand: 0 });
			await dse.click(ctl('settings.collapsible-default')); // on again
			expect({
				collapsedAttr: await mainAttr(STAMINA, 'data-dse-collapsed'),
				collapse: await mainCount('[data-dse-control="chrome.collapse"]'),
			}).toEqual({ collapsedAttr: null, collapse: 1 });
		} finally {
			await closeSettings();
		}
	});

	// SC-644, pending Scott's answer: Start collapsed does not move a block that is already open; a note opened afterwards starts collapsed.
	it('[SET-L06] Start collapsed: switched on with the note open, the open stamina bar stays open; the note opened again starts collapsed', async () => {
		await shippedPrefs();
		await dse.openNote('Stamina/basic.md');
		expect(await mainAttr(STAMINA, 'data-dse-collapsed')).toBe(null);
		await openAt('settings.page.element-defaults');
		try {
			await dse.click(ctl('settings.collapse-default'));
			expect(await mainAttr(STAMINA, 'data-dse-collapsed')).toBe(null);
			expect(await mainCount('[data-dse-control="chrome.collapse"]')).toBe(1);
		} finally {
			await closeSettings();
		}
		try {
			await dse.openNote('Stamina/basic.md'); // drawn AFTER the change
			expect(await mainAttr(STAMINA, 'data-dse-collapsed')).toBe('on');
		} finally {
			await shippedPrefs(); // the next scenario must not open its note collapsed
		}
	});

	knownBug('SC-645', '[SET-L02] Edit Recoveries with a popover: switched on, a marker click on a stamina bar that is already open opens the popover', async () => {
		await dse.setPrefs({});
		await dse.openNote('Stamina/recoveries.md');
		await openAt('settings.page.element-defaults', 'settings.advanced.element-defaults');
		try {
			await dse.click(ctl('settings.stamina-recovery-popover'));
			await onMain(async () => {
				await dse.click(dse.block('ds-stamina-bar').control('recov.marker', { nth: 4 }));
				await dse.settle();
			});
			expect(await mainCount('.dse-stamina-rec__pop')).toBe(1);
		} finally {
			await closeSettings();
		}
	}, { failsWith: /Expected: 1/ });

	knownBug('SC-647', '[SET-L03] Fall back to steelcompendium.io links: turned back on, an unresolved link on an open note becomes a link (no re-open)', async () => {
		await dse.setPrefs({});
		await dse.openNote(SCC_NOTE);
		await openAt(LINKS);
		try {
			await dse.click(ctl(FALLBACK)); // off
		} finally {
			await closeSettings();
		}
		await dse.openNote(SCC_NOTE); // drawn with the fallback off: plain text
		expect({ unresolvedSpans: await mainCount('.ds-scc-unresolved') }).toEqual({ unresolvedSpans: 1 }); // setup check, not the bug
		await openAt(LINKS);
		try {
			await dse.click(ctl(FALLBACK)); // on again, with the note open
			expect({ webLinks: await mainCount('a.ds-scc-web') }).toEqual({ webLinks: 1 }); // the bug check
		} finally {
			await closeSettings();
		}
	}, { failsWith: /webLinks/ });

	it('[SET-L04] Fall back to steelcompendium.io links: a link drawn with it on is a steelcompendium.io link, one drawn with it off is plain text (applies to a note drawn after the change)', async () => {
		await dse.setPrefs({});
		await dse.openNote(SCC_NOTE);
		expect(await mainAttr('a.ds-scc-web', 'href')).toBe(CODE_URL);
		await openAt(LINKS);
		try {
			await dse.click(ctl(FALLBACK));
			expect((await readSettings()).sccWebFallback).toBe(false);
		} finally {
			await closeSettings();
		}
		await dse.openNote(SCC_NOTE);
		expect(await mainCount('a.ds-scc-web')).toBe(0);
		expect(await mainCount('.ds-scc-unresolved')).toBe(1);
	});
});
