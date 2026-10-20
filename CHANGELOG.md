# Changelog

## 6.0.2

- Replaces the bundled zip library (JSZip -> fflate) used by the compendium download. JSZip's
  legacy-browser polyfills contained dynamic `<script>` element creation, which failed
  Obsidian's community-plugin review. No behavior change.
- Adds missing Crafting/Lore skills: Carpentry, Cooking, Strategy (#81)

## 6.0.1

Identical to 5.1.1. This release exists to recover from `6.0.0-rc1`, a release
candidate accidentally published (2026-07-07) as a regular GitHub release:
Obsidian offered it to existing users as an automatic update, and the plugin was
delisted from the community store because `6.0.0-rc1` is not a valid plugin
version. If your install says 6.0.0-rc1, update to 6.0.1 to get back to the
latest stable build. The 6.0.0 version number is retired — the major release
below ships as 7.0.0.

## 7.0.0 (unreleased; previously numbered 6.0.0)

Upgrading from 5.x or 6.0.x? See the [migration guide](docs/migrating-to-7.md)
for what needs action.

- [FIX] **A block inside a callout or a quote now saves its changes** (SC-455). A Draw Steel block
  nested in `> [!note]`, a plain quote, or a callout inside a callout (each line starting with
  `> `) drew and took clicks but never wrote them back, and said nothing; the change was lost on the
  next redraw. It now saves in Reading view, in Live Preview (callouts) and from the sidebar, keeping
  the `> ` on every line and leaving the rest of the note untouched. A block that still can't be saved
  (one in a list item) now tells you with a notice instead of failing silently; see
  [Blocks inside callouts and quotes](docs/writing-blocks.md#blocks-inside-callouts-and-quotes).
- [FIX] **Notes with Windows (CRLF) line endings work with the sidebar, and saves keep the note's line
  endings.** A block pinned to the sidebar in a CRLF note could not be found, so its changes never saved.
  Saving a block from Reading view or the sidebar, pinning one, and the encounter builder's "Create tracker
  block" no longer leave a CRLF note with mixed line endings: the note's own ending (its majority ending, if
  it already mixed the two) is used for the text DSE writes, and nothing outside the block is touched. Notes
  with Unix (LF) endings are unchanged.
- [FIX] **Stamina editor: the Apply button now says exactly what it will apply, and a few smaller
  fixes** (SC-427). Typing a Stamina value above max (or below the lowest allowed) used to make the
  button promise more than it did: with max 20 and 10 current, typing 30 said "Gain 20 Stamina" but
  only gained 10. The field now snaps to the nearest allowed value as you commit it (30 becomes 20),
  the button says "Gain 10 Stamina" (also while you are still typing), and the + / - buttons stop at
  the limits. A hand-edited Stamina that is already out of range no longer flips the buttons around:
  Damage never heals, Healing never damages, and Kill and Full Heal never say "Gain" / "Lose" the
  wrong way round, and a Damage or Healing that only brings it part of the way back still shows the
  change that really gets saved; applying only a Temp Stamina change no longer quietly rewrites an
  out-of-range Stamina. An exponent in the Apply box such as "1e3" now counts as 1000 (it counted as 1), in the
  initiative minion Stamina window's damage and minion-count boxes too. Reset also puts the Apply
  box back to 0.
- [FIX] **Fixed: the sidebar sometimes lost its encounter ("Backing block not found") right
  after its first save, about 1 time in 33, and the encounter builder's "Open in sidebar"
  sometimes added a second tracker block** (SC-360). The hidden id that ties a sidebar panel to
  its block could be a value like `056948` or `4e8540`, which the first save rewrote into a
  different number, so the panel (or the encounter) could no longer find its own block. New ids
  can no longer take that shape. A note pinned before this fix can still lose its panel once, on
  its first save after you update. Re-linking the panel from the note ("Send to sidebar" again)
  repairs it for good: it reuses the id the save left behind instead of adding a second one. An
  encounter that already carries such an id now reopens the same tracker on every press. If its old tracker was
  already hit by the bug, it may open one more tracker one last time; the old tracker keeps its
  state. If a block has a hand-edited `_dse_anchor` line the sidebar cannot read, it is no
  longer sent to the sidebar (you get a message saying what to fix) instead of getting a
  second, conflicting line.
- [FIX] **A save that changes nothing no longer leaves extra blank scroll space at the bottom
  of the note** (SC-260). When a block wrote back exactly what the note already contained
  (for example re-applying the same value in reading mode), the page held its height for a
  couple of seconds waiting for a redraw that never came. It now only holds the height when
  the note is actually going to change.
- [FIX] **Initiative: the minion Stamina pool window no longer gets stuck all-checked, and no
  longer opens on a stepper button** (SC-429). Lowering the pool to 0 ticks every minion for
  you; raising it again now un-ticks the ones the window ticked (the ones you ticked yourself
  stay) instead of leaving all of them checked with Apply stuck on "Select 4 minion(s)". The
  window opens with the cursor in the Apply box, like the single-creature Stamina window, so
  Space or Enter right after opening no longer lowers the pool. The "minions hit" box now caps
  at the minions still alive (a larger typed number is brought down to it when you press Apply
  Damage), the "0 damage will kill 0 minion(s)" line stays hidden until there is a change
  pending, and "Select 0 minion(s) to kill." no longer appears when no minion is owed.
- [FIX] **Initiative: editing the selected enemy's Stamina from its roster cell now updates the
  detail row too** (SC-426). Double-clicking a creature's cell in the roster and applying a
  new Stamina (or Temp Stamina) used to change the cell and the note but leave the detail row
  above it on the old number, with a full bar and no Winded tag, until the tracker next
  re-rendered. The number, the bar and the Winded/Dead tag now follow the edit at once.
- [FIX] **Hovering a button now shows its explanation, not just its name** (SC-324). The
  hero **Respite** button, the negotiation **Complete Argument** button, the compendium
  migration's **Sync without moving** button, a save-ends condition's **Roll save** button
  and the initiative **Advance round** button (with its Malice gain) each carried hover text
  that was silently thrown away, so the hover repeated the label. Obsidian draws the hover
  from the same text screen readers announce, so each of those buttons now has one full
  label (the name first, then what it does), and screen-reader users hear it too. The
  stamina modal's **Spend Recovery** and the read-only **Catch Breath** button now keep their
  name when they show why they are disabled ("Spend Recovery: No Recoveries remaining").
- [FIX] **Clicking a control no longer strips extra words after the block type on the opening
  fence line** (SC-290). A block opened as ```` ```ds-counter extra ```` used to be rewritten as
  ```` ```ds-counter ```` by the first interactive write, in Reading view and in the sidebar; the
  whole info string is now kept, spacing included.
- [FIX] **Initiative: clicking a hero's portrait now shows the acted frame immediately**
  (SC-423). The 2px light-grey metal frame used to appear only after something else
  re-rendered the tracker (adding a Malice log entry, for example); the seal badge showed at
  once but the frame did not. Un-clicking clears it immediately too. The enemy-group and
  portraits-off turn buttons got the same in-place fix. The initiative docs GIF is
  regenerated.
- [FIX] **Catch Breath no longer spends a Recovery for nothing** (SC-428). At full Stamina (or
  when the recovery value is 0, i.e. a max Stamina of 2 or less) the Catch Breath button used to
  stay enabled, and a click spent a Recovery for +0 Stamina. It is now disabled with a tooltip
  saying why, on the Stamina bar and the hero sheet, and the Recoveries popover's "Catch breath"
  button is disabled in the same cases (and with no Recoveries left, or while Dying) instead of
  doing nothing. The Stamina editor's Spend Recovery now says "Recovery value is 0" rather than
  "Already at maximum Stamina" when the recovery value is the reason.
- [FIX] **Clicking a Recoveries marker keeps the keyboard on the marker row** (SC-428). After a
  click, the arrow keys, Home/End and Escape went nowhere until you Tabbed back to the row, and
  Tab restarted from the page. Focus now stays on the row, also through the save that follows.
  A mouse click draws no focus ring on the row (the keyboard still does), and a keyboard Catch
  Breath that fills Stamina, or the popover's Catch breath pressed with the keyboard, hands
  focus to the row instead of dropping it. A hero whose class is unresolved reads "Max Stamina
  unknown" rather than "Recovery value is 0".
- [FIX] **Stamina editor and minion pool editor: the first click on Apply now applies a typed
  value** (SC-430). Type a new Stamina, Temporary Stamina or minion-pool value and click Apply,
  and if you hit the button's edge the click was swallowed: the field committed, the button's
  label changed ("Lose 3 Stamina"), nothing was saved, and you had to click again. Apply now
  enables and relabels as you type, and clicking it saves the typed value straight away.
- [BREAKING] **The "Sync compendium (legacy alias)" command is removed** (SC-406). It was
  kept through 6.x so a hotkey bound to it would keep working; a hotkey still bound to it
  now does nothing — bind it to **Sync compendium** instead (see the
  [migration guide](docs/migrating-to-7.md#1-re-sync-your-compendium)).
- [FIX] **Beastheart companions (Panther, Drake and the rest) now render when you reference
  them with `ds-scc`** (SC-390). They showed a "has no renderer in this plugin" card; they
  now draw as full statblock cards: "Companion" in the head, a **Skills** line in the stat
  grid, free strike and stamina as written ("1 + M", "= yours"), and their level 1
  abilities. This needs the matching compendium data, so run **Sync compendium** after the
  next compendium update. The docs now also say which kinds of entry `ds-scc` can't draw yet
  (skills, saints, gods, chapters, projects, movement, negotiation, skill groups and
  monster-group lore). Updates `steel-compendium-sdk` to 3.1.0, which carries a companion's
  `skills` and its text `free_strike` ("1 + M") itself.
- [FIX] **A statblock with an empty EV no longer prints a dangling "EV"** (SC-390).
  Companions and the summoner champions have no EV; their cards used to show "EV" with
  nothing after it. The label is now left out. A statblock that omits `ev` entirely still
  reads "EV N/A".
- [FIX] **The Small, Large and Control text size sliders now actually change the text**
  (SC-372). They saved fine but did nothing: moving "Large text size" to 120% left a card name
  at 20px, and the other two sliders were the same. Card names, band titles, ability keyword
  and action chips, display numbers and headings now follow Large text size; labels, captions,
  hints and tallies follow Small text size; buttons, steppers, tabs and collapse headers follow
  Control text size (screen only). Text nested inside other text, such as the power-roll tier
  badges, follows its setting too. They work inside dialogs too, and Small and Large apply in
  print and export as the setting says. Nothing changes at the default 100%.
- [FIX] **Power-roll tier rows are compact again: about 50px for a one-line outcome, the
  same as the site** (SC-378). Every tier row (ability/feature cards, statblock abilities,
  featureblock, a kit's signature ability, negotiation arguments) had grown to
  about 82px, because SC-202's paragraph-spacing reset was also adding a full line of
  space above and below each outcome's text. This was a regression in the 7.0.0 cycle,
  never in a release. Print/export was never affected.
- [FEATURE] **You can now name an initiative tracker** (SC-377). Set `name:` in the block or
  click the title at the top of the tracker to type one (Enter saves, and so does clicking
  anywhere else: elsewhere in the tracker, on another Draw Steel card, on the same tracker in
  another pane, or on the note itself; Escape cancels). It shows above the Heroes and as the name in the collapsed one-line
  form; an untitled tracker shows a small "Untitled encounter" prompt on screen only, and a
  read-only view shows the title as plain text. A name YAML reads as a number or a true/false
  (`name: 1984`) is kept as text rather than breaking the tracker.
- [FIX] **Typing into a field inside a Draw Steel card now works with the mouse** (SC-377). A
  click inside any card was swallowed so Obsidian would not open the block for editing, and
  that also stopped the browser from focusing the field, so the initiative tracker's quick-add
  Amount and Label and the counter's number box could only be reached
  with Tab. A click on a field now focuses it (the block still does not open for editing), and
  a click on anything else - the rest of the card, another Draw Steel card, or the same block in
  another pane - now leaves the field the way a click outside the card does, so a half-typed
  counter value or tracker title is saved.
- [STEEL] **Initiative tracker layout pass** (SC-377). *Reset turns (this round)* and *Reset
  encounter state* moved from buttons inside the card to icon items in the tracker's menu
  panel (hover the tracker). The round label and *Advance round* now sit on the "Heroes"
  heading line. The Malice pool is a standard always-visible stepper (− and + beside a
  "Malice" caption over the number) instead of hover-only arrows. The Malice quick-add
  submits on Enter, says which field is wrong instead of silently doing nothing ("Amount
  required", "Whole numbers only", "Not zero", "Label required"), and its fields are recessed
  with one shared height. Heroes and enemy groups now share one turn mark in both light and
  dark: an empty ring, a struck steel seal once they have acted (the same brightness on both
  sides), and a ghosted seal on hover; the green check on enemy groups is gone. In print, the
  round label now sits on the "Heroes" line, the "Malice: N" line moves from the right to the
  left of the quick-add row (the quick-add inputs re-centre across two rows), and a named
  tracker prints its title; nothing else about printing changes.

- [FIX] **Steel section titles ("Effect"/"Trigger"/"Special"/…) are now 15px with 1.8px
  letter spacing, so their letters match the site's height** (SC-235), because the site
  fakes its small caps. The boxed panel header on ability/feature cards, a statblock's
  nested features, featureblock and a kit's signature ability was 16px with 1.12px
  letter-spacing. The title's line-height and the Text size preference still scale it the
  same way as before.
- [FIX] **Headings (`#` through `######`) inside a card's markdown body — and the initiative
  tracker's group headers — are back to Obsidian's own
  heading sizes, instead of the plain browser default** (SC-318). SC-202 had re-grounded a
  card's own `h1`-`h6` tags to the raw, unstyled browser default so a real vault note and
  the preview harness would agree — but that also meant a `######` heading rendered SMALLER
  than body text (10.7px), and a `###` heading lost most of its top spacing (40px to
  19px) after a paragraph. Screen now restates Obsidian's own scale instead of the
  browser's, matching what print/export and a real Obsidian note already showed the whole
  time — both of those changes are reversed. Print/export is unaffected either way — it already
  looked like this.
- [FIX] **The example inserted for a new `ds-feature` block no longer claims to be a villain
  action while rendering as a main action** (SC-236). The Draw Steel Elements authoring example
  for a new feature block carried a stray `ability_type: Villain Action 1` line alongside
  `usage: Main action`; a real usage line always wins, so the card correctly rendered as a main
  action, but its header still showed a "VILLAIN ACTION 1" chip that contradicted it. That line
  is now removed — the example matches the shape of a real Malice-cost main action.
- [FIX] **Rule cards referenced from the compendium now show their rule group above the
  name, instead of always "Rule"** (SC-272). A `ds-rule` reference resolved by compendium
  code (or a `ds-scc` reference that resolves to one) used to print the literal "Rule" as
  its eyebrow for every single rule, because the group — Combat, Dice, Monster, and so on —
  only ever lived in the entry's own compendium code, not in anything the card previously
  read. The eyebrow now shows that real group instead. A rule referenced inline, with no
  resolvable compendium code, still reads "Rule", as before.
- [FIX] **The Text size preference now scales dialog content too, not just Draw Steel
  elements in your notes** (SC-230). Conditions, stamina, montage and other Draw Steel
  dialogs used to ignore the Text size slider entirely — only the Card size slider reached
  them — so a reader who bumped Text size up for note content still got the dialog's
  default size. Dialog body text, buttons, and the dialog's own title now scale with Text
  size exactly like a Draw Steel element in a note does; the default 100% looks identical
  to before.
- [FIX] **The skills element's own "Skill List" disclosure header is gone** (SC-255). It was
  a second, independent whole-element collapse stacked underneath the standard element menu's
  collapse control — the `ds-stamina` double affordance SC-169 round 2 already removed,
  applied here too. Existing blocks are unaffected: `collapse_default: true` still starts
  the element collapsed and `collapsible: false` still removes the collapse control (both
  keys were already read by the menu before this change, so neither behavior moves) — but a
  block that starts collapsed now opens with one click on the element menu instead of two,
  since the redundant second header no longer hides the list behind its own closed state.
  Per-group collapse (Crafting, Exploration, ...) is untouched.
- [FIX] **An ability card's Keywords now draw as one chip per keyword, matching the
  website, instead of one chip holding the whole comma-separated list** (SC-231). Affects
  every ability-card surface — standalone `ds-feature` cards, and the ability cards embedded
  in statblocks and featureblocks — at the default "Chips" keyword display setting. The
  "Inline text"/"Grid"/"Ledger" keyword display settings look the same as before. Printed
  output moves by a sub-pixel amount at the Keywords line (glyph shaping shifts slightly
  wherever the text is now split into one chip per keyword) — everything you can read is
  unchanged; nothing shifts by a visible amount.
- [FIX] **Card headers (ability, statblock, featureblock, montage, and every other card with
  a right-rail chip) now have a narrow form** (SC-284). At a narrow width (~300px) the
  header's NAME used to wrap a word (often a letter) per line while the right-rail chips kept
  their own width and squeezed it — not the other way around. The right rail now stacks below
  the name at narrow widths instead — matching the site — with nothing hidden.
- [FIX] **The compendium download's zip library is now `fflate`, not JSZip** (SC-328). JSZip's
  legacy-browser polyfills contained dynamic `<script>` element creation, which Obsidian's
  community-plugin review rejects; 7.0.0 also carries forward 6.0.2's three added
  Crafting/Lore skills (Carpentry, Cooking, Strategy). No user-facing behavior change beyond
  those skills.
- [FIX] **The Settings Sync and Check-for-updates buttons now show when a compendium
  operation is running, instead of staying clickable through the whole run** (SC-243).
  Previously a double-click, the command palette, or the migration modal's "sync anyway"/
  "sync after migrating" choices could start a second sync underneath one already in
  progress. Both buttons now disable the moment either one is clicked — Sync reads
  "Syncing…", Check for updates reads "Checking…" — and re-enable live if the settings
  window is left open through the run. A second request from any entry point while one is
  already in flight is refused with a notice instead of starting.
- [INTERNAL] A block's save now finds the block by its content when its position in the note has
  moved, instead of trusting a possibly stale line range, so a save can no longer land in the wrong
  place or cut a block short (SC-343). A click followed at once by switching notes now still saves
  (SC-336). If a save cannot be placed because the block changed on disk first (sync or a hand edit
  inside the save delay), it is dropped and a notice says so: "Draw Steel Elements: a change to a
  block in <note> was not saved — the block changed on disk first." Reading-mode blocks now keep
  their live view across their own saves (SC-340): open dialogs, focus and typed text survive a
  write. A hidden kill switch restores the pre-SC-340 behavior if needed: setting
  `"viewAdoption": false` in the plugin's `data.json` and reloading Obsidian turns view
  adoption off again (not exposed in the Settings UI).
- [FIX] **Initiative tracker: an unsynced compendium creature no longer asks about
  duplicate files, and the console no longer logs a warning for every creature without a
  portrait** (SC-240). A statblock reference to a compendium code
  (`scc.v1:…`) that fails to resolve used to wrap the real reason ("…is not
  available in this vault. Sync the compendium…") in a stock "Are there multiple instances
  of the '<ref>' file in your vault?" hint left over from plain-filename references — nonsense
  for an SCC code, since there is no vault file to have duplicates of. That hint is gone for
  SCC-shaped references; ordinary filename references are unaffected. Separately, a tracker
  used to log a `console.warn` for each compendium creature with no portrait, purely
  because compendium statblocks carry no `image` field — an already-handled state
  (the themed fallback glyph still renders). The warning now fires only when a portrait image
  WAS specified and still couldn't be resolved.
- [FIX] **Typing a negative number into the minion pool's Apply Damage box no longer heals
  the squad** (SC-241). Applying damage from a minion's stamina-pool modal used to read
  whatever you typed as a plain multiplier, so a negative damage amount (or a negative
  number of minions hit) flipped the math and healed the pool instead of damaging it. Apply
  Damage now treats a negative value in either box as zero, so it does nothing instead of
  healing.
- [FIX] **Minion squads in the initiative tracker share one rule-shaped action checklist**
  (SC-278). Minions act together and can take only a move action and a main action, a move
  action and a maneuver, or two move actions — so a squad's minions no longer each carry an
  independent four-toggle checklist. Open any minion of the squad and you get the squad's
  single [Move] [Main | Maneuver | Second move] [Triggered] checklist, with the middle three
  mutually exclusive. Captains and attached creatures keep the ordinary checklist, and a
  group holding several squads gets one per squad.
- [FIX] **The light color scheme has its own, darker status colors, and three color-only
  signals now show a hover tooltip** (SC-196). Every color-coded state — Stamina healthy
  (green), winded (amber), dying (red), and temporary Stamina (purple); the critical-hit power-roll badge (gold); malice and victory points (gold); warnings
  (orange); and the initiative tracker's selection ring (red), plus the turn-done and danger accents that share those colors — used to reuse the dark
  scheme's exact colors in light mode, where several were too pale to read reliably
  against a white background. Light mode now has its own darker version of all eleven,
  checked against the WCAG AA contrast minimum; the dark scheme is unchanged. Three of
  those surfaces had no other way to tell the state apart by eye: hovering the `+N`
  temporary-Stamina badge, a selected creature in the initiative tracker, or a rolled
  power-roll result row now shows a tooltip naming what's highlighted, in words.
- [INTERNAL] The developer-run parity check (`npm run parity`) now fully compares
  `background-color`, not just gradient/bevel/hairline flat-vs-forged (SC-126). A first rule
  buckets each side's wash into black/white/unclassified and fails on opposite buckets — the
  exact shape of a historical defect (SC-117) that used to slip through clean because neither
  side's `background-image` was flat. A second rule compares the actual value (alpha +
  premultiplied colour, ground-independent, so no site re-capture was needed), closing the
  one hole the first rule couldn't: a wash that vanishes entirely reads as clean today and
  will now fail. Both are material checks — never declarable, same as the flat-vs-forged
  check they extend — and neither moved a single pixel or a frozen shot on landing: every
  mapped surface's `background-color` was already byte-identical between the plugin and the
  site.
- [FEATURE] **The Montage Test tracker is now a working board, not just a scoreboard**
  (SC-191). A full visual overhaul on top of a purely additive schema: two new optional
  keys, `description` (a Director's brief rendered above the board) and `entries[]` (the
  board's per-cell records — `hero`, `round`, `result`, and optional `skill`/`note`); an
  existing block parses, renders and keeps its tallies unchanged, no migration needed. The
  board is a CSS grid — one row per hero, one column per round, a running tally beside
  each row — read from `entries[]`; `successes`/`failures` stay the stored, authoritative
  totals (never recomputed from the board, so a hand-kept total is never silently
  overwritten). A **Log an action…** button, a per-row shortcut, and a click on any cell
  all open the same small form — success/failure/assist, an optional skill and note — for
  the hero and round named in its title; the form itself never switches hero or round
  (SC-334). An already-logged cell opens the same form pre-filled for correcting a mistake
  or removing it outright, and the skill-reuse
  rule (a hero can't use the same skill twice in one montage) warns live in the form,
  never blocking. An empty cell in the round currently in play also carries three small
  buttons — check, X, and plus — that log a success, failure, or assist in one click with
  no skill and no note (SC-299); an empty cell from an earlier round can be clicked too, to
  add a test that was never logged at the time, without disturbing whose turn it is in the
  round now in play (SC-299). The bar under the board carries **End round N** (the only way to advance
  the round), **Back to round N** (steps back to the previous round without removing
  anything logged — also offered when the montage ran out of rounds, never once a limit
  is reached; SC-334), **Undo** (removes whatever was logged most recently, including the
  winning action that just finished the montage) and — once the montage is finished —
  **Reopen** (only when it simply ran out of rounds; a limit is final) alongside a danger
  **Clear all**. The outcome band's two limit tracks fill slot by slot — successes as
  metal chips, failures as red chips with the same light top-to-bottom gradient (SC-334). Two collapsible reference panels — a **Test tiers**
  cheat-sheet above the board (the shipped Power Roll badges, flipped to tiers-as-rows) and
  a **Running a montage test** guide at the foot — stay closed by default and print
  expanded. The hand-rolled ⋯ menu is gone: the card's standard element menu now carries
  **Add a round**, **Add a hero**, **Set limits…** and **Reset progress**. Notes typed on
  any logged test list under the outcome band, tagged with the hero and round. See
  [Montage Test Tracker](docs/gm-trackers.md).
- [FEATURE] **The squad captain's Stamina bonus now applies to the minion pool**
  (SC-195). "While a minion squad has a captain, each minion in the squad gains the
  benefits noted at the 'With Captain' entry on their stat block" — when that benefit is
  a Stamina bonus, the tracker now folds it into the shared pool automatically: the pool
  is `(per-minion Stamina + N) × squad size` while a live captain is bound, and drops
  back to the plain value the moment the captain is relieved, drops to 0, or a down
  captain heals back up. N is read from the referenced stat block's "With Captain" entry
  (parsed from the exact `+N bonus to Stamina` shape) or an explicit `with_captain_stamina`
  override on the minion. The captain's badge word carries the bonus ("Captain +4 Sta")
  — the pool numbers themselves change silently. Also fixes a pre-existing divergence
  where the pool-edit modal computed its max from the ALIVE minion count while the row
  and print readout always used the squad's original size; both now agree (the max never
  shrinks as minions die). See [`docs/initiative-tracker.md`](docs/initiative-tracker.md)
  → "Minions and Captains" for the full YAML.
- [FIX] **The note no longer jumps to the top when you click a tracker control**
  (SC-198). Ticking an action, spending malice or nudging stamina writes the note, and
  Obsidian rebuilds the whole reading view whenever a note changes — which briefly
  collapsed the page's height and made the browser clamp your scroll position back to
  the top. On a session note that is mostly one long initiative tracker that happened on
  every single click. The plugin now holds the page at its current height across that
  rebuild, so the scroll position is never lost. Measured on a 4800px note: scroll
  position 2596px → 0 before, 2596px → 2596px (never moved) after. The brief flash while
  Obsidian re-renders is unchanged — that is Obsidian's own rebuild, not something the
  plugin drives.
- [FIX] **The card's border no longer fades away at its top corners** (SC-189). On a
  statblock or featureblock, the header band's own corners were rounded a little tighter
  than the card's, so the band quietly painted over the card's 1px hairline for the whole
  curve of each top corner — the top edge and the right edge read fine and the corner
  between them dissolved. The band now takes the card's own corner radius, and the hairline
  runs unbroken all the way round. A new check in the visual battery measures the corner on
  every card family in both schemes, so it cannot come back.
- [FIX] **The element menu panel sits right, and the card sits in front of it** (SC-189).
  Three things: the panel wore Obsidian's own button shadow (a five-layer plate shadow that
  darkened its interior and spilled onto the card's top border row) and Obsidian's fixed
  30px button height (which overrode the panel's own, declared size in every real vault);
  both are now the plugin's again. And the card's top edge casts a small shadow up onto the
  panel, so the panel reads as a tab tucked *behind* the card instead of a second plate
  parked against it. The panel's icons also got room to breathe.
- [FIX] **Buttons and other controls are no longer oversized** (SC-185). A bare button
  ("Reset Encounter State" and its neighbours) rendered about 23% larger than a native
  Obsidian button beside it. Control text now defaults to 0.85em instead of 1em — 13.6px
  at a 16px note, within 0.6px of Obsidian's own control text size — so every
  un-contextualised button, stepper, tab, collapse header and input shrinks to match.
  Tune it further with the **Control text size** slider under Settings → Typography.
- [FIX] **The settings preview is no longer a porthole with its own scrollbar**
  (SC-187). Every settings page that shows a live sample used to dock it to the bottom
  of the window in a fixed 350px box — which meant a second scrollbar nested inside
  Obsidian's own (on the Statblock display page, 350px of window onto a 3,646px
  statblock), a sample cropped to its header so you never actually saw a feature card,
  and an opaque panel floating across the settings it was previewing (on Typography it
  covered the "Card size" row and all three text-size sliders outright). The sample is
  now a **labelled panel at the end of the page**, in normal flow, sized to whatever it
  is showing: one scrollbar in the settings window, nothing covered, and the whole
  sample readable. The canned statblock was also cut from eight abilities to three
  chosen to keep every setting on the page demonstrable, so the sample reads as a
  sample. One consequence worth knowing: **Sticky mini-header** has no visible effect in
  the preview — it is a scrolling-reading-pane behaviour, and a settings window is not
  one.
- [FIX] **Features have their own settings page** (SC-193). **Keyword display** and
  **Distance + target** control the ability card itself — standalone, and everywhere it
  appears inside a statblock or featureblock — but they were filed under *Statblock
  display → Advanced*, where nobody looking for feature settings would find them. They
  now sit on a **Feature display** page beside *Statblock display* and *Featureblock
  display*, with a standalone ability card in its preview. Nothing changes about what
  they do or what they default to, and they are still written by the statblock
  **Preset** (as they are on the website), so changing either still re-derives that
  preset to "Custom".
- [BUGFIX] **"Flat list" feature style now matches the website** (SC-188). Turning on
  Flat list — for a statblock's own features or a featureblock's options — used to leave
  a colored square bar down the left edge of every feature; the website's flat list never
  draws one at all, only its "Cards" mode does. The bar is gone in both places, and the ◆
  divider between consecutive features (added between two features, never before the
  first or trailing after the last) is unchanged.
- **The skill list gets a new look, two selectable layouts, and an unowned-skills
  toggle** (SC-182). A `ds-skills` block now renders as a **ledger** by default — a
  responsive grid of group panels with owned/total tallies (`3/11`) and ◆ marks, about
  a third the height of the old wall — and can choose its layout with a `style:` key:
  `ledger`, `chips` (each group as an inline run of skill chips: owned = raised steel,
  unowned = faint ghosts — the whole catalog in about one screen) or `list` (the
  classic checklist, exactly as before). The block's menu panel also gains an eye
  toggle to show/hide unowned skills at the table: `only_show_selected:` sets the
  starting state, the toggle's choice wins for the session, per block, and nothing is
  written back to the note. Print and PDF export always use the classic list form,
  whatever `style:` says.
- [FEATURE] **A single Conditions manager, with custom conditions and duration**
  (SC-186). The old "Add Conditions" picker + its "Customize Condition" child modal are
  replaced by one compact **Conditions** modal that shows exactly what's on the actor —
  not a 24-row catalog. Each active condition is a row with its icon, name, any duration/
  effect badges, a customize cog, and a delete button; changes apply immediately, so
  there's no "Add Conditions" button to remember to press. "+ Add condition" turns into a
  type-ahead box that filters the known conditions as you type and always offers
  **Add custom: "‹what you typed›"** — so a statblock's bespoke condition (a curse, a
  boss mechanic) is now something you can track at all, with its own fallback icon.
  Duration (End of Turn / Save Ends / End of Encounter) is now its own field instead of
  being crammed into the same slot as the visual effect, which also fixes a bug where
  opening Customize on a duration you'd written by hand and saving would silently erase
  it. The initiative tracker opens this modal.
- **The initiative tracker adopts the stamina bar's design** (SC-183). Every hero row
  and every opened enemy row in the tracker now carries the real stamina instrument the
  `ds-stamina` element ships — a big current-value readout, the temp-stamina plate, and
  the forged gauge running the full width of the row (heroes keep the dying reserve;
  creatures pour from zero; a minion squad's row shows the shared pool with per-minion
  death graduations). The collapsed creature cells in the grid get a mini gauge under
  their numbers, so a glance down the roster reads like a glance across health bars.
  **Winded** and **Dying** are now called out as a labelled chip on the actor's
  conditions line, with the whole row's frame taking the state's colour behind it —
  amber when winded, a red frame and ground when dying. A monster at 0 Stamina reads
  **Dead** rather than "Dying", which is the actual rule: only heroes have a dying
  state. Clicking a bar opens the same stamina editor the numbers always opened; every
  existing control (turn tracking, conditions, action checklist, Malice bar, minion
  pools, double-click editing) still does exactly what it did, and print layouts are
  unchanged — paper keeps the compact numeric tracker.
- **Minion squads are no longer shown as "winded"** (SC-183). A squad's shared Stamina
  pool used to take the amber winded frame once it dropped below half. It shouldn't:
  *"Because minion Stamina is tracked as a pool, minions can't be winded"* — and a
  squad isn't a creature with a winded value of its own. The pool now reads by length
  and by its per-minion death ticks alone. A squad's **captain** is unaffected, because
  a captain's Stamina is tracked separately from the pool — they go winded like any
  other creature.
- **The squad captain is called out on the roster — and you can change who it is**
  (SC-183, GitHub #67). A squad's captain now leads its grid of creatures, badged with a
  crown and the word "Captain", its portrait set into a forged steel frame with a struck
  corner notch, and marked the same way on the opened detail row. Drop the captain to 0
  and the badge turns to **"Captain down"** — the cue that the squad has lost its *With
  Captain* benefits and, per the rules, may take a new captain at the start of the next
  round. That swap is now one click: open any other non-minion creature in the group and
  press the **Make captain** badge beside its name. The old captain stays in the group as
  an ordinary attached creature.
- **An enemy group can hold more than one minion squad** (GitHub #67). A group used to be
  capped at two creatures and a single minion type, which made published encounters that
  field two squads side by side — the Delian Tomb's Encounter W1, two squads of *flows of
  the river* in one group — impossible to write down. A group may now hold as many minion
  squads as it needs, plus their captains and any attached creatures, and **each squad
  tracks its own Stamina pool**: damage one and the other is untouched. Existing encounter
  blocks are unaffected in every respect, down to the bytes written back to your note.
- **The portrait is the turn toggle** (SC-183). The little dot-checkbox beside each hero
  is gone from the tracker: click the hero's **portrait** to mark their turn taken, click
  again to undo. A taken turn strikes a small **steel seal** into the portrait's lower-right
  corner — a milled disc bearing the brand's ◆ diamond, the frame turning to engraved metal
  around it — so a glance down a full roster reads as a row of seals rather than something
  you have to squint at. A spent row also reads as spent material — its plate goes to a dark
  milled hatch and its portrait and name recede — so a glance down the list finds who is
  still to go without reading anything. Everything on that row stays fully lit and fully
  usable (the Director still has to adjust Stamina on rows that have already gone), and
  hovering or tabbing into a spent row brings it all the way back. If you turn portraits off,
  the checkbox returns — there's nothing to click otherwise. Printed trackers keep the tick
  box, which is what a turn marker means on paper.
- **The hero and monster rows are rebalanced** (SC-183). The portrait is markedly bigger,
  the four action pips sit on the card's own inset like everything else in the row, and
  the Stamina instrument is now one line — the gauge across the row with the big current
  value at its right end, instead of a number stranded on a line of its own above the bar.
  Rows are shorter and read as one object. At narrow widths the pips take their own line
  and the instrument stacks again, so nothing gets crushed.
- [FIX] **Inner features get real breathing room** (SC-168). A feature nested inside a
  standalone ability/feature card (an `effect.features` sub-feature) rendered flush
  against its parent card's left and right edges with no frame of its own. It now
  wears the same nested-card treatment statblock and featureblock sub-features have
  had since 7.0.0's structural pass — its own rounded plate, proper insets, and the
  action-type spine as the card's left edge. Print is unchanged.
- **A standard menu panel on every card element, and a one-line collapsed form** (SC-169).
  Hover any element that draws a card — statblocks, ability cards, featureblocks, compendium
  references, the Stamina bar, every tracker — and a small panel appears at its
  top-right, in the shape of a window's title-bar controls: icon-only, short, and it grows
  leftward as items are added, so the collapse button never moves. It always carries
  collapse/expand. Collapsed, an element becomes one line: its type, its name,
  and an expand button ("STATBLOCK: Goblin Stinker", "STAMINA (31/48)",
  "SKILLS (12 selected)"). A block
  that references a compendium entry shows that entry's real name, not its code. Three
  block keys control it: `collapsed:` (start collapsed), `collapse_default:` (the same
  thing, the older spelling) and `collapsible: false` (no collapse control at all, and no
  panel if that leaves it empty); the **Collapsible by default** and **Start collapsed**
  settings are the fallback when a block says nothing. All three work on a compendium
  reference block too, which has no list of fields to put them in — write them as its first
  lines, above the code. Collapsing something is remembered for
  the session and never edits your note, and the panel never appears in print or in an
  exported PDF — a collapsed element prints in full. On mobile the panel is always visible
  instead of waiting for a hover. The one element that deliberately doesn't get one is the
  horizontal rule. See
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
  statblock scrolls: a note in Reading view, a pop-out window, and a narrow pane, where
  it reflows to just the name and role because that is all a 300px-wide bar can usefully
  say. It is deliberately absent where scrolling isn't a thing: print, PDF export, and
  canvas cards — and inside a callout, whose body never scrolls.
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
  drop shadow under every card, boxed characteristic cells and small-caps labels — instead
  of the plain, ink-economical layout that was supposed to go to paper. The screen styling
  was only ever reliably turned off on screen; real printing merely tried to, and lost.
  Printing and PDF export now get the plain print layout, and a handout costs what it
  should in ink. Light-mode vaults were hit hardest: PDF export always renders in
  the light scheme, which is exactly the case where the old print rules were most
  outranked. One smaller print bug went with it: buttons, tabs and other control text kept
  the theme's serif when printed instead of the plain sans of the print layout.
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
- [FIX] **The initiative tracker block is properly spaced** (SC-154).
  It had shipped without the same breathing room every other tracker (negotiation,
  montage) already gets: buttons, headings and rows sat flush against
  the note's own margin with no padding at all. On top of that, the initiative
  tracker's "Reset turns (this round)" / "Advance round" buttons wrapped their own
  text across two to four cramped lines regardless of how wide the note was, because
  the Malice panel that holds them was capped narrower than either button's label
  ever fit — while the same row had hundreds of pixels of empty space to its left.
  Both are fixed: the tracker root now carries the same padding its sibling trackers
  do, the round-control buttons keep their label on one line and wrap as whole
  buttons (never mid-word) if the width genuinely doesn't allow it, the turn
  indicator no longer sits glued to the row beside it and the Malice quick-add
  "Amount"/label boxes are wide enough for their own placeholder text. The round and Malice controls also moved out of
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
  Characteristics and Values row both rendered as bare text on the page, so a
  sheet made of them read as an undifferentiated run of lines with the odd styled
  block (a Counter) floating in it. Both now carry the same plate, so a sheet reads as a set of matching
  panels. The characteristics element goes one further: it renders the statblock's
  own characteristics rail — same code, same CSS, same signed values, following the
  same two Characteristics display settings — because they are exactly the same
  five numbers. `ds-skills` is
  deliberately left bare for now: it needs a real overhaul, not a frame (tracked
  separately). The plate is written as a
  screen treatment; a real Ctrl-P / Export-to-PDF currently carries it through
  anyway, along with the other Steel surfaces, and getting print back to a plain,
  ink-cheap rendering is tracked separately as SC-170.
- The Stamina bar was already styled and keeps the framing it had.
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
  (per-block appearance overrides, reference vs. snapshot semantics, canvas,
  print/PDF behaviour, rolling). Every visual step carries a screenshot
  generated from the real plugin by the pipeline below, including Obsidian's own
  command palette and compendium search.
- [INTERNAL] **Every screenshot in the README and the docs is now generated by one
  command** (SC-142). `npm run docs-shots` regenerates them from the real
  plugin, driven by a single manifest (`visual-harness/docs-manifest.mjs`): element
  cards through the existing browser harness, and the surfaces only the app has —
  the settings pages, the four modals, a real canvas — through
  the Obsidian camera. The camera runs on an **Xvfb virtual display** it starts and
  stops itself, so the run is fully headless: it never touches the developer's own
  display and does not care whether Obsidian is already open. Before this, every
  docs image was a hand-taken screenshot, and by 7.0.0 all but one of them predated
  the Steel rendering work and showed a plugin that no longer existed. The runner
  names anything it cannot regenerate, and any Media file the manifest doesn't
  declare, at the end of every run.
- **The docs now show up-to-date animated GIFs for every interactive element**
  (SC-411). The initiative tracker (on the README too), negotiation tracker, counter,
  Stamina bar, Montage Test tracker, ability-card rolling and the initiative tracker's
  Conditions manager each have a short GIF of the element in use, in the
  current Steel look. The two old hand-recorded GIFs (initiative, negotiation) were
  from before the re-skin; they are replaced. Every GIF is a scripted interaction
  replayed against the real plugin by `npm run docs-shots` — nothing in `docs/Media`
  is hand-recorded any more, so a GIF can no longer go stale on a landing — and
  `npm run docs-shots -- --only=<name>.gif --check-stable` proves one regenerates
  byte-identically.

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
  In a narrow pane the whole cluster collapses to a two-line rail.
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
- [INTERNAL] Both reported failures of the compendium insert commands are pinned by
  regression tests over the real corpus bytes (SC-147, SC-148). Neither needed a
  code change: "Insert compendium reference" writing a `ds-rule` fence that then
  refused to render, and "Insert compendium block (snapshot)" dumping a whole
  `ds-feature` block nested inside a `ds-rule` one, were both consequences of no
  adapter claiming the `ability` type, which SC-141 fixed — and SC-149 independently
  removed the `ds-rule` fallback the fence came from. The tests drive both commands
  end to end for the exact entry from the reports.
- [FIX] **Abilities referenced by their compendium code now render** (SC-141).
  Referencing an ability by its code — say
  `scc.v1:mcdm.heroes.v1/feature.ability.shadow.level-1/coat-the-blade` — produced
  the error *"Coat the Blade" found but is not an ability entry*, even though the
  file was right there in your synced compendium. The plugin was looking for
  compendium files labelled `feature`, but every one of the roughly 700 ability
  and trait files is labelled `ability` or `trait`, so none of them could be read:
  no ability in the book could be referenced by code, in a
  `ds-feature` block. They all work now, including by name (`Coat the Blade`).
  Alongside it, a smaller repair to how a missing entry is reported: a code that
  genuinely cannot be found now says so plainly and names both possible causes
  (an un-synced compendium **or** a wrong code) instead of only blaming the sync. Looking an ability up
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
  a short index of navigable pages (Appearance, Typography, Statblock
  display, Featureblock display, Element defaults, Rolling, Compendium, Links,
  Initiative tracker), each holding only its own settings. Because the settings are now
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
- New command: "Sync compendium".
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
- New: **Montage tracker** (`ds-montage`) — a tracker for Draw Steel's
  montage tests, following the same interactive, persisted-block model as the
  initiative tracker.
- New: the initiative tracker's **Malice panel** is now first-class — a
  keyboard-accessible pool stepper, a round counter with "Reset turns (this
  round)" vs. "Advance round" (advancing can apply a configured per-round
  Malice gain), a spend/gain log, and a labeled quick-add for trigger-based
  gains (e.g. "+3 Feytouched").
- New: heroes and creatures in the initiative tracker get a per-turn action
  checklist (Main / Maneuver / Move / Triggered).
- New: the Stamina tracker (`ds-stamina`) gains recoveries and a Catch Breath
  action.
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
  the shared card families above: the negotiation/montage/initiative
  trackers, and every other plugin-only surface now set
  body and label text in the same serif face, open line-height and cooler ink as
  the card families, so a note reads as one coherent type system instead of a
  serif card sitting next to a sans tracker. The routing moved from a four-family
  allow-list to a single Steel-theme-root selector. (An exclusion keeping numeric
  stepper/counter values in their prior, non-serif rendering was part of this
  change but was later found to have quietly stopped working during the font-slot
  groundwork below; it is now removed deliberately — controls follow the Body
  font, see the typography settings entry below.)
  `steelTypography.test.ts` gained a contract test
  that locks the shape of the selector itself — every element root, not a named
  list — so a future edit can't quietly narrow the routing back down without
  failing the suite. Same honest limits as above: screen-only (print and PDF export
  are untouched), serif-not-slab, and only the 600/700 weights ship.
- The Steel theme now reaches DSE's modals too — stamina edit / Spend Recovery,
  the Conditions manager, and other modal dialogs now follow the
  active look: they render the forged treatment (title emboss, sunken sections,
  forged footer buttons) instead of unstyled app defaults. (Verified by DOM
  contract tests asserting the
  theme attribute stamps, re-stamps live, and tears down on close — not a
  rendered screenshot, since no frozen harness shot opens a modal.)
- [INTERNAL] Featureblock advancement bands now have a dedicated
  visual-harness fixture: the featureblock fixture's frozen renders joined the
  golden-PNG set (98 → 101), while its remaining shots are regenerated
  (unfrozen) goldens verified by eye.
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
  on desktop, where it read as roughly 3× too big — on counters, montage and the
  other trackers. Controls now sit at a compact 28px on a mouse/trackpad and switch
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
  narrow. The table now sits in its own scrolling
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
- [BUGFIX] Trackers and other interactive elements (initiative, negotiation,
  montage) now render correctly on Obsidian
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

