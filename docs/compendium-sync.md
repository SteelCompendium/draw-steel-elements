# Compendium Sync

Compendium Sync downloads the Markdown of the
[Draw Steel Compendium](https://steelcompendium.io/compendium) — published from the
[`data-unified`](https://github.com/SteelCompendium/data-unified) repo — into a folder in
your vault, and keeps it up to date.

**Non-destructive by design:** only files the plugin itself installed are ever created,
updated, or removed. Your own notes in the destination folder — and any file that happens
to collide with a compendium path — are never touched; a collision is skipped and reported
instead of overwritten. Removals (a file deleted upstream) go through Obsidian's trash, so
they're always recoverable, never a hard delete.

**The rules are still actively in development and are subject to change.** If you link to
files in the compendium, a future sync may rename or remove the file at that path. To lock
in a specific version, set the Release field to a specific
[release tag](https://github.com/SteelCompendium/data-unified/releases).

![compendium](Media/compendium.png)

## Quick Start

1. Open the Draw Steel Elements settings and scroll to the **Compendium** section.
2. (Optional) Edit the [configuration](#configuration).
3. Click the **Sync** button.

![Compendium Download](Media/compendium-download.png)

The compendium downloads into the Destination folder (`DS Compendium` by default).

## Configuration

In the Draw Steel Elements settings, under **Compendium**:

- **Destination folder**
  - Vault folder the compendium is synced into.
  - Default value: `DS Compendium`
- **Release**
  - Set to a specific [release tag](https://github.com/SteelCompendium/data-unified/releases)
    to lock in a specific version of the compendium.
  - Leave empty to sync the latest release.
- **Locale**
  - The compendium's language. Only English (`en`) is published today.

Below these fields, the settings tab shows the currently synced release tag, file count, and
sync date (or "No compendium synced yet.").

## Syncing

- **Sync** downloads the selected release and updates only the files the plugin manages —
  new files are created, changed files are updated, and files removed upstream (that you
  haven't edited) are trashed. Files you added yourself, or upstream files you've edited,
  are left alone; anything skipped is listed in a Notice and the developer console.
- **Check for updates** makes a single metadata request to see whether a newer release is
  available, without downloading or changing anything.

### First sync into an existing folder

If the destination folder already contains files but has never been synced by this plugin,
the first sync stops and asks before touching anything. Which question it asks depends on
what's in there:

- **A pre-7.0.0 compendium** (at least twenty files sitting at exact pre-7.0.0 compendium
  paths) — you're offered the **layout migration**: the old files are *moved* to their
  7.0.0 paths so Obsidian rewrites the links in your notes for you. See
  [Migrating from 5.x to 7.0.0 → Your links to compendium notes keep working](migrating-to-7.md#your-links-to-compendium-notes-keep-working)
  for what the dialog shows and what it will and won't do. The command
  **Migrate compendium from the pre-7.0.0 layout** runs the same thing at any time.
- **Anything else** (your own homebrew at that path, a partial copy) — you're asked to
  either move that folder to the trash first or keep everything in place.

Nothing is touched automatically either way; files you keep are still never overwritten if
they don't collide with a compendium path, and any that do are skipped and reported. A
**fresh install never sees either prompt** — there is no folder yet, and nothing to ask
about.

## Command Palette

Syncing can also be triggered from the command palette:

1. Open the [Command Palette](https://help.obsidian.md/Plugins/Command+palette)
2. Search and execute `Draw Steel Elements: Sync compendium`

The pre-7.0.0 layout migration has its own entry:
`Draw Steel Elements: Migrate compendium from the pre-7.0.0 layout`.
