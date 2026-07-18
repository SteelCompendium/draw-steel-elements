// D7 Task 6 (spec §4.5, OD-3) — TokenPoolContainer: the standalone ds-tokens element
// view. Unlike ds-surges/ds-resource, this element does NOT go through a HeroPanel —
// spec §4.5's interfaces section specs it as a plain `ElementView<TokenPoolModel>`
// wrapping a labeled kit `stepper` directly (no presentational core to share yet; a
// future ds-hero read-through, Task 9, reads this block's model, it doesn't reuse a
// TokenPoolPanel). Mirrors counter/view.ts's direct-stepper convention: the value IS
// the stepper's own control surface, no separate container mutation dance needed.
import { setTooltip } from 'obsidian';
import { ElementView } from '@/framework/view';
import { stepper } from '@/framework/kit';
import type { TokenPoolModel } from './model';

const READ_ONLY_TOOLTIP = 'Read-only in this context';
const DEFAULT_LABEL = 'Hero Tokens';

export class TokenPoolContainer extends ElementView<TokenPoolModel> {
	protected onMount(root: HTMLElement, model: TokenPoolModel): void {
		const container = root.createDiv({ cls: 'dse-tokens' });

		const labelEl = container.createDiv({ cls: 'dse-tokens__label' });
		labelEl.createSpan({ cls: 'dse-tokens__glyph', text: '♦' });
		labelEl.createSpan({ cls: 'dse-tokens__label-text', text: model.label ?? DEFAULT_LABEL });

		const stepperWrap = container.createDiv({ cls: 'dse-tokens__stepper' });
		const canPersist = this.cx.host.canPersist;
		const handle = stepper(
			stepperWrap,
			{
				value: model.tokens,
				min: 0, // spec §4.5: tokens are spent, never negative
				// No `max` — the party's Hero Token pool has no rules-defined ceiling.
				editable: canPersist,
				integer: true,
				label: DEFAULT_LABEL,
				onChange: (value) => {
					this.model.tokens = value;
					void this.persist();
				},
			},
			this,
		);

		// F1 §4.4: read-only hosts REAL-disable every stepper button (same convention as
		// counter/view.ts and party/view.ts's hero_tokens stepper).
		if (!canPersist) {
			handle.rootEl.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
				btn.disabled = true;
			});
			setTooltip(container, READ_ONLY_TOOLTIP);
		}
	}
}
