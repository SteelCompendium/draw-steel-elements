# Writing and Editing Blocks

Every Draw Steel element is a fenced code block whose language is a `ds-` name, with YAML
inside it. You don't have to remember the names or the fields — the plugin can write the
block for you and complete the fields as you type.

Never done this before? [Getting started](getting-started.md) walks the whole loop with
screenshots; this page is the reference.

## Insert a block

### Type `/ds`

In the editor, type **`/ds`** on an empty line. A list of every element appears; keep
typing to filter it (`/dsstat`, `/dsroll`, …). Pick one and the trigger is replaced with a
complete, filled-in example block you can edit.

### Or use the command palette

Every element also has its own command: open the
[command palette](https://help.obsidian.md/Plugins/Command+palette) and search for
**Insert Draw Steel:** — for example *Insert Draw Steel: Statblock*, *Insert Draw Steel:
Initiative tracker*, *Insert Draw Steel: Featureblock*. The block is inserted at your cursor.

Both routes insert; neither ever overwrites text you already wrote.

## Autocomplete inside a block

With your cursor inside a `ds-` block, start typing a field name and Obsidian suggests the
fields that element accepts. After a field that only allows certain values (for example
`mode:` in a [roll block](Roll.md)), the suggestions become that field's allowed values.

Field-name suggestions are offered for top-level fields; deeper, indented fields are not
suggested yet.

## Edit a rendered block with a form

Turn on **Settings → Draw Steel Elements → Authoring → "Show edit button on rendered
blocks"** and every rendered block gains a small pencil — in the
[element menu](common-element-fields.md#the-menu) at the block's top-right corner for the
elements that have one, and in the card's own corner for the few that don't. Clicking it
opens a form with one
control per field, a live preview of the card as you change it, and a Save button that
stays disabled while the block is invalid. Saving writes the block back into your note
through the same path the trackers use, so nothing else in the note is touched.

The setting is off by default; the insert commands and `/ds` work either way.

## Insert content from the compendium

Once you have [synced the compendium](compendium-sync.md) there are two commands, and the
difference between them matters.

### Insert Draw Steel: compendium reference

Searches the compendium and inserts a small block that *points at* the entry:

````markdown
```ds-scc
mcdm.heroes.v1/kit/panther
```
````

Nothing is copied into your note but the code, so the card always shows the currently
synced version of that entry. This is what you want for official content you just need to
look at. While the search list is open, hold **Shift** when you pick an entry to insert an
inline link instead, or **Ctrl/Cmd** to copy just the code.

### Insert Draw Steel: compendium block (snapshot)

Searches statblocks, features and featureblocks, and pastes the entry's **full YAML** into
your note as an editable copy.

**Why you'd want that:** it's the starting point for homebrew. Drop in a goblin, change its
Stamina, give it a new ability, rename it — and it's yours. What lands in your note is the
entry's content, without the `metadata:` block the compendium keeps beside it. For an ability
that block repeated most of the entry a second time — its name, its effects, its flavor text,
its action type — and the card was always built from the real fields, so editing the copy
changed nothing. Leaving it out keeps that trap out of your note. A snapshot deliberately does
*not* keep up with the compendium afterwards; your edits are the whole point, and a sync that
overwrote them would defeat it. If you want content that keeps updating, use **Insert
compendium reference** instead.

Snapshots are offered for statblocks, features and featureblocks only.

## Pinning a block to the sidebar

The Draw Steel sidebar is a **GM dashboard assembled from blocks that live in different
notes** — the initiative tracker from your session note, the party tracker from your
campaign note, a hero sheet from someone's character note, all running at once in one
panel. That's the one thing it does that a pinned note tab can't: if everything you track
already lives in a single note, pin *that note's tab* in the right sidebar instead (see
"One note instead?" below) — it's simpler and needs nothing from this page.

**To pin a block:** open its note in Reading view, hover the block, open its **⋯** menu, and
choose **Pin to sidebar**. The block moves into a persistent panel in Obsidian's right
sidebar, stays interactive there, and stays in sync with the note. Pin blocks from as many
different notes as you like — they stack in the same panel, each with its own header naming
the element and the note it came from.

![Two blocks pinned to the Draw Steel sidebar, each with its own header](Media/sidebar.png)

To remove one, open its **⋯** menu in the sidebar and choose **Unpin from sidebar** — that
panel closes; the others stay. Open (or re-focus) the panel any time with the crossed-swords
ribbon icon, or the **Open Draw Steel sidebar** command; an empty panel explains itself and
how to fill it.

Two older paths still work, for a cursor-driven workflow: put your cursor inside a block and
run **Send block to sidebar**, or — for the initiative tracker specifically, from anywhere
in its note — **Send initiative tracker to sidebar**.

Pinning a tracker adds a hidden `_dse_anchor:` line to it — that's the plugin's bookmark
for finding the block again after you edit the note around it. Leave it alone. A `ds-scc`
block, whose content is exactly one compendium code, is never written to: pinning one
leaves the note unchanged and the sidebar finds it by its code.

### One note instead?

If everything you're tracking for a session already lives in one note, you don't need the
sidebar at all: open that note in the right sidebar the normal Obsidian way (drag its tab
over, or open it and use "Move to right sidebar") and pin the tab. You get the same
persistent panel, plus things the Draw Steel sidebar doesn't have — a close button and
drag-to-reorder for free, room for ordinary prose alongside your blocks, and no rebuild
flash while you edit. Use the Draw Steel sidebar when your trackers live in different notes;
use a pinned note tab when they don't.

## Per-block appearance overrides (advanced)

Most appearance settings are global (see [Settings](settings.md)), but a single block can
pin its own look with a reserved `prefs:` key:

```yaml
prefs:
  sbDensity: compact
  sbFeatureStyle: flat
```

The key is stripped before the block is parsed, so it never collides with the element's own
fields, and it survives interaction with a tracker. Settings that change a card's structure
rather than its styling — Characteristics, Boxed first letter, Villain actions — and the
typography settings are global only: naming one here logs a warning to Obsidian's developer
console and the block renders normally.
