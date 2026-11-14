// SC-440: the settings tab's dropdowns (the Statblock display rows and Preset, Featureblock display, Feature display, Roller, Locale).
// Obsidian draws a native <select>; its popup list cannot be driven by the browser protocol, so the real input is the key a user presses on
// the focused select (ArrowDown picks the next option, ArrowUp the previous one: Characteristics and Villain actions default to their LAST
// option) and the change event that follows. Each pick is asserted in data.json ON DISK, in the select's shown value and on the OPEN note's
// element (the reflected attribute), live. The Preset goes last: it rewrites nine of the rows above. A final reload checks the whole page set.
// Representative elements: Settings/statblock.md, Settings/featureblock.md, Feature/feature.md.
import { browser, expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { back, closeSettings, ctl, diskData, diskPrefs, mainAttr, openAt, pressOn, prefValue, rawData, readSettings, shownValue, showPage, ensureState } from '../../driver/settingsDrive';

const STATBLOCK = '[data-dse-element="statblock"]';
const STAT_PAGE = 'settings.page.statblock-display';
const STAT_ADV = 'settings.advanced.statblock-display';
/** data.json's `prefs` after the file: the Preset (Sourcebook) rewrote the nine members; the Featureblock rows and Roller were left changed. */
const FINAL = {
	sbFeatureStyle: 'flat', sbStats: 'ledger', kwUsage: 'text', distTarget: 'text', sbCharLine: 'one', sbCharBox: 'on', sbVillain: 'inline',
	fbFeatureStyle: 'flat', fbStats: 'ledger', rollerEngine: 'dice-roller',
};

async function pick(note: string, links: string[], id: string, key: string, def: string, alt: string, keyName: string, effect?: () => Promise<void>): Promise<void> {
	await dse.openNote(note);
	await openAt(...links);
	try {
		expect(await shownValue(id)).toBe(def);
		await pressOn(id, keyName);
		expect(await prefValue(key, def)).toBe(alt);
		expect((await diskPrefs())[key]).toBe(alt); // a non-default value IS stored
		expect(await shownValue(id)).toBe(alt);
		await effect?.();
	} finally {
		await closeSettings();
	}
}
const statAttr = (attr: string, value: string) => async (): Promise<void> => expect(await mainAttr(STATBLOCK, attr)).toBe(value);

describe('settings tab: dropdowns', () => {
	it('[SET-D01] Feature style (Statblock display): ArrowDown picks Flat list, the open statblock follows live, and the Preset reads Custom', async () => {
		await pick('Settings/statblock.md', [STAT_PAGE], 'settings.sb-feature-style', 'sbFeatureStyle', 'card', 'flat', 'ArrowDown', async () => {
			expect(await mainAttr(STATBLOCK, 'data-dse-sb-featstyle')).toBe('flat');
			expect(await shownValue('settings.sb-preset')).toBe('custom');
		});
	});
	it('[SET-D02] Density: ArrowDown picks Compact, live on the open statblock', async () => {
		await pick('Settings/statblock.md', [STAT_PAGE], 'settings.sb-density', 'sbDensity', 'comfortable', 'compact', 'ArrowDown', statAttr('data-dse-density', 'compact'));
	});
	it('[SET-D03] Feature columns: ArrowDown picks Side-by-side, live on the open statblock', async () => {
		await pick('Settings/statblock.md', [STAT_PAGE], 'settings.sb-columns', 'sbColumns', 'single', 'wide', 'ArrowDown', statAttr('data-dse-sb-columns', 'wide'));
	});
	it('[SET-D04] Secondary stats: ArrowDown picks Grid (centered), live on the open statblock', async () => {
		await pick('Settings/statblock.md', [STAT_PAGE], 'settings.sb-stats', 'sbStats', 'grid', 'gridc', 'ArrowDown', statAttr('data-dse-sb-stats', 'gridc'));
	});
	it('[SET-D05] Characteristics (Advanced): ArrowUp picks One line (the default is the last option), live on the open statblock', async () => {
		await pick('Settings/statblock.md', [STAT_PAGE, STAT_ADV], 'settings.sb-char-line', 'sbCharLine', 'two', 'one', 'ArrowUp', statAttr('data-dse-sb-charline', 'one'));
	});
	it('[SET-D06] Boxed first letter (Advanced): ArrowDown picks Letter only, live on the open statblock', async () => {
		await pick('Settings/statblock.md', [STAT_PAGE, STAT_ADV], 'settings.sb-char-box', 'sbCharBox', 'off', 'on', 'ArrowDown', statAttr('data-dse-sb-charbox', 'on'));
	});
	it('[SET-D07] Villain actions (Advanced): ArrowUp picks Inline (the default is the last option), live on the open statblock', async () => {
		await pick('Settings/statblock.md', [STAT_PAGE, STAT_ADV], 'settings.sb-villain', 'sbVillain', 'banded', 'inline', 'ArrowUp', statAttr('data-dse-sb-villain', 'inline'));
	});
	it('[SET-D08] Feature style (Featureblock display): ArrowDown picks Flat list, live on the open featureblock', async () => {
		await pick('Settings/featureblock.md', ['settings.page.featureblock-display'], 'settings.fb-feature-style', 'fbFeatureStyle', 'card', 'flat', 'ArrowDown', async () =>
			expect(await mainAttr('[data-dse-element="featureblock"]', 'data-dse-fb-featstyle')).toBe('flat'));
	});
	it('[SET-D09] Stat line (Featureblock display): ArrowDown picks Ledger, live on the open featureblock', async () => {
		await pick('Settings/featureblock.md', ['settings.page.featureblock-display'], 'settings.fb-stats', 'fbStats', 'grid', 'ledger', 'ArrowDown', async () =>
			expect(await mainAttr('[data-dse-element="featureblock"]', 'data-dse-fb-stats')).toBe('ledger'));
	});
	it('[SET-D10] Keyword display (Feature display): ArrowDown picks Inline text, live on the open ability card', async () => {
		await pick('Feature/feature.md', ['settings.page.feature-display'], 'settings.kw-usage', 'kwUsage', 'crest', 'text', 'ArrowDown', async () =>
			expect(await mainAttr('[data-dse-element="feature"]', 'data-dse-kwusage')).toBe('text'));
	});
	it('[SET-D11] Distance + target (Feature display): ArrowDown picks Inline text, live on the open ability card', async () => {
		await pick('Feature/feature.md', ['settings.page.feature-display'], 'settings.dist-target', 'distTarget', 'grid', 'text', 'ArrowDown', async () =>
			expect(await mainAttr('[data-dse-element="feature"]', 'data-dse-disttarget')).toBe('text'));
	});
	it('[SET-D12] Roller (Rolling): ArrowDown picks the Dice Roller plugin and it is stored (it has no on-screen effect without that plugin, which falls back to the native roller)', async () => {
		await pick('Stamina/basic.md', ['settings.page.rolling'], 'settings.roller-engine', 'rollerEngine', 'native', 'dice-roller', 'ArrowDown');
	});
	it('[SET-D13] Locale (Compendium): English is the only option, so ArrowDown changes nothing and nothing is written', async () => {
		await dse.openNote('Stamina/basic.md');
		await openAt('settings.page.compendium');
		try {
			// Nothing may change in the plugin's settings nor in the file (the raw bytes, which exist before any write).
			const memory = JSON.stringify(await readSettings());
			const disk = await rawData();
			expect(await shownValue('settings.compendium.locale')).toBe('en');
			await pressOn('settings.compendium.locale', 'ArrowDown');
			expect(await shownValue('settings.compendium.locale')).toBe('en');
			expect(JSON.stringify(await readSettings())).toBe(memory);
			expect(await diskData()).toEqual(disk === null ? { prefs: {} } : { prefs: {}, ...JSON.parse(disk) });
			expect(await rawData()).toBe(disk);
		} finally {
			await closeSettings();
		}
	});

	it('[SET-D14] Preset: with the statblock and feature rows reset it reads Steel card; ArrowDown picks Sourcebook, which writes all nine members (two on the Feature display page) and the open statblock follows', async () => {
		// The Featureblock rows and Roller were changed by the scenarios above: seed them so this one runs alone.
		await dse.setPrefs({ fbFeatureStyle: 'flat', fbStats: 'ledger', rollerEngine: 'dice-roller', sbDensity: 'compact' });
		await dse.openNote('Settings/statblock.md');
		await openAt(STAT_PAGE);
		try {
			expect(await shownValue('settings.sb-preset')).toBe('custom');
			await dse.click(ctl('settings.reset.statblock-display')); // leaves the preset on Custom until the Feature display rows are reset too
			await back();
			await showPage('settings.page.feature-display');
			await dse.click(ctl('settings.reset.feature-display'));
			await back();
			await showPage(STAT_PAGE);
			expect(await shownValue('settings.sb-preset')).toBe('steel');
			await pressOn('settings.sb-preset', 'ArrowDown');
			expect(await shownValue('settings.sb-preset')).toBe('sourcebook');
			expect(await diskPrefs()).toEqual(FINAL);
			for (const [attr, value] of [
				['data-dse-sb-featstyle', 'flat'], ['data-dse-sb-stats', 'ledger'], ['data-dse-sb-charline', 'one'], ['data-dse-sb-charbox', 'on'],
				['data-dse-sb-villain', 'inline'], ['data-dse-kwusage', 'text'], ['data-dse-disttarget', 'text'], ['data-dse-density', 'comfortable'],
			]) expect({ attr, value: await mainAttr(STATBLOCK, attr) }).toEqual({ attr, value });
		} finally {
			await closeSettings();
		}
	});

	it('[SET-D15] after a plugin reload on the data.json the scenarios above wrote, every dropdown shows its value and data.json keeps it', async () => {
		await ensureState({ prefs: FINAL }); // reloads on the file the scenarios above wrote (seeded only when this one runs alone)
		expect(await diskPrefs()).toEqual(FINAL);
		const shown: Array<[string[], Record<string, string>]> = [
			[[STAT_PAGE], { 'settings.sb-preset': 'sourcebook', 'settings.sb-feature-style': 'flat', 'settings.sb-density': 'comfortable', 'settings.sb-columns': 'single', 'settings.sb-stats': 'ledger' }],
			[[STAT_PAGE, STAT_ADV], { 'settings.sb-char-line': 'one', 'settings.sb-char-box': 'on', 'settings.sb-villain': 'inline' }],
			[['settings.page.featureblock-display'], { 'settings.fb-feature-style': 'flat', 'settings.fb-stats': 'ledger' }],
			[['settings.page.feature-display'], { 'settings.kw-usage': 'text', 'settings.dist-target': 'text' }],
			[['settings.page.rolling'], { 'settings.roller-engine': 'dice-roller' }],
		];
		for (const [links, values] of shown) {
			await openAt(...links);
			try {
				for (const [id, value] of Object.entries(values)) expect({ id, value: await shownValue(id) }).toEqual({ id, value });
			} finally {
				await closeSettings();
			}
		}
		await dse.openNote('Settings/statblock.md');
		expect(await mainAttr(STATBLOCK, 'data-dse-sb-villain')).toBe('inline');
	});

	// The Preset's "Custom" entry is a label the user cannot select into: picking it writes nothing, so the dropdown must not stay on it.
	knownBug('SC-651', '[SET-D16] picking Custom in the Preset: the dropdown shows the same value it shows when the page is reopened', async () => {
		await dse.setPrefs({});
		await dse.openNote('Settings/statblock.md');
		await openAt(STAT_PAGE);
		try {
			expect(await shownValue('settings.sb-preset')).toBe('steel'); // setup check: the shipped state is the Steel card preset
			await dse.focusByScript(ctl('settings.sb-preset'));
			await browser.keys('End'); // the Custom entry (a raw key: this scenario drives no manifest pair)
			const afterPick = await shownValue('settings.sb-preset');
			await back();
			await showPage(STAT_PAGE);
			const afterReopen = await shownValue('settings.sb-preset');
			expect({ afterPick }).toEqual({ afterPick: afterReopen });
		} finally {
			await closeSettings();
		}
	}, { failsWith: /afterPick/ });
});
