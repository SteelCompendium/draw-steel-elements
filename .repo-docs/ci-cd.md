---
repo: draw-steel-elements
type: tool
updated: 2026-04-04
---

# CI/CD

## Pipeline Overview

| Trigger | What it does | Config file |
|---------|-------------|-------------|
| Push to `main` or `master` | Builds and deploys MkDocs documentation to gh-pages | `.github/workflows/ci.yml` |

The CI pipeline handles **documentation deployment only**. Plugin builds and releases are done locally via the justfile.

## Build Process

Local build commands:

```sh
# Development (watch mode, sourcemaps, no minification)
npm run dev

# Production (type check + minified bundle, no sourcemaps)
npm run build

# Production without type check
npm run build-no-check
```

esbuild produces a single `main.js` (CJS format) and copies Vue-generated CSS to `styles.css`.

## Build Artifacts

| Artifact | Description |
|----------|-------------|
| `main.js` | Bundled plugin code (CJS). Uploaded to GitHub releases. |
| `styles.css` | Plugin styles (copied from `main.css` by esbuild plugin). Uploaded to GitHub releases. |
| `manifest.json` | Obsidian plugin manifest with version info. Uploaded to GitHub releases. |

## Branch Strategy

- **`main`** -- primary branch, release-ready code
- **`develop`** -- integration branch (exists as remote)
- **Feature branches** -- named by feature (e.g., `initiative`, `featureblocks`, `negotiation`)
- **`gh-pages`** -- auto-deployed docs site

## Commit Conventions

Commits use informal descriptive messages. No strict conventional commits format is enforced. Examples from history:

```
Removes legacy link
Initial pass on splitting up css
Prepares for release '5.1.1'
Corrects issue where double-clicking on an Element in reading mode will open edit mode
```

## Release Process

### Using the justfile (recommended)

```sh
just release <version>
```

This recipe:
1. Updates `version` in `manifest.json` and `package.json`
2. Runs `npm run build-no-check` (production build)
3. Commits all changes
4. Pushes to origin
5. Creates a GitHub release with tag `<version>`, uploading `main.js`, `manifest.json`, `styles.css`

### Manual release

1. Update version in `manifest.json` and `package.json` (semver without `v` prefix)
2. Update `CHANGELOG.md`
3. Run `npm run build`
4. Create a GitHub release:
   - Tag matches the version in `manifest.json`
   - Upload `main.js`, `manifest.json`, `styles.css` as binary attachments

### Versioning

- Semver without `v` prefix (e.g., `5.1.1`, not `v5.1.1`)
- Tag name = release name = version string
- Obsidian uses `manifest.json` version to check for updates

## Environments

| Environment | Description |
|-------------|-------------|
| Local dev | `npm run dev` in a symlinked Obsidian vault plugin directory |
| Docs site | https://steelcompendium.io (MkDocs Material on gh-pages) |
| Distribution | GitHub Releases (Obsidian community plugin registry fetches from here) |

## Secrets and Configuration

- No secrets required for CI (MkDocs deployment uses `GITHUB_TOKEN` from Actions)
- The `CompendiumDownloader` supports an optional GitHub token for authenticated API requests but does not require one
