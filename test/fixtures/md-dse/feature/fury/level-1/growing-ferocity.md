---
action_type: feature
class: fury
feature_type: feature
file_basename: growing-ferocity
file_dpath: feature/fury/level-1
item_id: growing-ferocity
item_name: Growing Ferocity
level: "1"
name: Growing Ferocity
scc: mcdm.heroes.v1/feature.fury.level-1/growing-ferocity
source: mcdm.heroes.v1
type: feature
---

```ds-feature
effects:
    - effect: |-
        You gain certain benefits in combat based on the amount of ferocity you have (see 1st-Level Aspect Features for details). These benefits last until the end of your [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn), even if a benefit would become unavailable to you because of the amount of ferocity you spend during your [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn).

        Some [Growing Ferocity](scc.v1:mcdm.heroes.v1/feature.fury.boren/growing-ferocity) benefits can be applied only if you are a specific level or higher, with the level of those benefits noted in the various [Growing Ferocity](scc.v1:mcdm.heroes.v1/feature.fury.boren/growing-ferocity) tables in this section.

        ###### Berserker Growing Ferocity Table

        | Ferocity        | Benefit                                                                                                                                                                                                                        |
        |-----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
        | 2               | Whenever you use the [Knockback](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/knockback) maneuver, the [forced movement](scc.v1:mcdm.heroes.v1/movement/forced-movement) [distance](scc.v1:mcdm.heroes.v1/rule.combat/distance) gains a [bonus](scc.v1:mcdm.heroes.v1/rule.dice/bonuses-and-penalties) equal to your [Might](scc.v1:mcdm.heroes.v1/rule.character/might) score.                                                                                                                 |
        | 4               | The first time you [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) a creature on a [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn), you gain 1 [surge](scc.v1:mcdm.heroes.v1/rule.resource/surge).                                                                                                                                                                |
        | 6               | You gain an [edge](scc.v1:mcdm.heroes.v1/rule.dice/edge) on [Might](scc.v1:mcdm.heroes.v1/rule.character/might) [tests](scc.v1:mcdm.heroes.v1/rule.test/test) and the [Knockback](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/knockback) maneuver.                                                                                                                                                                    |
        | 8 (4th level)   | The first time you [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) a creature on a [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn), you gain 2 [surges](scc.v1:mcdm.heroes.v1/rule.resource/surge).                                                                                                                                                               |
        | 10 (7th level)  | You have a double [edge](scc.v1:mcdm.heroes.v1/rule.dice/edge) on [Might](scc.v1:mcdm.heroes.v1/rule.character/might) [tests](scc.v1:mcdm.heroes.v1/rule.test/test) and the [Knockback](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/knockback) maneuver.                                                                                                                                                              |
        | 12 (10th level) | Whenever you use a [heroic ability](scc.v1:mcdm.heroes.v1/rule.general/heroic-ability), you gain 10 [temporary Stamina](scc.v1:mcdm.heroes.v1/rule.health/temporary-stamina). Additionally, whenever you make a [power roll](scc.v1:mcdm.heroes.v1/rule.dice/power-roll) that imposes [forced movement](scc.v1:mcdm.heroes.v1/movement/forced-movement) on a target, the [forced movement](scc.v1:mcdm.heroes.v1/movement/forced-movement) [distance](scc.v1:mcdm.heroes.v1/rule.combat/distance) gains a [bonus](scc.v1:mcdm.heroes.v1/rule.dice/bonuses-and-penalties) equal to your [Might](scc.v1:mcdm.heroes.v1/rule.character/might) score. |

        ###### Reaver Growing Ferocity Table

        | Ferocity        | Benefit                                                                                                                                                                                                                          |
        |-----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
        | 2               | Whenever you use the [Knockback](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/knockback) maneuver, the [forced movement](scc.v1:mcdm.heroes.v1/movement/forced-movement) [distance](scc.v1:mcdm.heroes.v1/rule.combat/distance) gains a [bonus](scc.v1:mcdm.heroes.v1/rule.dice/bonuses-and-penalties) equal to your [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility) score.                                                                                                                 |
        | 4               | The first time you [slide](scc.v1:mcdm.heroes.v1/movement/forced-movement) a creature on a [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn), you gain 1 [surge](scc.v1:mcdm.heroes.v1/rule.resource/surge).                                                                                                                                                                 |
        | 6               | You gain an [edge](scc.v1:mcdm.heroes.v1/rule.dice/edge) on [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility) [tests](scc.v1:mcdm.heroes.v1/rule.test/test) and the [Knockback](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/knockback) maneuver.                                                                                                                                                                    |
        | 8 (4th level)   | The first time you [slide](scc.v1:mcdm.heroes.v1/movement/forced-movement) a creature on a [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn), you gain 2 [surges](scc.v1:mcdm.heroes.v1/rule.resource/surge).                                                                                                                                                                |
        | 10 (7th level)  | You have a double [edge](scc.v1:mcdm.heroes.v1/rule.dice/edge) on [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility) [tests](scc.v1:mcdm.heroes.v1/rule.test/test) and the [Knockback](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/knockback) maneuver.                                                                                                                                                              |
        | 12 (10th level) | Whenever you use a [heroic ability](scc.v1:mcdm.heroes.v1/rule.general/heroic-ability), you gain 10 [temporary Stamina](scc.v1:mcdm.heroes.v1/rule.health/temporary-stamina). Additionally, whenever you make a [power roll](scc.v1:mcdm.heroes.v1/rule.dice/power-roll) that imposes [forced movement](scc.v1:mcdm.heroes.v1/movement/forced-movement) on a target, the [forced movement](scc.v1:mcdm.heroes.v1/movement/forced-movement) [distance](scc.v1:mcdm.heroes.v1/rule.combat/distance) gains a [bonus](scc.v1:mcdm.heroes.v1/rule.dice/bonuses-and-penalties) equal to your [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility) score. |
feature_type: feature
metadata:
    class: fury
    level: "1"
    name: Growing Ferocity
    scc: mcdm.heroes.v1/feature.fury.level-1/growing-ferocity
    type: feature
name: Growing Ferocity
type: feature
```
