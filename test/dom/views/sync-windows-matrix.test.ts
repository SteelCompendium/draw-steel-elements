// SC-441 — the two compendium windows crossed with every way out: each button, Escape (Obsidian's scope calls `onEscapeKey`), the X / a click
// outside / an owner's unload (all three are `close()`), in every phase. For each cell: WHICH callback fires, with what, EXACTLY ONCE, and that
// no way out falls through into a sync (the rule in the header of CompendiumMigrationModal.ts: the sync callbacks `syncAnyway` / `syncAfter`
// belong to their own labelled buttons and nothing else).
//
// ALREADY COVERED one case at a time by legacy-compendium-modal.test.ts and compendium-migration-modal.test.ts (not repeated as separate tests): the
// scaffold, focus, labels, each primary button once, a mid-run dismissal delivering the report, the error screen closing quietly. THIS file is the
// whole table, plus "exactly once" and "idempotent after the first answer".
import { CompendiumMigrationModal } from '@views/CompendiumMigrationModal';
import { LegacyCompendiumModal } from '@views/LegacyCompendiumModal';
import type { MigrationPhase, MigrationPlan, MigrationReport } from '@/data/CompendiumMigration';
import { App } from '../../mocks/obsidian';

const ROOT = 'DS Compendium';
const rename = (o: string, n: string, modified: boolean | null = false) => ({
	fromPath: `${ROOT}/${o}`, toPath: `${ROOT}/${n}`, oldRelative: o, newRelative: n, modified,
});
const plan: MigrationPlan = {
	root: ROOT,
	detection: { root: ROOT, filesInRoot: 9, legacyPaths: 8, newLayoutPaths: 0, isLegacyLayout: true },
	renames: [rename('Rules/Careers/Disciple.md', 'career/disciple.md'), rename('Rules/Careers/Sage.md', 'career/sage.md', true)],
	blocked: [{ fromPath: `${ROOT}/Rules/Careers/Agent.md`, toPath: `${ROOT}/career/agent.md` }],
	unmapped: [`${ROOT}/Rules/_Index.md`],
	backupCount: 1,
	backupFolder: `${ROOT} backup (pre-7.0.0)`,
};
const report = (aborted: boolean): MigrationReport => ({
	root: ROOT, mapRelease: 'v3.test', migrated: [rename('Rules/Careers/Disciple.md', 'career/disciple.md')],
	migratedModified: [], blocked: [], failed: [], unmapped: [], aborted, remaining: aborted ? 7 : 0, reportNotePath: null,
	backedUp: [], backupFolder: null,
});
const settle = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const click = (modal: { containerEl: HTMLElement }, id: string): void => {
	const el = modal.containerEl.querySelector<HTMLButtonElement>(`[data-dse-control="${id}"]`);
	if (!el) throw new Error(`no control ${id}`);
	el.click();
};
const escape = (modal: { onEscapeKey(e: KeyboardEvent): void }): void => modal.onEscapeKey(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

afterEach(() => { document.body.innerHTML = ''; });

// ---------------------------------------------------------------------------------------------- "Existing compendium folder found"

describe('"Existing compendium folder found": every way out', () => {
	const open = () => {
		const onChoice = jest.fn();
		const modal = new LegacyCompendiumModal(new App() as never, ROOT, onChoice);
		modal.open();
		return { modal, onChoice };
	};
	const CELLS: Array<[string, (m: LegacyCompendiumModal) => void, boolean[]]> = [
		['"Keep everything"', (m) => click(m, 'sync.legacy.keep'), [false]],
		['"Move old compendium to trash"', (m) => click(m, 'sync.legacy.trash'), [true]],
		['Escape', escape, []],
		['the X / a click outside / an unload (close())', (m) => m.close(), []],
	];
	test.each(CELLS)('%s: onChoice fires %j (exactly that, once), the window is gone, and nothing more fires on a second way out', (_name, act, calls) => {
		const { modal, onChoice } = open();
		act(modal);
		expect(onChoice.mock.calls.map((c) => c[0])).toEqual(calls);
		expect(document.body.contains(modal.containerEl)).toBe(false);
		escape(modal);
		modal.close();
		expect(onChoice.mock.calls.map((c) => c[0])).toEqual(calls);
	});
});

// ---------------------------------------------------------------------------------------------- the migration window

type Phase = 'preview' | 'running' | 'summary' | 'stopped' | 'error';
interface Rig {
	modal: CompendiumMigrationModal;
	cb: Record<'run' | 'decline' | 'syncAnyway' | 'finishRemaining' | 'syncAfter' | 'dismissed' | 'failed', jest.Mock>;
	aborted: () => boolean;
	finish: (r: MigrationReport) => Promise<void>;
}
async function rigAt(phase: Phase): Promise<Rig> {
	let resolveRun!: (r: MigrationReport) => void;
	let rejectRun!: (e: unknown) => void;
	let shouldAbort: () => boolean = () => false;
	const cb = {
		run: jest.fn((_p: (d: number, t: number, ph?: MigrationPhase) => void, abort: () => boolean) => {
			shouldAbort = abort;
			return new Promise<MigrationReport>((resolve, reject) => { resolveRun = resolve; rejectRun = reject; });
		}),
		decline: jest.fn(), syncAnyway: jest.fn(), finishRemaining: jest.fn(), syncAfter: jest.fn(), dismissed: jest.fn(), failed: jest.fn(),
	};
	const modal = new CompendiumMigrationModal(new App() as never, plan, cb);
	modal.open();
	const rig: Rig = {
		modal, cb, aborted: () => shouldAbort(),
		finish: async (r) => { resolveRun(r); await settle(); },
	};
	if (phase === 'preview') return rig;
	click(modal, 'migration.preview.move');
	if (phase === 'running') return rig;
	if (phase === 'error') { rejectRun(new Error('vault write refused')); await settle(); return rig; }
	await rig.finish(report(phase === 'stopped'));
	return rig;
}
const counts = (rig: Rig): Record<string, number> =>
	Object.fromEntries(Object.entries(rig.cb).map(([name, fn]) => [name, fn.mock.calls.length]));
const ZERO = { run: 0, decline: 0, syncAnyway: 0, finishRemaining: 0, syncAfter: 0, dismissed: 0, failed: 0 };
type Way = 'escape' | 'close';
const WAYS: Array<[string, Way]> = [['Escape', 'escape'], ['the X / a click outside / an unload (close())', 'close']];
const leave = (rig: Rig, way: Way): void => (way === 'escape' ? escape(rig.modal) : rig.modal.close());

describe('the migration window: every button, in every phase, fires exactly one callback', () => {
	// [phase, control id, the callbacks that fire (name -> arguments of the one call)]
	const BUTTONS: Array<[Phase, string, Record<string, unknown[]>]> = [
		['preview', 'migration.preview.not-now', { decline: [] }],
		['preview', 'migration.preview.sync-anyway', { syncAnyway: [] }],
		['preview', 'migration.preview.move', { run: [expect.any(Function), expect.any(Function)] }],
		['summary', 'migration.summary.close', { dismissed: [report(false)] }],
		['summary', 'migration.summary.sync-now', { syncAfter: [report(false)] }],
		['stopped', 'migration.stopped.close', { dismissed: [report(true)] }],
		['stopped', 'migration.stopped.finish', { finishRemaining: [report(true)] }],
		// `failed` fired when the error screen was drawn (the engine threw); closing it is quiet, so no callback FOLLOWS the button
		['error', 'migration.error.close', {}],
	];
	test.each(BUTTONS)('%s: %s', async (phase, id, fires) => {
		const rig = await rigAt(phase);
		const base = counts(rig);
		click(rig.modal, id);
		if (phase === 'error') expect(rig.cb.failed).toHaveBeenCalledTimes(1);
		const expected = { ...base };
		for (const name of Object.keys(fires)) expected[name] = base[name] + 1;
		expect(counts(rig)).toEqual(expected);
		for (const [name, args] of Object.entries(fires)) expect(rig.cb[name].mock.calls[rig.cb[name].mock.calls.length - 1]).toEqual(args);
		if (phase !== 'preview' || id !== 'migration.preview.move') {
			expect(document.body.contains(rig.modal.containerEl)).toBe(false);
			// a second way out after the answer fires nothing more
			const settled = counts(rig);
			escape(rig.modal);
			rig.modal.close();
			await settle();
			expect(counts(rig)).toEqual(settled);
		}
	});

	test('only the two labelled buttons can reach a sync: across every button of every phase, syncAnyway fires from "Sync without moving" alone and syncAfter from "Sync the compendium now" alone', async () => {
		for (const [phase, id] of BUTTONS.map(([p, i]) => [p, i] as const)) {
			const rig = await rigAt(phase);
			click(rig.modal, id);
			expect({ id, syncAnyway: rig.cb.syncAnyway.mock.calls.length > 0 }).toEqual({ id, syncAnyway: id === 'migration.preview.sync-anyway' });
			expect({ id, syncAfter: rig.cb.syncAfter.mock.calls.length > 0 }).toEqual({ id, syncAfter: id === 'migration.summary.sync-now' });
			document.body.innerHTML = '';
		}
	});
});

describe('the migration window: Escape and the X, in every phase', () => {
	const EXPECTED: Record<Phase, Record<string, number>> = {
		// at the preview a dismissal is an answer, the conservative one: `dismissed(null)` (main.ts turns it into "declined")
		preview: { ...ZERO, dismissed: 1 },
		// mid-run a dismissal tells the engine to stop; the report arrives later (see "mid-run" below)
		running: { ...ZERO, run: 1, dismissed: 1 },
		summary: { ...ZERO, run: 1, dismissed: 1 },
		stopped: { ...ZERO, run: 1, dismissed: 1 },
		// the error was already reported by `failed`: leaving the screen is quiet
		error: { ...ZERO, run: 1, failed: 1 },
	};
	const PHASES: Phase[] = ['preview', 'running', 'summary', 'stopped', 'error'];
	test.each(PHASES.flatMap((p) => WAYS.map(([name, way]) => [p, name, way] as const)))('%s, %s', async (phase, _name, way) => {
		const rig = await rigAt(phase);
		leave(rig, way);
		expect(counts(rig)).toEqual(EXPECTED[phase]);
		// never a sync, never a decline written by the window itself, never "finish"
		for (const never of ['syncAnyway', 'syncAfter', 'finishRemaining', 'decline']) expect(rig.cb[never]).not.toHaveBeenCalled();
		// the argument says WHICH dismissal it was
		if (phase === 'preview') expect(rig.cb.dismissed).toHaveBeenCalledWith(null);
		if (phase === 'summary') expect(rig.cb.dismissed).toHaveBeenCalledWith(report(false));
		if (phase === 'stopped') expect(rig.cb.dismissed).toHaveBeenCalledWith(report(true));
		// idempotent: leaving again, either way, fires nothing more
		const settled = counts(rig);
		escape(rig.modal);
		rig.modal.close();
		await settle();
		expect(counts(rig)).toEqual(settled);
	});

	test('mid-run: the dismissal stops the engine (shouldAbort turns true) and the report that arrives afterwards is delivered to `dismissed`, never to a sync', async () => {
		const rig = await rigAt('running');
		expect(rig.aborted()).toBe(false);
		escape(rig.modal);
		expect(rig.aborted()).toBe(true);
		await rig.finish(report(true));
		expect(rig.cb.dismissed).toHaveBeenLastCalledWith(report(true));
		for (const never of ['syncAnyway', 'syncAfter', 'finishRemaining', 'decline']) expect(rig.cb[never]).not.toHaveBeenCalled();
	});

	test('a run that throws after the window was dismissed still reports through `failed`, once, and never through a sync', async () => {
		let rejectRun!: (e: unknown) => void;
		const cb = {
			run: jest.fn(() => new Promise<MigrationReport>((_r, reject) => { rejectRun = reject; })),
			decline: jest.fn(), syncAnyway: jest.fn(), finishRemaining: jest.fn(), syncAfter: jest.fn(), dismissed: jest.fn(), failed: jest.fn(),
		};
		const modal = new CompendiumMigrationModal(new App() as never, plan, cb);
		modal.open();
		click(modal, 'migration.preview.move');
		modal.close();
		rejectRun(new Error('late failure'));
		await settle();
		expect(cb.failed).toHaveBeenCalledTimes(1);
		for (const never of ['syncAnyway', 'syncAfter', 'finishRemaining', 'decline']) expect(cb[never as keyof typeof cb]).not.toHaveBeenCalled();
	});
});

describe('the migration window: Stop and the path lists', () => {
	test('Stop fires no callback of its own: it flips shouldAbort, disables itself and keeps the window open; a second press does nothing', async () => {
		const rig = await rigAt('running');
		const before = counts(rig);
		click(rig.modal, 'migration.running.stop');
		expect(rig.aborted()).toBe(true);
		expect(counts(rig)).toEqual(before);
		expect(document.body.contains(rig.modal.containerEl)).toBe(true);
		const stop = rig.modal.containerEl.querySelector<HTMLButtonElement>('[data-dse-control="migration.running.stop"]')!;
		expect(stop.disabled).toBe(true);
		stop.click(); // a click on a disabled button is not delivered
		expect(counts(rig)).toEqual(before);
	});

	test('a stopped run: Stop, then the engine\'s report, offers "Finish moving the remaining N" and never a sync', async () => {
		const rig = await rigAt('running');
		click(rig.modal, 'migration.running.stop');
		await rig.finish(report(true));
		expect(rig.modal.containerEl.querySelector('[data-dse-control="migration.stopped.finish"]')).not.toBeNull();
		expect(rig.modal.containerEl.querySelector('[data-dse-control="migration.summary.sync-now"]')).toBeNull();
		expect(rig.modal.containerEl.querySelector('[data-dse-control="migration.preview.sync-anyway"]')).toBeNull();
	});

	test('a list header toggles its list open and shut and fires no callback', async () => {
		const full: MigrationReport = {
			...report(false), migratedModified: [rename('a.md', 'b.md', true)], blocked: [{ fromPath: 'x', toPath: 'y' }],
			failed: [{ fromPath: 'f', toPath: 'g', error: 'refused' }], unmapped: ['u.md'],
			backedUp: [{ fromPath: `${ROOT}/a.md`, backupPath: 'backup/a.md' }], backupFolder: 'backup',
		};
		const rig = await rigAt('running');
		await rig.finish(full);
		const before = counts(rig);
		for (const id of ['backed-up', 'moved-modified', 'blocked', 'failed', 'unmapped']) {
			const header = rig.modal.containerEl.querySelector<HTMLButtonElement>(`[data-dse-control="migration.list.${id}"]`)!;
			expect(header.getAttribute('aria-expanded')).toBe('false');
			header.click();
			expect(header.getAttribute('aria-expanded')).toBe('true');
			header.click();
			expect(header.getAttribute('aria-expanded')).toBe('false');
		}
		expect(counts(rig)).toEqual(before);
		expect(document.body.contains(rig.modal.containerEl)).toBe(true);
	});
});
