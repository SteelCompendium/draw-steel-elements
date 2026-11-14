// SC-440: the settings tab's toggles. Each is driven by a real click and by Space on the focused checkbox label; each change is asserted
// three ways: the stored value in data.json ON DISK, the shown state of the control, and the effect on the OPEN note in the main window
// (an attribute of the element's root, or a control that appears) with no reload and no re-open. A file-final reload checks that
// every toggle that was left changed shows the same value and keeps it in data.json.
// Representative elements: Stamina/basic.md (Reduce motion), Initiative/tracker.md (Initiative portraits), Settings/statblock.md (the sticky
// pair), Feature/feature.md (the roll controls). The Element defaults toggles read at build time: see live-behavioural.e2e.ts for the live case.
import { $, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import {
	closeSettings, ctl, diskData, diskPrefs, mainAttr, mainCount, onMain, openAt, pressOn, prefValue, ensureState, toggleIsDisabled, toggleIsOn, withPrefs,
} from '../../driver/settingsDrive';

const STAMINA = '[data-dse-element="stamina-bar"]';

/**
 * click (to the non-default), Space (back to the default), click (left non-default for the file-final reload check). After each step the stored
 * value, the shown state and `effect` are checked.
 */
async function cycle(
	id: string,
	read: () => Promise<unknown>,
	def: unknown,
	alt: unknown,
	effect: (state: 'def' | 'alt') => Promise<void>,
): Promise<void> {
	const shown = (state: 'def' | 'alt'): boolean => (state === 'alt') !== (def === true || def === 'on');
	await dse.click(ctl(id));
	expect(await read()).toBe(alt);
	expect(await toggleIsOn(id)).toBe(shown('alt'));
	await effect('alt');
	await pressOn(id, 'Space');
	expect(await read()).toBe(def);
	expect(await toggleIsOn(id)).toBe(shown('def'));
	await effect('def');
	await dse.click(ctl(id));
	expect(await read()).toBe(alt);
	await effect('alt');
}
const pref = (key: string, def: unknown) => () => prefValue(key, def);

describe('settings tab: toggles', () => {
	it('[SET-T01] Reduce motion: click and Space flip it, the open stamina bar\'s data-dse-reduce-motion follows live', async () => {
		await dse.openNote('Stamina/basic.md');
		await openAt('settings.page.appearance');
		try {
			await cycle('settings.reduce-motion', pref('reduceMotion', false), false, true, async (s) =>
				expect(await mainAttr(STAMINA, 'data-dse-reduce-motion')).toBe(s === 'alt' ? 'true' : 'false'));
		} finally {
			await closeSettings();
		}
	});

	it('[SET-T02] Initiative portraits: click and Space flip it, the open tracker\'s data-dse-portraits follows live', async () => {
		await dse.openNote('Initiative/tracker.md');
		await openAt('settings.page.appearance');
		try {
			await cycle('settings.portraits', pref('portraits', 'on'), 'on', 'off', async (s) =>
				expect(await mainAttr('[data-dse-element="initiative"]', 'data-dse-portraits')).toBe(s === 'alt' ? 'off' : 'on'));
		} finally {
			await closeSettings();
		}
	});

	it('[SET-T03] Sticky mini-header: click and Space flip it, the open statblock\'s data-dse-sb-sticky follows live', async () => {
		await dse.openNote('Settings/statblock.md');
		await openAt('settings.page.statblock-display');
		try {
			await cycle('settings.sb-sticky', pref('sbSticky', 'on'), 'on', 'off', async (s) =>
				expect(await mainAttr('[data-dse-element="statblock"]', 'data-dse-sb-sticky')).toBe(s === 'alt' ? 'off' : 'on'));
		} finally {
			await closeSettings();
		}
	});

	it('[SET-T04] Sticky mini-header: include secondary stats: flips with its parent on; with the parent off it is greyed out and a click does nothing, but its value is kept', async () => {
		await withPrefs({ sbSticky: undefined }); // the parent is on (the other settings the scenarios above left stay)
		await dse.openNote('Settings/statblock.md');
		await openAt('settings.page.statblock-display');
		try {
			const meta = 'settings.sb-sticky-meta';
			expect(await toggleIsDisabled(meta)).toBe(false); // the parent is on
			await cycle(meta, pref('sbStickyMeta', 'on'), 'on', 'off', async (s) =>
				expect(await mainAttr('[data-dse-element="statblock"]', 'data-dse-sb-stickymeta')).toBe(s === 'alt' ? 'off' : 'on'));
			// Parent off again: the child is disabled, a click on it is a disabled click and changes nothing.
			await dse.click(ctl('settings.sb-sticky'));
			await dse.waitFor(`document.querySelector('[data-dse-control="${meta}"]').classList.contains('is-disabled')`, 'the child to grey out');
			await dse.click(ctl(meta));
			expect(await prefValue('sbStickyMeta', 'on')).toBe('off');
			expect(await toggleIsOn(meta)).toBe(false);
			expect(await mainAttr('[data-dse-element="statblock"]', 'data-dse-sb-stickymeta')).toBe('off');
		} finally {
			await closeSettings();
		}
	});

	it('[SET-T05] Start collapsed: click and Space flip it and it is stored; a block opened afterwards (Collapsible by default still on) starts collapsed (data-dse-collapsed="on")', async () => {
		await dse.openNote('Stamina/basic.md');
		await openAt('settings.page.element-defaults');
		try {
			await cycle('settings.collapse-default', pref('collapseDefault', false), false, true, async () => undefined);
		} finally {
			await closeSettings();
		}
		await dse.openNote('Stamina/basic.md');
		expect(await mainAttr(STAMINA, 'data-dse-collapsed')).toBe('on');
	});

	it('[SET-T06] Collapsible by default: click and Space flip it and it is stored; a block opened afterwards has no Collapse button', async () => {
		await dse.openNote('Stamina/basic.md');
		await openAt('settings.page.element-defaults');
		try {
			await cycle('settings.collapsible-default', pref('collapsibleDefault', true), true, false, async () => undefined);
		} finally {
			await closeSettings();
		}
		await dse.openNote('Stamina/basic.md'); // rendered AFTER the change
		expect(await mainCount('[data-dse-control="chrome.collapse"]')).toBe(0);
	});

	it('[SET-T07] Edit Recoveries with a popover (Advanced): click and Space flip it and it is stored; on a bar opened afterwards a marker click opens the popover', async () => {
		await dse.openNote('Stamina/recoveries.md');
		await openAt('settings.page.element-defaults', 'settings.advanced.element-defaults');
		try {
			await cycle('settings.stamina-recovery-popover', pref('staminaRecoveryPopover', false), false, true, async () => undefined);
		} finally {
			await closeSettings();
		}
		await dse.openNote('Stamina/recoveries.md');
		await dse.click(dse.block('ds-stamina-bar').control('recov.marker', { nth: 4 }));
		await dse.waitFor(`!!document.querySelector('.markdown-reading-view .dse-stamina-rec__pop')`, 'the recovery popover');
		await dse.settle();
	});

	it('[SET-T08] Enable rolling: click and Space flip it, the roll controls of the open ability card appear and disappear live', async () => {
		await dse.openNote('Feature/feature.md');
		await openAt('settings.page.rolling');
		try {
			await cycle('settings.rolling-enabled', pref('rollingEnabled', false), false, true, async (s) =>
				expect(await mainCount('[data-dse-control="roll.launch"]')).toBe(s === 'alt' ? 1 : 0));
		} finally {
			await closeSettings();
		}
	});

	it('[SET-T09] Click ability to roll: with rolling on, a click on a tier row of the open card rolls; switched off (click, Space) it does not, live', async () => {
		await withPrefs({ rollingEnabled: true });
		await dse.openNote('Feature/feature.md');
		await openAt('settings.page.rolling');
		try {
			// Rolling is seeded on. Click-to-roll starts on: a tier row click draws the roll area.
			expect(await prefValue('rollingEnabled', false)).toBe(true);
			const rolled = async (): Promise<boolean> => (await mainCount('.dse-roll-area *')) > 0;
			// A plain (uncredited) pointer click on the open card in the main window: the control under test is the setting.
			const clickTier = (): Promise<void> => onMain(async () => { await $('.markdown-reading-view .dse-pr__row').click(); });
			expect(await rolled()).toBe(false);
			await dse.click(ctl('settings.roll-click-to-roll')); // -> off
			expect(await prefValue('rollClickToRoll', true)).toBe(false);
			await clickTier();
			expect(await rolled()).toBe(false);
			await pressOn('settings.roll-click-to-roll', 'Space'); // -> on
			expect(await prefValue('rollClickToRoll', true)).toBe(true);
			await clickTier();
			expect(await rolled()).toBe(true);
			await dse.click(ctl('settings.roll-click-to-roll')); // left off for the reload check
			expect(await prefValue('rollClickToRoll', true)).toBe(false);
		} finally {
			await closeSettings();
		}
	});

	it('[SET-T10] Fall back to steelcompendium.io links: click and Space flip sccWebFallback in data.json (the on-screen effect is resolved when a link is clicked: see live-behavioural)', async () => {
		await dse.openNote('Stamina/basic.md');
		await openAt('settings.page.links');
		try {
			const id = 'settings.links.scc-web-fallback';
			const read = async (): Promise<unknown> => (await diskData()).sccWebFallback;
			await dse.click(ctl(id));
			expect(await read()).toBe(false);
			expect(await toggleIsOn(id)).toBe(false);
			await pressOn(id, 'Space');
			expect(await read()).toBe(true);
			await dse.click(ctl(id));
			expect(await read()).toBe(false); // left off for the reload check
		} finally {
			await closeSettings();
		}
	});

	it('[SET-T11] after a plugin reload on the data.json the toggle scenarios above wrote, each toggle shows its value and data.json keeps it', async () => {
		const expected = {
			reduceMotion: true, portraits: 'off', sbSticky: 'off', sbStickyMeta: 'off', collapsibleDefault: false, collapseDefault: true,
			staminaRecoveryPopover: true, rollingEnabled: true, rollClickToRoll: false,
		};
		// The plugin is reloaded on the data.json the scenarios above wrote (seeded with the same state only when this one runs alone).
		await ensureState({ sccWebFallback: false, prefs: expected });
		expect(await diskPrefs()).toEqual(expected);
		expect((await diskData()).sccWebFallback).toBe(false);
		const check = async (links: string[], ids: Record<string, boolean>): Promise<void> => {
			await openAt(...links);
			try {
				for (const [id, on] of Object.entries(ids)) expect({ id, on: await toggleIsOn(id) }).toEqual({ id, on });
			} finally {
				await closeSettings();
			}
		};
		await check(['settings.page.appearance'], { 'settings.reduce-motion': true, 'settings.portraits': false });
		await check(['settings.page.statblock-display'], { 'settings.sb-sticky': false, 'settings.sb-sticky-meta': false });
		await check(['settings.page.element-defaults'], { 'settings.collapsible-default': false, 'settings.collapse-default': true });
		await check(['settings.page.element-defaults', 'settings.advanced.element-defaults'], { 'settings.stamina-recovery-popover': true });
		await check(['settings.page.rolling'], { 'settings.rolling-enabled': true, 'settings.roll-click-to-roll': false });
		await check(['settings.page.links'], { 'settings.links.scc-web-fallback': false });
		// ...and the reloaded plugin draws an open note with them.
		await dse.openNote('Stamina/basic.md');
		expect(await mainAttr(STAMINA, 'data-dse-reduce-motion')).toBe('true');
	});
});
