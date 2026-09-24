// test/unit/build/printTwinDeltaAllowedSet.test.ts — SC-202 r6c fix round (independent
// review HIGH-1's own prescribed guard): "hard-code the measured set … and a jest guard
// that fails if the set grows".
//
// `visual-harness/shoot.mjs` is an ESM `.mjs` run-script (not a module this repo's jest
// config can `import()` — same limitation `obsidianAppCssPin.test.ts`'s own header
// documents), so this asserts the SOURCE TEXT of `MEASURED_REACHABLE_PRINT_PROPS`
// directly — the same "read the raw file, regex the declaration" convention
// `steelTypography.test.ts`/`chrome.test.ts` already use for `styles-source.css`, applied
// here to a `.mjs` constant instead of a CSS rule.
//
// The floor this guards is a REACHABILITY census (`sc202-r6crev-property-census.json`,
// independent review, r6c fix round): across the full 130-capture-id sweep, exactly FOUR
// properties ever differ between the twin and realprint on non-control plugin DOM —
// `color`, `fontFamily`, `webkitPrintColorAdjust`, `backgroundImage`. A fifth (or a
// removed) name here means either a real reachability change (re-run the census before
// touching this test) or a silent re-widening back toward the 32-property hole this round
// closed (`sc202-r6crev-canfail-A-background.log` — a screen-only `background-color` rule
// moved 19 twin shots with the OLD set and the gate still exited 0).
import fs from 'fs';
import path from 'path';

const shootMjs = fs.readFileSync(
	path.join(__dirname, '../../../visual-harness/shoot.mjs'),
	'utf8',
);

describe('SC-202 r6c fix round — MEASURED_REACHABLE_PRINT_PROPS stays the measured floor', () => {
	it('parses the declaration (guard against a vacuous pass)', () => {
		expect(shootMjs).toMatch(/const MEASURED_REACHABLE_PRINT_PROPS = new Set\(/);
	});

	it('is exactly the four-property measured-reachable set, in the documented order', () => {
		const decl = shootMjs.match(
			/const MEASURED_REACHABLE_PRINT_PROPS = new Set\(\[([^\]]*)\]\);/,
		);
		expect(decl).not.toBeNull();
		const names = decl![1]
			.split(',')
			.map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
			.filter(Boolean);
		expect(names).toEqual(['color', 'fontFamily', 'webkitPrintColorAdjust', 'backgroundImage']);
	});

	// The narrowing must actually be APPLIED to the sheet-derived set, not just declared
	// and ignored — `printSheetEnumeratedProperties` deletes anything outside the floor.
	it('printSheetEnumeratedProperties intersects its result with the measured floor', () => {
		expect(shootMjs).toMatch(
			/for \(const p of \[\.\.\.props\]\) if \(!MEASURED_REACHABLE_PRINT_PROPS\.has\(p\)\) props\.delete\(p\);/,
		);
	});

	// The self-test (the reviewer's own can-fail pair, built into the sweep) must exist
	// and must actually run — a guard with no caller is dead weight, not a guard.
	it('selfTestPrintDeltaAllowedSet is defined and called alongside assertPrintTwinDelta', () => {
		expect(shootMjs).toMatch(/function selfTestPrintDeltaAllowedSet\(/);
		expect(shootMjs).toMatch(/selfTestPrintDeltaAllowedSet\(enumeratedProps\);/);
	});
});

// SC-127 r3 — the floor this file guards MOVED deliberately: option A converges the plugin
// DOM's `color` and the `<input>`/`<button>`-adjacent `backgroundColor`/`boxShadow` widening
// (measured full-sweep: 316 -> 9 control-adjacent backgroundColor diffs, all the SC-127
// paper root's OWN excused delta; boxShadow 428 -> 0), so the gate could be tightened rather
// than merely holding its old floor. Two guards below pin the after-shape so a future
// re-widening (re-adding `NATIVE_CONTROL_PAINT_PROPS`, or excusing `color` everywhere again)
// fails here first, not only in a full-sweep run against real captures.
describe('SC-127 r3 tightening — the control-paint widening is GONE, color narrows to outside an element root', () => {
	it('NATIVE_CONTROL_PAINT_PROPS (the backgroundColor/boxShadow widening) is no longer DECLARED', () => {
		// The name may still appear in an explanatory comment (documenting what SC-127 r3
		// removed and why) — what must be gone is the declaration/use that actually widens.
		expect(shootMjs).not.toMatch(/const NATIVE_CONTROL_PAINT_PROPS/);
		expect(shootMjs).not.toMatch(/NATIVE_CONTROL_PAINT_PROPS\.has\(/);
	});

	it("the style-diff loop's enumerated-property branch narrows `color` to nodes OUTSIDE an element root", () => {
		expect(shootMjs).toMatch(/if \(p !== 'color'\) continue;/);
		expect(shootMjs).toMatch(/if \(!a\.insideElementRoot && !b\.insideElementRoot\) continue;/);
	});

	it('captureMountSnapshotForPrintDelta records insideElementRoot per node', () => {
		expect(shootMjs).toMatch(/insideElementRoot:\s*!!n\.closest\('\[data-dse-element\]'\)/);
	});

	// The paper-exemption self-test (backgroundColor/printPaperRoot) must exist and run —
	// same "a guard with no caller is dead weight" rule as selfTestPrintDeltaAllowedSet.
	it('selfTestPrintPaperExemption is defined and called alongside assertPrintTwinDelta', () => {
		expect(shootMjs).toMatch(/function selfTestPrintPaperExemption\(/);
		expect(shootMjs).toMatch(/selfTestPrintPaperExemption\(\);/);
	});
});

// SC-127 r3 — the pre-existing gate hole (design report §5): `nativeControlAdjacent`
// qualified a root just because a HIDDEN `.dse-chrome` button sat two levels down, which
// excused that root's own backgroundColor/boxShadow for free — 73 of 75 element×fixture
// roots, proven can-fail on `--element=feature` with the SC-127 paper exemption removed
// (see the r3 report). Fixed by skipping unrendered descendants in the adjacency walk.
describe('SC-127 r3 — nativeControlAdjacent skips UNRENDERED descendants', () => {
	it('only counts a child/grandchild control that actually rendered (getClientRects().length > 0)', () => {
		expect(shootMjs).toMatch(/isRenderedControl\s*=\s*\(el\)\s*=>\s*isControlTag\(el\)\s*&&\s*el\.getClientRects\(\)\.length\s*>\s*0/);
		expect(shootMjs).toMatch(/if \(isRenderedControl\(c\)\) return true;/);
		expect(shootMjs).toMatch(/if \(isRenderedControl\(g\)\) return true;/);
	});
});

// SC-127 r5 MEDIUM-2 (independent review) — the paper exemption used to be spelled out
// TWICE, once in the real loop and once (re-implemented) in its own self-test, so widening
// the real one left the self-test, an `--element=` run and jest all green (proven:
// `sc127-r4-canfail-widenpaper.log` / `sc127-r4-canfail-jest-widenpaper.log`). Fixed by
// moving the decision into one function both callers use.
describe('SC-127 r5 MED-2 — the paper exemption is ONE function, not two copies', () => {
	it('paperExemptionExcuses is declared, and is what the loop calls', () => {
		expect(shootMjs).toMatch(/function paperExemptionExcuses\(p, a, b\)/);
		expect(shootMjs).toMatch(/if \(paperExemptionExcuses\(p, a, b\)\) continue;/);
	});

	it('selfTestPrintPaperExemption calls paperExemptionExcuses — not a re-implementation', () => {
		// Three call sites (the positive case + the two must-be-flagged cases), and no
		// standalone re-implementation of the four-clause condition left behind.
		const calls = shootMjs.match(/paperExemptionExcuses\(\s*'backgroundColor'/g) ?? [];
		expect(calls.length).toBeGreaterThanOrEqual(3);
		expect(shootMjs).not.toMatch(/const isBgFlagged/);
	});
});

// SC-127 r5 LOW-1 (independent review) — the gate was blind to border COLOUR entirely
// (SC-202 r6c cut it for a currentColor-noise reason that no longer applies inside an
// element root once SC-127 r3 converged `color`), so `--table-header-border-color` going
// missing from the host block (37 <th> borders, 8 captures) was invisible to it.
describe('SC-127 r5 LOW-1 — border-colour longhands are sampled, excused only outside a root', () => {
	it('all four border*Color properties are in PRINT_DELTA_STYLE_PROPS', () => {
		for (const p of ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor']) {
			expect(shootMjs).toMatch(new RegExp(`'${p}'`));
		}
	});

	it('BORDER_COLOR_PROPS exists and the loop excuses it only outside an element root', () => {
		expect(shootMjs).toMatch(
			/const BORDER_COLOR_PROPS = new Set\(\['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'\]\);/,
		);
		expect(shootMjs).toMatch(
			/if \(BORDER_COLOR_PROPS\.has\(p\) && !a\.insideElementRoot && !b\.insideElementRoot\) continue;/,
		);
	});
});

// SC-127 r5 MEDIUM-1 / LOW-4 (independent review, owner's ruling) — guard (b) widens from
// the 18 hand-picked palette literals into a census over every host token a rule (either
// sheet) actually CONSUMES where its selector reaches a node inside a print-on root.
describe('SC-127 r5 MED-1/LOW-4 — guard (b) is census-based, not just the 18 literals', () => {
	it('assertSc127HostBlockPinned (the 18-literal pin) is kept, not deleted', () => {
		expect(shootMjs).toMatch(/async function assertSc127HostBlockPinned\(page, pinnedCss\)/);
	});

	it('assertSc127HostPaletteCensus is defined and called alongside it', () => {
		expect(shootMjs).toMatch(/async function assertSc127HostPaletteCensus\(page, pinnedCss\)/);
		expect(shootMjs).toMatch(/await assertSc127HostPaletteCensus\(page, pinnedHost\.css\);/);
	});

	it('the census walks BOTH sheets and strips state pseudo-classes before matching', () => {
		expect(shootMjs).toMatch(
			/extractHostTokenConsumers\(pinnedCss\), \.\.\.extractHostTokenConsumers\(pluginCss\)/,
		);
		expect(shootMjs).toMatch(
			/const STATE_PSEUDO_STRIP = \/:focus-visible\|:focus-within\|:hover\|:active\|:focus\/g;/,
		);
	});

	it('--dse-* tokens are excluded — a host census, not a plugin-token census', () => {
		expect(shootMjs).toMatch(/\.filter\(\(t\) => !t\.startsWith\('--dse-'\)\)/);
	});
});
