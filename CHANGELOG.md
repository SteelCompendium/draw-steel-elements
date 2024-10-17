# Changelog

## Next

- Adds better error handling on Ability, Negotiation, and Statblock Elements

## 2.0.0

- [BREAKING] The Power Roll Element has been replaced by the Ability Element
  - Instead of having a flat structure for the yaml, the `effects` field will list effects, power rolls, etc in an ordered manner
  - As a side effect, the Statblock Element inherits these changes as well
  - For details on the new structure, see the [Ability Documentation](./docs/Abilities.md) 
- Adds ability to [download the Draw Steel Compendium](./docs/compendium-downloader.md)

## 1.6.0

- Adds the statblock element! See the [statblock](./docs/statblock.md) documentation for details!
- Initiative tracker can be triggered with `ds-it` and `ds-initiative-tracker` now

## 1.5.0

- Adds basic support for Negotiation Tracking!

## 1.4.0

- Initiative Tracker
  - Adds basic support for tracking minions!
  - [BUGFIX] Prevents VP text from highlighting when changing
  - [BUGFIX] Allows click-to-remove conditions when blinking

## 1.3.0

- Add ability to reset the encounter

## 1.2.0

- Initiative Tracker
  - Overhauls the condition modal and adds support for customizing the condition appearance 

## 1.1.2

- [BUGFIX] Allow enemies to use recoveries

## 1.1.1

- [BUGFIX] Corrects bugs allowing for non-integer stamina

## 1.1.0

- Adds the Initiative Tracker Element!

## 1.0.2

- Corrects sizing issue on power roll tiers

## 1.0.1

- Cleanup bulleted lists

## 1.0.0

- Adds `horizontal-rule` element
- Adds a ton of new fields to `power-roll` element (See readme)
- [PSEUDO-BREAKING] No longer supports inline-codeblocks for `horizontal-rule`
  - This was unreleased, but for those who built manually...
  - Use a regular multi-line codeblock for functionality
- Adds support for rendering markdown in Power Roll values
- Much more!

## 0.0.6

- Internal cleanup, bugfixes

## 0.0.5

- Avoids innerHTML call for compliance

## 0.0.4

- Prep for inclusion in community plugins

## 0.0.2

- Adds `indent` property to Power Roll Element to support nested lists

## 0.0.1

- Initial release: Power Roll Element basics

