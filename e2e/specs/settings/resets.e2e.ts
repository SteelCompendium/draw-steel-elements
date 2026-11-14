// SC-440: the reset rows. Every scenario starts from a seeded data.json with EVERY (ungated) preference off its default, clicks one reset row with a
// real click, and asserts data.json ON DISK (the section's keys gone, every other section's kept) and the effect on the open note. Reset all
// clears the lot. (The Authoring page's reset is a gate-on scenario: gate-on.e2e.ts.)
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { closeSettings, ctl, mainAttr, mainCount, mainVar, openAt, openSettings, waitDiskPrefs } from '../../driver/settingsDrive';

const NON_DEFAULT: Record<string, unknown> = {
	reduceMotion: true, portraits: 'off',
	fontTitle: 'Georgia', fontBody: 'Georgia', fontControls: 'Georgia', fontCardBody: 'Georgia', fontLabel: 'Georgia', fontMono: 'Fira Code',
	textScale: 1.2, cardScale: 0.9, smallTextScale: 1.1, largeTextScale: 1.1, controlTextScale: 1.1,
	sbFeatureStyle: 'flat', sbDensity: 'compact', sbColumns: 'wide', sbStats: 'ledger', sbCharLine: 'one', sbCharBox: 'on', sbVillain: 'inline',
	sbSticky: 'off', sbStickyMeta: 'off',
	fbFeatureStyle: 'flat', fbStats: 'ledger', kwUsage: 'text', distTarget: 'text',
	collapsibleDefault: false, collapseDefault: true, staminaRecoveryPopover: true,
	rollingEnabled: true, rollerEngine: 'dice-roller', rollClickToRoll: false,
};
const SECTION: Record<string, string[]> = {
	appearance: ['reduceMotion', 'portraits'],
	typography: ['fontTitle', 'fontBody', 'fontControls', 'fontCardBody', 'fontLabel', 'fontMono', 'textScale', 'cardScale', 'smallTextScale', 'largeTextScale', 'controlTextScale'],
	'statblock-display': ['sbFeatureStyle', 'sbDensity', 'sbColumns', 'sbStats', 'sbCharLine', 'sbCharBox', 'sbVillain', 'sbSticky', 'sbStickyMeta'],
	'featureblock-display': ['fbFeatureStyle', 'fbStats'],
	'feature-display': ['kwUsage', 'distTarget'],
	'element-defaults': ['collapsibleDefault', 'collapseDefault', 'staminaRecoveryPopover'],
	rolling: ['rollingEnabled', 'rollerEngine', 'rollClickToRoll'],
};
const without = (keys: string[]): Record<string, unknown> => Object.fromEntries(Object.entries(NON_DEFAULT).filter(([k]) => !keys.includes(k)));

/** Seed, open `note`, open the section page, click its reset row and check data.json: the section is gone, the rest is kept. */
async function reset(section: string, note: string, effect: (phase: 'before' | 'after') => Promise<void>): Promise<void> {
	await dse.setPrefs(NON_DEFAULT);
	await dse.openNote(note);
	await effect('before');
	await openAt(`settings.page.${section}`);
	try {
		await dse.click(ctl(`settings.reset.${section}`));
		expect(await waitDiskPrefs(without(SECTION[section]))).toEqual(without(SECTION[section]));
		await effect('after');
	} finally {
		await closeSettings();
	}
}

describe('settings tab: reset rows', () => {
	it('[SET-R01] Reset appearance: Reduce motion and Initiative portraits go back to default, the open stamina bar follows, every other section is kept', async () => {
		await reset('appearance', 'Stamina/basic.md', async (p) => expect(await mainAttr('[data-dse-element="stamina-bar"]', 'data-dse-reduce-motion')).toBe(p === 'before' ? 'true' : 'false'));
	});
	it('[SET-R02] Reset typography: all six fonts (the Advanced three included) and all five sliders go back, the open bar loses its custom properties', async () => {
		await reset('typography', 'Stamina/basic.md', async (p) => {
			expect(await mainVar('[data-dse-element="stamina-bar"]', '--dse-font-title')).toEqual(p === 'before' ? expect.stringContaining('Georgia') : '');
			expect(await mainVar('[data-dse-element="stamina-bar"]', '--dse-text-scale')).toBe(p === 'before' ? '1.2' : '');
		});
	});
	it('[SET-R03] Reset statblock display: the nine statblock rows and the sticky pair go back, the open statblock follows', async () => {
		await reset('statblock-display', 'Settings/statblock.md', async (p) => {
			expect(await mainAttr('[data-dse-element="statblock"]', 'data-dse-density')).toBe(p === 'before' ? 'compact' : 'comfortable');
			expect(await mainAttr('[data-dse-element="statblock"]', 'data-dse-sb-sticky')).toBe(p === 'before' ? 'off' : 'on');
		});
	});
	it('[SET-R04] Reset featureblock display: both rows go back, the open featureblock follows', async () => {
		await reset('featureblock-display', 'Settings/featureblock.md', async (p) =>
			expect(await mainAttr('[data-dse-element="featureblock"]', 'data-dse-fb-featstyle')).toBe(p === 'before' ? 'flat' : 'card'));
	});
	it('[SET-R05] Reset feature display: Keyword display and Distance + target go back, the open ability card follows', async () => {
		await reset('feature-display', 'Feature/feature.md', async (p) =>
			expect(await mainAttr('[data-dse-element="feature"]', 'data-dse-kwusage')).toBe(p === 'before' ? 'text' : 'crest'));
	});
	it('[SET-R06] Reset element defaults: the three defaults go back (Edit Recoveries with a popover, on the Advanced page, included)', async () => {
		await reset('element-defaults', 'Stamina/basic.md', async () => undefined);
	});
	it('[SET-R07] Reset rolling: Enable rolling, Roller and Click ability to roll go back, the open card loses its roll controls', async () => {
		await reset('rolling', 'Feature/feature.md', async (p) => expect(await mainCount('[data-dse-control="roll.launch"]')).toBe(p === 'before' ? 1 : 0));
	});
	it('[SET-R08] Reset all preferences (the index row): every preference goes back and data.json\'s sparse slice is empty; the Compendium, Links and Initiative fields are not preferences and stay', async () => {
		await dse.setPrefs(NON_DEFAULT);
		await dse.openNote('Stamina/basic.md');
		await openSettings();
		try {
			await dse.click(ctl('settings.reset-all'));
			expect(await waitDiskPrefs({})).toEqual({});
			expect(await mainAttr('[data-dse-element="stamina-bar"]', 'data-dse-reduce-motion')).toBe('false');
		} finally {
			await closeSettings();
		}
	});
});
