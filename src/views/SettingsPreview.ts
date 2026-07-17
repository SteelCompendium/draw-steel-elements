// src/views/SettingsPreview.ts — D4 §4.2 (Plan 13): the live mini-statblock under
// the "Statblock display" settings group. A REAL element root mounted through the
// REAL ElementPipeline, so prefs.reflect() drives it — every pref/preset change
// reflows it in place, exactly like a statblock in a note (no bespoke renderer).
//
// Inert host: canPersist TRUE (statblock is static and never writes; `false` would
// stamp data-dse-readonly and show a misleading "Read-only" badge on the preview),
// replaceSource resolves false, blockKey is unique so session state never collides
// with real blocks. Lifecycle: children attach to `owner` (the tab's per-display()
// Component) — closing/re-rendering the tab unloads the preview and its pref
// subscriptions (F1 §4.5).
import type { Component } from 'obsidian';
import type DrawSteelAdmonitionPlugin from 'main';
import type { BlockHost } from '@/framework/host/BlockHost';

/** The canned preview statblock. VERBATIM copy of the pinned known-good fixture
 *  test/fixtures/statblock/human-bandit-chief.yaml — do NOT hand-write a new
 *  statblock shape here; if the fixture moves, copy the new canonical one. */
export const PREVIEW_STATBLOCK_YAML = `type: statblock
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
      - name: Effect
        effect: Any target who is adjacent to the bandit chief after the power roll is
          resolved takes 3 corruption damage.
      - cost: 2 Malice
        effect: This ability targets one additional target.
  - type: feature
    feature_type: ability
    name: Kneel, Peasant!
    icon: 🗡
    keywords:
      - Melee
    usage: Maneuver
    distance: Melee 1
    target: One enemy
    effects:
      - roll: Power Roll + 2
        tier1: Push 1; M < 1 prone
        tier2: Push 2; M < 2 prone
        tier3: Push 4; M < 3 prone
      - cost: 2 Malice
        effect: The ability takes the Area keyword, loses the Melee keyword, and is a 1
          burst that targets each enemy in the area.
  - type: feature
    feature_type: ability
    name: Bloodstones
    icon: ❗️
    keywords:
      - Magic
    usage: Triggered action
    distance: Self
    target: Self
    trigger: The bandit chief makes a power roll.
    effects:
      - name: Effect
        effect: The bandit chief takes 5 corruption damage and increases the outcome of
          the power roll by one tier. This damage can't be reduced in any way.
  - type: feature
    feature_type: trait
    name: End Effect
    icon: ⭐️
    effects:
      - effect: At the end of each of their turns, the bandit chief can take 5 damage to
          end one effect on them that can be ended by a saving throw. This
          damage can't be reduced in any way.
  - type: feature
    feature_type: trait
    name: Supernatural Insight
    icon: ⭐️
    effects:
      - effect: The bandit chief ignores concealment if it's granted by a supernatural
          effect.
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
  - type: feature
    feature_type: ability
    name: Form Up!
    icon: ☠️
    ability_type: Villain Action 2
    keywords:
      - Area
    usage: "-"
    distance: 10 burst
    target: Each ally in the area
    effects:
      - name: Effect
        effect: Each target shifts up to their speed. Additionally, until the end of the
          encounter, while the bandit chief or any ally is adjacent to a target,
          they have damage immunity 2.
  - type: feature
    feature_type: ability
    name: Lead From the Front
    icon: ☠️
    ability_type: Villain Action 3
    keywords:
      - "-"
    usage: "-"
    distance: Self
    target: Self
    effects:
      - name: Effect
        effect: The bandit chief shifts up to 10 squares regardless of their speed.
          During or after this movement, they can use their Whip and Magic
          Longsword against up to four targets. Additionally, one ally adjacent
          to each target can make a free strike against that target.
`;

export function mountSettingsPreview(
	containerEl: HTMLElement,
	plugin: DrawSteelAdmonitionPlugin,
	owner: Component,
): void {
	const fw = plugin.frameworkV2;
	const def = fw?.registry.get('statblock');
	if (!fw || !def) return; // framework not constructed (never in practice): no preview
	const wrap = containerEl.createDiv({ cls: 'dse-settings-preview' });
	const host: BlockHost = {
		mode: 'reading',
		sourcePath: '',
		containerEl: wrap,
		canPersist: true,
		addChild: (child) => {
			owner.addChild(child);
			return child;
		},
		getBlockInfo: () => null,
		replaceSource: async () => false,
		blockKey: () => 'dse-settings-preview',
	};
	fw.pipeline.run(def, PREVIEW_STATBLOCK_YAML, host).catch((error) => {
		console.error('Draw Steel Elements: settings preview failed to render', error);
	});
}
