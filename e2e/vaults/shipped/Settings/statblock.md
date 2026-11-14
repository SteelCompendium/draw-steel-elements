# Statblock

ABOVE

```ds-statblock
type: statblock
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
```

BELOW
