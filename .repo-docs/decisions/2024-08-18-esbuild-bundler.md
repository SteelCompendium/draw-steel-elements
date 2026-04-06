# Use esbuild as Bundler

**Date:** 2024-08-18
**Status:** accepted

## Context

The plugin needs to produce a single `main.js` file (CJS format) that Obsidian
can load. A bundler is required to compile TypeScript, bundle dependencies, and
produce the final output.

## Options Considered

### esbuild
- Pros: Extremely fast builds, simple config, good plugin ecosystem, handles CJS output natively, Obsidian sample plugin uses it
- Cons: Less mature plugin ecosystem than Webpack, no built-in HMR

### Webpack
- Pros: Mature ecosystem, handles complex configurations, widely used
- Cons: Slow builds, complex configuration, overkill for a plugin

### Rollup
- Pros: Good tree-shaking, clean output
- Cons: Slower than esbuild, more configuration needed for CJS + TypeScript + Vue

## Decision

Used esbuild from the initial commit. Configuration lives in
`esbuild.config.mjs` with custom plugins for Vue SFC compilation
(`unplugin-vue/esbuild`) and raw YAML file loading.

Key config: CJS output format, ES2018 target, externals for `obsidian`,
`electron`, and CodeMirror packages (provided by the Obsidian host).

## Consequences

- Sub-second builds in development with watch mode
- Custom esbuild plugin needed for copying CSS output (`main.css` -> `styles.css`)
- Vue support added later via `unplugin-vue/esbuild` without changing bundlers
- Production builds run in ~1 second

## Outcome

esbuild has been excellent. Build speed is never a bottleneck. The Vue plugin
integration was seamless. No reason to consider switching.
