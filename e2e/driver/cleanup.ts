// SC-408 e2e driver: put the page back to "nothing open, nothing pending" between tests, so one
// failing test cannot cascade into the next one.
import { browser } from '@wdio/globals';
import { ev, REGISTRY, waitFor } from './page';

/** Close every open Obsidian modal through its own close button (Obsidian >= 1.14: .modal-header-button; older: .modal-close-button), never by removing DOM. */
export async function closeModals(): Promise<void> {
	await ev(`document.querySelectorAll('.modal-container .modal-close-button, .modal-container .modal-header-button').forEach((b) => b.click())`);
	await waitFor(`document.querySelectorAll('.modal-container').length === 0`, 'all modals to close', 5000);
}

/**
 * Wait until no live view has a debounced or in-flight write (ViewRegistry.pendingWrites,
 * SC-408 seam). Two consecutive idle polls: the first can race a persist() scheduled by the
 * very event that just returned. Event-driven; the only time it waits is when a write is
 * actually pending (<= the 400 ms debounce).
 */
export async function waitWriteIdle(timeoutMs = 8000): Promise<void> {
	let quiet = 0;
	await browser.waitUntil(
		async () => {
			const pending = await ev<number>(`(() => { const r = ${REGISTRY}; return r ? r.pendingWrites().length : 0; })()`);
			if (pending > 0) {
				quiet = 0;
				return false;
			}
			quiet++;
			return quiet >= 2;
		},
		{ timeout: timeoutMs, interval: 30, timeoutMsg: 'timed out waiting for the plugin to go write-idle' },
	);
}

/** Close modals, unload every open note (this flushes any pending persist), wait write-idle. */
export async function closeEverything(): Promise<void> {
	await closeModals();
	await ev(`app.workspace.iterateRootLeaves((leaf) => leaf.detach())`);
	await waitWriteIdle();
}
