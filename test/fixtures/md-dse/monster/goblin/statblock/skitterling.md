---
agility: 2
ev: 3 for four minions
file_basename: skitterling
file_dpath: monster/goblin/statblock
free_strike: 1
intuition: 0
item_id: skitterling
item_name: Skitterling
keywords:
    - Animal
    - Goblin
level: 1
might: -5
movement: Fly
name: Skitterling
organization: Minion
presence: -2
reason: -4
role: Hexer
scc: mcdm.monsters.v1/monster.goblin.statblock/skitterling
size: 1T
source: mcdm.monsters.v1
speed: 5
stability: 0
stamina: "3"
type: statblock
with_captain: +3 bonus to speed
---

```ds-sb
agility: 2
ev: 3 for four minions
features:
    - ability_type: Signature Ability
      distance: Melee 1
      effects:
        - roll: Power Roll + 2
          tier1: 1 poison damage
          tier2: 2 poison damage
          tier3: 3 poison damage
      feature_type: ability
      icon: "\U0001F5E1"
      keywords:
        - Melee
        - Strike
        - Weapon
      name: Claws
      target: One creature per minion
      type: feature
      usage: Main action
free_strike: 1
intuition: 0
keywords:
    - Animal
    - Goblin
level: 1
metadata:
    scc: mcdm.monsters.v1/monster.goblin.statblock/skitterling
    source: mcdm.monsters.v1
might: -5
movement: Fly
name: Skitterling
organization: Minion
presence: -2
reason: -4
role: Hexer
size: 1T
speed: 5
stability: 0
stamina: "3"
type: statblock
with_captain: +3 bonus to speed
```
