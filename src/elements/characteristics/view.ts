// Plan 09 Task 1 (D2 §3.3), rebuilt for SC-152 round 3 — CharacteristicsElementView on
// the statblock's own `.dse-sb__chars` rail (Scott: "The characteristics here should
// probably be the same css and code that is used in the statblocks… they are exactly
// the same data").
//
// One shared builder (framework/kit/CharacteristicsGrid.ts, renderCharacteristicsRow)
// renders the row for the statblock, this element and the hero sheet's Characteristics
// region: signed values via formatCharacteristic, and the SC-123 merged/split shape
// contract driven by the same `sbCharLine`/`sbCharBox` preferences (resolved through
// the kit's charsAreSplit so the three surfaces can never disagree). Those two prefs
// change the DOM SHAPE, so this view subscribes them to a remount — the statblock
// constructor's exact pattern. The old element-private `.dse-statgrid` grammar remains
// only for ds-values-row (values-row/view.ts builds it inline).
//
// SC-5 eviction (D2 §5): the value_height/name_height YAML knobs never become inline
// `font-size` — they arrive as the --dse-value-scale / --dse-label-scale custom
// properties (sanctioned `--dse-*` geometry via setProperty), consumed by
// characteristics-scoped stylesheet calcs; value_height is normalised ÷3 (its old
// statgrid default) so scale 1 = the statblock's own numeral size. The knobs apply in
// the split shapes only — the merged cell is one text node, no spans to scale. No
// other `.style` access, no color anywhere in code. No persistence (the legacy
// processor's manual capture-phase click shield stays replaced by the pipeline
// default).
import { ElementView } from '@/framework/view';
import { charsAreSplit, renderCharacteristicsRow } from '@/framework/kit';
import type { RenderContext } from '@/framework/context';
import type { Characteristics } from '@model/Characteristics';

export class CharacteristicsElementView extends ElementView<Characteristics> {
	constructor(cx: RenderContext) {
		super(cx);
		// SC-152 round 3: the element renders the statblock's characteristics row
		// (Scott: "they are exactly the same data"), so it follows the same two shape
		// prefs — and, like the statblock, they change the DOM SHAPE, so they need a
		// remount, not a reflow (statblock/view.ts's constructor is the pattern).
		const remount = (): void => {
			if (this.rootEl) void this.update(this.model);
		};
		cx.prefs.subscribe('sbCharLine', this, remount);
		cx.prefs.subscribe('sbCharBox', this, remount);
	}

	protected onMount(root: HTMLElement, model: Characteristics): void {
		renderCharacteristicsRow(
			root,
			{
				might: model.might,
				agility: model.agility,
				reason: model.reason,
				intuition: model.intuition,
				presence: model.presence,
			},
			{
				split: charsAreSplit(this.cx.prefs),
				// The YAML knobs predate the unification (statgrid era: "font-size in
				// em", value default 3). Normalised by the default so scale 1 = the
				// statblock's own numeral size and the knob keeps its proportional
				// meaning — see the scale rules in styles-source.css (SC-152 round 3).
				valueHeight: model.value_height / 3,
				nameHeight: model.name_height,
			},
		);
	}
}
