import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// SC-546 — scripts/xvfb-owned.mjs: a runner only uses an X display whose Xvfb it started itself.
// The helper is ESM (.mjs) and this repo's jest config has no ESM support, so — the same pattern as
// checkNoDynamicScript.test.ts — each case runs a small module script in a real `node` subprocess
// and reads back one JSON line. The Xvfb is a fake shell script that mimics the measured behaviour of
// the real one (Xvfb 21.1.24): a winner writes "<n>\n" to fd 3 and keeps running; a server that lost
// the race for :n exits 1 WITHOUT writing; and a stuck one never writes. No real X server is needed.

const repoRoot = path.resolve(__dirname, '../../..');
const helper = path.join(repoRoot, 'scripts/xvfb-owned.mjs');

let dir: string;
let fakeBin: string;
let argLog: string;

beforeAll(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dse-xvfb-owned-test-'));
	fakeBin = path.join(dir, 'fake-xvfb.sh');
	argLog = path.join(dir, 'args.log');
	fs.writeFileSync(
		fakeBin,
		[
			'#!/bin/sh',
			'n="${1#:}"',
			'echo "$*" >> "$FAKE_ARG_LOG"',
			'case ",$FAKE_LOST," in *",$n,"*) exit 1;; esac', // lost the race: exits, writes nothing
			'case ",$FAKE_STUCK," in *",$n,"*) exec sleep 30;; esac', // alive, never says it listens
			'case ",$FAKE_WRONG," in *",$n,"*) printf "9999\\n" >&3; exec sleep 30;; esac', // says a number that is not ours
			'printf "%s\\n" "$n" >&3',
			'exec sleep 30',
			'',
		].join('\n'),
		{ mode: 0o755 },
	);
});

afterAll(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

interface Outcome {
	display: string | null;
	num?: number;
	childAlive?: boolean;
	spawned: number[];
	args: string[];
	error: string | null;
}

/** Runs startOwnedXvfb against the fake server in a node subprocess. `options` is JS source for extra options. */
function run(candidates: number[], fake: { lost?: number[]; stuck?: number[]; wrong?: number[] }, options = '', bin = fakeBin): Outcome {
	fs.writeFileSync(argLog, '');
	const code = `
		import { startOwnedXvfb } from ${JSON.stringify(helper)};
		const spawned = [];
		let got = null, error = null;
		try { got = await startOwnedXvfb({
			bin: ${JSON.stringify(bin)},
			candidates: ${JSON.stringify(candidates)},
			args: ['-screen', '0', '1600x1200x24'],
			isTaken: () => false,
			hasSocket: () => true,
			onSpawn: (c, n) => spawned.push(n),
			${options}
		}); } catch (e) { error = e.constructor.name + ': ' + e.message; }
		const out = { display: got?.display ?? null, num: got?.num, childAlive: got ? got.child.exitCode === null : undefined, spawned, error };
		console.log(JSON.stringify(out));
		got?.child.kill('SIGKILL');
	`;
	const stdout = execFileSync('node', ['--input-type=module', '-e', code], {
		cwd: repoRoot,
		encoding: 'utf8',
		env: { ...process.env, FAKE_ARG_LOG: argLog, FAKE_LOST: (fake.lost ?? []).join(','), FAKE_STUCK: (fake.stuck ?? []).join(','), FAKE_WRONG: (fake.wrong ?? []).join(',') },
	});
	const out = JSON.parse(stdout.trim().split('\n').pop() as string) as Outcome;
	out.args = fs.readFileSync(argLog, 'utf8').split('\n').filter(Boolean);
	return out;
}

describe('SC-546: startOwnedXvfb', () => {
	test('returns the display once OUR server wrote its number, and passes :n, the caller args and -displayfd 3', () => {
		const out = run([5301, 5302], {});
		expect(out.display).toBe(':5301');
		expect(out.num).toBe(5301);
		expect(out.childAlive).toBe(true);
		expect(out.spawned).toEqual([5301]);
		expect(out.args).toEqual([':5301 -screen 0 1600x1200x24 -displayfd 3']);
	});

	test('a number whose server lost the race (exits without writing) is NOT ours: the next number is tried', () => {
		const out = run([5301, 5302, 5303], { lost: [5301, 5302] });
		expect(out.display).toBe(':5303');
		expect(out.spawned).toEqual([5301, 5302, 5303]);
	});

	test('a server that stays alive but never writes is not ours: it is killed after the per-start timeout and the next number is tried', () => {
		const out = run([5301, 5302], { stuck: [5301] }, 'startTimeoutMs: 300,');
		expect(out.display).toBe(':5302');
		expect(out.spawned).toEqual([5301, 5302]);
	});

	test('returns null when no candidate yields a display of our own', () => {
		const out = run([5301, 5302], { lost: [5301, 5302] });
		expect(out.display).toBeNull();
		expect(out.spawned).toEqual([5301, 5302]);
	});

	test('numbers the pre-check calls taken are skipped without spawning anything', () => {
		const out = run([5301, 5302], {}, 'isTaken: (n) => n === 5301,');
		expect(out.display).toBe(':5302');
		expect(out.spawned).toEqual([5302]);
	});

	test('the overall bound stops the search: a stuck server cannot hold the caller past totalTimeoutMs', () => {
		const out = run([5301, 5302, 5303], { stuck: [5301, 5302, 5303] }, 'startTimeoutMs: 10000, totalTimeoutMs: 400,');
		expect(out.display).toBeNull();
		expect(out.spawned).toEqual([5301]);
	});

	test('a server that writes a number other than its own is not ours: the next number is tried', () => {
		const out = run([5301, 5302], { wrong: [5301] });
		expect(out.display).toBe(':5302');
		expect(out.spawned).toEqual([5301, 5302]);
	});

	test('the belt: a server that wrote its number but whose socket is not there is not ours (null)', () => {
		const out = run([5301, 5302], {}, 'hasSocket: () => false,');
		expect(out.display).toBeNull();
		expect(out.spawned).toEqual([5301, 5302]);
	});

	test('shouldStop is checked before every spawn: once it turns true no further number is started', () => {
		const out = run([5301, 5302, 5303], { lost: [5301, 5302, 5303] }, 'shouldStop: () => spawned.length >= 2,');
		expect(out.display).toBeNull();
		expect(out.spawned).toEqual([5301, 5302]);
	});

	test('a binary that cannot be executed fails fast with an error naming it, instead of trying every number until the timeouts', () => {
		const notExecutable = path.join(dir, 'not-executable');
		fs.writeFileSync(notExecutable, '#!/bin/sh\n', { mode: 0o644 });
		for (const bin of [notExecutable, path.join(dir, 'does-not-exist')]) {
			const t0 = Date.now();
			const out = run([5301, 5302, 5303], {}, '', bin);
			expect(Date.now() - t0).toBeLessThan(5000);
			expect(out.display).toBeNull();
			expect(out.spawned).toEqual([5301]);
			expect(out.error).toContain(`XvfbSpawnError: could not execute ${bin}: `);
		}
	});
});
