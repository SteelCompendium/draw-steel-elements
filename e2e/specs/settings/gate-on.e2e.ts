// SC-440: the controls the experimental gate hides from the shipped tab (SC-406): the Authoring page (Show edit button on rendered blocks) and
// Print preview on Appearance. This is the one place a settings spec turns the gate ON: `dse.setPrefs({}, { experimental: true })` writes the gate
// into data.json and reloads the plugin, and the `after` writes `{}` back (the shipped state), so no other spec file sees it. The shipped
// tab's ABSENCE of these controls is asserted by CENSUS-16 and the jsdom matrix.
// Representative element: Stamina/basic.md (data-dse-print on its root; the Edit pencil is a chrome item).
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import {
	back, closeSettings, ctl, diskPrefs, idsOnPage, mainAttr, mainCount, openAt, openSettings, pressOn, prefValue, showPage, ensureState, toggleIsOn, waitDiskPrefs,
} from '../../driver/settingsDrive';

const STAMINA = '[data-dse-element="stamina-bar"]';
const EDIT = '[data-dse-chrome-item="edit"]';

describe('settings tab: with the experimental gate on', () => {
	before(() => dse.setPrefs({}, { experimental: true }));
	after(() => dse.setPrefs({}));

	it('[SET-G01] the index gains an Authoring row between Rolling and Compendium; a click opens a page with its one toggle and its reset row', async () => {
		await dse.openNote('Stamina/basic.md');
		await openSettings();
		try {
			const pages = (await idsOnPage()).filter((id) => id.startsWith('settings.page.'));
			expect(pages.indexOf('settings.page.authoring')).toBe(pages.indexOf('settings.page.rolling') + 1);
			await dse.click(ctl('settings.page.authoring'));
			await dse.waitFor(`document.querySelector('.setting-page-title')?.textContent === 'Authoring'`, 'the Authoring page');
			expect(await dse.page<string[]>(`Array.from(document.querySelectorAll('.setting-page-content [data-dse-control]')).map((e) => e.getAttribute('data-dse-control'))`)).toEqual(['settings.authoring-controls', 'settings.reset.authoring']);
		} finally {
			await closeSettings();
		}
	});

	it('[SET-G02] Print preview (Appearance, only with the gate on): click and Space flip it, the open bar\'s data-dse-print follows live; left on', async () => {
		await dse.openNote('Stamina/basic.md');
		await openAt('settings.page.appearance');
		try {
			const id = 'settings.print-preview';
			expect(await toggleIsOn(id)).toBe(false);
			await dse.click(ctl(id));
			expect(await prefValue('printPreview', 'off')).toBe('on');
			expect(await toggleIsOn(id)).toBe(true);
			expect(await mainAttr(STAMINA, 'data-dse-print')).toBe('on');
			await pressOn(id, 'Space');
			expect(await prefValue('printPreview', 'off')).toBe('off');
			expect(await mainAttr(STAMINA, 'data-dse-print')).toBe('off');
			await dse.click(ctl(id));
			expect(await prefValue('printPreview', 'off')).toBe('on');
			expect(await mainAttr(STAMINA, 'data-dse-print')).toBe('on');
		} finally {
			await closeSettings();
		}
	});

	it('[SET-G03] Show edit button on rendered blocks: click and Space flip it and it is stored; a block opened afterwards has the Edit pencil; left on', async () => {
		await dse.openNote('Stamina/basic.md');
		expect(await mainCount(EDIT)).toBe(0);
		await openAt('settings.page.authoring');
		try {
			const id = 'settings.authoring-controls';
			await dse.click(ctl(id));
			expect(await prefValue('authoringControls', false)).toBe(true);
			expect(await toggleIsOn(id)).toBe(true);
			await pressOn(id, 'Space');
			expect(await prefValue('authoringControls', false)).toBe(false);
			await dse.click(ctl(id));
			expect(await prefValue('authoringControls', false)).toBe(true);
		} finally {
			await closeSettings();
		}
		await dse.openNote('Stamina/basic.md'); // rendered AFTER the change
		expect(await mainCount(EDIT)).toBe(1);
	});

	it('[SET-G04] after a plugin reload (gate still on) on the data.json the scenarios above wrote, Print preview and Show edit button show on and data.json keeps both', async () => {
		// Reloads on the data.json the scenarios above wrote (seeded with the same state, gate on, only when this one runs alone).
		await ensureState({ experimental: true, prefs: { printPreview: 'on', authoringControls: true } });
		expect(await diskPrefs()).toEqual({ printPreview: 'on', authoringControls: true });
		await openAt('settings.page.appearance');
		try {
			expect(await toggleIsOn('settings.print-preview')).toBe(true);
			await back();
			await showPage('settings.page.authoring');
			expect(await toggleIsOn('settings.authoring-controls')).toBe(true);
		} finally {
			await closeSettings();
		}
	});

	it('[SET-G05] Reset authoring: Show edit button goes back to off (the toggle on the page shows it), Print preview (another page) is kept', async () => {
		await dse.setPrefs({ printPreview: 'on', authoringControls: true }, { experimental: true });
		await dse.openNote('Stamina/basic.md');
		await openAt('settings.page.authoring');
		try {
			await dse.click(ctl('settings.reset.authoring'));
			expect(await waitDiskPrefs({ printPreview: 'on' })).toEqual({ printPreview: 'on' });
			expect(await toggleIsOn('settings.authoring-controls')).toBe(false);
		} finally {
			await closeSettings();
		}
	});

	it('[SET-G07] Reset authoring with the keyboard: Enter on the focused row resets Show edit button, and the toggle on the page shows it off', async () => {
		await dse.setPrefs({ printPreview: 'on', authoringControls: true }, { experimental: true });
		await dse.openNote('Stamina/basic.md');
		await openAt('settings.page.authoring');
		try {
			await pressOn('settings.reset.authoring', 'Enter');
			expect(await waitDiskPrefs({ printPreview: 'on' })).toEqual({ printPreview: 'on' });
			expect(await toggleIsOn('settings.authoring-controls')).toBe(false);
		} finally {
			await closeSettings();
		}
	});

	knownBug('SC-644', '[SET-G06] Show edit button on rendered blocks: the Edit pencil appears on a block that is already open', async () => {
		await dse.setPrefs({}, { experimental: true });
		await dse.openNote('Stamina/basic.md');
		await openAt('settings.page.authoring');
		try {
			await dse.click(ctl('settings.authoring-controls'));
			expect(await prefValue('authoringControls', false)).toBe(true);
			expect(await mainCount(EDIT)).toBe(1);
		} finally {
			await closeSettings();
		}
	}, { failsWith: /Expected: 1/ });
});
