# e2e: real-Obsidian behaviour tests (SC-408)

Drives a real Obsidian (WebdriverIO + `wdio-obsidian-service` behind our own `driver/`) with
real pointer and key events, then asserts the **note file** and the DOM. Shipped specs run
with `experimental` OFF (the real 7.0.0 product).

**Required gate: a green full `npm run e2e` (0 failed, `coverage: Y/Y pairs`) is required before landing
ANY change to this plugin** (Scott, SC-408, 2026-10-18: "make it required to land future changes"), not only
changes to the surfaces covered so far. Run order is in the `dse-verify` skill (step 4b, after lifecycle).

```bash
npm run e2e                                # full run: headless on a private Xvfb, pinned Obsidian 1.14.4, coverage gate ON
npm run e2e -- --element=stamina-bar       # one dir under specs/ (or a top-level file: --element=_census)
npm run e2e -- --only=STAM-D01,STAM-S13    # by [ID] in the test title (unknown id = exit 2); gate skipped
npm run e2e -- --shards=4                  # parallel Obsidians (default min(4, nproc/3))
npm run e2e -- --obsidian=installed        # /usr/bin/obsidian + newest ~/.config/obsidian asar
npm run e2e -- --headed [--slow=300]       # watch it; one shard; outlines each target
```

Exit 0 ok, 1 a test failed (or was skipped at runtime) or the coverage gate failed, 2 usage/environment
(an unknown `--only` id, or a `.skip` / `.only` / `xit` / `xdescribe` in a selected spec, which names `file:line`). Last line:
`OBSIDIAN-E2E done: N/M ok, F failed, K known-bug, coverage: X/Y pairs` (K = expected failures from
`knownBug`). Run from a devbox shell (Node + Xvfb).

**Headless vs headed.** Headless always starts its own Xvfb in `:200-:239` and sets `DISPLAY` for
every wdio / chromedriver / Obsidian child; those never inherit your shell's `DISPLAY` (agent shells
export `:1`, your real screen). Xvfb itself and the build step do inherit it, harmlessly (they open no window).
`--headed` is the only way onto a real display: `DSE_E2E_HEADED_DISPLAY` if set, else `:1`.
Agents: never `--headed` on `:1`; test it against a throwaway Xvfb.

**Cache.** Obsidian app / installer / chromedriver downloads live in
`${XDG_CACHE_HOME:-~/.cache}/dse-e2e-obsidian` (override `OBSIDIAN_CACHE`), shared by every
worktree (~1 GB per version set; the first run of a new version downloads).

**Output** goes to `e2e/.out/<run>/` (gitignored, newest 12 runs kept): a bundle per failing test
(`<test-id>/`: screenshot, DOM, note before/after + diff, page events, versions, vault copy),
`results/`, `coverage.json`.

`npm run tsc` also type-checks the specs and driver (`tsc -p e2e`), and `npm run lint` lints `e2e/`
(its own config block in `eslint.config.mjs`).

## Layers, ids, manifests, the coverage gate

If a bug would show in a jsdom table (math, labels, states), test it in jest. If it needs a real
browser event, a real Modal, layout, or a real write (focus/blur order, Escape, hit-testing,
adoption across a write), it is an e2e scenario.

- **Control ids.** Every interactive node of a pilot surface carries `data-dse-control="<surface>.<control>"`
  (`sedit.damage`, `stamina.bar`, `recov.catch-breath`, `init.detail.bar`), stamped by the kit
  factories' `control` option (`src/framework/kit/controlId.ts`). Attributes only. Obsidian's own
  X and backdrop are host ids (`modal.close`, `modal.backdrop`) the driver resolves from its selectors.
- **Manifests** (`manifest/*.ts`) list each surface's control ids, the interaction kinds each must
  see (`click`, `click-disabled`, `dblclick`, `type`, `blur`, `press:<Key>`), and the S1 inventory
  rows covered. New control => id + manifest row, or the checks below fail.
- **Three checks.** (a) `test/dom/e2eCensus.test.ts` (jest): un-id'd interactive node or id not in a
  manifest. (b) `specs/_census.e2e.ts`: same, from the browser's own event listeners
  (CDP `DOMDebugger.getEventListeners`), which also finds div-with-a-listener controls.
  (c) The exercised-set gate in `run.mjs`: a FULL run exits 1 if any manifest (control, kind) pair
  was driven by zero tests, was driven ONLY by `knownBug` tests (a marker stops at its first failing
  assertion), or a driven pair is in no manifest. `--only`/`--element` print coverage, skip the gate.
  A drive is recorded after the action happened; `press` needs the control to hold focus (host ids:
  `dse.aimedAt('modal.close')`) and `blur` needs the control focused.

## Adding a scenario

Specs live in `specs/<surface>/*.e2e.ts` and import only `../../driver/*`. A unique `[ID]` in the
title drives `--only`. Do per-test setup inside the test (`openBarModal`, `dse.openNote`), not in a
`beforeEach` (a throwing hook makes mocha skip the rest of the suite). After every test: no page
errors, no orphaned modal, notes intact outside their blocks, registry collisions 0.

```ts
import { dse } from '../../driver/dse';
import { applyAmount, applyAndWrite, expectApplyLabel, openBarModal } from '../../driver/stamina';
it('[STAM-X01] what a user sees happen', async () => {
  const modal = await openBarModal('Stamina/basic.md');     // fixture reset + Reading view + click the bar
  await applyAmount(modal, '3', 'sedit.damage');
  await expectApplyLabel(modal, 'Lose 3 Temp Stamina');
  expect(await applyAndWrite(modal, 'Stamina/basic.md')).toBe(1);   // exactly one write
  await dse.expectNoteBlock('Stamina/basic.md', 'ds-stamina-bar').toMatchObject({ temp_stamina: 2 });
});
```

- Fixture notes are real `.md` files in `vaults/shipped/`; open them in Obsidian by hand:

  | Note | Contents |
  |---|---|
  | `Stamina/basic.md` | one `ds-stamina-bar`: 15/20, temp 5, Recoveries not tracked |
  | `Stamina/recoveries.md` | 12/30, temp 0, 3 of 6 Recoveries (recovery value 10) |
  | `Stamina/recoveries-full.md` | 30/30, 3 of 6 Recoveries |
  | `Stamina/recoveries-zero.md` | 12/30, 0 of 6 Recoveries |
  | `Stamina/dying.md` | -2/30, 3 of 6 Recoveries |
  | `Stamina/legacy-low.md` | 2/30, Recoveries not tracked |
  | `Stamina/info-string.md` | one `ds-stamina-bar` whose fence line is ` ```ds-stamina-bar  extra words ` (12/30, 3 of 6 Recoveries; SC-290) |
  | `Stamina/two-blocks.md` | two `ds-stamina-bar` blocks: 15/20 +5 temp, then 8/10 |
  | `Callout/callout.md` | one `ds-stamina-bar` (12/30, 3 of 6 Recoveries) inside a `> [!note]` callout, text above and below it (SC-455) |
  | `Callout/nested.md` | the same block inside a callout nested in a callout (`> > ` on every line) |
  | `Callout/quote.md` | the same block inside a plain blockquote (Reading view only: Live Preview does not draw it) |
  | `Callout/twins.md` | two IDENTICAL `ds-stamina-bar` blocks in one callout |
  | `Callout/list.md`, `Callout/list-lp.md` | the block's fence indented inside a list item: not supported yet, so a click shows the "not saved" Notice (two copies: the Notice is rate-limited per note) |
  | `Initiative/tracker.md` | `ds-initiative`: hero Alice Alpha 30/30, three Ogres 60/60 (cells `0-1`..`0-3`) |
  | `Initiative/hurt.md` | `ds-initiative`: hero Alice Alpha 30/30, Ogre #1 at 20/60 and Ogre #2 at 60/60 (a hurt creature, for Spend Recovery) |

- Edits are checked per fence: `dse.block(lang, n)` declares which block of the open note a test edits, and
  after the test every OTHER fence must be byte-identical to the fixture (a write into a sibling block fails).
  The edited block's own opening and closing fence lines must stay byte-identical too (only its body may
  change), so a write that rewrites an info string, the fence run or the closing line fails (SC-456). Fences
  are read with the product's grammar (```` ``` ````/`~~~`, 4+ runs, quote prefixes, `` ``` ds-x ``; the block
  type is the first token of the trimmed info string). The product deliberately trims trailing whitespace on
  the fence lines it writes (SC-290), so a fixture must not carry trailing whitespace on the fence lines of a
  block a test writes.
- Drive controls by id (`modal.control('sedit.damage')`); `{ css }` / `{ name }` are for READING nodes only
  (driving one is flagged by the gate). Repeated nodes: `control('recov.marker', { nth: 4 })`.
- Negative checks: `dse.expectNoWrite(path, action)` waits for write-idle, never sleeps. Never `sleep`; wait
  for a state. No retries: a flake is a bug.
- **Known bugs.** `knownBug('SC-123', '[ID] correct behaviour', fn, { failsWith: /msg/ })` encodes the
  CORRECT behaviour; it passes while `fn` fails and FAILS the moment it passes ("known bug SC-123 appears
  fixed - remove the marker"). Pin today's behaviour of something a ticket has
  ruled will CHANGE (but has not designed yet) as a plain test, with the title suffix
  `[current behaviour — SC-nnn will ...]` (e.g. `SC-432 will relabel + confirm`, `SC-432 changes this`): the
  ticket's fixer rewrites it. The retired `[... ruling pending ...]` wording is no longer used.
- Preferences: `before(() => dse.setPrefs({ staminaRecoveryPopover: true }))` + `after(() => dse.setPrefs({}))`.
