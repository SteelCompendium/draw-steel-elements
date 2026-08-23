// src/views/SettingsPreview.ts — D4 §4.2 (Plan 13): the live mini-statblock under
// the "Statblock display" settings group. A REAL element root mounted through the
// REAL ElementPipeline, so prefs.reflect() drives it — every pref/preset change
// reflows it in place, exactly like a statblock in a note (no bespoke renderer).
//
// Inert host: canPersist TRUE (statblock is static and never writes; `false` would
// stamp data-dse-readonly and show a misleading "Read-only" badge on the preview),
// replaceSource resolves false, blockKey is unique so session state never collides
// with real blocks. Lifecycle: children attach to `owner` (the per-MOUNT Component the
// preview render row creates) — the row's cleanup callback unloads it on every teardown
// (page navigation, tab switch, settings close), releasing the pref subscriptions.
import type { Component } from 'obsidian';
import type DrawSteelAdmonitionPlugin from 'main';
import type { BlockHost } from '@/framework/host/BlockHost';

/**
 * The canned preview statblock — the Human Bandit Chief's HEADER verbatim from the pinned
 * known-good fixture (test/fixtures/statblock/human-bandit-chief.yaml) over an
 * ABRIDGED feature list.
 *
 * SC-187: it used to be the whole fixture, all eight features, and that was the ticket's
 * root cause. A settings PREVIEW is a sample, not a specimen: at the settings card's width
 * the full statblock renders 3646 px tall, which is why the preview host had to be a
 * 352 px porthole with its own scrollbar (a second scroller inside obsidian's, Scott's
 * "biggest issue") and why what you actually SAW of it stopped just past the stat rail —
 * you could never see a feature card, i.e. the thing half the settings on that page
 * change. Three features render ~1/4 as tall and the porthole is gone.
 *
 * The three are chosen so that EVERY setting that can move this preview still visibly
 * moves it, which is the constraint any future edit here has to keep:
 *   • the header block (name/level/role/organization/keywords/EV, the primary stat row,
 *     the Immunity/Weakness/Movement block, the characteristics rail) is untouched, so
 *     Density, Secondary stats, Characteristics and Boxed first letter all still preview.
 *   • ONE signature ability with a power roll and a Malice-cost effect + ONE trait — two
 *     non-villain features, which is the minimum for Feature columns ("side-by-side") to
 *     show two columns, and enough for Feature style (cards/flat), Keyword display and
 *     Distance + target to show their work.
 *   • ONE villain action, so Villain actions (inline vs. its own collapsible band) has
 *     something to band.
 * Effect prose is trimmed to one clause each; nothing about the SHAPE of the data changed.
 *
 * `prefs: { sbSticky: "off" }` — the shipped per-block override (prefOverrides.ts;
 * `sbSticky` is one of the keys explicitly documented as per-block overridable) — and it
 * is load-bearing, not decoration. Uncapping the host makes the sample taller than the
 * settings viewport, so SC-160's IntersectionObserver stuck the mini-header, whose
 * scrollport here is the SETTINGS PANE: it pinned a creature name and stat line over the
 * settings page's own titlebar and over the rows it is supposed to be previewing. That
 * bar's contract is "pin to the top of the READING pane while a long statblock scrolls
 * past"; a settings modal has no reading pane, and a floating strip over the settings rows
 * is the exact defect SC-187 removes. Turning it off per block is the honest fix — a CSS
 * override would have to out-specify (or `!important`-beat) the five-attribute reveal rule
 * and would trip SC-160's own "every sticky rule is Steel- and print-scoped" contract.
 * Consequence, stated so nobody re-adds it as a bug: the "Sticky mini-header" row has no
 * visible effect on this preview. It never did — the old 352px porthole could not show a
 * scroll behaviour either — and a settings sample is structurally the wrong place to
 * demonstrate one.
 */
export const PREVIEW_STATBLOCK_YAML = `type: statblock
prefs:
  sbSticky: "off"
name: Human Bandit Chief
level: 3
role: ""
organization: Leader
keywords:
  - Human
  - Humanoid
ev: "20"
stamina: "120"
immunities:
  - Corruption 4
  - psychic 4
speed: 5
size: 1M
stability: 2
free_strike: 5
might: 2
agility: 3
reason: 2
intuition: 3
presence: 2
features:
  - type: feature
    feature_type: ability
    name: Whip and Magic Longsword
    icon: 🗡
    ability_type: Signature Ability
    keywords:
      - Magic
      - Melee
      - Strike
      - Weapon
    usage: Main action
    distance: Melee 2
    target: Two enemies or objects
    effects:
      - roll: Power Roll + 2
        tier1: 8 damage; pull 1
        tier2: 12 damage; pull 2
        tier3: 15 damage; pull 3
      - cost: 2 Malice
        effect: This ability targets one additional target.
  - type: feature
    feature_type: trait
    name: End Effect
    icon: ⭐️
    effects:
      - effect: At the end of each of their turns, the bandit chief can take 5 damage to
          end one effect on them that can be ended by a saving throw.
  - type: feature
    feature_type: ability
    name: Shoot!
    icon: ☠️
    ability_type: Villain Action 1
    keywords:
      - Area
    usage: "-"
    distance: 10 burst
    target: Each artillery ally in the area
    effects:
      - name: Effect
        effect: Each target makes a ranged free strike.
`;

/** SC-123: the Featureblock display section's own preview subject. A statblock
 *  preview would show NOTHING that page can change (no `.dse-fb` anywhere in it), so
 *  the section gets a featureblock instead — and one carrying the full loose-stat
 *  header, since "Stat line" is half of what that page controls (the shipped
 *  `src/elements/featureblock/example.yaml` has no stamina/size/stats at all, which
 *  would have left that row previewing an empty region). Shape copied from
 *  test/dom/elements/featureblock.test.ts's proven WITH_STATS constant. */
export const PREVIEW_FEATUREBLOCK_YAML = `type: featureblock
featureblock_type: Fixture
name: Bloodstone of Yendral
level: 2
ev: "6"
stamina: "30"
size: "2"
stats:
  - name: Speed
    value: "0"
  - name: Stability
    value: "3"
  - name: Free Strike
    value: "2"
features:
  - type: feature
    feature_type: trait
    name: Hungering Pulse
    icon: ⭐️
    effects:
      - effect: Each enemy within 2 squares takes 2 corruption damage.
  - type: feature
    feature_type: trait
    name: Blood Debt
    icon: ❇️
    cost: 3 Malice
    effects:
      - effect: The bloodstone drains one adjacent creature, which takes 5 corruption
          damage and is weakened (save ends).
`;

/** SC-193: the Feature display section's subject — a STANDALONE ability card, the one
 *  host neither of the other two previews shows on its own. Deliberately the same
 *  signature ability the statblock preview carries, so the two pages are visibly showing
 *  the same grammar in two containers rather than two unrelated samples. Everything the
 *  page's two rows restyle is present: keywords + action type (the `kwUsage` band) and
 *  distance + target (the `distTarget` rail). */
export const PREVIEW_FEATURE_YAML = `type: feature
feature_type: ability
name: Whip and Magic Longsword
icon: 🗡
ability_type: Signature Ability
keywords:
  - Magic
  - Melee
  - Strike
  - Weapon
usage: Main action
distance: Melee 2
target: Two enemies or objects
effects:
  - roll: Power Roll + 2
    tier1: 8 damage; pull 1
    tier2: 12 damage; pull 2
    tier3: 15 damage; pull 3
  - cost: 2 Malice
    effect: This ability targets one additional target.
`;

/** The three canned subjects a settings page can preview. */
export type PreviewSubject = 'statblock' | 'featureblock' | 'feature';

const PREVIEW_YAML: Record<PreviewSubject, string> = {
	statblock: PREVIEW_STATBLOCK_YAML,
	featureblock: PREVIEW_FEATUREBLOCK_YAML,
	feature: PREVIEW_FEATURE_YAML,
};

/** Class on the panel wrapping the caption + the mounted sample. */
export const PREVIEW_CLS = 'dse-settings-preview';
/** Class on the caption line above the sample. */
export const PREVIEW_LABEL_CLS = 'dse-settings-preview__label';
/** Class on the framed well the element root mounts into. */
export const PREVIEW_STAGE_CLS = 'dse-settings-preview__stage';

/**
 * SC-187 — the captioned panel, built without mounting anything into it.
 *
 * A bare card dropped into a settings page is an unexplained statblock; the caption is
 * what makes it "this is the sample these settings are changing", and it is also what
 * lets the frame read as a deliberate sample stage rather than as a slab. Split out from
 * the mount so the panel's DOM has exactly one definition — the production mount below
 * and the SC-187 evidence harness both call this rather than each hand-rolling it.
 *
 * Returns the STAGE (the framed well). The element root mounts as a direct child of it,
 * so every existing `.dse-settings-preview [data-dse-element]` selector — the tests, the
 * settings-evidence camera — keeps matching.
 */
export function buildPreviewPanel(containerEl: HTMLElement): HTMLElement {
	const wrap = containerEl.createDiv({ cls: PREVIEW_CLS });
	const label = wrap.createDiv({ cls: PREVIEW_LABEL_CLS });
	label.createSpan({ text: 'Preview' });
	label.createSpan({
		cls: `${PREVIEW_LABEL_CLS}-hint`,
		// "above" because the panel is the LAST row on the page (settingsDeclarative's
		// toPage) — keep the two in step if that ever moves.
		text: 'updates live as you change the settings above',
	});
	return wrap.createDiv({ cls: PREVIEW_STAGE_CLS });
}

export function mountSettingsPreview(
	containerEl: HTMLElement,
	plugin: DrawSteelAdmonitionPlugin,
	owner: Component,
	/** Which canned block to preview. Defaults to the statblock — the subject every
	 *  reflected section had before SC-123 added a featureblock-only one. */
	subject: PreviewSubject = 'statblock',
): void {
	const fw = plugin.frameworkV2;
	const def = fw?.registry.get(subject);
	if (!fw || !def) return; // framework not constructed (never in practice): no preview
	const stage = buildPreviewPanel(containerEl);
	const host: BlockHost = {
		mode: 'reading',
		sourcePath: '',
		containerEl: stage,
		canPersist: true,
		addChild: (child) => {
			owner.addChild(child);
			return child;
		},
		getBlockInfo: () => null,
		replaceSource: async () => false,
		blockKey: () => `dse-settings-preview:${subject}`,
	};
	fw.pipeline.run(def, PREVIEW_YAML[subject], host).catch((error) => {
		console.error('Draw Steel Elements: settings preview failed to render', error);
	});
}
