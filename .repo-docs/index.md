---
repo: draw-steel-elements
type: tool
status: active
tech:
  - TypeScript
  - Vue 3 (Composition API)
  - esbuild
  - Obsidian Plugin API
updated: 2026-04-04
---

# Draw Steel Elements

An Obsidian plugin that renders Draw Steel TTRPG (by MCDM Productions) content as interactive, styled elements inside Obsidian notes. Users write YAML inside fenced code blocks (e.g. ` ```ds-feature `) and the plugin renders them as rich UI components: statblocks, initiative trackers, negotiation trackers, ability cards, skill lists, and more.

**This repo is not:** a data source for Draw Steel content (that lives in `data-md-dse`), the SDK for parsing Draw Steel data models (that lives in `data-sdk-npm`), or the compendium website (that lives in `steelCompendium.github.io`).

## Quick Reference

| Action | Command |
|--------|---------|
| Install dependencies | `npm i` |
| Run locally (watch mode) | `npm run dev` |
| Run tests | `npm test` |
| Build for production | `npm run build` |
| Type check only | `npm run tsc` |
| Prepare release | `just release <version>` |

| Resource | URL |
|----------|-----|
| Docs site | https://steelcompendium.io |
| Issue tracker | https://github.com/SteelCompendium/draw-steel-elements/issues |
| Bug report form | https://docs.google.com/forms/d/e/1FAIpQLSc6m-pZ0NLt2EArE-Tcxr-XbAPMyhu40ANHJKtyRvvwBd2LSw/viewform |
| GitHub | https://github.com/SteelCompendium/draw-steel-elements |

## Repo Structure

```
draw-steel-elements/
├── main.ts                          # Plugin entry point (extends Obsidian Plugin)
├── esbuild.config.mjs               # Build config with Vue and YAML plugins
├── manifest.json                    # Obsidian plugin manifest
├── styles-source.css                # All plugin CSS (copied to styles.css on build)
├── justfile                         # Release automation recipes
├── mkdocs.yml                       # Docs site config (deployed to gh-pages)
├── docs/                            # User-facing documentation (MkDocs source)
│   ├── Media/                       # Screenshots and images
│   └── *.md                         # Element-specific docs
├── src/
│   ├── drawSteelAdmonition/         # Code block processors (one per element type)
│   │   ├── Features/                # ds-feature / ds-ft / ds-feat
│   │   ├── featureblock/            # ds-featureblock / ds-fb
│   │   ├── statblock/               # ds-statblock / ds-sb
│   │   ├── negotiation/             # ds-negotiation / ds-nt
│   │   ├── Characteristics/         # ds-characteristics / ds-char
│   │   ├── Counter/                 # ds-counter / ds-ct
│   │   ├── Skills/                  # ds-skills
│   │   ├── StaminaBar/              # ds-stamina-bar / ds-stamina / ds-stam
│   │   ├── ValuesRow/               # ds-values-row / ds-vr
│   │   ├── Common/                  # Shared views (headers, horizontal rules)
│   │   ├── initiativeProcessor.ts   # ds-initiative / ds-init / ds-it
│   │   └── EncounterData.ts         # Runtime encounter state
│   ├── drawSteelComponents/         # Vue 3 components
│   │   ├── Common/                  # Shared UI (buttons, modals, toggles)
│   │   ├── SkillList/               # Skill list Vue component
│   │   ├── StaminaBar/              # Stamina bar Vue component + edit modal
│   │   ├── HorizontalRule.vue
│   │   ├── VerticalRule.vue
│   │   └── Modal.vue
│   ├── model/                       # Data models and YAML parsing
│   │   ├── schemas/                 # JSON/YAML schemas for validation
│   │   └── *.ts                     # TypeScript model classes
│   ├── types/                       # Type declarations
│   ├── utils/                       # Utilities
│   │   ├── RegisterElements.ts      # Registers all code block processors
│   │   ├── ComponentProcessor.ts    # Generic Vue component mounting
│   │   ├── CompendiumDownloader.ts  # GitHub release downloader
│   │   ├── ReferenceResolver.ts     # Cross-note reference resolution
│   │   └── JsonSchemaValidator.ts   # AJV-based schema validation
│   └── views/                       # Obsidian modals and settings UI
└── .github/workflows/ci.yml         # MkDocs deployment to gh-pages
```

## Reading Guide by Role

### Human Roles

| Role | Start here | Then read |
|------|-----------|-----------|
| **New to this repo** | This file | [project.md](project.md) |
| **Developer** | [development.md](development.md) | [architecture.md](architecture.md), [conventions.md](conventions.md) |
| **Architect** | [architecture.md](architecture.md) | [integration.md](integration.md) |
| **DevOps / SRE** | [ci-cd.md](ci-cd.md) | [development.md](development.md) |

### Agent Roles

| Agent Role | Start here | Then read |
|------------|-----------|-----------|
| **Code review** | [conventions.md](conventions.md) | [architecture.md](architecture.md), [troubleshooting.md](troubleshooting.md) |
| **Bug fix / debug** | [troubleshooting.md](troubleshooting.md) | [development.md](development.md), [architecture.md](architecture.md) |
| **Feature implementation** | [architecture.md](architecture.md) | [conventions.md](conventions.md), [development.md](development.md) |
| **PR review** | [conventions.md](conventions.md) | [architecture.md](architecture.md) |
| **Dependency update** | [integration.md](integration.md) | [architecture.md](architecture.md) |
| **Documentation** | This file | [project.md](project.md), [architecture.md](architecture.md) |
| **Onboarding / Q&A** | This file | [project.md](project.md), [development.md](development.md) |

## Current Status

- **Health:** active development
- **Last significant change:** v5.1.1 -- fixed double-click opening edit mode in reading mode
- **Known blockers:** No Live Preview mode support

## Documents in This Directory

| File | Description |
|------|-------------|
| [index.md](index.md) | Overview, quick reference, and reading guide |
| [project.md](project.md) | Product context, domain concepts, and glossary |
| [architecture.md](architecture.md) | System components, data flow, and design decisions |
| [development.md](development.md) | Setup, workflows, testing, and debugging |
| [integration.md](integration.md) | Upstream/downstream dependencies and cross-repo workflows |
| [ci-cd.md](ci-cd.md) | CI pipeline, release process, and branch strategy |
| [conventions.md](conventions.md) | Code style, naming, and commit conventions |
| [troubleshooting.md](troubleshooting.md) | Known issues, common errors, and prohibitions |
