// SC-440: the Compendium text fields (Destination folder, Release) and the Initiative tracker's Default creature image path. The text fields
// update the plugin's setting on every keystroke and Obsidian writes data.json when the user clicks away; the image path is a file combobox: a click opens
// Obsidian's file picker (its own popup: an item is picked with a real click on it) and its X clears the path. data.json is read ON DISK.
// What the paths DO (where a sync writes, which image a creature gets) is read when a sync runs / a tracker renders, so these scenarios assert
// the stored value and the shown value, with a final plugin reload.
import { $, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { closeSettings, ctl, diskData, openAt, pressOn, readSettings, reloadPlugin, shownValue, typeThenBlur } from '../../driver/settingsDrive';

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

	it('[SET-X03] Default creature image path: a click opens the file picker, picking a file stores its path; Enter on the focused field opens nothing (Obsidian\'s combobox ignores it); the X clears the path', async () => {
		await dse.openNote('Stamina/basic.md');
		await openAt(INIT);
		try {
			expect((await readSettings()).defaultImagePath).toBe('Media/token_1.png');
			await dse.click(ctl('settings.initiative.default-image'));
			await dse.waitFor(`document.querySelectorAll('.suggestion-item').length > 0`, 'the file picker');
			// The picker re-renders as it filters: mark the wanted item page-side and click that (a real click), never hold an element across a render.
			await dse.page(`(() => { Array.from(document.querySelectorAll('.suggestion-item')).find((i) => i.textContent === 'Stamina/recoveries')?.setAttribute('data-picked', '1'); return true; })()`);
			await $('[data-picked="1"]').click();
			await dse.waitFor(`document.querySelectorAll('.suggestion-item').length === 0`, 'the picker to close');
			expect((await diskData()).defaultImagePath).toBe('Stamina/recoveries.md');
			// Enter with the combobox focused: no picker, nothing written (verified in 1.14.4; the keyboard pair is declared so a change shows).
			await pressOn('settings.initiative.default-image', 'Enter');
			expect(await dse.page<number>(`new Promise((r) => requestAnimationFrame(() => r(document.querySelectorAll('.suggestion-item').length)))`)).toBe(0);
			expect((await diskData()).defaultImagePath).toBe('Stamina/recoveries.md');
			await dse.click(ctl('settings.initiative.default-image.clear'));
			expect((await diskData()).defaultImagePath).toBe('');
			expect(await pickerItems()).toBe(0);
		} finally {
			await closeSettings();
		}
	});

	it('[SET-X04] after a plugin reload the fields show what was entered and data.json keeps it', async () => {
		await reloadPlugin();
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
