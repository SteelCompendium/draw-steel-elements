# Changelog

## 6.0.1

Identical to 5.1.1. This release exists to recover from `6.0.0-rc1`, a release
candidate accidentally published (2026-07-07) as a regular GitHub release:
Obsidian offered it to existing users as an automatic update, and the plugin was
delisted from the community store because `6.0.0-rc1` is not a valid plugin
version. If your install says 6.0.0-rc1, update to 6.0.1 to get back to the
latest stable build. The 6.0.0 version number is retired — the major release
below ships as 7.0.0.

## 7.0.0 (unreleased; previously numbered 6.0.0)

Upgrading from 5.x or 6.0.1? See the [migration guide](docs/migrating-to-7.md)
for what needs action.

- [FIX] **Inner features get real breathing room** (SC-168). A feature nested inside a
  standalone ability/feature card (an `effect.features` sub-feature) rendered flush
  against its parent card's left and right edges with no frame of its own. It now
  wears the same nested-card treatment statblock and featureblock sub-features have
  had since 7.0.0's structural pass — its own rounded plate, proper insets, and the
  action-type spine as the card's left edge. Print is unchanged.
- **A standard menu panel on every card element, and a one-line collapsed form** (SC-169).
  Hover any element that draws a card — statblocks, ability cards, featureblocks, compendium
  references, the whole hero suite, every GM tracker — and a small panel appears at its
  top-right, in the shape of a window's title-bar controls: icon-only, short, and it grows
  leftward as items are added, so the collapse button never moves. It always carries
  collapse/expand, and — when **Show edit button** is on — the edit pencil now lives there
  instead of in the card's corner. Collapsed, an element becomes one line: its type, its name,
  and an expand button ("HERO: Torin Stonefist", "STATBLOCK: Goblin Stinker",
  "STAMINA (31/48)", "ENCOUNTER: Ambush at the Ford (EV 42)", "SKILLS (12 selected)"). A block
  that references a compendium entry shows that entry's real name, not its code. Three
  block keys control it: `collapsed:` (start collapsed), `collapse_default:` (the same
  thing, the older spelling) and `collapsible: false` (no collapse control at all, and no
  panel if that leaves it empty); the **Collapsible by default** and **Start collapsed**
  settings are the fallback when a block says nothing. All three work on a compendium
  reference block too, which has no list of fields to put them in — write them as its first
  lines, above the code. Collapsing something is remembered for
  the session and never edits your note, and the panel never appears in print or in an
  exported PDF — a collapsed element prints in full. On mobile the panel is always visible
  instead of waiting for a hover. The two elements that deliberately don't get one are the
  horizontal rule and the dice roller. See
  [the element menu](docs/common-element-fields.md) for the whole feature.
- **The stamina bar's "Stamina Bar" header is gone** (SC-169). It was a second collapse
  control with its own look, doing what the new panel now does for every element. Notes are
  unaffected: a `collapse_default: true` block still starts collapsed, just as the one-line
  summary instead of a closed header. One thing does change — `collapsible: false` on a
  stamina bar used to be silently ignored, and is honoured now.
- **Statblocks keep their name and stats in view while you scroll** (SC-160). Scroll a
  long statblock and its header no longer disappears out of the top of the pane: once it
  does, a compact bar pins itself there with the creature's name, role, the five primary
  stats and the five characteristics, plus a second line for Movement, With Captain,
  Immunity and Weakness. It is the website's mini-header, ported. Two new settings under
  **Statblock display** control it — **Sticky mini-header** and **↳ Sticky mini-header:
  include secondary stats**, both on by default, matching the website — and neither is
  part of a preset, so picking a look never changes your scrolling. It works wherever a
  statblock scrolls: a note in Reading view, a pop-out window, and a sidebar panel, where
  it reflows to just the name and role because that is all a 300px-wide bar can usefully
  say. It is deliberately absent where scrolling isn't a thing: print, PDF export, print
  preview, and canvas cards — and inside a callout, whose body never scrolls.
- [BUGFIX] **Statblock and feature cards get their missing backgrounds and colour washes
  back** (SC-171). In the app — as opposed to the screenshots — several Steel surfaces were
  painting nothing at all: a statblock's header band lost its background *and* the coloured
  line under it, the same for a feature block's header, the little diamond between a
  statblock's stats and its features lost the ring that separates it from the card, the
  faint tier stripes behind power-roll outcome rows were absent, and an opt-in villain
  action band had no panel behind it. They now render the way they always did in the
  documentation images. Nothing about the design changed and no colour was altered; the
  styling was simply written in a form the app's older rendering engine silently threw away.
- [BUGFIX] **PDF export now prints the print layout, not the screen one** (SC-170).
  Exporting a note to PDF (or printing it) carried the full on-screen card treatment onto
  the page — the gradient plate, its 1px frame and rounded corners, the raised bevel, a
  drop shadow under every card, boxed characteristic cells and small-caps labels — even
  though the print preview showed the plain, ink-economical layout that was supposed to go
  to paper. The two disagreed because only the preview ever turned the screen styling off;
  real printing merely tried to, and lost. Print preview and PDF export are now the same
  rendering, so the preview is a genuine proof of what you will get, and a handout costs
  what it should in ink. Light-mode vaults were hit hardest: PDF export always renders in
  the light scheme, which is exactly the case where the old print rules were most
  outranked. One smaller print bug went with it: buttons, tabs and other control text kept
  the theme's serif when printed instead of the plain sans the preview uses — the printed
  page and the preview now agree on that too.
- [BUGFIX] **"Open in sidebar" stops piling up initiative trackers** (SC-153). Every
  press of an encounter block's "Open in sidebar" button appended another
  `ds-initiative` block to the note AND stacked another copy of it in the sidebar —
  three presses left three trackers and three panels, while the sidebar kept showing
  the first one, so the panel you were looking at went stale as soon as a second
  tracker existed. The button is now idempotent: the first press creates the tracker,
  and every press after that binds to that same block and brings its panel back up
  **without rewriting a single byte of it** — so a fight already in progress keeps its
  round counter, its Stamina, its conditions and any combatants you added at the table.
  The tracker is a snapshot of the encounter as it stood when it was built: if you
  change the encounter afterwards, those edits deliberately do not reach an existing
  tracker, and the way to get a fresh one is to delete the tracker block and press
  again. An encounter recognises its own tracker by a durable id, so a note with two
  encounters still gets one tracker each. Pinning any block that is already pinned is
  now a no-op everywhere in the sidebar, not just for this button.
- [BUGFIX] **Compendium links (`scc.v1:`) no longer prompt-then-do-nothing outside
  Reading view** (SC-135). Clicking one previously worked only where the plugin already
  rewrites it into a real note link — Reading view, and inside rendered element cards.
  Everywhere else (Live Preview, Source mode, popout windows) Obsidian saw an
  unrecognized link scheme, asked to confirm opening it as an external app, and then
  silently did nothing on approval. Clicking now opens the synced note, or the entry's
  page on steelcompendium.io if you haven't synced it (the **Fall back to
  steelcompendium.io links** setting, on by default), or says plainly that the code isn't
  recognized. Ctrl/Cmd-click opens a new tab, Ctrl/Cmd+Alt-click a split,
  Ctrl/Cmd+Alt+Shift-click a new window, and middle-click a new tab — and it all works in
  popout windows too. One deliberate nuance, matching Obsidian's own links: in Live
  Preview a plain click follows the link, but while your cursor is on that line (so the
  raw `[text](scc.v1:...)` is showing) a plain click just moves the cursor and Ctrl/Cmd
  follows it; Source mode always needs Ctrl/Cmd. Backlinks, the graph view and "unlinked
  mentions" still don't know about these links, and there's still no option to sync the
  compendium using wikilinks or plain vault paths — both are documented under
  [Compendium links](docs/compendium-sync.md#compendium-links) and planned for a later
  release.
- [FIX] **The encounter and initiative tracker blocks are properly spaced** (SC-154).
  Both had shipped without the same breathing room every other tracker (negotiation,
  montage, the party sheet) already gets: buttons, headings and rows sat flush against
  the note's own margin with no padding at all. On top of that, the initiative
  tracker's "Reset turns (this round)" / "Advance round" buttons wrapped their own
  text across two to four cramped lines regardless of how wide the note was, because
  the Malice panel that holds them was capped narrower than either button's label
  ever fit — while the same row had hundreds of pixels of empty space to its left.
  Both are fixed: the tracker roots now carry the same padding their sibling trackers
  do, the round-control buttons keep their label on one line and wrap as whole
  buttons (never mid-word) if the width genuinely doesn't allow it, the turn
  indicator no longer sits glued to the row beside it, the Malice quick-add
  "Amount"/label boxes are wide enough for their own placeholder text, and the
  encounter roster table scrolls horizontally instead of silently losing its Count
  and EV columns at sidebar width. The round and Malice controls also moved out of
  the "Enemy groups" heading's right edge — where they left the whole left half of
  that band empty — into a single **command bar** between the heroes and the
  enemies: round counter and its two controls at the left, Malice pool and
  quick-add at the right, and the Malice log folded into a "Malice log · N
  entries" disclosure that opens a full-width drawer (and always prints open, so a
  handout shows the log). In a narrow pane the bar stacks into one column.
- [FIX] **Initiative tracker rows show a proper placeholder instead of a broken-image
  icon** (SC-162). A hero or creature with no `image:` set, or one whose image can't
  actually be loaded, used to leave the browser's own broken-image glyph in the
  portrait slot. It now shows a themed shield (heroes) or skull (enemies) glyph
  instead — two different shapes, not two colors, so it reads clearly regardless of
  color vision.
- **The character-sheet elements are forged cards now, like everything else**
  (SC-152). The trackers and the reference cards have had the Steel plate — the
  forged gradient ground, hairline edge, rounded corner and soft bevel — since the
  look shipped, but the pieces you actually build a character sheet from did not:
  Characteristics, Values row, Heroic resource, Surges, Hero tokens and
  Conditions all rendered as bare text on the page, so a sheet made of them read as
  an undifferentiated run of lines with the odd styled block (a Counter) floating in
  it. All six now carry the same plate, so a sheet reads as a set of matching
  panels. The characteristics element goes one further: it renders the statblock's
  own characteristics rail — same code, same CSS, same signed values, following the
  same two Characteristics display settings — because they are exactly the same
  five numbers (the hero sheet's Characteristics region does too). `ds-skills` is
  deliberately left bare for now: it needs a real overhaul, not a frame (tracked
  separately). The plate is written as a
  screen treatment; a real Ctrl-P / Export-to-PDF currently carries it through
  anyway, along with the other Steel surfaces, and getting print back to a plain,
  ink-cheap rendering is tracked separately as SC-170.
- **Heroic resource and Surges get the padding and the bold label they were always
  meant to have** (SC-152). Their styling was keyed to a descendant of the element,
  but the class lands on the element itself, so the whole block — the inset that
  keeps the content off the edge, and the bold "Ferocity" / "Surges" label — had
  never applied to either panel. Both now match Hero tokens, which had the same
  styling and always did apply it. (Two print/PDF exports of those two panels change
  as a result: they gain the same small inset and bold label their sibling already
  had on paper.)
- The Hero sheet, the Stamina bar and the roll card were already styled and keep the
  framing they had.
- **Statblocks now look like the website out of the box** (SC-123). Two display
  settings shipped on the plugin's own historical look rather than the site's, and
  they were the last two that differed. **Characteristics** now default to the
  website's stacked presentation — the number on top, the name beneath it — instead
  of a single "Might +2" line; and **Villain actions** now default to the website's
  collapsible "Villain Actions" band below the rest of the features, instead of being
  listed inline among them. Everything else already matched. Both settings still offer
  the old presentation — Characteristics → "One line", Villain actions → "Inline with
  other features" — and the "Steel card" preset now writes exactly these defaults, so a
  fresh install shows "Steel card" rather than "Custom". This changes how existing
  statblocks render, which is why it lands before 7.0.0 ships rather than after.
- [BUGFIX] **Snapshots no longer paste a duplicate you can't edit** (SC-165). **Insert
  Draw Steel: compendium block (snapshot)** copied the entry's `metadata:` block into
  your note alongside its content — for an ability that block repeated most of the entry
  a second time: its name, its effects, its flavor text, its action type. The card was
  always built from the real fields, so changing a value under `metadata:` did nothing
  and the dead copy quietly contradicted the live one. Snapshots now leave that block
  out, which for an ability roughly halves what gets pasted. Synced compendium files are
  unchanged; this is only about what lands in your note.
- [BUGFIX] **The compendium search modal is readable again** (SC-159). Every result
  ran its name, type and source together into one unbroken string — a goblin listed
  itself as "Goblin Stinkerstatblockmcdm.monsters.v1". The row now has a real layout:
  the entry's name on its own line in bold, its type and source as two small muted
  chips at the right, and the full compendium code underneath in a monospace face.
  This is the first modal the Getting started tutorial sends you to, so it was also
  the first thing a new user saw; the tutorial screenshot is regenerated.
- **The documentation has tutorials** (SC-142). Six new guides sit on top of the
  reference pages: **Getting started** (install → sync → your first element → your
  first fight, assuming no YAML or markdown knowledge), **Run an encounter**,
  **Track your hero**, **Customize a monster** (the homebrew loop — snapshot an
  entry, then make it yours), **Style your statblocks**, and **Advanced usage**
  (per-block appearance overrides, reference vs. snapshot semantics, the sidebar,
  canvas, print/PDF behaviour, rolling). Every visual step carries a screenshot
  generated from the real plugin by the pipeline below, including Obsidian's own
  command palette and compendium search.
- [FIX] **Pinning a `ds-scc` block to the sidebar no longer breaks it** (SC-158).
  "Send block to sidebar" marks a block so the panel can find it again after you
  edit the note around it, and it did that by writing a hidden `_dse_anchor:` line
  into the block. For every other element that line is invisible — but a `ds-scc`
  block's content is exactly one compendium code, so the extra line turned the
  block into an error message ("its body must be a single SCC code"), and it
  stayed broken after the sidebar was closed, because the line had been saved into
  your note. Blocks whose content has an exact format are no longer written to at
  all: pinning one now leaves the note **byte-for-byte unchanged** and the sidebar
  finds the block by its content instead. Pinning, restoring after a restart, and
  surviving edits elsewhere in the note all still work. If you have a note with a
  stray `_dse_anchor:` line inside a `ds-scc` block from an earlier build, delete
  that line and the block renders again.
- [INTERNAL] **Every screenshot in the README and the docs is now generated by one
  command** (SC-142). `npm run docs-shots` regenerates all 34 of them from the real
  plugin, driven by a single manifest (`visual-harness/docs-manifest.mjs`): element
  cards through the existing browser harness, and the surfaces only the app has —
  the settings pages, the four modals, a real canvas, a real sidebar leaf — through
  the Obsidian camera. The camera runs on an **Xvfb virtual display** it starts and
  stops itself, so the run is fully headless: it never touches the developer's own
  display and does not care whether Obsidian is already open. Before this, every
  docs image was a hand-taken screenshot, and by 7.0.0 all but one of them predated
  the Steel rendering work and showed a plugin that no longer existed. Two images
  (the animated GIFs) still need a human with a screen recorder; the runner names
  them, and any Media file the manifest doesn't declare, at the end of every run.

- [FEATURE] **One block renders any compendium entry: `ds-scc`** (SC-149). Sync
  the compendium, then write a fenced `ds-scc` block whose body is an entry's SCC
  code (`mcdm.heroes.v1/kit/panther`) and the plugin renders that entry — a kit, a
  condition, a rule, a statblock, whatever the code points at. The body is a code
  and nothing else; anything else renders a short message saying so. Nothing is
  copied into your note, so the block always shows the currently synced version,
  and a code your vault doesn't have offers a link to steelcompendium.io instead.
  **Insert Draw Steel: compendium reference** (command palette) searches the
  compendium and writes the block for you. What the rendered card looks like is
  deliberately not a specified format — it changes as the plugin develops; the
  code you write is the stable part.
- [FEATURE] **Your links to compendium notes survive the 7.0.0 reorganisation**
  (SC-125). The new compendium source renames every file —
  `Rules/Careers/Disciple.md` becomes `career/disciple.md`, and so on for about
  two thousand of them — which would have left every `[[wikilink]]` you ever
  wrote into the compendium pointing at nothing. Instead, the first sync after
  you update offers to **move** your existing compendium files to their new
  paths, using Obsidian's own move operation, so **Obsidian rewrites the links
  in your notes itself**. The plugin never opens, parses or edits a note you
  wrote. You see the whole plan before anything happens — how many files move,
  which ones differ from the last legacy release, which ones have no new
  counterpart — and it is abortable mid-run, re-runnable from the command
  **Migrate compendium from the pre-7.0.0 layout**, and incapable of deleting
  anything: the only change it ever makes is a move, and it refuses to move onto
  a path that is already occupied. Files it has no mapping for (folder index
  pages, whole-book pages, your own notes) stay exactly where they are; every
  one of them is enumerated with a reason in
  [the migration map's review report](docs/compendium-migration-map.md). The
  prompt cannot fire on a fresh install — it needs an existing folder with at
  least twenty files at exact pre-7.0.0 compendium paths. Declining leaves the
  compendium alone and does **not** sync: syncing creates the new files and makes
  the move impossible afterwards, so that is its own explicitly labelled choice,
  and you are asked again next time. An interrupted run is safe to resume: each move
  is recorded before it is made, so even force-quitting Obsidian mid-run leaves
  nothing stranded and the next sync offers to finish rather than quietly carrying on
  without you. Afterwards
  the migration writes a report note into your vault naming every file it flagged,
  skipped or left alone. One consequence worth knowing: a compendium file you had
  edited in place is moved like any other and then updated by the next sync, so
  copy your own words out of the flagged files first — the dialog and the report
  note list them for exactly that reason — and, before anything moves, **every file
  that does not match the release it came from is copied into a
  `<your compendium> backup (pre-7.0.0)` folder beside your compendium**, so the
  version you wrote is always recoverable. That folder is yours: nothing reads it,
  rewrites it or deletes it, and a file that could not be copied is not moved at all.

- [BREAKING] **Obsidian 1.13.0 or newer is now required** (`minAppVersion`
  moves from 0.15.0). Obsidian 1.13 introduced the settings API this release
  rebuilds the settings tab on, and there is no way to use it and still run on
  older clients without maintaining two settings implementations forever. If you
  are on an older Obsidian, the plugin keeps working at your current version —
  `versions.json` pins pre-1.13 clients to 6.0.1, the last build that runs
  there, so Obsidian will not offer you 7.0.0 until you upgrade the app.
  Obsidian updates itself by default, so most installs already qualify (SC-131).
- [FEATURE] **The Stamina cluster is redesigned from scratch for the Steel theme**
  (SC-132) — the bar, temporary Stamina, Recoveries, the Winded/Dying states and
  Catch Breath, everywhere they render. It was the last element family with no
  Steel treatment at all, so it still showed the old flat green/yellow/red fill
  and a blue temp strip. It is now one instrument: a crest whose silhouette
  carries the state (shield → alert shield → skull) and whose glyph breathes when
  you are Winded and falters when you are Dying, the current Stamina in large
  numerals with a temporary-Stamina chip beside it, and a forged gauge underneath.
  The gauge reads honestly where the old bar did not: **zero is a marked bulkhead**,
  Stamina pours rightward from it, and the negative range the rules give a hero
  fills leftward only once you are in it — so green and red never occupy the same
  stretch of bar. **Temporary Stamina is a real segment** bolted on past the pour,
  sharing its origin and scale, with your true maximum keeping its own mark. Every
  state is said at least three ways — frame colour, crest silhouette, the word, and
  the colour of the numeral — so none of it depends on telling two colours apart.
  In a sidebar-width pane the whole cluster collapses to a two-line rail.
- [FEATURE] **Recoveries are editable by clicking a marker** (SC-132). Clicking
  the last available marker spends exactly one, clicking the first spent one
  restores exactly one, and any distance is a single click — Draw Steel takes
  Recoveries away in multiples ("the target loses 1d3 Recoveries"), so a
  one-at-a-time toggle was the wrong control. The row is a keyboard control too
  (arrow keys, Home/End). **Every change offers an Undo** in the notice that
  follows, so a misclick costs one click to put back rather than being punished up
  front with a confirmation dialog. If you would rather not edit by clicking,
  Settings → Element defaults → Advanced → "Edit Recoveries with a popover" turns
  each marker click — and each arrow key — into a small − / + popover instead, so no
  single stray input can change the count.
- [FEATURE] **The hero sheet's Stamina can be edited from the sheet itself**
  (SC-132). The sheet used to carry a `− 31 +` counter row under the bar, which
  duplicated the bar's own readout and existed only because the bar itself was
  read-only there. The row is gone; the bar now opens the same Stamina editor the
  standalone `ds-stamina` block does, and the Recovery markers underneath it are
  live.
- [FIX] **The kit card's band headers ("Equipment", "Kit Bonuses", "Signature
  Ability") are no longer tiny** (SC-143). The Steel rule ported the site's
  `.8rem` band-head size as a bare `0.8em`, skipping the 20px-site-root vs.
  16px-plugin-root conversion every other font-size port in the theme applies —
  so the heads rendered at 12.8px, visibly smaller than the tile values beside
  them and the "Martial Kit" kicker above them. Now 1em (16px), matching the
  nested ability card's own section heads.
- [FIX] **The compendium sync status updates as soon as a sync finishes**
  (SC-140). Syncing from the settings window left the line above the Sync
  button still reading "No compendium synced yet." — the release tag, file
  count and date only appeared if you closed the settings window and opened it
  again. The line now follows the sync live, whether you started it from the
  settings button, the command palette or the first-run prompt.
- [FIX] **The hero sheet you insert starts with two real abilities** (SC-156). The
  starter block behind `/ds` -> Hero sheet and "Insert Draw Steel: Hero sheet"
  listed two ability codes that were never valid — `.../brute-strike` and
  `.../into-the-fray`, with a literal `...` where the type belongs — so every hero
  sheet anyone inserted began with two permanently broken ability rows. (It is also
  where the SC-141 report's broken input came from.) They are now two real Fury
  level-1 abilities, a signature and a heroic one: **Brutal Slam** and **Thunder
  Roar**. A test now resolves every code the example ships against the real corpus,
  so a placeholder cannot get back in.
- [INTERNAL] Both reported failures of the compendium insert commands are pinned by
  regression tests over the real corpus bytes (SC-147, SC-148). Neither needed a
  code change: "Insert compendium reference" writing a `ds-rule` fence that then
  refused to render, and "Insert compendium block (snapshot)" dumping a whole
  `ds-feature` block nested inside a `ds-rule` one, were both consequences of no
  adapter claiming the `ability` type, which SC-141 fixed — and SC-149 independently
  removed the `ds-rule` fallback the fence came from. The tests drive both commands
  end to end for the exact entry from the reports.
- [FIX] **Abilities referenced by their compendium code now render** (SC-141).
  Listing an ability in a `ds-hero` sheet by its code — say
  `scc.v1:mcdm.heroes.v1/feature.ability.shadow.level-1/coat-the-blade` — produced
  the error *"Coat the Blade" found but is not an ability entry*, even though the
  file was right there in your synced compendium. The plugin was looking for
  compendium files labelled `feature`, but every one of the roughly 700 ability
  and trait files is labelled `ability` or `trait`, so none of them could be read:
  no ability in the book could be referenced by code, in a hero sheet or in a
  `ds-feature` block. They all work now, including by name (`Coat the Blade`).
  Alongside it, two smaller repairs to how a bad entry is reported: a code that
  genuinely cannot be found now says so plainly and names both possible causes
  (an un-synced compendium **or** a wrong code) instead of only blaming the sync,
  and a broken entry can only ever cost its own row — the rest of the ability
  list, and the rest of the sheet, keep working around it. Looking an ability up
  **by name** now prefers the real ability over the stub the compendium also
  carries under the class-progression code — before, the name quietly found the
  stub, which is a one-line pointer with none of the ability on it. Where a name
  genuinely belongs to two different entries (*Hit and Run* is both a Fury
  ability and a beastheart companion feature), you are still asked to paste the
  full code, because picking one would be a guess.
- [FIX] **Dynamic Terrain entries render too, and so do every book's feature
  blocks** (SC-141). Two more sides of the same problem, found while fixing the
  one above. Dynamic Terrain — pillars, pressure plates, siege engines, the 35
  entries in *Monsters* — was labelled in a way no part of the plugin recognised,
  so referencing one by code claimed the file was unreadable and told you to
  re-sync a compendium that was perfectly healthy. Underneath that sat a second
  fault that had nothing to do with labels: **no feature block from any book
  could be read at all** — all 152 of them — because the plugin's own examples
  spell out a field for each entry that the real books leave implicit, so the
  reader crashed on the first entry of every real file and nothing ever caught
  it. Both are fixed; real feature blocks and Dynamic Terrain now render from a
  code like anything else.
- [FIX] **The Stamina editor's preview bar shows temporary Stamina** (SC-133).
  Damage consumes temporary Stamina first, so the most common edit in the modal
  moved a number the preview could not draw at all — pressing Damage looked like
  nothing had happened. The preview now uses the same gauge the bar does, and a
  pending change is ghosted onto it so you can see what Apply will do before you
  press it. The Minion Stamina Pool modal gets the same instrument.
- [FIX] **The hero sheet's grid panels no longer stretch to their tallest
  neighbour** (SC-107). Characteristics/Conditions/Skills (and any other sparse
  region sharing a row with a fuller one, e.g. Stamina) used to inherit CSS
  grid's default row-stretch behaviour, so a two-line panel's border box grew
  to match a much taller neighbour and showed a slab of empty space below its
  own content. Steel now sizes each region to its own content
  (`align-items: start` on `.dse-hero__grid`, Steel-scoped) — the leftover
  height becomes gap between rows instead of dead air inside a panel.
- [FIX] **Statblock display settings brought back in line with the v2 site**
  (SC-146). An audit against the live site found the shipped settings had
  drifted:
  - **"Secondary stats" was restyling the wrong block.** Its `ledger` mode
    turned the primary Size/Speed/Stamina/Stability/Free Strike row into a
    ledger; the site's equivalent setting only ever touches the secondary
    Immunity/Weakness/Movement/With Captain block. The CSS now targets the
    right block, matching the site.
  - **The `ledger` mode didn't look like a ledger under Steel** — the theme
    boxed the cell unconditionally, so you got a boxed panel with a doubled
    bottom edge instead of a hairline row. Fixed with a Steel-scoped reset.
  - **Added the missing third mode, "Grid (centered)"** — a framed cell with
    the value over the label, centred — so Secondary stats offers the same
    three modes as the site.
  - **The Sourcebook preset now matches the site's**: it sets Feature style to
    Flat (was Cards).
  - **The Index card preset no longer turns on multi-column layout** — the
    site treats that as a separate toggle, off in every preset. Its Density:
    Compact stays, as a deliberate plugin-only enhancement with no site
    counterpart. It also now sets Secondary stats to Grid (centered),
    matching the site's own Index preset.
  - **"Flat" feature style now draws a ◆ separator between features**,
    matching the site — flat with no separator between entries read as an
    unstructured run of text. The separator is the site's full stylized rule:
    a diamond riding two centre-out fading lines with a seed dot to each side,
    the same ornament a bare `---` already draws, and centred in its own gap.
    Featureblocks in "Flat list" draw the identical separator.
  - **The header's diamond no longer touches the stat row beneath it.** The
    diamond sits on the header's bottom edge and its halo reached about 1px
    into the Stamina cell's border on screen, and about 5px on paper. The stat
    row now carries the site's own top inset and the header keeps its bottom
    margin when printing, which is where the site gets the same clearance.
  - **"Side-by-side (wide)" feature columns now pack like the site's**, using
    CSS `columns` instead of a row-aligned grid, so a short card no longer
    leaves a ragged empty gap under it.
- [FEATURE] **Seven more of the website's display settings work in the plugin**
  (SC-123). The website lets you re-lay-out a statblock in ways the plugin
  never offered; these are those controls, with the same options and the same
  names. Under **Statblock display → Advanced**: *Keyword display* (the keyword
  and action-type band as chips, as an inline text line, as framed cells or as
  a hairline ledger), *Distance + target* (the same three treatments for the
  distance/target rail), *Characteristics* (the familiar one-line "Might +2",
  or the number stacked over the word), *Boxed first letter* (a small framed
  M / A / R / I / P beside each characteristic, with or without the spelled-out
  word), and *Villain actions* (listed among the other features, as now, or
  collected into one collapsible **Villain Actions** band below them — the band
  is always open in print and export). A new **Featureblock display** page adds
  *Feature style* (cards or a flat list, matching the statblock's own right
  down to the ◆ separator between entries) and *Stat line* (the loose
  Stamina/Size/EV header as today's two-per-row pairing or as full-width rows
  with the value right-aligned) — and the settings preview on that page shows a
  featureblock, not a statblock, so you can see what you are changing.
  **Nothing changes unless you change it:** every new setting ships on the
  value that reproduces exactly what the plugin renders today. Whichever you
  pick carries into print and export, and renders under both the Steel theme
  and the ambient one. The three that change a card's structure rather than
  just its styling — Characteristics, Boxed first letter and Villain actions —
  are global settings only: a block that names one in its own `prefs:` map gets
  a console warning and renders normally, instead of pairing one block's
  structure with another's layout. The three statblock presets now write all
  nine settings rather than four, so Sourcebook and Index card carry the
  website's full look for their name; Steel card stays the plugin's default
  state, so a fresh install still reads "Steel card" rather than "Custom".
- [FEATURE] The settings tab is rebuilt as native Obsidian settings, and is
  **searchable from Obsidian's own settings search** (SC-131). It was one
  6850px scroll page — nine stacked sections and a full statblock preview — and
  the queued display-parity settings would have pushed it past 8000. It is now
  a short index of ten navigable pages (Appearance, Typography, Statblock
  display, Featureblock display, Element defaults, Rolling, Authoring,
  Compendium, Links, Initiative tracker), each holding only its own settings —
  nine at the rebuild, plus the Featureblock display page the display-parity
  ports (SC-123) add. Because the settings are now
  declared rather than hand-drawn, Obsidian indexes every one of them: typing
  "font" or "density" into the search box at the top of the settings window
  finds Draw Steel Elements rows alongside Obsidian's own, from any tab, and
  jumps straight to them. Three things come along with it: the live statblock
  preview now **stays docked at the bottom of the page while you scroll**, so
  you can see a setting take effect without scrolling back and forth; the
  compendium destination folder and the initiative tracker's default image path
  gained real folder/file pickers instead of free-text boxes; and Typography's
  secondary font slots moved from a collapsed "Advanced" disclosure onto an
  Advanced sub-page, where search can still reach them individually. Every
  setting, its default, and its live-apply behaviour is unchanged.
- [BUGFIX] The encounter builder's "Create initiative tracker block" produces a
  tracker that renders again. The builder writes compendium references as SCC
  codes (`scc.v1:...`), but the tracker's reference resolver only understood
  vault file paths, so every builder-generated tracker died to an error card the
  moment it rendered. The tracker now resolves SCC codes through the compendium
  reference system; hand-written file-path references are untouched, and
  encounters you generated before the fix start working with no edits (SC-134).
- [BUGFIX] The stamina edit modal's math no longer runs backwards or overspends
  (SC-133). Three fixes: a negative number typed into the Apply box inverted the
  operation ("Damage -3" *granted* 3 temp stamina and saved it) — amounts are
  now magnitudes; Spend Recovery near full stamina burned Recoveries for a
  capped gain while the preview promised the full amount — the preview now
  shows the real gain, a press that would heal nothing is a visibly disabled
  button with the reason, and a Recovery is never consumed for zero gain; and
  granting temp stamina now follows the book's take-higher rule instead of
  stacking, correctly tracking temp already spent absorbing damage in the same
  session. (How temp stamina is *drawn* — in the bar and the modal preview —
  is the SC-132 redesign's job and unchanged here.)
- [BUGFIX] Crest glyphs sit on the shield's optical center (SC-130). The icons
  in every crest — statblock heads, kit heads, ability cards, the villain skull —
  sat at the shield's geometric center, visibly sunk toward the point; they now
  carry a measured optical nudge (matching the same fix on steelcompendium.io)
  that also holds at every text-size setting.
- [BREAKING] Compendium source moved from the retired `data-md-dse` repo to
  `data-unified` releases (unified Browse layout, `md-dse` format). Run
  "Sync compendium" after updating — your old release-tag setting is reset
  because old tags belong to the retired repo.
- [BREAKING] Statblock YAML follows SDK 3.x: `roles:` is now `role:` +
  `organization:`, and `ancestry:` is now `keywords:`. Legacy keys in your own
  `ds-sb`/`ds-statblock` blocks keep working for the 7.x cycle — classified the
  same way the SDK's own reader does (last entry matching a known organization
  name wins that axis, everything else becomes the role) — with a console
  deprecation warning; support is removed in 8.0.0.
- Compendium sync is now non-destructive and manifest-driven: only files the
  plugin installed are updated or removed (removals go to the trash, never a
  hard delete), any incoming path that isn't safely inside the destination
  folder is rejected outright, and your own notes inside the compendium folder
  are never touched. The first sync offers — and never forces — moving a
  pre-7.0 compendium folder to the trash.
- New: `scc.v1:` links resolve everywhere — in compendium notes, inside element
  text, and as references (e.g. initiative tracker
  `statblock: scc.v1:mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker`).
  Links resolve to your local compendium first, then optionally to
  steelcompendium.io (toggle in Settings → Links → "Fall back to
  steelcompendium.io links").
- Settings' Compendium section is reworked: destination folder, release (pin a
  tag or leave empty for latest), locale, a synced-status line, and
  Sync/Check-for-updates buttons.
- New commands: "Sync compendium" (the old command id remains as a hidden
  "Sync compendium (legacy alias)" so hotkeys keep working; it will be removed
  in 8.0.0).
- Updates `steel-compendium-sdk` to 3.x.
- New: **compendium reference cards** — every entry in the synced compendium
  renders as a styled card from its SCC code alone, via the new `ds-scc` block
  (see the `ds-scc` entry at the top of this release). Kits, conditions,
  treasures, ancestries, cultures, careers, classes, titles, perks,
  complications, rules, statblocks, features and featureblocks all render, each
  in its own card style — including any nested ability cards embedded in that
  entry's own content. `ds-sb`/`ds-ft`/`ds-fb` additionally accept a
  **reference** in place of inline YAML: write `scc.v1:<code>`, `@<path>` or
  `[[wikilink]]` and the block renders live from your synced compendium.
- New: compendium search + insert — a fuzzy search command
  ("Search compendium") to find and insert a reference to any compendium entry,
  or (for statblocks, features and featureblocks) a full inline copy, without
  leaving the editor.
- New: **Draw Steel sidebar** — pin any tracker (initiative, encounter, montage,
  project, party) to a persistent right-sidebar panel that survives navigating
  between notes, via the new sword icon in the ribbon ("Open Draw Steel
  sidebar") or the "Send block to sidebar" / "Send initiative tracker to
  sidebar" commands. Edits made in the sidebar and edits made in the note stay
  in sync.
- New: **Encounter Builder** (`ds-encounter`) — plan an encounter against your
  synced compendium: add monsters by reference, see live EV/budget/difficulty
  computed from the real statblocks (never inlined stats), then hand off to a
  ready-to-run tracker with one click ("Create tracker block" or "Open in
  sidebar").
- New: **Montage tracker** (`ds-montage`), **Project/Downtime tracker**
  (`ds-project`), and **Party tracker** (`ds-party`) — trackers for Draw
  Steel's other GM subsystems (montage tests, downtime projects, and
  party-level victories/renown/wealth), following the same interactive,
  persisted-block model as the initiative tracker.
- New: the initiative tracker's **Malice panel** is now first-class — a
  keyboard-accessible pool stepper, a round counter with "Reset turns (this
  round)" vs. "Advance round" (advancing can apply a configured per-round
  Malice gain), a spend/gain log, and a labeled quick-add for trigger-based
  gains (e.g. "+3 Feytouched").
- New: heroes and creatures in the initiative tracker get a per-turn action
  checklist (Main / Maneuver / Move / Triggered).
- New: **Hero suite** — a flagship **hero sheet** (`ds-hero`) composing
  characteristics, stamina (with recoveries and a winded/dying badge), heroic
  resource, surges, conditions, skills, and abilities (with click-to-expand
  ability cards and dice rolling) over one persisted block; your authored
  definition (name, class, ancestry, kit, abilities, …) stays byte-stable —
  only the small play-state churns as you use the sheet. Also ships as four
  standalone trackers you can use on their own: **Heroic resource**
  (`ds-resource`, class-aware), **Surge tracker** (`ds-surges`), **Conditions
  strip** (`ds-conditions`), and **Hero Tokens** (`ds-tokens`, a shared
  party-wide pool). The Stamina tracker (`ds-stamina`) gains recoveries and a
  Catch Breath action. The hero sheet works from inline YAML or resolves
  class/ancestry/kit live from your synced compendium; it can also be pinned
  to the Draw Steel sidebar like any other tracker.
- [BUGFIX] Stamina: the bar's winded coloring now matches the rules (winded at
  half Stamina **or below** — it previously flipped one point late), and the
  Stamina modal's "Spend Recovery" button now spends from your tracked
  Recoveries (heals your recovery value, disables with a reason at zero)
  instead of silently healing without spending one.
- [BUGFIX] A freshly-synced compendium file is now immediately resolvable by
  reference blocks (no more transient "found but not renderable — re-sync"
  card right after a sync).
- New: the **Steel look** brings the steelcompendium.io High-Fantasy Steel design
  into Obsidian — forged cards, embossed serif titles, crest badges, role-tinted
  statblock plates. **This replaces the way Draw Steel elements looked in 6.0.1 and
  earlier, and there is no way back to it.** A beta build briefly offered a Theme
  picker in Settings → Appearance with a "Match Obsidian (Legacy)" option; that
  option was broken, and rather than fix a second look nobody on a released version
  ever had, it was removed before 7.0.0 shipped (SC-144). If you had chosen it in a
  beta vault you are moved to Steel automatically on first load — no prompt, nothing
  else in your settings is touched. Print and PDF export are unaffected either way.
  Nothing else about your notes changes: this is presentation only.
- The Steel theme now matches the site's **material treatment**: the metal sheen,
  bevel and hairline on card plates, section heads and the ability cost chip;
  tier-coloured washes on power-roll rows; role/malice gradient header bands on
  statblocks and featureblocks; and the crest accent. A developer-run parity check
  (`npm run parity`) compares 12 selector pairs against computed styles captured
  from the live site, in both the light and dark scheme, and fails if a surface the
  site forges (gradient, bevel, hairline) renders flat in the plugin. Its reach is
  deliberately narrow: it is **not** part of CI, it covers 5 of the 32 element
  families, and it asserts only flat-vs-forged — never exact colour, typography or
  pseudo-element decoration. A jest material contract
  (`test/dom/theme/steelMaterial.test.ts`) pins the same declarations offline and
  *does* run in the normal test suite. Together they catch a wholesale flattening
  like the one this release fixes; they do not prove pixel parity with the site.
- The Steel theme now also matches the site's **typography, spacing and ink** on
  those same card families: body and label text is set in a serif face, opened to
  the site's line-height and card/head/row/band spacing, and given the site's
  cooler ink — so the Steel card families read like the site rather than like
  default Obsidian prose. The parity check was extended to measure these too (it
  now covers type, spacing, ink, letter-spacing and material across the same 12
  selector pairs / ~5 of 32 element families, both schemes), and a second jest
  contract (`test/dom/theme/steelTypography.test.ts`) pins the serif route, the
  open line-height and the roomier card inset offline. Two honest limits: the
  site's licensed slab face can't be bundled, so the plugin uses a free serif
  (Source Serif 4) — a serif, not that exact slab, and only its 600/700 weights
  ship, so body copy reads slightly heavier than the site's; and this covers only
  the shared card families — the plugin-only surfaces and the deferred structural
  rebuilds (the kit stat-tile grid, the featureblock option layout, the feature
  action spine, the statblock notch) are **not** part of it. Bundling the slab as
  a future upgrade would close the face gap.
- The Steel theme's body typography now reaches **every** element family, not just
  the shared card families above: the hero sheet, encounter/negotiation/montage/
  initiative/project/party trackers, and every other plugin-only surface now set
  body and label text in the same serif face, open line-height and cooler ink as
  the card families, so a note reads as one coherent type system instead of a
  serif card sitting next to a sans tracker. The routing moved from a four-family
  allow-list to a single Steel-theme-root selector. (An exclusion keeping numeric
  stepper/counter values in their prior, non-serif rendering was part of this
  change but was later found to have quietly stopped working during the font-slot
  groundwork below; it is now removed deliberately — controls follow the Body
  font, see the typography settings entry below.) The encounter head's
  `EV n / n` chip now takes the exact same serif small-caps treatment as every
  other chip in the kit — a fully uniform chip family, with no numeric-content
  exemption. Its digits render at small-caps cap height, a Source Serif 4 `smcp`
  behavior; this is accepted as the correct, uniform look, and the old sans
  rendering's big-digit emphasis is gone by design.
  `steelTypography.test.ts` gained a contract test
  that locks the shape of the selector itself — every element root, not a named
  list — so a future edit can't quietly narrow the routing back down without
  failing the suite. Same honest limits as above: screen-only (print and PDF export
  are untouched), serif-not-slab, and only the 600/700 weights ship.
- The Steel theme now reaches DSE's modals too — stamina edit / Spend Recovery,
  condition pickers, the form editor, and other modal dialogs now follow the
  active look: they render the forged treatment (title emboss, sunken sections,
  forged footer buttons) instead of unstyled app defaults. (Verified by DOM
  contract tests asserting the
  theme attribute stamps, re-stamps live, and tears down on close — not a
  rendered screenshot, since no frozen harness shot opens a modal.)
- [INTERNAL] Featureblock advancement bands and the sidebar panel now have
  dedicated visual-harness fixtures: the featureblock fixture's frozen renders
  joined the golden-PNG set (98 → 101), while its remaining shots and both new
  sidebar shots are regenerated (unfrozen) goldens verified by eye.
- [INTERNAL] The font system's single `--dse-font-display` token is retired,
  replaced by six semantic slots (title/body/card-body/label/controls/mono),
  each independently themeable. Every consumer was re-pointed to its
  classified slot, intended as a zero-rendering-change migration — which held
  for every frozen render (pixel-identical; freeze and parity gates stayed
  green throughout, though the freeze covers print shots only), but not quite
  for one Steel region: the rename left the stepper/counter sans exclusion
  inoperative (its token chain resolved to nothing at the root), so those
  digits silently began rendering serif under Steel. That accidental state
  matches the ruling later made for the typography settings below — controls
  default to the Body font — so it was kept and made deliberate there, not
  reverted. This is groundwork only: it lays the vocabulary for the
  user-customizable fonts entry below.
- The Steel theme now bundles Source Serif 4's Regular (400) weight, so body
  and label prose render at their true book weight instead of being mapped up
  to the bundled 600 (SemiBold) face for lack of a 400 — closing the "reads
  slightly heavier than the site's" gap called out above. Titles are
  unaffected (they set 600/700 explicitly). Screen-only, same as the rest of
  the Steel typography work: print and PDF export don't reference the family
  and are untouched. Adds ~27KB to the built stylesheet (a 20KB
  woff2, base64-embedded).
- The Steel theme's kit card is rebuilt to the site's composition: a crest
  and small-caps kind eyebrow ("Martial Kit" / "Magic Kit" / "Psionic Kit") over the
  name, a boxed Equipment panel, and Kit Bonuses as the site's fixed two-row stat-tile
  grid (Stamina per Echelon / Speed / Stability / Disengage, then Melee Dmg / Ranged
  Dmg / Melee Dist / Ranged Dist) — an absent bonus renders a "—" dash tile instead of
  dropping the slot, so every kit reads uniformly at a glance. The tiles and the
  Equipment panel sink into the card's dark gradient the way the site's do. The
  signature ability keeps the plugin's full inline ability card (keywords, action chip,
  power-roll tiers, effects — richer than the site's tile).
- New: **Typography settings** — a Typography section in the plugin settings lets
  you choose the fonts and sizes Draw Steel elements render with:
  - **Six font pickers** — Title, Body, and Controls, plus Card body, Label, and
    Monospace behind an "Advanced" fold. Each offers a curated list, a "Custom…"
    free-text entry for any family you know by name, and a "List installed
    fonts" button that fills the dropdown with every font on your machine
    (where the platform supports it; the curated list and Custom entry always
    work regardless). Every picker defaults to **"Default (Obsidian vault
    fonts)"** — exactly the plugin's previous behavior, so you see zero change
    until you pick something. The advanced slots' defaults follow the primary
    ones (Card body and Controls track Body; Label tracks Title).
  - **Two size sliders** — Text size (60%–140%) and Card size (80%–120%), in 5%
    steps: the same ranges, steps, and snap behavior as steelcompendium.io's own
    site settings. Text size scales the type inside elements; Card size zooms
    whole statblock/ability cards. Print and export always render at 100%.
  - Font and size choices apply everywhere, including print and PDF export. At
    the defaults nothing moves — verified byte-for-byte against the frozen
    screenshot set.
  - One deliberate rendering decision under Steel, made while wiring the
    Controls slot: interactive controls (steppers, buttons, tabs) **default to
    the Body font** — serif under Steel. Stepper/counter digits were already
    rendering serif in practice (the old sans exemption had quietly stopped
    working during the font-slot groundwork above), so this ratifies what
    users already see rather than changing it; there is no new visual change
    at defaults. Print keeps controls in the non-serif rendering, preserving
    print/export output byte-for-byte.
- [STEEL] The crit / Victory-Point gold now uses the site's own crit gold
  (`#e0b050`, from steelcompendium.io's dice styling) instead of a provisional
  placeholder value. The action-type spine hues and the temp-stamina purple
  were reviewed against the canonical color reference and confirmed unchanged —
  this closes out the last provisional Steel color values (SC-106).
- [STEEL] Buttons and steppers are compact. Every `+`/`−` and icon button used
  to render as a 44×44 box around a 16px glyph — a touch-sized target applied
  on desktop, where it read as roughly 3× too big — on counters, the hero
  sheet, heroic resource, surges, hero tokens, rolls, montage, party and
  conditions. Controls now sit at a compact 28px on a mouse/trackpad and switch
  back to the full 44px target on touch devices (Obsidian mobile, tablets), so
  nothing gets harder to tap where tapping is how you use it. Control size also
  follows your text/card size settings now instead of being frozen at one pixel
  figure (SC-121).
- [STEEL] The negotiation card's checkboxes are themed: they were bare
  operating-system squares whose glyph touched the first letter of the label
  ("☐Higher Authority"). They now use the same mark the skills list uses — a
  small rounded box that fills with the accent color when checked — with a
  proper gap to the label. The Interest ladder also tightened up: six rungs of
  one text line each no longer stack into a screen of mostly empty space
  (SC-121).
- [STEEL] Ability and feature cards lay their Keywords / Type / Distance /
  Target block out the way the website does. Keywords and Type were forced into
  the same two-column grid as Distance and Target, which stranded the Keywords
  chip across a wide empty gap from the Type chip and left Distance three times
  wider than Target. They are now two separate bands — the keyword and type
  chips pack together on one line and wrap, and Distance/Target sit as an even
  pair of boxes below — matching the site's ability cards (SC-121).
- [STEEL] Power-roll tier badges (`≤11` / `12-16` / `17+` / `crit`) have room to
  breathe. Their text used to touch the top and bottom of the badge outline,
  leaving the badge a fifth of the height of its own row; they are now larger
  with even padding on all sides, and each badge is centered against its outcome
  text. Row heights are unchanged (SC-121).
- [STEEL] Section panels (Effect / Trigger / Special / Aftermath) line their
  header up with their body text. The header strip sat a few pixels to the right
  of the paragraph beneath it; both now share one left edge (SC-121).
- [BUGFIX] The tier-1 power-roll badge reads `≤11` again instead of `²11`, under
  the Steel theme. The bundled Source Serif 4 has no "less than or equal to"
  glyph, so the character fell through to whatever text font you have configured
  in Obsidian — and many decorative fonts (the harness vault's own Bookinsanity,
  for one) draw a superscript "2" there, turning the tier threshold into a power
  of two. That one character is now drawn in a monospace face, which always has
  it — your configured Obsidian monospace font, with a fixed-font fallback
  stack for the rare case that setting is empty; the digits stay in the card's
  serif. Fixed on screen only — PDF/print export still shows `²11` for now
  (SC-121).
- [BUGFIX] The hero sheet's Stamina card no longer shows a small empty pill
  beside the recovery dots on a healthy character. The winded/dying badge was
  meant to hide itself and never did (SC-121).
- [BUGFIX] A treasure's Project line shows real links again instead of printing
  the link source. The characteristics it lists (Reason, Intuition, …) are
  links in the compendium data, and the row rendered them as literal text —
  `[Reason](scc.v1:mcdm.heroes.v1/rule.character/reason) or [Intuition](…)` —
  brackets, parentheses and address included. Fixed in every theme, including
  PDF/print export (SC-121).
- [BUGFIX] Values that are meant to be monospace finally are. The plugin asked
  for your configured monospace font in a place where the request could never
  be answered, so it silently fell back to whatever face surrounded it: the
  kit card's stat readouts (`+6`, `+0/+0/+4`) rendered in the card serif rather
  than the aligned fixed-width figures they are designed around, and dice
  breakdowns on roll results did the same. Both now use your Obsidian monospace
  font, under both themes (SC-121).
- [BUGFIX] Role-tinted statblock and feature-block header bands, and the
  power-roll tier row tints, now render on Obsidian installs whose bundled
  Electron ships an older Chromium. They were built with a color function that
  only newer Chromium understands, and the whole declaration was discarded
  where it isn't supported — so those installs saw a header band with no tint
  and no bottom edge at all. Same class of failure as the tracker-layout bug
  above, and now guarded by a build test so it cannot come back (SC-121).
- [STEEL] The kit card's Equipment panel is no longer twice as tall as the line
  it holds — invisible paragraph spacing inside the box was doubling its height
  (SC-121).
- [STEEL] Tables written in compendium prose look like tables. The book's inline
  mini-statblocks (a perk's "Familiar Statblock", for example) had no styling at
  all: no borders, no cell padding, no column grouping, so the rows ran together
  into one block of text. They now get a bordered, rounded frame with a header
  band and a hairline under each row, matching the website's tables. Screen
  only for now — PDF/print export still shows the unstyled table (SC-121).
- [STEEL] Those same prose tables now scroll sideways instead of running off the
  edge. A wide book table (the perk's five-column familiar statblock) put its
  last columns outside the card with no way to reach them once the card was
  narrow — in a sidebar, for instance. The table now sits in its own scrolling
  frame, so it stays inside the card and you can swipe/scroll across it. At full
  width nothing changes (SC-121).
- [STEEL] The statblock's Size / Speed / Stamina / Stability / Free Strike row
  has gaps between its tiles again. Steel gives each of those five stats its own
  bordered box, but the row underneath was still the older unboxed layout, which
  spaced the stats optically rather than with a real gap — so the boxes rendered
  edge to edge as one undivided strip. The row now uses the same gap the website
  puts between the same five tiles (SC-121).
- [STEEL] On ability and feature cards, the action type sits at the right end of
  the keyword line, the way the website lays it out. The rebuilt keyword band
  (above) packed the type chip immediately after the keywords instead; it is now
  pushed to the far right of the same line, with the keyword chips still packed
  left and still wrapping (SC-121).
- [STEEL] The heraldic crest shields read correctly in both color schemes. The
  shield's inner face was painted with the hairline/rule color, which by design
  runs opposite the scheme — so the face inverted: under the dark scheme the
  crest came out a pale, near-white shield, and under the light scheme a dark,
  near-black one. Both now use the website's own per-scheme crest face (a dark
  face on dark, a light face on light, with the polished-metal rim carrying the
  contrast), and the crest's un-tinted glyph uses the site's brighter ink grade.
  This moves every crest at once — statblock headers, kit headers, featureblock
  role crests and ability action crests all come from one shield primitive
  (SC-121).
- [BUGFIX] The hero sheet folds to one column in a sidebar. Its two-column
  region grid was supposed to fold to a single column when the sheet gets
  narrow, but the rule was attached to the grid itself — an element can't
  measure itself that way, so the fold never happened at all. It now folds as
  intended; a real 300px sidebar leaf is still tight and can still clip
  Presence (tracked as FOLLOWUPS #48) (SC-121).
- [BUGFIX] The element editor's raw-YAML box has a usable size. Opening "Edit"
  on an element without a form schema showed a two-line text box sitting on top
  of its own label, with the preview below it taking the whole dialog. The box
  is now full-width, ten lines tall, resizable, and in a monospace face
  (SC-121).
- [BUGFIX] Trackers and other interactive elements (initiative, negotiation,
  hero, montage, party, project, encounter) now render correctly on Obsidian
  installs whose bundled Electron ships an older Chromium: the built
  `styles.css` used native CSS nesting, which those older Chromiums silently
  drop, collapsing the affected layouts to plain unstyled stacks (e.g. the
  initiative tracker's compact touch-target buttons, the negotiation ladder's
  badge row). esbuild now flattens all nesting at build time. Be aware this
  had been shipping broken since `styles-source.css` was introduced (~5.1.0):
  the plugin's own visual-harness gates all run on a modern bundled Chromium
  that renders nesting fine and so never saw the breakage — only a real
  Obsidian install did. `npm run obsidian-shots` (spawns the real Obsidian
  binary) now stands as the regression coverage that browser-only gates
  structurally cannot provide for this class of bug.
- [STEEL] Villain actions now render as their own action type instead of
  flush left with no accent at all. A villain action's usage line is always a
  placeholder dash, and the plugin's mapper was treating that placeholder as
  a real value and never looking past it — so every villain action (Shoot!,
  Form Up!, Lead From the Front, and every "Villain Action N" ability in your
  synced compendium) fell through with no colour, no crest, nothing to mark
  it as a villain action at a glance. It now carries its own red accent and a
  skull crest, matching the site. Vault notes synced before 2026-07-16 still
  show villain actions as plain prose (that's how they were written at the
  time) — re-sync your compendium to get the new structured rendering
  (SC-102).
- [STEEL] An ability/feature card's coloured action-type bar no longer runs
  down cards where the site never draws one. The site only puts that bar on
  an option nested inside a statblock or featureblock's feature list — a
  standalone ability page has no such bar, only a tinted crest and label.
  The plugin drew the bar everywhere; it's now confined to nested lists,
  matching the site (SC-102).
- [STEEL] Featureblock and statblock feature lists now render each entry as
  its own bordered, filled card — matching the site — instead of a single
  unbroken accent line down the whole list with padding standing in for
  separation. A malice block's options (or a statblock's abilities) now read
  as visually discrete cards, each with its own rounded accent edge (SC-101).
- [STEEL] A featureblock option's cost now renders as plain large display
  text beside its name, matching the site, instead of a small outlined chip.
  Statblock and standalone ability cards keep the existing forged cost pill
  — the site itself only uses display text inside featureblocks (SC-101).
- [STEEL] The statblock and featureblock's diamond notch now sits where the
  site puts it — straddling the bottom edge of the head band, role-hued —
  instead of appearing as a larger neutral divider further down the card,
  between the characteristics strip and the feature list (SC-103).
- [STEEL] `ds-hr` / `ds-horizontal-rule` now draws the site's ornate divider:
  a small haloed diamond flanked by two seed dots, with hairlines fading
  outward to nothing. Previously it kept the old heavy look — a large solid
  diamond on two thick lines running the full width (SC-128).
- [STEEL] A statblock whose role maps to nothing (a summoner Champion, a
  Noncombatant) keeps its diamond divider between the characteristics strip
  and the feature list. It had been losing the head band, the notch and the
  divider all at once, leaving the two sections butted together with nothing
  separating them (FOLLOWUPS #56).
- [BUGFIX] The "Show edit button on rendered blocks" pencil now renders
  inside the card it edits, for every element — kits, complications, and the
  rest of the compendium-reference cards, plus statblocks, used to render it
  as a stray line floating below/outside the card's border (only
  counter/initiative/trackers/features got it right, because their card
  border happens to sit on the element's outer container instead of a nested
  div). Fixed once, at the framework level, for every element. Also:
  `ds-hr`/`ds-horizontal-rule` no longer shows the pencil at all — a rule has
  no configuration, so there was never anything to edit (SC-145).
- [INTERNAL] Docs are now versioned on gh-pages via
  [mike](https://github.com/jimporter/mike) (SC-164, follow-on to SC-163's
  branch split). `main` pushes deploy the released docs as the `latest`
  alias (root redirects there); `develop` pushes deploy the mainline docs
  under `dev/`, banded with a "development version — unreleased features"
  banner (Material's own `outdated`-block mechanism, `overrides/main.html`)
  so pre-release docs can't be mistaken for current. Both versions live on
  one gh-pages branch with a header version selector
  (`extra.version.provider: mike`). `ci.yml`'s old
  `mkdocs gh-deploy --force` — a full-branch overwrite that would have wiped
  whichever version a given push didn't touch — is retired in favor of
  `mike deploy`. No plugin runtime code changed.
- [INTERNAL] The mike docs deploy actually reaches gh-pages now (SC-164
  follow-up). Every run since the entry above failed at the push with
  `! [rejected] gh-pages -> gh-pages (fetch first)`: `actions/checkout`
  fetches only the pushed ref, so the runner had no `gh-pages` and mike built
  a parentless commit that could never fast-forward. `ci.yml` now fetches the
  `gh-pages` tip (`--depth=1`, explicit refspec) before either deploy step.
  Applies to the `main` → `latest` release deploy as much as the `develop` →
  `dev` one. No plugin runtime code changed.

## 5.1.1

- Corrects issue where double-clicking on an Element in reading mode will open edit mode

## 5.1.0

- Adds support for referencing statblocks within the initiative tracker (see docs for details)

## 5.0.0

- Support for Featureblocks!
- [BREAKING] Statblock CSS changed slightly
  - While this is incredibly minor, it is technically breaking

## 4.1.0

- Corrects an issue with rendering `0` in the values-row element
- Documentation cleanup
- Adds support for a default image in the initiative tracker

## 4.0.0

- [BREAKING] Updates to sdk 2.1.5 (up from v0) to support new schema
  - There are a LOT of changes, please read the [changelog](https://github.com/SteelCompendium/data-sdk-npm/blob/main/CHANGELOG.md)
- Due to changes in the schema, be sure to redownload the compendium 
  - IMPORTANT: this will delete the old compendium!  Be sure none of your homebrew is in that directory!

## 3.4.3

- Correctly supports `ds-negotiation` language

## 3.4.2

- Visual updates to the StaminaBar for the information icon
- Docs updates

## 3.4.1

- Stamina Element Updates
  - Migrated to use Vue
  - Updated visual appearance
  - Updated the modal to be more minimal
  - Temp stamina bar separated

## 3.3.0

- Skill Element updated to support `only_show_selected` to hide unselected skills from the Element
- Begins migrating to Vue
  - Boilerplate implemented
  - Updates Skill Element to use Vue
- New fields for Vue Elements (Currently only Skill Element)
  - `collapsible` (boolean) if `true` allows the Element to collapse
  - `collapse_default` (boolean) if `true` will set the default state of the Element to collapsed when rendered.
  - See the docs for Common Element Fields for details
    
## 3.2.2

- (Quietly) enabling mobile support

## 3.2.1

- Fixes to TestEffect parsing (`data-sdk-npm` `0.0.37`)

## 3.2.0

- Updates to `data-sdk-npm` `0.0.36` to support TestEffects 

## 3.1.0

- Minor updates to the statblock UI

## 3.0.0

- Uses the npm steel-compendium-sdk for parsing
  - Supports latest yaml format for statblocks and abilities

## 2.3.0

- Adds support for Canvas Character Sheets
  - Stamina Bar Element
  - Characteristics Element
  - Counter Element
  - Skills Element
  - Values Row Element

## 2.2.0

- Updates Initiative Element to use `Malice` instead of `VP`
  - Using `villain_power` in the codeblock should still work for now, but it will automatically get rewritten by the element
  - `villain_power` will be removed in `v3`

## 2.1.2

- Compendium Downloader yields to avoid hanging the main thread

## 2.1.1

- [BUGFIX] Correctly displays weaknesses

## 2.1.0

- Adds better error handling on Ability, Negotiation, and Statblock Elements
- Cleanup
- [BUGFIX] Properly handles tiered results in some views

## 2.0.0

- [BREAKING] The Power Roll Element has been replaced by the Ability Element
  - Instead of having a flat structure for the yaml, the `effects` field will list effects, power rolls, etc in an ordered manner
  - As a side effect, the Statblock Element inherits these changes as well
  - For details on the new structure, see the [Ability Documentation](./docs/Abilities.md) 
- Adds ability to [download the Draw Steel Compendium](./docs/compendium-downloader.md)

## 1.6.0

- Adds the statblock element! See the [statblock](./docs/statblock.md) documentation for details!
- Initiative tracker can be triggered with `ds-it` and `ds-initiative-tracker` now

## 1.5.0

- Adds basic support for Negotiation Tracking!

## 1.4.0

- Initiative Tracker
  - Adds basic support for tracking minions!
  - [BUGFIX] Prevents VP text from highlighting when changing
  - [BUGFIX] Allows click-to-remove conditions when blinking

## 1.3.0

- Add ability to reset the encounter

## 1.2.0

- Initiative Tracker
  - Overhauls the condition modal and adds support for customizing the condition appearance 

## 1.1.2

- [BUGFIX] Allow enemies to use recoveries

## 1.1.1

- [BUGFIX] Corrects bugs allowing for non-integer stamina

## 1.1.0

- Adds the Initiative Tracker Element!

## 1.0.2

- Corrects sizing issue on power roll tiers

## 1.0.1

- Cleanup bulleted lists

## 1.0.0

- Adds `horizontal-rule` element
- Adds a ton of new fields to `power-roll` element (See readme)
- [PSEUDO-BREAKING] No longer supports inline-codeblocks for `horizontal-rule`
  - This was unreleased, but for those who built manually...
  - Use a regular multi-line codeblock for functionality
- Adds support for rendering markdown in Power Roll values
- Much more!

## 0.0.6

- Internal cleanup, bugfixes

## 0.0.5

- Avoids innerHTML call for compliance

## 0.0.4

- Prep for inclusion in community plugins

## 0.0.2

- Adds `indent` property to Power Roll Element to support nested lists

## 0.0.1

- Initial release: Power Roll Element basics

