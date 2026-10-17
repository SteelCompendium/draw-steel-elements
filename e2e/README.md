# e2e: real-Obsidian behaviour tests (SC-408)

Drives a real Obsidian (WebdriverIO + `wdio-obsidian-service` behind our own `driver/`) with
real pointer and key events, then asserts the **note file** and the DOM. Shipped specs run
with `experimental` OFF (the real 7.0.0 product).

```bash
npm run e2e                                # all specs, headless on a private Xvfb, pinned Obsidian 1.14.4
npm run e2e -- --element=stamina-bar       # one dir under specs/
npm run e2e -- --only=STAM-D01,STAM-S13    # by [ID] in the test title (unknown id = exit 2)
npm run e2e -- --shards=4                  # parallel Obsidians (default min(4, nproc/3))
npm run e2e -- --obsidian=installed        # /usr/bin/obsidian + newest ~/.config/obsidian asar
npm run e2e -- --headed [--slow=300]       # watch it; one shard; outlines each target
```

Exit 0 ok, 1 a test failed, 2 usage/environment. Last line: `OBSIDIAN-E2E done: N/M ok, F failed,
K known-bug` (K = expected failures from `knownBug`). Run from a devbox shell (Node + Xvfb).

**Headless vs headed.** Headless always starts its own Xvfb in `:200-:239` and sets `DISPLAY`
for every child. It never inherits your shell's `DISPLAY` (agent shells export `:1`, your real
screen). `--headed` is the only way onto a real display: `DSE_E2E_HEADED_DISPLAY` if set, else
`:1`. Test it against a throwaway Xvfb, not your screen.

**Cache.** Obsidian app/installer/chromedriver downloads live in
`${XDG_CACHE_HOME:-~/.cache}/dse-e2e-obsidian` (override: `OBSIDIAN_CACHE`), shared by every
worktree (~1 GB per version set; the first run of a new version downloads).

**Output** goes to `e2e/.out/<run>/` (gitignored): per-failure bundles
(`<test-id>/` with screenshot, DOM, note before/after + diff, page events, versions, vault copy),
`results/`, and `coverage.json` (every control and interaction kind driven).

**What goes where.** If a bug would show in a jsdom table (math, labels, states), test it in
jest. If it needs a real browser event, a real Modal, layout, or a real write (focus/blur order,
Escape, hit-testing, adoption across a write), it is an e2e scenario.

## Adding a scenario

Specs live in `specs/<surface>/*.e2e.ts` and import only `../../driver/dse`. Put a unique
`[ID]` in the title (it drives `--only`). Every test is checked after it runs: no page
errors, no orphaned modal, notes intact outside their blocks, registry collisions 0.

```ts
import { dse, knownBug } from '../../driver/dse';
it('[STAM-X01] what a user sees happen', async () => {
  await dse.openNote('Stamina/basic.md');                  // fixture reset + Reading view
  await dse.click(dse.block('ds-stamina-bar').control({ css: '.dse-stamina__cluster' }));
  const modal = await dse.modal('stamina-edit');           // exactly one open modal
  await dse.type(modal.control({ css: '.dse-sedit__apply-input' }), '3', { replace: true });
  await dse.click(modal.control({ name: 'Damage' }));
  const w = await dse.waitForWrite('Stamina/basic.md', () => dse.click(modal.control({ css: '.dse-btn--accent' })));
  expect(w.count).toBe(1);
  await dse.expectNoteBlock('Stamina/basic.md', 'ds-stamina-bar').toMatchObject({ temp_stamina: 2 });
});
```

- Fixture notes are real `.md` files in `vaults/shipped/`; open them in Obsidian by hand.
- Name a control by `{ css }`, `{ name }` (aria-label), or a bare `data-dse-control` id.
- Negative checks: `dse.expectNoWrite(path, action)` waits for write-idle, never sleeps.
- A real bug you are not fixing here: `knownBug('SC-123', '[ID] correct behaviour', fn)` passes
  while `fn` fails and FAILS once it passes (remove the marker then).
- Never `sleep`; wait for a state (`waitForWrite`, `expect(...).toBeDisplayed()`). No retries.
