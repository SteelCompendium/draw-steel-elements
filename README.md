# Draw Steel Elements Plugin for Obsidian

Statblocks, ability cards, initiative, negotiation and montage trackers, a Stamina bar and a
synced copy of the Draw Steel Compendium — all inside your Obsidian vault.

_The Draw Steel Elements Obsidian Plugin is an independent product published under the
DRAW STEEL Creator License and is not affiliated with MCDM Productions, LLC. DRAW STEEL ©
2024 MCDM Productions, LLC._

**Reading mode only.** The plugin renders in Obsidian's Reading view; blocks show as plain
code in Live Preview. Switch a note to Reading view (`Ctrl/Cmd + E`) to see your elements.

Please use this [form to report bugs](https://docs.google.com/forms/d/e/1FAIpQLSc6m-pZ0NLt2EArE-Tcxr-XbAPMyhu40ANHJKtyRvvwBd2LSw/viewform?usp=sharing&ouid=105036387964900154878)
if you find them!

![sample](./docs/Media/sample.png)

The initiative tracker in use — edit the title, mark heroes acted, step Malice, add a
Malice entry, advance the round:

![The initiative tracker in use](./docs/Media/initiative-tracker.gif)

## Install

**Requires Obsidian 1.13.0 or newer.** Obsidian updates itself by default, so most installs
already qualify (**Settings → General → Current version** if you want to check). On an older
Obsidian you keep the last compatible build, 6.0.2, until you update the app.

1. **Settings → Community plugins → Browse**
2. Search for **Draw Steel Elements**
3. **Install**, then **Enable**

**Upgrading from a 5.x or 6.0.x install?** Read the
[5.x → 7.0.0 migration guide](./docs/migrating-to-7.md) first — everyone should re-sync
their compendium, and the first sync offers to move your old compendium files so your
links keep working.

## Quick start

**New here? Start with [Getting started](./docs/getting-started.md)** — install to running a
fight, no YAML or markdown knowledge assumed. The short version:

Everything the plugin renders is a fenced code block whose language is a `ds-` name — for
example:

````markdown
```ds-hr
```
````

You don't have to memorise any of them. In the editor, type **`/ds`** and pick an element
from the list: the plugin writes a filled-in example block for you, ready to edit. Every
element also has an **Insert Draw Steel: …** command in the command palette. See
[Writing and editing blocks](./docs/writing-blocks.md).

Then either:

- **Write your own content** — a creature in a [statblock](./docs/statblock.md), an ability
  in a [feature](./docs/Features.md) block; or
- **Use the official content** — [sync the compendium](./docs/compendium-sync.md) and
  reference any entry by its code, no copying required.

## What's included

### Content you write or reference

| Element | Block | What it does |
|---|---|---|
| [Statblock](./docs/statblock.md) | `ds-statblock`, `ds-sb` | A full creature statblock. |
| [Feature / ability card](./docs/Features.md) | `ds-feature`, `ds-ft`, `ds-feat` | Abilities, traits, tests and other power rolls. |
| [Featureblock](./docs/featureblock.md) | `ds-featureblock`, `ds-fb` | A group of features (Malice, Dynamic Terrain, …). |
| [Compendium reference](./docs/compendium-sync.md#referencing-a-compendium-entry-in-your-notes) | `ds-scc` | Renders most entries from your synced compendium by their code (statblocks, features, kits and more; [a few kinds have no card yet](./docs/compendium-sync.md#what-renders-and-what-doesnt-yet)). |
| [Horizontal rule](./docs/horizontal-rule.md) | `ds-hr` | A Draw Steel styled section divider. |

### Running the game

| Element | Block | What it does |
|---|---|---|
| [Initiative tracker](./docs/initiative-tracker.md) | `ds-initiative`, `ds-it` | Run an encounter: turns, Stamina, conditions, Malice. |
| [Negotiation tracker](./docs/negotiation-tracker.md) | `ds-negotiation`, `ds-nt` | Run a negotiation: interest, patience, motivations, pitfalls. |
| [Montage Test tracker](./docs/gm-trackers.md) | `ds-montage` | Track successes, failures and rounds in a montage test. |

### Hero tracker

| Element | Block | What it does |
|---|---|---|
| [Stamina bar](./docs/stamina-bar.md) | `ds-stamina-bar`, `ds-stam` | Stamina, temporary Stamina, Recoveries, Winded/Dying. |

### Character sheet pieces (great in [Canvas](./docs/canvas-character-sheet.md))

[Characteristics](./docs/characteristics-element.md) (`ds-characteristics`),
[Skills](./docs/skills-element.md) (`ds-skills`),
[Values row](./docs/values-row-element.md) (`ds-values-row`) and
[Counter](./docs/counter.md) (`ds-counter`).

## The compendium in your vault

[Compendium Sync](./docs/compendium-sync.md) downloads the
[Draw Steel Compendium](https://steelcompendium.io/compendium) into a folder in your vault
and keeps it up to date, without touching your own notes. Once it's synced, a `ds-scc`
block renders most entries in it — the body is just the entry's code (statblocks, features,
featureblocks and kits all render; skills, saints, gods and a few other kinds show a "has no
renderer" card for now, see [what renders](./docs/compendium-sync.md#what-renders-and-what-doesnt-yet)):

````markdown
```ds-scc
mcdm.heroes.v1/kit/panther
```
````

Use **Insert Draw Steel: compendium reference** in the command palette to search for an
entry and drop the block in. The card always shows the currently synced version — nothing
is copied into your note.

## Settings

**Settings → Draw Steel Elements** is a short index of pages: Appearance, Typography,
Statblock display, Featureblock display, Feature display, Element defaults, Rolling,
Compendium, Links and Initiative tracker. Statblocks ship with three one-click presets, and Obsidian's
own settings search finds every individual setting by name. See the
[settings guide](./docs/settings.md).

## Docs

Full documentation: **[docs/index.md](./docs/index.md)** (also published at
[steelcompendium.io](https://steelcompendium.io)).

Guides: [Getting started](./docs/getting-started.md) ·
[Run an encounter](./docs/running-an-encounter.md) ·
[Track your hero](./docs/hero-suite.md) ·
[Customize a monster](./docs/customizing-a-monster.md) ·
[Style your statblocks](./docs/styling-statblocks.md) ·
[Advanced usage](./docs/advanced-usage.md)

## Known limitations

- **Reading mode only** — no Live Preview rendering.
- The compendium's file layout is still developing; a future sync may rename or move a
  compendium file you linked to. [Reference entries by code](./docs/compendium-sync.md#referencing-a-compendium-entry-in-your-notes)
  if you want links that survive that.

## Development

See the [changelog](CHANGELOG.md) for changes.

### Build

- `npm i` to install deps
- `npm run dev` to build and watch

<!-- ~/Documents/demo/DS Elements demo has symlink to this repo -->

### Screenshots

Every image in this README and in `docs/` is generated:

```bash
npm run docs-shots          # regenerate all of them (~4 min)
npm run docs-shots -- --only=statblock.png
npm run docs-shots -- --browser-only     # skip the Obsidian half
npm run docs-shots -- --only=counter.gif --check-stable   # prove an animated GIF regenerates identically
```

The run starts its own virtual display, so it is fully headless — your own Obsidian can
stay open, and nothing appears on screen. What each image is and where it comes from lives
in `visual-harness/docs-manifest.mjs`; add an entry there to add an image. Animated GIFs are
scripted interactions in the same manifest (`kind: 'gif'`), not screen recordings: every
image in the docs, still or animated, is regenerated by this one command. The only file in
`docs/Media` it cannot make is `favicon.ico`, a brand asset, and the run says so.

### Release

- **Refresh the screenshots**: `npm run docs-shots`, then commit whatever changed
- Make sure the `manifest.json` has the right release version
  - This should be semver without the `v` prefix
- Update `CHANGELOG.md`
- Create release in github
  - Tag should match `manifest.json`
  - Tag and release name should match
  - Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments
