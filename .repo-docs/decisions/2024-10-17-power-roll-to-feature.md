# Replace Power Roll with Feature Element

**Date:** 2024-10-17
**Status:** accepted

## Context

The original element was called "Power Roll" (`ds-power-roll`) and had a flat
YAML structure. As the plugin matured, it needed to support more than just
power rolls -- tests, resistance rolls, abilities with multiple effects, and
tiered outcomes. The flat structure couldn't express ordered lists of effects.

## Options Considered

### Rename to "Feature" with structured effects
- Pros: More general name covers all use cases (abilities, tests, resistance rolls), `effects` array allows ordered content, backwards-compatible aliases possible
- Cons: Breaking YAML format change, existing users must update their notes

### Extend Power Roll with optional fields
- Pros: No breaking change, gradual migration
- Cons: Name becomes misleading (not all features are power rolls), flat structure becomes unwieldy with many optional fields

## Decision

Replaced the Power Roll element with the Feature element (v2.0.0). The YAML
format changed from flat fields to a structured `effects` array. Code block
tags changed to `ds-feature` / `ds-feat` / `ds-ft`. The Statblock element
inherited the same structured effects format.

## Consequences

- Breaking change for all existing users (v2.0.0)
- More expressive YAML format for complex abilities
- The "Feature" name is Draw Steel-native (matches the game's terminology)
- Statblock abilities automatically benefit from the same format
- Old `ds-power-roll` tag was removed

## Outcome

The Feature element format has proven flexible enough for all ability types
encountered so far. The structured effects array was the right design -- it
cleanly handles abilities with multiple tiers, tests, and resistance rolls.
No regrets on the breaking change.
