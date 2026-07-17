---
equipment_text: You wear no armor and wield a heavy weapon.
file_basename: panther
file_dpath: kit
flavor: If you want a good balance of protection, speed, and damage, the Panther kit is for you. This kit increases your Stamina not by wearing armor, but through the focused battle preparation of body and mind, letting you be fast and mobile while swinging a heavy weapon at your foes.
item_id: panther
item_name: Panther
melee_damage_bonus: +0/+0/+4
name: Panther
scc: mcdm.heroes.v1/kit/panther
source: mcdm.heroes.v1
speed_bonus: "+1"
stability_bonus: "+1"
stamina_bonus: +6 per [echelon](scc.v1:mcdm.heroes.v1/rule.general/echelon)
type: kit
---

If you want a good balance of protection, [speed](scc.v1:mcdm.heroes.v1/rule.character/speed), and damage, the [Panther](scc.v1:mcdm.heroes.v1/kit/panther) kit is for you. This kit increases your [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina) not by wearing armor, but through the focused battle preparation of body and mind, letting you be fast and mobile while swinging a heavy weapon at your foes.

##### Equipment

You wear no armor and wield a heavy weapon.

```ds-feature
distance: '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) 1'
effects:
    - effect: You can move up to 3 squares straight toward the target before this [strike](scc.v1:mcdm.heroes.v1/rule.combat/strike), which deals extra damage equal to the number of squares you move this way.
    - roll: Power Roll + [Might](scc.v1:mcdm.heroes.v1/rule.character/might) or [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility)
      tier1: 3 + M or A damage
      tier2: 6 + M or A damage
      tier3: 13 + M or A damage
feature_type: ability
flavor: The faster you move, the harder you hit.
keywords:
    - '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee)'
    - '[Strike](scc.v1:mcdm.heroes.v1/rule.combat/strike)'
    - Weapon
metadata:
    action_type: Main action
    distance: '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) 1'
    effect: You can move up to 3 squares straight toward the target before this [strike](scc.v1:mcdm.heroes.v1/rule.combat/strike), which deals extra damage equal to the number of squares you move this way.
    flavor: The faster you move, the harder you hit.
    keywords:
        - '[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee)'
        - '[Strike](scc.v1:mcdm.heroes.v1/rule.combat/strike)'
        - Weapon
    name: Devastating Rush
    power_roll_characteristic: '[Might](scc.v1:mcdm.heroes.v1/rule.character/might) or [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility)'
    subtype: signature
    target: One creature or object
    tier1: 3 + M or A damage
    tier2: 6 + M or A damage
    tier3: 13 + M or A damage
    type: ability
name: Devastating Rush
target: One creature or object
type: feature
usage: Main action
```
