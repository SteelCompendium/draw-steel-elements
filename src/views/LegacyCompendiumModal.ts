// F2 Task 10 (OD-6) — the one-time "existing compendium folder found" offer, on the
// kit managedModal (DseModal), matching every other DSE confirm dialog (see
// ResetEncounterModal): title via aria-labelledby, message in .dse-modal__body, a
// footer of REAL kit <button>s (CB-8). Shown before the FIRST sync when the
// compendium root already has files but no sync manifest — most likely a folder from
// a pre-6.0.0 CompendiumDownloader install (destructive: wiped the directory clean on
// every download), or any homebrew a user happened to keep at that path.
//
// The safe default is "do nothing automatically": Keep everything takes initial focus
// (§2.6) and the trash choice is an explicit, confirmed action (variant: danger).
// Nothing this modal does is itself destructive — trashFile is a plugin.ts concern the
// caller performs on `true`, and Obsidian's trash is always recoverable.
import type { App } from 'obsidian';
import { DseModal } from '@/framework/kit';

export class LegacyCompendiumModal extends DseModal {
	constructor(
		app: App,
		private root: string,
		private onChoice: (trashOldRoot: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setDseTitle('Existing compendium folder found');
		this.body.createEl('p', {
			text:
				`"${this.root}" already contains files but no sync manifest — most likely a ` +
				`compendium downloaded by an older version of this plugin. You can move that ` +
				`folder to the trash before the first sync, or keep everything in place. ` +
				`Files you keep are never overwritten or deleted; any that collide with ` +
				`compendium paths are skipped and reported.`,
		});

		this.footer([
			{
				label: 'Keep everything',
				text: 'Keep everything',
				variant: 'accent',
				onClick: () => {
					this.close();
					this.onChoice(false);
				},
			},
			{
				label: 'Move old compendium to trash',
				text: 'Move old compendium to trash',
				variant: 'danger',
				onClick: () => {
					this.close();
					this.onChoice(true);
				},
			},
		]);
	}
}
