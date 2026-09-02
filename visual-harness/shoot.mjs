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
// SC-205: the drift pin for OBSIDIAN_HOST_BUTTON_CSS — reads the installed Obsidian's own
// app.css so the host model below cannot go stale unnoticed.
import {
	findObsidianAsar,
	readAsarFile,
	extractReachingButtonRules,
	partitionButtonRules,
	iterRules,
	PINNED_OBSIDIAN,
	PINNED_TOKENS,
	normalizeTokenValue,
} from './obsidian-host-pin.mjs';

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

// SC-204 — how far a flush child's corner arc may sit from its parent's INNER arc.
// Both arcs are anchored on the same point, so any real difference is visible from the
// first device pixel; the budget only exists so `calc()`/layout rounding is not a false
// red. The two defects this catches measured 2.09px (hero region strip) and 3.00px
// (initiative turn button) — two orders of magnitude clear of it.
const NESTED_RADIUS_EPSILON = 0.25;
/** Sub-pixel slack for "is this child's corner ON its parent's padding-box corner". */
const NESTED_FLUSH_EPSILON = 0.35;
/** Deduplicated `assertNestedCornerRadius` findings: key → one report line. */
const nestedRadiusProblems = new Map();

// SC-204 — THE FLUSH-CHILD-AT-A-ROUNDED-CORNER GATE, and the reason this whole class of
// bug is not allowed to come back a third time.
//
// The shape: a child whose border box sits FLUSH in a rounded parent's padding box draws
// its corners AT that parent's corners, so its radius has exactly one correct value —
// `parentRadius - parentBorderWidth`. Anything else is visible:
//   - a TIGHTER child arc bulges OUTSIDE the parent's inner arc and, because a
//     non-positioned child's background paints AFTER its parent's border and these cards
//     are `overflow: visible` on purpose, it paints over the parent's hairline for the
//     whole 90 degrees (SC-189: the sb/fb head band, and check (c) above);
//   - a LOOSER one cuts the child's own fill back off the corner and shows a wedge of the
//     parent's fill where the child's should be (SC-204: the hero region header strip).
// `--dse-radius` is `0.4em`, and a custom property holding an `em` re-resolves against
// whichever element USES it — so writing `var(--dse-radius)` on both halves of such a pair
// looks right and silently is not. That is how both defects were authored.
//
// WHY IT LIVES HERE rather than in jsdom: the predicate is pure LAYOUT — box positions,
// used border widths, computed radii in px — and jsdom computes none of it. Every capture
// this sweep already navigates to gets probed, so the gate costs no extra page loads and
// covers every fixture, width, preference variant and both schemes.
//
// THE GUARDS, each of which is a real thing in this tree and not defensive padding:
//   - the child must actually PAINT (a background colour with alpha, or an image);
//   - nothing between the child and that parent may CLIP (`overflow` other than visible) —
//     a clipping ancestor rounds the child for you, which is how `.dse-pr__row` and
//     `.dse-prj__bar-fill` are legitimately square inside rounded parents;
//   - the parent's border must be VISIBLE (width > 0, colour alpha > 0). A collapsed
//     element's root keeps its border for width but sets `border-color: transparent` and
//     `background: none`, so its `.dse-chrome-summary` child has no hairline to damage and
//     no fill to expose — geometry alone would report 8 phantom corners there.
/** Runs inside the page; must be standalone/serialisable (no module-scope closure). */
function probeNestedCorners({ flushEps, radiusEps }) {
	const root = document.querySelector('#mount');
	if (!root) return [];
	const alpha = (c) => {
		const m = String(c).match(/rgba?\(([^)]+)\)/);
		if (!m) return 1;
		const p = m[1].split(',').map((x) => parseFloat(x));
		return p.length > 3 ? p[3] : 1;
	};
	const cache = new Map();
	const read = (el) => {
		if (cache.has(el)) return cache.get(el);
		const cs = getComputedStyle(el);
		const v = {
			r: el.getBoundingClientRect(),
			radii: {
				tl: parseFloat(cs.borderTopLeftRadius) || 0,
				tr: parseFloat(cs.borderTopRightRadius) || 0,
				br: parseFloat(cs.borderBottomRightRadius) || 0,
				bl: parseFloat(cs.borderBottomLeftRadius) || 0,
			},
			bw: {
				top: parseFloat(cs.borderTopWidth) || 0,
				right: parseFloat(cs.borderRightWidth) || 0,
				bottom: parseFloat(cs.borderBottomWidth) || 0,
				left: parseFloat(cs.borderLeftWidth) || 0,
			},
			bc: {
				top: alpha(cs.borderTopColor),
				right: alpha(cs.borderRightColor),
				bottom: alpha(cs.borderBottomColor),
				left: alpha(cs.borderLeftColor),
			},
			clips: cs.overflow !== 'visible',
			paints: alpha(cs.backgroundColor) > 0.001 || cs.backgroundImage !== 'none',
		};
		cache.set(el, v);
		return v;
	};
	const name = (el) => {
		let s = el.tagName.toLowerCase();
		const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
		if (cls.length) s += '.' + cls.slice(0, 3).join('.');
		if (el.hasAttribute('data-dse-element')) s += `[data-dse-element=${el.getAttribute('data-dse-element')}]`;
		return s;
	};
	// x/y name the rect side the corner sits on; `sgn` walks inward from it.
	const CORNERS = [
		{ k: 'tl', x: 'left', y: 'top', sx: 'left', sy: 'top' },
		{ k: 'tr', x: 'right', y: 'top', sx: 'right', sy: 'top' },
		{ k: 'br', x: 'right', y: 'bottom', sx: 'right', sy: 'bottom' },
		{ k: 'bl', x: 'left', y: 'bottom', sx: 'left', sy: 'bottom' },
	];
	const sgn = { left: 1, top: 1, right: -1, bottom: -1 };
	const found = [];
	for (const el of [root, ...root.querySelectorAll('*')]) {
		const v = read(el);
		if (!v.paints || v.r.width < 2 || v.r.height < 2) continue;
		for (const C of CORNERS) {
			let a = el.parentElement;
			let clipped = false;
			let p = null;
			while (a && a !== document.body) {
				const av = read(a);
				if (av.clips) clipped = true;
				if (av.radii[C.k] > 0.5) {
					p = av;
					break;
				}
				a = a.parentElement;
			}
			if (!p || clipped || p.clips) continue;
			const bwx = p.bw[C.sx];
			const bwy = p.bw[C.sy];
			if (bwx <= 0 || bwy <= 0) continue; // no hairline to damage, no inset to honour
			if (p.bc[C.sx] <= 0.001 || p.bc[C.sy] <= 0.001) continue; // border is invisible
			const dx = Math.abs(v.r[C.x] - (p.r[C.x] + sgn[C.x] * bwx));
			const dy = Math.abs(v.r[C.y] - (p.r[C.y] + sgn[C.y] * bwy));
			if (dx > flushEps || dy > flushEps) continue; // not flush at this corner
			const want = p.radii[C.k] - Math.max(bwx, bwy);
			const got = v.radii[C.k];
			if (Math.abs(got - want) <= radiusEps) continue;
			found.push({
				key: `${name(el)}|${name(a)}|${C.k}|${got.toFixed(2)}|${want.toFixed(2)}`,
				child: name(el),
				parent: name(a),
				corner: C.k,
				got,
				want,
				parentRadius: p.radii[C.k],
				parentBorder: Math.max(bwx, bwy),
			});
		}
	}
	return found;
}

function assertNestedCornerRadius() {
	if (!nestedRadiusProblems.size) {
		console.log(
			`\nnested corner-radius OK (no child sits flush in a rounded, bordered parent with a ` +
				`radius other than the parent's own inner radius)`,
		);
		return;
	}
	console.error(
		`\nNESTED CORNER-RADIUS VIOLATED — ${nestedRadiusProblems.size} child/parent corner(s) ` +
			`sit flush at a rounded parent's padding-box corner with the wrong radius, so the ` +
			`child paints over the parent's hairline (tighter) or shows the parent's fill through ` +
			`its own corner (looser):\n` +
			[...nestedRadiusProblems.values()].map((p) => `  ${p}`).join('\n') +
			`\nA flush child's radius is its parent's radius MINUS the parent's border width. ` +
			`\`var(--dse-radius)\` cannot express that: it is \`0.4em\` and re-resolves in the ` +
			`child's own font size. Give the parent a named \`rem\` radius (see ` +
			`--dse-plate-radius / --dse-region-radius in styles-source.css) and derive the child ` +
			`with calc(... - 1px).`,
	);
	process.exit(1);
}

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
		// SC-204 — probe AFTER the screenshot (it only reads, but the ordering makes it
		// impossible for the gate to influence a frozen byte) and only on a clean mount,
		// since an error card's geometry is not the geometry under test.
		if (!errors.length) {
			for (const p of await page.evaluate(probeNestedCorners, {
				flushEps: NESTED_FLUSH_EPSILON,
				radiusEps: NESTED_RADIUS_EPSILON,
			})) {
				if (nestedRadiusProblems.has(p.key)) continue;
				nestedRadiusProblems.set(
					p.key,
					`${p.child} [${p.corner}] is ${p.got.toFixed(2)}px inside ${p.parent} ` +
						`(radius ${p.parentRadius.toFixed(2)}px, border ${p.parentBorder.toFixed(2)}px ` +
						`→ inner ${p.want.toFixed(2)}px) — first seen in ${outName}`,
				);
			}
		}
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

// SC-189 ROUND 3 — the HOST-LEAK gate. Scott's four defects of 2026-08-25 all traced to one
// cause: a kit `.dse-btn` is a real `<button>`, so Obsidian's own app.css reaches it, and
// nothing in styles-source.css ever declared `box-shadow` for a chrome button. The panel
// therefore wore Obsidian's five-layer `--input-shadow` — a bright inset ring stacked under
// the panel's own E3 crown, and three DOWNWARD drop shadows that spilled past the panel's
// (border-less, padding-less) bottom edge onto the card's top border row.
//
// The camera could never see it: `visual-harness/index.html` ships none of Obsidian's
// `button` defaults, so every shot in this sweep renders a host that does not exist. That is
// the structural gap this assertion closes — it INJECTS the real rules (copied verbatim from
// /opt/Obsidian/resources/obsidian.asar → app.css, Obsidian 1.8.10) and then measures, so the
// rules that neutralise them are pinned rather than assumed.
//
// SC-189 ROUND 4 — the block below now carries Obsidian's WHOLE base `button` rule, not just
// the two shadow-bearing ones round 3 needed. Round 3 shipped with a second, unfixed instance
// of the same omission (`height: var(--input-height)` = 30px, which a `min-height` cannot
// beat, inflating the panel 21.39px → 31.00px in a real vault) and the narrow injection is
// exactly why the gate could not see it. Modelling the full rule means the box-invariance
// check below tests every declaration the host actually makes, not a hand-picked subset.
//
// SC-203 — the block below was RE-READ OUT OF A LIVE OBSIDIAN, and that mattered. Rounds 3-4
// hand-copied it from the 1.8.10 asar; Obsidian has since self-updated, and one of the
// differences is load-bearing:
//   * `color: var(--text-color)` MOVED ONTO `button:not(.clickable-icon)` — (0,1,1), which
//     beats the kit's `.dse-btn { color: var(--dse-fg) }` (0,1,0). Every button in the plugin
//     was wearing Obsidian's --text-normal instead of the Steel token, and the old copy —
//     which had `color` only on the (0,0,1) `button` rule, where the kit wins — could not see
//     it. A stale model of the host is a gate that reports a leak-free plugin.
//
// SC-205 — SC-203's OTHER conclusion, that "`button:hover` NO LONGER EXISTS", WAS WRONG, and
// its method is why. That round walked a live `document.styleSheets` for rules matching a
// rendered `.dse-btn`; the walk did not descend into `@media`, and `button:hover` lives
// inside `@media (hover: hover)`. Obsidian 1.13.7 aims SIX rules at an ordinary desktop
// plugin button and this copy carried two. The four that were missing: `button:hover`,
// `button:focus-visible` and the `[disabled]` group (each (0,1,1)), plus the
// `@media (forced-colors: active)` rule — together with the two tokens they read
// (`--input-shadow-hover`, `--background-modifier-border-focus`). All six are now modelled,
// and the sweep below samples REST, HOVER and FOCUS-VISIBLE rather than resting state alone.
// THREE smaller drifts fell out of the same re-read: the base rule's `app-region` is really
// `-webkit-app-region`, it has gained `corner-shape`, and dark `--interactive-hover` had
// moved #363636 -> #3f3f3f.
//
// Provenance (SC-205): extracted from the app.css inside **Obsidian 1.13.7**, read straight
// out of `~/.config/obsidian/obsidian-1.13.7.asar`. That is the SELF-UPDATED asar Obsidian
// actually runs — `/opt/Obsidian/resources/obsidian.asar` (which the SC-189 comment named)
// is the installer's copy and on this machine is years stale, which is one way the model
// rotted. Copied verbatim, whitespace aside.
//
// DO NOT hand-edit this from memory: `assertHostCopyPinnedToObsidian` below re-extracts the
// same rules and tokens from the installed Obsidian on every `npm run shots` and fails loudly
// on any drift, so an edit that is not what Obsidian ships will be caught, not absorbed.
//
// It runs on its own navigations and captures nothing, so no shot's bytes depend on it.
const OBSIDIAN_HOST_BUTTON_CSS = `
.theme-dark {
  --input-shadow: inset 0 0.5px 0.5px 0.5px rgba(255, 255, 255, 0.09),
    0 2px 4px 0 rgba(0, 0, 0, 0.15), 0 1px 1.5px 0 rgba(0, 0, 0, 0.1),
    0 1px 2px 0 rgba(0, 0, 0, 0.2), 0 0 0 0 transparent;
  --input-shadow-hover: inset 0 0.5px 1px 0.5px rgba(255, 255, 255, 0.16),
    0 2px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 1.5px 0 rgba(0, 0, 0, 0.2),
    0 1px 2px 0 rgba(0, 0, 0, 0.4), 0 0 0 0 transparent;
  --interactive-normal: #333333; --interactive-hover: #3f3f3f; --text-normal: #dadada;
  --background-modifier-border-focus: #555555;
}
.theme-light {
  --input-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12),
    0 1px 2px 0 rgba(0, 0, 0, 0.065), 0 0 0 0 transparent;
  --input-shadow-hover: inset 0 0 0 1px rgba(0, 0, 0, 0.17),
    0 1px 2px 0 rgba(0, 0, 0, 0.1), 0 0 0 0 transparent;
  --interactive-normal: #ffffff; --interactive-hover: #fafafa; --text-normal: #222222;
  --background-modifier-border-focus: #bdbdbd;
}
/* The tokens Obsidian's button rules read, at their DESKTOP values — i.e. what app.css
   resolves them to with only \`theme-dark\`/\`theme-light\` on <body>. Obsidian's own
   \`.is-mobile\` and \`.mod-macos\` scopes move several of them (\`--input-shadow: none\`,
   a superellipse corner shape) and are deliberately not modelled: the plugin is gated for
   desktop Linux/Windows here, and modelling every platform would make the sweep demand
   re-groundings for hosts this camera never renders. \`assertHostCopyPinnedToObsidian\`
   re-resolves each of these against the real app.css under the same body classes, so the
   snapshot cannot silently rot the way \`--interactive-hover\` did. */
body {
  --font-ui-small: 13px; --button-radius: 5px; --button-corner-shape: round;
  --input-height: 30px; --input-font-weight: 400; --size-4-1: 4px; --size-4-3: 12px;
  --cursor: default;
}
button {
  --text-color: var(--text-normal);
  -webkit-app-region: no-drag;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
  font-size: var(--font-ui-small);
  border-radius: var(--button-radius);
  corner-shape: var(--button-corner-shape);
  border: 0;
  padding: var(--size-4-1) var(--size-4-3);
  height: var(--input-height);
  font-weight: var(--input-font-weight);
  cursor: var(--cursor);
  font-family: inherit;
  outline: none;
  user-select: none;
  white-space: nowrap;
}
button:not(.clickable-icon) {
  color: var(--text-color);
  background-color: var(--interactive-normal);
  box-shadow: var(--input-shadow);
}
@media (hover: hover) {
  button:hover {
    background-color: var(--interactive-hover);
    box-shadow: var(--input-shadow-hover);
  }
}
button:focus-visible {
  box-shadow: 0 0 0 3px var(--background-modifier-border-focus);
}
button[disabled],
button[aria-disabled="true"],
button[disabled="true"] {
  cursor: not-allowed;
  opacity: 0.7;
}
/* MODELLED, DELIBERATELY NOT MEASURED — a scoping decision, not a capability limit.
   Playwright CAN emulate this: \`page.emulateMedia({ forcedColors: 'active' })\` would make
   the query match and one extra rest-only pass would measure it. SC-205 chose not to, and
   the reasons are worth stating so a future round can re-decide rather than re-derive:
   Windows high-contrast is a niche mode this plugin has never been reviewed in, the host
   rule is a single border declaration, and the drift pin covers the rule's EXISTENCE either
   way. It is copied here so the pin compares Obsidian's whole reaching set — a rule left out
   of the copy is exactly how the four above went missing for two rounds. */
@media (forced-colors: active) {
  button {
    border: 1px ButtonBorder solid;
  }
}
`;

/** SC-203 — inject the host sheet the way a real vault does: app.css FIRST, the plugin's
 *  styles.css after it. Playwright's `addStyleTag` appends, which hands every
 *  equal-specificity tie to the host and invents leaks the plugin does not have —
 *  `button.dse-pr__row { background: transparent }` (0,1,1) vs
 *  `button:not(.clickable-icon)` (0,1,1) is exactly such a tie, and a real Obsidian
 *  resolves it to the plugin (measured). Prepending models the real cascade. */
async function injectHostCss(page) {
	const handle = await page.addStyleTag({ content: OBSIDIAN_HOST_BUTTON_CSS });
	await page.evaluate((el) => document.head.prepend(el), handle);
}

/** Read the pinned tokens off <body> under one scheme with `css` as the only stylesheet. */
async function readHostTokens(page, css, scheme) {
	await page.goto('about:blank');
	await page.addStyleTag({ content: css });
	return page.evaluate(
		({ tokens, cls }) => {
			document.body.className = cls;
			const cs = getComputedStyle(document.body);
			const out = {};
			for (const t of tokens) out[t] = cs.getPropertyValue(t);
			return out;
		},
		{ tokens: PINNED_TOKENS, cls: scheme === 'dark' ? 'theme-dark' : 'theme-light' },
	);
}

/** SC-205 — THE DRIFT PIN for OBSIDIAN_HOST_BUTTON_CSS.
 *
 *  Everything `assertBtnHostLeak` concludes rests on that copy being what Obsidian ships,
 *  and twice now it has not been (SC-189's two-of-five transcription; SC-203's
 *  `@media`-blind styleSheets walk, which deleted `button:hover` from the model). A model
 *  nothing checks rots into a gate that certifies a leak-free plugin, so this re-derives
 *  both halves from the installed Obsidian on every run:
 *
 *    RULES — the whole set of rules in the real app.css that reach a plain plugin button,
 *      compared as normalized text, in order. This catches a rule Obsidian ADDS just as
 *      loudly as one whose declarations move; a hand-picked list of rules to look for could
 *      not, which is the failure mode that produced this ticket.
 *    TOKENS — resolved in a real browser under the same `theme-dark`/`theme-light` body
 *      class, on BOTH sheets, and compared by value. They are pinned rather than excluded
 *      because the token block is where the copy rotted most quietly: SC-203 left dark
 *      `--interactive-hover` at #363636 long after Obsidian moved it to #3f3f3f, and no
 *      amount of rule-text checking would ever have said so. Resolving them through a
 *      browser (instead of chasing `var()` chains in the CSS text by hand) is what makes
 *      the comparison honest — `--button-radius` is `var(--input-radius)` in app.css and a
 *      literal `5px` in the copy, and both must resolve to the same thing.
 *
 *  No Obsidian on the machine (CI, a headless build box) is a printed SKIP and exit 0 —
 *  loud, never a silent pass. The sweep itself still runs: the copy is checked in, so it
 *  models a host whether or not this machine can prove the model current. */
/** SC-205 R5 / R4-M1 + R4-INFO — the sheet's [SC205-HOST-RULES] listing vs the in-code model.
 *
 *  BOTH OPERANDS ARE IN THE REPO, so this needs no Obsidian and runs on every machine. R3 put
 *  it after the asar gate's early returns, which pinned the sheet's copy on exactly one class
 *  of machine — one running Obsidian >= PINNED_OBSIDIAN. On CI, a headless box, or a fresh dev
 *  machine (the environments the SKIP path exists FOR) the second copy of the model was
 *  unchecked again: proven by pointing the pin at a 1.9.0-only home with a rule deleted from
 *  the fence and watching `npm run shots` exit 0 in silence. That is the precise condition
 *  HIGH-1 was raised about, so the check now runs first and on its own.
 *
 *  @returns {string[]} drift lines (empty when the listing matches) */
function checkSheetHostRuleListing(model) {
	const sheetPath = path.join(dir, '..', 'styles-source.css');
	let sheet;
	try {
		sheet = fs.readFileSync(sheetPath, 'utf8');
	} catch (e) {
		return [`could not read ${sheetPath} to check its [SC205-HOST-RULES] listing: ${String(e)}`];
	}
	// Exactly one fence, please. A non-greedy match against a duplicated block would silently
	// pin the first and ignore the second (R4-INFO).
	const opens = (sheet.match(/\[SC205-HOST-RULES\]/g) ?? []).length;
	const closes = (sheet.match(/\[\/SC205-HOST-RULES\]/g) ?? []).length;
	if (opens !== 1 || closes !== 1)
		return [
			`styles-source.css must contain exactly one [SC205-HOST-RULES] fence; found ${opens} ` +
				`opening and ${closes} closing markers — the sheet's listing of the host rules is not ` +
				`unambiguously pinned`,
		];
	const fence = /\[SC205-HOST-RULES\]([\s\S]*?)\[\/SC205-HOST-RULES\]/.exec(sheet);
	const listed = fence[1]
		.split('\n')
		.map((l) => l.replace(/^\s*\(\d,\d,\d\)\s*/, '').trim())
		.filter(Boolean);
	const modelled = model.map((x) => `${x.ctx ? `${x.ctx} { ` : ''}${x.sel}${x.ctx ? ' }' : ''}`);
	if (listed.join(' | ') === modelled.join(' | ')) return [];
	return [
		`styles-source.css's [SC205-HOST-RULES] listing does not match the model:\n` +
			`      sheet lists: ${listed.join(' ; ') || '(nothing)'}\n` +
			`      model has:   ${modelled.join(' ; ')}`,
	];
}

/** SC-205 R5 / R4-L3 — the assumption CHROME_REVEAL_CSS rests on, enforced.
 *
 *  The sweep mounts the chrome panel and the collapsed summary bar simultaneously, which the
 *  product never does. That is sound only while no `[data-dse-collapsed]`-keyed rule reaches a
 *  button, because then each button's cascade in the superposition equals its cascade in its
 *  real state. This asserts exactly that, statically, off the sheet the harness already reads
 *  — no extra navigation, no browser work.
 *
 *  @returns {string[]} problem lines (empty when the assumption holds) */
function checkCollapseCascadeAssumption() {
	let sheet;
	try {
		sheet = fs.readFileSync(path.join(dir, '..', 'styles-source.css'), 'utf8');
	} catch (e) {
		return [`could not read styles-source.css to check the collapse-cascade assumption: ${String(e)}`];
	}
	const offenders = iterRules(sheet)
		.map((r) => `${r.ctx} ${r.sel}`.replace(/\s+/g, ' ').trim())
		.filter((s) => s.includes('[data-dse-collapsed') && /\.dse-btn|\bbutton\b/.test(s));
	return offenders.map(
		(s) =>
			`a [data-dse-collapsed]-keyed rule now reaches a button: \`${s}\` — CHROME_REVEAL_CSS ` +
			`mounts the panel and the collapsed summary bar AT ONCE, so this button would be swept ` +
			`in a cascade it never has in the product. Drive the two collapse states as separate ` +
			`navigations, or scope the new rule off the button.`,
	);
}

async function assertHostCopyPinnedToObsidian(page) {
	const model = extractReachingButtonRules(OBSIDIAN_HOST_BUTTON_CSS);

	// FIRST, and unconditionally: the two in-repo copies of the model must agree, and the
	// sweep's mount-superposition assumption must still hold. Nothing below this point runs
	// without a local Obsidian, and both of these must.
	const sheetDrift = [...checkSheetHostRuleListing(model), ...checkCollapseCascadeAssumption()];
	if (sheetDrift.length) {
		console.error(
			`\nIN-REPO HOST-MODEL CHECK FAILED — styles-source.css and visual-harness/shoot.mjs ` +
				`disagree about Obsidian's button rules, or about what the sweep may assume:\n` +
				sheetDrift.map((d) => `  ${d}`).join('\n') +
				`\nObsidian is NOT involved in this one and nothing needs re-extracting: both operands ` +
				`are in the repo, which is why this check runs on every machine, with or without a ` +
				`local Obsidian. Fix the sheet or the model so they match, in one commit.`,
		);
		process.exit(1);
	}

	const found = findObsidianAsar();
	const skip = (why) => {
		console.log(
			`\nhost-copy pin PARTIAL — the styles-source.css [SC205-HOST-RULES] listing agrees with ` +
				`the model (checked; that needs no Obsidian), but the model could not be compared ` +
				`against Obsidian itself: ${why}. OBSIDIAN_HOST_BUTTON_CSS (extracted from Obsidian ` +
				`${PINNED_OBSIDIAN}) is UNVERIFIED on this machine; it is NOT known to be wrong. Run ` +
				`\`npm run shots\` on a machine running Obsidian ${PINNED_OBSIDIAN} or newer before ` +
				`trusting the button host-leak result below, and do NOT re-extract the copy from an ` +
				`older asar — that would replace the pinned model with a staler one for everyone.`,
		);
	};
	if (!found) {
		skip(
			`no installed Obsidian found (looked for ~/.config/obsidian/obsidian-<version>.asar and ` +
				`/opt/Obsidian/resources/obsidian.asar)`,
		);
		return;
	}
	// SC-205 R3 / MEDIUM-4. Never compare against an asar older than the modelled version, and
	// never against one whose version cannot be established. Round 1 fell back to the
	// version-less /opt installer copy — a Mar-2023 build here — whose button rules genuinely
	// differ, so on any box without a config-dir asar the pin reported DRIFT against the branch
	// under test and instructed a re-extract that would have downgraded the shared model.
	if (!found.usable) {
		skip(found.why);
		return;
	}
	const css = readAsarFile(found.path, 'app.css');
	if (!css) {
		skip(
			`${found.path} could not be read as an asar containing app.css (a partial download, or a ` +
				`format change)`,
		);
		return;
	}

	const drift = [];
	const { reaching: real, excluded, unaccounted } = partitionButtonRules(css);
	// SC-205 R5 / R4-M2 — the partition must be EXHAUSTIVE. A selector shape the parser cannot
	// classify used to leave both halves silently, which is how a comma inside `:is()` hid a
	// rule that ships today; the audit that called the partition complete used the same broken
	// split, so it agreed with the bug. A blind spot now fails the gate rather than shrinking
	// the printed boundary.
	for (const u of unaccounted)
		drift.push(`unclassifiable selector in Obsidian's app.css: "${u.fragment}" (in \`${u.sel}\`) — ${u.why}`);
	for (let i = 0; i < Math.max(real.length, model.length); i += 1) {
		const r = real[i];
		const m = model[i];
		const name = (x) => (x ? `${x.ctx ? `${x.ctx} { ` : ''}${x.sel}${x.ctx ? ' }' : ''}` : '(nothing)');
		if (!m) drift.push(`Obsidian has a rule the copy does not model: ${name(r)} { ${r.decls} }`);
		else if (!r) drift.push(`the copy models a rule Obsidian no longer has: ${name(m)} { ${m.decls} }`);
		else if (r.ctx !== m.ctx || r.sel !== m.sel)
			drift.push(`rule #${i + 1} is ${name(r)} in Obsidian but ${name(m)} in the copy`);
		else if (r.decls !== m.decls)
			drift.push(`${name(r)} declares\n      "${r.decls}"\n    in Obsidian but\n      "${m.decls}"\n    in the copy`);
	}

	for (const scheme of ['dark', 'light']) {
		const realTokens = await readHostTokens(page, css, scheme);
		const modelTokens = await readHostTokens(page, OBSIDIAN_HOST_BUTTON_CSS, scheme);
		for (const t of PINNED_TOKENS) {
			const a = normalizeTokenValue(realTokens[t]);
			const b = normalizeTokenValue(modelTokens[t]);
			if (a !== b) drift.push(`${scheme}: ${t} is "${a}" in Obsidian but "${b}" in the copy`);
		}
	}

	if (drift.length) {
		// SC-205 R5 / R4-L1 — the remedy has to match the drift. Everything reaching this point
		// IS an Obsidian-vs-model disagreement (the in-repo sheet listing is checked separately,
		// above, and prints its own in-repo remedy), so re-extracting is the right instruction
		// here and only here.
		console.error(
			`\nHOST COPY DRIFTED — the host model in visual-harness/shoot.mjs no longer matches the ` +
				`app.css of the Obsidian installed here (${found.path}, version ${found.version}):\n` +
				drift.map((d) => `  ${d}`).join('\n') +
				`\nThe button host-leak sweep below is only as true as that copy, so fix the copy ` +
				`FIRST — re-extract from THIS asar (it is ${found.version}, at or newer than the pinned ` +
				`${PINNED_OBSIDIAN}), bump PINNED_OBSIDIAN and the provenance comment, keep the ` +
				`styles-source.css [SC205-HOST-RULES] listing in step, and then re-run: the sweep may ` +
				`have real new leaks to close. (An unclassifiable-selector line means the opposite: ` +
				`Obsidian shipped a selector shape obsidian-host-pin.mjs cannot parse — teach the ` +
				`parser, do not re-extract around it.)`,
		);
		process.exit(1);
	}
	console.log(
		`\nhost-copy pin OK (${model.length} button-reaching rules + ${PINNED_TOKENS.length} tokens ` +
			`× dark/light + the styles-source.css listing: the host model is verbatim Obsidian ` +
			`${found.version}; ${excluded.length} further rules whose subject is a plain button were ` +
			`excluded by documented ancestor scope, 0 unclassifiable — see EXCLUDED_ANCESTOR_SCOPES)`,
	);
}

// The families the panel has to look right on, one per CARD SHAPE and — for the statblock —
// per ROLE HUE, because Scott reported this on an Artillery band (purple) and every earlier
// round only ever looked at the leader-grey one. `role` is applied exactly the way
// src/elements/roleTint.ts applies it (attribute + the --dse-role alias).
const CHROME_HOSTLEAK_CASES = [
	{ element: 'statblock', frame: '.dse-sb', role: 'artillery' },
	{ element: 'statblock', frame: '.dse-sb', role: 'harrier' },
	{ element: 'statblock', frame: '.dse-sb', role: null },
	{ element: 'featureblock', frame: '[data-dse-element="featureblock"]', role: null },
	{ element: 'feature', frame: '[data-dse-element="feature"]', role: null },
	{ element: 'hero', frame: '.dse-hero', role: null },
	{ element: 'stamina-bar', frame: '.dse-stamina__cluster', role: null },
	{ element: 'kit', frame: '.dse-card', role: null },
];
/** Max per-channel darkening of the card's top border row allowed under the panel.
 *  Measured floor is 3/255: the tail of the panel's OWN sanctioned E3 upward cast shadow
 *  (`0 -3px 7px`), which Chromium blurs a fraction of a pixel past the panel's bottom edge.
 *  The defect this catches was 20/255 (dark) — it drove the border row BELOW the page
 *  background behind the card, which is what "the border cuts off at the corner" looked
 *  like. 8 sits clear of both. */
const BORDER_OCCLUSION_MAX = 8;
/** SC-189 R4 — how far the panel's box may drift when Obsidian's `button` rule is present.
 *  The plugin declares the panel's size in `em`, so with the host absent and present the two
 *  measurements come from the same declarations and are bit-identical; a sub-pixel budget is
 *  kept only so a future `calc()` rounding difference is not a false red. The defect this
 *  catches was 9.61px. */
const BOX_EPSILON = 0.05;
/** SC-189 R5 — how far the card's hairline may drift AROUND THE TOP-RIGHT ARC from what the
 *  same hairline reads on the straight top and right edges either side of it.
 *
 *  Check (b) below samples the border row under the panel and 40px to its left — both on the
 *  STRAIGHT top edge — so it said nothing at all about the corner, and the corner is what
 *  Scott reported three rounds running ("The border of the card is still lost in the corner.
 *  Top border looks good. Right border looks good. At the corner it fades away."). Measured
 *  at this sweep's dsf 2, mid-ring, with the defect present:
 *    statblock[harrier]  Δ53   statblock[artillery] Δ44   roleless statblock Δ26
 *    featureblock        Δ27   every headerless family    Δ≤8
 *  and with it fixed the worst of all sixteen family/scheme combos is Δ7. 12 sits clear of
 *  both. The residual floor is the stamina bar, whose plate carries its own state colour, so
 *  its arc legitimately does not match its straight edges to the last count. */
const CORNER_ARC_MAX = 12;
/** Where on the arc to sample. 30°/45°/60° is the middle of the quarter turn — far enough
 *  from either straight edge that a defect cannot hide in the blend, and far enough from the
 *  ends that a 6.4px-radius card (feature/hero/kit) still has real ring to land on. */
const CORNER_ARC_ANGLES = [60, 45, 30];

/** Read the chrome panel's box + its buttons' shadows. Runs inside the page, so it must be a
 *  standalone serialisable function (no closure over module scope). */
function probeChrome(sel) {
	const frameEl = document.querySelector(sel);
	const f = frameEl.getBoundingClientRect();
	const fcs = getComputedStyle(frameEl);
	const panel = document.querySelector('.dse-chrome');
	const p = panel.getBoundingClientRect();
	const btns = [...panel.querySelectorAll('.dse-btn')];
	const b = btns.length ? btns[0].getBoundingClientRect() : null;
	return {
		shadows: [...document.querySelectorAll('.dse-chrome .dse-btn, .dse-chrome-summary .dse-btn')].map(
			(n) => getComputedStyle(n).boxShadow,
		),
		panelH: p.height,
		panelW: p.width,
		btnH: b ? b.height : null,
		btnW: b ? b.width : null,
		frameTop: f.top,
		frameLeft: f.left,
		// SC-189 R5 — the card's top-RIGHT corner, so the arc check below can find the ring.
		frameRight: f.right,
		frameRadius: parseFloat(fcs.borderTopRightRadius),
		frameBorderTop: parseFloat(fcs.borderTopWidth),
		panelMidX: (p.left + p.right) / 2,
		panelBottom: p.bottom,
		gap: f.top - p.bottom,
	};
}

/** Decode a PNG buffer and read pixels, using the page's own canvas (no new dependency). */
async function readPixels(page, buf, points) {
	return page.evaluate(
		async ({ url, pts }) => {
			const img = new Image();
			img.src = url;
			await img.decode();
			const c = document.createElement('canvas');
			c.width = img.width;
			c.height = img.height;
			const g = c.getContext('2d');
			g.drawImage(img, 0, 0);
			return pts.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3));
		},
		{ url: 'data:image/png;base64,' + buf.toString('base64'), pts: points },
	);
}

async function assertChromeHostLeak(page) {
	const problems = [];
	let checked = 0;
	for (const bg of ['dark', 'light']) {
		for (const c of CHROME_HOSTLEAK_CASES) {
			const query = new URLSearchParams({
				stack: `${c.element}:default`,
				theme: 'steel',
				bg,
				pad: '56',
				prefs: 'authoringControls:true',
			});
			const id = `${c.element}${c.role ? `[${c.role}]` : ''}/${bg}`;
			await page.emulateMedia({ media: 'screen' });
			await page.goto(`${pageUrl}?${query}`);
			await page.waitForFunction(() => window.__dseHarnessDone !== undefined, null, { timeout: 15000 });
			if (c.role) {
				await page.evaluate(
					({ sel, role }) => {
						const card = document.querySelector(sel);
						card.setAttribute('data-dse-role', role);
						card.style.setProperty('--dse-role', `var(--dse-role-${role})`);
					},
					{ sel: c.frame, role: c.role },
				);
			}
			// Hover WITHOUT locator.hover(): that scrolls a tall card into view and takes the
			// above-the-edge panel off the top of the frame, which is the thing being sampled.
			const probe = await page.evaluate((sel) => {
				const f = document.querySelector(sel);
				const panel = document.querySelector('.dse-chrome');
				if (!f || !panel) return null;
				const r = f.getBoundingClientRect();
				return { x: r.left + 20, y: r.top + 20 };
			}, c.frame);
			if (!probe) {
				problems.push(`${id}: missing ${c.frame} or .dse-chrome`);
				continue;
			}
			await page.mouse.move(probe.x, probe.y);
			// SC-189 R4: measure the panel's box with NO host CSS first — that is the box every
			// shot in this sweep, every review render and every DESIGN.md statement describes.
			const bare = await page.evaluate(probeChrome, c.frame);
			await injectHostCss(page);
			const m = await page.evaluate(probeChrome, c.frame);
			checked += 1;
			// (a) The rule that does the work. `none`, on every chrome button, in both schemes.
			const leaked = m.shadows.filter((s) => s !== 'none');
			if (m.shadows.length === 0) problems.push(`${id}: no chrome buttons found to check`);
			if (leaked.length) problems.push(`${id}: chrome button box-shadow is "${leaked[0]}", expected "none"`);
			// (a2) SC-189 R4 — THE BOX IS THE PLUGIN'S. Obsidian's base `button` rule sets
			//      `height: var(--input-height)` (30px), which no `min-height` can beat; it
			//      inflated the panel by 9.6px in every real vault while the camera, seeing no
			//      host, drew the short one. Rather than pin that one property, this asserts
			//      the whole panel box is INVARIANT under the host's rules — so the next host
			//      declaration the sheet forgets to re-ground fails the sweep by size.
			for (const [k, label] of [
				['panelH', 'panel height'],
				['panelW', 'panel width'],
				['btnH', 'button height'],
				['btnW', 'button width'],
			]) {
				if (bare[k] === null || m[k] === null) continue;
				if (Math.abs(m[k] - bare[k]) > BOX_EPSILON) {
					problems.push(
						`${id}: Obsidian's \`button\` rule changes the ${label} — ` +
							`${bare[k].toFixed(2)}px without the host, ${m[k].toFixed(2)}px with it ` +
							`(max drift ${BOX_EPSILON}px)`,
					);
				}
			}
			// (b) The consequence, in pixels: the card's top border row must read the same
			//     UNDER the panel as it does 40px to the panel's left, i.e. the hairline is
			//     continuous across the panel's whole horizontal span.
			if (m.gap < -PLACEMENT_EPSILON) continue; // already reported by assertChromePlacement
			const y = Math.floor((m.frameTop + 0.25) * 2); // dsf 2, first device row of the border
			const under = Math.round(m.panelMidX * 2);
			const off = Math.round((m.frameLeft + 40) * 2);
			const buf = await page.screenshot();
			const [pu, po] = await readPixels(page, buf, [
				[under, y],
				[off, y],
			]);
			const worst = Math.max(...[0, 1, 2].map((i) => po[i] - pu[i]));
			if (worst > BORDER_OCCLUSION_MAX) {
				problems.push(
					`${id}: the card's top border is occluded under the panel — ` +
						`rgb(${pu}) under vs rgb(${po}) off, darkened by ${worst}/255 ` +
						`(max ${BORDER_OCCLUSION_MAX})`,
				);
			}
			// (c) SC-189 R5 — THE CORNER. (b) samples two points that are BOTH on the
			//     straight top edge, which is how three rounds of this ticket could report
			//     "the border is continuous" while Scott kept seeing it fade at the arc. This
			//     walks the border RING at three angles across the top-right quarter turn and
			//     asks whether what is painted there is still the same hairline the straight
			//     edges either side of it carry.
			//
			//     The defect it catches is not the panel's: the sb/fb head band's own top
			//     corners were `--dse-radius` (0.4em -> 6.4px, resolved in the BAND's font
			//     size) inside a plate whose corners are 0.65rem (10.4px), and a tighter arc
			//     anchored at the same corner bulges OUTSIDE a looser one. A non-positioned
			//     child's background paints AFTER its parent's border, and `.dse-sb` cannot
			//     clip (the chrome panel is an out-of-flow child that paints above the card's
			//     top edge), so the band painted over the hairline for the whole 90 degrees.
			//     The gate lives here rather than in `assertChromePlacement` because this is
			//     the picture Scott is describing — the corner NEXT TO the revealed panel —
			//     and this is the loop that reveals it.
			//
			//     A REFERENCE, not an absolute colour: the hairline's value differs per
			//     family, per scheme and (on the stamina bar) per state, so the arc is
			//     compared against this same card's OWN straight top and right edges, blended
			//     by angle. And a WALK across the ring rather than one sample on it, because
			//     at dsf 2 a 1px ring on a 6.4px radius is a sub-pixel target while the
			//     question a reader actually asks is "is the hairline anywhere along here".
			const R = m.frameRadius;
			const bw = m.frameBorderTop;
			if (R > 2 && bw > 0) {
				const acx = m.frameRight - R;
				const acy = m.frameTop + R;
				const dev = (x, y) => [Math.round(x * 2), Math.round(y * 2)];
				const walk = [];
				for (let r = R - bw - 0.5; r <= R + 0.25; r += 0.25) walk.push(r);
				const refPts = [
					dev(m.frameLeft + 40, m.frameTop + bw / 2),
					dev(m.frameRight - bw / 2, m.frameTop + R + 30),
				];
				const arcPts = [];
				for (const deg of CORNER_ARC_ANGLES) {
					const t = (deg * Math.PI) / 180;
					for (const r of walk) arcPts.push(dev(acx + r * Math.cos(t), acy - r * Math.sin(t)));
				}
				const read = await readPixels(page, buf, [...refPts, ...arcPts]);
				const [refTop, refRight] = read;
				CORNER_ARC_ANGLES.forEach((deg, ai) => {
					// 90 degrees is the top edge, 0 the right edge — blend the two references.
					const w = deg / 90;
					const ref = [0, 1, 2].map((k) => w * refTop[k] + (1 - w) * refRight[k]);
					let best = Infinity;
					let bestPx = null;
					for (let wi = 0; wi < walk.length; wi++) {
						const px = read[refPts.length + ai * walk.length + wi];
						const d = Math.max(...[0, 1, 2].map((k) => Math.abs(px[k] - ref[k])));
						if (d < best) {
							best = d;
							bestPx = px;
						}
					}
					if (best > CORNER_ARC_MAX) {
						problems.push(
							`${id}: the card's hairline is lost on the top-right arc at ${deg} deg — ` +
								`the closest pixel across the border ring is rgb(${bestPx}), ` +
								`${Math.round(best)}/255 off this card's own straight edges ` +
								`(top rgb(${refTop}), right rgb(${refRight}); max ${CORNER_ARC_MAX})`,
						);
					}
				});
			}
		}
	}
	// SC-189 R4 — the OTHER chrome button: the collapsed bar's always-visible expand control.
	// It is in flow, so the host's `height: var(--input-height)` inflated the whole bar
	// (33.80px → 40.00px). Checked on its own navigations because reading it means collapsing
	// the element, which hides the floating panel the loop above is sampling.
	for (const bg of ['dark', 'light']) {
		const query = new URLSearchParams({ stack: 'statblock:default', theme: 'steel', bg, pad: '56' });
		await page.emulateMedia({ media: 'screen' });
		await page.goto(`${pageUrl}?${query}`);
		await page.waitForFunction(() => window.__dseHarnessDone !== undefined, null, { timeout: 15000 });
		const readBar = () =>
			page.evaluate(() => {
				document.querySelector('[data-dse-chrome]').setAttribute('data-dse-collapsed', 'on');
				const bar = document.querySelector('.dse-chrome-summary');
				const b = bar.querySelector('.dse-btn');
				return { barH: bar.getBoundingClientRect().height, btnH: b.getBoundingClientRect().height };
			});
		const bare = await readBar();
		await injectHostCss(page);
		const withHost = await readBar();
		checked += 1;
		for (const [k, label] of [
			['barH', 'collapsed-bar height'],
			['btnH', 'collapsed-bar expand-button height'],
		]) {
			if (Math.abs(withHost[k] - bare[k]) > BOX_EPSILON) {
				problems.push(
					`collapsed-bar/${bg}: Obsidian's \`button\` rule changes the ${label} — ` +
						`${bare[k].toFixed(2)}px without the host, ${withHost[k].toFixed(2)}px with it ` +
						`(max drift ${BOX_EPSILON}px)`,
				);
			}
		}
	}
	if (problems.length) {
		console.error(
			`\nCHROME HOST-LEAK VIOLATED — with Obsidian's real \`button\` defaults present the ` +
				`menu panel does not hold its own material or its own box:\n` +
				problems.map((p) => `  ${p}`).join('\n') +
				`\nSee styles-source.css → "Element chrome" (SC-189 rounds 3-4) and the sb/fb head-band rules (round 5).`,
		);
		process.exit(1);
	}
	console.log(
		`\nchrome host-leak OK (${checked} family/scheme combos: chrome buttons carry no host ` +
			`box-shadow, the panel's box is unchanged by Obsidian's \`button\` rule, and the card's ` +
			`top border is continuous under the panel AND around the top-right arc beside it)`,
	);
}

// ---------------------------------------------------------------------------------------
// SC-203 — the PLUGIN-WIDE host-leak gate.
//
// `assertChromeHostLeak` above proves one surface — the element menu panel — holds its own
// box and material under Obsidian's real `button` rules. That surface was never the whole
// defect: EVERY kit control that is a real `<button>` is reached by the same rules, and a
// real-vault measurement (isolated Obsidian, 122 button kinds across 14 elements × dark and
// light, each read twice — as shipped, and with exactly Obsidian's own matching rules
// deleted) found ALL 122 affected. Heights forced to `--input-height`, ghost buttons filled,
// accent buttons de-accented, every button's ink replaced with Obsidian's --text-normal,
// collapse headers centre-justified. See the SC-203 block at the foot of styles-source.css.
//
// The assertion is INVARIANCE, not a value list: for every distinct kind of button the
// gallery renders, the computed style must be IDENTICAL with and without the host sheet.
// That is the only formulation that catches the NEXT declaration Obsidian adds — the one
// nobody has thought of yet — which is exactly how the `color` leak survived SC-189.
//
// Why the gallery: it mounts every element family in one page, so the sweep covers the whole
// plugin for two navigations instead of one per family. `authoringControls:true` puts the
// edit affordance on, so the chrome panel's buttons are in the sample too.
//
// It runs on its own navigations and captures nothing, so no shot's bytes depend on it.

/** Properties compared with and without the host sheet. Everything the host's two rules can
 *  set, plus the geometry those declarations move. */
const BTN_PROPS = [
	'height',
	'minHeight',
	'minWidth',
	'boxShadow',
	'padding',
	'borderWidth',
	'borderStyle',
	'borderColor',
	'borderRadius',
	'backgroundColor',
	'backgroundImage',
	'color',
	'fontSize',
	'fontWeight',
	'fontFamily',
	'lineHeight',
	'display',
	'alignItems',
	'justifyContent',
	'whiteSpace',
	'cursor',
	'boxSizing',
	'letterSpacing',
	'textAlign',
	'opacity',
	'gap',
	'outlineStyle',
	'outlineWidth',
	// SC-205 R3 / LOW-1 — the re-extraction added `corner-shape` to the modelled base rule,
	// and round 1 left it neither compared nor declared-excluded, so the OK line's "every
	// sampled property" quietly meant "every property except one nobody listed". Chromium 149
	// supports it (it computes to `round`) and this sheet never declares it, so comparing it
	// is free and it is now pinned like the rest.
	'cornerShape',
];
/** DELIBERATELY NOT COMPARED. `user-select` and `-webkit-app-region` are the only two
 *  declarations Obsidian's `button` rules make that this sheet does not re-ground AND that
 *  this sweep does not compare, and they are excluded for the same reason SC-189 left
 *  `white-space` alone on a single-glyph chrome button: neither can move a box or paint a
 *  pixel. (`white-space` itself is NOT on this list — plugin-wide it demonstrably moves
 *  widths, so it is re-grounded and compared.) */
const BTN_PROPS_EXCLUDED = ['user-select', '-webkit-app-region'];

/** SC-205 — the states the sweep samples. `rest` was the whole gate until SC-205, and TWO of
 *  the six rules Obsidian aims at a plugin button fire in no other state than the two added
 *  here (`button:hover`, `button:focus-visible`), so a resting-only sweep was structurally
 *  blind to them however complete the host copy got. Of the remaining four, three fire at rest
 *  (the base rule, `button:not(.clickable-icon)`, and the `[disabled]` group — R1's can-fail
 *  measured that group's `cursor`/`opacity` under `rest`) and `@media (forced-colors: active)`
 *  fires in no state this harness renders, by choice — see the host copy's comment on it. */
const BTN_STATES = ['rest', 'hover', 'focus-visible'];

/** SC-205 R3 / MEDIUM-1 — MOUNT THE CHROME, don't exempt it.
 *
 *  Round 1 exempted 104 (kind,state) records as "provably unreachable". They were provably
 *  unreachable *in the gallery's resting DOM*, which is not the same claim: 92 of them were
 *  authoring-chrome controls — precisely the family SC-189 and SC-203 found leaking — that
 *  the product reveals on `[data-dse-chrome]:hover` / `:focus-within` and on
 *  `[data-dse-collapsed='on']`. A user reaches both on purpose, so "unfocusable in a real
 *  vault too" was false for every one of them, and the gate was printing a coverage claim
 *  about a fifth of its own comparisons that did not hold.
 *
 *  Putting the gallery into those configurations is three declarations. It is injected
 *  BEFORE the bare pass and stays for the host pass, so both passes see the identical DOM and
 *  the bare-vs-host invariance is untouched — it changes what is MOUNTED, never what is
 *  compared. None of the three declarations sets a property this sweep compares on a button;
 *  they only give container nodes a box and let the pointer through.
 *
 *  THE DEPENDENCY THAT MAKES THIS SOUND, stated because it is invisible otherwise (R4-L3).
 *  The reveal shows the panel AND the collapsed summary bar at once — a superposition the
 *  product never displays, since `[data-dse-collapsed='on'] .dse-chrome { display: none }`
 *  (styles-source.css ~:12856) makes them mutually exclusive. That is safe for exactly one
 *  reason: NO `[data-dse-collapsed]`-keyed rule in this sheet reaches a `.dse-btn`. The
 *  collapsed-keyed rules target the element root and the panel CONTAINER, never a button, so
 *  each button's cascade in the superposition is the cascade it has in its real state.
 *  The day someone writes `[data-dse-collapsed='on'] .dse-chrome-summary .dse-btn { … }`,
 *  this sweep starts testing the summary button in the wrong cascade and will not say so.
 *  If you add such a rule, drive the two collapse states as separate navigations instead. */
const CHROME_REVEAL_CSS = `
[data-dse-chrome] .dse-chrome { opacity: 1 !important; pointer-events: auto !important; }
.dse-chrome-summary { display: flex !important; }
.dse-init__turnbox { display: block !important; }
`;

/** Runs in the page. Tags each distinct button kind so every later pass reads the SAME node:
 *  the key is what a problem line names, the index is what the per-node interactive passes
 *  address (a key contains `|` and `.` and is a nuisance to put in a selector).
 *
 *  SC-205 R3 / MEDIUM-2 — the key carries STRUCTURAL CONTEXT, not just element + classes.
 *  Round 1's key was (element, classes, pressed, selected, disabled) and tagged only the
 *  first node per key, so the gallery's 225 buttons collapsed to 80 samples and 30 keys had
 *  instances in genuinely different surfaces — the chrome PANEL button and the collapsed
 *  SUMMARY bar's button share a class signature but are re-grounded by different rules
 *  (styles-source.css ~:12673 vs ~:12910). Which one got sampled was an accident of mount
 *  order: 17 families sampled the summary and never the panel, 12 the reverse, and `hero`
 *  neither. Adding the nearest chrome ancestor to the key gives each surface its own record. */
function tagButtons() {
	const keys = [];
	const seen = new Set();
	for (const n of document.querySelectorAll('button, .dse-btn')) {
		const root = n.closest('[data-dse-element]');
		const surface = n.closest('.dse-chrome, .dse-chrome-summary');
		const key =
			(root ? root.getAttribute('data-dse-element') : '(none)') +
			'|' +
			([...n.classList].sort().join('.') || '(no class)') +
			(surface ? `|in:${surface.classList.contains('dse-chrome') ? 'chrome' : 'chrome-summary'}` : '') +
			(n.hasAttribute('data-pressed') ? '|pressed' : '') +
			(n.getAttribute('aria-selected') === 'true' ? '|selected' : '') +
			(n.disabled ? '|disabled' : '');
		if (seen.has(key)) continue;
		seen.add(key);
		n.setAttribute('data-dse-hostleak', key);
		n.setAttribute('data-dse-hostleak-i', String(keys.length));
		keys.push(key);
	}
	return keys;
}

/** Read every tagged node at once. Only valid for `rest` — the interactive states have to
 *  be driven one node at a time, because only one node can be under the pointer. */
function readTaggedAtRest(props) {
	const out = [];
	for (const n of document.querySelectorAll('[data-dse-hostleak]')) {
		const cs = getComputedStyle(n);
		const r = n.getBoundingClientRect();
		const rec = { key: n.getAttribute('data-dse-hostleak'), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
		for (const p of props) rec[p] = cs[p];
		out.push(rec);
	}
	return out;
}

/** Clear both interactive states so a `rest` reading is really at rest. The host pass runs
 *  the three states over again after injection, so the second `rest` inherits the first
 *  pass's focus and pointer unless they are dropped here. */
function clearBtnState() {
	if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
	window.scrollTo(0, 0);
}

/** Bring one tagged node into view and report where its centre now sits in the VIEWPORT —
 *  `page.mouse.move` takes viewport coordinates and the gallery is ~23,500px tall, so a
 *  pointer move without this scroll lands on whatever happens to be on screen. */
function centreOfTagged(i) {
	const n = document.querySelector(`[data-dse-hostleak-i="${i}"]`);
	if (!n) return null;
	n.scrollIntoView({ block: 'center', inline: 'center' });
	const r = n.getBoundingClientRect();
	return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
}

/** A viewport point that genuinely HIT-TESTS to this node — not merely one inside its
 *  bounding rect. Two real gallery cases make the difference, and both were live flakes
 *  before SC-205 checked:
 *    * the initiative roster's `.dse-init__stamina` sits inside a `position: absolute;
 *      overflow: hidden` rail, so its own centre is clipped away and `elementFromPoint`
 *      there returns the ROW. Pointing at it would silently sample its resting style.
 *    * a card's ghost edit button is `pointer-events: none` until the CARD is hovered, so
 *      its hit target only exists once the pointer has already arrived. The caller moves to
 *      the centre first for exactly that reason, then calls this to find where the now-
 *      revealed node actually is.
 *  Returns `{x, y}` or `{blocked}` — never a point that is not on the node. */
function hitPointForTagged(i) {
	const n = document.querySelector(`[data-dse-hostleak-i="${i}"]`);
	if (!n) return null;
	const r = n.getBoundingClientRect();
	if (r.width === 0 || r.height === 0) return { blocked: 'renders a zero-sized box' };
	const vw = document.documentElement.clientWidth;
	const vh = document.documentElement.clientHeight;
	// SC-205 R3 / LOW-5 — count how many candidates were actually testable. A node bigger than
	// the viewport (or one `scrollIntoView` could not centre) has every candidate off-screen,
	// which is a different diagnosis from "on-screen and nothing hit it"; round 1 reported both
	// as the ancestor-clip case, so a future oversized control would have been exempted under a
	// reason that did not apply to it.
	let onScreen = 0;
	for (const [fx, fy] of [
		[0.5, 0.5],
		[0.25, 0.5],
		[0.75, 0.5],
		[0.5, 0.25],
		[0.5, 0.75],
		[0.2, 0.2],
		[0.8, 0.8],
	]) {
		const x = r.x + r.width * fx;
		const y = r.y + r.height * fy;
		if (x < 1 || y < 1 || x > vw - 1 || y > vh - 1) continue;
		onScreen += 1;
		const hit = document.elementFromPoint(x, y);
		if (hit && (hit === n || n.contains(hit))) return { x, y };
	}
	if (onScreen === 0)
		return {
			blocked: `no candidate point is inside the ${vw}×${vh} viewport (the node is larger than the viewport, or could not be scrolled into it)`,
		};
	return {
		blocked:
			getComputedStyle(n).pointerEvents === 'none'
				? 'pointer-events: none'
				: 'no point in its box hit-tests to it (clipped by an ancestor overflow, or covered)',
	};
}

/** Focus one tagged node, and report why it could not take focus if it did not. `disabled`
 *  and un-rendered markup are the two provable cases; `aria-disabled` is NOT one of them (it
 *  is an ARIA claim — such an element still takes focus, and must still reach
 *  `:focus-visible` or fail the gate). */
function focusTagged(i) {
	const n = document.querySelector(`[data-dse-hostleak-i="${i}"]`);
	if (!n) return null;
	const cs = getComputedStyle(n);
	if (n.hasAttribute('disabled')) return { blocked: 'disabled' };
	if (n.getClientRects().length === 0)
		return { blocked: 'renders no box at all (a display:none ancestor) even with the chrome mounted' };
	if (cs.visibility !== 'visible') return { blocked: `visibility: ${cs.visibility}` };
	if (!n.matches('button, a[href], input, select, textarea, [tabindex]'))
		return { blocked: `<${n.tagName.toLowerCase()}> with no href and no tabindex` };
	if (n instanceof HTMLElement) n.focus();
	return { blocked: null };
}

/** Read ONE tagged node and report whether the state we are trying to sample is genuinely
 *  active on it. `active: false` is never absorbed by this function — the caller either
 *  fails the gate or exempts the record against the `blocked` proof its driver returned
 *  (SC-205: an exemption must assert the disabling markup, never skip silently). */
function readOneTagged({ i, props, state }) {
	const n = document.querySelector(`[data-dse-hostleak-i="${i}"]`);
	if (!n) return null;
	const cs = getComputedStyle(n);
	const r = n.getBoundingClientRect();
	const rec = { key: n.getAttribute('data-dse-hostleak'), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
	for (const p of props) rec[p] = cs[p];
	rec.active = state === 'hover' ? n.matches(':hover') : state === 'focus-visible' ? n.matches(':focus-visible') : true;
	return rec;
}

/** Sample every tagged node in one state, driving the state for real. Returns the records
 *  plus any loudness problems (a state that could not be reached and could not be excused). */
async function probeButtonsInState(page, state, count, props) {
	if (state === 'rest') {
		await page.mouse.move(0, 0);
		await page.evaluate(clearBtnState);
		const records = await page.evaluate(readTaggedAtRest, props);
		for (const rec of records) {
			rec.active = true; // resting IS the state; nothing has to be driven to reach it
			rec.blocked = null;
		}
		return { records, problems: [] };
	}
	if (state === 'focus-visible') {
		// Chromium only paints `:focus-visible` on a SCRIPTED focus when the last input was a
		// key, so establish keyboard modality with a real key event first — and get the
		// pointer off the page, so a stray `:hover` cannot be read as a focus difference.
		await page.mouse.move(0, 0);
		await page.keyboard.press('Tab');
	}
	const records = [];
	const problems = [];
	for (let i = 0; i < count; i += 1) {
		let blocked = null;
		if (state === 'hover') {
			const centre = await page.evaluate(centreOfTagged, i);
			if (!centre) {
				problems.push(`#${i}: the tagged node vanished mid-sweep`);
				continue;
			}
			// Arrive at the centre first — that is what reveals a hover-gated control — then
			// ask where the node can actually be pointed at now that it has.
			if (centre.w > 0 && centre.h > 0) await page.mouse.move(centre.x, centre.y);
			const hit = await page.evaluate(hitPointForTagged, i);
			if (!hit) {
				problems.push(`#${i}: the tagged node vanished mid-sweep`);
				continue;
			}
			if (hit.blocked) blocked = hit.blocked;
			else {
				// TWO moves, ending on the verified point. Chromium recomputes the hover chain
				// on a pointer EVENT; a single move that lands where the pointer already is (or
				// that arrives before a hover-reveal changes hit-testing) leaves the chain stale,
				// and that raced — the same node read hovered in one pass and at rest in the
				// other, which reads as a host leak.
				await page.mouse.move(hit.x, hit.y > 1 ? hit.y - 0.5 : hit.y + 0.5);
				await page.mouse.move(hit.x, hit.y);
			}
		} else {
			await page.evaluate(centreOfTagged, i);
			const res = await page.evaluate(focusTagged, i);
			if (!res) {
				problems.push(`#${i}: the tagged node vanished mid-sweep`);
				continue;
			}
			blocked = res.blocked;
		}
		const rec = await page.evaluate(readOneTagged, { i, props, state });
		if (!rec) {
			problems.push(`#${i}: the tagged node vanished mid-sweep`);
			continue;
		}
		if (!rec.active && !blocked) {
			problems.push(
				`${rec.key}: could not be put into :${state} and is not provably unreachable — ` +
					`the sweep would have sampled its resting style and called it a pass`,
			);
			continue;
		}
		if (rec.active && blocked) {
			problems.push(
				`${rec.key}: reported as unreachable for :${state} ("${blocked}") but the node ` +
					`matches the state anyway — the exemption is wrong, not the node`,
			);
			continue;
		}
		rec.blocked = blocked;
		records.push(rec);
	}
	return { records, problems };
}

async function assertBtnHostLeak(page) {
	const problems = [];
	let kindCount = 0;
	let comparisons = 0;
	let exempt = 0;
	/** reason -> count, so the sweep's coverage BOUNDARY is printed rather than implied. */
	const exemptions = new Map();
	for (const bg of ['dark', 'light']) {
		const query = new URLSearchParams({
			gallery: '1',
			theme: 'steel',
			bg,
			prefs: 'authoringControls:true',
		});
		await page.emulateMedia({ media: 'screen' });
		await page.goto(`${pageUrl}?${query}`);
		await page.waitForFunction(() => window.__dseHarnessDone !== undefined, null, { timeout: 60000 });
		// SC-205 — Obsidian's `button:hover` sits inside `@media (hover: hover)`. If this
		// context ever stopped reporting a hover-capable pointer, that rule would be inert and
		// the hover pass would pin nothing while still printing OK. Assert the capability
		// rather than assume it.
		if (!(await page.evaluate(() => window.matchMedia('(hover: hover)').matches))) {
			problems.push(
				`${bg}: this browser context does not report \`(hover: hover)\`, so Obsidian's ` +
					`\`button:hover\` rule is inert and the hover pass proves nothing`,
			);
			continue;
		}
		// SC-205 R3 — mount the authoring chrome before anything is tagged (see
		// CHROME_REVEAL_CSS). Both passes run against this DOM.
		await page.addStyleTag({ content: CHROME_REVEAL_CSS });
		const keys = await page.evaluate(tagButtons);
		if (keys.length < 20) {
			problems.push(`${bg}: only ${keys.length} buttons found in the gallery — the sweep is blind`);
			continue;
		}
		kindCount = keys.length;

		// PASS 1 — every state without the host. PASS 2 — the same states, same nodes, same
		// pointer/focus order, with the host sheet in. Reading all three states before the
		// injection (rather than injecting once per state) keeps it to one navigation per
		// scheme; the states are re-driven for real in each pass, so nothing is read out of a
		// state the node is not actually in.
		const bare = {};
		for (const state of BTN_STATES) {
			const r = await probeButtonsInState(page, state, keys.length, BTN_PROPS);
			bare[state] = r.records;
			for (const p of r.problems) problems.push(`${bg}|host-absent|${state}: ${p}`);
			for (const rec of r.records) {
				if (rec.active) continue;
				exempt += 1;
				const reason = `${state}: ${rec.blocked}`;
				exemptions.set(reason, (exemptions.get(reason) ?? 0) + 1);
			}
		}
		await injectHostCss(page);
		for (const state of BTN_STATES) {
			const r = await probeButtonsInState(page, state, keys.length, BTN_PROPS);
			for (const p of r.problems) problems.push(`${bg}|host-present|${state}: ${p}`);
			const withHost = new Map(r.records.map((rec) => [rec.key, rec]));
			for (const b of bare[state]) {
				const h = withHost.get(b.key);
				if (!h) {
					problems.push(`${bg}|${state}|${b.key}: vanished when the host sheet was added`);
					continue;
				}
				// SC-205 R3 / LOW-2 — both passes must have sampled the SAME state. Round 1
				// compared the pair without checking: if a host declaration changed a node's box
				// or its hit-testing, one pass would read the state and the other would read rest,
				// the pair would still be counted among the advertised comparisons, and whether
				// the result came out red or green would be an accident of direction.
				if ((b.blocked ?? null) !== (h.blocked ?? null)) {
					problems.push(
						`${bg}|${state}|${b.key}: the two passes did not sample the same state — ` +
							`without the host it was ${b.blocked ? `exempt ("${b.blocked}")` : 'in the state'}, ` +
							`with it ${h.blocked ? `exempt ("${h.blocked}")` : 'in the state'}; ` +
							`the host sheet is changing whether this node can reach :${state}`,
					);
					continue;
				}
				comparisons += 1;
				for (const p of ['w', 'h', ...BTN_PROPS]) {
					const a = typeof b[p] === 'number' ? b[p].toFixed(2) : String(b[p]);
					const c = typeof h[p] === 'number' ? h[p].toFixed(2) : String(h[p]);
					if (a !== c) {
						problems.push(
							`${bg}|${state}|${b.key}: Obsidian's \`button\` rules change ${p} — ` +
								`"${a}" without the host, "${c}" with it`,
						);
					}
				}
			}
		}
	}
	if (problems.length) {
		const shown = problems.slice(0, 40);
		console.error(
			`\nBUTTON HOST-LEAK VIOLATED — with Obsidian's real \`button\` defaults present the ` +
				`plugin's own buttons do not hold their own box or material:\n` +
				shown.map((p) => `  ${p}`).join('\n') +
				(problems.length > shown.length ? `\n  … and ${problems.length - shown.length} more` : '') +
				`\nSee styles-source.css → "SC-203 — PLUGIN-WIDE HOST RE-GROUNDING" (foot of the file).`,
		);
		process.exit(1);
	}
	const boundary = [...exemptions.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([reason, n]) => `      ${n}× ${reason}`)
		.join('\n');
	console.log(
		`\nbutton host-leak OK (${kindCount} button kinds × ${BTN_STATES.length} states ` +
			`(${BTN_STATES.join('/')}) × dark/light = ${comparisons} comparisons: every sampled ` +
			`property is identical with and without Obsidian's \`button\` rules; ` +
			`${BTN_PROPS_EXCLUDED.join(' and ')} are excluded by design)` +
			(exempt
				? `\n  ${exempt} of those (kind,state) records sampled the node at rest because the ` +
					`mounted DOM cannot put it into that state — each one proved per record, never ` +
					`assumed, and the authoring chrome is MOUNTED for the sweep so this is no longer ` +
					`a claim about controls the product merely had not revealed:\n${boundary}`
				: ''),
	);
}

// ======================================================================================
// SC-202 r1 — input/stepper host-leak sweep.
//
// Phase 1 (sc202-phase1-report.md) found the plugin's numeric/text `<input>`s (the
// stepper widget and its cousins — party award, project roll/points/characteristic,
// montage skill/characteristic, the initiative malice quick-add pair) never re-ground
// Obsidian's `input[type='number']`/`input[type='text']` material: ~30px tall instead of
// ~20px, Obsidian's grey fill/border instead of the Steel tokens — confirmed in a real
// 1.13.7 vault (sc202-realvault-inputs.log). This is that family's own drift-proof gate.
//
// UNLIKE `assertBtnHostLeak`, this does NOT compare against a hand-copied model. app.css
// itself can never be committed (the phase-2 ruling, decisions.md 2026-09-02) — not even
// as a transcribed excerpt — so there is no in-repo copy for a drift pin to protect. This
// sweep instead injects the REAL, locally-extracted sheet directly and self-gates on its
// presence: no local Obsidian asar, no sweep, loud SKIP, never a silent pass and never a
// failure for lacking one. `visual-harness/dist/` is gitignored (see .gitignore) and nothing
// under it is ever committed.
const R1_APP_CSS_SHA256 = 'f612f1e8f36486fa57f3b8bd45f0c848409d5b168002e757a13c6d286a7b4c41';

/** Extracts (and caches under visual-harness/dist/, gitignored) the real installed
 *  Obsidian app.css. Reuses `findObsidianAsar`'s existing "usable" gate (SC-205) — the
 *  same newest-self-updated-asar lookup and >= PINNED_OBSIDIAN version check the button
 *  drift pin already applies, so the two pins agree on what counts as new enough. Returns
 *  `null` when nothing usable is installed; the caller turns that into a SKIP line, never
 *  a failure.
 *  LOW-3 (fix round) — writes `dist/obsidian-app.css` only when it is missing or its sha256
 *  differs from what is already on disk. Nothing ever reads that file back (the sweep uses
 *  the in-memory `css` string directly), so re-writing 637 KB on every `npm run shots` was
 *  pure avoidable churn — a stray `git add -f`/packaging-step/`dist/` upload away from
 *  becoming a real leak of a proprietary sheet that must never be redistributed. */
function loadLocalObsidianAppCss() {
	const found = findObsidianAsar();
	if (!found || !found.usable) return null;
	const css = readAsarFile(found.path, 'app.css');
	if (!css) return null;
	const sha256 = crypto.createHash('sha256').update(css, 'utf8').digest('hex');
	const outDir = path.join(dir, 'dist');
	const outFile = path.join(outDir, 'obsidian-app.css');
	let upToDate = false;
	try {
		const onDisk = crypto.createHash('sha256').update(fs.readFileSync(outFile, 'utf8'), 'utf8').digest('hex');
		upToDate = onDisk === sha256;
	} catch {
		upToDate = false; // missing or unreadable — write it
	}
	if (!upToDate) {
		fs.mkdirSync(outDir, { recursive: true });
		fs.writeFileSync(outFile, css);
	}
	return { css, version: found.version, sha256 };
}

/** Injects a full stylesheet ahead of the plugin's own — same cascade shape as
 *  `injectHostCss` (SC-203), parameterized on the CSS text since this one is not a
 *  constant baked into the file. */
async function injectRealHostCss(page, css) {
	const handle = await page.addStyleTag({ content: css });
	await page.evaluate((el) => document.head.prepend(el), handle);
}

/** Every property the real app.css's `input[type='number']`/`input[type='text']` rules
 *  (rest, hover, disabled, active/focus, focus-visible) set on the element itself —
 *  enumerated from the extracted sheet (visual-harness/dist/obsidian-app.css), not from
 *  memory. `height` is declared by a SEPARATE rule scoped to exactly the text-ish input
 *  types (not date/datetime/textarea) — the single most destructive one, per the SC-203
 *  block's own lesson about `button`'s `height`. `boxShadow` only ever moves at
 *  `:focus-visible` (the base rule sets none), and `borderColor` additionally moves at
 *  `:active`/`:focus` (which `:focus-visible` implies) — both states this sweep samples. */
const INPUT_PROPS = [
	'height',
	'padding',
	'borderWidth',
	'borderStyle',
	'borderColor',
	'borderRadius',
	'cornerShape',
	'backgroundColor',
	'backgroundImage',
	'color',
	'fontFamily',
	'fontSize',
	'lineHeight',
	'outlineStyle',
	'outlineWidth',
	'boxShadow',
	// SC-202 r1 fix round (HIGH-2, LOW-1) — `opacity`/`cursor` only ever move at
	// `:disabled`; `caretColor` is the one property in this list that is not a rule whose
	// subject is `input`/`textarea` at all (Obsidian sets it on `body`, inherited) —
	// sampled here anyway since it is real and this is where every OTHER input property
	// already gets compared per state.
	'opacity',
	'cursor',
	'caretColor',
];
/** DELIBERATELY NOT COMPARED, same reasoning as `BTN_PROPS_EXCLUDED`: neither can move a
 *  box or paint a pixel. `-webkit-app-region` only decides window-drag behavior;
 *  `unicode-bidi: plaintext` (app.css's one bare, ancestor-less `input` rule) only affects
 *  bidi text-run resolution, inert for this plugin's LTR numeric/label content. */
const INPUT_PROPS_EXCLUDED = ['-webkit-app-region', 'unicode-bidi'];
/** SC-202 r1 fix round (HIGH-1, HIGH-2) — widened from `['rest', 'focus-visible']` to all
 *  four states Obsidian's `input`/`textarea` rules actually move a property in. `::placeholder`
 *  (MED-1) is a FIFTH comparison this sweep makes but is not a DOM state (it reads a
 *  pseudo-element on the rest-state DOM), so it is driven separately in
 *  `assertInputHostLeak` rather than living in this list — see that function and its
 *  printed line, which reports it as a state anyway for a human reading the count. */
const INPUT_STATES = ['rest', 'hover', 'disabled', 'focus-visible'];

/** Tags every distinct kind of numeric/text `<input>` the gallery renders — same
 *  (element, classes) keying convention as `tagButtons`, without the chrome-surface
 *  qualifier (no input in this family sits inside the collapsible chrome panel). */
function tagInputs() {
	const keys = [];
	const seen = new Set();
	for (const n of document.querySelectorAll("input[type='number'], input[type='text']")) {
		const root = n.closest('[data-dse-element]');
		const key =
			(root ? root.getAttribute('data-dse-element') : '(none)') +
			'|' +
			([...n.classList].sort().join('.') || '(no class)');
		if (seen.has(key)) continue;
		seen.add(key);
		n.setAttribute('data-dse-inputleak', key);
		n.setAttribute('data-dse-inputleak-i', String(keys.length));
		keys.push(key);
	}
	return keys;
}

/** Scroll one tagged input into view and try to focus it, reporting why it could not if it
 *  did not — same provable-exemption shape as `focusTagged`. */
function focusInputTagged(i) {
	const n = document.querySelector(`[data-dse-inputleak-i="${i}"]`);
	if (!n) return null;
	n.scrollIntoView({ block: 'center', inline: 'center' });
	if (n.disabled) return { blocked: 'disabled' };
	if (n.getClientRects().length === 0) return { blocked: 'renders no box at all (a display:none ancestor)' };
	if (getComputedStyle(n).visibility !== 'visible') return { blocked: `visibility: ${getComputedStyle(n).visibility}` };
	n.focus();
	return { blocked: null };
}

/** Read every tagged input at once — valid for `rest` only, mirroring `readTaggedAtRest`. */
function readTaggedInputsAtRest(props) {
	const out = [];
	for (const n of document.querySelectorAll('[data-dse-inputleak]')) {
		const cs = getComputedStyle(n);
		const r = n.getBoundingClientRect();
		const rec = { key: n.getAttribute('data-dse-inputleak'), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
		for (const p of props) rec[p] = cs[p];
		out.push(rec);
	}
	return out;
}

/** Read ONE tagged input and report whether the given pseudo-class is genuinely active on
 *  it — same "never absorbed" contract as `readOneTagged`. Shared by the focus-visible and
 *  (fix round) hover branches of `probeInputsInState`; `pseudo` is a real CSS pseudo-class
 *  string (`:focus-visible` / `:hover`) checked via `Element.matches`. */
function readOneInputTaggedMatching({ i, props, pseudo }) {
	const n = document.querySelector(`[data-dse-inputleak-i="${i}"]`);
	if (!n) return null;
	const cs = getComputedStyle(n);
	const r = n.getBoundingClientRect();
	const rec = { key: n.getAttribute('data-dse-inputleak'), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
	for (const p of props) rec[p] = cs[p];
	rec.active = n.matches(pseudo);
	return rec;
}

/** `:disabled` (HIGH-2, fix round) — a real DOM attribute, not a pseudo-class, so this
 *  drives it directly rather than through CDP: set `disabled = true`, read, restore. No
 *  input in this family is ever given `disabled` by current product code (see the CSS
 *  block's own comment), so there is no "cannot reach this state" case to prove — unlike
 *  hover/focus-visible, setting `.disabled` on a real `<input>`/`<textarea>` always
 *  succeeds. */
function readOneInputTaggedDisabled({ i, props }) {
	const n = document.querySelector(`[data-dse-inputleak-i="${i}"]`);
	if (!n) return null;
	const was = n.disabled;
	n.disabled = true;
	const cs = getComputedStyle(n);
	const r = n.getBoundingClientRect();
	const rec = { key: n.getAttribute('data-dse-inputleak'), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
	for (const p of props) rec[p] = cs[p];
	n.disabled = was;
	rec.active = true;
	return rec;
}

/** `::placeholder` color (MED-1, fix round) — not a DOM state, so read at rest for every
 *  tagged node at once, mirroring `readTaggedInputsAtRest`'s shape. Only `color` is sampled:
 *  it is the only property Obsidian's `::placeholder` rule sets. **Cannot be verified
 *  against a real vault** — Obsidian's own Chromium returns the ELEMENT's computed style
 *  for `getComputedStyle(el, '::placeholder')`, not the pseudo-element's (measured live);
 *  this pass only ever runs in the browser harness. */
function readPlaceholderColors() {
	const out = [];
	for (const n of document.querySelectorAll('[data-dse-inputleak]')) {
		out.push({ key: n.getAttribute('data-dse-inputleak'), color: getComputedStyle(n, '::placeholder').color });
	}
	return out;
}

/** Sample every tagged input in one state, driving the state for real — same shape as
 *  `probeButtonsInState`. `cdp`/`docRootNodeId` are only used by the `hover` branch. */
async function probeInputsInState(page, cdp, docRootNodeId, state, count, props) {
	if (state === 'rest') {
		await page.mouse.move(0, 0);
		await page.evaluate(clearBtnState);
		const records = await page.evaluate(readTaggedInputsAtRest, props);
		for (const rec of records) {
			rec.active = true;
			rec.blocked = null;
		}
		return { records, problems: [] };
	}
	if (state === 'disabled') {
		const records = [];
		const problems = [];
		for (let i = 0; i < count; i += 1) {
			const rec = await page.evaluate(readOneInputTaggedDisabled, { i, props });
			if (!rec) {
				problems.push(`#${i}: the tagged node vanished mid-sweep`);
				continue;
			}
			records.push(rec);
		}
		return { records, problems };
	}
	if (state === 'hover') {
		// INFO-3 (review) — once app.css is injected, Playwright's `locator.hover()` /
		// `page.mouse.move()` stop engaging `:hover` entirely (measured 16/16 kinds:
		// hovBare=true, hovHost=false): the injected sheet changes the page's own
		// scroll/layout, so the computed centre used to compute a pointer target is no
		// longer under the pointer. CDP `CSS.forcePseudoState` does not simulate a pointer
		// at all — it forces the browser's own pseudo-class match directly on the node — so
		// it is immune. Forcing HOVER ALONE (never combined with `:active`/`:focus`, which
		// the review found produces phantom border-color/box-shadow leaks unless
		// `:focus-visible` is forced alongside them) is the shape proven clean.
		const records = [];
		const problems = [];
		for (let i = 0; i < count; i += 1) {
			const found = await cdp.send('DOM.querySelector', {
				nodeId: docRootNodeId,
				selector: `[data-dse-inputleak-i="${i}"]`,
			});
			if (!found?.nodeId) {
				problems.push(`#${i}: CDP could not resolve the tagged node`);
				continue;
			}
			await cdp.send('CSS.forcePseudoState', { nodeId: found.nodeId, forcedPseudoClasses: ['hover'] });
			const rec = await page.evaluate(readOneInputTaggedMatching, { i, props, pseudo: ':hover' });
			await cdp.send('CSS.forcePseudoState', { nodeId: found.nodeId, forcedPseudoClasses: [] });
			if (!rec) {
				problems.push(`#${i}: the tagged node vanished mid-sweep`);
				continue;
			}
			if (!rec.active) {
				problems.push(`${rec.key}: CSS.forcePseudoState(['hover']) did not make the node match :hover`);
				continue;
			}
			records.push(rec);
		}
		return { records, problems };
	}
	// focus-visible — establish keyboard modality once per pass, same as the button sweep.
	await page.mouse.move(0, 0);
	await page.keyboard.press('Tab');
	const records = [];
	const problems = [];
	for (let i = 0; i < count; i += 1) {
		const res = await page.evaluate(focusInputTagged, i);
		if (!res) {
			problems.push(`#${i}: the tagged node vanished mid-sweep`);
			continue;
		}
		const rec = await page.evaluate(readOneInputTaggedMatching, { i, props, pseudo: ':focus-visible' });
		if (!rec) {
			problems.push(`#${i}: the tagged node vanished mid-sweep`);
			continue;
		}
		rec.blocked = res.blocked;
		if (!rec.active && !rec.blocked) {
			problems.push(
				`${rec.key}: could not be put into :focus-visible and is not provably unreachable — ` +
					`the sweep would have sampled its resting style and called it a pass`,
			);
			continue;
		}
		if (rec.active && rec.blocked) {
			problems.push(
				`${rec.key}: reported as unreachable for :focus-visible ("${rec.blocked}") but the node ` +
					`genuinely matches it — the exemption is lying`,
			);
			continue;
		}
		records.push(rec);
	}
	return { records, problems };
}

async function assertInputHostLeak(page) {
	const host = loadLocalObsidianAppCss();
	if (!host) {
		console.log('\ninput host-leak SKIPPED (no local asar)');
		return;
	}
	const pinNote =
		host.sha256 === R1_APP_CSS_SHA256
			? `matches the round's pin (Obsidian ${host.version})`
			: `Obsidian ${host.version}, sha256 ${host.sha256} does not match the round's pin ` +
				`${R1_APP_CSS_SHA256} — sweeping against it anyway, a version drift, not a defect`;
	// INFO-3 — the hover pass needs CDP CSS.forcePseudoState (Playwright's own hover/mouse
	// APIs stop engaging :hover once app.css is injected). One session for the whole sweep;
	// the DOM domain's node tree is re-fetched per navigation AND per bare/host pass below
	// (a style-tag injection is not a navigation, but re-fetching is cheap and removes any
	// doubt about node-id staleness across the injection).
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('DOM.enable');
	await cdp.send('CSS.enable');
	const problems = [];
	let kindCount = 0;
	let comparisons = 0;
	for (const bg of ['dark', 'light']) {
		const query = new URLSearchParams({ gallery: '1', theme: 'steel', bg });
		await page.emulateMedia({ media: 'screen' });
		await page.goto(`${pageUrl}?${query}`);
		await page.waitForFunction(() => window.__dseHarnessDone !== undefined, null, { timeout: 60000 });
		const keys = await page.evaluate(tagInputs);
		if (keys.length < 5) {
			problems.push(`${bg}: only ${keys.length} inputs found in the gallery — the sweep is blind`);
			continue;
		}
		kindCount = Math.max(kindCount, keys.length);

		const { root: bareRoot } = await cdp.send('DOM.getDocument', { depth: -1 });
		const bare = {};
		for (const state of INPUT_STATES) {
			const r = await probeInputsInState(page, cdp, bareRoot.nodeId, state, keys.length, INPUT_PROPS);
			bare[state] = r.records;
			for (const p of r.problems) problems.push(`${bg}|host-absent|${state}: ${p}`);
		}
		const barePlaceholder = await page.evaluate(readPlaceholderColors);

		await injectRealHostCss(page, host.css);
		const { root: hostRoot } = await cdp.send('DOM.getDocument', { depth: -1 });
		for (const state of INPUT_STATES) {
			const r = await probeInputsInState(page, cdp, hostRoot.nodeId, state, keys.length, INPUT_PROPS);
			for (const p of r.problems) problems.push(`${bg}|host-present|${state}: ${p}`);
			const withHost = new Map(r.records.map((rec) => [rec.key, rec]));
			for (const b of bare[state]) {
				const h = withHost.get(b.key);
				if (!h) {
					problems.push(`${bg}|${state}|${b.key}: vanished when the host sheet was added`);
					continue;
				}
				comparisons += 1;
				for (const p of ['w', 'h', ...INPUT_PROPS]) {
					const a = typeof b[p] === 'number' ? b[p].toFixed(2) : String(b[p]);
					const c = typeof h[p] === 'number' ? h[p].toFixed(2) : String(h[p]);
					if (a !== c) {
						problems.push(
							`${bg}|${state}|${b.key}: Obsidian's real app.css changes ${p} — ` +
								`"${a}" without the host, "${c}" with it`,
						);
					}
				}
			}
		}

		// ::placeholder (MED-1) — not a DOM state, compared separately; see
		// `readPlaceholderColors`'s own comment for why this can only run here, never
		// against a real vault.
		const hostPlaceholder = await page.evaluate(readPlaceholderColors);
		const hostPhByKey = new Map(hostPlaceholder.map((r) => [r.key, r]));
		for (const b of barePlaceholder) {
			const h = hostPhByKey.get(b.key);
			if (!h) {
				problems.push(`${bg}|placeholder|${b.key}: vanished when the host sheet was added`);
				continue;
			}
			comparisons += 1;
			if (b.color !== h.color) {
				problems.push(
					`${bg}|placeholder|${b.key}: Obsidian's real app.css changes ::placeholder color — ` +
						`"${b.color}" without the host, "${h.color}" with it`,
				);
			}
		}
	}
	if (problems.length) {
		const shown = problems.slice(0, 60);
		console.error(
			`\nINPUT HOST-LEAK VIOLATED — with the real Obsidian app.css present the plugin's own ` +
				`numeric/text inputs do not hold their own box or material:\n` +
				shown.map((p) => `  ${p}`).join('\n') +
				(problems.length > shown.length ? `\n  … and ${problems.length - shown.length} more` : '') +
				`\nSee styles-source.css → "SC-202 r1 — INPUT/STEPPER HOST RE-GROUNDING".`,
		);
		process.exit(1);
	}
	const stateLabels = [...INPUT_STATES, 'placeholder'];
	console.log(
		`\ninput host-leak OK (${kindCount} input kinds × ${stateLabels.length} states ` +
			`(${stateLabels.join('/')}) × dark/light = ${comparisons} comparisons against the real ` +
			`Obsidian app.css: every sampled property is identical with and without it; ` +
			`${INPUT_PROPS_EXCLUDED.join(' and ')} are excluded by design; ${pinNote})`,
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
		// SC-183 promotion round: prefs is now optional (a shot kept alive under its own
		// id after its preference was promoted and deleted has nothing left to vary).
		const prefParam = Object.entries(n.prefs ?? {})
			.map(([k, v]) => `${k}:${v}`)
			.join(',');
		for (const c of combos) {
			// SC-183: optional narrow-axis override (entry.ts PREF_SHOTS `width`), the
			// same param NARROW_SHOTS routes — a layout pref's narrow branch is part of
			// the pref's own picture.
			const params = { element: n.element, fixture: n.fixture, prefs: prefParam };
			if (n.width) params.width = String(n.width);
			await snap(page, c, params, n.id);
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
		// SC-189 round 3 — the host-leak gate (see the block above). Same "own navigations,
		// captures nothing" shape, so it is skipped on a narrowed run for the same reason.
		await assertChromeHostLeak(page);
		// SC-205 — before asking what the host does to the plugin, prove the host model is
		// still what Obsidian ships. It runs FIRST so a drifted copy reports as drift rather
		// than as a mystery leak (or, worse, as a clean sweep of the wrong host).
		await assertHostCopyPinnedToObsidian(page);
		// SC-203 — the same question asked of EVERY button in the plugin, not just the
		// chrome panel's. Same shape again; same reason for the narrowed-run skip.
		await assertBtnHostLeak(page);
		// SC-202 r1 — the same question asked of every numeric/text INPUT the plugin
		// renders. Unlike the gate above it self-gates on a local Obsidian asar (see the
		// block's own comment) rather than failing when one is absent.
		await assertInputHostLeak(page);
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
// SC-204 — runs on EVERY invocation, narrowed or not: unlike the gallery and the two
// chrome gates it takes no navigations of its own, so there is nothing to skip.
assertNestedCornerRadius();
console.log(`\nall shots written to ${shotsDir}`);
