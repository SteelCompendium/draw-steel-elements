// Plan 09 Task 3 (D2 §3.5) — StaminaBarView on the D2 kit. The whole-element wrapper is
// the kit collapsible (title "Stamina Bar", seeded from collapse_default, NO
// SessionPersist — this element was never session-tracked: every mount starts fresh
// from the YAML, exactly as the Vue component did). The bar renders the .dse-stamina
// grammar: state COLOR via the [data-state] class rules on the --dse-stamina-* tokens,
// fill widths via --dse-fill/--dse-temp-fill setProperty geometry (SC-5 — zero inline
// colors/widths; the only .style use is `setProperty("--dse-*", …)`).
//
// D7 Task 1 (spec §2.1/§2.3): the actual `.dse-stamina` DOM construction + targeted
// update now live in the shared kit core (framework/kit/StaminaBarPanel.ts,
// renderStaminaBar/updateStaminaBar) — this view is a thin delegator that maps the
// StaminaBar model onto the kit's neutral {current, temp, max} shape. Zero behavior
// change: same DOM, same click/tooltip wiring, same targeted-update semantics.
//
// Clicking opens the unified managedModal StaminaEditModal (D2 §3.5b); the modal
// mutates `this.model` in place (it is handed the SAME object reference) and its
// updateCallback both refreshes the bar in place (targeted update, no rebuild) and
// schedules persist(). The serialize path (model.ts) is untouched — persisted YAML
// stays byte-compatible (F1 §6).
//
// D7 Task 4 (spec §4.2): the Recoveries/Winded extension, ADDITIVE and gated entirely
// on `model.recoveries_max !== undefined` (HARD INVARIANT: a legacy block with no
// recoveries* fields renders none of this — same DOM as before this task, byte for
// byte). renderRecoveries mounts a `.dse-stamina-rec` strip under the bar: a pip row
// (recoveries_max pips, the first `recoveries` filled), a winded/dying status badge,
// and a Catch Breath kit iconButton (RR §8 "Catch Breath (spend Recovery)": -1
// recovery, +recoveryValue Stamina, clamped to max; disabled when dying or no
// recoveries remain, per RR §8's "Can't Catch Breath [while dying]" and the obvious
// floor at 0). Every edit (Catch Breath, or a stamina change via the existing modal)
// funnels through the SAME targeted-update + persist() path as the base bar — no new
// write path.
import { ElementView } from '@/framework/view';
import { collapsible, iconButton, openManagedModal, renderStaminaBar, tooltip, updateStaminaBar } from '@/framework/kit';
import type { IconButtonHandle, StaminaBarValues } from '@/framework/kit';
import { StaminaBar, recoveryHealAmount } from '@model/StaminaBar';
import { StaminaEditModal } from '@views/StaminaEditModal';
import { resolveCollapsePrefs } from '@/prefs/catalog';

const READ_ONLY_TOOLTIP = 'Read-only in this context';

/** Title shown in the whole-element collapsible header (the old ComponentWrapper
 *  componentName, previously visible only in the collapsed rail). */
const WRAPPER_TITLE = 'Stamina Bar';

/** Maps the StaminaBar model's fields onto the kit's neutral value shape. */
function staminaValues(model: StaminaBar): StaminaBarValues {
	return {
		current: model.current_stamina ?? 0,
		temp: model.temp_stamina ?? 0,
		max: model.max_stamina ?? 0,
	};
}

export class StaminaBarView extends ElementView<StaminaBar> {
	private barEl: HTMLElement | null = null;
	// D7 Task 4: only populated when model.recoveries_max is defined (renderRecoveries's
	// early-return guard) — null on every legacy block, which is also how
	// updateRecoveries no-ops for them.
	private pipsEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private catchBreathHandle: IconButtonHandle | null = null;

	protected onMount(root: HTMLElement, model: StaminaBar): void {
		// Whole-element wrapper: ONE kit collapsible (replaces the old kit
		// ComponentWrapper). Legacy quirk preserved verbatim (D1 spec §"Step 3"):
		// StaminaBar.vue always passed `!disable_click` — never `model.collapsible` —
		// as ComponentWrapper's `collapsible` prop, and in every reachable production
		// render that was `true`, so the YAML `collapsible` flag is deliberately NOT
		// honored: the element is always collapsible. Seeded from collapse_default
		// with NO SessionPersist (unlike Skills): not session-tracked, matching the
		// legacy element. D4 §1.3 (Plan 13, amended): the collapse_default SEED now
		// falls back to the collapseDefault pref when the block doesn't set it — the
		// `collapsible` half of resolveCollapsePrefs's result is deliberately unused
		// here, preserving the same quirk.
		const { collapseDefault } = resolveCollapsePrefs(model, this.cx.prefs);
		const wrapper = collapsible(root, { title: WRAPPER_TITLE, open: !collapseDefault }, this);
		this.renderBar(wrapper.contentEl, model);
	}

	private renderBar(container: HTMLElement, model: StaminaBar): void {
		// Destructured (not `model.style`) so the SC-5 style guard's `.style` scan sees
		// only the sanctioned setProperty calls (now inside the kit core) — this is the
		// YAML `style` FIELD, not a DOM style access.
		const { style: renderStyle } = model;
		const canPersist = this.cx.host.canPersist;
		// F1 §4.4: canPersist === false (embeds, print/export, hover popovers, unresolvable
		// canvas nodes) -> render read-only (visible but inert) instead of a dead-end click.
		// collapsible hides (never rebuilds) its region, so the bar mounts exactly once
		// per onMount and view-bound listeners are correct (the old per-expand-cycle
		// contentOwner machinery is gone — same shift as Skills, Plan 09 Task 2).
		this.barEl = renderStaminaBar(container, staminaValues(model), {
			height: model.height,
			style: renderStyle,
			canPersist,
			owner: this,
			onClick: canPersist ? () => this.openEditModal() : undefined,
			readOnlyTooltip: READ_ONLY_TOOLTIP,
		});

		// D7 Task 4: gated entirely on recoveries_max presence — a legacy block (no
		// recoveries* fields) mounts none of this, matching the pre-Task-4 DOM exactly.
		if (model.recoveries_max !== undefined) {
			this.renderRecoveries(container, model);
		}
	}

	/**
	 * Targeted DOM update (F1 §6 "explicit targeted update methods", no reactivity lib),
	 * delegated to the kit core. Called once at mount (inside renderStaminaBar) and
	 * again after every modal edit / Catch Breath click. Also refreshes the D7 Task 4
	 * recoveries strip (winded/dying badge + Catch Breath disabled state track
	 * current_stamina too, not just Catch Breath's own edits).
	 */
	private updateBarDisplay(model: StaminaBar): void {
		if (this.barEl) updateStaminaBar(this.barEl, staminaValues(model));
		this.updateRecoveries(model);
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

	// -- D7 Task 4 (spec §4.2): the additive Recoveries/Winded strip --------------------

	/** Mounts the `.dse-stamina-rec` strip under the bar: recoveries pips, the
	 *  winded/dying status badge, and the Catch Breath control. Only ever called when
	 *  `model.recoveries_max !== undefined` (onMount's guard above). */
	private renderRecoveries(container: HTMLElement, model: StaminaBar): void {
		const canPersist = this.cx.host.canPersist;
		const wrap = container.createDiv({ cls: 'dse-stamina-rec' });

		this.statusEl = wrap.createDiv({ cls: 'dse-stamina-rec__status' });

		this.pipsEl = wrap.createDiv({ cls: 'dse-stamina-rec__pips' });
		for (let i = 0; i < (model.recoveries_max ?? 0); i++) {
			this.pipsEl.createDiv({ cls: 'dse-stamina-rec__pip' });
		}

		this.catchBreathHandle = iconButton(
			wrap,
			{
				icon: 'wind',
				label: 'Catch Breath',
				text: 'Catch Breath',
				onClick: () => this.catchBreath(),
			},
			this,
		);
		// F1 §4.4: canPersist === false renders read-only (visible but inert), same
		// convention as the bar's own click gate above.
		if (!canPersist) tooltip(this.catchBreathHandle.buttonEl, READ_ONLY_TOOLTIP);

		this.updateRecoveries(model);
	}

	/** Targeted, in-place refresh of the recoveries strip (pips fill state, badge
	 *  text/[data-state]/hidden, Catch Breath's real `disabled`) — no rebuild, matching
	 *  updateStaminaBar's convention. No-ops on a legacy block (renderRecoveries never
	 *  ran, so every element stays null). */
	private updateRecoveries(model: StaminaBar): void {
		if (!this.pipsEl || !this.statusEl || !this.catchBreathHandle) return;

		const remaining = model.recoveries ?? 0;
		this.pipsEl.querySelectorAll<HTMLElement>('.dse-stamina-rec__pip').forEach((pip, i) => {
			pip.toggleClass('dse-stamina-rec__pip--filled', i < remaining);
		});

		// RR §8: winded takes the "at half max or below" wording (`<=`); dying (`<= 0`)
		// implies winded too and takes display priority. See StaminaBar's isWinded/
		// isDying getters for the citation + the note on the pre-existing bar-fill
		// color threshold's separate (untouched) `<` convention.
		const state = model.isDying ? 'dying' : model.isWinded ? 'winded' : null;
		this.statusEl.hidden = state === null;
		if (state) {
			this.statusEl.setText(state === 'dying' ? 'Dying' : 'Winded');
			this.statusEl.setAttribute('data-state', state);
		} else {
			this.statusEl.setText('');
			this.statusEl.removeAttribute('data-state');
		}

		const canPersist = this.cx.host.canPersist;
		this.catchBreathHandle.setDisabled(!canPersist || model.isDying || remaining <= 0);
	}

	/** RR §8 "Catch Breath (spend Recovery)": -1 recovery, heal recoveryValue Stamina
	 *  (clamped to max_stamina — a heal never overshoots, same convention as
	 *  StaminaEditModal's amountToMaxStamina). Persists via the SAME debounced write
	 *  path as every other stamina edit. FOLLOWUPS #27-fix-round: the heal-amount math
	 *  is the shared recoveryHealAmount helper (also used by hero/view.ts's Catch Breath
	 *  and StaminaEditModal's Spend Recovery). */
	private catchBreath(): void {
		const model = this.model;
		const remaining = model.recoveries ?? 0;
		if (remaining <= 0 || model.isDying) return; // defensive: the button is disabled too

		model.recoveries = remaining - 1;
		model.current_stamina += recoveryHealAmount(model.recoveryValue, model.current_stamina, model.max_stamina);

		this.updateBarDisplay(model);
		void this.persist();
	}
}
