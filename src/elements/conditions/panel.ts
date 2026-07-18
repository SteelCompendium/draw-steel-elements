// D7 Task 2 (spec §4.4/§2.4) — ConditionsPanel: the presentational HeroPanel<Condition[]>
// core for ds-conditions (and, later, the ds-hero flagship's Conditions slot, spec §2.3's
// composition table). Renders one `.dse-cond-chip` per entry — icon (kit
// buildConditionIcons, static/read mode: the chip's own ✕ handles removal, not the icon
// click, unlike the initiative tracker's compact icon-only row) + name + a duration badge
// for the three known values (save-ends/EoT/EoE, spec §1.5) + remove ✕. "+ add condition"
// opens the SAME AddConditionsModal/CustomizeConditionModal the initiative tracker uses
// (§2.4), now widened to accept a minimal `ConditionHolder` (`{conditions}`) instead of a
// fabricated Hero/CreatureInstance (recon delta 7 — see ConditionSelectModal.ts).
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
import type { Condition, ConditionHolder } from '@drawSteelAdmonition/EncounterData';
import { ConditionManager } from '@utils/Conditions';
import { AddConditionsModal } from '@views/ConditionSelectModal';
import { HeroPanel, buildConditionIcons, iconButton, openManagedModal } from '@/framework/kit';

/** Normalizes an `effect` string for duration matching — case/whitespace-insensitive,
 *  since the field is free text (spec §4.4 gives no strict enum). */
function normalizedEffect(effect: string | undefined): string {
	return (effect ?? '').trim().toLowerCase();
}

/** The three known duration labels (spec §1.5/§4.4). Any other `effect` value (absent,
 *  or one of the customize-modal's CSS pulse names) shows no badge — this panel only
 *  recognizes duration semantics, never the initiative tracker's visual-effect
 *  vocabulary (applyConditionEffect, kit/conditionIcons.ts, still runs on the icon
 *  itself regardless — the two concerns ride the SAME field but don't conflict: an
 *  unrecognized value is a no-op for both). */
function durationBadgeText(effect: string | undefined): string | null {
	switch (normalizedEffect(effect)) {
		case 'save ends':
			return 'Save Ends';
		case 'eot':
			return 'EoT';
		case 'eoe':
			return 'EoE';
		default:
			return null;
	}
}

/** Only "save ends" offers the d10-save affordance (spec §4.4: "roll d10, 6+ ends"). */
function isSaveEnds(effect: string | undefined): boolean {
	return normalizedEffect(effect) === 'save ends';
}

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
		const displayName = config?.displayName ?? entry.key;
		const chipEl = this.stripEl.createDiv({ cls: 'dse-cond-chip' });

		// Icon: the kit core, in its STATIC (non-interactive) mode — this chip's own
		// remove ✕ handles removal, not a click on the icon (unlike the initiative
		// tracker's compact icon-only row).
		const iconHost = chipEl.createSpan({ cls: 'dse-cond-chip__icon' });
		buildConditionIcons(iconHost, [entry], this.mgr, { owner: this, canRemove: false });

		chipEl.createSpan({ cls: 'dse-cond-chip__name', text: displayName });

		const duration = durationBadgeText(entry.effect);
		if (duration) {
			chipEl.createSpan({ cls: 'dse-cond-chip__duration', text: duration });
		}

		if (isSaveEnds(entry.effect)) {
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

	private openAddModal(): void {
		const holder: ConditionHolder = { conditions: this.current };
		openManagedModal(
			this,
			() =>
				new AddConditionsModal(this.cx.app, holder, this.mgr, (added) => {
					this.onChange(this.current.concat(added));
				}),
		);
	}
}
