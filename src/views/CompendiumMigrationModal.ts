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
//   3. SUMMARY  — what moved, what was skipped and why.
//
// The safe default takes initial focus: "Not now" is first in the footer, and the
// migration itself is the explicit, second action. Nothing here deletes anything.
import type { App } from 'obsidian';
import { DseModal } from '@/framework/kit';
import type { MigrationPlan, MigrationReport } from '@/data/CompendiumMigration';

const SAMPLE_SIZE = 6;

export interface MigrationModalCallbacks {
	/** Run the plan. Resolves with the report; the modal shows the summary. */
	run: (
		onProgress: (done: number, total: number) => void,
		shouldAbort: () => boolean,
	) => Promise<MigrationReport>;
	/** Chosen when the user declines the migration but still wants the sync. */
	skip: () => void;
	/** Called once the summary is dismissed, so the caller can start the sync. */
	done: (report: MigrationReport) => void;
}

export class CompendiumMigrationModal extends DseModal {
	private aborted = false;

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

	// -- phase 1 -------------------------------------------------------------
	private renderPreview(): void {
		this.setDseTitle("Move your compendium to the 7.0.0 layout");
		this.body.empty();

		const { renames, blocked, unmapped } = this.plan;
		this.body.createEl("p", {
			text:
				`Version 7.0.0 reorganises the compendium: "Rules/Careers/Disciple.md" is now ` +
				`"career/disciple.md", and so on for every file. Moving your existing copies ` +
				`instead of replacing them lets Obsidian update the links in your own notes ` +
				`automatically — the plugin never edits a note you wrote.`,
		});

		const list = this.body.createEl("ul", { cls: "dse-migration__summary" });
		list.createEl("li", {
			text: `${renames.length} file(s) will be moved inside "${this.plan.root}".`,
		});
		const modified = renames.filter((rename) => rename.modified === true).length;
		if (modified > 0) {
			list.createEl("li", {
				text:
					`${modified} of them do not match the final legacy release — either you edited ` +
					`them, or you were on an older compendium release. They are moved too, and ` +
					`listed at the end so you can check them.`,
			});
		}
		if (blocked.length > 0) {
			list.createEl("li", {
				text: `${blocked.length} cannot move because something already sits at the new path — left in place.`,
			});
		}
		if (unmapped.length > 0) {
			list.createEl("li", {
				text:
					`${unmapped.length} file(s) have no 7.0.0 counterpart (index pages, book-level ` +
					`pages, anything of your own) — left exactly where they are.`,
			});
		}
		list.createEl("li", { text: "Nothing is deleted. Not now, not later." });

		if (renames.length > 0) {
			this.body.createEl("p", { text: "For example:" });
			const sample = this.body.createEl("ul", { cls: "dse-migration__sample" });
			for (const rename of this.plan.renames.slice(0, SAMPLE_SIZE)) {
				sample.createEl("li", { text: `${rename.oldRelative}  →  ${rename.newRelative}` });
			}
			if (renames.length > SAMPLE_SIZE) {
				sample.createEl("li", { text: `…and ${renames.length - SAMPLE_SIZE} more.` });
			}
		}

		this.footer([
			{
				label: "Not now",
				text: "Not now",
				onClick: () => {
					this.close();
					this.callbacks.skip();
				},
			},
			{
				label: `Move ${renames.length} file(s)`,
				text: `Move ${renames.length} file(s)`,
				variant: "accent",
				disabled: renames.length === 0,
				onClick: () => {
					void this.runMigration();
				},
			},
		]);
	}

	// -- phase 2 -------------------------------------------------------------
	private async runMigration(): Promise<void> {
		this.setDseTitle("Moving your compendium…");
		this.body.empty();
		const progress = this.body.createEl("p", {
			text: `0 / ${this.plan.renames.length} moved`,
		});
		this.body.createEl("p", {
			text: "You can stop at any point. Files already moved stay moved — each move is complete on its own.",
		});
		const [stop] = this.footer([
			{
				label: "Stop",
				text: "Stop",
				variant: "danger",
				onClick: () => {
					this.aborted = true;
					stop.setDisabled(true);
					stop.setLabel("Stopping…");
				},
			},
		]);

		const report = await this.callbacks.run(
			(done, total) => progress.setText(`${done} / ${total} moved`),
			() => this.aborted,
		);
		this.renderSummary(report);
	}

	// -- phase 3 -------------------------------------------------------------
	private renderSummary(report: MigrationReport): void {
		this.setDseTitle(report.aborted ? "Migration stopped" : "Compendium moved");
		this.body.empty();
		const list = this.body.createEl("ul", { cls: "dse-migration__summary" });
		list.createEl("li", { text: `${report.migrated.length} file(s) moved; links updated by Obsidian.` });
		if (report.aborted) {
			list.createEl("li", {
				text: `${report.remaining} file(s) not moved — run "Migrate compendium from the pre-7.0.0 layout" again to finish.`,
			});
		}
		if (report.migratedModified.length > 0) {
			list.createEl("li", {
				text: `${report.migratedModified.length} moved file(s) did not match the final legacy release — see the developer console for the list.`,
			});
		}
		if (report.blocked.length > 0) {
			list.createEl("li", { text: `${report.blocked.length} skipped: the new path was already occupied.` });
		}
		if (report.failed.length > 0) {
			list.createEl("li", { text: `${report.failed.length} failed to move — see the developer console.` });
		}
		if (report.unmapped.length > 0) {
			list.createEl("li", { text: `${report.unmapped.length} left in place: no 7.0.0 counterpart.` });
		}
		list.createEl("li", {
			text: "The old, now-empty folders are left behind on purpose — deleting folders is not something this does. Remove them yourself whenever you like.",
		});

		this.footer([
			{
				label: "Sync the compendium now",
				text: "Sync the compendium now",
				variant: "accent",
				onClick: () => {
					this.close();
					this.callbacks.done(report);
				},
			},
		]);
	}
}
