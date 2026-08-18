# Migrating from 5.x to 7.0.0

> This guide was written for the release originally numbered **6.0.0**; that
> number was retired after a release-candidate mishap (see the changelog's 6.0.1
> entry) and the release ships as **7.0.0**. 6.0.1 is identical to 5.1.1, so
> everything here applies to 6.0.1 installs too.

7.0.0 changes two things that need action, plus adds a large set of new
features. **Everyone** should re-sync their compendium. Only people who
hand-write their own statblocks need to touch any YAML.

## 0. Obsidian 1.13.0 or newer is required

This is the release's only hard prerequisite. 7.0.0's settings tab is built on
the declarative settings API Obsidian introduced in **1.13.0**, so the plugin no
longer runs on older apps — `manifest.json`'s `minAppVersion` moves from 0.15.0
to 1.13.0.

**What to do:** nothing, in almost every case. Obsidian updates itself by
default, so most installs already qualify — check **Settings → General → Current
version** if you want to be sure. If you are on an older Obsidian, your existing
Draw Steel Elements install keeps working exactly as it is: `versions.json` pins
pre-1.13 clients to **6.0.1**, the last build that runs there, so Obsidian will
not offer you 7.0.0 until you update the app. Nothing breaks; you simply stop
receiving new plugin releases until then.

Note this is a separate matter from the *installer* version. Obsidian's app
package self-updates independently of the installer you originally downloaded,
so an old installer does not by itself mean an old app.

## 1. Re-sync your compendium

The compendium now downloads from a different, newer source. When you
update the plugin, your old "release tag" setting is automatically cleared,
since it pointed at a release from the old source and wouldn't resolve
against the new one.

**What to do:** open **Settings → Draw Steel Elements → Compendium**, then click
**Sync** (the command palette's **Sync compendium** does the same thing).

### Your links to compendium notes keep working

The new source also reorganises the whole tree. `Rules/Careers/Disciple.md`
is now `career/disciple.md`; `Bestiary/Monsters/Bredbeddle/Statblocks/Bredbeddle.md`
is now `monster/bredbeddle/statblock/bredbeddle.md`; and so on for roughly
two thousand files. If the plugin simply downloaded the new tree next to the
old one, every `[[wikilink]]` you ever wrote into the compendium would point
at a file that no longer exists.

So it doesn't do that. **The first sync after you update offers to move your
existing compendium files to their new paths** — and because it moves them
with Obsidian's own move operation, *Obsidian* updates the links in your
notes, the same way it does when you drag a note into a different folder.
The plugin never opens, parses, or edits a note you wrote.

**What the prompt looks like.** If you have a pre-7.0.0 compendium, the first
**Sync compendium** shows a dialog titled *"Move your compendium to the 7.0.0
layout"*. Before anything happens it tells you:

- how many files will be moved, and into which folder;
- how many of them differ from the last pre-7.0.0 release (you edited them, or
  you were on an older compendium release) — those are moved too, and listed
  afterwards so you can check them;
- how many will be copied into the backup folder first, and what that folder is
  called;
- how many can't be moved because something already sits at the new path;
- how many have no 7.0.0 counterpart at all;
- a handful of real `old path → new path` examples;

…and then three buttons:

- **Not now** (the default) — nothing happens at all. **The compendium is not
  synced either**, and that is deliberate: see the warning below. You will be
  asked again the next time you sync.
- **Sync without moving** — downloads the new compendium and leaves your old
  files where they are. Your links to compendium notes stop working, and the
  move can no longer be done. Only pick this if you don't link to the
  compendium.
- **Move N file(s)** — does the move.

> **Sync first and you can't move afterwards.** Not because the old files
> disappear — they don't — but because the sync *creates* all the new files, so
> every move then finds something already sitting at its destination and is
> refused. That's why declining the offer doesn't quietly continue into a sync,
> and why a half-finished move asks you to finish rather than offering to sync.

While it runs you get a progress line and a **Stop** button. Stopping is safe
at any point: each file's move is complete on its own, so the ones already moved
stay moved. Finish the rest with the command below **before** you sync.

**Running it yourself.** The command **Migrate compendium from the pre-7.0.0
layout** does exactly the same thing, any time. Use it if you chose *Not now*,
if you stopped a run part-way, or if you restored an old compendium folder from
a backup. Running it when there is nothing to do just says so.

**Afterwards you get a report note.** The migration writes a note into your
vault — *Draw Steel Elements migration report &lt;date&gt;* — listing, by path,
every file it moved but flagged, every file it couldn't move, and every file it
left alone. Counts are in the dialog; the actual filenames are in that note, and
it stays there until you delete it.

**What it will never do:**

- delete anything — not the old files, not the old folders, not files it
  doesn't recognise. The only change it makes is moving files;
- overwrite anything — if something already occupies a new path, that one move
  is skipped and reported;
- touch a file it has no mapping for — index pages, book-level pages, and
  anything of your own stay exactly where they are;
- edit a note you wrote. Link rewriting is Obsidian's job, not the plugin's.

**The leftovers.** After a migration the old folders (`Rules/`, `Bestiary/`,
…) are still there, empty apart from anything that wasn't moved. Deleting
folders isn't something this does, on purpose — delete them yourself whenever
you're satisfied.

Around 17% of the old files have no 7.0.0 counterpart, and links to *those*
will break. They are overwhelmingly pages the new layout doesn't have rather
than content that vanished: per-folder index pages, whole-book pages, and
roll-up pages whose contents the new tree files individually. Every single one
is enumerated, with its reason, in
[the migration map's review report](compendium-migration-map.md).

### Your edited files are backed up first

Before the migration moves a single file, it **copies every compendium file whose
contents don't match the release they came from** into a new folder beside your
compendium — `DS Compendium backup (pre-7.0.0)`, or whatever your compendium folder
is called plus that suffix. The copies keep their original folder structure, so
`Rules/Careers/Disciple.md` lands at
`DS Compendium backup (pre-7.0.0)/Rules/Careers/Disciple.md`.

- **What gets copied:** anything the plugin cannot prove is untouched — files you
  edited in place, and files from a compendium release too old for the shipped
  checksums to speak for. Files that are byte-identical to the release they came from
  are *not* copied: there is nothing of yours inside them, so a copy would add bulk
  without adding protection.
- **Where it goes:** a sibling of your compendium folder, never inside it — anything
  inside would be walked by the sync and reported as stray content.
- **Nothing ever touches it again.** The plugin does not read it, write to it a second
  time, or delete it, and it will not overwrite an existing backup (a second migration
  makes `… (2)`). **Delete it yourself when you're satisfied.**
- If nothing needed copying, no folder is made, and the dialog says so.
- If a copy fails, that file is **not moved** — it stays exactly where it is and is
  listed as failed. Backing it up is the only reason it would be safe to move.

This is the recovery path for the warning below.

**One thing the move changes about your edits.** If you edited a compendium file
in place — added a note to a statblock, say — moving it hands it to the sync as a
file the plugin manages, and **the next sync replaces its contents with the
current official text**. Before 7.0.0 that file would have been left alone as
unrecognised content. This is the same rule that has always applied to
plugin-installed compendium files, now applied to yours because the migration
adopts them; without that, the moved files could never receive updates at all.
The migration flags every file whose content doesn't match the last pre-7.0.0
release, in the dialog and in the report note — and, as of the section above,
**keeps a copy of every one of them**, so if a sync does replace something you wrote,
the version you wrote is still sitting in the backup folder. **Homebrew you wrote yourself, and anything outside the
compendium folder, is never affected** — only files that came from the
compendium in the first place.

**A more durable way to link.** `scc.v1:` links are addressed by classification
code, not by path, so they survive reorganisations like this one entirely.
If you are writing new notes that reference the compendium, prefer them.

### If you keep an old compendium folder instead

If your compendium folder holds files but isn't a recognisable pre-7.0.0
compendium, the first sync falls back to the older prompt: move that folder to
the trash, or keep it in place. Either choice is safe. Files you keep are never
overwritten or deleted, and anything moved to the trash is recoverable through
Obsidian like any other deleted file.

## 2. Update your own statblock YAML (only if you hand-write `ds-sb` / `ds-statblock` blocks)

If you write your own creatures in `ds-sb` or `ds-statblock` code blocks,
two keys were renamed:

| Old key    | New key(s)                  |
|------------|------------------------------|
| `roles:`   | `role:` + `organization:`   |
| `ancestry:`| `keywords:`                 |

Old blocks keep working through the whole 7.x series — the plugin still
reads `roles:`/`ancestry:` and sorts them into `organization:`/`role:` /
`keywords:` for you, with a warning logged to Obsidian's developer console —
but support is removed in 8.0.0, so it's worth updating them now. If a block
has both an old and a new key for the same value, the new key always wins.

Before:

```yaml
roles:
  - Horde
  - Controller
ancestry:
  - Goblin
  - Humanoid
```

After:

```yaml
organization: Horde
role: Controller
keywords:
  - Goblin
  - Humanoid
```

## What's new in 7.0.0, at a glance

- **Hero suite** — a full [hero sheet](hero-suite.md) (`ds-hero`) in one block:
  stamina with recoveries, heroic resource, surges, conditions, and clickable
  abilities with dice rolling. Also available as standalone trackers for heroic
  resource, surges, conditions, and a shared party-wide hero token pool.
- **One block renders any compendium entry** — sync the compendium and a
  [`ds-scc` block](compendium-sync.md#referencing-a-compendium-entry-in-your-notes)
  whose body is an entry's code renders that entry, whatever it is: a kit, a
  condition, a rule, a statblock. A search-and-insert command finds any entry
  and writes the block for you without leaving the editor.
- **[Director's trackers](gm-trackers.md)** — an Encounter Builder that computes
  live EV/budget from your synced compendium, plus trackers for montages,
  downtime projects, and party-level victories/renown/wealth.
- **Malice panel and per-turn action checklist** in the initiative tracker —
  see [Initiative Tracker](initiative-tracker.md).
- **Draw Steel sidebar** — pin any tracker to a persistent panel in
  Obsidian's right sidebar so it survives navigating between notes; see
  [Pinning to the Sidebar](initiative-tracker.md#pinning-to-the-sidebar) for
  the "send to sidebar" commands.
- **`scc.v1:` links now resolve everywhere** — in compendium notes, inside
  element text, and as references — checking your local compendium first,
  with an optional fallback to steelcompendium.io.
- **A redesigned Stamina cluster** — a forged gauge that shows the negative
  range honestly, temporary Stamina as a real segment, clickable Recovery
  markers, Catch Breath, and the Winded/Dying states said more than one way.
  See [Stamina Bar](stamina-bar.md).
- **A standard menu panel on card elements** — hover a statblock, hero sheet or
  stamina bar and a small icon panel appears at its top-right, carrying
  collapse/expand and (when **Show edit button** is on) the edit pencil, which
  moved there from the card's corner. Collapsed, an element is one line: type,
  name, expand. Block keys: `collapsed:`, `collapse_default:` and
  `collapsible:` — see
  [Common Element Fields](common-element-fields.md).
  **One thing to know:** the Stamina Bar's own "Stamina Bar" disclosure header
  is gone, replaced by that panel. Your blocks need no change —
  `collapse_default: true` still starts collapsed — except that
  `collapsible: false`, previously ignored on a stamina bar, is honoured now.
- **Rebuilt settings** — [ten pages](settings.md) instead of one long scroll,
  searchable from Obsidian's own settings search, with a live preview of the
  card you're changing and seven more of the website's statblock layout
  options.

See the [changelog](../CHANGELOG.md) for the full list of 7.0.0 changes.
