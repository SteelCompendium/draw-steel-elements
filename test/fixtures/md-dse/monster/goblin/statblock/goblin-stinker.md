---
agility: 1
ev: "3"
file_basename: goblin-stinker
file_dpath: monster/goblin/statblock
free_strike: 1
intuition: 0
item_id: goblin-stinker
item_name: Goblin Stinker
keywords:
    - Goblin
    - Humanoid
level: 1
might: -2
movement: Climb
name: Goblin Stinker
organization: Horde
presence: 2
reason: 0
role: Controller
scc: mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker
size: 1S
source: mcdm.monsters.v1
speed: 5
stability: 0
stamina: "10"
type: statblock
---

```ds-sb
agility: 1
ev: "3"
features:
    - ability_type: Signature Ability
      distance: 3 cube within 15
      effects:
        - roll: Power Roll + 2
          tier1: 1 poison damage; [slide](scc.v1:mcdm.heroes.v1/movement/forced-movement) 1
          tier2: 2 poison damage; [slide](scc.v1:mcdm.heroes.v1/movement/forced-movement) 2
          tier3: 3 poison damage; [slide](scc.v1:mcdm.heroes.v1/movement/forced-movement) 3
      feature_type: ability
      icon: "\U0001F533"
      keywords:
        - Area
        - Magic
        - Ranged
      name: Toxic Winds
      target: Each enemy in the area
      type: feature
      usage: Main action
    - distance: 3 cube within 10
      effects:
        - effect: '**Effect:** The area is filled with a green haze that lasts until the start of the stinker''s next turn or until the stinker is reduced to 0 [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina), and which can''t be dispersed by wind. The area is [difficult terrain](scc.v1:mcdm.heroes.v1/movement/difficult-terrain) for non-goblins, and each non-goblin who moves in the area takes 2 poison damage for each square moved.'
      feature_type: ability
      icon: "\U0001F533"
      keywords:
        - Area
        - Magic
        - Ranged
      name: Swamp Gas
      target: Special
      type: feature
      usage: Maneuver
    - effects:
        - effect: The stinker doesn't provoke [opportunity attacks](scc.v1:mcdm.heroes.v1/rule.combat/opportunity-attack) by moving.
      feature_type: trait
      icon: ⭐️
      name: Crafty
      type: feature
free_strike: 1
intuition: 0
keywords:
    - Goblin
    - Humanoid
level: 1
metadata:
    scc: mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker
    source: mcdm.monsters.v1
might: -2
movement: Climb
name: Goblin Stinker
organization: Horde
presence: 2
reason: 0
role: Controller
size: 1S
speed: 5
stability: 0
stamina: "10"
type: statblock
```
