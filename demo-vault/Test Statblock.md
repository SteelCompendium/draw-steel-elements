```ds-sb
name: Human Bandit Chief 
level: 3 
roles: 
  - Boss
ancestry: 
  - Human
  - Humanoid 
ev: 54
stamina: 120 
immunities: 
  - Magic 2
  - Psionic 2
speed: 5 
size: 1M
stability: 2
free_strike: 5
might: +2 
agility: +2 
reason: -1 
intuition: +2 
presence: +2
traits:
- name: End Effect 
  effect: At the end of their turn, the bandit chief can take 5 damage to end one EoE effect affecting them. This damage can’t be reduced in any way.
abilities:
- name: Whip & Magic Longsword
  cost: Signature
  type: Action
  roll: 2d10 + 2
  keywords:
    - Attack
    - Magic
    - Melee
    - Weapon
  distance: Reach 1
  target: Two enemies or objects
  tier 1: 5 damage; pull 1
  tier 2: 9 damage; pull 2
  tier 3: 12 damage; pull 3
  crit: 12 damage; pull 3; another action
  effect: A target who is adjacent to the bandit chief after the attack is resolved takes 9 corruption damage.
  additional_effects:
    - cost: 2 VP
      effect: This ability targets three enemies or objects.
- name: Kneel, Peasant!
  type: Maneuver
  keywords:
  - Attack
  - Melee
  - Weapon
  distance: Reach 1 
  target: One enemy or object
  t1: Push 1
  t2: Push 2; prone
  t3: Push 3; prone
  additional_effects:
    - cost: 2 VP
      effect: This ability targets each enemy adjacent to the bandit chief.
- name: Bloodstones 
  type: Triggered Action
  keywords:
    - Magic
  distance: Self 
  target: Self
  trigger: The bandit chief makes a power roll for an attack.
  effect: The bandit chief takes 4 corruption damage and increases the result of the power roll by one tier.
- name: Shoot!
  type: Villain Action
  cost: 1 VP
  keywords: Area
  distance: 10 burst 
  target: Each ally
  effect: Each target can make a ranged free strike.
- name: Form Up! 
  type: Villain Action
  cost: 2 VP
  effect: Each target shifts up to their speed. Until the end of the encounter, any enemy takes a bane on attacks against the bandit chief or any of the bandit chief’s allies if they are adjacent to that target.
  keywords: Area
  distance: 10 burst 
  target: Each ally
  effect: Each target shifts up to their speed. Until the end of the encounter, any enemy takes a bane on attacks against the bandit chief or any of the bandit chief’s allies if they are adjacent to that target.
- name: Lead From the Front 
  type: Villain Action 3
  cost: 3 VP
  keywords: 
    - Attack 
    - Weapon
  distance: Self 
  target: Self
  effect: The bandit chief shifts twice their speed. During or after this movement, they can attack up to four targets with Whip & Magic Longsword. Any ally of the bandit chief adjacent to a target can make a free strike against that target.
```