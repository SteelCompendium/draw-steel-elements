---
repo: draw-steel-elements
type: tool
updated: 2026-04-04
---

# Troubleshooting

## Do NOT

- **Do not use Live Preview mode.** The plugin only renders in Reading mode. Live Preview uses a different CodeMirror 6 rendering pipeline that the plugin does not support.
- **Do not store homebrew content in the compendium download directory.** The `CompendiumDownloader` deletes the entire destination directory before extracting a new release. Default directory: `DS Compendium`.
- **Do not use the `v` prefix in version tags.** The manifest, package.json, and GitHub release tags all use bare semver (e.g., `5.1.1`).
- **Do not register schemas that are validated directly** in `initializeSchemas()`. Only register dependency schemas that other schemas reference via `$ref`.

## Known Issues

- **No Live Preview support** -- Elements only render in Reading mode. This is the primary known limitation.
- **Double-click to edit** -- Fixed in v5.1.1. Previously, double-clicking a rendered element in Reading mode would switch to edit mode.
- **Compendium re-download required on breaking SDK updates** -- When the SDK version has breaking changes, users must re-download the compendium. The old compendium directory is deleted.

## Common Errors

### "Reference file (path) not found"

**Cause:** The `@path` or `[[wikilink]]` reference in element YAML points to a file that doesn't exist.

**Fix:** Check that:
1. The file exists at the exact path specified
2. The file exists in the compendium directory (`DS Compendium/` by default)
3. The file name matches (case-sensitive on some platforms)
4. The `.md` extension is included or the file is discoverable without it

### "No Draw Steel Elements code block (ds-*) found in [file]"

**Cause:** A reference points to a note, but that note doesn't contain any `ds-*` code block.

**Fix:** Ensure the referenced note contains a fenced code block with a `ds-*` language tag.

### "DSE Release asset 'repo.zip' not found"

**Cause:** The GitHub release for `data-md-dse` doesn't have a `repo.zip` asset attached.

**Fix:** Check the release on GitHub. The compendium downloader specifically looks for an asset named `repo.zip`.

### Schema validation errors displayed inline

**Cause:** The YAML in a code block doesn't conform to the expected schema.

**Fix:** Check the element's documentation in `docs/` for the expected YAML structure. The error message shows the validation path and issue.

### Plugin fails to load a component

**Cause:** YAML parsing error or model constructor error.

**Fix:** The error is displayed inline with the message prefix "The Draw Steel Elements plugin failed to load the [Component Name]". Check the YAML syntax and required fields.
