#!/usr/bin/env node
// visual-harness/shoot.mjs — the F4 camera (Plan 11). Sweeps element × bg (+ print)
// through the built harness page and writes deterministic PNGs to
// visual-harness/shots/. Any mount error (error card, page error, unknown fixture)
// saves the shot with an --ERROR suffix and exits nonzero naming the failure.
// Flags: --element=<id> --bg=<dark|light> --fixture=<name> --readonly
//
// SC-144: the theme axis is gone. Steel is the only theme, so there is no --theme flag
// to filter on. Shot names keep the `steel-` prefix — the frozen `*--steel-print.png`
// baseline is keyed on it.
// SC-170: 4 combos, not 3 — `steel-realprint` (real @media print) joined the twin.
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = 'file://' + path.join(dir, 'index.html');
const shotsDir = path.join(dir, 'shots');
fs.mkdirSync(shotsDir, { recursive: true });

const args = Object.fromEntries(
	process.argv
		.slice(2)
		.filter((a) => a.startsWith('--'))
		.map((a) => {
			const [k, v] = a.replace(/^--/, '').split('=');
			return [k, v ?? '1'];
		}),
);

// SC-170: `print` and `realprint` are the plugin's TWO print surfaces and they are
// captured differently on purpose.
//   print      — the on-screen preview TWIN: `?print=1` stamps data-dse-print="on",
//                media stays `screen`. This is the frozen `*--steel-print.png` class.
//   realprint  — real paper: NO attribute, Playwright `emulateMedia({media:'print'})`,
//                i.e. exactly what Obsidian's Ctrl-P / "Export to PDF" renders. Before
//                SC-170 nothing in the battery ever emulated print media, so the whole
//                real-print surface had zero byte coverage — and it was carrying the
//                full Steel plate into every PDF.
// The two are expected to be BYTE-IDENTICAL (the plugin makes real print resolve
// through the twin's own rules); `assertPrintTwinParity` below fails the run if they
// ever diverge, which is the regression gate that catches the next leak.
const COMBOS = [
	{ theme: 'steel', bg: 'dark' },
	{ theme: 'steel', bg: 'light' },
	{ theme: 'steel', bg: 'dark', print: true },
	{ theme: 'steel', bg: 'dark', realprint: true },
];
const comboName = (c) =>
	c.print ? `${c.theme}-print` : c.realprint ? `${c.theme}-realprint` : `${c.theme}-${c.bg}`;
/** Only the realprint combo emulates the print MEDIUM; the twin stays on screen. */
const mediaFor = (c) => (c.realprint ? 'print' : 'screen');

const failures = [];
/** Every capture this run actually wrote: `${captureId}${suffix}` → combo → file basename.
 *  The parity assertion reads THIS, not the shots directory, so a narrowed run can never
 *  re-assert (or be reassured by) stale files from an earlier full sweep. */
const produced = new Map();

// SC-170 review fix (M-1/M-4): the COMBO — not the call site — decides the print medium,
// the `print=1` query param, the `--readonly` param/suffix and the output name. Every
// sweep loop below must hand its combo to `snap`, and there is no way to call `snap`
// without one, so a newly added loop physically cannot forget them. It was exactly that
// omission (SC-160's scrollShots loop, merged in after this work started, never passed a
// `media` option) that shot five `*--steel-realprint.png` files under SCREEN media.
async function snap(page, combo, params, captureId, opts = {}) {
	const suffix = args.readonly ? '--readonly' : '';
	const outName = `${captureId}--${comboName(combo)}${suffix}`;
	const query = { ...params, theme: combo.theme, bg: combo.bg };
	if (combo.print) query.print = '1';
	if (args.readonly) query.readonly = '1';
	const pageErrors = [];
	const onErr = (e) => pageErrors.push(String(e));
	page.on('pageerror', onErr);
	try {
		// Set BEFORE goto: a root mounted under print media must see it at mount time.
		await page.emulateMedia({ media: mediaFor(combo) });
		await page.goto(`${pageUrl}?${new URLSearchParams(query)}`);
		await page.waitForFunction(() => window.__dseHarnessDone !== undefined, null, {
			timeout: 15000,
		});
		// SC-117 Batch 6 (catalog consumer #16): interaction shots fire a REAL click on
		// the production affordance after mount settles but before the shot, so a
		// state that's only reachable by user action (e.g. a radiogroup selection) gets
		// captured. `opts.click` is a CSS selector, always inside #mount.
		if (opts.click) {
			await page.locator(opts.click).click();
			// SC-117 fix wave M1: park the pointer off the clicked row before the shot, or
			// the capture pins `:hover` (--dse-hover) over the row's resting fill instead of
			// the checked-at-rest state the interaction shot exists to prove.
			await page.mouse.move(0, 0);
		}
		// SC-169: hover shots are the EXACT OPPOSITE of the line above — the pointer must
		// STAY on the target, because `:hover` is the state under review (the element menu
		// panel is hidden until the cursor is over the container or the panel).
		if (opts.hover) {
			await page.locator(opts.hover).first().hover();
		}
		const done = await page.evaluate(() => window.__dseHarnessDone);
		const errors = [...done.errors, ...pageErrors];
		const file = path.join(shotsDir, `${outName}${errors.length ? '--ERROR' : ''}.png`);
		if (query.gallery) await page.screenshot({ path: file, fullPage: true });
		else await page.locator('#mount').screenshot({ path: file });
		if (errors.length) failures.push({ outName, errors });
		else {
			const key = `${captureId}${suffix}`;
			if (!produced.has(key)) produced.set(key, new Map());
			produced.get(key).set(comboName(combo), `${outName}.png`);
		}
		console.log(`${errors.length ? 'FAIL' : '  ok'} ${path.basename(file)}`);
	} catch (e) {
		failures.push({ outName, errors: ['exception: ' + String(e)] });
		console.log(`FAIL ${outName} (exception)`);
	} finally {
		page.off('pageerror', onErr);
	}
}

// SC-169 round 2 — Scott's two placement/layering rulings, as a GATE rather than a picture.
//
//   "The placement of the menu panel should be consistent across the Elements. In some of
//    the screenshots it looks like the panel is closer to the right than others."
//   "The panel should not cover the Element's border."
//
// Both are cross-element geometry facts, and jsdom (where the rest of the suite lives)
// computes no layout at all — so this is the only place in the battery that can actually
// measure them. Same shape as `assertPrintTwinParity`: it fails the sweep, loudly, naming
// what moved.
//
// Each entry names the node that draws the element's VISIBLE CARD FRAME. That is
// deliberately hard-coded here rather than read from `.dse-chrome-anchor`: reading the
// anchor would let a future anchor bug pass by measuring the panel against whatever the
// panel was positioned against, which is the tautology this gate exists to break.
//
// SC-169 ROUND 3 widened this from the three prototype elements to seven, chosen to cover
// every distinct ANCHOR SHAPE the rollout produces rather than to be exhaustive (thirty-one
// families through one gate would cost thirty-one page loads for six answers):
//   - a NESTED card frame reached through withReference/RefUnwrapView … statblock (.dse-sb),
//     kit (.dse-card — the shape all eleven display families share);
//   - a framed ROOT … feature, counter, negotiation (a static card, a small persisted card
//     and a large GM tracker — three different content widths on the same anchor shape);
//   - a view-supplied nested anchor … stamina-bar (.dse-stamina__cluster), hero (.dse-hero).
// A single inset number has to come out of all seven, which is Scott's ruling stated as
// arithmetic.
const CHROME_PLACEMENT_CASES = [
	{ element: 'statblock', fixture: 'default', frame: '.dse-sb' },
	{ element: 'hero', fixture: 'default', frame: '.dse-hero' },
	{ element: 'stamina-bar', fixture: 'winded', frame: '.dse-stamina__cluster' },
	{ element: 'kit', fixture: 'default', frame: '.dse-card' },
	{ element: 'feature', fixture: 'default', frame: '[data-dse-element="feature"]' },
	{ element: 'counter', fixture: 'default', frame: '[data-dse-element="counter"]' },
	{ element: 'negotiation', fixture: 'default', frame: '[data-dse-element="negotiation"]' },
];
/** Sub-pixel slack: layout rounds at the device-pixel grid, not the CSS-pixel grid. */
const PLACEMENT_EPSILON = 0.5;

async function assertChromePlacement(page) {
	const measured = [];
	for (const c of CHROME_PLACEMENT_CASES) {
		const query = new URLSearchParams({
			stack: `${c.element}:${c.fixture}`,
			theme: 'steel',
			bg: 'dark',
			pad: '56',
			prefs: 'authoringControls:true',
		});
		await page.emulateMedia({ media: 'screen' });
		await page.goto(`${pageUrl}?${query}`);
		await page.waitForFunction(() => window.__dseHarnessDone !== undefined, null, { timeout: 15000 });
		await page.locator('[data-dse-element]').first().hover();
		const m = await page.evaluate((frameSel) => {
			const frame = document.querySelector(frameSel);
			const panel = document.querySelector('.dse-chrome');
			if (!frame || !panel) return null;
			const f = frame.getBoundingClientRect();
			const p = panel.getBoundingClientRect();
			return {
				// How far the panel's right edge sits INSIDE the card frame's visible right
				// edge. This is the number Scott saw differ between elements.
				inset: f.right - p.right,
				// Positive = clear air between the panel's bottom and the frame's top border
				// row; 0 = resting exactly on it; NEGATIVE = painting over the border, which
				// is what cropped the amber winded / red dying frame in round 1.
				gap: f.top - p.bottom,
			};
		}, c.frame);
		if (!m) {
			console.error(
				`\nCHROME PLACEMENT: could not measure ${c.element}:${c.fixture} — ` +
					`missing ${c.frame} or .dse-chrome. Did the element stop opting into chrome?`,
			);
			process.exit(1);
		}
		measured.push({ ...c, ...m });
	}
	const covering = measured.filter((m) => m.gap < -PLACEMENT_EPSILON);
	if (covering.length) {
		console.error(
			`\nCHROME LAYERING VIOLATED — the menu panel paints over the card's top border on ` +
				`${covering.length} element(s), so a coloured state border renders cropped:\n` +
				covering.map((m) => `  ${m.element}:${m.fixture}  overlap ${(-m.gap).toFixed(2)}px`).join('\n') +
				`\nSee styles-source.css → "Element chrome" → LAYERING.`,
		);
		process.exit(1);
	}
	const insets = measured.map((m) => m.inset);
	const spread = Math.max(...insets) - Math.min(...insets);
	if (spread > PLACEMENT_EPSILON) {
		console.error(
			`\nCHROME PLACEMENT INCONSISTENT — the panel sits a different distance from the ` +
				`card's right edge on different elements (spread ${spread.toFixed(2)}px):\n` +
				measured.map((m) => `  ${m.element}:${m.fixture}  inset ${m.inset.toFixed(2)}px`).join('\n') +
				`\nSee styles-source.css → "Element chrome" → PLACEMENT.`,
		);
		process.exit(1);
	}
	console.log(
		`\nchrome placement OK (${measured.length} element families: inset ` +
			`${insets[0].toFixed(2)}px from the card's right edge, 0 border overlap)`,
	);
}

const browser = await chromium.launch();
const context = await browser.newContext({
	viewport: { width: 900, height: 1200 },
	deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
	// Manifest drives the sweep — single source of truth is the page itself.
	await page.goto(pageUrl);
	await page.waitForFunction(() => window.__dseHarnessManifest !== undefined);
	const manifest = await page.evaluate(() => window.__dseHarnessManifest);

	// SC-108 / FOLLOWUPS #37: keep the manifest's per-element `fixtures` list (not just
	// ids) so the sweep can shoot every named fixture, not only 'default'. Naming rule
	// (design §6): default-fixture output stays `${id}--${combo}` byte-for-byte unchanged
	// for every element; a NON-default fixture gets `${id}-${fixtureName}--${combo}` so it
	// can never collide with — and overwrite — a frozen default-fixture golden.
	let elements = manifest.elements;
	const narrowShots = manifest.narrowShots ?? [];
	// SC-117 Batch 6: interaction shots (manifest.interactionShots — entry.ts
	// INTERACTION_SHOTS), same "legal --element value, not a registered element"
	// treatment as narrowShots.
	const interactionShots = manifest.interactionShots ?? [];
	// SC-123: preference-variant shots (manifest.prefShots — entry.ts PREF_SHOTS), same
	// treatment as the two lists above.
	const prefShots = manifest.prefShots ?? [];
	// SC-160: scroll-state shots (manifest.scrollShots — entry.ts SCROLL_SHOTS), same
	// treatment as the three lists above.
	const scrollShots = manifest.scrollShots ?? [];
	// SC-169: element-chrome shots (manifest.chromeShots — entry.ts CHROME_SHOTS). Same
	// "legal --element value, not a registered element" treatment as the lists above;
	// unlike them an entry mounts a STACK of elements, so it has no single `element`
	// field to filter on — the id is the only handle.
	const chromeShots = manifest.chromeShots ?? [];
	if (args.element) elements = elements.filter((e) => e.id === args.element);
	// A narrow-shot/interaction-shot/pref-shot id (e.g. `perk-narrow`,
	// `negotiation-pr-checked`, `statblock-charline-two`) is a legal --element value
	// even though it is not a registered element — it selects only that capture below.
	if (
		args.element &&
		elements.length === 0 &&
		!narrowShots.some((n) => n.id === args.element) &&
		!interactionShots.some((n) => n.id === args.element) &&
		!prefShots.some((n) => n.id === args.element) &&
		!scrollShots.some((n) => n.id === args.element) &&
		!chromeShots.some((n) => n.id === args.element)
	) {
		console.error(`unknown --element=${args.element}`);
		process.exit(2);
	}
	let combos = COMBOS;
	if (args.bg) combos = combos.filter((c) => c.bg === args.bg && !c.print && !c.realprint);
	if (combos.length === 0) {
		console.error(`no combos match --bg=${args.bg}`);
		process.exit(2);
	}

	for (const e of elements) {
		// Mirrors entry.ts's own `fixtures[fixtureName] ?? fixtures['default']` fallback:
		// an explicit --fixture that this element doesn't have falls back to 'default'
		// (zero behavior change for any pre-existing invocation). With no --fixture flag,
		// shoot every fixture the element declares (still just ['default'] for 31 of 32
		// elements today).
		const fixtureNames = args.fixture
			? e.fixtures.includes(args.fixture)
				? [args.fixture]
				: ['default']
			: e.fixtures;
		for (const fixtureName of fixtureNames) {
			const outId = fixtureName === 'default' ? e.id : `${e.id}-${fixtureName}`;
			for (const c of combos) {
				await snap(page, c, { element: e.id, fixture: fixtureName }, outId);
			}
		}
	}
	// SC-121 Batch 4 (batch-3 review L-5): narrow-width captures, declared by the page
	// (manifest.narrowShots — entry.ts NARROW_SHOTS). Same combo matrix as an element,
	// output under the entry's own id so it can never overwrite the full-width golden.
	// Filtered by --element like everything else: --element=perk shoots perk AND the
	// narrow entries derived from it, so a narrowed run still sees them.
	for (const n of narrowShots) {
		if (args.element && args.element !== n.element && args.element !== n.id) continue;
		for (const c of combos) {
			await snap(page, c, { element: n.element, fixture: n.fixture, width: String(n.width) }, n.id);
		}
	}
	// SC-117 Batch 6 (catalog consumer #16): interaction shots, declared by the page
	// (manifest.interactionShots — entry.ts INTERACTION_SHOTS). Same combo matrix and
	// --element filtering as narrowShots; the click happens inside snap() between
	// mount-done and the screenshot.
	for (const n of interactionShots) {
		if (args.element && args.element !== n.element && args.element !== n.id) continue;
		for (const c of combos) {
			await snap(page, c, { element: n.element, fixture: n.fixture }, n.id, { click: n.click });
		}
	}
	// SC-123: preference-variant shots, declared by the page (manifest.prefShots —
	// entry.ts PREF_SHOTS). Same combo matrix and --element filtering as the lists
	// above; the values are applied to the harness PreferenceStore before mount, so a
	// pref that changes DOM shape is captured as it is really built.
	for (const n of prefShots) {
		if (args.element && args.element !== n.element && args.element !== n.id) continue;
		const prefParam = Object.entries(n.prefs)
			.map(([k, v]) => `${k}:${v}`)
			.join(',');
		for (const c of combos) {
			await snap(page, c, { element: n.element, fixture: n.fixture, prefs: prefParam }, n.id);
		}
	}
	// SC-160: scroll-state shots, declared by the page (manifest.scrollShots — entry.ts
	// SCROLL_SHOTS). The page turns #mount into a real scroll container and scrolls it
	// before signalling done, so the ordinary `#mount` element screenshot below captures
	// the clipped, SCROLLED view — no new screenshot path is needed here.
	for (const n of scrollShots) {
		if (args.element && args.element !== n.element && args.element !== n.id) continue;
		for (const c of combos) {
			const params = {
				element: n.element,
				fixture: n.fixture,
				scroll: String(n.scroll),
				scrollTo: String(n.scrollTo),
			};
			if (n.width) params.width = String(n.width);
			if (n.prefs) {
				params.prefs = Object.entries(n.prefs)
					.map(([k, v]) => `${k}:${v}`)
					.join(',');
			}
			await snap(page, c, params, n.id);
		}
	}
	// SC-169: element-chrome shots — a STACK of elements, an optional hover, an optional
	// mobile branch and optional #mount padding (the panel is painted above the element's
	// top edge, and the shot is the #mount locator). The print combo is captured
	// deliberately: it is the standing proof that the panel and the collapsed one-line
	// form are absent from the print scheme.
	for (const n of chromeShots) {
		if (args.element && args.element !== n.id) continue;
		for (const c of combos) {
			// SC-170 review fix (M-1/M-4): hand the COMBO to snap(); it owns theme/bg, the
			// `print=1` param, the print MEDIUM, `--readonly` and the output name. This loop
			// only contributes the chrome-specific query params.
			const params = {
				stack: n.stack.map((e) => `${e.element}:${e.fixture}`).join(','),
			};
			if (n.pad) params.pad = String(n.pad);
			if (n.mobile) params.mobile = '1';
			if (n.prefs) {
				params.prefs = Object.entries(n.prefs)
					.map(([k, v]) => `${k}:${v}`)
					.join(',');
			}
			await snap(page, c, params, n.id, { hover: n.hover });
		}
	}
	if (!args.element) {
		for (const c of combos.filter((c) => !c.print && !c.realprint)) {
			await snap(page, c, { gallery: '1' }, 'gallery');
		}
		// SC-169 round 2 — the geometry gate behind `chrome-placement-trio` and
		// `chrome-border-winded`. Skipped on a narrowed run for the same reason the gallery
		// is: it needs its own navigations and proves a cross-element invariant.
		await assertChromePlacement(page);
	}
} catch (e) {
	// Anything that escapes snap()'s own try/catch (e.g. the manifest load itself
	// failing) still gets a curated failure entry instead of an uncaught crash.
	failures.push({ outName: 'sweep', errors: ['exception: ' + String(e)] });
	console.log(`FAIL sweep (exception)`);
} finally {
	await browser.close();
}

// SC-170 — the in-run PARITY ASSERTION, and the actual regression gate for this ticket.
//
// The preview twin and real paper are supposed to be the SAME rendering: the plugin
// stamps data-dse-print="on" for the duration of real print media, so both surfaces
// resolve through one set of rules, and the print value block outranks every theme
// block on both. If a future Steel rule leaks onto paper — the pre-SC-170 state, where
// paper kept the forged plate while the preview showed plain ink — these two PNGs stop
// matching, byte for byte, and this fails the sweep.
//
// Byte equality is achievable (and therefore the assertion) rather than a looser
// computed-style check because the twin does not just share the print VALUES: the print
// RULES (force-open collapsibles, hidden inert chrome, break-inside, print-color-adjust)
// are mirrored for the attribute surface too, so nothing is left that only `@media print`
// can express.
// SC-170 review fix (L-2): the comparison is driven by `produced` — what THIS run wrote —
// not by a directory listing. A narrowed run used to re-hash whatever a previous full
// sweep had left lying around and report a capture count it never took.
//
// SC-170 review fix (M-4), the COVERAGE half: a capture id that produced one print class
// and not the other fails the run. Byte parity alone cannot see a missing capture — the
// SC-160 regression that started this fix round produced both files, so only the byte
// check caught it; a future loop that skips the realprint combo entirely would produce
// neither complaint. Requiring the two classes to come in pairs closes that.
function assertPrintTwinParity() {
	const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(shotsDir, f))).digest('hex');
	const mismatched = [];
	const missingRealprint = [];
	const missingTwin = [];
	let compared = 0;
	for (const [key, byCombo] of produced) {
		const twin = byCombo.get('steel-print');
		const real = byCombo.get('steel-realprint');
		if (!twin && !real) continue; // e.g. a --bg= narrowed run: neither print class shot
		if (!real) {
			missingRealprint.push(key);
			continue;
		}
		if (!twin) {
			missingTwin.push(key);
			continue;
		}
		compared++;
		if (sha(twin) !== sha(real)) mismatched.push(key);
	}
	if (missingRealprint.length || missingTwin.length) {
		console.error(
			`\nPRINT-CLASS COVERAGE VIOLATED — a capture produced one print class but not the ` +
				`other, so the two surfaces were never compared:\n` +
				missingRealprint.map((k) => `  ${k}: twin shot, NO realprint`).join('\n') +
				(missingRealprint.length && missingTwin.length ? '\n' : '') +
				missingTwin.map((k) => `  ${k}: realprint shot, NO twin`).join('\n') +
				`\nEvery sweep loop must run the full COMBOS list through snap(page, combo, …).`,
		);
		process.exit(1);
	}
	if (compared === 0) return;
	if (mismatched.length) {
		console.error(
			`\nPRINT-TWIN PARITY VIOLATED — ${mismatched.length}/${compared} capture id(s) render ` +
				`differently on paper than in the print preview:\n  ${mismatched.join('\n  ')}\n` +
				`A Steel rule is reaching real @media print (or the print value block lost a ` +
				`specificity race). See styles-source.css's print/export layer and ` +
				`src/framework/printMedia.ts.`,
		);
		process.exit(1);
	}
	console.log(`\nprint-twin parity OK (${compared} capture ids byte-identical: preview twin === real print)`);
}

if (failures.length) {
	console.error(`\n${failures.length} shot(s) had errors:`);
	for (const f of failures) console.error(`  ${f.outName}: ${f.errors.join(' | ')}`);
	process.exit(1);
}
assertPrintTwinParity();
console.log(`\nall shots written to ${shotsDir}`);
