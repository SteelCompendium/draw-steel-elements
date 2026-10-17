# Writing and Editing Blocks

Every Draw Steel element is a fenced code block whose language is a `ds-` name, with YAML
inside it. You don't have to remember the names or the fields — the plugin can write the
block for you and complete the fields as you type.

Never done this before? [Getting started](getting-started.md) walks the whole loop with
screenshots; this page is the reference.

## Insert a block

### Type `/ds`

In the editor, type **`/ds`** on an empty line. A list of every element appears; keep
typing to filter it (`/dsstat`, `/dsinit`, …). Pick one and the trigger is replaced with a
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
`style:` in a [skills block](skills-element.md#layouts-style)), the suggestions become that field's allowed values.

Field-name suggestions are offered for top-level fields; deeper, indented fields are not
suggested yet.

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
