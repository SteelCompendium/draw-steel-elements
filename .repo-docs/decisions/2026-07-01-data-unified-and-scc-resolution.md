# Adopt data-unified releases, manifest-driven sync, and scc.v1 resolution (6.0.0)

**Date:** 2026-07-01 · **Status:** accepted · **Spec:** workspace
`docs/superpowers/dse-overhaul/F2-data-unified-sdk-integration-spec.md`

## Context

The plugin downloaded compendium data from `SteelCompendium/data-md-dse`, whose last
release predates the pipeline's move to the consolidated `data-unified` repo — users
who "updated" got stale data. The downloader also deleted the entire destination
directory before extraction (`vault.delete(dir, true)`), destroying any homebrew
stored there. The new md-dse data carries `scc.v1:` links the plugin could not resolve,
and SDK 3.x renamed statblock `roles`/`ancestry` to `role`/`organization`/`keywords`.

## Decision

1. **Source:** `data-unified` GitHub Releases, asset `md-dse-unified-{locale}.zip`
   (Browse-unified layout, `md-dse` format with raw `scc.v1:` links — location-independent,
   robust to file moves; F2 OD-3).
2. **Sync (replaces download-and-wipe):** `CompendiumSyncService` diffs against a
   `compendium-manifest.json` (plugin config dir). Only manifest-tracked files are
   created/updated/trashed; removals use `FileManager.trashFile`; user files squatting on
   compendium paths are skipped and reported; any incoming path that would escape the
   destination root (absolute, or a `..` segment) is rejected outright, defense-in-depth
   against a malicious or malformed archive. A missing/corrupt manifest fails safe
   (everything unmanaged → nothing deleted).
3. **SCC resolution:** `SccResolver` — path derivation under the compendium root
   (mirrors steel-etl `SCCToFilePath`), then a frontmatter-`scc` index (codes are forever,
   paths are not), then `https://steelcompendium.io/scc/{code}/` (toggleable), else plain
   text. Applied by a vault-wide post-processor (querySelector early-exit), by the F1
   `RefProvider {kind:"scc"}`, and by the legacy `ReferenceResolver` scc branch.
4. **SDK 3.x + shim:** statblock field rename adopted; homebrew `roles:`/`ancestry:`
   keys are shimmed with a deprecation warning for the 6.x cycle only (F2 OD-4). The
   shim mirrors the SDK's own `MarkdownStatblockReader` classification loop exactly:
   for `roles:`, the *last* entry matching the SDK's fixed organization-name set
   (`MINION`, `HORDE`, `PLATOON`, `ELITE`, `SOLO`, `LEADER`, case-insensitive) wins the
   `organization` axis and the last non-matching entry wins `role` — not an
   accumulate-and-join. `ancestry:` maps straight to `keywords:`. Modern keys always
   win over legacy keys per-axis if both are present.

## Consequences

- 6.0.0 is breaking on the `ds-sb` YAML contract and the data source; users must re-sync.
- The first sync treats a pre-6.0 compendium as unmanaged: nothing is auto-deleted; a
  one-time modal (`LegacyCompendiumModal`) offers trashing it, defaulting focus to "keep
  everything" (F2 OD-6).
- Cross-repo prerequisites before release: SDK 3.2.0 on npm (still pinned
  `file:../data-sdk-npm` as of 6.0.0 — Task 14 swaps the pin once published), steel-etl
  `ds-sb`/`ds-fb` emission in md-dse (landed, OD-1), data-unified release publishing
  (landed, OD-2 — workspace README "cross-repo critical path").
- The old command id `download-data-md-dse` survives as a hidden "Sync compendium
  (legacy alias)" until 7.0.0.
