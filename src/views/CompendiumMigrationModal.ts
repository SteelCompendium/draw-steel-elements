// SC-125 — the pre-7.0.0 compendium migration prompt, on the kit managedModal
// (DseModal), same shape as LegacyCompendiumModal and ResetEncounterModal.
//
// Three phases in one dialog, because the user needs to see the same numbers they
// approved while the work runs:
//   1. PREVIEW  — the dry run. Counts, a sample of real old → new pairs, and what
//                 will be left alone. Nothing has happened yet.
//   2. RUNNING  — a progress line and a Stop button. Stop finishes the file in
//                 flight and leaves everything already moved where it is (each
//                 rename is independently complete — there is no half state).
//   3. SUMMARY  — what moved, what was skipped, and WHICH FILES (review H3: the
//                 per-path lists live here, in collapsible sections, not only in a
//                 console.warn the user will never see).
//
// THE THING THIS DIALOG EXISTS TO PROTECT (review H2): a sync makes the migration
// impossible, because it CREATES every destination and each pending move then finds
// its target occupied. So no path out of this dialog may quietly fall through into a
// sync. "Not now" declines and stops; syncing without migrating is its own explicitly
// labelled button; and an aborted run's primary action is to FINISH, never to sync.
// Escape counts as "not now" (review M2), never as consent.
import type { App } from 'obsidian';
import { DseModal, collapsible } from '@/framework/kit';
import type { MigrationPhase, MigrationPlan, MigrationReport } from '@/data/CompendiumMigration';

const SAMPLE_SIZE = 6;
/** Per-path lists are complete in the report NOTE; the dialog shows a readable slice. */
const LIST_LIMIT = 40;

export interface MigrationModalCallbacks {
	/** Run the plan. Resolves with the report; the modal shows the summary. */
	run: (
		onProgress: (done: number, total: number, phase?: MigrationPhase) => void,
		shouldAbort: () => boolean,
	) => Promise<MigrationReport>;
	/** "Not now", or Escape at the preview. Records the decline; does NOT sync. */
	decline: () => void;
	/** Explicit, labelled consent to sync without migrating. Links will break. */
	syncAnyway: () => void;
	/** After an aborted run: go round again with a fresh plan for the remainder. */
	finishRemaining: (report: MigrationReport) => void;
	/** After a complete run: the user asked for the sync. */
	syncAfter: (report: MigrationReport) => void;
	/** The dialog went away without a terminal button — Escape, or a view unload. */
	dismissed: (report: MigrationReport | null) => void;
	/** The run itself threw. The dialog shows an error state; the caller logs/notices. */
	failed: (error: unknown) => void;
}

export class CompendiumMigrationModal extends DseModal {
	private aborted = false;
	private closed = false;
	/** Set by every footer button that ends the interaction, so onClose can tell a
	 *  deliberate answer from a dismissal. */
	private answered = false;
	private lastReport: MigrationReport | null = null;

	constructor(
		app: App,
		private plan: MigrationPlan,
		private callbacks: MigrationModalCallbacks,
	) {
		super(app);
	}

	onOpen(): void {
		this.renderPreview();
	}

	/**
	 * Review M2. Escape (and any other close that isn't a button) used to do nothing
	 * at all: at the preview the caller was left waiting for a callback that never
	 * came, and mid-run the migration carried on rendering into a detached DOM. Now a
	 * dismissal is an answer — the conservative one.
	 */
	onClose(): void {
		this.closed = true;
		if (this.answered) return;
		this.answered = true;
		this.aborted = true; // stop a run in flight; `dismissed` gets its report later
		this.callbacks.dismissed(this.lastReport);
	}

	// -- phase 1 -------------------------------------------------------------
	private renderPreview(): void {
		this.setDseTitle('Move your compendium to the 7.0.0 layout');
		this.body.empty();

		const { renames, blocked, unmapped } = this.plan;
		this.body.createEl('p', {
			text:
				`Version 7.0.0 reorganises the compendium: "Rules/Careers/Disciple.md" is now ` +
				`"career/disciple.md", and so on for every file. Moving your existing copies ` +
				`instead of replacing them lets Obsidian update the links in your own notes ` +
				`automatically — the plugin never edits a note you wrote.`,
		});

		const list = this.body.createEl('ul', { cls: 'dse-migration__summary' });
		list.createEl('li', {
			text: `${renames.length} file(s) will be moved inside "${this.plan.root}".`,
		});
		const modified = renames.filter((rename) => rename.modified === true).length;
		if (modified > 0) {
			list.createEl('li', {
				text:
					`${modified} of them do not match the final legacy release — either you edited ` +
					`them, or you were on an older compendium release. They are moved too, and ` +
					`listed at the end so you can check them.`,
			});
		}
		if (blocked.length > 0) {
			list.createEl('li', {
				text: `${blocked.length} cannot move because something already sits at the new path — left in place.`,
			});
		}
		if (unmapped.length > 0) {
			list.createEl('li', {
				text:
					`${unmapped.length} file(s) have no 7.0.0 counterpart (index pages, book-level ` +
					`pages, anything of your own) — left exactly where they are.`,
			});
		}
		if (this.plan.backupCount > 0) {
			list.createEl('li', {
				text:
					`Before anything moves, ${this.plan.backupCount} file(s) — every one whose ` +
					`contents do not match the final legacy release — are copied to ` +
					`"${this.plan.backupFolder}", a new folder beside your compendium. Nothing you ` +
					`wrote into a compendium file can be lost, and that folder is yours to delete ` +
					`whenever you are satisfied.`,
			});
		} else {
			list.createEl('li', {
				text:
					'No backup folder is needed: every file being moved is byte-identical to the ' +
					'compendium release it came from, so there is nothing of yours inside them.',
			});
		}
		list.createEl('li', { text: 'Nothing is deleted. Not now, not later.' });

		if (renames.length > 0) {
			this.body.createEl('p', { text: 'For example:' });
			const sample = this.body.createEl('ul', { cls: 'dse-migration__sample' });
			for (const rename of this.plan.renames.slice(0, SAMPLE_SIZE)) {
				sample.createEl('li', { text: `${rename.oldRelative}  →  ${rename.newRelative}` });
			}
			if (renames.length > SAMPLE_SIZE) {
				sample.createEl('li', { text: `…and ${renames.length - SAMPLE_SIZE} more.` });
			}
		}

		this.body.createEl('p', {
			cls: 'dse-migration__warning',
			text:
				'Syncing before you move these is a one-way door: the sync creates all the new ' +
				'files, and the move then has nowhere to go. "Not now" leaves everything alone ' +
				'and asks again next time you sync.',
		});

		this.footer([
			{
				label: 'Not now',
				text: 'Not now',
				onClick: () => {
					this.answered = true;
					this.close();
					this.callbacks.decline();
				},
			},
			{
				label: 'Sync without moving (links will break)',
				text: 'Sync without moving',
				variant: 'danger',
				tooltip:
					'Downloads the new compendium and leaves your old files where they are. ' +
					'Links to compendium notes will stop working, and the move can no longer be done.',
				onClick: () => {
					this.answered = true;
					this.close();
					this.callbacks.syncAnyway();
				},
			},
			{
				label: `Move ${renames.length} file(s)`,
				text: `Move ${renames.length} file(s)`,
				variant: 'accent',
				disabled: renames.length === 0,
				onClick: () => {
					void this.runMigration();
				},
			},
		]);
	}

	// -- phase 2 -------------------------------------------------------------
	private async runMigration(): Promise<void> {
		this.setDseTitle('Moving your compendium…');
		this.body.empty();
		const progress = this.body.createEl('p', {
			text: this.plan.backupCount > 0
				? `0 / ${this.plan.backupCount} backed up`
				: `0 / ${this.plan.renames.length} moved`,
		});
		this.body.createEl('p', {
			text: 'You can stop at any point. Files already moved stay moved — each move is complete on its own.',
		});
		const [stop] = this.footer([
			{
				label: 'Stop',
				text: 'Stop',
				variant: 'danger',
				onClick: () => {
					this.aborted = true;
					stop.setDisabled(true);
					stop.setLabel('Stopping…');
				},
			},
		]);

		let report: MigrationReport;
		try {
			report = await this.callbacks.run(
				(done, total, phase) => {
					if (this.closed) return;
					progress.setText(phase === 'backup'
						? `${done} / ${total} backed up`
						: `${done} / ${total} moved`);
				},
				() => this.aborted,
			);
		} catch (error: unknown) {
			// Review round 2, item 6. The engine swallows its own bookkeeping failures,
			// but something further out (a vault write refused, a storage error) can
			// still throw — and this promise had no catch, so the dialog sat on
			// "Moving your compendium…" forever with no way to learn what happened.
			this.renderFailure(error);
			return;
		}
		this.lastReport = report;
		// The dialog may have been dismissed while the run was in flight — rendering
		// into a detached DOM would swallow the result silently (review M2).
		if (this.closed) {
			this.callbacks.dismissed(report);
			return;
		}
		this.renderSummary(report);
	}

	/** The run threw. Say so, say what is safe, and get out of the user's way. */
	private renderFailure(error: unknown): void {
		// `failed` IS the answer — so Escape from this screen closes quietly instead of
		// also firing the dismissal path and stacking a second, contradictory Notice on
		// top of the error one.
		this.answered = true;
		this.callbacks.failed(error);
		if (this.closed) return;
		this.setDseTitle('Migration could not finish');
		this.body.empty();
		this.body.createEl('p', {
			text:
				'Something went wrong part-way through. Files that had already been moved ' +
				'stayed moved and were recorded, and nothing was deleted — running ' +
				'"Migrate compendium from the pre-7.0.0 layout" again picks up where this ' +
				'left off. Do not sync the compendium first: syncing creates the new files, ' +
				'and the remaining moves would then have nowhere to go.',
		});
		this.body.createEl('p', {
			cls: 'dse-migration__error',
			text: error instanceof Error ? error.message : String(error),
		});
		this.footer([
			{
				label: 'Close',
				text: 'Close',
				onClick: () => {
					this.answered = true;
					this.close();
				},
			},
		]);
	}

	// -- phase 3 -------------------------------------------------------------
	private renderSummary(report: MigrationReport): void {
		this.setDseTitle(report.aborted ? 'Migration stopped' : 'Compendium moved');
		this.body.empty();
		const list = this.body.createEl('ul', { cls: 'dse-migration__summary' });
		list.createEl('li', { text: `${report.migrated.length} file(s) moved; links updated by Obsidian.` });
		if (report.aborted) {
			list.createEl('li', {
				text:
					`${report.remaining} file(s) not moved. Finish them before syncing — a sync ` +
					`creates the new files, and the remaining moves then have nowhere to go.`,
			});
		}
		if (report.backedUp.length > 0) {
			list.createEl('li', {
				text:
					`${report.backedUp.length} file(s) were copied to "${report.backupFolder}" before ` +
					`anything moved. Delete that folder yourself once you are satisfied — nothing ` +
					`here ever touches it again.`,
			});
		} else if (!report.aborted) {
			list.createEl('li', {
				text: 'No backup was needed — none of the moved files differed from the release they came from.',
			});
		}
		list.createEl('li', {
			text: 'The old, now-empty folders are left behind on purpose — deleting folders is not something this does. Remove them yourself whenever you like.',
		});
		if (report.reportNotePath !== null) {
			list.createEl('li', {
				text: `The full per-file list is saved in your vault as "${report.reportNotePath}".`,
			});
		}

		// Review H3 — the lists themselves, not just their counts.
		this.pathSection(
			`Backed up before the move — ${report.backedUp.length}`,
			'Your recovery path if the sync replaces something you had written.',
			report.backedUp.map((entry) => entry.backupPath));
		this.pathSection(
			`Moved, but different from the last legacy release — ${report.migratedModified.length}`,
			'Edited by you, or from an older release. The next sync replaces them with the current official text.',
			report.migratedModified.map((rename) => rename.toPath));
		this.pathSection(
			`Not moved — the new path was already occupied — ${report.blocked.length}`,
			'Left exactly as they were. Nothing was overwritten.',
			report.blocked.map((rename) => `${rename.fromPath}  →  ${rename.toPath}`));
		this.pathSection(
			`Failed to move — ${report.failed.length}`,
			'Obsidian refused the move; these are still at their old paths.',
			report.failed.map((entry) => `${entry.fromPath} — ${entry.error}`));
		this.pathSection(
			`Left in place — no 7.0.0 counterpart — ${report.unmapped.length}`,
			'Index pages, book-level pages, and anything of your own in that folder.',
			report.unmapped);

		this.footer(report.aborted
			? [
				{
					label: 'Close',
					text: 'Close',
					onClick: () => {
						this.answered = true;
						this.close();
						this.callbacks.dismissed(report);
					},
				},
				{
					label: `Finish moving the remaining ${report.remaining}`,
					text: `Finish moving the remaining ${report.remaining}`,
					variant: 'accent',
					onClick: () => {
						this.answered = true;
						this.close();
						this.callbacks.finishRemaining(report);
					},
				},
			]
			: [
				{
					label: 'Close',
					text: 'Close',
					onClick: () => {
						this.answered = true;
						this.close();
						this.callbacks.dismissed(report);
					},
				},
				{
					label: 'Sync the compendium now',
					text: 'Sync the compendium now',
					variant: 'accent',
					onClick: () => {
						this.answered = true;
						this.close();
						this.callbacks.syncAfter(report);
					},
				},
			]);
	}

	private pathSection(title: string, blurb: string, items: string[]): void {
		if (items.length === 0) return;
		const panel = collapsible(this.body, { title, open: false }, this.lifecycle);
		panel.contentEl.createEl('p', { text: blurb });
		const list = panel.contentEl.createEl('ul', { cls: 'dse-migration__paths' });
		for (const item of items.slice(0, LIST_LIMIT)) list.createEl('li', { text: item });
		if (items.length > LIST_LIMIT) {
			list.createEl('li', { text: `…and ${items.length - LIST_LIMIT} more — see the report note.` });
		}
	}
}
