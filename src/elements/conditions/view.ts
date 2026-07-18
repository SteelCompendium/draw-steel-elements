// D7 Task 2 (spec §4.4/§2.1) — ConditionsPanelContainer: the thin persist container
// wrapping ConditionsPanel. Owns the model + persist(); the panel owns rendering +
// mutation-intent (§2.1's container/presentational split — this is the FIRST real
// HeroPanel consumer; Task 1 only extracted the contract + panel cores).
//
// `PanelHost.readOnly` follows the CORRECTED convention documented at its declaration
// (framework/kit/HeroPanel.ts): true means the container CANNOT persist (mirrors
// `!cx.host.canPersist`), so the panel renders its write affordances inert — the D7
// spec's own inline comment on that field is inverted from the field's name; the code
// comment is the source of truth here, not the spec prose.
import { ElementView } from '@/framework/view';
import type { PanelHost } from '@/framework/kit';
import type { Condition, ConditionsModel } from './model';
import { ConditionsPanel } from './panel';

export class ConditionsPanelContainer extends ElementView<ConditionsModel> {
	private panel: ConditionsPanel | null = null;

	protected onMount(root: HTMLElement, model: ConditionsModel): void {
		const host: PanelHost = {
			readOnly: !this.cx.host.canPersist,
			roll: this.cx.roll,
		};
		this.panel = new ConditionsPanel(this.cx, host);
		this.addChild(this.panel);
		this.panel.mountPanel(root, model.conditions, (patch) => {
			const next = (patch as Condition[] | undefined) ?? [];
			this.model.conditions = next;
			this.panel?.updatePanel(next);
			void this.persist();
		});
	}
}
