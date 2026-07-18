// Plan 09 Task 1 (D2 §3.3) — CharacteristicsElementView on the shared `.dse-statgrid`
// grammar.
//
// The redesign folds the deleted legacy Characteristics/CharacteristicsView into onMount:
// one flat `.dse-statgrid` of the five fixed characteristic `.dse-statgrid__cell`s, each
// a `__value` (big, --dse-fg) over a `__label` (muted, --dse-fg-muted) — the SAME grammar
// values-row/view.ts renders; the root's [data-dse-element="characteristics"] attr is
// what scopes/distinguishes it at the CSS level (styles-source.css scopes `.dse-statgrid`
// under both element roots).
//
// D7 Task 1 (spec §2.1/§2.3): the grid builder now lives in the shared kit core
// (framework/kit/CharacteristicsGrid.ts, renderCharacteristicsGrid) — zero behavior
// change: identical DOM, identical --dse-value-scale/--dse-label-scale geometry.
//
// SC-5 eviction (D2 §5): the value_height/name_height YAML knobs no longer become inline
// `font-size` — they arrive as the --dse-value-scale / --dse-label-scale custom
// properties (sanctioned `--dse-*` geometry via setProperty), consumed by the
// stylesheet's `calc(var(--dse-…-scale) * 1em)` font sizes. No other `.style` access, no
// color anywhere in code. Static element: no persistence, no listeners (the legacy
// processor's manual capture-phase click shield stays replaced by the pipeline default).
import { ElementView } from '@/framework/view';
import { renderCharacteristicsGrid } from '@/framework/kit';
import type { Characteristics } from '@model/Characteristics';

export class CharacteristicsElementView extends ElementView<Characteristics> {
	protected onMount(root: HTMLElement, model: Characteristics): void {
		renderCharacteristicsGrid(
			root,
			{
				might: model.might,
				agility: model.agility,
				reason: model.reason,
				intuition: model.intuition,
				presence: model.presence,
			},
			{ valueHeight: model.value_height, nameHeight: model.name_height },
		);
	}
}
