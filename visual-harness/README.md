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

## Obsidian camera (ground truth)

    npm run obsidian-shots                                       # 44 PNGs: 11 elements × legacy/steel × dark/light
    npm run obsidian-shots -- --element=statblock --theme=steel   # narrowed

Spawns a REAL, second Obsidian instance (scratch `--user-data-dir` + CDP port 9223 by
default — your own Obsidian is untouched; a window appears on the desktop during the run; a
short warm-up launch runs first if the scratch dir has no self-updated app asar yet, since
the system-installed Obsidian is Electron-106-era and auto-updates on first launch) against
the git-managed `demo-vault/`. One spawn/attach for the whole sweep: it opens a generated
note per element (`demo-vault/Harness/` — git-ignored, regenerated every run by
`notes-gen.mjs` from the F4 fixtures + `aliases.json`) and screenshots the rendered element
over CDP, once per plugin-theme (`legacy`/`steel`) × chrome-bg (`dark`/`light`) combo. Before
quitting it restores plugin theme=`steel` / chrome=`dark` so the vault's persisted state
matches the committed baseline.

`npm run obsidian-shots` runs `notes-gen.mjs` and a `build-no-check` build before the camera
itself — no separate setup step. Output: `shots/<element>--obsidian-<theme>-<bg>.png`, named
to diff directly against the browser harness's `<element>--<theme>-<bg>.png`. Browser shots
iterate fast; Obsidian shots are the ground truth. Same failure contract as `shots`: a
per-combo failure saves `<element>--obsidian-<theme>-<bg>--ERROR.png`, the sweep continues,
and the run exits 1 listing every failure; a bad `--element=`/`--theme=`/`--bg=` value exits
2 before anything spawns. Needs a display (`:1` by default) and the system Obsidian
installed — local tool, not CI.

### Known deltas vs. browser shots

Verified by comparing F4 and F5 shots of the same element side by side:

- **Card body font**: real Obsidian renders it in a serif font; the browser harness's
  vendored `--font-text` (`vars.css`) is a sans stack, so browser shots read sans where
  ground truth is serif.
- **Chip/metric styling**: minor spacing/sizing differences from Obsidian's own base CSS —
  the harness only vendors the subset `styles-source.css` reads, not Obsidian's full
  default theme.
- **Steel fallback palette**: both cameras show Steel's fallback-hex values (no `--sc-*`
  variable is defined in either the harness's `vars.css` or `demo-vault/`) — not a fidelity
  delta, just confirmation the two cameras agree here.
