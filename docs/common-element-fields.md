# The element menu, and collapsing a block

Almost every element the plugin draws — statblocks, ability cards, hero sheets, the
trackers — carries the same small menu, and the same way of folding itself down to one line.
This page explains both.

## The menu

Move your mouse over an element and a small panel of icon buttons appears at its **top right
corner**, sitting just above the card's edge:

- **Collapse** (a chevron) is always there, and is always the rightmost button.
- **Edit** (a pencil) appears only if you have turned on *Show edit button on rendered blocks*
  in [Settings](settings.md#authoring). It opens the same
  [form editor](writing-blocks.md#edit-a-rendered-block-with-a-form) the insert commands use.

More buttons will be added here over time; new ones appear to the *left*, so the collapse
chevron never moves.

The panel is invisible until you point at the element, so it stays out of your way while
you're reading. Two exceptions, both deliberate:

- **On phones and tablets** there is no mouse to point with, so the panel is always visible.
- **When you print** (or export a PDF) the panel is not there at all.

You can also reach it from the keyboard: tab into an element and the panel appears.

## Collapsing

Click the collapse chevron and the whole element folds down to a single line — its type, its
name, and an expand button on the right:

```
STATBLOCK: Human Bandit Chief                                    ⌄
HERO: Torin Stonefist                                            ⌄
STAMINA (15/20)                                                  ⌄
ENCOUNTER: Ambush at the Ford (EV 42)                            ⌄
SKILLS (12 selected)                                             ⌄
```

Elements that have a name show it. Elements that don't — a standalone Stamina bar, a
conditions strip — show the number that matters instead. Some show both.

While an element is collapsed the hover menu is hidden: the expand button on the line is the
only control, so there is never a second, differently-placed way to open it back up.

**Nothing is lost when you collapse.** The element is still there, just hidden, so expanding
it is instant and any state (a half-filled tracker, a scrolled statblock) is exactly where you
left it.

### What is remembered, and where

Collapsing something by clicking is remembered **for the rest of your Obsidian session** and
is **never written into your note**. Restart Obsidian and everything is back to whatever the
note (or your settings) says it should be.

If you want a block to *start* collapsed every time, that is a field you write in the block —
see below.

### Printing

Collapsing is a reading convenience, not a content decision, so it never reaches paper:

- a collapsed element **prints in full**;
- the menu panel is **absent** from print and from an exported PDF.

## The three fields

You can set any of these on the block itself, as a top-level line:

| Field              | Type      | What it does                                                                               | Required | Default |
|--------------------|-----------|--------------------------------------------------------------------------------------------|----------|---------|
| `collapsible`      | `boolean` | If `false`, the element can't be collapsed at all — no collapse control is shown.           | No       | `true`  |
| `collapsed`        | `boolean` | If `true`, the element starts collapsed when you open the note.                             | No       | `false` |
| `collapse_default` | `boolean` | Exactly the same as `collapsed`, in an older spelling. Kept so existing notes keep working. | No       | `false` |

For example:

````markdown
```ds-statblock
collapsed: true
type: statblock
name: Human Bandit Chief
...
```
````

`collapsed` and `collapse_default` mean the same thing. If a block sets both, `collapsed`
wins.

If you collapse or expand a block by clicking, **your click wins** over what the block says,
for the rest of the session.

If `collapsible: false` would leave the menu with nothing in it, no menu is shown either — the
element renders exactly as it would have before this feature existed.

### Setting it once for your whole vault

Rather than writing the fields into every block, you can set the default on the
**[Element defaults](settings.md#element-defaults)** settings page — **Collapsible by default**
and **Start collapsed**. A field written in a block always beats the setting.

## Which elements have this

Every element that draws a card: statblocks, ability cards and featureblocks, the compendium
reference block, every hero-suite element (hero sheet, stamina bar, conditions, heroic
resource, surges, hero tokens, skills, characteristics, values row, counter) and every GM
tracker (initiative, negotiation, encounter builder, montage, project, party).

Two elements deliberately don't, because there would be nothing to fold or nowhere to put the
menu: the [horizontal rule](horizontal-rule.md) (`ds-hr`) and the [dice roller](Roll.md)
(`ds-roll`).

The [Skills](skills-element.md) element additionally keeps its own "Skills" disclosure header
inside the card; the three fields above drive both it and the element menu together.

### One limitation worth knowing

A [compendium reference](compendium-sync.md#referencing-a-compendium-entry-in-your-notes)
block's body is *only* the entry's code:

````markdown
```ds-scc
mcdm.heroes.v1/kit/panther
```
````

There is nowhere in that to put a `collapsed: true` line — adding one makes the block invalid,
because the body has to be the code and nothing else. So a reference block **can't be set to
start collapsed**; you collapse it by hand, and that is remembered for the session like
everywhere else. (Collapsing one shows the entry's real name — "KIT: Panther" — not the code.)
