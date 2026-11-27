---
file_basename: climb-or-swim
file_dpath: movement
item_id: climb-or-swim
item_name: Climb or Swim
name: Climb or Swim
scc: mcdm.heroes.v1/movement/climb-or-swim
source: mcdm.heroes.v1
type: movement
---

A creature who has "climb" in their [speed](scc.v1:mcdm.heroes.v1/rule.character/speed) entry, or who gains the temporary ability to automatically climb, can climb across vertical and horizontal surfaces at full [speed](scc.v1:mcdm.heroes.v1/rule.character/speed). Likewise, a creature who has "swim" in their [speed](scc.v1:mcdm.heroes.v1/rule.character/speed) entry, or who gains the temporary ability to automatically swim, can swim in liquid at full [speed](scc.v1:mcdm.heroes.v1/rule.character/speed).

Creatures without those types of movement can still climb or swim when a rule allows them to move, but each square of climbing or swimming costs 2 squares of movement. If a surface is difficult to climb (for instance, a sheer cliff or ice-covered wall) or a liquid is hard to swim through (a raging river or whirlpool), the Director can call for a [Might](scc.v1:mcdm.heroes.v1/rule.character/might) [test](scc.v1:mcdm.heroes.v1/rule.test/test). On a failure, a creature can't climb or swim but wastes no movement in the attempt. The Director can also impose other consequences to failure, such as being caught in the spinning current of a whirlpool.

###### Climbing Other Creatures

You can attempt to climb a creature whose [size](scc.v1:mcdm.heroes.v1/rule.character/size) is greater than yours. If the creature is willing, you can climb them without any trouble. If the creature is unwilling, you make the following [test](scc.v1:mcdm.heroes.v1/rule.test/test):

**[Power Roll](scc.v1:mcdm.heroes.v1/rule.dice/power-roll) + [Might](scc.v1:mcdm.heroes.v1/rule.character/might) or [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility):**

- **≤11:** You fail to climb the creature, and they can make a [free strike](scc.v1:mcdm.heroes.v1/feature.common.main-actions/free-strike) against you.
- **12-16:** You fail to climb the creature.
- **17+:** You climb the creature.

While you climb or ride a creature, you gain an [edge](scc.v1:mcdm.heroes.v1/rule.dice/edge) on [melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) abilities used against them. The creature can use a maneuver to attempt to knock you off, forcing you to make the following [test](scc.v1:mcdm.heroes.v1/rule.test/test):

**[Power Roll](scc.v1:mcdm.heroes.v1/rule.dice/power-roll) + [Might](scc.v1:mcdm.heroes.v1/rule.character/might) or [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility):**

- **≤11:** You fall off the creature into an unoccupied [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) space of your choice, taking falling damage and landing [prone](scc.v1:mcdm.heroes.v1/condition/prone) as usual (see Falling below).
- **12-16:** You slide down the creature into an unoccupied [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) space of your choice and don't l[and prone](scc.v1:mcdm.heroes.v1/condition/prone).
- **17+:** You continue to hold on to the creature.

If you are [knocked prone](scc.v1:mcdm.heroes.v1/condition/prone) while climbing or riding a creature, you fall and l[and prone](scc.v1:mcdm.heroes.v1/condition/prone) in an [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) space of your choice, taking damage as usual from the fall.
