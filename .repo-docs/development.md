# Development

## Prerequisites

| Tool | Version | Source |
|------|---------|--------|
| Node.js | >= 22.15 | `package.json` engines field |
| npm | (bundled with Node) | |
| Obsidian | >= 1.13.0 | `manifest.json` minAppVersion (SC-131: the declarative settings API the settings tab is built on landed in 1.13.0) |
| devbox (optional) | any | For `gh` CLI and `jq` |

## Setup

1. Clone the repo:
   ```sh
   git clone https://github.com/SteelCompendium/draw-steel-elements.git
   cd draw-steel-elements
   ```

2. Install dependencies:
   ```sh
   npm i
   ```

3. Start dev build (watch mode):
   ```sh
   npm run dev
   ```

4. Symlink or copy the repo directory into your Obsidian vault's `.obsidian/plugins/draw-steel-elements/` directory. The dev build produces `main.js` and `styles.css` in the repo root.

5. Enable the plugin in Obsidian Settings > Community Plugins.

## Common Workflows

### Making changes

1. Run `npm run dev` to start the watcher.
2. Edit source files. esbuild rebuilds on save.
3. In Obsidian, toggle the plugin off and on (or reload) to pick up changes.

### Type checking

```sh
npm run tsc
```

Runs `tsc --noEmit`. Vue was removed (D1, 2026-07); this is now plain TypeScript
type-checking, no `vue-tsc` involved. This is also a hard gate in CI (`plugin-ci.yml`).

### Production build

```sh
npm run build
```

Runs type checking first (`tsc --noEmit`), then builds minified output without sourcemaps.

### Build without type check

```sh
npm run build-no-check
```

Skips `tsc` and just runs esbuild in production mode. Used by the release recipe.

### Adding a new element

1. Create processor in `src/drawSteelAdmonition/<Name>/`
2. Create model in `src/model/` with static `parseYaml(source: string)` method
3. Register in `src/utils/RegisterElements.ts` with one or more `ds-*` language tags
4. Add styles in `styles-source.css`
5. Add user docs in `docs/`

## Testing

- **Jest (unit + jsdom):** `npm test` (`unit` node project, `dom` jsdom project). Test files are `*.test.ts`
  under `test/unit` and `test/dom`.
- **Real-Obsidian functional tests (SC-408):** `npm run e2e` drives a real Obsidian headlessly with real
  input and asserts the note file; per-control coverage manifests are gated. **Required to land any change**
  (Scott, SC-408). See `e2e/README.md`.
- **Real-Obsidian write-lifecycle gate:** `npm run obsidian-lifecycle`.

## Debugging

- Plugin logs to the browser console. Open Obsidian's DevTools (Ctrl+Shift+I / Cmd+Option+I).
- Look for `Draw Steel Elements:` prefixed log messages.
- Schema validation errors are displayed inline in the rendered element container.
- Reference resolution failures show the attempted paths in the error message.

### Useful debug steps

1. Open DevTools console in Obsidian.
2. Filter for `Draw Steel` or `DSE` in console output.
3. Check the rendered element for `.error-message` CSS class elements.
4. For reference resolution issues, check that the target file exists at the expected path or in the compendium directory.
