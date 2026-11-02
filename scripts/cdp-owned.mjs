// scripts/cdp-owned.mjs - SC-551: use a CDP endpoint only after PROVING it belongs to the Obsidian we spawned.
//
// Shared by visual-harness/obsidian-lifecycle.mjs (and reusable by any runner that starts its own Obsidian
// with --remote-debugging-port; neither harness dir may import the other, hence scripts/ - same home as
// xvfb-owned.mjs, the SC-546 worked example of this race for X displays).
//
// WHY. The old lifecycle runner treated "something answers on http://localhost:<port>/json/list with an
// app://obsidian.md page" as "my Obsidian is up". That page belongs to WHOEVER BOUND THE PORT, not to the
// Obsidian we just spawned. Two runners on the same port (the default 9262, or any pinned DSE_LIFECYCLE_PORT) both
// pass the one-shot "is it free?" pre-check, which ran seconds before the spawn, and both spawn Obsidian. Measured
// (SC-551, Obsidian 1.15.0 / Electron 21): the loser does NOT exit and does NOT say anything - it keeps running
// with no DevTools server at all (no DevToolsActivePort file, no "DevTools listening" line on stderr, 25 s
// watched, with a plain TCP listener or a stand-in for the other session's Obsidian on the port) - and the
// runner's poll sees the winner's page, attaches to it and runs its scenarios INSIDE THE OTHER SESSION'S OBSIDIAN
// (reproduced on base: a run's `app.vault.adapter.basePath` was the other run's vault in 11 of 11 pairs).
//
// HOW. Our own Obsidian tells us. With --remote-debugging-port=<n> Chromium writes `DevToolsActivePort` into OUR
// --user-data-dir once its DevTools server is listening: line 1 the port, line 2 `/devtools/browser/<guid>`
// (measured: ~320 ms after spawn, together with the "DevTools listening on ws://127.0.0.1:<port>/devtools/browser/<guid>"
// stderr line; we read the file because stderr needs a pipe that must then be drained for the whole run). A process
// that failed to bind writes nothing. So the endpoint is ours exactly when
//   (1) OUR child's file reports a port (and, for a pinned port, the port we asked for), and
//   (2) the browser GUID that `GET http://127.0.0.1:<port>/json/version` serves equals the file's GUID.
// Both are plain HTTP/file reads - no CDP command is ever sent to a process we have not proven. With port 0 the OS
// picks a free port, so two runs cannot collide at all and the pre-check is unnecessary (the proof is still run:
// it is also what tells us the port). The caller's user-data-dir must be fresh (the file must not predate the
// spawn); the lifecycle runner makes a new scratch dir every run.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The CDP endpoint could not be proven ours. `reason`: 'no-report' | 'exited' | 'port-mismatch' | 'guid-mismatch' | 'unreachable'. */
export class CdpOwnershipError extends Error {
	constructor(reason, message) {
		super(message);
		this.reason = reason;
	}
}

/** True when something already accepts TCP connections on 127.0.0.1:port or [::1]:port (any protocol, not only CDP). */
export async function portInUse(port, hosts = ['127.0.0.1', '::1'], timeoutMs = 1000) {
	const probe = (host) =>
		new Promise((resolve) => {
			const s = net.connect({ port, host });
			const done = (busy) => {
				s.destroy();
				resolve(busy);
			};
			s.setTimeout(timeoutMs, () => done(false));
			s.once('connect', () => done(true));
			s.once('error', () => done(false)); // refused (free) or no such family
		});
	return (await Promise.all(hosts.map(probe))).some(Boolean);
}

const GUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Parses a DevToolsActivePort file: `{port, guid}` once it is complete (a port line and a `/devtools/browser/<uuid>` line),
 * else null. Measured: the file has no trailing newline, so a half-written file is told apart by the full UUID shape.
 */
export function parseActivePort(text) {
	const lines = text.split('\n');
	if (lines.length < 2) return null;
	const port = Number(lines[0]);
	const m = new RegExp(`^/devtools/browser/(${GUID})$`, 'i').exec(lines[1].trim());
	if (!Number.isInteger(port) || port <= 0 || port > 65535 || !m) return null;
	return { port, guid: m[1] };
}

/**
 * Resolves `{port, guid}` for the DevTools server of OUR `child` (spawned with --remote-debugging-port=<n>
 * --user-data-dir=<userDataDir>), once its report has been checked against the server on that port. Throws
 * CdpOwnershipError otherwise. Sends no CDP command: only reads our own file and one `/json/version`.
 *
 * @param {object} o
 * @param {{exitCode:number|null, signalCode:string|null, once:Function, removeListener:Function}} o.child  our Obsidian.
 * @param {string} o.userDataDir   the --user-data-dir we passed it (fresh: DevToolsActivePort must not predate the spawn).
 * @param {number} [o.expectedPort] a pinned port (DSE_LIFECYCLE_PORT): the report must name exactly it. Omit for port 0.
 * @param {number} [o.timeoutMs]   overall wait for the report and the check (default 30 s; measured report: ~320 ms).
 * @param {number} [o.pollMs]      file poll interval (default 25 ms).
 * @param {(path:string)=>string|null} [o.readFile]  injectable file read (null when absent).
 * @param {typeof fetch} [o.fetchImpl]               injectable fetch.
 */
export async function proveCdpOwned({ child, userDataDir, expectedPort, timeoutMs = 30000, pollMs = 25, readFile = defaultRead, fetchImpl = fetch }) {
	const file = path.join(userDataDir, 'DevToolsActivePort');
	const deadline = Date.now() + timeoutMs;
	const pinned = expectedPort !== undefined && expectedPort !== 0;
	const owner = pinned ? ' - another instance owns it' : '';
	const dead = () => child.exitCode !== null || child.signalCode !== null;

	// (1) our process reports its port and browser id
	let report = null;
	while (!report) {
		if (dead()) throw new CdpOwnershipError('exited', 'Obsidian exited during start-up');
		const text = readFile(file);
		report = text === null ? null : parseActivePort(text);
		if (report) break;
		if (Date.now() >= deadline) {
			throw new CdpOwnershipError(
				'no-report',
				pinned
					? `our Obsidian never reported a DevTools server on port ${expectedPort} within ${timeoutMs / 1000} s (no DevToolsActivePort in its user-data-dir)${owner}`
					: `our Obsidian never reported a DevTools port within ${timeoutMs / 1000} s (no DevToolsActivePort in its user-data-dir)`,
			);
		}
		await sleep(pollMs);
	}
	if (pinned && report.port !== expectedPort) {
		throw new CdpOwnershipError('port-mismatch', `port ${expectedPort}: our Obsidian reported port ${report.port} instead${owner}`);
	}

	// (2) the server on that port is the browser our process reported
	let served = null;
	let lastError = '';
	while (served === null) {
		try {
			const res = await fetchImpl(`http://127.0.0.1:${report.port}/json/version`);
			const ws = String((await res.json()).webSocketDebuggerUrl ?? '');
			served = /\/devtools\/browser\/([^\s/]+)$/.exec(ws)?.[1] ?? '';
		} catch (e) {
			lastError = e instanceof Error ? e.message : String(e);
			if (Date.now() >= deadline) {
				throw new CdpOwnershipError('unreachable', `port ${report.port}: our Obsidian reported it but /json/version does not answer (${lastError})`);
			}
			if (dead()) throw new CdpOwnershipError('exited', 'Obsidian exited during start-up');
			await sleep(pollMs);
		}
	}
	if (served !== report.guid) {
		throw new CdpOwnershipError('guid-mismatch', `port ${report.port}: the CDP server there is browser ${served || '(none)'}, not ours (${report.guid}) - another instance owns it`);
	}
	if (dead()) throw new CdpOwnershipError('exited', 'Obsidian exited during start-up'); // belt: still our running child
	return report;
}

function defaultRead(p) {
	try {
		return fs.readFileSync(p, 'utf8');
	} catch {
		return null;
	}
}
