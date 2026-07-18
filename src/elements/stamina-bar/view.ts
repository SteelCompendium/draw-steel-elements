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
import { ElementView } from '@/framework/view';
import { collapsible, openManagedModal, renderStaminaBar, updateStaminaBar } from '@/framework/kit';
import type { StaminaBarValues } from '@/framework/kit';
import { StaminaBar } from '@model/StaminaBar';
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
	}

	/**
	 * Targeted DOM update (F1 §6 "explicit targeted update methods", no reactivity lib),
	 * delegated to the kit core. Called once at mount (inside renderStaminaBar) and
	 * again after every modal edit.
	 */
	private updateBarDisplay(model: StaminaBar): void {
		if (this.barEl) updateStaminaBar(this.barEl, staminaValues(model));
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
