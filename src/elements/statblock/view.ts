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
import { setIcon } from 'obsidian';
import { ElementView } from '@/framework/view';
import type { RenderContext } from '@/framework/context';
import { cardHead, charsAreSplit, collapsible, divider, formatCharacteristic, renderCharacteristicsRow } from '@/framework/kit';
import type { RenderMdCallback } from '@/framework/kit';
import { actionTypeOf, crestIconFor, renderFeatureList } from '@/elements/feature/renderFeature';
import { featureRollHooks } from '@/elements/feature/rollController';
import { applyRoleTint, type DseRole } from '@/elements/roleTint';
import {
	renderStickyHeader,
	wireStickyHeader,
	type StickyChar,
	type StickyHeaderParts,
	type StickyPair,
} from './stickyHeader';
import { FeatureConfig } from '@model/FeatureConfig';
import type { StatblockConfig } from '@model/StatblockConfig';
import type { Statblock } from 'steel-compendium-sdk';

/** SC-123: the villain band's head wording + its session slot. The title is the
 *  site's own ("Villain Actions", steel-statblock.css `.sb__band-title`); the slot
 *  keeps a reader's open/closed choice across the echo-rebuild, like every other
 *  kit collapsible. */
const VILLAIN_BAND_TITLE = 'Villain Actions';
const VILLAIN_BAND_SLOT = 'sb.band.villain';

/**
 * SC-10 Task 4 — the cardHead crest's glyph for the statblock's OWN head, keyed to
 * the SAME combat-role spine that already drives the role tint + header band
 * (Lucide thin-line per DESIGN.md Iconography "Material thin-line second";
 * glyph-font-parity with the site's DrawSteelGlyphs is explicitly not required,
 * same precedent as feature/renderFeature.ts's crestIconFor keying the ability
 * crest to action type). An unmapped role -> kit/crest.ts degrades to no crest at
 * all, in EVERY theme — the same fail-safe idiom applyRoleTint already follows.
 *
 * NOTE: the shipped site (steel-statblock.css / statblock_card.go
 * renderStatblockHead) does NOT put a shield crest on its own top-level card
 * head today (only nested sub-feature glyphs, and even those are the small
 * inline icon, not a shield) — this is a plugin-side extension of the crest
 * system DESIGN.md already establishes for every other entity card, consistent
 * with the "Crest is the one true wiring gap" framing (plan 19 preamble #3) and
 * this task's explicit brief ("wires the crest into the statblock head").
 */
function crestIconForRole(role: DseRole | undefined): string | undefined {
	switch (role) {
		case 'ambusher':
			return 'eye-off';
		case 'harrier':
			return 'wind';
		case 'artillery':
			return 'target';
		case 'brute':
			return 'hammer';
		case 'controller':
			return 'brain';
		case 'hexer':
			return 'sparkles';
		case 'mount':
			return 'footprints';
		case 'support':
			return 'heart-pulse';
		case 'defender':
			return 'shield';
		case 'leader':
			return 'crown';
		case 'solo':
			return 'skull';
		case 'minion':
			return 'users';
		default:
			return undefined;
	}
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

/** One `.dse-sb__kv` cell of the secondary-stats grid: its `--<modifier>` suffix plus the
 *  label/value pair, VERBATIM (legacy StatsView parity, incl. the '-' fallbacks). */
interface StatblockKv extends StickyPair {
	modifier: string;
}

/**
 * SC-160 — the three pure extractions the full card AND the sticky mini-header both read.
 *
 * Hoisted out of renderMeta/renderChars for ONE reason: the mini-header must be unable to
 * disagree with the header it stands in for. Two hand-written copies of "Stamina, or '-'"
 * would drift the first time a fallback changed, and the reader would see one number in
 * the card and another in the pinned bar. Same strings, one source.
 *
 * The five primary stats: Size / Speed / Stamina / Stability / Free Strike.
 */
function statblockDefenseCells(sb: Statblock): StickyPair[] {
	return [
		{ label: 'Size', value: `${sb.size ?? '-'}` },
		{ label: 'Speed', value: `${sb.speed ?? '-'}` },
		{ label: 'Stamina', value: `${sb.stamina ?? '-'}` },
		{ label: 'Stability', value: `${sb.stability ?? '-'}` },
		{ label: 'Free Strike', value: `${sb.freeStrike ?? '-'}` },
	];
}

/** The secondary-stats cells in the FULL CARD's order. Legacy StatsView parity:
 *  Immunity/Weakness/Movement always print (with the '-' fallback); the With Captain cell
 *  only exists when the field does. */
function statblockMetaCells(sb: Statblock): StatblockKv[] {
	const cells: StatblockKv[] = [
		{ modifier: 'immunity', label: 'Immunity', value: sb.immunities?.length ? sb.immunities.join(', ') : '-' },
		{ modifier: 'weakness', label: 'Weakness', value: sb.weaknesses?.length ? sb.weaknesses.join(', ') : '-' },
		{ modifier: 'movement', label: 'Movement', value: `${sb.movement ?? '-'}` },
	];
	if (sb.withCaptain) cells.push({ modifier: 'captain', label: 'With Captain', value: sb.withCaptain });
	return cells;
}

/** The five characteristics in legacy order, values already formatted. */
function statblockCharCells(sb: Statblock): StickyPair[] {
	const chars = sb.characteristics;
	return [
		{ label: 'Might', value: formatCharacteristic(chars.might) },
		{ label: 'Agility', value: formatCharacteristic(chars.agility) },
		{ label: 'Reason', value: formatCharacteristic(chars.reason) },
		{ label: 'Intuition', value: formatCharacteristic(chars.intuition) },
		{ label: 'Presence', value: formatCharacteristic(chars.presence) },
	];
}

/**
 * SC-160 — everything the sticky mini-header renders, derived from the same extractions
 * the card uses.
 *
 * Row 2's ORDER is the site's sticky order (Movement, With Captain, Immunity, Weakness —
 * steel-etl `renderStatblockSticky`'s `metaPairs`), which deliberately differs from the
 * full card's grid order above: in the bar the movement/captain pair is the thing a GM
 * re-checks mid-turn, so it leads. Exported for the DOM tests.
 */
export function statblockStickyParts(sb: Statblock): StickyHeaderParts {
	const header = statblockHeaderParts(sb);
	const meta = statblockMetaCells(sb);
	const byModifier = (modifier: string): StatblockKv | undefined =>
		meta.find((cell) => cell.modifier === modifier);
	const secondary = ['movement', 'captain', 'immunity', 'weakness']
		.map(byModifier)
		.filter((cell): cell is StatblockKv => cell !== undefined)
		.map(({ label, value }) => ({ label, value }));
	const characteristics: StickyChar[] = statblockCharCells(sb).map((cell) => ({
		initial: cell.label.charAt(0).toUpperCase(),
		value: cell.value,
	}));
	return {
		name: header.name,
		role: header.rightPrimary,
		defenses: statblockDefenseCells(sb),
		characteristics,
		secondary,
	};
}

export class StatblockElementView extends ElementView<StatblockConfig> {
	/** SC-145: the `.dse-sb` card node onMount most recently created — tracked so
	 *  authoringAnchor() below can anchor the generic authoring pencil to it instead of
	 *  root (root itself carries no card-frame border/background; see that method's
	 *  ElementView doc for why the mismatch put the pencil outside the visible card). */
	private cardEl?: HTMLElement;

	constructor(cx: RenderContext) {
		super(cx);
		// D5 roll-pref re-mount — see FeatureElementView's constructor comment.
		const remount = (): void => {
			if (this.rootEl) void this.update(this.model);
		};
		cx.prefs.subscribe('rollingEnabled', this, remount);
		cx.prefs.subscribe('rollClickToRoll', this, remount);
		// SC-123: the only three prefs anywhere on this element that change the DOM
		// SHAPE rather than reflow it (the characteristics split and the villain band
		// are both conditional DOM — see renderChars/renderFeatures), so they need the
		// same remount treatment the rolling prefs get. Every other presentation pref
		// is a pure CSS reflow off the reflected attribute and must NOT be listed here.
		cx.prefs.subscribe('sbCharLine', this, remount);
		cx.prefs.subscribe('sbCharBox', this, remount);
		cx.prefs.subscribe('sbVillain', this, remount);
	}

	protected onMount(root: HTMLElement, model: StatblockConfig): void {
		const sb = model.statblock;
		const renderMd: RenderMdCallback = (md, el) => this.renderMarkdown(md, el);

		// SC-160: the sticky mini-header's zero-height anchor is emitted BEFORE the card —
		// the same position the site gives it inside `.sb-wrap`, and the position that lets
		// it park at the scroller's top edge once the card's own top has passed. It is
		// `display: none` in every context but Steel-on-screen (see stickyHeader.ts), so
		// this adds no box to print/export and cannot move a frozen print shot.
		const sticky = renderStickyHeader(root, statblockStickyParts(sb));

		const card = root.createDiv({ cls: 'dse-sb' });
		this.cardEl = card;
		// D4 (Plan 13 Task 3): density/featstyle/columns/stats arrive on the ELEMENT
		// ROOT as data-dse-* via the pipeline's prefs.reflect() — nothing to stamp
		// here. CSS keys off [data-dse-element='statblock'][data-dse-…] descendants.

		// F2 §2.1 B1: SDK 3.x fields (role/organization/keywords) via the pure
		// statblockHeaderParts extraction — shared by the role tint and cardHead fill.
		const header = statblockHeaderParts(sb);

		// Role spine + header tint from the SDK combat role (fails-safe unmapped).
		const role = applyRoleTint(card, header.role);
		// The mini-header lives OUTSIDE the card, so it does not inherit the card's
		// `--dse-role` alias — tint it from the same call, on the same fails-safe terms
		// (unmapped role ⇒ neither attribute nor alias ⇒ monochrome). The site does the
		// same thing for the same reason (`.sb__sticky-role[data-role=…]`).
		applyRoleTint(sticky, header.role);

		// -- cardHead (§3.8 fill; legacy header wording preserved verbatim — the
		// fallback strings always rendered in the legacy header, so no slot is a gap) --
		// SC-10 Task 4 (theme-agnostic DOM): crest mounts in EVERY theme; kit/crest.ts
		// degrades to nothing without an icon (unmapped role), and the Legacy base
		// keeps `.dse-crest { display: none }` — see crestIconForRole above.
		cardHead(
			card,
			{
				leftEyebrow: header.leftEyebrow,
				name: header.name,
				rightEyebrow: header.rightEyebrow,
				rightPrimary: header.rightPrimary,
				rightDeck: header.rightDeck,
				crest: { icon: crestIconForRole(role), size: 'lg' },
				level: 2, // the block heading; feature cards default to 3
			},
			this,
		);

		this.renderMeta(card, model);
		this.renderChars(card, model);
		this.renderFeatures(card, model, renderMd);

		// SC-160: the reveal. Skipped where the bar is inert by decree — a canvas card (or
		// any host that can't persist: an embed, an export render) is `data-dse-readonly`
		// and the CSS already hides the bar there, so an observer would only be work
		// nobody can see. `cardHead` mounted `.dse-head` as the card's first child; that
		// node IS the "real header" whose exit the observer waits for.
		const headEl = card.querySelector<HTMLElement>('.dse-head');
		if (headEl && this.cx.host.canPersist) wireStickyHeader(sticky, headEl, this);
	}

	/** SC-145: `.dse-sb` (not root) carries the card's visible border/background —
	 *  see the `cardEl` field doc above and ElementView.authoringAnchor()'s doc. */
	authoringAnchor(): HTMLElement {
		return this.cardEl ?? this.rootEl;
	}

	/** The .dse-sb__meta info grid: the legacy StatsView surface — the
	 *  Size/Speed/Stamina/Stability/Free Strike item row, then the
	 *  Immunity/Weakness/Movement/With Captain kv cells — labels + values VERBATIM
	 *  (incl. the '-' fallbacks); the "label: " colon is CSS-owned. */
	private renderMeta(card: HTMLElement, model: StatblockConfig): void {
		const sb = model.statblock;
		const meta = card.createDiv({ cls: 'dse-sb__meta' });

		const items = meta.createDiv({ cls: 'dse-sb__items' });
		for (const { label, value } of statblockDefenseCells(sb)) {
			const itemEl = items.createDiv({ cls: 'dse-sb__item' });
			itemEl.createDiv({ cls: 'dse-sb__item-v', text: value });
			itemEl.createDiv({ cls: 'dse-sb__item-l', text: label });
		}

		const grid = meta.createDiv({ cls: 'dse-sb__grid' });
		for (const { modifier, label, value } of statblockMetaCells(sb)) {
			const kvEl = grid.createDiv({ cls: `dse-sb__kv dse-sb__kv--${modifier}` });
			kvEl.createSpan({ cls: 'dse-sb__kv-l', text: label });
			kvEl.createSpan({ cls: 'dse-sb__kv-v', text: value });
		}
	}

	/** The .dse-sb__chars row — rendered by the SHARED kit builder since SC-152
	 * round 3 (framework/kit/CharacteristicsGrid.ts, renderCharacteristicsRow): the
	 * SC-123 merged/split shape contract and the SC-10 merged-node freeze history
	 * live on that function's doc comment now, because ds-char and the hero sheet
	 * render the same row through the same code. Statblock-specific facts that stay
	 * here:
	 *
	 * - The two shape prefs re-RENDER rather than reflow — the constructor
	 *   subscribes `sbCharLine`/`sbCharBox` to a remount, the same mechanism D5's
	 *   rolling prefs use.
	 * - They are GLOBAL-ONLY (`perBlock: false`): prefOverrides runs after mount and
	 *   re-stamps the ATTRIBUTE only, so honouring a per-block override would pair
	 *   the global DOM shape with a local attribute. Measured before the guard
	 *   (SC-123 review M-1): global `two` + block `one` rendered the literal
	 *   "+2Might" — the split spans fell through to bare inline boxes. */
	private renderChars(card: HTMLElement, model: StatblockConfig): void {
		// SC-152 round 3: the row builder moved VERBATIM to the kit
		// (framework/kit/CharacteristicsGrid.ts, renderCharacteristicsRow) so ds-char
		// and the hero sheet render characteristics through the same code — same
		// classes, same DOM order, same merged/split contract, byte-identical output
		// for this element. The SC-123 shape history and the SC-10 merged-node freeze
		// rationale live on the kit function's doc comment.
		renderCharacteristicsRow(card, model.statblock.characteristics, {
			split: this.charsAreSplit(),
		});
	}

	/** True when either characteristics preference has moved off its default — the
	 *  single place that decides between the merged text node and the split DOM. */
	private charsAreSplit(): boolean {
		return charsAreSplit(this.cx.prefs);
	}

	/** The feature list on Task 5's shared grammar, behind the legacy ◆ rule
	 *  (now the kit divider). Same guard as the legacy `features?.length > 0`.
	 *
	 *  SC-123 / FOLLOWUPS #54 — VILLAIN BANDING. At `sbVillain: 'banded'` the villain
	 *  actions are lifted out of the main run and collected into ONE collapsible
	 *  "Villain Actions" region below it (the site's `.sb__band--villain`, which is a
	 *  `<details>` with a crest head + chevron over a body list). At the default
	 *  'inline' the emitted DOM is exactly what it always was — a single
	 *  renderFeatureList over every feature in source order. That default was chosen
	 *  to hold the then-frozen legacy shots byte-identical; SC-144 retired them, so
	 *  the default is now an open design question (same note as the characteristics
	 *  pair above). Conditional DOM, so
	 *  the descriptor carries `perBlock: false` like the two characteristics keys:
	 *  a per-block override could only re-stamp the attribute after this ran, which
	 *  for `banded` → `inline` was a silent no-op with the band still standing
	 *  (SC-123 review M-1). Classification is
	 *  `actionTypeOf`, the SAME predicate that draws the villain crest and accent
	 *  (SC-102), so a card can never band a feature it wouldn't also mark. */
	private renderFeatures(
		card: HTMLElement,
		model: StatblockConfig,
		renderMd: RenderMdCallback,
	): void {
		const features = model.statblock.features;
		if (!features || features.length === 0) return;
		divider(card, { axis: 'h', ornament: true }, this);
		const configs = FeatureConfig.allFrom(features);
		const opts = { roll: featureRollHooks(this.cx) };

		if (this.cx.prefs.get('sbVillain') !== 'banded') {
			renderFeatureList(card, configs, this, renderMd, opts);
			return;
		}
		const villains = configs.filter((config) => actionTypeOf(config) === 'villain');
		if (villains.length === 0) {
			renderFeatureList(card, configs, this, renderMd, opts);
			return;
		}
		const rest = configs.filter((config) => actionTypeOf(config) !== 'villain');
		if (rest.length > 0) renderFeatureList(card, rest, this, renderMd, opts);

		// The kit primitive already owns the header button, the chevron, the
		// aria-expanded/aria-controls wiring and print-forced-open; the band is that
		// primitive plus a crest and the `--villain` modifier the CSS tints from (no
		// colored left-spine — DESIGN.md rule 7). The tint reads `--dse-act-villain`
		// straight from the sheet rather than through an inline `--dse-act` alias: the
		// band is villain BY CLASS, so there is nothing dynamic to carry.
		const band = collapsible(
			card,
			{
				title: VILLAIN_BAND_TITLE,
				open: true,
				persist: {
					session: this.cx.session,
					blockKey: this.cx.host.blockKey(),
					slot: VILLAIN_BAND_SLOT,
				},
			},
			this,
		);
		band.rootEl.addClass('dse-sb__band');
		band.rootEl.addClass('dse-sb__band--villain');
		const crestEl = band.headerEl.createSpan({ cls: 'dse-sb__band-crest' });
		setIcon(crestEl, crestIconFor('villain')!);
		const titleEl = band.headerEl.querySelector('.dse-collapse__title');
		if (titleEl) band.headerEl.insertBefore(crestEl, titleEl);
		renderFeatureList(band.contentEl, villains, this, renderMd, opts);
	}
}
