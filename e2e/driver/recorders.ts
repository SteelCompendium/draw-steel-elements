// SC-408 e2e driver: page-side recorders, ported from visual-harness/obsidian-lifecycle.mjs
// (PAGE_HELPERS + AUTO_DISMISS_TRUST_DIALOG), plus CDP focus emulation (S2 section 4.7).
import { browser } from '@wdio/globals';
import { ev } from './page';

/**
 * Event log in the page: vault `modify` events, Notices, and every uncaught error /
 * unhandled rejection / console.error, each stamped with a monotonic counter `n`.
 * `mark()` returns the current counter; "since" queries filter on n > mark.
 */
export const PAGE_HELPERS = `(() => {
  if (window.__dse) return true;
  const lc = window.__dse = { mods: [], notices: [], errs: [], n: 0 };
  app.vault.on('modify', (f) => lc.mods.push({ n: ++lc.n, path: f.path }));
  const seenNotices = new WeakSet();
  // Known Obsidian HOST CHROME is excluded rather than allowlisting DSE's own prefix: a
  // prefix allowlist would also hide every other plugin-authored Notice.
  const hostChromeDenylist = [/^Update Available/];
  new MutationObserver((records) => {
    for (const r of records) for (const node of r.addedNodes) {
      if (node.nodeType !== 1) continue;
      const els = node.classList.contains('notice') ? [node] : Array.from(node.querySelectorAll('.notice'));
      for (const el of els) {
        if (seenNotices.has(el)) continue; // Obsidian can re-parent a notice element while stacking
        seenNotices.add(el);
        const text = el.textContent;
        if (!hostChromeDenylist.some((re) => re.test(text))) lc.notices.push({ n: ++lc.n, text });
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('error', (e) => lc.errs.push({ n: ++lc.n, text: String(e.message) }));
  window.addEventListener('unhandledrejection', (e) => lc.errs.push({ n: ++lc.n, text: 'rejection: ' + String(e.reason && (e.reason.stack || e.reason)) }));
  const origError = console.error.bind(console);
  console.error = (...a) => { lc.errs.push({ n: ++lc.n, text: 'console.error: ' + a.map((x) => (x && x.stack) || String(x)).join(' ') }); origError(...a); };
  return true;
})()`;

/**
 * Obsidian's "Do you trust the author of this vault?" dialog appears at essentially ANY
 * point across a run (lifecycle SC-340 Task 8 review I-1: dismissed at start-up, then open
 * again mid-keystroke inside a scenario). One event-driven MutationObserver installed once
 * for the whole session has no polling gap. Clicks the dialog's own header "X"
 * (`.mod-trust-folder .modal-header-button`), keyed on that class first, with a
 * /trust the author/i text fallback that never touches a container holding a DSE modal.
 */
export const AUTO_DISMISS_TRUST_DIALOG = `(() => {
  if (window.__dseTrustObserver) return true;
  const dismiss = (modal) => {
    const byClass = modal.querySelector('.mod-trust-folder .modal-header-button');
    if (byClass) { byClass.click(); return; }
    if (modal.querySelector('.dse-modal, .dse-condal-modal')) return;
    if (/trust the author/i.test(modal.textContent)) modal.querySelector('.modal-header-button')?.click();
  };
  window.__dseTrustObserver = new MutationObserver(() => {
    // Re-scan every batch: Obsidian inserts an EMPTY container first and fills it later.
    document.querySelectorAll('.modal-container').forEach(dismiss);
  });
  window.__dseTrustObserver.observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll('.modal-container').forEach(dismiss);
  return true;
})()`;

/** Install the recorders and the trust-dialog guard (idempotent), once the plugin is loaded. */
export async function installRecorders(): Promise<void> {
	await ev('(async () => { while (!(document.body && window.app && app.workspace && app.workspace.layoutReady)) await new Promise((r) => setTimeout(r, 25)); return true; })()');
	await ev(AUTO_DISMISS_TRUST_DIALOG);
	await ev(PAGE_HELPERS);
}

/**
 * Several Obsidian windows can share one X display and only one has OS focus; Chromium
 * suppresses focus/blur events in an unfocused page. That is precisely the class these tests
 * check (click-away commits, S1 B7), so every session emulates a focused page.
 */
export async function enableFocusEmulation(): Promise<void> {
	await browser.sendCommandAndGetResult('Emulation.setFocusEmulationEnabled', { enabled: true });
}

export interface PageEvents {
	mods: Array<{ n: number; path: string }>;
	notices: Array<{ n: number; text: string }>;
	errs: Array<{ n: number; text: string }>;
}

export const mark = (): Promise<number> => ev<number>('window.__dse.n');

export const eventsSince = (m: number): Promise<PageEvents> =>
	ev<PageEvents>(
		`(() => ({ mods: __dse.mods.filter((x) => x.n > ${m}), notices: __dse.notices.filter((x) => x.n > ${m}), errs: __dse.errs.filter((x) => x.n > ${m}) }))()`,
	);

/**
 * Give the Obsidian window room for the two-column modals. chromedriver's window/rect and CDP's
 * Browser.getWindowForTarget are both unsupported by Electron, so ask Electron itself (Obsidian
 * exposes @electron/remote to the renderer); fall back to a layout-viewport override.
 */
export async function setWindowSize(width: number, height: number): Promise<void> {
	const done = await ev<boolean>(
		`(() => { try { require('electron').remote.getCurrentWindow().setSize(${width}, ${height}); return true; } catch (e) { return false; } })()`,
	);
	if (!done) {
		await browser.sendCommandAndGetResult('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
		return;
	}
	await browser.waitUntil(async () => (await ev<number>('window.innerWidth')) >= width - 20, {
		timeout: 5000,
		interval: 50,
		timeoutMsg: `the window never reached ${width} px wide`,
	});
}
