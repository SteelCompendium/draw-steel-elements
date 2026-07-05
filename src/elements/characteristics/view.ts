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
// SC-5 eviction (D2 §5): the value_height/name_height YAML knobs no longer become inline
// `font-size` — they arrive as the --dse-value-scale / --dse-label-scale custom
// properties (sanctioned `--dse-*` geometry via setProperty), consumed by the
// stylesheet's `calc(var(--dse-…-scale) * 1em)` font sizes. No other `.style` access, no
// color anywhere in code. Static element: no persistence, no listeners (the legacy
// processor's manual capture-phase click shield stays replaced by the pipeline default).
import { ElementView } from '@/framework/view';
import type { Characteristics } from '@model/Characteristics';

export class CharacteristicsElementView extends ElementView<Characteristics> {
	protected onMount(root: HTMLElement, model: Characteristics): void {
		const grid = root.createDiv({ cls: 'dse-statgrid' });
		grid.style.setProperty('--dse-value-scale', String(model.value_height));
		grid.style.setProperty('--dse-label-scale', String(model.name_height));

		const characteristics = [
			{ name: 'Might', value: model.might },
			{ name: 'Agility', value: model.agility },
			{ name: 'Reason', value: model.reason },
			{ name: 'Intuition', value: model.intuition },
			{ name: 'Presence', value: model.presence },
		];

		for (const char of characteristics) {
			const cell = grid.createDiv({ cls: 'dse-statgrid__cell' });
			cell.createDiv({ cls: 'dse-statgrid__value', text: String(char.value) });
			cell.createDiv({ cls: 'dse-statgrid__label', text: char.name });
		}
	}
}
