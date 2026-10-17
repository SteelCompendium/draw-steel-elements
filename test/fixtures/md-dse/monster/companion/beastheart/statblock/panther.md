---
agility: 2
companion: panther
file_basename: panther
file_dpath: monster/companion/beastheart/statblock
free_strike: 1 + M
intuition: 2
item_id: panther
item_name: Panther
keywords:
    - Animal
    - Companion
level: 1
might: 2
movement: Climb
name: Panther
organization: Companion
presence: 1
reason: -1
scc: mcdm.beastheart.v1/monster.companion.beastheart.statblock/panther
size: 1M
skills:
    - Sneak
source: mcdm.beastheart.v1
speed: 7
stability: 1
stamina: = yours
type: statblock
---

```ds-sb
agility: 2
ev: ""
features:
    - ability_type: Signature Ability
      distance: Melee 1
      effects:
        - effect: The target takes damage equal to 3 + the panther's Might score, and if they have M < AVERAGE, they are knocked [prone](scc.v1:mcdm.heroes.v1/condition/prone).
          name: Effect
        - cost: Spend 1 Ferocity
          effect: The panther can jump up to a number of squares equal to their speed before using this ability. If they jump at least 1 square in this way, a target who has M < STRONG is knocked [prone](scc.v1:mcdm.heroes.v1/condition/prone).
      feature_type: ability
      flavor: The panther bunches up, then uncoils into a deadly leap.
      keywords:
        - Companion
        - Melee
        - Weapon
      metadata:
        scc:
            - mcdm.beastheart.v1/feature.ability.companion.beastheart.panther.level-1/pounce
      name: Pounce
      target: One enemy
      type: feature
      usage: Maneuver
    - effects:
        - effect: Whenever the panther takes the Advance move action or the Charge action, they can [jump](scc.v1:mcdm.heroes.v1/movement/jump) up to a number of squares equal to their speed in any direction, including vertically, as part of this movement.
      feature_type: feature
      metadata:
        scc:
            - mcdm.beastheart.v1/feature.companion.beastheart.panther.level-1/mighty-spring
      name: Mighty Spring
      type: feature
free_strike: 1 + M
intuition: 2
keywords:
    - Animal
    - Companion
level: 1
metadata:
    scc: mcdm.beastheart.v1/monster.companion.beastheart.statblock/panther
    source: mcdm.beastheart.v1
might: 2
movement: Climb
name: Panther
organization: Companion
presence: 1
reason: -1
role: ""
size: 1M
skills:
    - Sneak
speed: 7
stability: 1
stamina: = yours
type: statblock
```
