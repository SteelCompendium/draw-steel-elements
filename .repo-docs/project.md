# Project Context

## Product Overview

Draw Steel Elements is an Obsidian community plugin that brings Draw Steel TTRPG content to life inside Obsidian vaults. Players and GMs write YAML inside fenced code blocks and the plugin renders styled, interactive elements: ability cards with power rolls, creature statblocks, initiative trackers for combat, negotiation trackers, stamina bars, and more. The plugin also includes a compendium downloader that fetches pre-built Draw Steel reference content from GitHub releases directly into the vault.

The problem it solves: Draw Steel content is complex and structured (abilities have tiers, creatures have stats, encounters have initiative order). Plain markdown can't express this well. This plugin provides first-class rendering and interaction for Draw Steel game mechanics inside the note-taking tool many TTRPG players already use.

## Domain Context

This is a TTRPG (tabletop role-playing game) tool. The mental models needed:

- **Draw Steel** is a tactical TTRPG by MCDM Productions. It uses Power Rolls (2d10 + modifier) with three tier outcomes, hero characteristics (Might, Agility, Reason, Intuition, Presence), and structured combat with initiative, stamina, and conditions.
- **Obsidian** is a note-taking app that renders markdown. Plugins extend it by registering code block processors that intercept fenced code blocks and render custom HTML/DOM.
- **Code block processors** are the core extension mechanism. A block like ` ```ds-feature ` triggers the plugin's FeatureProcessor, which parses the YAML content and renders styled HTML.

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Element** | A rendered UI component produced from a `ds-*` code block. The plugin registers multiple elements (feature, statblock, initiative, etc.) |
| **Processor** | TypeScript class that handles parsing YAML and rendering DOM for a specific element type. Each has a `handler` method registered with Obsidian. |
| **Feature** | A Draw Steel ability, test, resistance roll, or other power-roll-based game mechanic. Rendered with tier outcomes (11 or lower, 12-16, 17+). |
| **Featureblock** | A grouped collection of features with stats, used for class kits or ancestry features. |
| **Statblock** | A creature or NPC stat block showing characteristics, abilities, stamina, and other combat stats. |
| **Initiative Tracker** | Interactive encounter manager for combat. Tracks turn order, stamina, conditions, and supports referencing statblocks from other notes. |
| **Negotiation Tracker** | Interactive tracker for Draw Steel's negotiation subsystem. Tracks patience, interest, motivations, pitfalls, and arguments. |
| **Stamina Bar** | Visual health bar component showing current/max stamina with temporary stamina support. |
| **Power Roll** | Draw Steel's core dice mechanic: 2d10 + modifier with three tier outcomes. |
| **Compendium** | A downloadable set of pre-built markdown notes with Draw Steel reference content (from `data-md-dse` repo). |
| **Reference Resolution** | The ability to reference content from other notes using `@path` or `[[wikilink]]` syntax within element YAML. |
| **ComponentWrapper** | A JSON schema-validated wrapper format that standardizes how Vue components receive data. |

## Glossary

| Term | Meaning |
|------|---------|
| `ds-*` | Prefix for all plugin code block languages (e.g., `ds-ft`, `ds-sb`, `ds-it`) |
| DSE | Draw Steel Elements (this plugin) |
| SCC | Steel Compendium Classification -- hierarchical ID system (`source:type:item`) used across data repos |
| SDK | `steel-compendium-sdk` / `data-sdk-npm` -- TypeScript library for parsing Draw Steel data models |
| Tier | Power roll outcome bracket: Tier 1 (11-), Tier 2 (12-16), Tier 3 (17+) |
| Stamina | Draw Steel's health system (not HP). Creatures have max stamina and can gain temporary stamina. |
| Condition | Status effects in Draw Steel (bleeding, dazed, frightened, etc.) applied during combat |
| Vault | An Obsidian workspace directory containing markdown notes |
| Minion | A weak creature type in Draw Steel that shares a stamina pool with other minions |

## Audiences

| Audience | How they use it |
|----------|-----------------|
| **Draw Steel GMs** | Run encounters using initiative tracker, display statblocks, reference compendium content |
| **Draw Steel Players** | View ability cards, track character stamina, reference skills |
| **Plugin Developers** | Extend or contribute to the plugin codebase |
| **Compendium Authors** | Create Draw Steel content in markdown that leverages the plugin's rendering |

## Feature Inventory

### Shipped

- Feature element (`ds-feature`, `ds-feat`, `ds-ft`) -- ability/power roll rendering with tier outcomes
- Featureblock element (`ds-featureblock`, `ds-fb`) -- grouped features with stats
- Statblock element (`ds-statblock`, `ds-sb`) -- creature/NPC stat blocks
- Initiative tracker (`ds-initiative`, `ds-init`, `ds-it`) -- interactive combat tracker with conditions, stamina, minion pools
- Negotiation tracker (`ds-negotiation`, `ds-nt`) -- interactive negotiation subsystem tracker
- Stamina bar (`ds-stamina-bar`, `ds-stamina`, `ds-stam`) -- visual health bar with temp stamina
- Characteristics element (`ds-characteristics`, `ds-char`) -- hero stat display
- Counter element (`ds-counter`, `ds-ct`) -- generic counter
- Skills element (`ds-skills`) -- skill list with collapsible groups
- Values row (`ds-values-row`, `ds-vr`) -- key-value display row
- Horizontal rule (`ds-hr`, `ds-horizontal-rule`) -- Draw Steel styled divider
- Compendium downloader -- fetches `data-md-dse` releases into vault
- Cross-note reference resolution (`@path` and `[[wikilink]]` syntax)
- JSON Schema validation (AJV) for element YAML
- Vue 3 component system with Composition API
- Mobile support

### Known Limitations

- No Live Preview mode support (Reading mode only)
- No dice rolling integration
- No party tracker (XP, Victories)

## Constraints and Risks

- **Obsidian API dependency**: Plugin is tightly coupled to Obsidian's `Plugin`, `MarkdownPostProcessorContext`, and vault APIs. API changes in Obsidian can break functionality.
- **SDK dependency**: The `steel-compendium-sdk` (v2.1.5) defines data model schemas. Major SDK version bumps are breaking changes (as seen in v4.0.0).
- **No test suite**: The repo has jest configured but no test files exist. This is a risk for regressions.
- **Licensing**: Published under MIT. Content is under the DRAW STEEL Creator License and is not affiliated with MCDM Productions.
