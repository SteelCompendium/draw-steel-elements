// SC-440: the reset rows. Every scenario starts from a seeded data.json with EVERY (ungated) preference off its default, resets one section with a
// real click (R01-R08) or with Enter on the focused row (R09-R16), and asserts data.json ON DISK (the section's keys gone, every other section's
// kept), the CONTROLS ON SCREEN (the page redraws: each shows its default, not the value the user had set) and the effect on the open note.
// (The Authoring page's reset is a gate-on scenario: gate-on.e2e.ts.)
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { closeSettings, ctl, diskData, mainAttr, mainCount, mainVar, openAt, openSettings, pressOn, seedData, shownValue, toggleIsOn, waitDiskPrefs } from '../../driver/settingsDrive';

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

type OnScreen = Record<string, boolean | string>;
interface Section {
	note: string;
	/** The controls on the section's page, with the value each must show after the reset (a toggle: on/off, others: the shown value). */
	onScreen: OnScreen;
	effect: (phase: 'before' | 'after') => Promise<void>;
}
const STAMINA = '[data-dse-element="stamina-bar"]';
const SECTIONS: Record<string, Section> = {
	appearance: {
		note: 'Stamina/basic.md',
		onScreen: { 'settings.reduce-motion': false, 'settings.portraits': true },
		effect: async (p) => expect(await mainAttr(STAMINA, 'data-dse-reduce-motion')).toBe(p === 'before' ? 'true' : 'false'),
	},
	typography: {
		note: 'Stamina/basic.md',
		onScreen: { 'settings.font-title': '', 'settings.text-scale': '1', 'settings.card-scale': '1', 'settings.control-text-scale': '1' },
		effect: async (p) => {
			expect(await mainVar(STAMINA, '--dse-font-title')).toEqual(p === 'before' ? expect.stringContaining('Georgia') : '');
			expect(await mainVar(STAMINA, '--dse-text-scale')).toBe(p === 'before' ? '1.2' : '');
		},
	},
	'statblock-display': {
		note: 'Settings/statblock.md',
		// The Preset reads Custom: the two Feature display members (another page) are still off their defaults, so it is not Steel card yet.
		onScreen: { 'settings.sb-preset': 'custom', 'settings.sb-density': 'comfortable', 'settings.sb-feature-style': 'card', 'settings.sb-sticky': true, 'settings.sb-sticky-meta': true },
		effect: async (p) => {
			expect(await mainAttr('[data-dse-element="statblock"]', 'data-dse-density')).toBe(p === 'before' ? 'compact' : 'comfortable');
			expect(await mainAttr('[data-dse-element="statblock"]', 'data-dse-sb-sticky')).toBe(p === 'before' ? 'off' : 'on');
		},
	},
	'featureblock-display': {
		note: 'Settings/featureblock.md',
		onScreen: { 'settings.fb-feature-style': 'card', 'settings.fb-stats': 'grid' },
		effect: async (p) => expect(await mainAttr('[data-dse-element="featureblock"]', 'data-dse-fb-featstyle')).toBe(p === 'before' ? 'flat' : 'card'),
	},
	'feature-display': {
		note: 'Feature/feature.md',
		onScreen: { 'settings.kw-usage': 'crest', 'settings.dist-target': 'grid' },
		effect: async (p) => expect(await mainAttr('[data-dse-element="feature"]', 'data-dse-kwusage')).toBe(p === 'before' ? 'text' : 'crest'),
	},
	'element-defaults': {
		note: 'Stamina/basic.md',
		onScreen: { 'settings.collapsible-default': true, 'settings.collapse-default': false },
		// Collapsible by default / Start collapsed are read when a block is drawn: after the reset a newly opened bar has its Collapse button and is not collapsed.
		effect: async (p) => {
			if (p === 'before') return;
			await dse.openNote('Stamina/basic.md');
			expect(await mainCount('[data-dse-control="chrome.collapse"]')).toBe(1);
			expect(await mainAttr(STAMINA, 'data-dse-collapsed')).toBeNull();
		},
	},
	rolling: {
		note: 'Feature/feature.md',
		onScreen: { 'settings.rolling-enabled': false, 'settings.roller-engine': 'native', 'settings.roll-click-to-roll': true },
		effect: async (p) => expect(await mainCount('[data-dse-control="roll.launch"]')).toBe(p === 'before' ? 1 : 0),
	},
};

/** The controls drawn on the page on screen show `expected`. */
async function expectOnScreen(expected: OnScreen): Promise<void> {
	for (const [id, want] of Object.entries(expected)) {
		const shown = typeof want === 'boolean' ? await toggleIsOn(id) : await shownValue(id);
		expect({ id, shown }).toEqual({ id, shown: want });
	}
}

/** Seed, open the section's note and page, reset it by `how`, then check data.json (the section is gone, the rest kept), the page's controls and the note. */
async function reset(section: string, how: 'click' | 'Enter'): Promise<void> {
	const { note, onScreen, effect } = SECTIONS[section];
	await dse.setPrefs(NON_DEFAULT);
	await dse.openNote(note);
	await effect('before');
	await openAt(`settings.page.${section}`);
	try {
		const id = `settings.reset.${section}`;
		if (how === 'click') await dse.click(ctl(id));
		else await pressOn(id, 'Enter');
		expect(await waitDiskPrefs(without(SECTION[section]))).toEqual(without(SECTION[section]));
		await expectOnScreen(onScreen); // the page was redrawn: its controls show the defaults, not what the user had set
		await effect('after');
	} finally {
		await closeSettings();
	}
}

/** Reset all preferences from the index with `how`; every preference is gone, the operational fields stay, and a page opened afterwards shows defaults. */
async function resetAll(how: 'click' | 'Enter'): Promise<void> {
	const operational = { compendiumReleaseTag: 'v4.20260716T000000', compendiumDestinationDirectory: 'Rules', sccWebFallback: false };
	await seedData({ settingsVersion: 3, prefs: NON_DEFAULT, ...operational });
	await dse.openNote('Stamina/basic.md');
	await openSettings();
	try {
		if (how === 'click') await dse.click(ctl('settings.reset-all'));
		else await pressOn('settings.reset-all', 'Enter');
		expect(await waitDiskPrefs({})).toEqual({});
		expect(await mainAttr(STAMINA, 'data-dse-reduce-motion')).toBe('false');
		// The Compendium, Links and Initiative fields are not preferences: Reset all leaves them as they were.
		expect(await diskData()).toMatchObject(operational);
	} finally {
		await closeSettings();
	}
	await openAt('settings.page.appearance');
	try {
		await expectOnScreen({ 'settings.reduce-motion': false, 'settings.portraits': true });
	} finally {
		await closeSettings();
	}
}

describe('settings tab: reset rows', () => {
	it('[SET-R01] Reset appearance: Reduce motion and Initiative portraits go back to default (on the page too), the open stamina bar follows, every other section is kept', async () => {
		await reset('appearance', 'click');
	});
	it('[SET-R02] Reset typography: all six fonts (the Advanced three included) and all five sliders go back, on the page too; the open bar loses its custom properties', async () => {
		await reset('typography', 'click');
	});
	it('[SET-R03] Reset statblock display: the statblock rows and the sticky pair go back, the Preset reads Custom while the Feature display members are still off, the open statblock follows', async () => {
		await reset('statblock-display', 'click');
	});
	it('[SET-R04] Reset featureblock display: both rows go back, on the page too; the open featureblock follows', async () => {
		await reset('featureblock-display', 'click');
	});
	it('[SET-R05] Reset feature display: Keyword display and Distance + target go back, on the page too; the open ability card follows', async () => {
		await reset('feature-display', 'click');
	});
	it('[SET-R06] Reset element defaults: the three defaults go back (Edit Recoveries with a popover, on the Advanced page, included) and a bar opened afterwards has its Collapse button and starts expanded', async () => {
		await reset('element-defaults', 'click');
	});
	it('[SET-R07] Reset rolling: Enable rolling, Roller and Click ability to roll go back, on the page too; the open card loses its roll controls', async () => {
		await reset('rolling', 'click');
	});
	it('[SET-R08] Reset all preferences (the index row): every preference goes back, a page opened afterwards shows the defaults, and the Compendium, Links and Initiative fields stay as they were', async () => {
		await resetAll('click');
	});

	it('[SET-R09] Reset appearance with the keyboard: Enter on the focused row resets the section (on the page and on the open bar)', async () => {
		await reset('appearance', 'Enter');
	});
	it('[SET-R10] Reset typography with the keyboard: Enter on the focused row resets the six fonts and five sliders', async () => {
		await reset('typography', 'Enter');
	});
	it('[SET-R11] Reset statblock display with the keyboard: Enter on the focused row resets the section', async () => {
		await reset('statblock-display', 'Enter');
	});
	it('[SET-R12] Reset featureblock display with the keyboard: Enter on the focused row resets both rows', async () => {
		await reset('featureblock-display', 'Enter');
	});
	it('[SET-R13] Reset feature display with the keyboard: Enter on the focused row resets both rows', async () => {
		await reset('feature-display', 'Enter');
	});
	it('[SET-R14] Reset element defaults with the keyboard: Enter on the focused row resets the three defaults', async () => {
		await reset('element-defaults', 'Enter');
	});
	it('[SET-R15] Reset rolling with the keyboard: Enter on the focused row resets the three rows', async () => {
		await reset('rolling', 'Enter');
	});
	it('[SET-R16] Reset all preferences with the keyboard: Enter on the focused index row resets every preference and keeps the operational fields', async () => {
		await resetAll('Enter');
	});
});
