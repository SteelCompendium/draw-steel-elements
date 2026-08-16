---
action_type: '[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)'
class: fury
cost: 5 Ferocity
cost_amount: "5"
cost_resource: Ferocity
distance: 5 x 1 line within 1
effects:
    - roll: Power Roll + [Might](scc.v1:mcdm.heroes.v1/rule.character/might)
      tier1: 6 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 2
      tier2: 9 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 4
      tier3: 13 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 6
    - effect: The targets are [force moved](scc.v1:mcdm.heroes.v1/movement/forced-movement) one at a time, starting with the target nearest to you, and can be [pushed](scc.v1:mcdm.heroes.v1/movement/forced-movement) into other targets in the same line.
      name: Effect
feature_type: ability
file_basename: thunder-roar
file_dpath: feature/ability/fury/level-1
flavor: You unleash a howl that hurls your enemies back.
item_id: thunder-roar
item_name: Thunder Roar
keywords:
    - Area
    - '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee)'
    - Weapon
level: "1"
name: Thunder Roar
power_roll_characteristic: '[Might](scc.v1:mcdm.heroes.v1/rule.character/might)'
scc: mcdm.heroes.v1/feature.ability.fury.level-1/thunder-roar
source: mcdm.heroes.v1
target: Each enemy in the area
tier1: 6 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 2
tier2: 9 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 4
tier3: 13 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 6
type: ability
---

```ds-feature
cost: 5 Ferocity
distance: 5 x 1 line within 1
effects:
    - roll: Power Roll + [Might](scc.v1:mcdm.heroes.v1/rule.character/might)
      tier1: 6 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 2
      tier2: 9 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 4
      tier3: 13 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 6
    - effect: The targets are [force moved](scc.v1:mcdm.heroes.v1/movement/forced-movement) one at a time, starting with the target nearest to you, and can be [pushed](scc.v1:mcdm.heroes.v1/movement/forced-movement) into other targets in the same line.
      name: Effect
feature_type: ability
flavor: You unleash a howl that hurls your enemies back.
keywords:
    - Area
    - '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee)'
    - Weapon
metadata:
    action_type: '[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)'
    class: fury
    cost: 5 Ferocity
    distance: 5 x 1 line within 1
    effects:
        - roll: Power Roll + [Might](scc.v1:mcdm.heroes.v1/rule.character/might)
          tier1: 6 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 2
          tier2: 9 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 4
          tier3: 13 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 6
        - effect: The targets are [force moved](scc.v1:mcdm.heroes.v1/movement/forced-movement) one at a time, starting with the target nearest to you, and can be [pushed](scc.v1:mcdm.heroes.v1/movement/forced-movement) into other targets in the same line.
          name: Effect
    flavor: You unleash a howl that hurls your enemies back.
    keywords:
        - Area
        - '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee)'
        - Weapon
    level: "1"
    name: Thunder Roar
    power_roll_characteristic: '[Might](scc.v1:mcdm.heroes.v1/rule.character/might)'
    scc: mcdm.heroes.v1/feature.ability.fury.level-1/thunder-roar
    target: Each enemy in the area
    tier1: 6 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 2
    tier2: 9 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 4
    tier3: 13 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 6
    type: ability
name: Thunder Roar
target: Each enemy in the area
type: feature
usage: '[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)'
```
