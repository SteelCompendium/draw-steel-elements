# Integration

## Dependency Map

```
steel-compendium-sdk (data-sdk-npm)
        │
        ▼ (bundled at build time)
draw-steel-elements (this repo)
        │
        ├── reads from ──> data-unified (compendium content, synced at runtime)
        │
        └── runs inside ──> Obsidian (host app)
```

## Upstream Dependencies

| Dependency | Type | How used |
|-----------|------|----------|
| `steel-compendium-sdk` (`data-sdk-npm`) | npm devDependency (bundled) | Provides TypeScript model classes and YAML parsing for Draw Steel data structures. Used by model classes in `src/model/`. Pinned to 3.2.0 (`"file:../data-sdk-npm"` until it's published to npm — see the ADR). Version changes can be breaking (6.0.0's statblock field rename required a compat shim; see `src/model/StatblockConfig.ts`). |
| `data-unified` | Runtime data (GitHub releases) | Markdown files with Draw Steel reference content, `md-dse` format. Synced (not wiped-and-replaced) via `CompendiumSyncService`. Not a build dependency. |
| Obsidian Plugin API | Runtime host | Provides `Plugin`, `App`, `Vault`, `parseYaml`, `MarkdownPostProcessorContext`, modal APIs. Externalized in esbuild config. |

## Downstream Dependents

None. This is an end-user Obsidian plugin. No other repos import or depend on it.

## API Surface

This plugin exposes no programmatic API. Its interface is the set of code block language tags:

| Language tag(s) | Element |
|----------------|---------|
| `ds-ft`, `ds-feat`, `ds-feature` | Feature (ability/power roll) |
| `ds-fb`, `ds-featureblock` | Featureblock (grouped features with stats) |
| `ds-sb`, `ds-statblock` | Statblock (creature/NPC) |
| `ds-it`, `ds-init`, `ds-initiative`, `ds-initiative-tracker` | Initiative tracker |
| `ds-nt`, `ds-negotiation`, `ds-negotiation-tracker` | Negotiation tracker |
| `ds-stam`, `ds-stamina`, `ds-stamina-bar` | Stamina bar |
| `ds-ct`, `ds-counter` | Counter |
| `ds-char`, `ds-characteristics` | Characteristics |
| `ds-skills` | Skill list |
| `ds-vr`, `ds-value-row`, `ds-values-row` | Values row |
| `ds-hr`, `ds-horizontal-rule` | Horizontal rule |
| `ds-roll` | Standalone dice roll (D5) |
| `ds-kit` | Kit reference card (D6) |
| `ds-condition` | Condition reference card (D6) |
| `ds-treasure` | Treasure reference card (D6) |
| `ds-ancestry` | Ancestry reference card (D6) |
| `ds-culture` | Culture reference card (D6) |
| `ds-career` | Career reference card (D6) |
| `ds-class` | Class reference card (D6) |
| `ds-title` | Title reference card (D6) |
| `ds-perk` | Perk reference card (D6) |
| `ds-complication` | Complication reference card (D6) |
| `ds-rule` | Rule/glossary reference card (D6; model-less — `genericCard()`, not `displayFamily()`) |

Users interact by writing YAML inside these fenced code blocks in Obsidian notes. The 11
D6 elements above, plus `ds-sb`/`ds-ft`/`ds-fb`, additionally accept a **whole-block
reference** instead of inline YAML — see "Compendium reference (by-SCC)" below.

## Data Contracts

### Element YAML format

Each element type expects YAML conforming to its model class. Schemas in `src/model/schemas/` define the expected structure for validated elements. Unvalidated elements rely on the model's `parseYaml()` method to extract fields.

### Reference syntax

Elements can reference content in other notes:
- `@path/to/note` -- resolve by vault path
- `[[Note Name]]` -- resolve by Obsidian wikilink

The `ReferenceResolver` searches: exact path, path + `.md`, compendium directory prefix, then Obsidian metadata cache.

### Compendium reference (by-SCC) — D6

`CompendiumIndex` (`src/services/CompendiumIndex.ts`, `createCompendiumIndex(app,
sccResolver)`) is the typed-model accessor D8 (encounter builder) and the compendium
search/insert commands consume: `getEntry`/`getEntity`/`getStatblock`/`query`/
`resolveSlug`, backed by an LRU model cache (generation-guarded against races with vault
events) and `SccResolver`'s frontmatter `scc:` index (Task 1's read seam — a file is only
indexed if its frontmatter carries `scc: <code>`, matching real md-dse output).
`main.ts` constructs it in `onload` right after `sccResolver` (it depends on nothing
else), then threads it into `initializeElementFrameworkV2` as the `compendium` param —
`ElementPipeline` carries it into every `RenderContext` as `cx.compendium`, symmetric
with `cx.sccAnchors`.

`src/elements/shared/withReference.ts` wraps a base element definition (`statblock`,
`feature`, `featureblock`, and the 11 `displayFamily()`/`genericCard()` elements above) so
its block body may be **either** inline YAML **or** a whole-block reference:
`scc.v1:<code>` (or bare `scc:<code>`), `@<vault-path>`, `[[wikilink]]`, or (for the
`displayFamily()` elements only) a **bare slug** scoped to that element's own type family
(`ds-kit` given `panther` resolves; given `bleeding`, a condition, it error-cards — no
cross-family guessing). `RefUnwrapView` (`src/elements/shared/RefUnwrapView.ts`) owns
resolution against `cx.compendium` and the §1.5 degrade ladder: unresolvable code → plain
"not found" card; `cx.compendium` absent (harness/test caller that didn't construct one)
→ "compendium not installed" card; resolved but the wrong type family → "wrong type"
card. Recursion is depth-guarded (a resolved file whose own body embeds another
whole-block reference to itself/a cycle cannot recurse unboundedly).

In **hybrid** mode (a reference resolved to a real vault file), `CardLayout`
(`src/elements/shared/CardLayout.ts`) renders the card's chrome (title/badges/rows) from
the typed model as usual, but its trailing body region renders the **real resolved
file's markdown body** (`useSourceBody`, default true) through Obsidian's own
`MarkdownRenderer.render` — which means a nested `ds-*` code block inside that real body
(e.g. a kit's signature-ability `ds-feature` block) recurses through the SAME registered
code-block processors and mounts as a real, nested element card. This can only be proven
in a real Obsidian host (jsdom/unit tests stub `MarkdownRenderer`) — see
`visual-harness/obsidian-camera.mjs`'s dedicated `by-scc-kit` capture (D6 Task 11), which
seeds a real `kit/panther.md` fixture into the demo vault's managed compendium root and
asserts a nested `[data-dse-element="feature"]` actually mounts. A `flavor`/row value that
duplicates (a prefix of) the real source body is suppressed rather than shown twice
(`omitWhenSource` rows; the flavor/body duplicate-text guard).

Compendium search (`Ctrl/Cmd+P` → "Search compendium") and insert
(`src/authoring/CompendiumSearchModal.ts` + `src/authoring/compendiumInsert.ts`) are a
fuzzy `SuggestModal` over `CompendiumIndex.query()`, offering both a `scc.v1:` reference
insert and a full-code inline insert.

Deferred (recorded, not shipped): hover-preview on an `scc.v1:` link (OD-D6-5) and
autocomplete for by-SCC block bodies (OD-D6-4) — both future work, not blocking.

### Compendium release format

`CompendiumSyncService` resolves a `data-unified` GitHub release (latest, or a pinned tag), downloads its `md-dse-unified-{locale}.zip` asset, and diffs the archive against a manifest before writing anything into the configured destination directory (default: `DS Compendium`) — see the "Compendium data source" section below.

### Compendium data source (6.0.0+)

- **Repo:** `SteelCompendium/data-unified`, GitHub Releases (timestamp tags, `v4.<UTC>`).
- **Asset contract:** `{format}-unified-{locale}.zip` — the plugin downloads
  `md-dse-unified-en.zip`. The zip's internal root is the format directory's *content*
  (`class/…`, `monster/…` at top level).
- **Layout consumed:** `en/unified/md-dse` (Browse aggregate). File path ≡
  `sccToFilePath(code)` (drop source segment, expand dots) — the SCC resolver's primary
  lookup relies on this.
- **Sync:** manifest-driven (`compendium-manifest.json` in the plugin config folder);
  only manifest-tracked files are updated/trashed. See
  `.repo-docs/decisions/2026-07-01-data-unified-and-scc-resolution.md`.
- **SCC references:** `scc:`/`scc.v1:` links + reference strings resolve via
  `src/refs/SccResolver.ts` (vault path → frontmatter index → steelcompendium.io →
  unresolved). `scc.v2:`+ is refused by design.

## Cross-Repo Workflows

### SDK version bump

1. New version of `steel-compendium-sdk` is published to npm.
2. In this repo: `npm install steel-compendium-sdk@<version>`.
3. Update model classes if schemas changed.
4. Rebuild and test with existing compendium content.
5. If breaking: bump major version, update CHANGELOG, note that users must re-download compendium.

### Compendium content update

1. New content is added/updated in `data-unified` and a release is created (`just release-data`).
2. Users run the "Sync compendium" command in Obsidian to fetch and apply the latest release.
3. No code changes needed in this repo unless the content format changed.

## Integration Testing

No automated integration tests exist. Manual testing:

1. Install the plugin in a test vault.
2. Create notes with various `ds-*` code blocks.
3. Sync the compendium and verify rendering.
4. Test reference resolution across notes.
5. Test initiative tracker interactivity (adding/removing creatures, conditions, stamina changes).
