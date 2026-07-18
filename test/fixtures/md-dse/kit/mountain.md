---
equipment_text: You wear heavy armor and wield a heavy weapon.
file_basename: mountain
file_dpath: kit
flavor: The Mountain kit does exactly what it says on the tin. You don heavy armor and raise a heavy weapon to stand strong against your foes, quickly demolishing them when it's your turn to strike.
item_id: mountain
item_name: Mountain
melee_damage_bonus: +0/+0/+4
name: Mountain
scc: mcdm.heroes.v1/kit/mountain
source: mcdm.heroes.v1
stability_bonus: "+2"
stamina_bonus: +9 per [echelon](scc.v1:mcdm.heroes.v1/rule.general/echelon)
type: kit
---

The [Mountain](scc.v1:mcdm.heroes.v1/kit/mountain) kit does exactly what it says on the tin. You don heavy armor and raise a heavy weapon to stand strong against your foes, quickly demolishing them when it's your turn to strike.

##### Equipment

You wear heavy armor and wield a heavy weapon.

##### Kit Bonuses

**[Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina) [Bonus](scc.v1:mcdm.heroes.v1/rule.dice/bonuses-and-penalties):** +9 per [echelon](scc.v1:mcdm.heroes.v1/rule.general/echelon)

**[Stability](scc.v1:mcdm.heroes.v1/rule.character/stability) [Bonus](scc.v1:mcdm.heroes.v1/rule.dice/bonuses-and-penalties):** +2

**[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) Damage [Bonus](scc.v1:mcdm.heroes.v1/rule.dice/bonuses-and-penalties):** +0/+0/+4

##### Signature Ability

###### Pain for Pain

*An enemy who tagged you will pay for that.*

| **[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee), [Strike](scc.v1:mcdm.heroes.v1/rule.combat/strike), Weapon** |     **Main action** |
|---------------------------|--------------------:|
| **📏 [Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) 1**            | **🎯 One creature** |

**[Power Roll](scc.v1:mcdm.heroes.v1/rule.dice/power-roll) + [Might](scc.v1:mcdm.heroes.v1/rule.character/might) or [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility):**

- **≤11:** 3 + M or A damage
- **12-16:** 5 + M or A damage
- **17+:** 13 + M or A damage

**Effect:** If the target dealt damage to you since the end of your last [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn), this [strike](scc.v1:mcdm.heroes.v1/rule.combat/strike) deals additional damage equal to your [Might](scc.v1:mcdm.heroes.v1/rule.character/might) or [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility) score (your choice).

```ds-feature
distance: '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) 1'
effects:
    - effect: If the target dealt damage to you since the end of your last [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn), this [strike](scc.v1:mcdm.heroes.v1/rule.combat/strike) deals additional damage equal to your [Might](scc.v1:mcdm.heroes.v1/rule.character/might) or [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility) score (your choice).
    - roll: Power Roll + [Might](scc.v1:mcdm.heroes.v1/rule.character/might) or [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility)
      tier1: 3 + M or A damage
      tier2: 5 + M or A damage
      tier3: 13 + M or A damage
feature_type: ability
flavor: An enemy who tagged you will pay for that.
keywords:
    - '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee)'
    - '[Strike](scc.v1:mcdm.heroes.v1/rule.combat/strike)'
    - Weapon
metadata:
    action_type: Main action
    distance: '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) 1'
    effect: If the target dealt damage to you since the end of your last [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn), this [strike](scc.v1:mcdm.heroes.v1/rule.combat/strike) deals additional damage equal to your [Might](scc.v1:mcdm.heroes.v1/rule.character/might) or [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility) score (your choice).
    flavor: An enemy who tagged you will pay for that.
    keywords:
        - '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee)'
        - '[Strike](scc.v1:mcdm.heroes.v1/rule.combat/strike)'
        - Weapon
    name: Pain for Pain
    power_roll_characteristic: '[Might](scc.v1:mcdm.heroes.v1/rule.character/might) or [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility)'
    subtype: signature
    target: One creature
    tier1: 3 + M or A damage
    tier2: 5 + M or A damage
    tier3: 13 + M or A damage
    type: ability
name: Pain for Pain
target: One creature
type: feature
usage: Main action
```
