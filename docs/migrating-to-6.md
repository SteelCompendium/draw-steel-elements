# Migrating from 5.x to 6.0.0

6.0.0 changes two things that need action, plus adds a large set of new
features. **Everyone** should re-sync their compendium. Only people who
hand-write their own statblocks need to touch any YAML.

## 1. Re-sync your compendium

The compendium now downloads from a different, newer source. When you
update the plugin, your old "release tag" setting is automatically cleared,
since it pointed at a release from the old source and wouldn't resolve
against the new one.

**What to do:** open **Settings → Draw Steel Elements**, then click
**Sync compendium** (this also works as a command-palette command of the
same name).

If you already have a compendium folder from before 6.0.0, the first sync
asks whether to move that old folder to the trash or keep it in place —
either choice is safe. Files you keep are never overwritten or deleted, and
anything moved to the trash is recoverable through Obsidian like any other
deleted file.

## 2. Update your own statblock YAML (only if you hand-write `ds-sb` / `ds-statblock` blocks)

If you write your own creatures in `ds-sb` or `ds-statblock` code blocks,
two keys were renamed:

| Old key    | New key(s)                  |
|------------|------------------------------|
| `roles:`   | `role:` + `organization:`   |
| `ancestry:`| `keywords:`                 |

Old blocks keep working through the whole 6.x series — the plugin still
reads `roles:`/`ancestry:` and sorts them into `organization:`/`role:` /
`keywords:` for you, with a warning logged to Obsidian's developer console —
but support is removed in 7.0.0, so it's worth updating them now. If a block
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

## What's new in 6.0.0, at a glance

- **Hero suite** — a full hero sheet (`ds-hero`) in one block: stamina with
  recoveries, heroic resource, surges, conditions, and clickable abilities
  with dice rolling. Also available as standalone trackers for heroic
  resource, surges, conditions, and a shared party-wide hero token pool.
- **Compendium reference cards** — new card types for kits, conditions,
  treasures, ancestries, cultures, careers, classes, titles, perks,
  complications, and general rules, plus a fuzzy search-and-insert command
  to find and drop in any compendium entry without leaving the editor.
- **GM subsystems** — an Encounter Builder that computes live EV/budget from
  your synced compendium, plus trackers for montages, downtime projects, and
  party-level victories/renown/wealth.
- **Malice panel and per-turn action checklist** in the initiative tracker —
  see [Initiative Tracker](initiative-tracker.md).
- **Draw Steel sidebar** — pin any tracker to a persistent panel in
  Obsidian's right sidebar so it survives navigating between notes; see
  [Pinning to the Sidebar](initiative-tracker.md#pinning-to-the-sidebar) for
  the "send to sidebar" commands.
- **`scc.v1:` links now resolve everywhere** — in compendium notes, inside
  element text, and as references — checking your local compendium first,
  with an optional fallback to steelcompendium.io.

See the [changelog](../CHANGELOG.md) for the full list of 6.0.0 changes.
