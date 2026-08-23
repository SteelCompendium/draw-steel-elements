# F4 visual harness

Renders each DSE element through the real `ElementPipeline` in Chromium and screenshots it,
so agents (and humans) can see the plugin without opening Obsidian. Close-enough fidelity
by design: Obsidian default-theme variables are vendored in `vars.css`; final visual QA is
still real Obsidian. Spec: workspace `docs/superpowers/dse-overhaul/F4-visual-harness-spec.md`.

## Use

    npm run shots                                  # full sweep: every capture id ×
                                                   # steel-dark/steel-light + steel-print
                                                   # + steel-realprint + 2 galleries
    npm run shots -- --element=statblock --bg=dark # narrowed
    npm run shots -- --readonly                    # read-only affordance variants
    npm run shot-url -- https://steelcompendium.io/v2/ visual-harness/shots/v2-home.png

(node via the workspace devbox: `devbox run -- bash -c "cd <this repo> && npm run shots"`.)

Output: `visual-harness/shots/<element>--steel-<bg>.png`, `<element>--steel-print.png`,
`<element>--steel-realprint.png`, `gallery--steel-<bg>.png`. Deterministic names — diff
before/after by filename. Narrowing with `--bg=` excludes both print shots — they're only
part of full (unnarrowed) sweeps. A failed mount saves `…--ERROR.png` and exits 1: fix
before trusting any shot. An unrecognized `--element=`/`--bg=` value is a different failure
mode — no shots are attempted, the offending value is named on stderr, and it exits 2.

**SC-170 — the TWO print classes, and the assertion between them.** `--steel-print` is the
on-screen preview **twin** (`?print=1` stamps `data-dse-print="on"`; the medium stays
`screen`) and is the frozen class. `--steel-realprint` is real paper: no attribute,
Playwright `emulateMedia({ media: 'print' })` — what Obsidian's Ctrl-P / "Export to PDF"
actually renders. Nothing in the battery emulated the print medium before, so real print
had **zero** byte coverage, and it was carrying the full Steel plate into every PDF. After
each unnarrowed sweep `shoot.mjs` asserts the two classes are **byte-identical** per
capture id and exits 1 naming the offenders. That assertion, not either class on its own,
is the regression gate for a Steel rule reaching paper.

It also asserts **coverage**: a capture that produced one print class and not the other
fails the run. Both halves exist because they catch different things — byte parity catches
a Steel rule reaching paper, coverage catches a sweep loop that never shot the realprint
combo at all (which otherwise looks like a clean run with two fewer files). Both read the
list of captures **this run** wrote, not the directory, so a narrowed run can neither
re-assert nor be reassured by leftovers from an earlier sweep.

**Adding a sweep loop: go through `snap(page, combo, params, captureId)`.** The combo —
not the call site — decides the print medium, the `print=1` param, the `--readonly`
param/suffix and the output filename, so a new loop cannot forget any of them. The one
loop that predated this rule (SC-160's `scrollShots`) shot five `*--steel-realprint.png`
files under screen media before the assertion above caught it. Consequence worth knowing:
under `--readonly` the gallery captures are now `gallery--steel-<bg>--readonly.png` rather
than silently overwriting the plain gallery goldens with read-only renders.

**SC-144 — there is no theme axis.** Steel is the only theme, and `--theme=` is gone. The
`steel-` prefix stays in every filename (the frozen `*--steel-print.png` baseline is keyed
on it), and `entry.ts` still accepts a `theme=` query param — it just can't select a
different look.

One-time setup: `npx playwright install chromium`.

## Pieces

- `entry.ts` — mounts elements per URL params
  (`?element=&fixture=&theme=&bg=&print=1&readonly=1&gallery=1&width=<px>&prefs=k:v,k:v`) through the real
  pipeline + seams; element list comes from `main.ts`'s
  `registerFrameworkElementDefinitions` (can't drift). `width=` pins `#mount` to a fixed
  CSS width — the NARROW-shot axis (`NARROW_SHOTS`, published on the manifest and swept by
  `shoot.mjs` as `<id>--<combo>`): the fixed 900px page could never show what an element
  does at Obsidian sidebar-leaf width, where wide markdown tables and multi-column rows
  break (SC-121 Batch 4). `INTERACTION_SHOTS` (same manifest/sweep convention, own `<id>`)
  re-shoots an element/fixture after one real click on a production affordance — for a
  state (e.g. a radiogroup selection) no static fixture can express (SC-117 Batch 6).
  `PREF_SHOTS` (SC-123, third list, same convention) re-shoots an element/fixture with
  `prefs=` applied to the harness PreferenceStore BEFORE the mount — one entry per
  NON-DEFAULT value of a presentation preference. Every pref before SC-123 was a CSS
  reflow of DOM the default sweep already photographed; three of SC-123's ports change
  the DOM itself (the characteristics split, the boxed letter, the villain band), and a
  preference nobody shoots is a preference nobody reviews.
- `shim/obsidian.ts` — browser `obsidian` module: jest-free mock core + real Lucide icons +
  `marked` markdown + toast Notice. Aliased in by `esbuild.mjs` for this bundle only.
- `vars.css` — vendored Obsidian default-theme variables (only what `styles-source.css` uses).
- `../src/elements/<id>/example.yaml` — D9 (Plan 15 Task 2): single-sourced fixture body,
  shared with `authoring.example` on each element's definition; code-fence bodies
  validity-gated by `test/dom/visual-harness/fixtures.test.ts`.
- `dist/`, `shots/` — generated, git-ignored.

`test/dom/visual-harness/fixtures.test.ts` is jest's gate on this harness — it imports
`entry.ts` under jest, where `obsidian` maps to the TEST mock, not `shim/obsidian.ts`. Touching
the shim doesn't move that gate at all, so after editing `shim/obsidian.ts` re-run
`npm run shots` yourself — CI won't catch a shim regression.

**Fixture-authoring convention (plan 25 / SC-102 H-1 lesson).** A hand-authored fixture can
pass every gate — tsc, jest, freeze, parity, a clean visual read — while the shipped content it
claims to represent is still broken. SC-102's `feature`/`statblock` fixtures used
`ability_type: Villain Action N` to exercise the villain classifier; every gate was green, but
the real compendium pipeline (steel-etl) never emits `ability_type` for a villain action at all
— it emits `cost: "Villain Action N"` + `usage: '-'`, so all 156 real villain actions in the
books were still rendering with no spine, no crest, nothing. The fixture was corpus-**shaped**
in the loose sense (a plausible villain ability) but not corpus-**exact** (the literal field
shape the pipeline produces). **When a feature is classified from a pipeline-emitted field**
(anything the classifier reads off parsed YAML — `cost`, `usage`, `ability_type`, etc., not a
DOM/CSS structural concern), its fixture needs to be corpus-shaped: copy the field shape
verbatim from a real `data-unified` source file (or as close as the harness's hand-authored
fixtures get — a literal transcription, not an invented approximation), not just "shaped like
a plausible example." A hand-authored approximation is fine for structural/CSS fixtures (kit,
statblock layout, etc.) where there's no derivation logic to fool — it is NOT fine for
anything a classifier branches on.

## v1 limits (spec §"Out of scope")

Static states only in THIS (browser) camera — no hover/focus scripting, no CI pixel
gates, default Obsidian theme only. **Modals, the settings tab, sidebar leaves and canvas
are covered by the Obsidian camera instead** (SC-121 Batch 4, catalog D-5..D-8): this page
vendors only the Obsidian variables `styles-source.css` reads, not Obsidian's own
`.modal-container`/`.modal`/`.setting-item`/canvas chrome, so a browser shot of those
surfaces would pin a box that does not exist in the product. See "Obsidian camera" below.

One narrow exception (SC-117 Batch 6, catalog consumer #16): `INTERACTION_SHOTS` on the
manifest re-shoots an existing element/fixture with a single REAL click performed by
`shoot.mjs` on a production affordance, between mount-done and the screenshot — for states
(e.g. a radiogroup selection) that exist entirely within this page's own DOM but have no
static-fixture expression. Not general scripting: one click, declared per entry, same
"own id, never overwrites the resting golden" discipline as `NARROW_SHOTS`.

Steel shots show the **fallback-hex palette**: `styles-source.css` chains its
Steel vars as `var(--sc-*, #hex)`, and `vars.css` deliberately doesn't vendor `--sc-*` (that
palette lives in the v2 site's snippet), so every Steel shot renders the inline hex fallbacks
— the no-palette-snippet default-install look. The harness can't show Steel-with-`--sc-*`, so
validate Steel design work against these fallback values.

## Obsidian camera (ground truth)

    npm run obsidian-shots                                    # every element × steel × dark/light
    npm run obsidian-shots -- --element=statblock --bg=dark   # narrowed

Spawns a REAL, second Obsidian instance (scratch `--user-data-dir` + CDP port 9223 by
default — your own Obsidian is untouched; a window appears on the desktop during the run; a
short warm-up launch runs first if the scratch dir has no self-updated app asar yet, since
the system-installed Obsidian is Electron-106-era and auto-updates on first launch) against
the git-managed `demo-vault/`. One spawn/attach for the whole sweep: it opens a generated
note per element (`demo-vault/Harness/` — git-ignored, regenerated every run by
`notes-gen.mjs` from the per-element `example.yaml` bodies + `aliases.json`) and screenshots the rendered element
over CDP, once per plugin-theme (`steel` — single-valued since SC-144) × chrome-bg
(`dark`/`light`) combo. Before quitting it restores plugin theme=`steel` / chrome=`dark` so
the vault's persisted state matches the committed baseline.

Beyond the element×theme×bg sweep it takes a set of **special captures** — surfaces the
sweep structurally cannot reach, each steel/dark only (existence/behaviour proofs, not
visual combo sweeps), each selectable as its own `--element=` value:

| `--element=` | What it proves |
|---|---|
| `by-scc-kit` | a by-SCC `ds-scc` block (a kit code) recursing into a real nested `ds-feature` card |
| `sidebar-initiative` | the dedicated "Send initiative tracker to sidebar" command |
| `sidebar-hero` / `sidebar-statblock` / `sidebar-scc` / `sidebar-negotiation` | the GENERIC "Send block to sidebar" command — and narrow-width behaviour in a real 300px leaf |
| `modal-stamina` / `modal-stamina-recovery` / `modal-conditions` / `modal-form` | the four interactive modals, opened by clicking their REAL affordances |
| `settings` | the plugin settings tab, over a 2nd CDP connection to Obsidian 1.13's Settings POPOUT window |
| `canvas` | the canvas read-only quarantine (`data-dse-readonly` asserted, not just eyeballed) |

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

## `npm run docs-shots` — the published screenshots (SC-142)

The images in `README.md` and `docs/**` are not hand-taken screenshots any more. One command
regenerates all of them from the real plugin:

    npm run docs-shots                          # everything (~4 min)
    npm run docs-shots -- --only=statblock.png  # one image
    npm run docs-shots -- --browser-only        # skip the Obsidian half (no display used)

**Run it before every release** (it is a step in the README's Release checklist). Docs images
went stale silently for two years because nothing could regenerate them; now the fix is a
command, and a review of the diff.

### How it is wired

- `docs-manifest.mjs` — **the single source of truth**: one entry per file in `docs/Media`.
  Add an entry, reference `docs/Media/<out>` from the doc, re-run. Nothing else knows about
  docs images. Entries also declare what is deliberately NOT regenerable (`DOCS_MANUAL` —
  the two animated GIFs, the favicon), which the run prints at the end along with any Media
  file the manifest doesn't declare.
- `docs-shots.mjs` — the runner. Element cards go through this harness's own page (fast, no
  display); everything else goes to `obsidian-camera.mjs --docs`.
- `obsidian-camera.mjs --docs` — the same camera, same CDP plumbing, writing to `docs/Media`
  instead of `shots/`. Kinds: `note`, `settings` (with an optional page to navigate into),
  `modal` (real affordance clicks, with `pre:` clicks for controls that only exist after
  another one is used), `sidebar` (via the real command), `canvas`.

Two properties are deliberate:

- **It writes nowhere near `shots/`.** The `shots` / freeze / parity gates cannot move when
  a docs image does, and vice versa.
- **A docs image can show content no fixture has.** A manifest entry may carry its own note
  `body` or `canvas` JSON, written into the git-ignored `demo-vault/Harness/` under a
  `docs-` prefix. Adding a *fixture* for a docs image would move the `shots` count and the
  frozen baseline, which is a gate change for a picture — this avoids that entirely.

### The display: Xvfb, not yours

Real Obsidian needs an X display. The runner starts its **own Xvfb** (a framebuffer X server
that renders into memory, from this repo's devbox `xvfb` package), points the camera at it,
and kills it afterwards. Consequences worth knowing:

- Nothing appears on screen and no window steals focus.
- **Your own Obsidian can stay open.** The camera spawns its own instance against its own
  scratch `--user-data-dir` on its own display; `:1` is never touched. (This is the one real
  operational difference from `npm run obsidian-shots`, which still uses `:1` by default.)
- It picks a free display number (`:99` upward), so parallel runs don't collide.
- If Xvfb is missing, the runner tries `devbox install` and, failing that, prints the exact
  fallback: quit Obsidian, then `DSE_DOCS_DISPLAY=:1 DSE_DOCS_NO_XVFB=1 npm run docs-shots`.

### Framing rules

Docs images are a publishing surface, so the framing differs from review evidence: Obsidian's
dark chrome (the docs site is mkdocs-material `slate`), a 12px pad around the subject, and 2x
(retina) capture — dropping to 1x automatically for anything that would otherwise ship a
PNG over ~900 kB (a full statblock is 3 600 CSS px tall; at 2x it is a 2.5 MB download).
