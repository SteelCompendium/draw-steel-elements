// D7 Task 3 (spec §4.1/§2.1) — ResourcePanelContainer: the thin persist container
// wrapping ResourcePanel. Owns the model + persist(); resolveResource (resourceByClass.ts)
// is called HERE — at render, never in model.ts's parse() — merging model.class's static
// defaults with any explicit model.type/model.min override into the ResourceSlice the
// panel renders (spec §4.1: class defaulting happens "at render... not materialized onto
// the serialized object").
import { ElementView } from '@/framework/view';
import type { PanelHost } from '@/framework/kit';
import type { ResourceModel } from './model';
import { ResourcePanel } from './panel';
import type { ResourceSlice } from './panel';
import { resolveResource } from './resourceByClass';

function toSlice(model: ResourceModel): ResourceSlice {
	const resolved = resolveResource(model.class, { type: model.type, min: model.min });
	return { type: resolved.type, current: model.current, min: resolved.min, gainHint: resolved.gainHint };
}

export class ResourcePanelContainer extends ElementView<ResourceModel> {
	private panel: ResourcePanel | null = null;

	protected onMount(root: HTMLElement, model: ResourceModel): void {
		const host: PanelHost = {
			readOnly: !this.cx.host.canPersist,
			roll: this.cx.roll,
		};
		this.panel = new ResourcePanel(this.cx, host);
		this.addChild(this.panel);
		this.panel.mountPanel(root, toSlice(model), (patch) => {
			if (patch.current !== undefined) this.model.current = patch.current;
			this.panel?.updatePanel(toSlice(this.model));
			void this.persist();
		});
	}
}
