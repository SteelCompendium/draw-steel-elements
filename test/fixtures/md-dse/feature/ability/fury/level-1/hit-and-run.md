---
action_type: '[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)'
class: fury
distance: '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) 1'
effects:
    - roll: Power Roll + [Might](scc.v1:mcdm.heroes.v1/rule.character/might)
      tier1: 2 + M damage
      tier2: 5 + M damage
      tier3: 7 + M damage; A < STRONG, [slowed](scc.v1:mcdm.heroes.v1/condition/slowed) (save ends)
    - effect: You can [shift](scc.v1:mcdm.heroes.v1/movement/shifting) 1 square.
      name: Effect
feature_type: ability
file_basename: hit-and-run
file_dpath: feature/ability/fury/level-1
flavor: Staying in constant motion helps you slip out of reach after a brutal assault.
item_id: hit-and-run
item_name: Hit and Run
keywords:
    - '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee)'
    - '[Strike](scc.v1:mcdm.heroes.v1/rule.combat/strike)'
    - Weapon
level: "1"
name: Hit and Run
power_roll_characteristic: '[Might](scc.v1:mcdm.heroes.v1/rule.character/might)'
scc: mcdm.heroes.v1/feature.ability.fury.level-1/hit-and-run
source: mcdm.heroes.v1
subtype: signature
target: One creature or object
tier1: 2 + M damage
tier2: 5 + M damage
tier3: 7 + M damage; A < STRONG, [slowed](scc.v1:mcdm.heroes.v1/condition/slowed) (save ends)
type: ability
---

```ds-feature
distance: '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) 1'
effects:
    - roll: Power Roll + [Might](scc.v1:mcdm.heroes.v1/rule.character/might)
      tier1: 2 + M damage
      tier2: 5 + M damage
      tier3: 7 + M damage; A < STRONG, [slowed](scc.v1:mcdm.heroes.v1/condition/slowed) (save ends)
    - effect: You can [shift](scc.v1:mcdm.heroes.v1/movement/shifting) 1 square.
      name: Effect
feature_type: ability
flavor: Staying in constant motion helps you slip out of reach after a brutal assault.
keywords:
    - '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee)'
    - '[Strike](scc.v1:mcdm.heroes.v1/rule.combat/strike)'
    - Weapon
metadata:
    action_type: '[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)'
    class: fury
    distance: '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) 1'
    effects:
        - roll: Power Roll + [Might](scc.v1:mcdm.heroes.v1/rule.character/might)
          tier1: 2 + M damage
          tier2: 5 + M damage
          tier3: 7 + M damage; A < STRONG, [slowed](scc.v1:mcdm.heroes.v1/condition/slowed) (save ends)
        - effect: You can [shift](scc.v1:mcdm.heroes.v1/movement/shifting) 1 square.
          name: Effect
    flavor: Staying in constant motion helps you slip out of reach after a brutal assault.
    keywords:
        - '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee)'
        - '[Strike](scc.v1:mcdm.heroes.v1/rule.combat/strike)'
        - Weapon
    level: "1"
    name: Hit and Run
    power_roll_characteristic: '[Might](scc.v1:mcdm.heroes.v1/rule.character/might)'
    scc: mcdm.heroes.v1/feature.ability.fury.level-1/hit-and-run
    subtype: signature
    target: One creature or object
    tier1: 2 + M damage
    tier2: 5 + M damage
    tier3: 7 + M damage; A < STRONG, [slowed](scc.v1:mcdm.heroes.v1/condition/slowed) (save ends)
    type: ability
name: Hit and Run
target: One creature or object
type: feature
usage: '[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)'
```
