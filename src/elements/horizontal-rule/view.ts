// Plan 09 Task 1 (D2 §3.1) — HorizontalRuleView on the kit divider.
//
// onMount renders the kit `divider` (axis "h", ornament ◆): the `.dse-hr` + fade lines +
// diamond DOM Plan 08 already ships CSS for (--dse-rule / --dse-rule-fade — Legacy maps
// them to today's values, so no visual change). This replaces the legacy
// Common/horizontalRuleProcessor reuse for THIS element's own view only.
//
// horizontalRuleProcessor.ts is intentionally NOT deleted: Statblock/Featureblock still
// call `HorizontalRuleProcessor.build()` directly, embedding `.ds-hr-container` inside
// their OWN containers (styles-source.css nests `.ds-hr-container` padding rules under
// `.ds-sb-container`/`.ds-fb-container`). They migrate to the kit divider in Plan 09
// Task 6; until then the legacy builder + its `.ds-hr-*` CSS stay untouched.
import { divider } from '@/framework/kit';
import { ElementView } from '@/framework/view';

export class HorizontalRuleView extends ElementView<void> {
	protected onMount(root: HTMLElement): void {
		divider(root, { axis: 'h', ornament: true }, this);
	}
}
