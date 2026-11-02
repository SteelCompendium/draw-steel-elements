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
// that failed to bind writes nothing. So the endpoint is ours when
//   (1) OUR child's file reports a port (and, for a pinned port, the port we asked for),
//   (2) the LISTEN socket on that port belongs to OUR child or one of its descendants (its inode in /proc/net/tcp{,6} is one
//       of the sockets under /proc/<pid>/fd; descendants because a launcher wrapper may not exec), and
//   (3) the browser GUID that `GET http://127.0.0.1:<port>/json/version` serves equals the file's GUID.
// PRECONDITION: the user-data-dir belongs to our child alone. (1) and (3) only prove "the file and the server agree";
// if a second Obsidian shares the --user-data-dir (the camera's default DSE_CAMERA_TMP is one machine-wide path,
// SC-554) it writes the SAME file, and a run can read the other process's port and GUID - they agree with each other.
// (2) is what closes that: a socket is a process's own, a file in a shared directory is not (SC-551 r3: 10 of 10 shared-
// udd pairs passed (1)+(3) for the other process's browser; (2) rejects them). Still give every concurrent run its own
// udd where the runner allows it.
// Only plain HTTP/file/procfs reads happen - no CDP command is ever sent to a process we have not proven. With port 0 the OS
// picks a free port, so two runs cannot collide at all and the pre-check is unnecessary (the proof is still run:
// it is also what tells us the port). The file must not predate the spawn: a PERSISTENT user-data-dir keeps the last
// run's file after Obsidian exits (measured, SC-551 survey), so callers run clearStaleReport(udd) right before the spawn.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The CDP endpoint could not be proven ours. `reason`: 'no-report' | 'exited' | 'port-mismatch' | 'foreign-listener' |
 * 'unverifiable' (procfs unreadable: fail closed) | 'guid-mismatch' | 'unreachable'.
 */
export class CdpOwnershipError extends Error {
	constructor(reason, message) {
		super(message);
		this.reason = reason;
	}
}

/**
 * Deletes a `DevToolsActivePort` left in `userDataDir` by an earlier Obsidian (Chromium leaves it behind after exit),
 * so the file proveCdpOwned reads can only have been written by the child spawned after this call. Call it right
 * before every spawn that will be proven; a missing file is fine. A runner with a PERSISTENT user-data-dir (the camera)
 * needs it; a fresh scratch dir (lifecycle) makes it a no-op.
 */
export function clearStaleReport(userDataDir) {
	try {
		fs.unlinkSync(path.join(userDataDir, 'DevToolsActivePort'));
	} catch (e) {
		if (e.code !== 'ENOENT') throw e;
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

const defaultReadProc = (p) => {
	try {
		return fs.readFileSync(p, 'utf8');
	} catch {
		return null;
	}
};
/** `socket:[inode]` link targets of every open fd of `pid` (null when unreadable, e.g. the process is gone). */
const defaultFdLinks = (pid) => {
	try {
		return fs.readdirSync(`/proc/${pid}/fd`).map((f) => {
			try {
				return fs.readlinkSync(`/proc/${pid}/fd/${f}`);
			} catch {
				return '';
			}
		});
	} catch {
		return null;
	}
};

/** `{ppid, comm}` from the text of /proc/<pid>/stat, or null. comm is in parentheses and may itself hold spaces and `)`: split on the LAST `)`. */
export function parseStat(text) {
	const open = text.indexOf('(');
	const close = text.lastIndexOf(')');
	if (open < 0 || close < open) return null;
	const rest = text.slice(close + 1).trim().split(/\s+/); // state ppid pgrp ...
	const ppid = Number(rest[1]);
	return Number.isInteger(ppid) ? { ppid, comm: text.slice(open + 1, close) } : null;
}

/** pid -> `{ppid, comm}` of every process whose /proc/<pid>/stat can be read. */
const defaultProcStats = () => {
	const stats = new Map();
	let names = [];
	try {
		names = fs.readdirSync('/proc');
	} catch {
		return stats;
	}
	for (const n of names) {
		if (!/^\d+$/.test(n)) continue;
		const text = defaultReadProc(`/proc/${n}/stat`);
		const st = text === null ? null : parseStat(text);
		if (st) stats.set(Number(n), st);
	}
	return stats;
};

/** `rootPid` plus every descendant in `stats` (ppid links). Bounded: each pid is visited once, so a ppid cycle or a race cannot loop. */
export function processTree(rootPid, stats) {
	const kids = new Map();
	for (const [pid, st] of stats) {
		if (!kids.has(st.ppid)) kids.set(st.ppid, []);
		kids.get(st.ppid).push(pid);
	}
	const tree = new Set([rootPid]);
	const stack = [rootPid];
	while (stack.length) {
		for (const k of kids.get(stack.pop()) ?? []) {
			if (!tree.has(k)) {
				tree.add(k);
				stack.push(k);
			}
		}
	}
	return tree;
}

/**
 * Inodes of the LISTEN sockets (state 0A) bound to local `port` on any address, from /proc/net/tcp and tcp6;
 * null when neither table can be read. `readProc(path)` returns the file text or null.
 */
export function listenInodes(port, readProc = defaultReadProc) {
	const inodes = new Set();
	let readable = false;
	for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
		const text = readProc(table);
		if (text === null) continue;
		readable = true;
		for (const line of text.split('\n').slice(1)) {
			const f = line.trim().split(/\s+/);
			// sl local_address rem_address st tx_queue:rx_queue tr:tm->when retrnsmt uid timeout inode
			if (f.length < 10 || f[3] !== '0A') continue;
			if (parseInt(f[1].split(':')[1], 16) === port) inodes.add(f[9]);
		}
	}
	return readable ? inodes : null;
}

/** True when the browser serving `http://127.0.0.1:<port>/json/version` is the one with browser id `guid` (false on any error). */
export async function servesBrowser(port, guid, fetchImpl = fetch) {
	try {
		const v = await (await fetchImpl(`http://127.0.0.1:${port}/json/version`)).json();
		return String(v.webSocketDebuggerUrl ?? '').endsWith(`/devtools/browser/${guid}`);
	} catch {
		return false;
	}
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
 * --user-data-dir=<userDataDir>; clearStaleReport() ran before the spawn), once its report has been checked against the server on that port. Throws
 * CdpOwnershipError otherwise. Sends no CDP command: only reads our own file and one `/json/version`.
 *
 * @param {object} o
 * @param {{exitCode:number|null, signalCode:string|null, once:Function, removeListener:Function}} o.child  our Obsidian.
 * @param {string} o.userDataDir   the --user-data-dir we passed it (DevToolsActivePort must not predate the spawn: clearStaleReport).
 * @param {number} [o.expectedPort] a pinned port (DSE_LIFECYCLE_PORT): the report must name exactly it. Omit for port 0.
 * @param {number} [o.timeoutMs]   overall wait for the report and the check (default 30 s; measured report: ~320 ms).
 * @param {number} [o.pollMs]      file poll interval (default 25 ms).
 * @param {(path:string)=>string|null} [o.readFile]  injectable file read (null when absent).
 * @param {typeof fetch} [o.fetchImpl]               injectable fetch.
 * @param {(path:string)=>string|null} [o.readProc]  injectable /proc/net/tcp{,6} read (null when unreadable).
 * @param {(pid:number)=>string[]|null} [o.fdLinks]  injectable `readlink` of every /proc/<pid>/fd entry.
 * @param {()=>Map<number,{ppid:number,comm:string}>} [o.procStats]  injectable process table (pid -> ppid, comm) for the descendant walk.
 */
export async function proveCdpOwned({ child, userDataDir, expectedPort, timeoutMs = 30000, pollMs = 25, readFile = defaultRead, fetchImpl = fetch, readProc = defaultReadProc, fdLinks = defaultFdLinks, procStats = defaultProcStats }) {
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

	// (2) the LISTEN socket on that port is held by OUR child or one of ITS descendants (a launcher wrapper that does not
	// exec - a script, `flatpak run` - makes the spawned pid a shell and Obsidian its child), never by a process outside
	// that tree (a shared user-data-dir shares the file; the other run's Obsidian is not our descendant)
	const listening = listenInodes(report.port, readProc);
	const ownFds = child.pid === undefined ? null : fdLinks(child.pid);
	if (listening === null || ownFds === null) {
		throw new CdpOwnershipError('unverifiable', `port ${report.port}: cannot read /proc to check which process listens there (our pid ${child.pid})`);
	}
	const stats = procStats();
	const ours = new Set(ownFds);
	for (const pid of processTree(child.pid, stats)) {
		if (pid !== child.pid) for (const link of fdLinks(pid) ?? []) ours.add(link);
	}
	const foreignInode = [...listening].find((inode) => !ours.has(`socket:[${inode}]`));
	if (listening.size === 0 || foreignInode !== undefined) {
		let holder = '';
		if (foreignInode !== undefined) {
			for (const pid of stats.keys()) {
				if ((fdLinks(pid) ?? []).includes(`socket:[${foreignInode}]`)) {
					holder = `; held by pid ${pid} "${stats.get(pid).comm}"`;
					break;
				}
			}
		}
		throw new CdpOwnershipError(
			'foreign-listener',
			`port ${report.port}: ${listening.size === 0 ? 'nothing listens there' : 'the listening socket there is not our Obsidian\'s'} (our pid ${child.pid}${holder}) - another instance owns it`,
		);
	}

	// (3) the server on that port is the browser our process reported
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
