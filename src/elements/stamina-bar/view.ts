// Plan 09 Task 3 (D2 §3.5) — StaminaBarView on the D2 kit. The whole-element wrapper is
// the kit collapsible2 (title "Stamina Bar", seeded from collapse_default, NO
// SessionPersist — this element was never session-tracked: every mount starts fresh
// from the YAML, exactly as the Vue component did). The bar renders the .dse-stamina
// grammar: state COLOR via the [data-state] class rules on the --dse-stamina-* tokens,
// fill widths via --dse-fill/--dse-temp-fill setProperty geometry (SC-5 — zero inline
// colors/widths; the only .style use is `setProperty("--dse-*", …)`).
//
// Clicking opens the unified managedModal StaminaEditModal (D2 §3.5b); the modal
// mutates `this.model` in place (it is handed the SAME object reference) and its
// updateCallback both refreshes the bar in place (targeted update, no rebuild) and
// schedules persist(). The serialize path (model.ts) is untouched — persisted YAML
// stays byte-compatible (F1 §6).
import { setTooltip } from 'obsidian';
import { ElementView } from '@/framework/view';
import { collapsible2, openManagedModal } from '@/framework/kit';
import { StaminaBar } from '@model/StaminaBar';
import { StaminaEditModal } from '@views/StaminaEditModal';

const SHEET_STYLE_NOTICE = 'Sheet style is not implemented, use default style';
const READ_ONLY_TOOLTIP = 'Read-only in this context';

/** Title shown in the whole-element collapsible2 header (the old ComponentWrapper
 *  componentName, previously visible only in the collapsed rail). */
const WRAPPER_TITLE = 'Stamina Bar';

/** Ports StaminaBar.vue's `calculatePercentFromStamina` 1:1. */
function calculatePercentFromStamina(model: StaminaBar, stamina: number, ignoreDying = false): number {
	const dyingStamina = Math.floor((model.max_stamina ?? 0) / 2);
	const totalStamina = (model.max_stamina ?? 0) + dyingStamina;
	const absoluteStamina = ignoreDying ? stamina : stamina + dyingStamina;
	return (absoluteStamina / totalStamina) * 100;
}

/** The SFC's `barColor` computed, re-expressed as the [data-state] value (D2 §3.5):
 *  the state names the condition; the COLOR lives in CSS on the --dse-stamina-* tokens. */
function staminaState(model: StaminaBar): 'healthy' | 'winded' | 'dying' {
	const current = model.current_stamina ?? 0;
	if (current <= 0) return 'dying';
	if (current < Math.floor((model.max_stamina ?? 0) / 2)) return 'winded';
	return 'healthy';
}

/** Ports StaminaBar.vue's `overlayWidth` computed 1:1 (the dying/winded zone width). */
function overlayWidthPercent(model: StaminaBar): number {
	return calculatePercentFromStamina(model, Math.floor((model.max_stamina ?? 0) / 2), true);
}

export class StaminaBarView extends ElementView<StaminaBar> {
	private trackEl!: HTMLElement;
	private fillEl!: HTMLElement;
	private tempEl!: HTMLElement;
	private numPillEl!: HTMLElement;

	protected onMount(root: HTMLElement, model: StaminaBar): void {
		// Whole-element wrapper: ONE kit collapsible2 (replaces the old kit
		// ComponentWrapper). Legacy quirk preserved verbatim (D1 spec §"Step 3"):
		// StaminaBar.vue always passed `!disable_click` — never `model.collapsible` —
		// as ComponentWrapper's `collapsible` prop, and in every reachable production
		// render that was `true`, so the YAML `collapsible` flag is deliberately NOT
		// honored: the element is always collapsible. Seeded from collapse_default
		// with NO SessionPersist (unlike Skills): not session-tracked, matching the
		// legacy element.
		const wrapper = collapsible2(root, { title: WRAPPER_TITLE, open: !model.collapse_default }, this);
		this.renderBar(wrapper.contentEl, model);
	}

	private renderBar(container: HTMLElement, model: StaminaBar): void {
		// Destructured (not `model.style`) so the SC-5 style guard's `.style` scan sees
		// only the sanctioned setProperty calls — this is the YAML `style` FIELD.
		const { style: renderStyle } = model;
		if (renderStyle === 'sheet') {
			container.createDiv({ cls: 'dse-stamina__notice', text: SHEET_STYLE_NOTICE });
			return;
		}

		const canPersist = this.cx.host.canPersist;
		const bar = container.createDiv({
			cls: canPersist ? 'dse-stamina dse-stamina--clickable' : 'dse-stamina',
		});
		// Sanctioned --dse-* geometry (D2 §5): the YAML height feeds the track height.
		bar.style.setProperty('--dse-bar-h', `${model.height ?? 1}em`);

		this.trackEl = bar.createDiv({ cls: 'dse-stamina__track' });
		this.fillEl = this.trackEl.createDiv({ cls: 'dse-stamina__fill' });
		this.tempEl = this.trackEl.createDiv({ cls: 'dse-stamina__temp' });
		const dying = this.trackEl.createDiv({ cls: 'dse-stamina__threshold dse-stamina__threshold--dying' });
		dying.createSpan({ cls: 'dse-stamina__pill', text: 'Dying' });
		const winded = this.trackEl.createDiv({ cls: 'dse-stamina__threshold dse-stamina__threshold--winded' });
		winded.createSpan({ cls: 'dse-stamina__pill', text: 'Winded' });
		const num = this.trackEl.createDiv({ cls: 'dse-stamina__num' });
		this.numPillEl = num.createSpan({ cls: 'dse-stamina__pill' });

		this.updateBarDisplay(model);

		// F1 §4.4: canPersist === false (embeds, print/export, hover popovers, unresolvable
		// canvas nodes) -> render read-only (visible but inert) instead of a dead-end click.
		// collapsible2 hides (never rebuilds) its region, so the bar mounts exactly once
		// per onMount and view-bound listeners are correct (the old per-expand-cycle
		// contentOwner machinery is gone — same shift as Skills, Plan 09 Task 2).
		if (canPersist) {
			this.registerDomEvent(bar, 'click', () => this.openEditModal());
		} else {
			setTooltip(bar, READ_ONLY_TOOLTIP);
		}
	}

	/**
	 * Targeted DOM update (F1 §6 "explicit targeted update methods", no reactivity lib) —
	 * re-expresses the SFC's barColor/overlayWidth/calculatePercentFromStamina computeds
	 * in place, without rebuilding the DOM: widths as --dse-* custom properties, the
	 * state color as [data-state]. Called once at mount and again after every modal edit.
	 */
	private updateBarDisplay(model: StaminaBar): void {
		const current = model.current_stamina ?? 0;
		const temp = model.temp_stamina ?? 0;
		const max = model.max_stamina ?? 0;

		this.fillEl.style.setProperty('--dse-fill', `${calculatePercentFromStamina(model, current)}%`);
		this.fillEl.setAttribute('data-state', staminaState(model));
		this.tempEl.style.setProperty('--dse-temp-fill', `${calculatePercentFromStamina(model, temp, true)}%`);
		// ONE zone width on the track feeds both threshold regions and the numeric
		// region (inherited custom property).
		this.trackEl.style.setProperty('--dse-zone', `${overlayWidthPercent(model)}%`);

		// Fixes CB-17 (D1 spec): the SFC wrote `model?.temp_stamina??0 > 0`, which — due to
		// `??` binding looser than `>` — actually parses as `model?.temp_stamina ?? (0 > 0)`
		// i.e. `model?.temp_stamina ?? false`, NOT the intended "> 0" comparison. Replaced
		// here with the correct, explicit check.
		this.numPillEl.setText(`(${current}/${max}${temp > 0 ? ' + ' + temp : ''})`);
	}

	private openEditModal(): void {
		// F1 §4.5 via the kit: openManagedModal registers the view-unload closer per
		// open; DseModal.close() is idempotent, so the old hand-rolled activeModal
		// bookkeeping (needed when StaminaEditModal was a raw, non-idempotent Modal)
		// is gone.
		openManagedModal(this, () =>
			new StaminaEditModal(this.cx.app, this.model, true, '', () => {
				this.updateBarDisplay(this.model);
				void this.persist();
			}),
		);
	}
}
