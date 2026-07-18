// D8 Task 8 (spec §6) — PartyView: the ds-party tracker, the hub other subsystems read
// from (Encounter Builder's hero_count/hero_level §2, Initiative's heroes[] seed, Victory
// payouts from Encounter/Montage §4/§7 — spec §6.2's own "party-wide 'award N victories'
// fed from Encounter/Montage payouts"). No compendium dep, no roll dep — a pure tracker,
// on the same cardHead + per-row + canPersist-gated action-bar shape as
// montage/RoundTrackView + project/view.ts.
//
// XP-per-Victory rate (spec §6.1, OD-2 sibling): NOT in the workspace reference — only
// the qualitative "Victories -> XP at respite" chain (REF line 310). "Convert victories to
// XP (respite)" therefore tracks the EVENT (a Notice, same idiom as
// montage/ParticipantsView's skill-reuse warning) and zeroes every member's victories; it
// never invents a rate to compute an XP delta (default OD-2(a) — the brief's explicit
// instruction). XP itself stays a manually-entered stepper (the GM's own call, sourced
// from whatever the table's rules use).
//
// Renown/Wealth hints (REF §11 lines 334-338 / §13, AGENT lines 962-1005): follower
// thresholds (3/6/9/12 -> 1/2/3/4, model.ts's followerCount) are an EXACT table in the
// reference, so the hint states the count outright. Wealth's "+1 every ~2 levels" and
// Renown's "~+1/level" are stated as approximate RATES, not a level->value formula — so
// the wealth/echelon hint surfaces the member's echelon (an exact table, model.ts's
// echelonForLevel) and the abstract 1-6 bound, rather than computing a fabricated
// "expected wealth at this level" number the reference never states as a formula.
import { Component, Notice } from 'obsidian';
import { ElementView } from '@/framework/view';
import { cardHead, iconButton, stepper } from '@/framework/kit';
import type { StepperHandle } from '@/framework/kit';
import type { PartyMember, PartyModel } from './model';
import { WEALTH_MIN, WEALTH_MAX, followerCount, echelonForLevel } from './model';

const ECHELON_ORDINAL: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };

export class PartyView extends ElementView<PartyModel> {
	protected async onMount(root: HTMLElement, model: PartyModel): Promise<void> {
		// Per-mount listener owner (F1 §4.5): torn down by the framework's default
		// update() (unloadOwnedChildren + rootEl.empty() + onMount again) before the next
		// onMount runs, so nothing accumulates across award/convert/stepper-driven
		// rebuilds — same convention as montage/project's cycleOwner.
		const cycleOwner = this.addChild(new Component());
		const canPersist = this.cx.host.canPersist;

		const container = root.createDiv({ cls: 'dse-party' });

		cardHead(container.createDiv({ cls: 'dse-party__head' }), { name: 'Party', level: 2 }, cycleOwner);

		const membersEl = container.createDiv({ cls: 'dse-party__members' });
		for (const member of model.members) {
			await this.buildMember(membersEl, cycleOwner, member, canPersist);
		}

		this.buildPartyPool(container, cycleOwner, model, canPersist);
		this.buildPartyActions(container, cycleOwner, model, canPersist);
	}

	// ------------------------------------------------------------------------- members

	private async buildMember(parent: HTMLElement, owner: Component, member: PartyMember, canPersist: boolean): Promise<void> {
		const row = parent.createDiv({ cls: 'dse-party__member' });

		const head = row.createDiv({ cls: 'dse-party__member-head' });
		head.createDiv({ cls: 'dse-party__member-name', text: member.name });

		const deck = [member.level !== undefined ? `Level ${member.level}` : undefined, member.class, member.ancestry]
			.filter((part): part is string => !!part)
			.join(' · ');
		if (deck) head.createDiv({ cls: 'dse-party__member-deck', text: deck });

		if (member.hero_ref) {
			await this.renderMarkdown(member.hero_ref, head.createDiv({ cls: 'dse-party__member-ref' }));
		}

		const stats = row.createDiv({ cls: 'dse-party__stats' });

		this.buildStat(stats, owner, member.name, 'Victories', member.victories ?? 0, canPersist, {
			min: 0,
			onChange: (value) => this.mutateMember(member, 'victories', value),
		});

		// Manual entry — no XP-per-Victory rate is invented (spec §6.1); the GM steps
		// this in directly (typically right after "Convert victories to XP").
		this.buildStat(stats, owner, member.name, 'XP', member.xp ?? 0, canPersist, {
			min: 0,
			onChange: (value) => this.mutateMember(member, 'xp', value),
		});

		// `let` + assign-after (not `const` alongside buildStat): the hint div renders
		// AFTER its stepper (DOM order matches Victories/XP above it), but onChange needs
		// to close over it. Safe: onChange only ever fires from a later user click, well
		// after this synchronous construction completes and the assignment below runs.
		let renownHint: HTMLElement;
		this.buildStat(stats, owner, member.name, 'Renown', member.renown ?? 0, canPersist, {
			min: 0,
			onChange: (value) => {
				this.mutateMember(member, 'renown', value);
				renownHint.setText(this.followerHintText(value));
			},
		});
		renownHint = stats.createDiv({ cls: 'dse-party__hint', text: this.followerHintText(member.renown ?? 0) });

		this.buildStat(stats, owner, member.name, 'Wealth', member.wealth ?? 0, canPersist, {
			min: WEALTH_MIN,
			max: WEALTH_MAX,
			clampInitial: false, // a stored out-of-range wealth displays as stored (Counter's convention)
			onChange: (value) => this.mutateMember(member, 'wealth', value),
		});
		stats.createDiv({ cls: 'dse-party__hint', text: this.echelonHintText(member.level) });
	}

	private buildStat(
		parent: HTMLElement,
		owner: Component,
		memberName: string,
		label: string,
		value: number,
		canPersist: boolean,
		opts: { min?: number; max?: number; clampInitial?: boolean; onChange: (value: number) => void },
	): StepperHandle {
		const wrap = parent.createDiv({ cls: 'dse-party__stat' });
		wrap.createDiv({ cls: 'dse-party__stat-label', text: label });
		const handle = stepper(
			wrap,
			{
				value,
				min: opts.min,
				max: opts.max,
				clampInitial: opts.clampInitial,
				editable: canPersist,
				integer: true,
				// Unique per member (montage's `${participant.name}'s skill` convention) —
				// two members' Victories steppers must not collide on aria-label/selector.
				label: `${memberName}'s ${label}`,
				onChange: opts.onChange,
			},
			owner,
		);
		// F1 §4.4: read-only hosts REAL-disable every stepper button (the kit stepper has
		// no built-in "editable disables the buttons too" behavior — same gap
		// Counter/RoundTrackView paper over the same way).
		if (!canPersist) {
			handle.rootEl.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
				btn.disabled = true;
			});
		}
		return handle;
	}

	private mutateMember(member: PartyMember, field: 'victories' | 'xp' | 'renown' | 'wealth', value: number): void {
		member[field] = value;
		void this.persist();
	}

	/** REF §11/§13, AGENT 962-1005 — exact follower thresholds; 0 followers reads as "no
	 *  followers yet" rather than an empty string, so the hint is never silently blank. */
	private followerHintText(renown: number): string {
		const count = followerCount(renown);
		if (count === 0) return 'No followers yet (next at 3 Renown)';
		return `${count} follower${count === 1 ? '' : 's'}`;
	}

	/** REF §13, AGENT 993-1005 — the member's echelon (an exact level->echelon table), plus
	 *  the abstract Wealth bound; never a fabricated "expected wealth at this level"
	 *  number (the reference states Wealth's growth as an approximate rate, not a
	 *  formula). */
	private echelonHintText(level: number | undefined): string {
		const echelon = echelonForLevel(level);
		const bound = `Wealth 1-6`;
		return echelon === null ? bound : `${ECHELON_ORDINAL[echelon]} echelon · ${bound}`;
	}

	// -------------------------------------------------------------------- party actions

	/** Party-wide pool data: hero_tokens stepper (always visible, real-disabled when
	 *  read-only). Unlike actions below, this is data (not a write affordance), so it stays
	 *  visible per F1 §4.4 — matching the per-member stat convention above. */
	private buildPartyPool(container: HTMLElement, owner: Component, model: PartyModel, canPersist: boolean): void {
		const tokensWrap = container.createDiv({ cls: 'dse-party__tokens' });
		tokensWrap.createDiv({ cls: 'dse-party__stat-label', text: 'Hero tokens' });
		const handle = stepper(
			tokensWrap,
			{
				value: model.party?.hero_tokens ?? 0,
				min: 0,
				editable: canPersist,
				integer: true,
				label: 'Hero tokens',
				onChange: (value) => {
					this.model.party = { ...(this.model.party ?? {}), hero_tokens: value };
					void this.persist();
				},
			},
			owner,
		);
		// F1 §4.4: read-only hosts REAL-disable every stepper button
		if (!canPersist) {
			handle.rootEl.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
				btn.disabled = true;
			});
		}
	}

	/** F1 §4.4: no dead-end write affordance on a read-only host — action buttons (award,
	 *  convert) do not mount; per-member + pool data (stats, hero_tokens) still render
	 *  above, visible-but-disabled. */
	private buildPartyActions(container: HTMLElement, owner: Component, model: PartyModel, canPersist: boolean): void {
		if (!canPersist) return;
		const bar = container.createDiv({ cls: 'dse-party__actions' });

		this.buildAwardVictories(bar, owner, model);

		iconButton(
			bar,
			{
				icon: 'moon',
				label: 'Convert victories to XP (respite)',
				text: 'Convert victories to XP (respite)',
				onClick: () => this.convertVictoriesToXp(),
			},
			owner,
		);
	}

	/** Party-wide "award N victories" (spec §6.2: "fed from Encounter/Montage payouts") —
	 *  adds the entered amount to EVERY member's victories, rebuilds, persists. */
	private buildAwardVictories(parent: HTMLElement, owner: Component, model: PartyModel): void {
		const form = parent.createDiv({ cls: 'dse-party__award-form' });
		const input = form.createEl('input', { cls: 'dse-party__award-input', type: 'number', value: '1' });
		input.setAttribute('aria-label', 'Victories to award');

		iconButton(
			form,
			{
				icon: 'plus',
				label: 'Award victories to the party',
				text: 'Award victories',
				onClick: () => {
					const amount = Math.max(0, Math.floor(Number(input.value) || 0));
					if (amount === 0) return;
					for (const member of model.members) {
						member.victories = (member.victories ?? 0) + amount;
					}
					void this.update(this.model);
					void this.persist();
				},
			},
			owner,
		);
	}

	/** "Convert victories to XP (respite)" (spec §6.1/§6.2, OD-2(a) default): zeroes every
	 *  member's victories and surfaces a Notice recording the conversion event — the GM
	 *  enters the resulting XP manually via each member's XP stepper, since no
	 *  XP-per-Victory rate exists in the workspace reference to compute it. */
	private convertVictoriesToXp(): void {
		const total = this.model.members.reduce((sum, member) => sum + (member.victories ?? 0), 0);
		for (const member of this.model.members) {
			member.victories = 0;
		}
		new Notice(
			total > 0
				? `Converted ${total} victor${total === 1 ? 'y' : 'ies'} to XP at respite — enter earned XP manually (no rate is set).`
				: 'Respite: no victories to convert.',
		);
		void this.update(this.model);
		void this.persist();
	}
}
