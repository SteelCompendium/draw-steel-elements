// scripts/xvfb-owned.mjs - SC-546: start a private Xvfb and PROVE the display is ours.
//
// Shared by e2e/run.mjs, visual-harness/obsidian-lifecycle.mjs and visual-harness/docs-shots.mjs
// (hence scripts/, a neutral dir both trees may import; neither harness dir may import the other).
//
// WHY. The old callers treated "the socket file /tmp/.X11-unix/X<n> exists" as "my Xvfb is up". But
// that socket belongs to WHOEVER WON THE LOCK for :n, not to the Xvfb we just spawned. Two runners
// that pick the same n at the same instant both pass the "is it free?" pre-check and both spawn
// `Xvfb :n`. Measured on devbox Xvfb 21.1.24 (SC-546): the loser frequently does NOT exit - it stays
// alive holding no socket at all (7 of 12 simultaneous pairs) - so an exit-code guard cannot catch it,
// and the loser's poll sees the winner's socket and happily runs on the winner's display. When the
// winner's run ends and kills its Xvfb, the loser's screen disappears under it.
//
// HOW. `-displayfd <fd>` makes Xvfb write "<n>\n" to that fd only once it is listening on the
// display; a server that lost the race exits (code 1, ~5 ms) without ever writing (measured: in 12 of
// 12 simultaneous pairs only the winner wrote, ~30 ms after spawn, and the loser exited). So the display
// is ours exactly when OUR child says so. We still pass the explicit `:n` (callers own disjoint ranges;
// letting Xvfb pick its own number could land on :0/:2 next to a real :1). Note `-displayfd` also makes
// Xvfb skip its /tmp/.X<n>-lock file, so the lock file cannot serve as a second proof (measured);
// instead, after the line arrives we re-check that our child is still running and its socket exists.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const socketPath = (n) => `/tmp/.X11-unix/X${n}`;
export const lockPath = (n) => `/tmp/.X${n}-lock`;

/** Default "looks taken" pre-check: somebody's socket or lock is there (also skips stale leftovers). */
export const defaultIsTaken = (n) => fs.existsSync(socketPath(n)) || fs.existsSync(lockPath(n));

/** Inclusive integer range [lo, hi]. */
export const displayRange = (lo, hi) => Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i);

/**
 * Try `Xvfb :n` for each n of `candidates` (in order, skipping those `isTaken` already) and return the
 * first one whose OWN child reports it is listening.
 *
 * @param {object} o
 * @param {string} o.bin                 Xvfb binary.
 * @param {number[]} o.candidates        display numbers to try, in order.
 * @param {string[]} [o.args]            extra Xvfb args after `:n` (screen, -nolisten, -noreset ...).
 * @param {object} [o.env]               child environment (default: this process's).
 * @param {(n:number)=>boolean} [o.isTaken]  cheap pre-check; default socket-or-lock exists.
 * @param {(child:import('node:child_process').ChildProcess, n:number)=>void} [o.onSpawn]
 *        called synchronously after every spawn, so the caller can track the child for cleanup even
 *        while the start is unconfirmed (a loser exits by itself; a hung one is killed here).
 * @param {(n:number)=>boolean} [o.hasSocket]  "its X socket is there" check for the belt (injectable for tests).
 * @param {number} [o.startTimeoutMs]    per-candidate wait for the server's line (default 10 s).
 * @param {number} [o.totalTimeoutMs]    overall bound across all candidates (default 30 s).
 * @returns {Promise<{display:string, num:number, child:import('node:child_process').ChildProcess}|null>}
 *          null when no candidate yielded a display we own.
 */
export async function startOwnedXvfb({ bin, candidates, args = [], env, isTaken = defaultIsTaken, onSpawn, hasSocket = (n) => fs.existsSync(socketPath(n)), startTimeoutMs = 10000, totalTimeoutMs = 30000 }) {
	const deadline = Date.now() + totalTimeoutMs;
	for (const n of candidates) {
		if (Date.now() >= deadline) break;
		if (isTaken(n)) continue;
		const child = spawn(bin, [`:${n}`, ...args, '-displayfd', '3'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'], ...(env ? { env } : {}) });
		child.on('error', () => {});
		onSpawn?.(child, n);
		const mine = await ownsDisplay(child, n, hasSocket, Math.min(startTimeoutMs, Math.max(0, deadline - Date.now())));
		if (mine) return { display: `:${n}`, num: n, child };
		try {
			child.kill('SIGKILL'); // lost the race (already gone) or never answered
		} catch {
			/* gone */
		}
	}
	return null;
}

/** Resolves true only if `child` writes exactly "<n>\n" to its fd 3 and is then still alive. */
function ownsDisplay(child, n, hasSocket, timeoutMs) {
	return new Promise((resolve) => {
		let buf = '';
		let settled = false;
		const finish = async (ok) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			child.removeListener('exit', onExit);
			child.stdio[3]?.destroy();
			if (ok) {
				// Belt: the server said it listens; confirm it is still our running child with its socket.
				await sleep(0);
				ok = child.exitCode === null && child.signalCode === null && hasSocket(n);
			}
			resolve(ok);
		};
		const onExit = () => void finish(false);
		const timer = setTimeout(() => void finish(false), timeoutMs);
		child.once('exit', onExit);
		child.stdio[3]?.on('data', (d) => {
			buf += d.toString();
			if (buf.includes('\n')) void finish(buf === `${n}\n`);
		});
		child.stdio[3]?.on('error', () => void finish(false));
	});
}
