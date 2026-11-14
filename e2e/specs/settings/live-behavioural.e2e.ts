// SC-440: the settings that are READ WHEN A BLOCK (OR A LINK) IS DRAWN rather than reflected as an attribute, so whether an already-open note
// changes with them is its own question. Each scenario seeds the shipped data.json, opens a note, flips the setting in the settings window with a
// real click, and looks at the open note in the main window with no re-open. The attribute settings (reduce motion, fonts, sliders, the statblock
// rows) and the rolling pair are live and are asserted in toggles / dropdowns / fonts / sliders; the ones below are not, and carry markers.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { closeSettings, ctl, mainAttr, mainCount, onMain, openAt, readSettings } from '../../driver/settingsDrive';

const LINKS = 'settings.page.links';
const FALLBACK = 'settings.links.scc-web-fallback';
const SCC_NOTE = 'Settings/scc-link.md';
const CODE_URL = 'https://steelcompendium.io/scc/mcdm.heroes.v1/feature.ability.fury.level-1/gouge/';

describe('settings tab: settings read when a block or link is drawn', () => {
	knownBug('SC-644', '[SET-L01] Collapsible by default: switched off, the Collapse button leaves a stamina bar that is already open', async () => {
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
	}, { failsWith: /Expected: 0/ });

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
		expect(await mainCount('.ds-scc-unresolved')).toBe(1);
		await openAt(LINKS);
		try {
			await dse.click(ctl(FALLBACK)); // on again, with the note open
			expect(await mainCount('a.ds-scc-web')).toBe(1);
		} finally {
			await closeSettings();
		}
	}, { failsWith: /Expected: 1/ });

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
