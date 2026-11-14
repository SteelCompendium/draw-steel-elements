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
A runner only uses a display whose Xvfb it started itself: the number is accepted only when that Xvfb reports it is
listening (`-displayfd`), and a lost race for a number moves on to the next one, so runners started at the same moment
never share a display (SC-546; `scripts/xvfb-owned.mjs`, also used by the lifecycle gate and `docs-shots`). Holds once every worktree is on SC-546 or later.
Until then, an un-rebased lifecycle or docs-shots run started in the same instant can still land on a new run's display, so rebase before running either concurrently.
Agents: never `--headed` on `:1`; test it against a throwaway Xvfb.

All shards share that one private Xvfb display (no window manager, every Obsidian window at the same
spot). The runner therefore parks the X pointer at 0,0 right after Xvfb starts (`x11-pointer.mjs`, a
dependency-free X11 client; log line `OBSIDIAN-E2E pointer parked at 0,0 on :NNN (outside every window)`), so
a window another shard maps or unmaps can never send a real Leave/Enter to the window under test and steal
the hover a spec just set (SC-539). The park is best effort: if it fails the run continues as before, with
`OBSIDIAN-E2E WARN pointer NOT parked: <reason> ...` printed at the start and again after the `done` line (read
a hover-timeout red with that line in mind). Never done with `--headed`, where the pointer is yours.

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
  | `Stamina/legacy-minimal.md` | one legacy ```` ```ds-stamina ```` block with only `max_stamina: 20` + `current_stamina: 15` (SC-466: a write adds no default keys) |
  | `Stamina/two-blocks.md` | two `ds-stamina-bar` blocks: 15/20 +5 temp, then 8/10 |
  | `Stamina/embed-twice.md` | no block of its own: `![[Stamina/basic]]` twice, so one pane holds two copies of the same block (SC-505) |
  | `Counter/counter.md` | one `ds-counter` (Health 1, min 0, max 3) with `ABOVE` / `BELOW` text around it (SC-495, SC-602) |
  | `Counter/twins.md` | two IDENTICAL `ds-counter` blocks (Health 1, min 0, max 3) with prose above, between and below (SC-602: a Live Preview save of the upper one is handed to the twin below) |
  | `Callout/callout.md` | one `ds-stamina-bar` (12/30, 3 of 6 Recoveries) inside a `> [!note]` callout, text above and below it (SC-455) |
  | `Callout/nested.md` | the same block inside a callout nested in a callout (`> > ` on every line) |
  | `Callout/quote.md` | the same block inside a plain blockquote (Reading view only: Live Preview does not draw it) |
  | `Callout/twins.md` | two IDENTICAL `ds-stamina-bar` blocks in one callout |
  | `Callout/list.md`, `Callout/list-lp.md` | the block's fence indented inside a list item: not supported yet, so a click shows the "not saved" Notice (two copies: the Notice is rate-limited per note) |
  | `Initiative/tracker.md` | `ds-initiative`: hero Alice Alpha 30/30, three Ogres 60/60 (cells `0-1`..`0-3`) |
  | `Initiative/squad.md` | `ds-initiative`: hero Alice Alpha 30/30, one minion squad "Goblin Squad" of five Goblins with 4 Stamina each (pool 20, cells `0-1`..`0-5`; SC-435) |
  | `Initiative/squad-hurt.md` | the same squad at pool 10 with Goblins #1 and #2 dead, #3 (selected) grabbed and dazed (`- grabbed` stays a plain name on every write, SC-592; SC-435) |
  | `Initiative/squad-custom.md` | the `squad-hurt.md` squad, but Goblin #3 carries `on-fire` (a custom key) twice, with `grabbed` between the copies and `dazed` last, all plain strings (SC-574) |
  | `Initiative/squad-empty.md` | the same squad with its pool at 0 and all five Goblins still alive (a relieved captain or a hand-edited pool; SC-573) |
  | `Initiative/two-squads.md` | `ds-initiative`: hero Alice Alpha and two groups of two minion squads: "Wolves" (Wolf, Dire Wolf) and "River" (two squads of the same creature "Flow of the River"), two Stamina cells per squad (`nth` 0-1, 2-3, 4-5, 6-7 across the tracker), for the pool modal's squad-naming title (SC-569) |
  | `Initiative/hurt.md` | `ds-initiative`: hero Alice Alpha 30/30, Ogre #1 at 20/60 and Ogre #2 at 60/60 (a hurt creature, for Spend Recovery) |
  | `Initiative/rich.md` | `ds-initiative` with every variant (SC-437): a title ("Warren Ambush"), round 2, heroes Alice (grabbed) and Bruno (turn taken), Ogres #1-#3 (#1 dazed) in a grid group, a single-creature "Troll Boss" group, Malice 4 with `round_gain: 2` and one log entry |
  | `Initiative/captain.md` | `ds-initiative`: a captained minion squad (three Goblins, the Goblin Captain selected, an attached Warg Rider; SC-437) |
  | `Initiative/conditions.md` | `ds-initiative` with conditions in every form (SC-436): hero Alice Alpha has `bleeding` (a plain string), Dazed (`duration: eot`, red `#c0392b`, `effect: glow`), Hexed (a custom key) and Slowed (legacy `effect: save ends` text); Ogre #1 has `grabbed` and Prone (`duration: save-ends`), Ogre #2 none |
  | `Initiative/key-case.md` | `ds-initiative` with condition keys in other casings (SC-583): hero Alice Alpha has `key: Dazed` (a standard condition) and `key: Hexed` (a custom one); Ogre #1 already holds both `Dazed` (a plain name) and `dazed` (`duration: eot`), Ogre #2 none |
  | `Initiative/hand-written.md` | `ds-initiative` with hand-written condition YAML (SC-586): hero Alice Alpha has Dazed with `color: teal` (a CSS name, not a hex), Hexed with `icon: ""` (a blank icon) and Prone with `color: "oklch(0.6 0.1 180)"`; two Ogres, no conditions |
  | `Initiative/two-trackers.md` | TWO `ds-initiative` blocks in one note with prose above, between and below (SC-436): Alice Alpha + an Ogre, then Bob Beta (`grabbed`, Hexed to `eoe`) + a Goblin |
  | `Initiative/amount-edit.md` | `ds-initiative`: hero Alice Alpha, three Ogres with Ogre #2 grabbed (a plain name) at 25/60; a spec edits `amount` by hand (SC-600) |
  | `Initiative/twins.md` | TWO IDENTICAL `ds-initiative` blocks (Alice Alpha 30/30 + an Ogre, Malice 3) with prose above, between and below (SC-605: a Live Preview save of the upper tracker keeps its own half-typed quick-add and never gives it to the twin below) |
  | `Montage/empty.md` | `ds-montage` with no heroes and no limits (0 / 0), round 1 of 2 (SC-438) |
  | `Montage/fresh.md` | `ds-montage`: heroes Kira and Bram (empty skills lists), nothing logged, round 1 of 3, limits 3 successes / 2 failures |
  | `Montage/mid.md` | `ds-montage` mid-game: a title and brief, Kira (Nature), Bram (Endurance), Osric (no `skills_used` list), Yenna (no round-1 entry: an empty past cell), round 2 of 3, limits 4 / 3, one success, one failure with a note, one assist |
  | `Montage/brink.md` | 2 of 3 successes in round 2 (the "One success from Total Success" alert), Kira holding two skills |
  | `Montage/acted.md` | both heroes have already acted in the round in play: the bar's "Log an action..." is disabled |
  | `Montage/done.md` | Total Success (2 of 2 successes in round 1 of 3, one note): the done bar (Undo, Clear all), not reopenable |
  | `Montage/failed.md` | Total Failure (2 of 2 failures, round 1 of 3): the done bar, not reopenable |
  | `Montage/exhausted.md` | out of rounds (round 3 of 2), 3 successes / 1 failure, limits 5 / 5: Partial Success, the done bar with Back to round 2 and Reopen |
  | `Montage/over-limit.md` | a hand-edited block past both limits (4 of 2 successes, 3 of 1 failures), round 2 of 3 |
  | `Montage/wide.md` | twelve rounds, three heroes, round 1: the board scrolls and its hero column is pinned (SC-326, SC-490) |
  | `Montage/wide-entries.md` | the wide board with Kira's rounds 4 (a success), 5 (a failure) and 10 (an assist) already logged: round cells to the right that a Tab must scroll into view and clear of the pinned hero column (SC-326, SC-490) |
  | `Montage/hand-written.md` | hand-written YAML: Kira's `skills_used` is a scalar, Bram has no list, and Bram's round-1 entry holds an unrecognised result (`dodged`) |
  | `Montage/two-blocks.md` | TWO different `ds-montage` blocks in one note with prose above, between and below |
  | `Montage/twins.md` | TWO IDENTICAL `ds-montage` blocks (Kira, round 1 of 3, nothing logged) with prose above, between and below |
  | `Montage/unknown-keys.md` | a block with a top-level key the product does not know (`table_notes`), an entry with an extra key (`dc: 12`) and a participant with one (`player: Sam`), Kira in round 2 (SC-625) |
  | `Montage/wrong-title.md` | a block whose `title` is a YAML number (`title: 2024`): the block fails to render (SC-628) |
  | `Montage/quoted-rounds.md` | a block with `rounds: "3"` typed in quotes: Add a round writes `"31"` (SC-628) |
  | `Montage/no-action.md` | the rounds ran out (round 3 of 2) with nothing logged: the band's verdict word and rule line disagree (SC-629) |

- Edits are checked per fence: a click / type / double-click / press on an element inside `dse.block(lang, n)` declares that block
  as one the test edits (taking the scope and reading it declares nothing, SC-435), and
  after the test every OTHER fence must be byte-identical to the fixture (a write into a sibling block fails).
  The edited block's own opening and closing fence lines must stay byte-identical too (only its body may
  change), so a write that rewrites an info string, the fence run or the closing line fails (SC-456). Fences
  are read with the product's grammar (```` ``` ````/`~~~`, 4+ runs, quote prefixes, `` ``` ds-x ``; the block
  type is the first token of the trimmed info string). The product deliberately trims trailing whitespace on
  the fence lines it writes (SC-290), so a fixture must not carry trailing whitespace on the fence lines of a
  block a test writes.
- **Scope page-side selectors to `.markdown-reading-view`.** A note opened in Reading view also keeps a hidden Live Preview
  copy of every block in the same leaf (`display: none`, same block key): a bare `document.querySelector('[data-dse-element=...]')`
  can return that copy. `dse.block()` already scopes to the active Reading view; hand-written `dse.page` expressions must too (SC-505).
- Drive controls by id (`modal.control('sedit.damage')`); `{ css }` / `{ name }` are for READING nodes only
  (driving one is flagged by the gate). Repeated nodes: `control('recov.marker', { nth: 4 })`.
- Negative checks: `dse.expectNoWrite(path, action)` waits for write-idle, never sleeps. Never `sleep`; wait
  for a state. No retries: a flake is a bug.
- **Known bugs.** `knownBug('SC-123', '[ID] correct behaviour', fn, { failsWith: /msg/ })` encodes the
  CORRECT behaviour; it passes while `fn` fails and FAILS the moment it passes ("known bug SC-123 appears
  fixed - remove the marker"). Pin today's behaviour of something a ticket has
  ruled will CHANGE (but has not designed yet) as a plain test, with the title suffix
  `[current behaviour — SC-nnn will ...]` (e.g. `SC-nnn will relabel + confirm`, `SC-nnn changes this`): the
  ticket's fixer rewrites it. The retired `[... ruling pending ...]` wording is no longer used.
- Preferences: `before(() => dse.setPrefs({ staminaRecoveryPopover: true }))` + `after(() => dse.setPrefs({}))`.
