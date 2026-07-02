// D1 Task 3 (Plan 03) / F1 §6 step "Stamina Bar" — StaminaBarView: re-expresses
// StaminaBar.vue as a createEl tree (bar container, stamina indicator, temp-stamina
// overlay, dying/winded overlays, "(cur/max + temp)" pill), wrapped in the kit
// ComponentWrapper (D1 Task 2's framework/kit/componentWrapper). Persisted shape (F1
// §1.3): clicking opens the EXISTING DOM @views/StaminaEditModal (OD-D1-1 — NOT a
// re-expression of the deleted StaminaEditModal.vue); the modal mutates `this.model`
// in place (it is handed the SAME object reference) and its updateCallback both refreshes
// the bar in place (targeted update, no rebuild) and schedules persist().
import { setTooltip } from 'obsidian';
import { ElementView } from '@/framework/view';
import { mountComponentWrapper } from '@/framework/kit/componentWrapper';
import { StaminaBar } from '@model/StaminaBar';
import { StaminaEditModal } from '@views/StaminaEditModal';

const SHEET_STYLE_NOTICE = 'Sheet style is not implemented, use default style';
const READ_ONLY_TOOLTIP = 'Read-only in this context';

/** Ports StaminaBar.vue's `calculatePercentFromStamina` 1:1. */
function calculatePercentFromStamina(model: StaminaBar, stamina: number, ignoreDying = false): number {
	const dyingStamina = Math.floor((model.max_stamina ?? 0) / 2);
	const totalStamina = (model.max_stamina ?? 0) + dyingStamina;
	const absoluteStamina = ignoreDying ? stamina : stamina + dyingStamina;
	return (absoluteStamina / totalStamina) * 100;
}

/** Ports StaminaBar.vue's `barColor` computed 1:1. */
function barColor(model: StaminaBar): string {
	const current = model.current_stamina ?? 0;
	if (current <= 0) return 'var(--stamina-bar-color-dying)';
	if (current < Math.floor((model.max_stamina ?? 0) / 2)) return 'var(--stamina-bar-color-winded)';
	return 'var(--stamina-bar-color)';
}

/** Ports StaminaBar.vue's `overlayWidth` computed 1:1. */
function overlayWidthPercent(model: StaminaBar): number {
	return calculatePercentFromStamina(model, Math.floor((model.max_stamina ?? 0) / 2), true);
}

export class StaminaBarView extends ElementView<StaminaBar> {
	private indicatorEl!: HTMLElement;
	private tempIndicatorEl!: HTMLElement;
	private dyingOverlayEl!: HTMLElement;
	private windedOverlayEl!: HTMLElement;
	private pillEl!: HTMLElement;

	protected onMount(root: HTMLElement, model: StaminaBar): void {
		mountComponentWrapper(root, this, {
			componentName: 'Stamina Bar',
			// Legacy quirk preserved verbatim (D1 spec §"Step 3"): StaminaBar.vue always
			// passed `!disable_click` — never `model.collapsible` — as ComponentWrapper's
			// `collapsible` prop, and `disable_click` was only ever set (to true) by the
			// now-deleted StaminaEditModal.vue's embedded preview. In every reachable
			// production render (the code-block processor path) `disable_click` was always
			// undefined, so `collapsible` was always `true`. Not session-tracked (unlike
			// Skills' whole-element collapse) — matches the D1 spec's "F1 interface used"
			// list, which omits RenderContext.session for this element: each mount starts
			// fresh from collapse_default, exactly as the Vue component (recreated fresh by
			// createApp on every postprocessor run) did.
			collapsible: true,
			collapsed: model.collapse_default,
			renderContent: (contentEl) => this.renderBar(contentEl, model),
			onToggle: () => {},
		});
	}

	private renderBar(container: HTMLElement, model: StaminaBar): void {
		if (model.style === 'sheet') {
			container.createDiv({ cls: 'ds-stamina-bar-sheet-notice', text: SHEET_STYLE_NOTICE });
			return;
		}

		const canPersist = this.cx.host.canPersist;
		const bar = container.createDiv({ cls: canPersist ? 'ds-stamina-bar clickable' : 'ds-stamina-bar' });
		bar.style.height = `calc(${model.height ?? 1}em + 4px)`;

		const staminaContainer = bar.createSpan({ cls: 'ds-stamina-bar-stamina-container' });
		this.indicatorEl = staminaContainer.createDiv({ cls: 'ds-stamina-bar-indicator' });

		const tempContainer = bar.createSpan({ cls: 'ds-stamina-bar-temp-container' });
		this.tempIndicatorEl = tempContainer.createDiv({ cls: 'ds-stamina-bar-temp-indicator' });

		const overlayContainer = bar.createSpan({ cls: 'ds-stamina-bar-overlay-container' });
		this.dyingOverlayEl = overlayContainer.createDiv({ cls: 'ds-stamina-bar-dying-overlay' });
		this.dyingOverlayEl.createSpan({ cls: 'background-pill', text: 'Dying' });
		this.windedOverlayEl = overlayContainer.createDiv({ cls: 'ds-stamina-bar-winded-overlay' });
		this.windedOverlayEl.createSpan({ cls: 'background-pill', text: 'Winded' });
		const staminaOverlay = overlayContainer.createDiv({ cls: 'ds-stamina-bar-stamina-overlay' });
		this.pillEl = staminaOverlay.createSpan({ cls: 'background-pill' });

		this.updateBarDisplay(model);

		// F1 §4.4: canPersist === false (embeds, print/export, hover popovers, unresolvable
		// canvas nodes) -> render read-only (visible but inert) instead of a dead-end click.
		if (canPersist) {
			this.registerDomEvent(bar, 'click', () => this.openEditModal());
		} else {
			setTooltip(bar, READ_ONLY_TOOLTIP);
		}
	}

	/**
	 * Targeted DOM update (F1 §6 "explicit targeted update methods", no reactivity lib) —
	 * applies StaminaBar.vue's barColor/overlayWidth/calculatePercentFromStamina computed
	 * properties imperatively, in place, without rebuilding the DOM. Called once at mount
	 * and again after every modal edit.
	 */
	private updateBarDisplay(model: StaminaBar): void {
		const current = model.current_stamina ?? 0;
		const temp = model.temp_stamina ?? 0;
		const max = model.max_stamina ?? 0;

		this.indicatorEl.style.width = `calc(${calculatePercentFromStamina(model, current)}% - 2px)`;
		this.indicatorEl.style.backgroundColor = barColor(model);
		this.tempIndicatorEl.style.width = `calc(${calculatePercentFromStamina(model, temp, true)}% - 1px)`;

		const overlayPct = `${overlayWidthPercent(model)}%`;
		this.dyingOverlayEl.style.width = overlayPct;
		this.windedOverlayEl.style.width = overlayPct;

		// Fixes CB-17 (D1 spec): the SFC wrote `model?.temp_stamina??0 > 0`, which — due to
		// `??` binding looser than `>` — actually parses as `model?.temp_stamina ?? (0 > 0)`
		// i.e. `model?.temp_stamina ?? false`, NOT the intended "> 0" comparison. Replaced
		// here with the correct, explicit check.
		this.pillEl.setText(`(${current}/${max}${temp > 0 ? ' + ' + temp : ''})`);
	}

	private openEditModal(): void {
		const modal = new StaminaEditModal(this.cx.app, this.model, true, '', () => {
			this.updateBarDisplay(this.model);
			void this.persist();
		});
		// F1 §4.5: a modal opened by a view must be closed on view unload.
		this.register(() => modal.close());
		modal.open();
	}
}
