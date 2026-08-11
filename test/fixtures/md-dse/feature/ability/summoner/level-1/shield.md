---
action_type: Triggered
class: summoner
distance: Summoner's Range
effects:
    - effect: If one of your minions is [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) to the target and is within [distance](scc.v1:mcdm.heroes.v1/rule.combat/distance) of the strike, they become the new target of the strike.
      name: Effect
    - cost: Spend 1 Essence
      effect: Instead of commanding an existing minion, you summon a signature minion into an unoccupied space [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) to the target to take the strike.
feature_source: summoner
feature_type: ability
file_basename: shield
file_dpath: feature/ability/summoner/level-1
flavor: You call upon a minion to use their body to dampen the blow.
item_id: shield
item_name: Shield!
keywords: []
level: "1"
name: Shield!
scc: mcdm.summoner.v1/feature.ability.summoner.level-1/shield
source: mcdm.summoner.v1
target: Self or one ally
trigger: The target is targeted by a [strike](scc.v1:mcdm.heroes.v1/rule.combat/strike).
type: ability
---

```ds-feature
distance: Summoner's Range
effects:
    - effect: If one of your minions is [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) to the target and is within [distance](scc.v1:mcdm.heroes.v1/rule.combat/distance) of the strike, they become the new target of the strike.
      name: Effect
    - cost: Spend 1 Essence
      effect: Instead of commanding an existing minion, you summon a signature minion into an unoccupied space [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) to the target to take the strike.
feature_type: ability
flavor: You call upon a minion to use their body to dampen the blow.
keywords: []
metadata:
    action_type: Triggered
    class: summoner
    distance: Summoner's Range
    effects:
        - effect: If one of your minions is [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) to the target and is within [distance](scc.v1:mcdm.heroes.v1/rule.combat/distance) of the strike, they become the new target of the strike.
          name: Effect
        - cost: Spend 1 Essence
          effect: Instead of commanding an existing minion, you summon a signature minion into an unoccupied space [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) to the target to take the strike.
    feature_source: summoner
    flavor: You call upon a minion to use their body to dampen the blow.
    keywords: []
    level: "1"
    name: Shield!
    scc: mcdm.summoner.v1/feature.ability.summoner.level-1/shield
    target: Self or one ally
    trigger: The target is targeted by a [strike](scc.v1:mcdm.heroes.v1/rule.combat/strike).
    type: ability
name: Shield!
target: Self or one ally
trigger: The target is targeted by a [strike](scc.v1:mcdm.heroes.v1/rule.combat/strike).
type: feature
usage: Triggered
```
