# Remaining Tasks

Deferrals cataloged (not built) by shipped efforts, with one-line rationale + the spec
section that scoped them. Full context: workspace repo `docs/superpowers/dse-overhaul/`.

## D9 — Authoring & Editing UX

D9 v1 shipped: 12 per-element Insert commands, the `/ds` scaffolder, key/enum autocomplete
inside `ds-*` fences, and the schema-driven form editor (pencil, gated by the default-OFF
`authoringControls` pref). Deferred out of v1:

- **Text importer** (§4) — pasted-text → `ds-*` block via the SDK's readers. Gated on F2
  (not yet landed): the reader/writer classes the importer needs
  (`AutoDataReader`/`MarkdownStatblockReader`/`MarkdownFeatureReader`/
  `MarkdownFeatureblockReader`/`YamlWriter`) already ship in the pinned `steel-compendium-sdk`
  (2.1.5) and are usable today, but their output won't carry the SDK 3.x
  `role`/`organization`/`keywords` fields the current statblock model doesn't have either —
  so the importer waits for F2's SDK 3.2 bump for field parity, not for the classes to
  exist. `authoring.sdkModel` (statblock/feature/featureblock, declared on those three
  elements' definitions) is the routing hook the importer will read; it already ships, so
  building the importer is purely additive once F2 lands.
- **Inline squiggle linter** (§5.2) — CM6 `registerEditorExtension` diagnostics for schema
  errors inside a `ds-*` fence. Block-level → per-line → CST precision ladder (OD-3); verify
  `@codemirror/lint` is available on the host CM6 surface before building (not bundled today
  — only `@codemirror/language` is a dependency) (OD-4).
- **Form "save anyway" escape hatch** (OD-6) — v1 hard-fails Save while the working data is
  schema-invalid; a "save anyway" override for power users mid-refactor is cataloged, not
  built.
- **Rich array/object form editors** — v1 renders any array/object/`$ref` field as a raw-YAML
  textarea sub-control (`formModel.ts`'s `widgetFor` fallback); per-shape structured editors
  are future scope.
- **Configurable `/ds` trigger prefix** (OD-2) — the trigger is fixed at `/ds…`; making it a
  setting is deferred until a real collision with another plugin's suggester is reported.
- **Editor-side form-EDIT of an existing block** (OD-D9-12) — the form editor is reachable
  only from the reading-mode pencil; there is no editor/Live-Preview `BlockHost` to write
  through yet (`src/framework/host/LivePreviewBlockHost.ts` is still a deliberately
  unimplemented stub — every member throws). Revisit once an editor `BlockHost` exists.
