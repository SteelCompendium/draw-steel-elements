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
// §3.8 cardHead fill: left-eyebrow = the keywords line, left-primary = name,
// right-eyebrow = Level, right-primary = the "Horde Controller" org/role line,
// right-deck = EV — all derived by statblockHeaderParts (F2 §2.1 B1, below), the
// pure extraction that migrated off SDK 2.x's `roles: string[]` / `ancestry:
// string[]` onto 3.x's `role: string` / `organization: string` / `keywords:
// string[]`. COMMUNITY-CONTROVERSIAL CONSTRAINT: NO word/number changes to the
// surviving fallback strings ('Unnamed Creature', 'Level N/A', 'No Role', 'EV N/A',
// the '-' info fallbacks, formatCharacteristic's '+N'/'-N'/'N/A') — carried over
// from the legacy HeaderView/StatsView VERBATIM; only the design changed (the
// "Immunity: " colon is CSS-owned, same rule as .dse-fb__stat-l / .dse-section__title).
// The legacy 'Unknown Ancestry' fallback has no 3.x analog — `keywords` has no
// domain-specific empty-value string, so a keywordless statblock's left-eyebrow
// slot renders empty (F2 golden update; the slot itself is never omitted).
//
// Role tint: the shared applyRoleTint (roleTint.ts, extracted from T6a) maps the
// SDK `role` string (falling back to `organization` when `role` is empty — the
// real shape of every Leader/Solo statblock; see statblockHeaderParts below) onto
// [data-dse-role] + the --dse-role element-set alias; an unmapped role ("Boss")
// sets neither, failing safe to grey/monochrome (OD-2: Steel-only accent). Pref
// hooks: data-dse-density / data-dse-sb-featstyle /
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
import type { RenderContext } from '@/framework/context';
import { cardHead, divider } from '@/framework/kit';
import type { RenderMdCallback } from '@/framework/kit';
import { renderFeatureList } from '@/elements/feature/renderFeature';
import { featureRollHooks } from '@/elements/feature/rollController';
import { applyRoleTint } from '@/elements/roleTint';
import { FeatureConfig } from '@model/FeatureConfig';
import type { StatblockConfig } from '@model/StatblockConfig';
import type { Statblock } from 'steel-compendium-sdk';

/** The legacy StatsView.formatCharacteristic, VERBATIM (word/number parity). */
function formatCharacteristic(value?: number): string {
	if (value === undefined || isNaN(value)) {
		return 'N/A';
	}
	return value >= 0 ? `+${value}` : `${value}`;
}

/**
 * F2 §2.1 B1 — pure, unit-testable header-line derivation for the statblock's
 * cardHead fill + role tint (SDK 3.x fields: `role`, `organization`, `keywords`
 * replace the removed `roles: string[]` / `ancestry: string[]`).
 *
 * `rightPrimary` is the "Horde Controller" style line — organization then role,
 * per the rendered book format — falling back to the legacy 'No Role' string when
 * neither is present. `role` is passed through separately for applyRoleTint (the
 * SDK's single combat-role string, not the old joined roles line) — falling back to
 * `organization` when `role` is empty, mirroring the already-shipped v2 site's
 * `buildStatblockIsland` precedent (steel-etl `internal/site/statblock_page.go`:
 * `roleKey := role; if roleKey == "" { roleKey = org }`). Every real
 * `organization: Leader` (30/30) and `organization: Solo` (22/22) statblock in
 * production carries `role: ""`, so without this fallback those ~52 boss/solo
 * creatures would render with no role tint at all (task-1-review.md Critical).
 */
export function statblockHeaderParts(statblock: Statblock): {
	name: string;
	leftEyebrow: string;
	rightEyebrow: string;
	rightPrimary: string;
	rightDeck: string;
	role: string | undefined;
} {
	const orgRole = [statblock.organization, statblock.role]
		.filter((part): part is string => typeof part === 'string' && part.length > 0)
		.join(' ');
	return {
		name: statblock.name ?? 'Unnamed Creature',
		leftEyebrow: statblock.keywords?.join(', ') ?? '',
		rightEyebrow: statblock.level !== undefined ? `Level ${statblock.level}` : 'Level N/A',
		rightPrimary: orgRole.length > 0 ? orgRole : 'No Role',
		rightDeck: statblock.ev !== undefined ? `EV ${statblock.ev}` : 'EV N/A',
		role: statblock.role || statblock.organization,
	};
}

export class StatblockElementView extends ElementView<StatblockConfig> {
	constructor(cx: RenderContext) {
		super(cx);
		// D5 roll-pref re-mount — see FeatureElementView's constructor comment.
		const remount = (): void => {
			if (this.rootEl) void this.update(this.model);
		};
		cx.prefs.subscribe('rollingEnabled', this, remount);
		cx.prefs.subscribe('rollClickToRoll', this, remount);
	}

	protected onMount(root: HTMLElement, model: StatblockConfig): void {
		const sb = model.statblock;
		const renderMd: RenderMdCallback = (md, el) => this.renderMarkdown(md, el);

		const card = root.createDiv({ cls: 'dse-sb' });
		// D4 (Plan 13 Task 3): density/featstyle/columns/stats arrive on the ELEMENT
		// ROOT as data-dse-* via the pipeline's prefs.reflect() — nothing to stamp
		// here. CSS keys off [data-dse-element='statblock'][data-dse-…] descendants.

		// F2 §2.1 B1: SDK 3.x fields (role/organization/keywords) via the pure
		// statblockHeaderParts extraction — shared by the role tint and cardHead fill.
		const header = statblockHeaderParts(sb);

		// Role spine + header tint from the SDK combat role (fails-safe unmapped).
		applyRoleTint(card, header.role);

		// -- cardHead (§3.8 fill; legacy header wording preserved verbatim — the
		// fallback strings always rendered in the legacy header, so no slot is a gap) --
		cardHead(
			card,
			{
				leftEyebrow: header.leftEyebrow,
				name: header.name,
				rightEyebrow: header.rightEyebrow,
				rightPrimary: header.rightPrimary,
				rightDeck: header.rightDeck,
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
		renderFeatureList(card, FeatureConfig.allFrom(features), this, renderMd, {
			roll: featureRollHooks(this.cx),
		});
	}
}
