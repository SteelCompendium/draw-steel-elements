// D7 Task 2 (spec §4.4/§2.4) — ConditionsPanel: the presentational HeroPanel<Condition[]>
// core for ds-conditions (and, later, the ds-hero flagship's Conditions slot, spec §2.3's
// composition table). Renders one `.dse-cond-chip` per entry — icon (kit
// buildConditionIcons, static/read mode: the chip's own ✕ handles removal, not the icon
// click, unlike the initiative tracker's compact icon-only row) + name + a duration badge
// for the three known values (save-ends/EoT/EoE, spec §1.5) + remove ✕. "+ add condition"
// opens the SAME ConditionsModal (SC-186) the initiative tracker uses — see below and
// recon delta 7 (ConditionsModal.ts) for the minimal `ConditionHolder` (`{conditions}`)
// widening that keeps this panel from fabricating a Hero/CreatureInstance.
//
// Data flow follows §2.2 exactly: this panel NEVER mutates its own `current` slice on a
// user action — it computes the next array and calls `onChange(patch)`, letting the
// container mutate `model.conditions` and call `updatePanel(next)` back down. That keeps
// exactly one re-render per mutation (no self-render + container-render double-paint) and
// matches the initiative tracker's own "container.empty() + rebuild" granularity for
// condition lists (buildConditionIcons's caller, initiative/view.ts).
//
// Save-ends chips offer a d10 save through `this.host.roll` (PanelHost.roll, D5's
// RollService.resolve — sync, native dice by default) when the container wired one in;
// otherwise a plain `window.confirm` stands in (spec §4.4: "delegating to D5's roller
// when present; else a simple prompt"). Rolling always computes/display a result — even
// read-only, per F1 §4.4/D7 §3's "Rolls (view-only) still work" — but only REMOVES the
// condition (a write) when `!host.readOnly`.
//
// SC-186: "+ add condition" now opens ConditionsModal (the Option D manager modal,
// src/views/ConditionsModal.ts) instead of the retired AddConditionsModal/
// CustomizeConditionModal two-modal flow. It manages the FULL active list live (add,
// delete, customize all apply immediately via onChange) rather than staging an
// additive "Add Conditions" set, so this panel's onChange callback now REPLACES
// `this.current` with the modal's updated list rather than concatenating.
import type { Condition, ConditionHolder } from '@drawSteelAdmonition/EncounterData';
import { ConditionManager } from '@utils/Conditions';
import { ConditionsModal } from '@views/ConditionsModal';
import { resolveDuration, durationBadgeText, isSaveEnds } from '@/elements/conditionDuration';
import { titleCaseConditionKey } from '@/elements/conditionDisplay';
import { HeroPanel, buildConditionIcons, iconButton, openManagedModal } from '@/framework/kit';

export class ConditionsPanel extends HeroPanel<Condition[]> {
	private readonly mgr = new ConditionManager();
	private stripEl!: HTMLElement;
	private current: Condition[] = [];
	private onChange!: (patch: Partial<Condition[]>) => void;

	mountPanel(root: HTMLElement, slice: Condition[], onChange: (patch: Partial<Condition[]>) => void): void {
		this.onChange = onChange;
		this.current = slice;
		root.addClass('dse-cond-panel');
		this.stripEl = root.createDiv({ cls: 'dse-cond-strip' });
		this.renderChips();

		if (!this.host.readOnly) {
			const addBtn = iconButton(
				root,
				{
					icon: 'plus-circle',
					label: 'Add condition',
					text: '+ add condition',
					variant: 'ghost',
					onClick: () => this.openAddModal(),
				},
				this,
			);
			addBtn.buttonEl.addClass('dse-cond-strip__add');
		}
	}

	/** Applies an externally-changed slice in place: re-renders just the chip strip,
	 *  leaving the (already-mounted) "+ add condition" affordance untouched. */
	updatePanel(slice: Condition[]): void {
		this.current = slice;
		this.renderChips();
	}

	private renderChips(): void {
		this.stripEl.empty();
		for (const entry of this.current) {
			this.renderChip(entry);
		}
	}

	private renderChip(entry: Condition): void {
		const config = this.mgr.getAnyConditionByKey(entry.key);
		const displayName = config?.displayName ?? titleCaseConditionKey(entry.key);
		const chipEl = this.stripEl.createDiv({ cls: 'dse-cond-chip' });

		// Icon: the kit core, in its STATIC (non-interactive) mode — this chip's own
		// remove ✕ handles removal, not a click on the icon (unlike the initiative
		// tracker's compact icon-only row).
		const iconHost = chipEl.createSpan({ cls: 'dse-cond-chip__icon' });
		buildConditionIcons(iconHost, [entry], this.mgr, { owner: this, canRemove: false });

		chipEl.createSpan({ cls: 'dse-cond-chip__name', text: displayName });

		const duration = resolveDuration(entry);
		const durationText = durationBadgeText(duration);
		if (durationText) {
			chipEl.createSpan({ cls: 'dse-cond-chip__duration', text: durationText });
		}

		if (isSaveEnds(duration)) {
			const resultEl = chipEl.createSpan({ cls: 'dse-cond-chip__save-result' });
			const saveBtn = iconButton(
				chipEl,
				{
					icon: 'dices',
					label: `Roll save vs ${displayName}`,
					tooltip: 'Roll save (6+ ends)',
					variant: 'ghost',
					onClick: () => this.rollSave(entry, displayName, resultEl),
				},
				this,
			);
			saveBtn.buttonEl.addClass('dse-cond-chip__save');
		}

		if (!this.host.readOnly) {
			const removeBtn = iconButton(
				chipEl,
				{
					icon: 'x',
					label: `Remove condition: ${displayName}`,
					tooltip: 'Remove',
					variant: 'ghost',
					onClick: () => this.removeCondition(entry),
				},
				this,
			);
			removeBtn.buttonEl.addClass('dse-cond-chip__remove');
		}
	}

	private removeCondition(entry: Condition): void {
		const next = this.current.filter((c) => c !== entry);
		this.onChange(next);
	}

	/** spec §4.4: a d10 save via `host.roll` (RollService.resolve) when present, else a
	 *  plain confirm prompt. Computing/showing a result always works (F1 §4.4 "rolls
	 *  view-only still work"); only ending the condition on a 6+ is gated on write. */
	private rollSave(entry: Condition, displayName: string, resultEl: HTMLElement): void {
		if (this.host.roll) {
			const result = this.host.roll.resolve({ mode: 'flat', flat: { count: 1, sides: 10 } });
			resultEl.setText(`(${result.total})`);
			if (result.total >= 6 && !this.host.readOnly) this.removeCondition(entry);
			return;
		}
		if (this.host.readOnly) return;
		const confirmFn = typeof window !== 'undefined' ? window.confirm : undefined;
		const ended = confirmFn ? confirmFn(`Save vs ${displayName}: rolled 6+ and it ends?`) : false;
		if (ended) this.removeCondition(entry);
	}

	// SC-186 fix-round HIGH-4: ConditionsModal applies live (onChange fires on every
	// add/delete/customize, not just Done), but `this.onChange` is the CONTAINER's
	// persist-triggering callback — calling it mid-session schedules a debounced
	// `ElementView.persist()` that, ~400ms later, does a real `host.replaceSource()`.
	// In reading mode that echo-rebuilds this element's block: the pipeline unloads the
	// OLD ConditionsPanel (this) and mounts a fresh one, and `openManagedModal`'s
	// `owner.register(() => modal.close())` fires on that unload — closing the
	// STILL-OPEN modal out from under the user, mid-edit. Fix: keep the strip visually
	// live via `updatePanel` (a pure DOM refresh, no persist) on every change, but defer
	// the actual persisting `this.onChange(...)` call to modal CLOSE (Done, Escape, or
	// any other dismissal) — by then there is nothing left to unload out from under.
	// The initiative tracker's own modal-opening path (`InitiativeView.openModal`) needs
	// no equivalent fix: it never calls `openManagedModal`, so nothing there registers
	// an owner-unload auto-close in the first place.
	private openAddModal(): void {
		const holder: ConditionHolder = { conditions: this.current };
		let pendingList: Condition[] | null = null;
		const modal = openManagedModal(
			this,
			() =>
				new ConditionsModal(this.cx.app, holder, this.mgr, (updated) => {
					pendingList = updated;
					this.updatePanel(updated);
				}),
		);
		const inheritedOnClose = modal.onClose.bind(modal) as () => void;
		modal.onClose = () => {
			inheritedOnClose();
			if (pendingList) this.onChange(pendingList);
		};
	}
}
