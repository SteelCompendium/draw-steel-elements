import { execFileSync, spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// SC-551 — scripts/cdp-owned.mjs: a runner only talks CDP to an endpoint its own Obsidian reported.
// The helper is ESM (.mjs) and this repo's jest config has no ESM support, so — the same pattern as
// xvfbOwned.test.ts — each case runs a small module script in a real `node` subprocess and reads back one JSON
// line. Fakes: a "child" (exit state + once/removeListener), the DevToolsActivePort file Chromium writes into the
// user-data-dir (measured on Obsidian 1.15.0: "<port>\n/devtools/browser/<uuid>", no trailing newline), and a real
// HTTP server standing in for a CDP browser (it answers /json/version and records every request path).

const repoRoot = path.resolve(__dirname, '../../..');
const helper = path.join(repoRoot, 'scripts/cdp-owned.mjs');
const OURS = '11111111-1111-4111-8111-111111111111';
const THEIRS = '22222222-2222-4222-8222-222222222222';

let dir: string;
let sibling: ChildProcess; // a live process of ours that is NOT a descendant of the subprocess each case runs in
beforeAll(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dse-cdp-owned-test-'));
	sibling = spawn('sleep', ['120'], { stdio: 'ignore' });
});
afterAll(() => {
	sibling.kill('SIGKILL');
	fs.rmSync(dir, { recursive: true, force: true });
});

interface Outcome {
	ok?: { port: number; guid: string };
	error?: { name: string; reason: string; message: string };
	hits: string[];
	servedPort: number;
	ms: number;
	[k: string]: unknown;
}

/** Runs `body` (JS source) with the helper's exports, `serve(guid)`, a fake `child` (pid 4242) + fake procfs (`listening`, `foreign`, `procTable`), `ud` (a fresh user-data-dir) in scope; it assigns `out.*` and may call `prove(opts)`. */
function run(body: string): Outcome {
	const ud = fs.mkdtempSync(path.join(dir, 'ud-'));
	const code = `
		import http from 'node:http';
		import fs from 'node:fs';
		import { proveCdpOwned, portInUse, parseActivePort, clearStaleReport, listenInodes, servesBrowser, parseStat, processTree, CdpOwnershipError } from ${JSON.stringify(helper)};
		const ud = ${JSON.stringify(ud)};
		const OURS = ${JSON.stringify(OURS)}, THEIRS = ${JSON.stringify(THEIRS)};
		const hits = [];
		// fake procfs: every served port has a LISTEN row (inode 100000 + port); the "child" (pid 4242) holds the sockets of
		// ports not in \`foreign\` (those belong to some other pid) plus an unrelated fd
		const listening = [];
		const foreign = new Set();
		const inodeOf = (p) => 100000 + p;
		const row = (i, port, inode, st = '0A') => ' ' + i + ': 0100007F:' + port.toString(16).toUpperCase().padStart(4, '0') + ' 00000000:0000 ' + st + ' 00000000:00000000 00:00000000 00000000  1000        0 ' + inode + ' 1 0000000000000000 100 0 0 10 0';
		const HEAD = '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode';
		let procTable = () => [HEAD, ...listening.map((p, i) => row(i, p, inodeOf(p)))].join('\\n') + '\\n';
		const readProc = (p) => (p === '/proc/net/tcp' ? procTable() : p === '/proc/net/tcp6' ? HEAD + '\\n' : null);
		const SIBLING = ${sibling.pid};
		// fake process table: the child (4242, ppid 1) has no descendants unless a case adds some
		const procStats = () => new Map([[1, { ppid: 0, comm: 'init' }], [4242, { ppid: 1, comm: 'obsidian' }]]);
		const fdLinks = () => ['anon_inode:[eventpoll]', ...listening.filter((p) => !foreign.has(p)).map((p) => 'socket:[' + inodeOf(p) + ']')];
		const servers = [];
		/** a fake CDP browser: /json/version names browser <guid>; returns its port. */
		const serve = async (guid) => {
			const s = http.createServer((req, res) => {
				hits.push(req.url);
				res.setHeader('content-type', 'application/json');
				res.end(JSON.stringify({ Browser: 'Chrome/106', webSocketDebuggerUrl: 'ws://127.0.0.1:' + s.address().port + '/devtools/browser/' + guid }));
			});
			await new Promise((r) => s.listen(0, '127.0.0.1', r));
			servers.push(s);
			listening.push(s.address().port);
			return s.address().port;
		};
		const writeReport = (port, guid) => fs.writeFileSync(ud + '/DevToolsActivePort', port + '\\n/devtools/browser/' + guid);
		const child = { pid: 4242, exitCode: null, signalCode: null, once: () => {}, removeListener: () => {} };
		const die = () => { child.exitCode = 1; };
		const prove = (o) => proveCdpOwned({ child, userDataDir: ud, pollMs: 10, readProc, fdLinks, procStats, ...o });
		const t0 = Date.now();
		const out = { hits, servedPort: 0 };
		try {
			${body}
		} catch (e) {
			out.error = { name: e.constructor.name, reason: e.reason, message: e.message };
		}
		out.ms = Date.now() - t0;
		console.log(JSON.stringify(out));
		for (const s of servers) s.close();
		process.exit(0);
	`;
	const stdout = execFileSync('node', ['--input-type=module', '-e', code], { cwd: repoRoot, encoding: 'utf8' });
	return JSON.parse(stdout.trim().split('\n').pop() as string) as Outcome;
}

describe('SC-551: proveCdpOwned', () => {
	test('port 0: returns the port and browser id our child reported, after a /json/version read that agrees (and nothing else is requested)', () => {
		const out = run(`
			const p = await serve(OURS); out.servedPort = p;
			setTimeout(() => writeReport(p, OURS), 150);
			out.ok = await prove({});
		`);
		expect(out.ok).toEqual({ port: out.servedPort, guid: OURS });
		expect(out.hits).toEqual(['/json/version']);
		expect(out.ms).toBeGreaterThanOrEqual(100); // it waited for the report
	});

	test('a pinned port: accepted when the report names exactly that port and the browser id matches', () => {
		const out = run(`
			const p = await serve(OURS); out.servedPort = p;
			writeReport(p, OURS);
			out.ok = await prove({ expectedPort: p });
		`);
		expect(out.ok).toEqual({ port: out.servedPort, guid: OURS });
	});

	test('a pinned port whose bind our Obsidian lost (no report) while another browser holds it: exit-2 failure naming the port and the other owner, and nothing is requested from the stranger', () => {
		const out = run(`
			const p = await serve(THEIRS); out.servedPort = p; // the stranger's DevTools server
			await prove({ expectedPort: p, timeoutMs: 400 });
		`);
		expect(out.error?.name).toBe('CdpOwnershipError');
		expect(out.error?.reason).toBe('no-report');
		expect(out.error?.message).toContain(`port ${out.servedPort}`);
		expect(out.error?.message).toContain('another instance owns it');
		expect(out.hits).toEqual([]); // not even the HTTP reads: no report, no business with that port
	});

	test('a report whose browser id differs from the one served on that port is not ours (guid mismatch), naming the port', () => {
		const out = run(`
			const p = await serve(THEIRS); out.servedPort = p;
			writeReport(p, OURS);
			await prove({ expectedPort: p });
		`);
		expect(out.error?.reason).toBe('guid-mismatch');
		expect(out.error?.message).toContain(`port ${out.servedPort}`);
		expect(out.error?.message).toContain('another instance owns it');
		expect(out.hits).toEqual(['/json/version']); // only the one read, never /json/list
	});

	test('a pinned port the report does not name is a failure (port mismatch)', () => {
		const out = run(`
			const p = await serve(OURS); out.servedPort = p;
			writeReport(p, OURS);
			await prove({ expectedPort: p + 1 });
		`);
		expect(out.error?.reason).toBe('port-mismatch');
		expect(out.error?.message).toContain(`port ${(out.servedPort as number) + 1}`);
		expect(out.hits).toEqual([]);
	});

	test('the child exiting before it reports fails at once with the start-up message, not after the timeout', () => {
		const out = run(`
			setTimeout(die, 100);
			await prove({ timeoutMs: 10000 });
		`);
		expect(out.error?.reason).toBe('exited');
		expect(out.error?.message).toBe('Obsidian exited during start-up');
		expect(out.ms).toBeLessThan(3000);
	});

	test('port 0 with no report in time: a timeout failure that does not claim another instance owns anything', () => {
		const out = run(`await prove({ timeoutMs: 300 });`);
		expect(out.error?.reason).toBe('no-report');
		expect(out.error?.message).toContain('never reported a DevTools port');
		expect(out.error?.message).not.toContain('another instance');
	});

	test('a half-written report is waited out, not read as a mismatch', () => {
		const out = run(`
			const p = await serve(OURS); out.servedPort = p;
			fs.writeFileSync(ud + '/DevToolsActivePort', String(p) + '\\n/devtools/browser/11111111-1111-');
			setTimeout(() => writeReport(p, OURS), 200);
			out.ok = await prove({});
			out.parsed = [parseActivePort(''), parseActivePort('9222'), parseActivePort('9222\\n/devtools/browser/abc'), parseActivePort('0\\n/devtools/browser/' + OURS), parseActivePort('9222\\n/devtools/browser/' + OURS)];
		`);
		expect(out.ok).toEqual({ port: out.servedPort, guid: OURS });
		expect(out.parsed).toEqual([null, null, null, null, { port: 9222, guid: OURS }]);
	});

	test('a reported port that does not answer /json/version fails (unreachable) once the timeout passes', () => {
		const out = run(`
			const p = await serve(OURS); servers.pop().close(); // a port that was ours to serve and is gone
			writeReport(p, OURS);
			await prove({ timeoutMs: 400 });
		`);
		expect(out.error?.reason).toBe('unreachable');
	});

	test('a stale DevToolsActivePort from an earlier run (persistent user-data-dir) is deleted before the spawn, so it can never pass for our child\'s report; a missing file is fine', () => {
		const out = run(`
			const p = await serve(OURS); out.servedPort = p;
			writeReport(p, OURS); // the last run left this behind and its Obsidian is gone; a live stranger now answers on p
			out.hadFile = fs.existsSync(ud + '/DevToolsActivePort');
			clearStaleReport(ud);
			out.hasFile = fs.existsSync(ud + '/DevToolsActivePort');
			clearStaleReport(ud); // nothing to delete: no throw
			await prove({ expectedPort: p, timeoutMs: 300 });
		`);
		expect([out.hadFile, out.hasFile]).toEqual([true, false]);
		expect(out.error?.reason).toBe('no-report');
		expect(out.hits).toEqual([]);
	});

	test('SC-551 r3 H-1: the LISTEN socket on the reported port must be our child\'s; another pid\'s socket is rejected even though the report and the served browser id agree, and nothing is requested from it', () => {
		const out = run(`
			const p = await serve(OURS); out.servedPort = p;
			writeReport(p, OURS); // e.g. read from a user-data-dir shared with the process that really owns p
			foreign.add(p);
			await prove({ expectedPort: p });
		`);
		expect(out.error?.reason).toBe('foreign-listener');
		expect(out.error?.message).toContain(`port ${out.servedPort}`);
		expect(out.error?.message).toContain('another instance owns it');
		expect(out.hits).toEqual([]);
	});

	test('a reported port nobody listens on is a foreign-listener failure too, and so is a /proc that cannot be read (fail closed)', () => {
		const out = run(`
			const p = await serve(OURS); out.servedPort = p;
			writeReport(p, OURS);
			listening.length = 0; // the table has no LISTEN row for p
			try { await prove({}); } catch (e) { out.nothing = e.reason; }
			listening.push(p);
			try { await prove({ readProc: () => null }); } catch (e) { out.unreadable = e.reason; }
			try { await prove({ fdLinks: () => null }); } catch (e) { out.noFds = e.reason; }
		`);
		expect([out.nothing, out.unreadable, out.noFds]).toEqual(['foreign-listener', 'unverifiable', 'unverifiable']);
	});

	test('with the real /proc: a listener held by this process is ours when child.pid is this process, and foreign when child.pid is a process that is not its ancestor-or-self (a sibling)', () => {
		const out = run(`
			const p = await serve(OURS); out.servedPort = p;
			writeReport(p, OURS);
			const real = { readProc: undefined, fdLinks: undefined, procStats: undefined };
			out.ok = await prove({ ...real, child: { pid: process.pid, exitCode: null, signalCode: null } });
			try { await prove({ ...real, child: { pid: SIBLING, exitCode: null, signalCode: null } }); } catch (e) { out.siblingReason = e.reason; out.siblingMessage = e.message; }
		`);
		expect(out.ok).toEqual({ port: out.servedPort, guid: OURS });
		expect(out.siblingReason).toBe('foreign-listener');
		expect(out.siblingMessage).toMatch(/held by pid \d+ "/); // names the process that really holds the socket
	});

	test('SC-551 r5 LOW-1: a launcher wrapper that does not exec - the spawned pid is a shell, Obsidian is its child - is ours; a socket held outside the child\'s tree is still foreign', () => {
		const out = run(`
			const p = await serve(OURS); out.servedPort = p;
			writeReport(p, OURS);
			const wrapper = 4242, obsidian = 4300, stranger = 5000;
			const stats = new Map([[1, { ppid: 0, comm: 'init' }], [wrapper, { ppid: 1, comm: 'wrapper.sh' }], [obsidian, { ppid: wrapper, comm: 'obsidian' }], [stranger, { ppid: 1, comm: 'obsidian' }]]);
			const held = (pid) => (pid === obsidian ? ['socket:[' + inodeOf(p) + ']'] : ['anon_inode:[eventpoll]']);
			out.ok = await prove({ procStats: () => stats, fdLinks: held });
			const strangerHolds = (pid) => (pid === stranger ? ['socket:[' + inodeOf(p) + ']'] : ['anon_inode:[eventpoll]']);
			try { await prove({ procStats: () => stats, fdLinks: strangerHolds }); } catch (e) { out.reason = e.reason; out.message = e.message; }
		`);
		expect(out.ok).toEqual({ port: out.servedPort, guid: OURS });
		expect(out.reason).toBe('foreign-listener');
		expect(out.message).toContain('held by pid 5000 "obsidian"');
		expect(out.message).toContain('our pid 4242');
	});

	test('with the real /proc, a non-exec bash wrapper whose child holds the DevTools socket is accepted', () => {
		const out = run(`
			const { spawn } = await import('node:child_process');
			const server = ${JSON.stringify("const http=require('http'),fs=require('fs');const s=http.createServer((q,r)=>{r.setHeader('content-type','application/json');r.end(JSON.stringify({webSocketDebuggerUrl:'ws://127.0.0.1:'+s.address().port+'/devtools/browser/' + process.argv[2]}))});s.listen(0,'127.0.0.1',()=>fs.writeFileSync(process.argv[1]+'/DevToolsActivePort',s.address().port+'\\n/devtools/browser/'+process.argv[2]));")};
			// bash -c '"$0" -e ... ; true': the trailing command keeps bash from exec-ing node, so node is bash's child
			const wrapper = spawn('bash', ['-c', '"$0" -e "$1" "$2" "$3"; true', process.execPath, server, ud, OURS], { stdio: 'ignore' });
			out.ok = await prove({ child: wrapper, readProc: undefined, fdLinks: undefined, procStats: undefined, timeoutMs: 10000 });
			wrapper.kill('SIGKILL');
		`);
		expect(out.error).toBeUndefined();
		expect(out.ok?.guid).toBe(OURS);
	});

	test('two listeners on one port - ours on 127.0.0.1, a stranger\'s on [::1] - fail the proof: ANY foreign listener on the port is enough', () => {
		const out = run(`
			const p = await serve(OURS); out.servedPort = p;
			writeReport(p, OURS);
			const tcp = () => [HEAD, row(0, p, inodeOf(p))].join('\\n') + '\\n';
			const tcp6 = () => [HEAD, ' 0: 00000000000000000000000001000000:' + p.toString(16).toUpperCase().padStart(4, '0') + ' 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 777777 1 0000000000000000 100 0 0 10 0'].join('\\n') + '\\n';
			const two = (f) => (f === '/proc/net/tcp' ? tcp() : tcp6());
			try { await prove({ readProc: two }); } catch (e) { out.reason = e.reason; }
			listening.length = 0; // control: ours alone on the same two tables (no [::1] row) passes
			listening.push(p);
			out.alone = await prove({ readProc: (f) => (f === '/proc/net/tcp' ? tcp() : HEAD + '\\n') });
		`);
		expect(out.reason).toBe('foreign-listener');
		expect(out.alone).toEqual({ port: out.servedPort, guid: OURS });
	});

	test('parseStat splits the comm on the LAST parenthesis (spaces and ")" in the name), and processTree is bounded on a ppid cycle', () => {
		const out = run(`
			out.plain = parseStat('123 (obsidian) S 45 123 123 0 -1');
			out.weird = parseStat('124 (my app) (x) y) R 99 1 1 0 -1');
			out.bad = [parseStat('garbage'), parseStat('1 (x) S notanumber')];
			const cyc = new Map([[1, { ppid: 2, comm: 'a' }], [2, { ppid: 1, comm: 'b' }], [3, { ppid: 2, comm: 'c' }]]);
			out.tree = [...processTree(1, cyc)].sort();
		`);
		expect(out.plain).toEqual({ ppid: 45, comm: 'obsidian' });
		expect(out.weird).toEqual({ ppid: 99, comm: 'my app) (x) y' });
		expect(out.bad).toEqual([null, null]);
		expect(out.tree).toEqual([1, 2, 3]);
	});

	test('listenInodes reads LISTEN rows of tcp and tcp6 for the port only (an ESTABLISHED row and another port are ignored); servesBrowser compares the served browser id', () => {
		const out = run(`
			const head = 'sl local_address rem_address st tx rx tr tm retr uid timeout inode';
			const tcp = [head, '0: 0100007F:1F90 00000000:0000 0A 0:0 0:0 0 1000 0 111 1', '1: 0100007F:1F90 0100007F:D431 01 0:0 0:0 0 1000 0 222 1', '2: 0100007F:1F91 00000000:0000 0A 0:0 0:0 0 1000 0 333 1'].join('\\n');
			const tcp6 = [head, '0: 00000000000000000000000001000000:1F90 00000000000000000000000000000000:0000 0A 0:0 0:0 0 1000 0 444 1'].join('\\n');
			out.both = [...listenInodes(8080, (p) => (p === '/proc/net/tcp' ? tcp : tcp6))].sort();
			out.onlyV6 = [...listenInodes(8080, (p) => (p === '/proc/net/tcp6' ? tcp6 : null))];
			out.none = listenInodes(8080, () => null);
			const p = await serve(OURS);
			out.same = await servesBrowser(p, OURS);
			out.other = await servesBrowser(p, THEIRS);
			out.down = await servesBrowser(1, OURS);
		`);
		expect([out.both, out.onlyV6, out.none]).toEqual([['111', '444'], ['444'], null]);
		expect([out.same, out.other, out.down]).toEqual([true, false, false]);
	});

	test('portInUse sees a plain TCP listener that speaks no HTTP, and a freed port reads as free', () => {
		const out = run(`
			const net = await import('node:net');
			const l = net.createServer((s) => s.end());
			await new Promise((r) => l.listen(0, '127.0.0.1', r));
			const port = l.address().port;
			out.busy = await portInUse(port);
			await new Promise((r) => l.close(r));
			out.freed = await portInUse(port);
		`);
		expect(out.busy).toBe(true);
		expect(out.freed).toBe(false);
	});
});
