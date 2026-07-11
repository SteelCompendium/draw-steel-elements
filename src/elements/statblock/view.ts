// Plan 09 Task 6b (D2 §3.8) — StatblockElementView on the D2 kit card grammar.
//
// Re-cast from the folded legacy buildUI sub-view calls (Common/HeaderView +
// statblock/StatsView + HorizontalRuleProcessor + Features/FeaturesView) onto the
// site-aligned statblock card:
//
//   .dse-sb[data-dse-role]  ← the card root (density/featstyle/columns/stats arrive
//     on the ELEMENT ROOT via prefs.reflect(), not stamped here — see below)
//     .dse-head                             ← kit cardHead (§3.8 slot fill below)
//     .dse-sb__meta                         ← the info grid:
//       .dse-sb__items > .dse-sb__item      ←   Size/Speed/Stamina/Stability/Free Strike
//       .dse-sb__grid  > .dse-sb__kv        ←   Immunity/Weakness/Movement/With Captain
//     .dse-sb__chars > .dse-sb__char        ← Might/Agility/Reason/Intuition/Presence
//     .dse-hr (kit divider, ornament)       ← the legacy ◆ rule before the features
//     .dse-feature__nested > .dse-feature…  ← Task 5's renderFeatureList (shared grammar)
//
// §3.8 cardHead fill: left-eyebrow = the ancestry line, left-primary = name,
// right-eyebrow = Level, right-primary = the roles line (Org · Role), right-deck =
// EV. COMMUNITY-CONTROVERSIAL CONSTRAINT: NO word/number changes — every label,
// value, and fallback string ('Unnamed Creature', 'Level N/A', 'No Role',
// 'Unknown Ancestry', 'EV N/A', the '-' info fallbacks, formatCharacteristic's
// '+N'/'-N'/'N/A') is carried over from the legacy HeaderView/StatsView VERBATIM;
// only the design changed (the "Immunity: " colon is CSS-owned, same rule as
// .dse-fb__stat-l / .dse-section__title).
//
// Role tint: the shared applyRoleTint (roleTint.ts, extracted from T6a) maps the
// SDK roles line onto [data-dse-role] + the --dse-role element-set alias; an
// unmapped role ("Boss") sets neither, failing safe to grey/monochrome (OD-2:
// Steel-only accent). Pref hooks: data-dse-density / data-dse-sb-featstyle /
// data-dse-sb-columns / data-dse-sb-stats are reflected onto the ELEMENT ROOT by
// prefs.reflect() (D4, Plan 13 Task 3) — the statblock view stamps none of them.
//
// The legacy builders this view stops constructing stay in the codebase UNTOUCHED
// — statblock was their LAST element consumer, so they are now element-dead code;
// Task 10 retires them (and their .ds-header-*/.ds-feature-* CSS).
//
// Static + SDK-backed (OD-7: stays static): no persistence, no interactive
// controls. All markdown renders through this.renderMarkdown (owner-parented,
// ML-1) passed to renderFeatureList as the renderMd callback.
import { ElementView } from '@/framework/view';
import { cardHead, divider } from '@/framework/kit';
import type { RenderMdCallback } from '@/framework/kit';
import { renderFeatureList } from '@/elements/feature/renderFeature';
import { applyRoleTint } from '@/elements/roleTint';
import { FeatureConfig } from '@model/FeatureConfig';
import type { StatblockConfig } from '@model/StatblockConfig';

/** The legacy StatsView.formatCharacteristic, VERBATIM (word/number parity). */
function formatCharacteristic(value?: number): string {
	if (value === undefined || isNaN(value)) {
		return 'N/A';
	}
	return value >= 0 ? `+${value}` : `${value}`;
}

export class StatblockElementView extends ElementView<StatblockConfig> {
	protected onMount(root: HTMLElement, model: StatblockConfig): void {
		const sb = model.statblock;
		const renderMd: RenderMdCallback = (md, el) => this.renderMarkdown(md, el);

		const card = root.createDiv({ cls: 'dse-sb' });
		// D4 (Plan 13 Task 3): density/featstyle/columns/stats arrive on the ELEMENT
		// ROOT as data-dse-* via the pipeline's prefs.reflect() — nothing to stamp
		// here. CSS keys off [data-dse-element='statblock'][data-dse-…] descendants.

		// Role spine + header tint from the SDK combat role (fails-safe unmapped).
		applyRoleTint(card, sb.roles?.join(', '));

		// -- cardHead (§3.8 fill; legacy header wording preserved verbatim — the
		// fallback strings always rendered in the legacy header, so no slot is a gap) --
		cardHead(
			card,
			{
				leftEyebrow: sb.ancestry?.join(', ') ?? 'Unknown Ancestry',
				name: sb.name ?? 'Unnamed Creature',
				rightEyebrow: sb.level !== undefined ? `Level ${sb.level}` : 'Level N/A',
				rightPrimary: sb.roles?.join(', ') ?? 'No Role',
				rightDeck: sb.ev !== undefined ? `EV ${sb.ev}` : 'EV N/A',
				level: 2, // the block heading; feature cards default to 3
			},
			this,
		);

		this.renderMeta(card, model);
		this.renderChars(card, model);
		this.renderFeatures(card, model, renderMd);
	}

	/** The .dse-sb__meta info grid: the legacy StatsView surface — the
	 *  Size/Speed/Stamina/Stability/Free Strike item row, then the
	 *  Immunity/Weakness/Movement/With Captain kv cells — labels + values VERBATIM
	 *  (incl. the '-' fallbacks); the "label: " colon is CSS-owned. */
	private renderMeta(card: HTMLElement, model: StatblockConfig): void {
		const sb = model.statblock;
		const meta = card.createDiv({ cls: 'dse-sb__meta' });

		const items = meta.createDiv({ cls: 'dse-sb__items' });
		const item = (label: string, value: string): void => {
			const itemEl = items.createDiv({ cls: 'dse-sb__item' });
			itemEl.createDiv({ cls: 'dse-sb__item-v', text: value });
			itemEl.createDiv({ cls: 'dse-sb__item-l', text: label });
		};
		item('Size', `${sb.size ?? '-'}`);
		item('Speed', `${sb.speed ?? '-'}`);
		item('Stamina', `${sb.stamina ?? '-'}`);
		item('Stability', `${sb.stability ?? '-'}`);
		item('Free Strike', `${sb.freeStrike ?? '-'}`);

		const grid = meta.createDiv({ cls: 'dse-sb__grid' });
		const kv = (modifier: string, label: string, value: string): void => {
			const kvEl = grid.createDiv({ cls: `dse-sb__kv dse-sb__kv--${modifier}` });
			kvEl.createSpan({ cls: 'dse-sb__kv-l', text: label });
			kvEl.createSpan({ cls: 'dse-sb__kv-v', text: value });
		};
		// Legacy StatsView parity: Immunity/Weakness/Movement always print (with the
		// '-' fallback); the With Captain cell only exists when the field does.
		kv('immunity', 'Immunity', sb.immunities?.length ? sb.immunities.join(', ') : '-');
		kv('weakness', 'Weakness', sb.weaknesses?.length ? sb.weaknesses.join(', ') : '-');
		kv('movement', 'Movement', `${sb.movement ?? '-'}`);
		if (sb.withCaptain) kv('captain', 'With Captain', sb.withCaptain);
	}

	/** The .dse-sb__chars row: five verbatim "Name +N" pairs, legacy order. */
	private renderChars(card: HTMLElement, model: StatblockConfig): void {
		const chars = model.statblock.characteristics;
		const row = card.createDiv({ cls: 'dse-sb__chars' });
		const pair = (label: string, value?: number): void => {
			row.createDiv({ cls: 'dse-sb__char', text: `${label} ${formatCharacteristic(value)}` });
		};
		pair('Might', chars.might);
		pair('Agility', chars.agility);
		pair('Reason', chars.reason);
		pair('Intuition', chars.intuition);
		pair('Presence', chars.presence);
	}

	/** The feature list on Task 5's shared grammar, behind the legacy ◆ rule
	 *  (now the kit divider). Same guard as the legacy `features?.length > 0`. */
	private renderFeatures(
		card: HTMLElement,
		model: StatblockConfig,
		renderMd: RenderMdCallback,
	): void {
		const features = model.statblock.features;
		if (!features || features.length === 0) return;
		divider(card, { axis: 'h', ornament: true }, this);
		renderFeatureList(card, FeatureConfig.allFrom(features), this, renderMd);
	}
}
