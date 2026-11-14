// SC-440: the settings tab's navigation: the index's page rows and each page's nested Advanced row, driven with real clicks. Each page
// shows its own controls; Obsidian's back button returns. (Obsidian opens the settings window as a popout: see driver/settings.ts.)
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { back, closeSettings, ctl, idsOnPage, openSettings, pageSettled } from '../../driver/settingsDrive';

const PAGES: Array<{ link: string; title: string; shows: string }> = [
	{ link: 'settings.page.appearance', title: 'Appearance', shows: 'settings.reduce-motion' },
	{ link: 'settings.page.typography', title: 'Typography', shows: 'settings.font-title' },
	{ link: 'settings.page.statblock-display', title: 'Statblock display', shows: 'settings.sb-preset' },
	{ link: 'settings.page.featureblock-display', title: 'Featureblock display', shows: 'settings.fb-stats' },
	{ link: 'settings.page.feature-display', title: 'Feature display', shows: 'settings.kw-usage' },
	{ link: 'settings.page.element-defaults', title: 'Element defaults', shows: 'settings.collapse-default' },
	{ link: 'settings.page.rolling', title: 'Rolling', shows: 'settings.roller-engine' },
	{ link: 'settings.page.compendium', title: 'Compendium', shows: 'settings.compendium.sync' },
	{ link: 'settings.page.links', title: 'Links', shows: 'settings.links.scc-web-fallback' },
	{ link: 'settings.page.initiative-tracker', title: 'Initiative tracker', shows: 'settings.initiative.default-image' },
];
const ADVANCED: Array<{ page: string; link: string; shows: string }> = [
	{ page: 'settings.page.typography', link: 'settings.advanced.typography', shows: 'settings.font-mono' },
	{ page: 'settings.page.statblock-display', link: 'settings.advanced.statblock-display', shows: 'settings.sb-villain' },
	{ page: 'settings.page.element-defaults', link: 'settings.advanced.element-defaults', shows: 'settings.stamina-recovery-popover' },
];
const title = (): Promise<string> => dse.page<string>(`document.querySelector('.setting-page-title')?.textContent ?? 'index'`);

describe('settings tab: navigation', () => {
	it('[SET-N01] every section row on the index opens its own page (the shipped tab has ten, no Authoring), and Back returns to the index', async () => {
		await dse.openNote('Stamina/basic.md');
		await openSettings();
		try {
			const index = await idsOnPage();
			expect(index.filter((id) => id.startsWith('settings.page.'))).toEqual(PAGES.map((p) => p.link));
			for (const page of PAGES) {
				await dse.click(ctl(page.link));
				await dse.waitFor(`document.querySelector('.setting-page-title')?.textContent === ${JSON.stringify(page.title)}`, `the ${page.title} page`);
				await pageSettled();
				expect(await idsOnPage()).toContain(page.shows);
				await back();
				expect(await title()).toBe('index');
			}
		} finally {
			await closeSettings();
		}
	});

	it('[SET-N02] Typography, Statblock display and Element defaults each have an Advanced row that opens the secondary settings one level down; Back climbs one level at a time', async () => {
		await dse.openNote('Stamina/basic.md');
		await openSettings();
		try {
			for (const adv of ADVANCED) {
				await dse.click(ctl(adv.page));
				await dse.waitFor(`!!document.querySelector('[data-dse-control="${adv.link}"]')`, 'the Advanced row');
				await pageSettled();
				const primary = await idsOnPage();
				expect(primary).not.toContain(adv.shows); // the secondary setting is NOT on the primary page
				await dse.click(ctl(adv.link));
				await dse.waitFor(`document.querySelector('.setting-page-title')?.textContent === 'Advanced'`, 'the Advanced page');
				await pageSettled();
				expect(await idsOnPage()).toContain(adv.shows);
				await back();
				expect(await idsOnPage()).toContain(adv.link);
				await back();
				expect(await title()).toBe('index');
			}
		} finally {
			await closeSettings();
		}
	});
});
