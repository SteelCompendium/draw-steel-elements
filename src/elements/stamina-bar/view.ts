// Plan 09 Task 3 (D2 §3.5) — StaminaBarView on the D2 kit.
//
// SC-169 round 2 (Scott's ruling 3) REMOVED this view's whole-element wrapper: it used to
// mount a kit collapsible titled "Stamina Bar", seeded from `collapse_default`, with NO
// SessionPersist. Framework chrome now owns whole-element collapse for every card element
// — see onMount for what moved and what that changed. The bar renders the .dse-stamina
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
import {
	openManagedModal,
	renderRecoveriesStrip,
	renderStaminaBar,
	undoNotice,
	updateStaminaBar,
} from '@/framework/kit';
import type { RecoveriesStripHandle, StaminaBarValues } from '@/framework/kit';
import { StaminaBar, recoveryHealAmount } from '@model/StaminaBar';
import { StaminaEditModal } from '@views/StaminaEditModal';

const READ_ONLY_TOOLTIP = 'Read-only in this context';

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
	/** The `.dse-stamina__cluster` plate — the framed card (see authoringAnchor below). */
	private cardEl: HTMLElement | null = null;
	// D7 Task 4: only populated when model.recoveries_max is defined (renderRecoveries's
	// early-return guard) — null on every legacy block, which is also how
	// updateRecoveries no-ops for them.
	private recStrip: RecoveriesStripHandle | null = null;

	protected onMount(root: HTMLElement, model: StaminaBar): void {
		// SC-169 round 2, Scott's ruling 3: "Remove the old. Replace with the consistent
		// option that all card elements use."
		//
		// This element used to wrap itself in a kit `collapsible()` — a "Stamina Bar"
		// disclosure header above the framed bar, seeded from `collapse_default`, whose only
		// job was whole-element collapse. Framework chrome (SC-169) now provides exactly that
		// for every card element, so the header was a SECOND collapse mechanism on the same
		// element with a different look, a different affordance and a different (non-session)
		// persistence rule. It is gone; the bar mounts straight onto root.
		//
		// The two YAML keys the header consumed did NOT go away — they were promoted. A block
		// with `collapse_default: true` still starts collapsed and a block with
		// `collapsible: false` still cannot be collapsed; both are now read by the framework
		// (definition.ts's `collapseKeysOwnedByModel`, framework/chrome/collapsedKey.ts) and
		// answered by the panel. Two deliberate behaviour changes come with that:
		//   - the collapsed form is the standard one-line summary ("Stamina (15/20)"), not a
		//     bare titled header;
		//   - `collapsible: false` is now HONOURED. The legacy quirk (D1 spec §"Step 3":
		//     StaminaBar.vue always passed `!disable_click`, never `model.collapsible`, so
		//     the flag was dead weight) is retired — a key that has always been in the schema
		//     and documented as "whether the component can be collapsed or not" should mean
		//     what it says.
		// A user's live toggle is now session-persisted like every other element's, where the
		// old wrapper deliberately passed no SessionPersist.
		this.renderBar(root, model);
	}

	/** SC-145's contract (ElementView.authoringAnchor) — "the node that carries the
	 *  element's visible card frame". For this element that is the `.dse-stamina__cluster`
	 *  plate: the state-coloured (amber winded / red dying) 1px frame a reader sees. SC-169
	 *  round 2 reads it as the node the menu panel is seated ABOVE, which is what keeps the
	 *  panel from cropping that coloured border. Falls back to root before the bar exists. */
	authoringAnchor(): HTMLElement {
		return this.cardEl ?? this.rootEl;
	}

	private renderBar(container: HTMLElement, model: StaminaBar): void {
		// Destructured (not `model.style`) so the SC-5 style guard's `.style` scan sees
		// only the sanctioned setProperty calls (now inside the kit core) — this is the
		// YAML `style` FIELD, not a DOM style access.
		const { style: renderStyle } = model;
		const canPersist = this.cx.host.canPersist;
		// F1 §4.4: canPersist === false (print/export, hover popovers, unresolvable canvas
		// nodes — NOT embeds, which resolve canPersist === true; see BlockHost.ts's own
		// canPersist doc, SC-184 fix round) -> render read-only (visible but inert) instead
		// of a dead-end click.
		// The bar mounts exactly once per onMount, so view-bound listeners are correct (the
		// old per-expand-cycle contentOwner machinery is gone — same shift as Skills, Plan 09
		// Task 2); chrome's collapse HIDES the mounted DOM rather than rebuilding it, so that
		// stays true.
		this.barEl = renderStaminaBar(container, staminaValues(model), {
			height: model.height,
			style: renderStyle,
			canPersist,
			owner: this,
			onClick: canPersist ? () => this.openEditModal() : undefined,
			readOnlyTooltip: READ_ONLY_TOOLTIP,
		});
		// SC-169 round 2: the chrome/authoring anchor. `.dse-stamina__cluster` is the plate
		// that draws the visible (and, when winded/dying, state-coloured) 1px frame — see
		// authoringAnchor(). Null on the `style: sheet` branch, which renders a notice and no
		// bar at all; the fallback to root is then correct.
		this.cardEl = this.barEl?.querySelector<HTMLElement>('.dse-stamina__cluster') ?? null;

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
	//    SC-132: the strip itself is now the shared kit widget (framework/kit/
	//    RecoveriesStrip.ts) — the hero sheet mounts the same one. This view keeps what it
	//    always owned: the MODEL, the winded/dying derivation and the persist path.

	/** Mounts the `.dse-stamina-rec` strip under the bar. Only ever called when
	 *  `model.recoveries_max !== undefined` (onMount's guard above). */
	private renderRecoveries(container: HTMLElement, model: StaminaBar): void {
		const canPersist = this.cx.host.canPersist;
		this.recStrip = renderRecoveriesStrip(container, {
			max: model.recoveries_max ?? 0,
			canPersist,
			owner: this,
			onSetRemaining: (n) => this.setRecoveries(n),
			onCatchBreath: () => this.catchBreath(),
			// SC-132 Model M, the ALT editor: a global preference, off by default.
			popoverEditor: this.cx.prefs.get('staminaRecoveryPopover'),
			readOnlyTooltip: READ_ONLY_TOOLTIP,
		});
		this.updateRecoveries(model);
	}

	/** Targeted, in-place refresh of the recoveries strip. No-ops on a legacy block
	 *  (renderRecoveries never ran, so the handle stays null). */
	private updateRecoveries(model: StaminaBar): void {
		if (!this.recStrip) return;
		const remaining = model.recoveries ?? 0;
		// RR §8: winded takes the "at half max or below" wording (`<=`); dying (`<= 0`)
		// implies winded too and takes display priority. See StaminaBar's isWinded/
		// isDying getters for the citation.
		this.recStrip.update({
			remaining,
			wound: model.isDying ? 'dying' : model.isWinded ? 'winded' : null,
			catchBreathDisabled: !this.cx.host.canPersist || model.isDying || remaining <= 0,
		});
	}

	/** SC-132 Model M: the markers SET the count. Every mutation posts an undo toast —
	 *  the answer to "I dont want a missclick to be super punishing". */
	private setRecoveries(next: number): void {
		const model = this.model;
		const before = model.recoveries ?? 0;
		if (next === before) return;
		model.recoveries = next;
		this.updateBarDisplay(model);
		void this.persist();
		undoNotice(`Recoveries: ${before} → ${next}`, () => {
			model.recoveries = before;
			this.updateBarDisplay(model);
			void this.persist();
		});
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

		const beforeStamina = model.current_stamina;
		const healed = recoveryHealAmount(model.recoveryValue, model.current_stamina, model.max_stamina);
		model.recoveries = remaining - 1;
		model.current_stamina += healed;

		this.updateBarDisplay(model);
		void this.persist();
		undoNotice(`Caught breath: +${healed} Stamina, −1 Recovery`, () => {
			model.recoveries = remaining;
			model.current_stamina = beforeStamina;
			this.updateBarDisplay(model);
			void this.persist();
		});
	}
}
