// SC-125 — CompendiumMigrationModal on the kit managedModal: the dry-run preview,
// the running phase with its Stop button, and the summary. Same test shape as
// legacy-compendium-modal.test.ts.
//
// What these tests are really guarding: the user is told the size of the change and
// that nothing is deleted BEFORE anything happens, and "Not now" is the default.
import * as fs from 'fs';
import * as path from 'path';
import { CompendiumMigrationModal } from '@views/CompendiumMigrationModal';
import type { MigrationPlan, MigrationReport } from '@/data/CompendiumMigration';
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
		...overrides,
	};
}

function makeModal(plan = makePlan(), report = emptyReport()) {
	let resolveRun!: (report: MigrationReport) => void;
	const runCalls: Array<{
		onProgress: (done: number, total: number) => void;
		shouldAbort: () => boolean;
	}> = [];
	const callbacks = {
		run: jest.fn((onProgress: (done: number, total: number) => void, shouldAbort: () => boolean) => {
			runCalls.push({ onProgress, shouldAbort });
			return new Promise<MigrationReport>((resolve) => {
				resolveRun = resolve;
			});
		}),
		skip: jest.fn(),
		done: jest.fn(),
	};
	const modal = new CompendiumMigrationModal(new App() as any, plan, callbacks);
	modal.open();
	const container = (modal as any).containerEl as HTMLElement;
	return { modal, container, callbacks, runCalls, finishRun: () => resolveRun(report) };
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

	test('"Not now" closes and calls skip(), never run()', () => {
		const { container, callbacks } = makeModal();
		footerBtn(container, 'Not now').click();
		expect(callbacks.skip).toHaveBeenCalledTimes(1);
		expect(callbacks.run).not.toHaveBeenCalled();
		expect(document.body.contains(container)).toBe(false);
	});

	test('the move button is disabled — the REAL property — when there is nothing to move', () => {
		const { container } = makeModal(makePlan({ renames: [] }));
		expect(footerBtn(container, 'Move 0 file(s)').disabled).toBe(true);
	});
});

describe('CompendiumMigrationModal — running', () => {
	test('the move button starts the run and the dialog switches to progress', () => {
		const { container, callbacks } = makeModal();
		footerBtn(container, 'Move 2 file(s)').click();
		expect(callbacks.run).toHaveBeenCalledTimes(1);
		expect((container.querySelector('.dse-modal__title') as HTMLElement).textContent)
			.toBe('Moving your compendium…');
		expect(bodyText(container)).toContain('0 / 2 moved');
	});

	test('progress callbacks update the line in place', () => {
		const { container, runCalls } = makeModal();
		footerBtn(container, 'Move 2 file(s)').click();
		runCalls[0].onProgress(1, 2);
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
	test('reports what moved and hands control back with done()', async () => {
		const report = emptyReport({
			migrated: [rename('Rules/Careers/Disciple.md', 'career/disciple.md')],
			migratedModified: [rename('Rules/Careers/Sage.md', 'career/sage.md', true)],
			blocked: [{ fromPath: 'a', toPath: 'b' }],
			unmapped: ['c'],
		});
		const { container, callbacks, finishRun } = makeModal(makePlan(), report);
		footerBtn(container, 'Move 2 file(s)').click();
		finishRun();
		await Promise.resolve();
		await Promise.resolve();

		expect((container.querySelector('.dse-modal__title') as HTMLElement).textContent)
			.toBe('Compendium moved');
		const text = bodyText(container);
		expect(text).toContain('1 file(s) moved; links updated by Obsidian.');
		expect(text).toContain('1 moved file(s) did not match the final legacy release');
		expect(text).toContain('1 skipped: the new path was already occupied.');
		expect(text).toContain('1 left in place: no 7.0.0 counterpart.');
		expect(text).toContain('old, now-empty folders are left behind on purpose');

		footerBtn(container, 'Sync the compendium now').click();
		expect(callbacks.done).toHaveBeenCalledWith(report);
		expect(document.body.contains(container)).toBe(false);
	});

	test('an aborted run says so and tells the user how to finish', async () => {
		const report = emptyReport({
			aborted: true,
			remaining: 7,
			migrated: [rename('Rules/Careers/Disciple.md', 'career/disciple.md')],
		});
		const { container, finishRun } = makeModal(makePlan(), report);
		footerBtn(container, 'Move 2 file(s)').click();
		finishRun();
		await Promise.resolve();
		await Promise.resolve();

		expect((container.querySelector('.dse-modal__title') as HTMLElement).textContent)
			.toBe('Migration stopped');
		expect(bodyText(container)).toContain('7 file(s) not moved');
		expect(bodyText(container)).toContain('Migrate compendium from the pre-7.0.0 layout');
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
