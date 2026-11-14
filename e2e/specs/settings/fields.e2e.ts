// SC-440: the Compendium text fields (Destination folder, Release) and the Initiative tracker's Default creature image path. The text fields
// update the plugin's setting on every keystroke and Obsidian writes data.json when the user clicks away; the image path is a file combobox: a click opens
// Obsidian's file picker (its own popup: an item is picked with a real click on it) and its X clears the path. data.json is read ON DISK.
// What the paths DO (where a sync writes, which image a creature gets) is read when a sync runs / a tracker renders, so these scenarios assert
// the stored value and the shown value, with a final plugin reload.
import { $, browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { closeSettings, ctl, diskData, ensureState, openAt, pressOn, readSettings, shownValue, typeThenBlur } from '../../driver/settingsDrive';

const COMPENDIUM = 'settings.page.compendium';
const INIT = 'settings.page.initiative-tracker';
const pickerItems = (): Promise<number> => dse.page<number>(`document.querySelectorAll('.suggestion-item').length`);

describe('settings tab: text and file fields', () => {
	it('[SET-X01] Destination folder: typing updates the setting as it goes, clicking away writes data.json', async () => {
		await dse.openNote('Stamina/basic.md');
		await openAt(COMPENDIUM);
		try {
			expect(await shownValue('settings.compendium.destination')).toBe('DS Compendium');
			expect((await readSettings()).compendiumDestinationDirectory).toBe('DS Compendium'); // nothing has been written yet: the plugin's own value
			const el = ctl('settings.compendium.destination');
			await dse.type(el, 'Rules/Draw Steel', { replace: true });
			expect((await readSettings()).compendiumDestinationDirectory).toBe('Rules/Draw Steel'); // the plugin holds it before the blur (data.json is written by the click away)
			await dse.blur(el, $('.setting-page-title'));
			expect((await diskData()).compendiumDestinationDirectory).toBe('Rules/Draw Steel');
			expect(await shownValue('settings.compendium.destination')).toBe('Rules/Draw Steel');
		} finally {
			await closeSettings();
		}
	});

	it('[SET-X02] Release: a typed tag is stored (empty means the latest release)', async () => {
		await dse.openNote('Stamina/basic.md');
		await openAt(COMPENDIUM);
		try {
			expect(await shownValue('settings.compendium.release')).toBe('');
			await typeThenBlur('settings.compendium.release', 'v4.20260716T000000');
			expect((await diskData()).compendiumReleaseTag).toBe('v4.20260716T000000');
			expect(await shownValue('settings.compendium.release')).toBe('v4.20260716T000000');
		} finally {
			await closeSettings();
		}
	});

	it('[SET-X03] Default creature image path: a click opens the file picker, picking a file stores its path and a creature without an image shows it; Enter on the focused field opens nothing (Obsidian\'s combobox ignores it); the X clears the path and the portrait goes', async () => {
		await dse.openNote('Stamina/basic.md');
		await openAt(INIT);
		try {
			expect((await readSettings()).defaultImagePath).toBe('Media/token_1.png');
			await dse.click(ctl('settings.initiative.default-image'));
			await dse.waitFor(`document.querySelectorAll('.suggestion-item').length > 0`, 'the file picker');
			// Pick with the keyboard: the picker's own input has focus, so type enough of the name to leave that one file and press Enter. (The list
			// redraws after it opens and as it filters, so clicking an item went stale under load; real keys hold no element across a redraw.)
			await browser.keys('token'.split(''));
			await dse.waitFor(`(() => { const items = Array.from(document.querySelectorAll('.suggestion-item')); return items.length === 1 && items[0].textContent === 'Settings/token.svg'; })()`, 'the picker to filter to Settings/token.svg');
			await browser.keys('Enter');
			await dse.waitFor(`document.querySelectorAll('.suggestion-item').length === 0`, 'the picker to close');
			expect((await diskData()).defaultImagePath).toBe('Settings/token.svg');
			// Enter with the combobox focused: no picker, nothing written (verified in 1.14.4; the keyboard pair is declared so a change shows).
			await pressOn('settings.initiative.default-image', 'Enter');
			expect(await dse.page<number>(`new Promise((r) => requestAnimationFrame(() => r(document.querySelectorAll('.suggestion-item').length)))`)).toBe(0);
			expect((await diskData()).defaultImagePath).toBe('Settings/token.svg');
		} finally {
			await closeSettings();
		}
		// On screen: a creature with no image of its own takes the default path (initiative/view.ts renderPortrait), drawn when the tracker is opened.
		await dse.openNote('Initiative/tracker.md');
		await dse.waitFor(`document.querySelectorAll('.markdown-reading-view [data-dse-element="initiative"] img[src*="token.svg"]').length > 0`, 'the picked image on a portrait');
		await openAt(INIT);
		try {
			await dse.click(ctl('settings.initiative.default-image.clear'));
			expect((await diskData()).defaultImagePath).toBe('');
			expect(await pickerItems()).toBe(0);
		} finally {
			await closeSettings();
		}
		await dse.openNote('Initiative/tracker.md');
		expect(await dse.page<number>(`document.querySelectorAll('.markdown-reading-view [data-dse-element="initiative"] img[src*="token.svg"]').length`)).toBe(0);
	});

	it('[SET-X04] after a plugin reload on the data.json the field scenarios above wrote, the fields show what was entered and data.json keeps it', async () => {
		// Reloads on the data.json the scenarios above wrote (seeded with the same state only when this one runs alone).
		await ensureState({ prefs: {}, compendiumDestinationDirectory: 'Rules/Draw Steel', compendiumReleaseTag: 'v4.20260716T000000', defaultImagePath: '' });
		const data = await diskData();
		expect([data.compendiumDestinationDirectory, data.compendiumReleaseTag, data.defaultImagePath]).toEqual(['Rules/Draw Steel', 'v4.20260716T000000', '']);
		await openAt(COMPENDIUM);
		try {
			expect(await shownValue('settings.compendium.destination')).toBe('Rules/Draw Steel');
			expect(await shownValue('settings.compendium.release')).toBe('v4.20260716T000000');
		} finally {
			await closeSettings();
		}
		await openAt(INIT);
		try {
			expect(await dse.page<string>(`document.querySelector('[data-dse-control="settings.initiative.default-image"] .combobox-button-label')?.textContent ?? ''`)).toBe('');
		} finally {
			await closeSettings();
		}
	});
});
