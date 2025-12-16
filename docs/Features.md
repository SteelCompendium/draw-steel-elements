# Feature Element

The Feature Element can take many forms which results in a more fluid yaml when it comes to effects.

Yaml is incredibly sensitive, be sure to format exactly.

## Field Definition

| Property       | Type     | Required | Description                                                                 |
|----------------|----------|----------|-----------------------------------------------------------------------------|
| `name`         | string   | No       | The title or description of the feature                                     |
| `type`         | string   | Yes      | Static string "feature"                                                     |
| `feature_type` | string   | Yes      | The type of feature ("ability" or "trait")                                  |
| `icon`         | string   | No       | The icon of the feature (ex: "🏹")                                          |
| `usage`        | string   | Yes      | Usage (e.g., "Action", "Maneuver", "Triggered Action", "Villain Action 1")  |
| `cost`         | string   | No       | Cost to use the feature (e.g., "5 Essence", "Signature", "2 Malice")        |
| `ability_type` | string   | No       | Type of the ability (Signature or Heroic)                                   |
| `keywords`     | string[] | No       | Keywords associated with the feature (e.g., ["Magic", "Earth", "Melee"])    |
| `distance`     | string   | No       | Distance or area (e.g., "Ranged 5", "2 burst", "Melee 1")                   |
| `target`       | string   | No       | Who or what is targeted (e.g., "All enemies", "One creature", "Self")       |
| `trigger`      | string   | No       | Trigger condition for triggered actions                                     |
| `effects`      | Effect[] | Yes      | List of effects (flexible formats)                                          |
| `flavor`       | string   | No       | Flavor text of the feature                                                  |
| `metadata`     | object   | No       | Key-value pairs for additional data, often used for frontmatter in markdown |
| `indent`       | number   | No       | Left-margin indentation for the block (for nested lists)                    |

Example

```markdown
~~~ds-feature
type: feature
feature_type: ability
name: Magma Titan
cost: 9 Essence
flavor: Their body swells with lava, mud, and might, towering over their enemies.
keywords:
  - Earth
  - Fire
  - Magic
  - Ranged
  - Void
usage: Main action
distance: Ranged 10
target: One creature or object
effects:
  - name: Effect
    effect: >-
      Until the start of your next turn, the target has the following benefits:

      - Their size and stability increase by 2, with any size 1 target becoming
      size 3. Each creature who is within the target's new space slides to the
      nearest unoccupied space, ignoring stability. If the target doesn't have
      space to grow, they grow as much as they can and become restrained until
      the effect ends.

      - They have fire immunity 10.

      - Their strikes deal extra fire damage equal to twice your Reason score.

      - When the target force moves a creature or object, the forced movement
      distance gains a +2 bonus.

      - They can use their highest characteristic instead of Might for Might
      power rolls.
  - roll: Power Roll + Reason
    tier1: You teleport the target up to 4 squares.
    tier2: You teleport the target up to 6 squares.
    tier3: You teleport the target up to 8 squares.
  - name: Persistent 2
    effect: The effect lasts until the start of your next turn. Additionally, at the
      start of your turn, the target can spend 2 Recoveries.
~~~
```

![feature.png](Media/feature.png)

## Effects

Features can have many effects and the order is important.

| Property   | Type      | Description                                       |
|------------|-----------|---------------------------------------------------|
| `name`     | string    | Name of the test effect                           |
| `cost`     | string    | Cost to trigger this test effect                  |
| `effect`   | string    | Description of the test effect                    |
| `roll`     | string    | Power Roll expression (e.g., "2d10 + 3")          |
| `tier1`    | string    | The tier-1 (11 or lower) result of the Power Roll |
| `tier2`    | string    | The tier-2 (12-16) result of the Power Roll       |
| `tier3`    | string    | The tier-3 (17+) result of the Power Roll         |
| `crit`     | string    | The crit (nat 19-20) result of the Power Roll     |
| `features` | Feature[] | A list of Features granted from the effect.       |

Example Test effect:

```yaml
effects:
- name: "Effect"
  effect: "Targets make a Might test"
  tier1: "3 sonic damage; slide 1; shift 1"
  tier2: "6 sonic damage; slide 3; shift 3"
  tier3: "8 sonic damage; slide 5; shift 5"
```

Example Effect with name and cost:

```yaml
effects:
- name: Malice Boost
  cost: 3 Malice
  effect: Each ally within 3 of a target has their speed increased by 2 until the end of their next turn.
```

Example Effect without name, cost, etc:

```yaml
effects:
- effect: Until the end of their next turn, the target halves incoming damage, deals an additional 4 damage on strikes, and their speed is doubled.
```

## Custom Power Rolls

You can use Feature Elements to make custom power rolls:

```markdown
~~~ds-feature
name: A simple power roll
effects:
  - roll: 2d10 + 5
    tier1: 2 damage
    tier2: 4 damage
    tier3: 7 damage
~~~
```

![simple power roll](Media/simple_feature_power_roll.png)
