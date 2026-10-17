#!/usr/bin/env node
// e2e/run.mjs - SC-408: the ONE entry point for the real-Obsidian behaviour suite.
//
//   npm run e2e                                    # headless (own Xvfb), pinned Obsidian, auto shards
//   npm run e2e -- --element=stamina-bar           # only e2e/specs/stamina-bar/**
//   npm run e2e -- --only=STAM-D01,STAM-S13        # mocha grep on "[ID]" in test titles
//   npm run e2e -- --shards=4                      # parallel Obsidians (default min(4, floor(nproc/3)))
//   npm run e2e -- --obsidian=pinned|installed     # app+installer 1.14.4 (default) | /usr/bin/obsidian
//   npm run e2e -- --headed [--slow=300]           # watch it (DSE_E2E_HEADED_DISPLAY, default :1)
//
// Exit 0 = every test ok (known-bug expected failures count as ok); 1 = a test failed;
// 2 = usage or environment (no Xvfb, build failed, session never started, interrupted).
// Final line:  OBSIDIAN-E2E done: N/M ok, F failed, K known-bug
//
// THE DISPLAY. Real Obsidian needs an X display, and agent shells export DISPLAY=:1, which is a
// person's real screen. So unless --headed, this ALWAYS starts its own private Xvfb in
// :200-:239 and gives every child that display explicitly; the inherited DISPLAY/XAUTHORITY/
// WAYLAND_DISPLAY are dropped. --headed is the only way onto a real display.
//
// CHILD HYGIENE. Everything this spawns (Xvfb, wdio and its workers, chromedriver, Obsidian) is
// reaped by PID on every exit path - normal, failure, SIGINT/SIGTERM, mid-startup. Descendants
// are tracked by polling the process tree while running, and any leftover process whose
// environment carries this run's DSE_E2E_RUN_ID is also found and killed. Nothing is ever
// killed by name.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(here);
const outRoot = path.join(here, '.out');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PINNED = '1.14.4';
const TAG = 'OBSIDIAN-E2E';
const XVFB_RANGE = [200, 239];

class UsageError extends Error {}
class EnvError extends Error {}

// ----------------------------------------------------------------------------- arguments
function parseArgs(argv) {
	const a = {
		element: null,
		only: [],
		shards: null,
		obsidian: 'pinned',
		headed: false,
		slow: 0,
	};
	for (const arg of argv) {
		const [k, v] = arg.startsWith('--') ? arg.slice(2).split(/=(.*)/s, 2) : [null, null];
		switch (k) {
			case 'element':
				if (!v) throw new UsageError('--element needs a directory under e2e/specs/');
				a.element = v;
				break;
			case 'only':
				a.only = (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
				if (!a.only.length) throw new UsageError('--only needs at least one test id, e.g. --only=STAM-D01');
				break;
			case 'shards':
				if (!/^[1-9]\d*$/.test(v ?? '')) throw new UsageError('--shards needs a positive integer');
				a.shards = Number(v);
				break;
			case 'obsidian':
				if (!['pinned', 'installed', 'earliest', 'matrix'].includes(v ?? '')) {
					throw new UsageError('--obsidian must be pinned|installed|earliest|matrix');
				}
				a.obsidian = v;
				break;
			case 'headed':
				a.headed = true;
				break;
			case 'slow':
				if (!/^\d+$/.test(v ?? '')) throw new UsageError('--slow needs milliseconds, e.g. --slow=300');
				a.slow = Number(v);
				break;
			default:
				throw new UsageError(`unknown argument ${arg}`);
		}
	}
	if (a.obsidian === 'earliest' || a.obsidian === 'matrix') {
		throw new UsageError(`--obsidian=${a.obsidian} is not implemented yet (pinned and installed are)`);
	}
	return a;
}

// ------------------------------------------------------------------------- spec discovery
function walk(dir, pred, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, pred, out);
		else if (pred(e.name)) out.push(p);
	}
	return out;
}

const TITLE_RE = /\b(?:it|knownBug)\s*\(\s*(?:(['"`])[^'"`]*\1\s*,\s*)?(['"`])((?:\\.|(?!\2)[^\\])*)\2/g;
const ID_RE = /\[([A-Z][A-Z0-9]*-[A-Za-z0-9]+)\]/g;

/** Pre-scan spec files for the `[ID]`s in their it()/knownBug() titles. */
function scanSpec(file) {
	const text = fs.readFileSync(file, 'utf8');
	const ids = [];
	for (const m of text.matchAll(TITLE_RE)) for (const id of m[3].matchAll(ID_RE)) ids.push(id[1]);
	return ids;
}

function discoverSpecs(args) {
	const specsRoot = path.join(here, 'specs');
	let root = specsRoot;
	if (args.element) {
		root = path.join(specsRoot, args.element);
		if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
			const known = fs.readdirSync(specsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
			throw new UsageError(`--element=${args.element}: no such directory under e2e/specs/ (have: ${known.join(', ') || 'none'})`);
		}
	}
	const files = walk(root, (n) => n.endsWith('.e2e.ts')).sort();
	if (!files.length) throw new UsageError(`no *.e2e.ts specs under ${path.relative(repo, root)}`);
	const scanned = files.map((f) => ({ file: f, ids: scanSpec(f) }));
	const dupes = [...new Set(scanned.flatMap((s) => s.ids).filter((id, i, all) => all.indexOf(id) !== i))];
	if (dupes.length) throw new UsageError(`duplicate test id(s) in the specs: ${dupes.join(', ')} (every [ID] must be unique)`);
	let chosen = scanned;
	if (args.only.length) {
		// Validate against EVERY spec in scope, so a typo'd id is a usage error, never a silent 0/0.
		const known = new Set(scanned.flatMap((s) => s.ids));
		const unknown = args.only.filter((id) => !known.has(id));
		if (unknown.length) {
			throw new UsageError(`--only names unknown test id(s): ${unknown.join(', ')} (known: ${[...known].sort().join(', ') || 'none'})`);
		}
		chosen = scanned.filter((s) => s.ids.some((id) => args.only.includes(id)));
	}
	const ids = chosen.flatMap((s) => s.ids).filter((id) => !args.only.length || args.only.includes(id));
	return { files: chosen.map((s) => s.file), expectedIds: ids };
}

// ------------------------------------------------------------------------------ Obsidian
function semverKey(v) {
	return v.split('.').map((n) => Number(n) || 0);
}
function cmpSemver(a, b) {
	const [x, y] = [semverKey(a), semverKey(b)];
	for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
	return 0;
}

/** The version recorded in an Electron installer's resources/app.asar package.json (the asar
 *  header is JSON; file offsets are relative to the end of the header pickle). */
function installerVersionOf(binaryPath) {
	const asar = path.join(path.dirname(fs.realpathSync(binaryPath)), 'resources', 'app.asar');
	const fd = fs.openSync(asar, 'r');
	try {
		const head = Buffer.alloc(16);
		fs.readSync(fd, head, 0, 16, 0);
		const pickleSize = head.readUInt32LE(4);
		const jsonLen = head.readUInt32LE(12);
		const json = Buffer.alloc(jsonLen);
		fs.readSync(fd, json, 0, jsonLen, 16);
		const entry = JSON.parse(json.toString('utf8')).files['package.json'];
		const body = Buffer.alloc(entry.size);
		fs.readSync(fd, body, 0, entry.size, 8 + pickleSize + Number(entry.offset));
		return JSON.parse(body.toString('utf8')).version;
	} finally {
		fs.closeSync(fd);
	}
}

function resolveObsidian(mode) {
	if (mode === 'pinned') return { appVersion: PINNED, installerVersion: PINNED, label: `pinned app ${PINNED} + installer ${PINNED}` };
	const binary = '/usr/bin/obsidian';
	if (!fs.existsSync(binary)) throw new EnvError(`--obsidian=installed: no Obsidian at ${binary}`);
	const cfg = path.join(os.homedir(), '.config', 'obsidian');
	const asars = fs.existsSync(cfg) ? fs.readdirSync(cfg).filter((f) => /^obsidian-\d+\.\d+\.\d+\.asar$/.test(f)) : [];
	if (!asars.length) throw new EnvError('--obsidian=installed: no obsidian-*.asar in ~/.config/obsidian (open Obsidian once so it self-updates)');
	asars.sort((a, b) => cmpSemver(a.slice(9, -5), b.slice(9, -5)));
	const newest = asars.at(-1);
	const appVersion = newest.slice(9, -5);
	let installerVersion;
	try {
		installerVersion = installerVersionOf(binary);
	} catch (e) {
		throw new EnvError(`--obsidian=installed: could not read the installer version from ${binary}: ${e.message}`);
	}
	return {
		appVersion,
		installerVersion,
		binary,
		appPath: path.join(cfg, newest),
		label: `installed ${binary} (installer ${installerVersion}) + ${newest}`,
	};
}

// --------------------------------------------------------------------- processes / reaping
const spawned = []; // direct children we own (Xvfb, wdio)
let xvfbPid = 0; // kept out of the "leftover" count: it is torn down on purpose
const seen = new Map(); // pid -> starttime, every descendant ever observed under wdio
let runId = '';

function procStat(pid) {
	try {
		const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
		const rest = s.slice(s.lastIndexOf(')') + 2).split(' '); // fields from "state" on
		return { ppid: Number(rest[1]), start: rest[19] };
	} catch {
		return null;
	}
}

function allProcs() {
	const out = new Map();
	for (const d of fs.readdirSync('/proc')) {
		if (!/^\d+$/.test(d)) continue;
		const st = procStat(d);
		if (st) out.set(Number(d), st);
	}
	return out;
}

/** Add every current descendant of `rootPid` to `seen`. */
function trackDescendants(rootPid) {
	const procs = allProcs();
	const kids = new Map();
	for (const [pid, st] of procs) {
		if (!kids.has(st.ppid)) kids.set(st.ppid, []);
		kids.get(st.ppid).push(pid);
	}
	const stack = [rootPid];
	while (stack.length) {
		const p = stack.pop();
		for (const k of kids.get(p) ?? []) {
			seen.set(k, procs.get(k).start);
			stack.push(k);
		}
	}
}

/** PIDs of live processes (other than us) whose environment carries this run's id. */
function taggedPids() {
	const needle = `DSE_E2E_RUN_ID=${runId}\0`;
	const found = [];
	for (const d of fs.readdirSync('/proc')) {
		if (!/^\d+$/.test(d) || Number(d) === process.pid) continue;
		try {
			if (fs.readFileSync(`/proc/${d}/environ`, 'latin1').includes(needle)) found.push(Number(d));
		} catch {
			/* gone, or not ours */
		}
	}
	return found;
}

const alive = (pid, start) => {
	const st = procStat(pid);
	return st !== null && (start === undefined || st.start === start);
};

let reaped = 0;
/** Kill everything we started. Idempotent; safe at any point, including mid-startup.
 *  `withXvfb: false` leaves the display up (wdio's tree is reaped first, Xvfb last). */
async function reapAll(withXvfb = true) {
	const victims = new Map(); // pid -> starttime
	for (const [pid, start] of seen) victims.set(pid, start);
	if (runId) for (const pid of taggedPids()) if (!victims.has(pid)) victims.set(pid, procStat(pid)?.start);
	for (const c of spawned) if (c.pid && c.exitCode === null && c.signalCode === null) victims.set(c.pid, procStat(c.pid)?.start);
	victims.delete(process.pid);
	if (!withXvfb) victims.delete(xvfbPid);
	const live = () => [...victims].filter(([pid, start]) => start !== undefined && alive(pid, start));
	if (!live().length) return;
	if (withXvfb) {
		// the display going away is routine; only count genuine leftovers
		reaped += live().filter(([pid]) => pid !== xvfbPid).length;
	} else reaped += live().length;
	for (const [pid] of live()) {
		try {
			process.kill(pid, 'SIGTERM');
		} catch {
			/* already gone */
		}
	}
	for (let i = 0; i < 20 && live().length; i++) await sleep(150);
	for (const [pid] of live()) {
		try {
			process.kill(pid, 'SIGKILL');
		} catch {
			/* already gone */
		}
	}
	for (let i = 0; i < 10 && live().length; i++) await sleep(100);
}

// ------------------------------------------------------------------------------- Xvfb
function resolveXvfb() {
	if (process.env.XVFB_BIN && fs.existsSync(process.env.XVFB_BIN)) return process.env.XVFB_BIN;
	const onPath = spawnSync('which', ['Xvfb'], { encoding: 'utf8' });
	if (onPath.status === 0 && onPath.stdout.trim()) return onPath.stdout.trim();
	const devboxBin = path.join(repo, '.devbox', 'nix', 'profile', 'default', 'bin', 'Xvfb');
	if (fs.existsSync(devboxBin)) return devboxBin;
	const install = spawnSync('devbox', ['install'], { cwd: repo, stdio: 'inherit' });
	if (install.status === 0 && fs.existsSync(devboxBin)) return devboxBin;
	return null;
}

async function startXvfb() {
	const bin = resolveXvfb();
	if (!bin) throw new EnvError('Xvfb not found (set XVFB_BIN or run `devbox install` in draw-steel-elements)');
	for (let n = XVFB_RANGE[0]; n <= XVFB_RANGE[1]; n++) {
		if (fs.existsSync(`/tmp/.X11-unix/X${n}`) || fs.existsSync(`/tmp/.X${n}-lock`)) continue;
		// 1600x1200: Obsidian is asked for 1440x1100 and a window manager clamps to the screen.
		const child = spawn(bin, [`:${n}`, '-screen', '0', '1600x1200x24', '-nolisten', 'tcp'], {
			stdio: 'ignore',
			env: { ...process.env, DSE_E2E_RUN_ID: runId },
		});
		child.on('error', () => {});
		spawned.push(child);
		for (let i = 0; i < 40; i++) {
			if (child.exitCode !== null) break; // lost a race for this number; try the next
			if (fs.existsSync(`/tmp/.X11-unix/X${n}`)) {
				xvfbPid = child.pid;
				return { display: `:${n}`, child };
			}
			await sleep(100);
		}
		try {
			child.kill('SIGKILL');
		} catch {
			/* gone */
		}
	}
	throw new EnvError(`no free X display in :${XVFB_RANGE[0]}-:${XVFB_RANGE[1]}`);
}

// ----------------------------------------------------------------------------- results
function readJsonl(dir) {
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir)
		.filter((f) => f.endsWith('.jsonl'))
		.flatMap((f) =>
			fs
				.readFileSync(path.join(dir, f), 'utf8')
				.split('\n')
				.filter(Boolean)
				.map((l) => JSON.parse(l)),
		);
}

function mergeCoverage(runDir) {
	const pairs = new Map();
	for (const r of readJsonl(path.join(runDir, 'coverage'))) {
		const key = `${r.control}\u0000${r.kind}`;
		if (!pairs.has(key)) pairs.set(key, { control: r.control, kind: r.kind, tests: new Set() });
		pairs.get(key).tests.add(r.test);
	}
	const list = [...pairs.values()]
		.map((p) => ({ control: p.control, kind: p.kind, tests: [...p.tests].sort() }))
		.sort((a, b) => (a.control + a.kind).localeCompare(b.control + b.kind));
	const doc = { run: path.basename(runDir), pairs: list };
	fs.writeFileSync(path.join(runDir, 'coverage.json'), JSON.stringify(doc, null, 2));
	fs.writeFileSync(path.join(outRoot, 'coverage.json'), JSON.stringify(doc, null, 2));
	return list.length;
}

function pruneOldRuns(keep = 12) {
	try {
		const runs = fs
			.readdirSync(outRoot, { withFileTypes: true })
			.filter((e) => e.isDirectory() && /^\d{8}-\d{6}-/.test(e.name))
			.map((e) => e.name)
			.sort();
		for (const old of runs.slice(0, Math.max(0, runs.length - keep))) fs.rmSync(path.join(outRoot, old), { recursive: true, force: true });
	} catch {
		/* best effort */
	}
}

// --------------------------------------------------------------------------------- main
async function main() {
	const args = parseArgs(process.argv.slice(2));
	const { files, expectedIds } = discoverSpecs(args);
	const obs = resolveObsidian(args.obsidian);

	const cores = os.cpus().length;
	const shards = args.headed ? 1 : (args.shards ?? Math.max(1, Math.min(4, Math.floor(cores / 3))));
	const cache = path.resolve(process.env.OBSIDIAN_CACHE ?? path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'), 'dse-e2e-obsidian'));
	fs.mkdirSync(cache, { recursive: true });

	runId = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-')}-${randomBytes(2).toString('hex')}`;
	const runDir = path.join(outRoot, runId);
	fs.mkdirSync(runDir, { recursive: true });

	// Build first, like the lifecycle gate (npm run build-no-check = esbuild production).
	const build = spawnSync('npm', ['run', '--silent', 'build-no-check'], { cwd: repo, stdio: 'inherit' });
	if (build.status !== 0) throw new EnvError(`plugin build failed (npm run build-no-check exited ${build.status})`);
	const pluginDir = path.join(runDir, 'plugin');
	fs.mkdirSync(pluginDir, { recursive: true });
	for (const f of ['main.js', 'styles.css', 'manifest.json']) {
		if (!fs.existsSync(path.join(repo, f))) throw new EnvError(`missing built ${f} in ${repo}`);
		fs.copyFileSync(path.join(repo, f), path.join(pluginDir, f));
	}
	// The shipped product: no `"experimental": true` anywhere in data.json.
	fs.copyFileSync(path.join(here, 'vaults', 'plugin-data.shipped.json'), path.join(pluginDir, 'data.json'));

	let display;
	if (args.headed) {
		display = process.env.DSE_E2E_HEADED_DISPLAY || ':1';
		console.log(`${TAG} headed on display ${display}: windows WILL appear there. Do not touch the mouse or keyboard while it runs.`);
	} else {
		display = (await startXvfb()).display;
	}

	const wdioBin = path.join(repo, 'node_modules', '@wdio', 'cli', 'bin', 'wdio.js');
	if (!fs.existsSync(wdioBin)) throw new EnvError('node_modules/@wdio/cli is missing - run `npm ci`');

	// The child environment: an explicit DISPLAY, and none of the inherited ways to reach a
	// real screen.
	const env = { ...process.env };
	for (const k of ['DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE']) delete env[k];
	Object.assign(env, {
		DISPLAY: display,
		OBSIDIAN_CACHE: cache,
		DSE_E2E_RUN_ID: runId,
		DSE_E2E_RUN_DIR: runDir,
		DSE_E2E_CACHE: cache,
		DSE_E2E_PLUGIN_DIR: pluginDir,
		DSE_E2E_FIXTURE_VAULT: path.join(here, 'vaults', 'shipped'),
		DSE_E2E_SPECS: JSON.stringify(files),
		DSE_E2E_SHARDS: String(Math.min(shards, files.length) || 1),
		DSE_E2E_APP_VERSION: obs.appVersion,
		DSE_E2E_INSTALLER_VERSION: obs.installerVersion,
		DSE_E2E_HEADED: args.headed ? '1' : '0',
		DSE_E2E_SLOW: String(args.slow),
	});
	if (obs.binary) env.DSE_E2E_BINARY = obs.binary;
	if (obs.appPath) env.DSE_E2E_APP_PATH = obs.appPath;
	if (args.only.length) env.DSE_E2E_GREP = `\\[(?:${args.only.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\]`;

	console.log(
		`${TAG} start: ${obs.label}; display ${display}${args.headed ? ' (headed)' : ' (private Xvfb)'}; ${files.length} spec file(s), ${env.DSE_E2E_SHARDS} shard(s)${args.only.length ? `; only ${args.only.join(',')}` : ''}; run ${runId}`,
	);

	const wdio = spawn(process.execPath, [wdioBin, 'run', path.join(here, 'wdio.conf.mts')], {
		cwd: repo,
		env,
		stdio: ['ignore', 'inherit', 'inherit'],
	});
	spawned.push(wdio);
	const poll = setInterval(() => {
		if (wdio.pid) trackDescendants(wdio.pid);
	}, 400);
	const wdioCode = await new Promise((resolve) => {
		wdio.on('error', () => resolve(-1));
		wdio.on('exit', (code, sig) => resolve(code ?? (sig ? 128 : -1)));
	});
	clearInterval(poll);

	// ---- tally
	const results = readJsonl(path.join(runDir, 'results'));
	let ok = 0;
	let failed = 0;
	let known = 0;
	for (const r of results) {
		if (r.state !== 'passed') {
			failed++;
			console.log(`${TAG} ${r.id} FAIL: ${(r.error ?? r.state).split('\n')[0]} [bundle ${path.join(runDir, r.id)}]`);
		} else if (r.knownBug) {
			known++;
			console.log(`${TAG} ${r.id} known-bug ${r.knownBug} (${r.durationMs} ms)`);
		} else {
			ok++;
			console.log(`${TAG} ${r.id} ok (${r.durationMs} ms)`);
		}
	}
	// A beforeEach failure makes mocha skip the rest of its suite: those tests leave no result
	// line, so an id that was expected but never reported is a failure, never a silent skip.
	const reported = new Set(results.map((r) => r.id));
	for (const id of expectedIds) {
		if (!reported.has(id)) {
			failed++;
			console.log(`${TAG} ${id} FAIL: did not run (an earlier hook or session failure?)`);
		}
	}
	const total = results.length + expectedIds.filter((id) => !reported.has(id)).length;
	const pairs = mergeCoverage(runDir);
	console.log(`${TAG} done: ${ok}/${total} ok, ${failed} failed, ${known} known-bug`);
	console.log(`${TAG} coverage driven: ${pairs} (control, kind) pair(s) -> ${path.join(outRoot, 'coverage.json')}`);

	await reapAll(false);
	if (reaped) console.log(`${TAG} reaped ${reaped} leftover child process(es) that outlived wdio`);
	pruneOldRuns();

	if (failed > 0) return 1;
	if (wdioCode !== 0) {
		console.log(`${TAG} environment: wdio exited ${wdioCode} with no failing test recorded (a session failed to start, or a worker crashed)`);
		return 2;
	}
	if (results.length === 0) {
		console.log(`${TAG} environment: no tests ran`);
		return 2;
	}
	return 0;
}

let interrupted = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
	process.once(sig, async () => {
		if (interrupted) return;
		interrupted = true;
		console.log(`${TAG} environment: received ${sig}, cleaning up`);
		await reapAll();
		process.exit(2);
	});
}

let code = 2;
try {
	code = await main();
} catch (e) {
	if (e instanceof UsageError) {
		console.error(`${TAG} usage: ${e.message}`);
	} else if (e instanceof EnvError) {
		console.log(`${TAG} environment: ${e.message}`);
	} else {
		console.log(`${TAG} environment: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
	}
	code = 2;
} finally {
	await reapAll();
}
process.exit(interrupted ? 2 : code);
