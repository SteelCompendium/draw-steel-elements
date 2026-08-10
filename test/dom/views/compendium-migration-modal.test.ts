// SC-125 — CompendiumMigrationModal on the kit managedModal: the dry-run preview,
// the running phase with its Stop button, and the summary. Same test shape as
// legacy-compendium-modal.test.ts.
//
// What these tests are really guarding: the user is told the size of the change and
// that nothing is deleted BEFORE anything happens, and "Not now" is the default.
import * as fs from 'fs';
import * as path from 'path';
import { CompendiumMigrationModal } from '@views/CompendiumMigrationModal';
import type { MigrationPhase, MigrationPlan, MigrationReport } from '@/data/CompendiumMigration';
import { App } from '../../mocks/obsidian';
import { styleGuardFindings } from '../kit/styleGuard';

const ROOT = 'DS Compendium';

function rename(oldRelative: string, newRelative: string, modified: boolean | null = false) {
	return {
		fromPath: `${ROOT}/${oldRelative}`,
		toPath: `${ROOT}/${newRelative}`,
		oldRelative,
		newRelative,
		modified,
	};
}

function makePlan(overrides: Partial<MigrationPlan> = {}): MigrationPlan {
	return {
		root: ROOT,
		detection: { root: ROOT, filesInRoot: 9, legacyPaths: 8, newLayoutPaths: 0, isLegacyLayout: true },
		renames: [
			rename('Rules/Careers/Disciple.md', 'career/disciple.md'),
			rename('Rules/Careers/Sage.md', 'career/sage.md', true),
		],
		blocked: [{ fromPath: `${ROOT}/Rules/Careers/Agent.md`, toPath: `${ROOT}/career/agent.md` }],
		unmapped: [`${ROOT}/Rules/_Index.md`],
		backupCount: 1,
		backupFolder: `${ROOT} backup (pre-7.0.0)`,
		...overrides,
	};
}

function emptyReport(overrides: Partial<MigrationReport> = {}): MigrationReport {
	return {
		root: ROOT,
		mapRelease: 'v3.20260403152914',
		migrated: [],
		migratedModified: [],
		blocked: [],
		failed: [],
		unmapped: [],
		aborted: false,
		remaining: 0,
		reportNotePath: null,
		backedUp: [],
		backupFolder: null,
		...overrides,
	};
}

function makeModal(plan = makePlan(), report = emptyReport()) {
	let resolveRun!: (report: MigrationReport) => void;
	let rejectRun!: (error: unknown) => void;
	const runCalls: Array<{
		onProgress: (done: number, total: number, phase?: MigrationPhase) => void;
		shouldAbort: () => boolean;
	}> = [];
	const callbacks = {
		run: jest.fn((
			onProgress: (done: number, total: number, phase?: MigrationPhase) => void,
			shouldAbort: () => boolean,
		) => {
			runCalls.push({ onProgress, shouldAbort });
			return new Promise<MigrationReport>((resolve, reject) => {
				resolveRun = resolve;
				rejectRun = reject;
			});
		}),
		decline: jest.fn(),
		syncAnyway: jest.fn(),
		finishRemaining: jest.fn(),
		syncAfter: jest.fn(),
		dismissed: jest.fn(),
		failed: jest.fn(),
	};
	const modal = new CompendiumMigrationModal(new App() as any, plan, callbacks);
	modal.open();
	const container = (modal as any).containerEl as HTMLElement;
	return {
		modal, container, callbacks, runCalls,
		finishRun: () => resolveRun(report),
		failRun: (error: unknown) => rejectRun(error),
	};
}

function footerBtn(container: HTMLElement, label: string): HTMLButtonElement {
	const el = container.querySelector<HTMLButtonElement>(
		`.dse-modal__footer button[aria-label="${label}"]`,
	);
	if (!el) throw new Error(`no footer button [aria-label="${label}"]`);
	return el;
}

const bodyText = (container: HTMLElement) =>
	(container.querySelector('.dse-modal__body') as HTMLElement).textContent ?? '';

afterEach(() => {
	document.body.innerHTML = '';
	jest.clearAllMocks();
});

describe('CompendiumMigrationModal — preview', () => {
	test('is a kit DseModal with the title wired via aria-labelledby', () => {
		const { container } = makeModal();
		expect(container.classList.contains('dse-modal')).toBe(true);
		const titleEl = container.querySelector('.dse-modal__title') as HTMLElement;
		expect(titleEl.textContent).toBe('Move your compendium to the 7.0.0 layout');
		expect(container.getAttribute('aria-labelledby')).toBe(titleEl.id);
	});

	test('states every number in the plan before anything happens, and that nothing is deleted', () => {
		const { container, callbacks } = makeModal();
		const text = bodyText(container);
		expect(text).toContain('2 file(s) will be moved');
		expect(text).toContain(ROOT);
		expect(text).toContain('1 of them do not match the final legacy release');
		expect(text).toContain('1 cannot move because something already sits at the new path');
		expect(text).toContain('1 file(s) have no 7.0.0 counterpart');
		expect(text).toContain('Nothing is deleted');
		// Scott's approval condition: the backup must be stated BEFORE the user confirms.
		expect(text).toContain('1 file(s) — every one whose contents do not match');
		expect(text).toContain('DS Compendium backup (pre-7.0.0)');
		expect(callbacks.run).not.toHaveBeenCalled();
	});

	test('shows real old → new pairs, not a vague promise', () => {
		const { container } = makeModal();
		const sample = container.querySelector('.dse-migration__sample') as HTMLElement;
		expect(sample.textContent).toContain('Rules/Careers/Disciple.md  →  career/disciple.md');
	});

	test('caps the sample and says how many more there are', () => {
		const renames = Array.from({ length: 20 }, (_, i) => rename(`Old/${i}.md`, `new/${i}.md`));
		const { container } = makeModal(makePlan({ renames }));
		const sample = container.querySelector('.dse-migration__sample') as HTMLElement;
		expect(sample.children).toHaveLength(7); // 6 pairs + the "and N more" line
		expect(sample.textContent).toContain('…and 14 more.');
	});

	test('initial focus lands on "Not now" — the safe default', () => {
		const { container } = makeModal();
		expect(document.activeElement).toBe(footerBtn(container, 'Not now'));
	});

	test('"Not now" closes and declines — it never runs, and never syncs', () => {
		const { container, callbacks } = makeModal();
		footerBtn(container, 'Not now').click();
		expect(callbacks.decline).toHaveBeenCalledTimes(1);
		expect(callbacks.run).not.toHaveBeenCalled();
		expect(callbacks.syncAnyway).not.toHaveBeenCalled();
		expect(callbacks.syncAfter).not.toHaveBeenCalled();
		expect(document.body.contains(container)).toBe(false);
	});

	test('H2 — syncing without migrating is its own labelled, danger-variant button', () => {
		const { container, callbacks } = makeModal();
		const button = footerBtn(container, 'Sync without moving (links will break)');
		expect(button.classList.contains('dse-btn--danger')).toBe(true);
		button.click();
		expect(callbacks.syncAnyway).toHaveBeenCalledTimes(1);
		expect(callbacks.decline).not.toHaveBeenCalled();
	});

	test('H2 — the preview says out loud that syncing first is a one-way door', () => {
		const { container } = makeModal();
		expect(bodyText(container)).toContain('one-way door');
	});

	test('M2 — Escape at the preview is a dismissal, not consent', () => {
		const { modal, callbacks } = makeModal();
		modal.close(); // what Obsidian's Escape handler does
		expect(callbacks.dismissed).toHaveBeenCalledWith(null);
		expect(callbacks.run).not.toHaveBeenCalled();
		expect(callbacks.syncAnyway).not.toHaveBeenCalled();
		expect(callbacks.syncAfter).not.toHaveBeenCalled();
	});

	test('the move button is disabled — the REAL property — when there is nothing to move', () => {
		const { container } = makeModal(makePlan({ renames: [] }));
		expect(footerBtn(container, 'Move 0 file(s)').disabled).toBe(true);
	});
});

describe('CompendiumMigrationModal — running', () => {
	test('a plan with nothing to back up says so instead of naming a folder', () => {
		const { container } = makeModal(makePlan({ backupCount: 0 }));
		expect(bodyText(container)).toContain('No backup folder is needed');
	});

	test('the move button starts the run and the dialog switches to progress', () => {
		const { container, callbacks } = makeModal();
		footerBtn(container, 'Move 2 file(s)').click();
		expect(callbacks.run).toHaveBeenCalledTimes(1);
		expect((container.querySelector('.dse-modal__title') as HTMLElement).textContent)
			.toBe('Moving your compendium…');
		expect(bodyText(container)).toContain('0 / 1 backed up');
	});

	test('progress callbacks update the line in place, and name the phase', () => {
		const { container, runCalls } = makeModal();
		footerBtn(container, 'Move 2 file(s)').click();
		expect(bodyText(container)).toContain('0 / 1 backed up'); // backup runs first
		runCalls[0].onProgress(1, 1, 'backup');
		expect(bodyText(container)).toContain('1 / 1 backed up');
		runCalls[0].onProgress(1, 2, 'move');
		expect(bodyText(container)).toContain('1 / 2 moved');
	});

	test('Stop flips shouldAbort() and disables itself — the engine polls, the modal does not kill anything', () => {
		const { container, runCalls } = makeModal();
		footerBtn(container, 'Move 2 file(s)').click();
		expect(runCalls[0].shouldAbort()).toBe(false);
		const stop = footerBtn(container, 'Stop');
		stop.click();
		expect(runCalls[0].shouldAbort()).toBe(true);
		expect(footerBtn(container, 'Stopping…').disabled).toBe(true);
	});
});

describe('CompendiumMigrationModal — summary', () => {
	async function settle(finishRun: () => void) {
		finishRun();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
	}

	test('reports what moved and hands control back with syncAfter()', async () => {
		const report = emptyReport({
			migrated: [rename('Rules/Careers/Disciple.md', 'career/disciple.md')],
			migratedModified: [rename('Rules/Careers/Sage.md', 'career/sage.md', true)],
			blocked: [{ fromPath: 'a', toPath: 'b' }],
			unmapped: ['c'],
			reportNotePath: 'Draw Steel Elements migration report 2026-08-10 1200.md',
		});
		const { container, callbacks, finishRun } = makeModal(makePlan(), report);
		footerBtn(container, 'Move 2 file(s)').click();
		await settle(finishRun);

		expect((container.querySelector('.dse-modal__title') as HTMLElement).textContent)
			.toBe('Compendium moved');
		const text = bodyText(container);
		expect(text).toContain('1 file(s) moved; links updated by Obsidian.');
		expect(text).toContain('old, now-empty folders are left behind on purpose');
		expect(text).toContain('Draw Steel Elements migration report 2026-08-10 1200.md');

		footerBtn(container, 'Sync the compendium now').click();
		expect(callbacks.syncAfter).toHaveBeenCalledWith(report);
		expect(document.body.contains(container)).toBe(false);
	});

	test('says where the backups went, and lists them', async () => {
		const report = emptyReport({
			migrated: [rename('Rules/Careers/Sage.md', 'career/sage.md', true)],
			backedUp: [{
				fromPath: `${ROOT}/Rules/Careers/Sage.md`,
				backupPath: `${ROOT} backup (pre-7.0.0)/Rules/Careers/Sage.md`,
			}],
			backupFolder: `${ROOT} backup (pre-7.0.0)`,
		});
		const { container, finishRun } = makeModal(makePlan(), report);
		footerBtn(container, 'Move 2 file(s)').click();
		await settle(finishRun);
		const text = bodyText(container);
		expect(text).toContain('1 file(s) were copied to "DS Compendium backup (pre-7.0.0)"');
		expect(text).toContain('Delete that folder yourself');
		expect(text).toContain('DS Compendium backup (pre-7.0.0)/Rules/Careers/Sage.md');
	});

	test('a run that needed no backup says so rather than staying silent', async () => {
		const report = emptyReport({ migrated: [rename('a.md', 'b.md')] });
		const { container, finishRun } = makeModal(makePlan(), report);
		footerBtn(container, 'Move 2 file(s)').click();
		await settle(finishRun);
		expect(bodyText(container)).toContain('No backup was needed');
	});

	test('H3 — the actual PATHS are in the dialog, not just the counts', async () => {
		const report = emptyReport({
			migrated: [rename('Rules/Careers/Disciple.md', 'career/disciple.md')],
			migratedModified: [rename('Rules/Careers/Sage.md', 'career/sage.md', true)],
			blocked: [{ fromPath: 'DS/Old/Thing.md', toPath: 'DS/new/thing.md' }],
			failed: [{ fromPath: 'DS/Old/Broken.md', toPath: 'DS/new/broken.md', error: 'nope' }],
			unmapped: ['DS/Rules/_Index.md'],
		});
		const { container, finishRun } = makeModal(makePlan(), report);
		footerBtn(container, 'Move 2 file(s)').click();
		await settle(finishRun);

		const text = bodyText(container);
		expect(text).toContain('DS Compendium/career/sage.md');
		expect(text).toContain('DS/Old/Thing.md');
		expect(text).toContain('DS/new/thing.md');
		expect(text).toContain('DS/Old/Broken.md');
		expect(text).toContain('nope');
		expect(text).toContain('DS/Rules/_Index.md');
	});

	test('H3 — long lists are capped in the dialog and point at the report note', async () => {
		const unmapped = Array.from({ length: 60 }, (_, i) => `DS/leftover-${i}.md`);
		const report = emptyReport({ migrated: [rename('a.md', 'b.md')], unmapped });
		const { container, finishRun } = makeModal(makePlan(), report);
		footerBtn(container, 'Move 2 file(s)').click();
		await settle(finishRun);
		expect(bodyText(container)).toContain('…and 20 more — see the report note.');
	});

	test('H2 — an aborted run offers to FINISH, and does not offer a sync at all', async () => {
		const report = emptyReport({
			aborted: true,
			remaining: 7,
			migrated: [rename('Rules/Careers/Disciple.md', 'career/disciple.md')],
		});
		const { container, callbacks, finishRun } = makeModal(makePlan(), report);
		footerBtn(container, 'Move 2 file(s)').click();
		await settle(finishRun);

		expect((container.querySelector('.dse-modal__title') as HTMLElement).textContent)
			.toBe('Migration stopped');
		const text = bodyText(container);
		expect(text).toContain('7 file(s) not moved');
		expect(text).toContain('a sync creates the new files');
		expect(container.querySelector('button[aria-label="Sync the compendium now"]')).toBeNull();

		footerBtn(container, 'Finish moving the remaining 7').click();
		expect(callbacks.finishRemaining).toHaveBeenCalledWith(report);
		expect(callbacks.syncAfter).not.toHaveBeenCalled();
	});

	test('M2 — dismissing DURING the run still delivers the report to the caller', async () => {
		const report = emptyReport({ migrated: [rename('a.md', 'b.md')], aborted: true, remaining: 3 });
		const { modal, container, callbacks, runCalls, finishRun } = makeModal(makePlan(), report);
		footerBtn(container, 'Move 2 file(s)').click();
		modal.close(); // Escape mid-run
		expect(runCalls[0].shouldAbort()).toBe(true); // the engine is told to stop
		await settle(finishRun);
		expect(callbacks.dismissed).toHaveBeenLastCalledWith(report);
		expect(callbacks.syncAfter).not.toHaveBeenCalled();
	});

	test('"Close" on a completed run reports the dismissal and never syncs', async () => {
		const report = emptyReport({ migrated: [rename('a.md', 'b.md')] });
		const { container, callbacks, finishRun } = makeModal(makePlan(), report);
		footerBtn(container, 'Move 2 file(s)').click();
		await settle(finishRun);
		footerBtn(container, 'Close').click();
		expect(callbacks.dismissed).toHaveBeenCalledWith(report);
		expect(callbacks.syncAfter).not.toHaveBeenCalled();
	});
});

describe('CompendiumMigrationModal — the run throws', () => {
	async function settle() {
		for (let i = 0; i < 4; i++) await Promise.resolve();
	}

	test('an infrastructure error ends in an error state, not a dialog stuck on "Moving…"', async () => {
		const { container, callbacks, failRun } = makeModal();
		footerBtn(container, 'Move 2 file(s)').click();
		expect((container.querySelector('.dse-modal__title') as HTMLElement).textContent)
			.toBe('Moving your compendium…');

		failRun(new Error('vault write refused'));
		await settle();

		expect((container.querySelector('.dse-modal__title') as HTMLElement).textContent)
			.toBe('Migration could not finish');
		const text = bodyText(container);
		expect(text).toContain('vault write refused');
		expect(text).toContain('stayed moved');
		expect(text).toContain('Do not sync the compendium first');
		expect(callbacks.failed).toHaveBeenCalledTimes(1);
		// It must NOT look like a success, and must not offer the door-closing sync.
		expect(container.querySelector('button[aria-label="Sync the compendium now"]')).toBeNull();
		footerBtn(container, 'Close').click();
		expect(document.body.contains(container)).toBe(false);
		// The failure was already reported once — closing must not also fire the
		// dismissal path and stack a second, contradictory Notice on top of it.
		expect(callbacks.dismissed).not.toHaveBeenCalled();
		expect(callbacks.decline).not.toHaveBeenCalled();
	});

	test('Escape from the error screen closes quietly — the error was already reported', async () => {
		const { modal, container, callbacks, failRun } = makeModal();
		footerBtn(container, 'Move 2 file(s)').click();
		failRun(new Error('vault write refused'));
		await settle();
		modal.close();
		expect(callbacks.failed).toHaveBeenCalledTimes(1);
		expect(callbacks.dismissed).not.toHaveBeenCalled();
	});
});

describe('CompendiumMigrationModal — source hygiene', () => {
	test('imports the kit and passes the style guard (zero literals, zero el.style.color)', () => {
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/views/CompendiumMigrationModal.ts'),
			'utf8',
		);
		expect(src).toMatch(/from '@\/framework\/kit'/);
		expect(styleGuardFindings(src)).toEqual([]);
	});
});
