# F4 visual harness

Renders each DSE element through the real `ElementPipeline` in Chromium and screenshots it,
so agents (and humans) can see the plugin without opening Obsidian. Close-enough fidelity
by design: Obsidian default-theme variables are vendored in `vars.css`; final visual QA is
still real Obsidian. Spec: workspace `docs/superpowers/dse-overhaul/F4-visual-harness-spec.md`.

## Use

    npm run shots                                  # full sweep: 11 elements × legacy/steel ×
                                                   # dark/light + steel-print + 4 galleries
    npm run shots -- --element=statblock --theme=steel   # narrowed
    npm run shots -- --readonly                    # read-only affordance variants
    npm run shot-url -- https://steelcompendium.io/v2/ visual-harness/shots/v2-home.png

(node via the workspace devbox: `devbox run -- bash -c "cd <this repo> && npm run shots"`.)

Output: `visual-harness/shots/<element>--<theme>-<bg>.png`, `<element>--steel-print.png`,
`gallery--<theme>-<bg>.png`. Deterministic names — diff before/after by filename. Narrowing
with `--theme=` or `--bg=` excludes the print shot — it's only part of full (unnarrowed)
sweeps. A failed mount saves `…--ERROR.png` and exits 1: fix before trusting any shot. An
unrecognized `--element=`/`--theme=`/`--bg=` value is a different failure mode — no shots are
attempted, the offending value is named on stderr, and it exits 2.

One-time setup: `npx playwright install chromium`.

## Pieces

- `entry.ts` — mounts elements per URL params (`?element=&fixture=&theme=&bg=&print=1&readonly=1&gallery=1`)
  through the real pipeline + seams; element list comes from `main.ts`'s
  `registerFrameworkElementDefinitions` (can't drift).
- `shim/obsidian.ts` — browser `obsidian` module: jest-free mock core + real Lucide icons +
  `marked` markdown + toast Notice. Aliased in by `esbuild.mjs` for this bundle only.
- `vars.css` — vendored Obsidian default-theme variables (only what `styles-source.css` uses).
- `fixtures/<element>/default.md` — code-fence bodies; validity-gated by
  `test/dom/visual-harness/fixtures.test.ts`.
- `dist/`, `shots/` — generated, git-ignored.

`test/dom/visual-harness/fixtures.test.ts` is jest's gate on this harness — it imports
`entry.ts` under jest, where `obsidian` maps to the TEST mock, not `shim/obsidian.ts`. Touching
the shim doesn't move that gate at all, so after editing `shim/obsidian.ts` re-run
`npm run shots` yourself — CI won't catch a shim regression.

## v1 limits (spec §"Out of scope")

Static states only — no modals/hover/focus scripting, no CI pixel gates, default Obsidian
theme only. Steel shots show the **fallback-hex palette**: `styles-source.css` chains its
Steel vars as `var(--sc-*, #hex)`, and `vars.css` deliberately doesn't vendor `--sc-*` (that
palette lives in the v2 site's snippet), so every Steel shot renders the inline hex fallbacks
— the no-palette-snippet default-install look. The harness can't show Steel-with-`--sc-*`, so
validate Steel design work against these fallback values.
