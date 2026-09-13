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
