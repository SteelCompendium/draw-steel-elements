// D7 Task 5 (spec §4.3/§2.1) — SurgePanelContainer: the thin persist container wrapping
// SurgePanel. Owns the model + persist(); the panel owns rendering + mutation-intent
// (§2.1's container/presentational split, same convention as ResourcePanelContainer /
// ConditionsPanelContainer). `highest_characteristic` is display-only here too — this
// standalone element has no characteristics of its own to derive it from, so toSlice
// just carries the authored value through unchanged.
import { ElementView } from '@/framework/view';
import type { PanelHost } from '@/framework/kit';
import type { SurgeModel } from './model';
import { SurgePanel } from './panel';
import type { SurgeSlice } from './panel';

function toSlice(model: SurgeModel): SurgeSlice {
	return { surges: model.surges, highestCharacteristic: model.highest_characteristic };
}

export class SurgePanelContainer extends ElementView<SurgeModel> {
	private panel: SurgePanel | null = null;

	protected onMount(root: HTMLElement, model: SurgeModel): void {
		const host: PanelHost = {
			readOnly: !this.cx.host.canPersist,
			roll: this.cx.roll,
		};
		this.panel = new SurgePanel(this.cx, host);
		this.addChild(this.panel);
		this.panel.mountPanel(root, toSlice(model), (patch) => {
			if (patch.surges !== undefined) this.model.surges = patch.surges;
			this.panel?.updatePanel(toSlice(this.model));
			void this.persist();
		});
	}
}
