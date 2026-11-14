// SC-440: the Compendium page's Sync and Check for updates buttons. The release lookup is STUBBED page-side (driver/settingsDrive.ts
// `releaseStub`: the sync service's request function answers with a promise the test settles), so nothing reaches the network and a click can
// be held in flight to look at the busy state: both buttons disabled, the one running swaps its label. No scenario clicks anything that would
// move files: Sync with the default (absent) folder opens no window; the windows a sync can open are SC-441's.
import { browser, expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { eventsSince } from '../../driver/recorders';
import { state } from '../../driver/state';
import { allowPageErrors, closeSettings, compendiumButtons, ctl, noticesHere, onMain, openAt, pressOn, readSettings, releaseStub, reloadPlugin, shownValue } from '../../driver/settingsDrive';

const COMPENDIUM = 'settings.page.compendium';
const SYNC = 'settings.compendium.sync';
const CHECK = 'settings.compendium.check';
const RELEASE = { tag_name: 'v9.9.9', assets: [{ name: 'md-dse-unified-en.zip', url: 'https://stub.invalid/x.zip' }] };
const TRASH_OFFER = `Array.from(document.querySelectorAll('.modal-container')).some((m) => /Move old compendium to trash/.test(m.textContent))`;
/** Close the "Existing compendium folder found" window if one is open, through its own X (never its trash button). */
const closeLegacyWindow = (): Promise<boolean> =>
	dse.page(`(() => { const m = Array.from(document.querySelectorAll('.modal-container')).find((c) => /Existing compendium folder found/.test(c.textContent)); if (!m) return false; m.querySelector('.modal-close-button, .modal-header-button')?.click(); return true; })()`);
const IDLE = { sync: ['Sync', false], check: ['Check for updates', false] };

/** Wait until the stub has been asked `n` times (the click got as far as the network). */
const asked = (n: number): Promise<true> => browser.waitUntil(async () => (await releaseStub.calls()).length >= n, { timeout: 8000, interval: 40, timeoutMsg: 'the release lookup was never asked' });
const waitIdle = (): Promise<void> => dse.waitFor(`!document.querySelector('[data-dse-control="${SYNC}"]').disabled`, 'the buttons to come back');

describe('settings tab: Sync and Check for updates', () => {
	it('[SET-C01] Check for updates: in flight both buttons are disabled and it reads "Checking…"; clicks on the disabled buttons start nothing; the answer is a Notice and the buttons return', async () => {
		await dse.openNote('Stamina/basic.md');
		await releaseStub.install();
		await openAt(COMPENDIUM);
		try {
			expect(await compendiumButtons()).toEqual(IDLE);
			await dse.click(ctl(CHECK));
			await dse.waitFor(`document.querySelector('[data-dse-control="${CHECK}"]').textContent === 'Checking…'`, 'the label to swap');
			expect(await compendiumButtons()).toEqual({ sync: ['Sync', true], check: ['Checking…', true] });
			await dse.click(ctl(SYNC)); // disabled: nothing happens
			await dse.click(ctl(CHECK));
			await asked(1);
			expect(await releaseStub.calls()).toEqual(['https://api.github.com/repos/SteelCompendium/data-unified/releases/latest']);
			await releaseStub.answer(200, RELEASE);
			await waitIdle();
			expect(await compendiumButtons()).toEqual(IDLE);
			expect(await noticesHere()).toContain('Update available: v9.9.9 (installed: none).');
			expect((await releaseStub.calls()).length).toBe(1); // the two disabled clicks asked for nothing
		} finally {
			await closeSettings();
		}
	});

	it('[SET-C02] Sync: in flight both buttons are disabled and it reads "Syncing…"; clicks on the disabled buttons start nothing (the lookup is left unanswered, then the plugin reloads)', async () => {
		await dse.openNote('Stamina/basic.md');
		await releaseStub.install();
		await openAt(COMPENDIUM);
		try {
			await dse.click(ctl(SYNC));
			await dse.waitFor(`document.querySelector('[data-dse-control="${SYNC}"]').textContent === 'Syncing…'`, 'the label to swap');
			expect(await compendiumButtons()).toEqual({ sync: ['Syncing…', true], check: ['Check for updates', true] });
			await asked(1);
			await dse.click(ctl(CHECK)); // disabled
			await dse.click(ctl(SYNC));
			expect((await releaseStub.calls()).length).toBe(1);
			expect(await compendiumButtons()).toEqual({ sync: ['Syncing…', true], check: ['Check for updates', true] });
		} finally {
			await closeSettings();
			await reloadPlugin(); // drops the pending lookup and the busy lock
		}
	});

	it('[SET-C05] Check for updates with the keyboard: Enter on the focused button starts a check (Checking…, both disabled) and the answer is a Notice', async () => {
		await dse.openNote('Stamina/basic.md');
		await releaseStub.install();
		await openAt(COMPENDIUM);
		try {
			await pressOn(CHECK, 'Enter');
			await dse.waitFor(`document.querySelector('[data-dse-control="${CHECK}"]').textContent === 'Checking…'`, 'the label to swap');
			expect(await compendiumButtons()).toEqual({ sync: ['Sync', true], check: ['Checking…', true] });
			await asked(1);
			await releaseStub.answer(200, RELEASE);
			await waitIdle();
			expect(await compendiumButtons()).toEqual(IDLE);
			expect(await noticesHere()).toContain('Update available: v9.9.9 (installed: none).');
		} finally {
			await closeSettings();
		}
	});

	it('[SET-C06] Sync with the keyboard: Enter on the focused button starts a sync (Syncing…, both disabled); the lookup is left unanswered, then the plugin reloads', async () => {
		await dse.openNote('Stamina/basic.md');
		await releaseStub.install();
		await openAt(COMPENDIUM);
		try {
			await pressOn(SYNC, 'Enter');
			await dse.waitFor(`document.querySelector('[data-dse-control="${SYNC}"]').textContent === 'Syncing…'`, 'the label to swap');
			expect(await compendiumButtons()).toEqual({ sync: ['Syncing…', true], check: ['Check for updates', true] });
			await asked(1);
		} finally {
			await closeSettings();
			await reloadPlugin();
		}
	});

	// Nothing here ever clicks a trash button (SC-643, fixed): a window that did open is closed through its own X.
	it('[SET-C03] Destination folder emptied: Sync falls back to the default folder (the release lookup runs) and never opens a window offering to move the vault root to the trash', async () => {
		await dse.openNote('Stamina/basic.md');
		await releaseStub.install();
		await openAt(COMPENDIUM);
		try {
			await dse.type(ctl('settings.compendium.destination'), 'x', { replace: true });
			await browser.keys(['Control', 'a']);
			await browser.keys('Backspace');
			expect(await shownValue('settings.compendium.destination')).toBe('');
			expect((await readSettings()).compendiumDestinationDirectory).toBe(''); // the setting is not rewritten
			await dse.click(ctl(SYNC));
			await asked(1); // the blank resolved to the default folder, so the sync went ahead
			expect(await dse.page<boolean>(TRASH_OFFER)).toBe(false);
			await dse.waitFor(`document.querySelector('[data-dse-control="${SYNC}"]').textContent === 'Syncing…'`, 'the sync to be in flight');
			await closeLegacyWindow();
		} finally {
			await closeSettings();
			await dse.setPrefs({}); // data.json back to the shipped state (the destination folder included)
		}
	});

	it('[SET-C07] Destination folder set to the vault root ("/"): Sync is refused with a Notice naming the setting, no lookup is made, no window opens', async () => {
		await dse.openNote('Stamina/basic.md');
		await releaseStub.install();
		await openAt(COMPENDIUM);
		try {
			await dse.type(ctl('settings.compendium.destination'), '/', { replace: true });
			await dse.click(ctl(SYNC));
			await dse.waitFor(`Array.from(document.querySelectorAll('.notice')).some((n) => /Destination folder can't be the vault root/.test(n.textContent))`, 'the refusal Notice');
			expect(await releaseStub.calls()).toEqual([]); // nothing was looked up
			expect(await dse.page<boolean>(TRASH_OFFER)).toBe(false);
			expect(await dse.page<boolean>(`Array.from(document.querySelectorAll('.modal-container')).some((m) => /Existing compendium folder found/.test(m.textContent))`)).toBe(false);
			expect(await compendiumButtons()).toEqual(IDLE); // and the busy lock was released
		} finally {
			await closeSettings();
			await dse.setPrefs({});
		}
	});

	knownBug('SC-646', '[SET-C04] a failed Sync (the release lookup answers 404) leaves no unhandled promise rejection behind', async () => {
		// Only the stubbed 404's own errors: the designed console.error and the bug itself (any other failure inside Sync still fails this test).
		allowPageErrors(/compendium sync failed: Error: GitHub release lookup failed \(HTTP 404\)|rejection: Error: GitHub release lookup failed \(HTTP 404\)/);
		await dse.openNote('Stamina/basic.md');
		await releaseStub.install();
		await openAt(COMPENDIUM);
		try {
			await dse.click(ctl(SYNC));
			await asked(1);
			await releaseStub.answer(404);
			await waitIdle();
			expect(await compendiumButtons()).toEqual(IDLE);
			// one frame, so a rejection nobody handled has been reported
			await onMain(() => dse.page(`new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)))`));
			const events = await onMain(() => eventsSince(state.mark));
			expect(events.errs.filter((e) => e.text.startsWith('rejection:')).map((e) => e.text.slice(0, 80))).toEqual([]);
		} finally {
			await closeSettings();
		}
	}, { failsWith: /rejection: Error: GitHub release lookup failed/ });
});
