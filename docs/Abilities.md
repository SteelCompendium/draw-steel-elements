# Abilities

Abilities can take many forms which results in a more fluid yaml when it comes to effects.

Yaml is incredibly sensitive, be sure to format exactly.

## Field Definition

| Property                      | Description                                              | Example                             |
|-------------------------------|----------------------------------------------------------|-------------------------------------|
| `name`                        | The "Title" or "Description" of the ability.             | `name: Might Resistance Roll`       |
| `flavor`                      | The flavor text of the ability.                          | `flavor: Be strong`                 |
| `cost`                        | The cost to use the ability                              | `cost: 3 Piety`                     |
| `keywords`                    | Keywords of the ability                                  | `keywords: Area, Magic`             |
| `type`                        | Type of the ability                                      | `type: Action`                      |
| `distance`                    | Distance of the ability                                  | `distance: 2 burst`                 |
| `target`                      | Target of the ability                                    | `target: All enemies`               |
| `trigger`                     | The Trigger for a Triggered Action                       | `trigger: You are damaged`          |
| `effects`                     | List of effects, power-rolls, and features               | See the [Effects section](#Effects) |
| `indent`                      | Left-margin indentation for the block (for nested lists) | `indent: 2`                               |

Example

```yaml
name: Open the Earth++
cost: 5 Essence 
flavor: The surface of the world around you opens up at your command. 
keywords: Magic, Earth, Persistent, Ranged 
type: Maneuver 
distance: Ranged 5 
target: Special
effects:
- Effect: You open four holes with 1-square openings that are 6 squares deep, and which can be placed on any mundane surface within distance. You can place these holes next to each other to create fewer holes with wider openings. For each creature standing above a hole when it opens and small enough to fall in, make a power roll. 
- roll: Power Roll + Reason
  11 or lower: The target can shift up to 1 square from the edge of the hole to the nearest unoccupied space of their choice. 
  12-16: The target falls into the hole. 
  17+: The target falls into the hole and can’t reduce the height of the fall. 
- name: Persistent 
  cost: 1
  effect: At the start of your turn, you open another hole.
- Just some effect text
- Custom Named Effect: effect value
```

## Effects

Abilities can have many effects and the order is important.  An effect can take several forms, so these objects are pretty flexible

### Power Roll Effect

Power Roll Effects have a roll and the tier results.

| Property                      | Description                                              | Example                             |
|-------------------------------|----------------------------------------------------------|-------------------------------------|
| `roll`                        | Power Roll                                               | `roll: Power Roll + Might or Presence`    |
| `tier 1`, `t1`, `11 or lower` | The tier-1 (11 or lower) result of the Power Roll        | `t1: 2 damage`                            |
| `tier 2`, `t2`, `12-16`       | The tier-2 (12-16) result of the Power Roll              | `t2: 3 damage`                            |
| `tier 3`, `t3`, `17+`         | The tier-3 (17+) result of the Power Roll                | `t3: 4 damage`                            |
| `crit`, `nat 19-20`           | The critical result of the Power Roll                    | `crit: 4 damage, Extra Action`            |

Example:

```yaml
effects:
- roll: Power Roll + Reason
  11 or lower: The target can shift up to 1 square from the edge of the hole to the nearest unoccupied space of their choice. 
  12-16: The target falls into the hole. 
  17+: The target falls into the hole and can’t reduce the height of the fall. 
```

### Test Effect

Same as the Power Roll Effect, but instead of making a Power Roll, the targets of the effect make a Test.

| Property                      | Description                                       | Example                              |
|-------------------------------|---------------------------------------------------|--------------------------------------|
| `name`                        | Name of the effect                                | `name: Spend`                        |
| `cost`                        | Cost of the effect                                | `cost: 1 Essence`                    |
| `effect`                      | Effect (typically includes the test type)         | `effect: Target makes a Might test.` |
| `tier 1`, `t1`, `11 or lower` | The tier-1 (11 or lower) result of the Power Roll | `t1: 2 damage`                       |
| `tier 2`, `t2`, `12-16`       | The tier-2 (12-16) result of the Power Roll       | `t2: 3 damage`                       |
| `tier 3`, `t3`, `17+`         | The tier-3 (17+) result of the Power Roll         | `t3: 4 damage`                       |
| `crit`, `nat 19-20`           | The critical result of the Power Roll             | `crit: 4 damage, Extra Action`       |

Example:

```yaml
effects:
- name: Effect
  effect: Target makes a Might test.
  11 or lower: The target can shift up to 1 square from the edge of the hole to the nearest unoccupied space of their choice. 
  12-16: The target falls into the hole. 
  17+: The target falls into the hole and can’t reduce the height of the fall. 
```

### Named Effect

Named Effects are a key-value pairing.

| Property | Description               | Example                                      |
|----------|---------------------------|----------------------------------------------|
| `name`   | Name of the effect        | `name: Effect` or `name: Alternative Effect` |
| `effect` | Description of the effect | `effect: Target can spend a recovery.`       |

Example:

```yaml
effects:
- name: Alternative Effect
  effect: Target can spend a recovery.
```

### Named Effect With Cost

Named Effects with a cost are the same as Named Effects, but add an additional cost to the effect

| Property | Description               | Example                                |
|----------|---------------------------|----------------------------------------|
| `name`   | Name of the effect        | `name: Spend`                          |
| `cost`   | Cost of the effect        | `cost: 1 Essence`                      |
| `effect` | Description of the effect | `effect: Target can spend a recovery.` |

Example:

```yaml
effects:
- name: Spend
  cost: 1 Essence
  effect: Target can spend a recovery.
```

### Nameless Effect

Nameless Effects are a bit different in that they are a String instead of a yaml object.

```yaml
effects:
- Each creature within 2 squares of the chorogaunt can’t be hidden from them.
```

