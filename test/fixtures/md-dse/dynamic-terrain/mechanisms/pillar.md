---
features:
    - body: The pillar's linked trigger must be deactivated.
      icon: "\U0001F300"
      name: Deactivate
    - body: The pillar is destroyed, or a [pressure plate](scc.v1:mcdm.monsters.v1/dynamic-terrain.mechanisms/pressure-plate), [switch](scc.v1:mcdm.monsters.v1/dynamic-terrain.mechanisms/switch), or other linked trigger is activated.
      icon: ❕
      name: Activate
      sections:
        - label: Effect
          text: The **Toppling Pillar** ability.
    - distance: 4 x 1 line within 1
      icon: ❗️
      keywords:
        - Area
      name: Toppling Pillar
      power_roll:
        formula: + 2
        tiers:
            high: 9 damage; M < 2 [restrained](scc.v1:mcdm.heroes.v1/condition/restrained) ([save](scc.v1:mcdm.heroes.v1/rule.general/saving-throw) ends)
            low: 4 damage
            mid: 6 damage; M < 1 [restrained](scc.v1:mcdm.heroes.v1/condition/restrained) ([save](scc.v1:mcdm.heroes.v1/rule.general/saving-throw) ends)
      sections:
        - label: Trigger
          text: The pillar is destroyed, or a [pressure plate](scc.v1:mcdm.monsters.v1/dynamic-terrain.mechanisms/pressure-plate), [switch](scc.v1:mcdm.monsters.v1/dynamic-terrain.mechanisms/switch), or other linked trigger is activated.
        - label: Effect
          text: The area is [difficult terrain](scc.v1:mcdm.heroes.v1/movement/difficult-terrain).
      target: Each creature and object in the area
      usage: Free triggered action
    - body: |-
        **Metal Pillar (+1 EV)** The pillar is made of metal, has 9 [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina), and deals 1d6 extra damage.

        **Multiple Pillars (+3 EV per additional pillar)** Multiple pillars can be used to represent a larger toppling object such as a wall. If triggered by destruction, all individual pillars need to be destroyed before the object falls.
      icon: ⭐️
      name: Upgrades
file_basename: pillar
file_dpath: dynamic-terrain/mechanisms
flavor: This stone pillar can be toppled onto unsuspecting foes with the right amount of damage or a well-engineered trigger mechanism.
item_id: pillar
item_name: Pillar
level: 2
name: Pillar
role: Hexer
scc: mcdm.monsters.v1/dynamic-terrain.mechanisms/pillar
source: mcdm.monsters.v1
stats:
    - name: EV
      value: "3"
    - name: Stamina
      value: "6"
    - name: Size
      value: One square that can't be moved through
    - name: Direction
      value: The pillar topples in a preset direction.
terrain_type: Hazard
type: dynamic-terrain
---

```ds-fb
features:
    - body: The pillar's linked trigger must be deactivated.
      icon: "\U0001F300"
      name: Deactivate
    - body: The pillar is destroyed, or a [pressure plate](scc.v1:mcdm.monsters.v1/dynamic-terrain.mechanisms/pressure-plate), [switch](scc.v1:mcdm.monsters.v1/dynamic-terrain.mechanisms/switch), or other linked trigger is activated.
      icon: ❕
      name: Activate
      sections:
        - label: Effect
          text: The **Toppling Pillar** ability.
    - distance: 4 x 1 line within 1
      icon: ❗️
      keywords:
        - Area
      name: Toppling Pillar
      power_roll:
        formula: + 2
        tiers:
            high: 9 damage; M < 2 [restrained](scc.v1:mcdm.heroes.v1/condition/restrained) ([save](scc.v1:mcdm.heroes.v1/rule.general/saving-throw) ends)
            low: 4 damage
            mid: 6 damage; M < 1 [restrained](scc.v1:mcdm.heroes.v1/condition/restrained) ([save](scc.v1:mcdm.heroes.v1/rule.general/saving-throw) ends)
      sections:
        - label: Trigger
          text: The pillar is destroyed, or a [pressure plate](scc.v1:mcdm.monsters.v1/dynamic-terrain.mechanisms/pressure-plate), [switch](scc.v1:mcdm.monsters.v1/dynamic-terrain.mechanisms/switch), or other linked trigger is activated.
        - label: Effect
          text: The area is [difficult terrain](scc.v1:mcdm.heroes.v1/movement/difficult-terrain).
      target: Each creature and object in the area
      usage: Free triggered action
    - body: |-
        **Metal Pillar (+1 EV)** The pillar is made of metal, has 9 [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina), and deals 1d6 extra damage.

        **Multiple Pillars (+3 EV per additional pillar)** Multiple pillars can be used to represent a larger toppling object such as a wall. If triggered by destruction, all individual pillars need to be destroyed before the object falls.
      icon: ⭐️
      name: Upgrades
flavor: This stone pillar can be toppled onto unsuspecting foes with the right amount of damage or a well-engineered trigger mechanism.
level: 2
metadata:
    scc: mcdm.monsters.v1/dynamic-terrain.mechanisms/pillar
    source: mcdm.monsters.v1
name: Pillar
role: Hexer
stats:
    - name: EV
      value: "3"
    - name: Stamina
      value: "6"
    - name: Size
      value: One square that can't be moved through
    - name: Direction
      value: The pillar topples in a preset direction.
terrain_type: Hazard
type: dynamic-terrain
```
