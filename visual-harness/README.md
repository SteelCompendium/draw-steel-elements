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
- `settings-evidence.mjs`, `sc184-evidence.mjs` — ad-hoc, hand-run evidence cameras for one
  fix round each (SC-131, SC-184), reusing `obsidian-camera.mjs`'s spawn/attach/CDP
  boilerplate for a handful of scenarios the regular ground-truth sweep doesn't cover.
  Neither is wired into `package.json`, `npm run obsidian-shots`, or any gate — not dead
  code, just not part of the standing battery; see each file's own header for its scenario
  list and usage.

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

## Obsidian app.css pin (SC-202 r6a)

`visual-harness/shoot.mjs` resolves the real Obsidian `app.css` the six host-leak/link-token
sweeps inject **itself**, at startup, before launching a browser (`fetch-obsidian-app-css.mjs`'s
`ensurePinnedObsidianAppCss()`, imported and awaited directly — not an npm lifecycle hook,
fix round MED-4: every invocation of this file, `npm run shots` or `node
visual-harness/shoot.mjs` directly or under `--ignore-scripts`, gets the same sheet or the
same loud failure). It fetches the pinned release asset, verifies it against the committed
`visual-harness/obsidian-app-css.pin.mjs` (version + sha256 — never the CSS itself, per the
2026-09-02 phase-2 ruling), and writes `visual-harness/dist/obsidian-app.css` (gitignored)
plus `dist/obsidian-app.css.meta.json` recording which sheet actually ended up there — and
`shoot.mjs`'s own sweeps re-hash those bytes against that meta (and, for anything claiming
pinned equivalence, against the pin itself) before ever injecting them, so a stale or
tampered `dist/obsidian-app.css` fails loudly rather than gating "OK" over the wrong sheet.
Run `npm run host-css` by hand to pre-warm the cache (e.g. before going offline) — it's the
identical resolve step, just without the browser sweep after it.

**Idempotent and cache-first, with one self-heal.** A cached `visual-harness/dist/obsidian-
<ver>.asar.gz` (gitignored) is reused with no network — but the WHOLE chain (`.asar.gz` ->
gunzip -> `app.css`) is re-verified against the pin every run, cached or fresh. A cached
copy that FAILS verification (a truncated download, corruption) is not an immediate failure:
the cache is deleted and ONE fresh fetch is attempted before giving up. A FRESH fetch
(cached-then-retried, or fetched directly) that fails verification IS a loud failure
(`process.exit(1)`, with a remedy line). Delete the cached `.asar.gz` yourself at any time to
force a clean re-fetch.

**A 404/403/5xx is a WRONG PIN, not "offline" — and is a loud failure, never a fallback.**
Only a genuine connection-level failure (DNS, connection refused/reset, timeout — `fetchImpl`
itself throwing) is treated as offline. A completed HTTP error response means the pin names
a version with no public release asset (SC-202 r6a hit exactly this with its first pin
candidate, 1.14.0) and exits 1 rather than silently gating "whatever happens to be
installed" while still claiming to test the pin.

**Offline fallback, decoupled from SC-205's own version floor.** If the fetch is genuinely
unreachable and no cache exists, the recipe looks for ANY real, parseable-version installed
Obsidian (independent of SC-205's `PINNED_OBSIDIAN` floor, which answers a different
question — see `fetch-obsidian-app-css.mjs`'s `isEligibleInstalledAsar`). If that installed
version happens to equal the pin, its `app.css` is verified against the pin and used as a
REAL gate (`source: "installed-pinned"` — an offline dev running exactly the pinned Obsidian
does not lose the gate). Otherwise it falls back to whatever IS installed with a clear
WARNING naming the sheet actually in use (`source: "installed-fallback"`) — that run's
host-leak results are informative, not a verified gate against the pin. If neither a fetch
nor any eligible installed Obsidian exists, nothing is written (a stale sheet from an earlier
run is deleted, not left behind) and the sweeps print `SKIPPED (no resolved Obsidian app.css
sheet)` — never a failure for lacking one.

**Warn-on-drift.** Every `npm run shots` (or direct `node visual-harness/shoot.mjs`) also
hashes the INSTALLED Obsidian's `app.css` (if any eligible one, same rule as the fallback
above) and prints ONE `OBSIDIAN APP.CSS PIN DRIFT` line if it differs from the pin — this is
expected on any machine whose Obsidian has self-updated past the pinned version, and the
gate keeps running against the pin regardless.

**Bumping the pin** (decisions.md: "a deliberate act with its own sanctioned rebaseline" once
the real sheet is actually turned on in the harness — SC-202 round 6b onward):

1. Confirm the target version has a real public release asset — enumerate
   `https://api.github.com/repos/obsidianmd/obsidian-releases/releases` and check for the
   exact `v<ver>` tag with a desktop `obsidian-<ver>.asar.gz` asset (not every version that
   self-updates onto a dev's machine gets one — Obsidian's Insider/beta channel can run
   ahead of what's published there; SC-202 r6a hit exactly this with 1.14.0).
2. Fetch that asset, gunzip it, and extract `app.css` with `readAsarFile` from
   `obsidian-host-pin.mjs` (reuse, don't fork) — or simply delete the cached `.asar.gz` and
   run `npm run host-css` against a pin file edited to the candidate version/URL first, then
   read the resulting mismatch error: with the `.asar.gz` check first, the FIRST failure
   names the gz hash, not the app.css hash — a second pass (after fixing `asarGzSha256`, or
   dropping it temporarily) is needed to learn the real `app.css` hash.
3. Update `visual-harness/obsidian-app-css.pin.mjs`'s `OBSIDIAN_APP_CSS_PIN` (version, both
   hashes, source URL) and its header comment (append to the pin-history block, don't
   overwrite it).
4. Run the full battery. If the real sheet is already turned on in the harness at that point,
   expect frozen/shot bytes to move and follow the freeze-delta sanction flow (dse-verify
   skill → "Freeze semantics"); while the sheet is off (r6a/r6b's own scope), a pin bump
   should move zero shot/frozen bytes.
5. **SC-127 (added r7): regenerate the print preview's "light island."** The `.theme-dark
   [data-dse-element][data-dse-print="on"]…` host block in `styles-source.css` (between its
   own `/* SC-127 LIGHT ISLAND — GENERATED … BEGIN/END */` markers) is a MACHINE-GENERATED
   copy of every `--*` token this pin's sheet resolves differently under `.theme-dark` vs
   `.theme-light` — bumping the pin without regenerating leaves it stale, and
   `visual-harness/shoot.mjs`'s own `assertSc127LightIslandPinned` in-run guard (`npm run
   shots`) will fail loudly (`SC-127 LIGHT ISLAND DRIFTED`) if you forget. Run `npm run
   gen-light-island` (`visual-harness/obsidian-light-island.mjs` — its own header has the
   full design rationale) right after step 3 above and commit the regenerated block in the
   SAME commit as the pin bump. This necessarily moves twin bytes (every capture with a
   print-on root) — expected, not a leak; sanction and rebaseline it like any other
   Steel-visible change.

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
| `modal-montage-edit` / `modal-montage-limits` | the montage Log an action… sheet opened from a recorded cell (edit mode), and the ⋯ "Set limits…" modal (SC-334). Every modal capture also FAILS if its `.dse-modal__body` scrolls sideways, naming the overflowing elements — the class of bug that clipped the sheet's right edge |
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
    npm run docs-shots -- --only=counter.gif --check-stable   # an animated GIF: capture twice, compare

**Run it before every release** (it is a step in the README's Release checklist). Docs images
went stale silently for two years because nothing could regenerate them; now the fix is a
command, and a review of the diff.

### How it is wired

- `docs-manifest.mjs` — **the single source of truth**: one entry per file in `docs/Media`.
  Add an entry, reference `docs/Media/<out>` from the doc, re-run. Nothing else knows about
  docs images. Entries also declare what is deliberately NOT regenerable (`DOCS_MANUAL` —
  just the favicon, a brand asset: since SC-411 the animated GIFs are manifest entries too),
  which the run prints at the end along with any Media file the manifest doesn't declare.
- `docs-shots.mjs` — the runner. Element cards go through this harness's own page (fast, no
  display); everything else goes to `obsidian-camera.mjs --docs`.
- **The 7.0.0 `experimental` switch (SC-407):** the Obsidian half (`--docs`) runs with it OFF,
  so deferred elements would show their placeholder card. The browser half renders through
  `entry.ts`, which turns it ON — so `docs-deferred-guard.cjs` makes the runner refuse (before
  capturing anything) a browser entry whose `element` / `gallery` id is a `deferred`
  definition. The deferred set is read from `src/elements/*/definition.ts`, not hard-coded.
- `obsidian-camera.mjs --docs` — the same camera, same CDP plumbing, writing to `docs/Media`
  instead of `shots/`. Kinds: `note`, `settings` (with an optional page to navigate into),
  `modal` (real affordance clicks, with `pre:` clicks for controls that only exist after
  another one is used), `sidebar` (via the real command), `canvas`.

Two properties are deliberate:

- **It writes nowhere near `shots/`.** The `shots` / freeze / parity gates cannot move when
  a docs image does, and vice versa. That includes failures: a failed docs entry's error
  window shot (and the "plugin not loadable" shot) goes to `visual-harness/dist/docs-errors/`
  (`docs-<out>--ERROR.png`, git-ignored), never `shots/`.
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

### Animated GIFs (SC-411)

Every interactive element's docs page shows a GIF, and none of them is a screen recording: a
GIF is a **scripted interaction** declared in the manifest, replayed against the real plugin and
encoded from the captured frames. A hand-recorded GIF goes stale on the next landing, exactly
what the manifest was built to end for stills; this extends the same rule to motion.

```js
{
  out: 'initiative-tracker.gif', kind: 'gif',
  source: 'browser',                 // or 'obsidian'
  element: 'initiative',             // REQUIRED, both sources (the deferred guard keys on it)
  fixture: 'default',                // browser (+ width?, prefs?)   |  obsidian: body: … or note: …
  seed: 7,                           // optional: seeds Math.random (dice)
  dpr: 2,                            // 2 unless over the byte budget, then 1
  cursor: true,                      // synthetic pointer overlay; false turns it off
  viewport: { width, height },       // window / page size (must hold the card, and for Obsidian
                                     // the centred modal too)
  steps: [ { click: '.dse-init__title-text', hold: 500 }, … ],
}
```

**Steps** are `action → settle → capture one frame` (unless `capture: false`):

| step | meaning |
|---|---|
| `{ hold }` | capture the current state (the resting first frame, the last frame) |
| `{ click: sel }` | move the synthetic cursor to `sel`, then a **real** pointer click (Playwright `locator.click()`; Obsidian CDP `Input.dispatchMouseEvent` move/press/release) — not `el.click()`, which fires no pointer, hover or focus events |
| `{ hover: sel }` | move both cursors only (hover-revealed UI); the real pointer is *not* parked for this frame |
| `{ type: text, into?: sel, select?: true, every?: n }` | focus `into` (or use the focused element), select-all first when `select`, send real key events; `every: n` captures one frame per `n` characters (a typing animation). The synthetic cursor then steps off the field (its tip goes to the field's bottom-right corner), so it never covers the typed value |
| `{ press: key }` | a real key event: `Enter`, `Escape`, `Tab`, `Backspace`, the arrows, `Control+A`; same cursor rule when a text field is focused |
| `{ waitFor: sel }` | wait until `sel` exists (e.g. a modal's body after a click) |
| `write: true` | modifier on `click` / `type` / `press`: **wait for the block write** before capturing, then for quiet (no further write for 450 ms, just over the 400 ms persist debounce, so a straggler cannot satisfy the next step's wait). No write within 5 s fails the entry — the script is wrong or the product is |
| `hold: ms` | how long the frame stays on screen (default 500); consecutive identical frames are merged and their holds added |
| `capture: false`, `what: '…'` | act without capturing; a label for logs and `frames.json` |

`write: true` means different things in the two cameras, because the two hosts differ. Browser:
the harness host's `replaceSource` bumps `window.__dseHarnessWrites` (a no-op write otherwise),
and the step waits for the counter. Obsidian: the step polls `app.vault.adapter.read(note)`
until the note's text changes, then waits ~500 ms for the section re-render and view adoption.

**Selectors** resolve **inside the element root** (`#mount` in the browser, the active leaf's
`[data-dse-element]` in Obsidian), so they can never hit a second copy, and must match
**exactly one node** (an ambiguous selector fails loudly instead of clicking the first of
four), and are waited for at most 5 s in both drivers (a stale selector fails in 5 s, not Playwright's 30). The prefix `modal:` resolves inside `.dse-modal`, which Obsidian appends to `<body>`.
Use DSE classes and `aria-label`s (what the tests and the lifecycle gate already treat as
contract); avoid positional `:nth-child` for content — `:has()` on a stable child
(`.dse-init__entry:has(button[aria-label="Toggle turn taken: Frodo Baggins"]) …`) names a row
by what it holds.

**Validation is at load.** `docs-gif.mjs` rejects an unknown step or entry key — and an entry
key the entry's own camera does not read (browser reads `fixture` / `width` / `bg`, Obsidian
`note` / `body`; both read `prefs`, `seed`, `dpr`, `cursor`, `viewport`), so nothing is accepted
and silently ignored — `write` on a step that cannot write (`hover`, `waitFor`, a capture-only
step), a malformed selector prefix, a missing `element`, and a script that captures nothing —
before anything launches. Selector *syntax* is not parsed at load (that needs a CSS parser); a
bad selector fails at its step, in 5 s. The deferred
guard (`docs-deferred-guard.cjs`) refuses a gif entry for a deferred element from either
source.

**Two drivers, one interpreter.** `runGifSteps(driver, entry)` knows nothing about the camera;
`createPageDriver` (Playwright, the browser half) and `createCdpDriver` (raw CDP,
`obsidian-camera.mjs --docs`) implement the same small interface. Obsidian captures start from
a **fresh scratch note** (`Harness/docs-<out>-<n>.md`, deleted afterwards): the trackers write
into the note they live in, and a second capture must begin from the same text *and* the same
session state. A `note:` entry copies the generated Harness note's text instead of mutating it.

**Frames and size.** Each frame is a full fixed-size screenshot; the GIF is cut from the union
of every frame's element rect (plus any open modal, plus the element chrome) + 12 px, so one
fixed crop shows the whole animation. `gif-encode.mjs` (`gifenc` + `pngjs`, exact-pinned
devDependencies, pure JS, no ffmpeg) uses one global 255-colour palette learned from *sampled*
pixels, transparent-diff frames (`dispose=1`) and merges identical frames. The budget is
1,000,000 B per GIF: 2x, falling back to 1x when over (the PNG rule); a GIF still over at 1x
is printed `OVER BUDGET`. Review frames land in `visual-harness/dist/docs-gif-frames/<out>/NN.png`
with a `frames.json` (holds, rects, sha256s) — git-ignored, never `docs/Media`.

#### `--check-stable`: a GIF must be a regeneration target

    npm run docs-shots -- --only=<x>.gif --check-stable

Captures the entry **twice** (a fresh Chromium, or a fresh scratch note in the same Obsidian),
asserts the same frame count and byte-identical frames (compared inside the GIF's crop, so the
Obsidian window title — the scratch note's name — cannot fail it), and checks the encoder
produced the same GIF. On a mismatch it prints the frame indices, the differing pixel count and
the max channel delta, keeps the second run's frames next to the first's (`<out>.run2/`, removed by the next run of that entry), and
exits 1. Nothing is written to `docs/Media`. A GIF that fails it is not a regeneration target.

#### The determinism knobs, and why each exists

All are runner-side; none touches product code. Rates are measured (SC-411 r1 spike, r2):

| hazard | what neutralises it | measured without it |
|---|---|---|
| raster noise on antialiased edges after an interaction repaint (browser) | `chromium.launch({ args: ['--disable-partial-raster'] })` | 1 run in 6 differed by 1 px; 13/13 identical with it |
| CSS transitions / animations (browser) | `screenshot({ animations: 'disabled' })` | differed at a focus-ring frame |
| CSS transitions / animations / caret blink (Obsidian) | freeze CSS (`transition: none; animation: none; caret-color: transparent`) injected for the run | 1 capture in 3 differed by 8 px (focused textarea ring); 5/5 identical with it |
| hover state and hover-revealed chrome | the **real** pointer is parked in a corner outside the element before every capture (the synthetic cursor is DOM, so its position is deterministic) | hover chrome / tooltips appeared in frames |
| Obsidian aria-label tooltips, notices | `.tooltip` / `.notice` removed before every capture (they are timer-driven) | tooltips ("Advance round") appeared in frames |
| `:focus-visible` on a modal's autofocused button (Obsidian) | a focused button-like control is blurred before every capture (text entry stays focused — its ring is part of a typing frame); Chromium paints the ring from process-wide input history, so it is not reproducible | the montage sheet's "Success" chip had its ring in a lone `--only` run and not in a full `docs-shots` run (and in the first capture after launch but not a second): 1,935 px |
| the file explorer / ribbon beside the note (Obsidian) | both side panels collapsed for the capture (restored after) | a strip of the vault's file list in the clip |
| dice (`Math.random`) | `seed:` installs a seeded PRNG before the page runs (init script / `Runtime.evaluate`) | rolls differ every run |
| fonts | `await document.fonts.ready` before each capture | — |
| write timing | `write: true` waits for the write, never a sleep | — |
| deferred chrome | browser GIFs mount with `experimental=0` (harness param): the "Pin to sidebar" item that hover reveals does not exist in any frame | chrome strip with a deferred item |

Obsidian self-updates its app asar on warm-up, so GIF bytes can move *across Obsidian releases*
(the PNGs already do); stability is defined per environment. In one environment the GIFs and the
element PNGs regenerate byte-identically; the Obsidian *leaf* shots can differ by sub-visible
raster noise (`tutorial-source-mode.png` is not byte-stable even in a lone run, on the base
branch too: SC-424, a pre-existing bug), so a full `npm run docs-shots` can leave that one PNG
changed. Restore it with `git checkout -- docs/Media/tutorial-source-mode.png`; never commit it.
