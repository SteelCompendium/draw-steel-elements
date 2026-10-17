// SC-408 e2e driver: per-worker, per-test mutable state shared by dse.ts, the root hooks
// (session.ts), the invariants and the failure artifacts. A worker is one process running one
// spec file against one Obsidian, so module-level state is per session.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { E2E } from './env';

export interface Drive {
	control: string;
	kind: string;
}

export const state = {
	/** Recorder counter at the start of the current test's page activity (events after this count). */
	mark: 0,
	/** Notes this test opened; invariants check their integrity against the fixture. */
	touched: new Set<string>(),
	testTitle: '',
	testId: '',
	drove: [] as Drive[],
	/** What the current test body threw (set by the session wrapper). */
	error: undefined as unknown,
};

/** `[STAM-D01] ...` -> `STAM-D01`; falls back to a slug of the title. */
export function testIdOf(title: string): string {
	const m = /\[([A-Z][A-Z0-9]*-[A-Za-z0-9]+)\]/.exec(title);
	if (m) return m[1];
	return (
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 60) || 'test'
	);
}

export function resetTestState(title: string): void {
	state.mark = 0;
	state.touched.clear();
	state.testTitle = title;
	state.testId = testIdOf(title);
	state.drove = [];
	state.error = undefined;
}

/** Append one line to a per-worker jsonl under the run dir (run.mjs merges them afterwards). */
export function appendRunLine(sub: string, record: unknown): void {
	const dir = path.join(E2E.runDir, sub);
	fs.mkdirSync(dir, { recursive: true });
	fs.appendFileSync(path.join(dir, `${process.pid}.jsonl`), JSON.stringify(record) + '\n');
}

/** Coverage: every (control, interaction kind) the driver actually drove, for the P2 gate. */
export function recordDrive(control: string, kind: string): void {
	state.drove.push({ control, kind });
	appendRunLine('coverage', { control, kind, test: state.testId });
}

export function readFixture(rel: string): string {
	return fs.readFileSync(path.join(E2E.fixtureVault, rel), 'utf8');
}
