// D7 Task 1 (spec §2.1) — HeroPanel<S> + PanelHost: the presentational contract a
// container ElementView (D7's HeroSheetView, or any standalone element that wants to
// share panel code) mounts for one read-only-ish slice of its model. Deliberately
// mirrors ElementView's onMount/onUpdate split minus the container's model/persist/refs
// concerns, so moving an existing element's render code into a panel is mechanical.
//
// RELOCATED verbatim from framework/view.ts's F1-era stub (T-7, Plan 02) into
// framework/kit/ per the D7 spec's file layout — framework/view.ts now just re-exports
// this module so the pre-existing import path (`from '.../framework/view'`, see
// test/dom/framework/element-view.test.ts) keeps resolving to the exact same class.
import { Component } from 'obsidian';
import type { RenderContext, RollService } from '../context';

/**
 * What a HeroPanel is handed down from its owning container (D7 §2.1).
 *
 * Note: `readOnly` mirrors the *negation* of the owning container's
 * `RenderContext.host.canPersist` (i.e. true when the container CANNOT persist, so the
 * panel should render its controls inert) — the D7 spec's inline comment on this field
 * reads "true when the owning container can persist", which is inverted from the field's
 * own name and from how BlockHost.canPersist is used everywhere else in F1; documented
 * here as the corrected intent for whoever wires a real PanelHost.
 */
export interface PanelHost {
	readonly readOnly: boolean;
	/** Optional roll seam handed down from the container (D5 fills RollService). Absent ⇒ no roll affordances. */
	readonly roll?: RollService;
}

export abstract class HeroPanel<S> extends Component {
	constructor(
		protected readonly cx: RenderContext,
		protected readonly host: PanelHost,
	) {
		super();
	}

	/** Build DOM into `root`; call `onChange(patch)` when the user mutates the slice. */
	abstract mountPanel(root: HTMLElement, slice: S, onChange: (patch: Partial<S>) => void): void;

	/** Apply an externally-changed slice in place (no rebuild). */
	abstract updatePanel(slice: S): void;
}
