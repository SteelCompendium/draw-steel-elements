import {NegotiationData} from "@model/NegotiationData";

// Plan 05 Task 5 (F1 §6 step 8): persistence decoupled from CodeBlocks — the owning
// NegotiationView injects `persist`; `app`/`ctx` existed only for the
// CodeBlocks.updateNegotiationTracker call and are gone.
export class MotivationsPitfallsView {
	private data: NegotiationData;
	private persist: () => void;

	constructor(data: NegotiationData, persist: () => void) {
		this.data = data;
		this.persist = persist;
	}

	public build(parent: HTMLElement) {
		this.addMotivations(parent);
		this.addPitfalls(parent);
	}

	// Add Motivations
	private addMotivations(parent: HTMLElement) {
		if (this.data.motivations.length > 0) {
			const motivationsCont = parent.createEl("div", { cls: "ds-nt-motivations" });
			motivationsCont.createEl("div", { cls: "ds-nt-details-header ds-nt-motivation-header", text: "Motivations" });
			const motivationList = motivationsCont.createEl("div", { cls: "ds-nt-motivation-list" });

			this.data.motivations.forEach(mot => {
				const label = motivationList.createEl("label", { cls: "ds-nt-details-label ds-nt-motivation-label" });
				label.title = "Check Motivations that have already been appealed to.";
				const checkbox = label.createEl("input", { cls: "ds-nt-details-checkbox ds-nt-motivation-checkbox", type: "checkbox" }) as HTMLInputElement;
				checkbox.checked = mot.hasBeenAppealedTo ?? false;
				label.createEl("span", { cls: "ds-nt-details-name ds-nt-motivation-name", text: mot.name + ": " });
				label.createEl("span", { cls: "ds-nt-details-reason ds-nt-motivation-reason", text: mot.reason });
				checkbox.addEventListener("change", () => {
					this.data.setMotivationUsed(mot.name, checkbox.checked);
					this.persist();
				});
			});
		}
	}

	// Add Pitfalls
	private addPitfalls(parent: HTMLElement) {
		if (this.data.pitfalls.length > 0) {
			const pitfallsCont = parent.createEl("div", { cls: "ds-nt-pitfalls" });
			pitfallsCont.createEl("div", { cls: "ds-nt-details-header ds-nt-pitfall-header", text: "Pitfalls" });
			const pitfallList = pitfallsCont.createEl("div", { cls: "ds-nt-pitfall-list" });

			this.data.pitfalls.forEach(pit => {
				const label = pitfallList.createEl("label", { cls: "ds-nt-details-label ds-nt-pitfall-label" });
				label.createEl("span", { cls: "ds-nt-details-name ds-nt-pitfall-name", text: pit.name + ": " });
				label.createEl("span", { cls: "ds-nt-details-reason ds-nt-pitfall-reason", text: pit.reason });
			});
		}
	}
}
