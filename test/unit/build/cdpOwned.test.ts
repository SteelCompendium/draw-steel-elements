import { execFileSync } from 'child_process';
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
beforeAll(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dse-cdp-owned-test-'));
});
afterAll(() => {
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

/** Runs `body` (JS source) with `proveCdpOwned`, `portInUse`, `parseActivePort`, `serve(guid)`, `child`, `ud` (a fresh user-data-dir) in scope; it assigns `extra` and may call `prove(opts)`. */
function run(body: string): Outcome {
	const ud = fs.mkdtempSync(path.join(dir, 'ud-'));
	const code = `
		import http from 'node:http';
		import fs from 'node:fs';
		import { proveCdpOwned, portInUse, parseActivePort, clearStaleReport, CdpOwnershipError } from ${JSON.stringify(helper)};
		const ud = ${JSON.stringify(ud)};
		const OURS = ${JSON.stringify(OURS)}, THEIRS = ${JSON.stringify(THEIRS)};
		const hits = [];
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
			return s.address().port;
		};
		const writeReport = (port, guid) => fs.writeFileSync(ud + '/DevToolsActivePort', port + '\\n/devtools/browser/' + guid);
		const child = { exitCode: null, signalCode: null, once: () => {}, removeListener: () => {} };
		const die = () => { child.exitCode = 1; };
		const prove = (o) => proveCdpOwned({ child, userDataDir: ud, pollMs: 10, ...o });
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
