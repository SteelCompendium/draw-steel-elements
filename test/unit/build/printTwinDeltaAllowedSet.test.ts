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
const stylesSourceCss = fs.readFileSync(
	path.join(__dirname, '../../../styles-source.css'),
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
	// SC-127 r7 LOW-A (scoped re-review) — the original version of this test matched
	// `'borderTopColor'` etc. ANYWHERE in shoot.mjs, which the neighbouring
	// `BORDER_COLOR_PROPS` Set literal ALSO contains — so deleting the four entries from
	// `PRINT_DELTA_STYLE_PROPS` still left the test green, 17/17 (proven, r6 review). Now
	// scoped to the array's OWN declaration body, the same "extract, then assert on the
	// extracted body" convention `MEASURED_REACHABLE_PRINT_PROPS`'s own test above uses.
	it('all four border*Color properties are inside the PRINT_DELTA_STYLE_PROPS array body', () => {
		const decl = shootMjs.match(/const PRINT_DELTA_STYLE_PROPS = \[([^\]]*)\];/);
		expect(decl).not.toBeNull();
		const body = decl![1];
		for (const p of ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor']) {
			expect(body).toMatch(new RegExp(`'${p}'`));
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

// SC-127 r7 (owner ruling, "light island" generator — see the Amendment in
// sc127-brief-r7-fix.md) — two earlier designs for guard (b) each had a MEASURED blind
// spot: an 18-literal hand-picked pin (r3/r5) and, after that, two different reachability
// filters (r5's live-gallery DOM walk, missed 10 tokens; r7's first attempt, a textual
// ancestor-scope classifier, fired on 222 of 278 theme-differing tokens). The owner
// retired reachability filtering entirely: `visual-harness/obsidian-light-island.mjs`
// generates the `.theme-dark [data-dse-element][data-dse-print="on"]…` host block from
// EVERY `--*` token the pinned Obsidian sheet resolves differently under `.theme-dark` vs
// `.theme-light`, judging nothing about whether the plugin actually consumes it.
const islandMjs = fs.readFileSync(
	path.join(__dirname, '../../../visual-harness/obsidian-light-island.mjs'),
	'utf8',
);

function extractIslandConst(name: string): string {
	const m = islandMjs.match(new RegExp(`export const ${name} =\\s*'([^']*)'`));
	if (!m) throw new Error(`could not find ${name} in obsidian-light-island.mjs`);
	return m[1];
}

const BEGIN_MARKER = extractIslandConst('BEGIN_MARKER');
const END_MARKER = extractIslandConst('END_MARKER');
const HOST_SELECTOR = extractIslandConst('HOST_SELECTOR');

describe('SC-127 r7 — obsidian-light-island.mjs exists with the expected shape', () => {
	it('exports the generator core, the marker constants and the host selector', () => {
		expect(islandMjs).toMatch(/export function allDeclaredTokenNames\(css\)/);
		expect(islandMjs).toMatch(/export async function generateLightIsland\(page, pinnedCss\)/);
		expect(islandMjs).toMatch(/export function extractCurrentIsland\(sheet\)/);
		expect(BEGIN_MARKER).toContain('GENERATED');
		expect(BEGIN_MARKER).toContain('BEGIN');
		expect(END_MARKER).toContain('END');
		expect(HOST_SELECTOR).toBe(
			'.theme-dark [data-dse-element][data-dse-print="on"][data-dse-print="on"]',
		);
	});

	it('restates EVERY differing token — no reachability filter (querySelectorAll, ancestor scope) anywhere in the generator', () => {
		expect(islandMjs).not.toMatch(/querySelectorAll/);
		expect(islandMjs).not.toMatch(/exclusionFor|EXCLUDED_ANCESTOR_SCOPES|splitSubject/);
	});

	// SC-127 r11 (round-10 re-review L2): r9's own bug 2 was exactly this — `lightDefault`
	// was computed inside generateLightIsland but never included in its `return { ... }`
	// object literal, so the guard's destructured `lightDefault` was `undefined` and every
	// lookup into it threw deep inside a 10-minute sweep (r9's own `sweepA2.log`). Nothing
	// in the 33 tests that existed at the time caught it — only a full sweep did, through
	// L1's (then-generic) exception path. This pins the return statement's exact key set so
	// dropping any one of them (lightDefault included) is red in milliseconds, not a sweep.
	it('generateLightIsland returns every key the guard (shoot.mjs) and the CLI depend on, including lightDefault', () => {
		const m = islandMjs.match(/export async function generateLightIsland\(page, pinnedCss\) \{[\s\S]*?\n\treturn \{([^}]*)\};\n\}/);
		if (!m) throw new Error('could not find generateLightIsland\'s return statement');
		const keys = m[1]
			.split(',')
			.map((k) => k.trim())
			.filter(Boolean);
		expect(keys).toEqual(['tokenNames', 'differing', 'accentDerived', 'light', 'lightDefault', 'text']);
	});

	it('package.json has the gen-light-island script', () => {
		const pkg = fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8');
		expect(pkg).toMatch(/"gen-light-island":\s*"node visual-harness\/obsidian-light-island\.mjs"/);
	});
});

describe('SC-127 r7 — styles-source.css carries the GENERATED light-island block', () => {
	function currentIsland(): string | null {
		const bi = stylesSourceCss.indexOf(BEGIN_MARKER);
		const ei = stylesSourceCss.indexOf(END_MARKER);
		if (bi === -1 || ei === -1 || ei < bi) return null;
		return stylesSourceCss.slice(bi, ei + END_MARKER.length);
	}

	it('the BEGIN/END markers exist, exactly once each, in the right order', () => {
		expect(stylesSourceCss.split(BEGIN_MARKER).length - 1).toBe(1);
		expect(stylesSourceCss.split(END_MARKER).length - 1).toBe(1);
		expect(stylesSourceCss.indexOf(BEGIN_MARKER)).toBeLessThan(stylesSourceCss.indexOf(END_MARKER));
	});

	it('the block declares the host selector and a generous floor of tokens (295 measured at r7)', () => {
		const island = currentIsland();
		expect(island).not.toBeNull();
		expect(island).toContain(HOST_SELECTOR);
		const declCount = (island!.match(/--[a-zA-Z0-9-]+:\s*[^;]+;/g) ?? []).length;
		expect(declCount).toBeGreaterThan(200);
	});

	it('specific tokens this ticket hand-diagnosed across r5/r7 are present (regression floor — not a completeness proof, see the describe block below for that)', () => {
		const island = currentIsland()!;
		for (const t of [
			'--hr-color',
			'--link-color-hover',
			'--link-external-color-hover',
			'--table-header-border-color',
			'--background-modifier-border-hover',
			'--background-modifier-border-focus',
			'--background-modifier-form-field-hover',
			'--caret-color',
			'--input-placeholder-color',
			'--list-marker-color',
		]) {
			expect(island).toContain(`${t}:`);
		}
	});

	it('the real (non-custom) caret-color and scrollbar-color properties are restated (SC-127 r5 LOW-2 — a mapping alone cannot re-trigger inheritance)', () => {
		const island = currentIsland()!;
		expect(island).toMatch(/[^-]caret-color:\s*var\(--caret-color\)\s*;/);
		expect(island).toMatch(/scrollbar-color:\s*var\(--scrollbar-thumb-bg\)\s*var\(--scrollbar-bg\)\s*;/);
	});

	// SC-127 r9 MEDIUM-B (scoped re-review regression) — accent-derived tokens must stay
	// FORMULAS over var(--accent-h/s/l), never a baked default (258/88%/66%). Regression
	// floor: a handful of the 34 the reviewer measured, checked by name; the full
	// completeness+value proof is the manifest-comparison describe block below.
	it('accent-derived tokens are var(--accent-h/s/l) formulas, never the baked default 258/88%/66%', () => {
		const island = currentIsland()!;
		for (const t of ['--color-accent-1', '--checkbox-color', '--text-accent', '--interactive-accent']) {
			const m = island.match(new RegExp(`\\t${t.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}:\\s*([^;]+);`));
			expect(m).not.toBeNull();
			const value = m![1];
			expect(value).toMatch(/var\(--accent-(h|s|l)\)/);
			expect(value).not.toContain('258');
			expect(value).not.toContain('88%');
			expect(value).not.toContain('66%');
		}
	});
});

// SC-127 r9 LOW-C (scoped re-review) — the r7 "amendment point 3" test was weaker than
// its own comment claimed: mapping-only tokens (declared once at body level, no per-theme
// override) hit `undefined === undefined` and were skipped as "provably identical" even
// when they genuinely differ through a dependency chain (deleting `--text-normal` stayed
// green, 21/21); values were never compared at all (editing a value stayed green); and
// because `visual-harness/dist/obsidian-app.css` is gitignored and CI runs jest before any
// harness fetch, the test always skipped in CI. Fixed by comparing against
// `obsidian-light-island.manifest.json` — a COMMITTED (not gitignored) JSON file the
// generator writes alongside the CSS block, name -> the exact value it wrote. This is not
// a re-implementation of CSS cascade resolution (LOW-C's other option, "compare the full
// generated text… or the parsed declaration map, names AND values, mapping-only tokens
// included") — it is the SAME generator's own trusted output, so there is nothing here
// that could disagree with the real browser-based resolution the way a hand-rolled
// resolver could. This test never skips (the manifest is always present, tracked); a
// SEPARATE, narrower test below still checks the manifest itself against a locally cached
// pinned sheet when one exists, purely as an extra local sanity check.
describe('SC-127 r9 LOW-C — the committed block matches the committed manifest (names AND values, always runs)', () => {
	const manifest: Record<string, string> = JSON.parse(
		fs.readFileSync(path.join(__dirname, '../../../visual-harness/obsidian-light-island.manifest.json'), 'utf8'),
	);

	function islandDeclMap(): Record<string, string> {
		const bi = stylesSourceCss.indexOf(BEGIN_MARKER);
		const ei = stylesSourceCss.indexOf(END_MARKER);
		expect(bi).toBeGreaterThan(-1);
		expect(ei).toBeGreaterThan(bi);
		const island = stylesSourceCss.slice(bi, ei);
		const out: Record<string, string> = {};
		for (const m of island.matchAll(/\t(--[a-zA-Z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
		return out;
	}

	it('the manifest is non-empty and has the expected shape (guard against a vacuous pass)', () => {
		const keys = Object.keys(manifest);
		expect(keys.length).toBeGreaterThan(200);
		expect(keys.every((k) => k.startsWith('--'))).toBe(true);
	});

	it('every manifest token is present in the committed block with the EXACT SAME value', () => {
		const island = islandDeclMap();
		const wrong: string[] = [];
		const missing: string[] = [];
		for (const [token, value] of Object.entries(manifest)) {
			if (!(token in island)) {
				missing.push(token);
				continue;
			}
			if (island[token] !== value) wrong.push(`${token}: manifest says "${value}", block says "${island[token]}"`);
		}
		expect(missing).toEqual([]);
		expect(wrong).toEqual([]);
	});

	it('the committed block declares no MORE custom-property tokens than the manifest (nothing hand-added)', () => {
		const island = islandDeclMap();
		const extra = Object.keys(island).filter((t) => !(t in manifest));
		expect(extra).toEqual([]);
	});
});

// SC-127 r9 LOW-C, second half — an EXTRA local sanity check (not the enforced one — see
// above): where a cached pinned sheet happens to be present, also confirm the COMMITTED
// MANIFEST itself is not stale against it, using the same textual approximation r7's
// amendment (3) test used (jsdom cannot do real CSS cascade resolution, so this remains
// best-effort: it can prove a token is STALE via a directly-redeclared-per-theme mismatch,
// but not through a multi-step mapping chain — matching what it could always prove).
// Skips cleanly, and SAYS SO, when the pinned sheet is not cached locally (true in CI).
//
// SC-127 r11 (round-10 re-review L3): this test used to loop over `Object.keys(manifest)`
// and check `t in manifest` — always true by construction, since `t` came FROM that same
// object's own keys. The test was a tautology: deleting a token from BOTH the committed
// block and the manifest (e.g. `--color-base-30`) left it green, because the thing it
// iterated over shrank along with the thing it checked against. Fixed to iterate the
// SHEET-DERIVED set instead (tokens directly redeclared with a different literal value
// under `.theme-dark` vs `.theme-light`) and check THAT set is a subset of the manifest's
// keys — now an independently-derived expectation, so a token missing from the manifest
// (dropped, or never added) is caught regardless of what the manifest itself still lists.
describe('SC-127 r9 LOW-C (extra, local-only) — the manifest vs a locally cached pinned sheet, textually', () => {
	const PINNED_SHEET_PATH = path.join(__dirname, '../../../visual-harness/dist/obsidian-app.css');
	const hasPinnedSheet = fs.existsSync(PINNED_SHEET_PATH);
	const manifest: Record<string, string> = JSON.parse(
		fs.readFileSync(path.join(__dirname, '../../../visual-harness/obsidian-light-island.manifest.json'), 'utf8'),
	);

	if (!hasPinnedSheet) {
		it.skip('SKIPPED (this is expected in CI) — no cached visual-harness/dist/obsidian-app.css on this machine (run `npm run host-css` first)', () => {});
	} else {
		it('every sheet-derived differing token (directly redeclared, dark vs light, with a different literal) is present in the manifest (best-effort — see the describe block above for the enforced, exact check)', () => {
			const pinnedCss = fs.readFileSync(PINNED_SHEET_PATH, 'utf8');

			function ruleBody(css: string, selector: string): string {
				const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
				const idx = stripped.indexOf(`\n${selector} {`);
				if (idx === -1) return '';
				const open = stripped.indexOf('{', idx);
				let depth = 1;
				let i = open + 1;
				while (i < stripped.length && depth > 0) {
					if (stripped[i] === '{') depth += 1;
					else if (stripped[i] === '}') depth -= 1;
					i += 1;
				}
				return stripped.slice(open + 1, i - 1);
			}
			function declMap(body: string): Record<string, string> {
				const out: Record<string, string> = {};
				for (const m of body.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
				return out;
			}
			const darkDecls = declMap(ruleBody(pinnedCss, '.theme-dark'));
			const lightDecls = declMap(ruleBody(pinnedCss, '.theme-light'));

			// The SHEET's own set, independent of the manifest entirely: every token directly
			// redeclared under BOTH selectors with a textually different literal. This is a
			// strict subset of the generator's real (cascade-resolved) differing set — it
			// cannot see a multi-step mapping chain, matching what a textual check could ever
			// prove — but every name in it is unambiguous: this is what makes the check
			// non-tautological, since it no longer depends on the manifest's own key list.
			const sheetDiffering = Object.keys(darkDecls).filter((t) => t in lightDecls && darkDecls[t] !== lightDecls[t]);
			expect(sheetDiffering.length).toBeGreaterThan(20); // guard against a vacuous pass (e.g. a selector-match regression above)

			const missing = sheetDiffering.filter((t) => !(t in manifest));
			expect(missing).toEqual([]);
		});
	}
});
