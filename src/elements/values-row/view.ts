// Plan 09 Task 1 (D2 §3.2) — ValuesRowElementView on the shared `.dse-statgrid` grammar.
//
// The redesign folds the deleted legacy ValuesRow/ValuesRowView into onMount: one flat
// `.dse-statgrid` of `.dse-statgrid__cell`s, each a `__value` (big, --dse-fg) over a
// `__label` (muted, --dse-fg-muted) — the SAME grammar characteristics/view.ts renders;
// the root's [data-dse-element="values-row"] attr is what scopes/distinguishes it at the
// CSS level (styles-source.css scopes `.dse-statgrid` under both element roots).
//
// SC-5 eviction (D2 §5): the value_height/name_height YAML knobs no longer become inline
// `font-size` — they arrive as the --dse-value-scale / --dse-label-scale custom
// properties (sanctioned `--dse-*` geometry via setProperty), consumed by the
// stylesheet's `calc(var(--dse-…-scale) * 1em)` font sizes. No other `.style` access, no
// color anywhere in code. Static element: no persistence, no listeners (and the legacy
// ValuesRowProcessor never armed a click shield — the definition keeps noClickShield).
import { ElementView } from '@/framework/view';
import type { KeyValuePairs, KVPair } from '@model/KeyValuePairs';

export class ValuesRowElementView extends ElementView<KeyValuePairs> {
	protected onMount(root: HTMLElement, model: KeyValuePairs): void {
		const grid = root.createDiv({ cls: 'dse-statgrid' });
		grid.style.setProperty('--dse-value-scale', String(model.value_height));
		grid.style.setProperty('--dse-label-scale', String(model.name_height));

		model.values.forEach((pair: KVPair) => {
			const cell = grid.createDiv({ cls: 'dse-statgrid__cell' });
			cell.createDiv({ cls: 'dse-statgrid__value', text: pair.value ?? '' });
			cell.createDiv({ cls: 'dse-statgrid__label', text: pair.name ?? '' });
		});
	}
}
