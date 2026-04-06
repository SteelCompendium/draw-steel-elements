# Draw Steel Elements

Obsidian plugin that renders Draw Steel TTRPG content as interactive, styled elements.
Users write YAML in `ds-*` fenced code blocks and the plugin renders ability cards,
statblocks, initiative trackers, negotiation trackers, stamina bars, and more.

## Repository Documentation

This repo uses standardized `.repo-docs/` documentation. **Read `.repo-docs/index.md`
first** -- it contains the reading guide, role-based routing, and links to all other docs.

## Quick Start

- `npm i` -- install dependencies
- `npm run dev` -- build with watch mode
- `npm run build` -- production build (type check + minified)
- `npm test` -- run tests (Jest, currently no test files)

## Key Architecture

- **Processor pattern**: Each `ds-*` element has a processor in `src/drawSteelAdmonition/`
- **Two rendering strategies**: DOM manipulation (most elements) and Vue 3 (interactive elements)
- **Models**: `src/model/` with `parseYaml()` static methods and AJV schema validation
- **Vue components**: `src/drawSteelComponents/` using Composition API
- **SDK**: `steel-compendium-sdk` bundled at build time for data model parsing

## Important Constraints

- **Reading mode only** -- no Live Preview support
- Output must be CJS format for Obsidian
- Target ES2018
- `obsidian`, `electron`, and CodeMirror packages are external (host-provided)
- Compendium downloader deletes the destination directory before extracting -- don't store homebrew there
