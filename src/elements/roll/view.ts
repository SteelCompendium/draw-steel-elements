// Plan 14 Task 5 (D5 §5.3) — RollView: the ds-roll card. Head (optional name) ·
// expression/difficulty caption · optional tier panel (t1/t2/t3/crit, highlights
// like the feature roller) · the ALWAYS-VISIBLE roll bar (authoring the block is
// the opt-in; rollingEnabled does not gate this element) · the result card.
// Results are session-ephemeral (OD-4): history/last-input in SessionStore, no
// container.empty() rebuild on roll — the result card is a targeted DOM update
// (F1 §2.1 principle 4). auto_roll rolls once on mount.
import { ElementView } from '@/framework/view';
import { cardHead, powerRollPanel, rollBar, rollResultCard } from '@/framework/kit';
import type { PowerRollPanelHandle, PowerRollRow, PowerRollTier, RollBarHandle, RollBarState } from '@/framework/kit';
import type { RollInput, RollResult } from '@/framework/roll/types';
import type { RollModel } from './model';

const LAST_SLOT = 'roll.lastInput.0';
const HISTORY_SLOT = 'roll.history.0';
const TIER_TO_ROW: readonly PowerRollTier[] = ['low', 'mid', 'high'];

export class RollView extends ElementView<RollModel> {
	private panel?: PowerRollPanelHandle;
	private bar?: RollBarHandle;
	private areaEl!: HTMLElement;
	private cardHostEl?: HTMLElement;

	protected onMount(root: HTMLElement, model: RollModel): void {
		this.panel = undefined;
		this.bar = undefined;
		this.cardHostEl = undefined;
		const service = this.cx.roll;
		const cardEl = root.createDiv({ cls: 'dse-roll' });

		if (model.name) cardHead(cardEl, { name: model.name, level: 3 }, this);
		const caption = [
			model.expressionText,
			model.difficulty ? `${model.difficulty} difficulty` : '',
		]
			.filter(Boolean)
			.join(' · ');
		if (caption) cardEl.createDiv({ cls: 'dse-roll__expr', text: caption });

		// Optional tier rows (§5.3): render + highlight exactly like the feature roller.
		const rows: PowerRollRow[] = [];
		if (model.tiers?.t1) rows.push({ tier: 'low', md: model.tiers.t1 });
		if (model.tiers?.t2) rows.push({ tier: 'mid', md: model.tiers.t2 });
		if (model.tiers?.t3) rows.push({ tier: 'high', md: model.tiers.t3 });
		if (model.crit) rows.push({ tier: 'crit', md: model.crit });
		if (rows.length > 0) {
			this.panel = powerRollPanel(
				cardEl,
				{ rows, head: false, renderMd: (md, el) => this.renderMarkdown(md, el) },
				this,
			);
		}

		this.areaEl = cardEl.createDiv({ cls: 'dse-roll-area' });
		if (!service) {
			// Defensive only — the pipeline always supplies cx.roll (Task 2); a bare
			// harness context without it degrades to a static card, never a throw.
			this.areaEl.createDiv({ cls: 'dse-roll__expr', text: 'Rolling unavailable.' });
			return;
		}

		const last = this.cx.session.get<Partial<RollBarState>>(this.blockKey(), LAST_SLOT);
		this.bar = rollBar(
			this.areaEl,
			{
				mode: model.mode,
				characteristicLabel: model.characteristicLabel,
				characteristicFixed: model.characteristicValue,
				initial: last ?? {
					skillBonus: model.skill ? 2 : 0,
					edges: model.edges,
					banes: model.banes,
				},
				showMainAction: true,
				mainAction: model.mainAction,
				onRoll: (state) => void this.doRoll(state),
			},
			this,
		);

		if (model.autoRoll) void this.doRoll(this.bar.getState());
	}

	private blockKey(): string {
		return this.cx.host.blockKey();
	}

	private async doRoll(state: RollBarState): Promise<void> {
		const service = this.cx.roll!;
		const model = this.model;
		this.cx.session.set(this.blockKey(), LAST_SLOT, state);
		const input: RollInput = {
			mode: model.mode,
			characteristic: model.characteristicValue ?? state.characteristic,
			skillBonus: state.skillBonus,
			flatBonus: model.bonus,
			edges: state.edges,
			banes: state.banes,
			isMainActionAbility: state.mainAction,
			flat: model.flat,
		};
		const result = await service.roll(input);
		const history = this.cx.session.get<RollResult[]>(this.blockKey(), HISTORY_SLOT) ?? [];
		this.cx.session.set(this.blockKey(), HISTORY_SLOT, [...history, result].slice(-10));

		if (this.panel) {
			let active: PowerRollTier[] | null = null;
			if (result.tier !== undefined) {
				active = [TIER_TO_ROW[result.tier - 1]];
				if (result.isCritical && this.panel.rowEls.crit) active.push('crit');
			}
			this.panel.setRollResult(active);
		}
		this.cardHostEl?.remove();
		this.cardHostEl = this.areaEl.createDiv();
		rollResultCard(
			this.cardHostEl,
			{
				result,
				delegate: service.delegate,
				onReroll: () => void this.doRoll(this.bar!.getState()),
				onClear: () => {
					this.panel?.setRollResult(null);
					this.cardHostEl?.remove();
					this.cardHostEl = undefined;
				},
			},
			this,
		);
	}
}
