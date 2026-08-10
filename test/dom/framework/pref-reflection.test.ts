// Plan 13 Task 3 (D4 §1.1/§3) — presentation prefs are ATTRIBUTE-DRIVEN: the
// pipeline reflects catalog attrs onto every element root at first paint and
// re-stamps live on prefs.set — CSS reflows, no re-render. Also pins the CSS
// hooks themselves (grep-pins, theme-print.test.ts style) so a selector rename
// breaks CI, not a user's vault.
import * as fs from 'fs';
import * as path from 'path';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { Component, flushAsync } from '../../mocks/obsidian';

const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

function makeStore() {
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const store = createPreferenceStore(storage);
	store.describe(DSE_PREF_DESCRIPTORS);
	return store;
}

test('reflect() stamps every catalog presentation default on a root (first-paint contract)', () => {
	const store = makeStore();
	const owner: any = new Component();
	owner.load();
	const root = document.createElement('div');
	store.reflect(root, owner);
	expect(root.getAttribute('data-dse-density')).toBe('comfortable');
	expect(root.getAttribute('data-dse-sb-featstyle')).toBe('card');
	expect(root.getAttribute('data-dse-sb-columns')).toBe('single');
	expect(root.getAttribute('data-dse-sb-stats')).toBe('grid');
	// SC-123's seven additions — same first-paint contract, same defaults-are-today's-look
	// bar (the two conditional-DOM ones, sb-charline/sb-charbox, also gate the merged
	// characteristics text node; see statblock/view.ts renderChars).
	expect(root.getAttribute('data-dse-kwusage')).toBe('crest');
	expect(root.getAttribute('data-dse-disttarget')).toBe('grid');
	expect(root.getAttribute('data-dse-sb-charline')).toBe('one');
	expect(root.getAttribute('data-dse-sb-charbox')).toBe('off');
	expect(root.getAttribute('data-dse-sb-villain')).toBe('inline');
	expect(root.getAttribute('data-dse-fb-featstyle')).toBe('card');
	expect(root.getAttribute('data-dse-fb-stats')).toBe('grid');
	expect(root.getAttribute('data-dse-reduce-motion')).toBe('false');
	expect(root.getAttribute('data-dse-print')).toBe('off');
	expect(root.getAttribute('data-dse-portraits')).toBe('on');
	expect(root.hasAttribute('data-dse-theme')).toBe(false); // ThemeService's attribute, never reflect's
});

test('a live prefs.set re-stamps every reflected root IN PLACE (reflow, not re-render)', async () => {
	const store = makeStore();
	const owner: any = new Component();
	owner.load();
	const a = document.createElement('div');
	const b = document.createElement('div');
	store.reflect(a, owner);
	store.reflect(b, owner);
	await store.set('sbDensity', 'compact');
	await flushAsync(1);
	expect(a.getAttribute('data-dse-density')).toBe('compact');
	expect(b.getAttribute('data-dse-density')).toBe('compact');
});

test('styles-source.css keys the statblock pref hooks off the ROOT attributes (built vocabulary)', () => {
	expect(sheet).toMatch(/\[data-dse-element='statblock'\]\[data-dse-density='compact'\] \.dse-sb/);
	expect(sheet).toMatch(/\[data-dse-element='statblock'\]\[data-dse-sb-featstyle='flat'\]/);
	expect(sheet).toMatch(/\[data-dse-element='statblock'\]\[data-dse-sb-columns='wide'\] \.dse-sb > \.dse-feature__nested/);
	// SC-146 fix 1: re-pointed from .dse-sb__item (the PRIMARY stat row) to
	// .dse-sb__grid/.dse-sb__kv (the ACTUAL secondary stats block) — see
	// styles-source.css's own comment at this selector for the full story.
	expect(sheet).toMatch(/\[data-dse-element='statblock'\]\[data-dse-sb-stats='ledger'\] \.dse-sb__grid/);
	expect(sheet).toMatch(/\[data-dse-element\]\[data-dse-reduce-motion='true'\]/);
	// the OLD card-scoped selectors must be gone (they'd shadow the reflected root):
	expect(sheet).not.toMatch(/\.dse-sb\[data-dse-density/);
	expect(sheet).not.toMatch(/\.dse-sb\[data-dse-sb-featstyle/);
	// SC-123: the fb stat hook moved off the CARD (a hard-coded literal, which is what
	// made its `ledger` arm dead code) onto the reflected root, same as the sb four.
	expect(sheet).not.toMatch(/\.dse-fb\[data-dse-fb-stats/);
});

test('SC-123: every new pref hook keys off a ROOT attribute too, one non-default arm each', () => {
	// The two ability-card bands are Steel-screen-scoped (the chip/rail vocabulary they
	// restyle only exists there); the statblock/featureblock ones are theme-agnostic.
	expect(sheet).toMatch(/\[data-dse-kwusage='text'\] \.dse-feature__meta-chips/);
	expect(sheet).toMatch(/\[data-dse-kwusage='grid'\] \.dse-feature__meta-chips/);
	expect(sheet).toMatch(/\[data-dse-kwusage='ledger'\] \.dse-feature__meta-chips/);
	expect(sheet).toMatch(/\[data-dse-disttarget='text'\] \.dse-feature__meta-rail/);
	expect(sheet).toMatch(/\[data-dse-disttarget='ledger'\] \.dse-feature__meta-rail/);
	expect(sheet).toMatch(/\[data-dse-element='statblock'\]\[data-dse-sb-charline='two'\] \.dse-sb__char/);
	expect(sheet).toMatch(/\[data-dse-sb-charbox='on'\] \.dse-sb__char-box/);
	expect(sheet).toMatch(/\[data-dse-sb-charbox='onword'\] \.dse-sb__char-box/);
	expect(sheet).toMatch(/\[data-dse-element='featureblock'\]\[data-dse-fb-featstyle='flat'\]/);
	expect(sheet).toMatch(/\[data-dse-fb-stats='ledger'\] \.dse-fb__stats/);
	// The villain band is CONDITIONAL DOM, not a CSS mode: the sheet styles the band
	// class the view only ever builds at sbVillain='banded', so `banded` is correctly
	// absent from every selector.
	expect(sheet).toMatch(/^\.dse-sb__band \{/m);
	expect(sheet).not.toMatch(/data-dse-sb-villain=/);
});

// —— SC-123 fix round pins ————————————————————————————————————————————————————————
//
// Three CSS-level regressions the review found, each cheap to re-introduce and
// invisible in a screenshot of the default state, so each gets a grep-pin here.

test('M-2: the kwUsage/distTarget mode arms carry into PRINT (no :not([data-dse-print]) on any of them)', () => {
	// The site keeps every `.sb__field` layout mode on paper and strips only backgrounds
	// (steel-statblock.css:654). The first cut screen-scoped all seven of these arms, so
	// two of the five statblock settings silently disagreed with their own printout while
	// the other three (charline/charbox/villain, theme-agnostic) carried through.
	const modeArms = sheet
		.split('\n')
		.filter((line) => /\[data-dse-(kwusage|disttarget)='/.test(line));
	expect(modeArms.length).toBeGreaterThan(0);
	// The ONLY arms allowed to stay screen-scoped are the material refinements: the
	// translucent wash and the metal hairline colour, which print deliberately drops.
	const screenScoped = modeArms.filter((line) => line.includes(':not([data-dse-print="on"])'));
	for (const line of screenScoped) {
		expect(line).toMatch(/\[data-dse-(kwusage|disttarget)='(grid|ledger)'\]/);
	}
	// …and every mode arm still names a NON-DEFAULT value, which is why none of them can
	// be reached by a frozen camera (all of which shoot defaults) even in print.
	for (const line of modeArms) {
		expect(line).not.toMatch(/data-dse-kwusage='crest'/);
		expect(line).not.toMatch(/data-dse-disttarget='grid'/);
	}
});

test("M-3: every new border declaration falls back off the Steel-only tokens (Legacy paints them all)", () => {
	// --dse-rule is `var(--icon-color)` declared on <html>, where Obsidian has not defined
	// --icon-color — guaranteed-invalid, which makes `1px solid var(--dse-rule)` invalid
	// at computed-value time and collapses the border to 0px/none outside Steel. Worst
	// case measured: `sbCharBox: on` under Legacy rendered a bare "M +2" — no box, and
	// the spelled-out word display:none'd by the same arm.
	const declarations = [
		/\.dse-sb__char-box \{[^}]*border: 1px solid var\(--dse-rule, var\(--background-modifier-border\)\)/,
		/\.dse-sb__band \{[^}]*border: 1px solid var\(--dse-rule, var\(--background-modifier-border\)\)/,
		/\[data-dse-fb-stats='ledger'\] \.dse-fb__stats > \.dse-fb__stat \{[^}]*border-bottom: 1px solid var\(--dse-rule, var\(--background-modifier-border\)\)/,
	];
	for (const re of declarations) expect(sheet).toMatch(re);
	// …and Steel screen still re-colours the boxed letter to the forged metal line, so
	// the fallback costs the Steel look nothing.
	expect(sheet).toMatch(
		/\[data-dse-theme='steel'\]:not\(\[data-dse-print="on"\]\) \.dse-sb__char-box \{[^}]*border-color: var\(--dse-metal-line\)/,
	);
});

test('L-3: the kwUsage colon reset is scoped to the CHIP band, never the distance/target rail', () => {
	// Unqualified, `[data-dse-kwusage='grid'] .dse-feature__meta-key::after` also cleared
	// the rail's key punctuation — the KEYWORD preference silently governing the DISTANCE
	// rail. Inert today, but a cross-pref coupling one rule away from mattering.
	const colonResets = sheet
		.split('\n')
		.filter((line) => /data-dse-kwusage.*\.dse-feature__meta-key::after/.test(line));
	expect(colonResets.length).toBe(2); // grid + ledger
	for (const line of colonResets) expect(line).toContain('.dse-feature__meta-chips ');
});

test('defaults are CSS no-ops: no selector exists for any catalog default value (legacy fidelity)', () => {
	expect(sheet).not.toMatch(/data-dse-density='comfortable'/);
	expect(sheet).not.toMatch(/data-dse-sb-featstyle='card'/);
	expect(sheet).not.toMatch(/data-dse-sb-columns='single'/);
	expect(sheet).not.toMatch(/data-dse-sb-stats='grid'/);
	// SC-123's seven. `sb-charline='one'` is the interesting one: the one-line arms are
	// reachable only at a non-default sb-charbox, so they are written as
	// `:not([data-dse-sb-charline='two'])` rather than naming the default.
	expect(sheet).not.toMatch(/data-dse-kwusage='crest'/);
	expect(sheet).not.toMatch(/data-dse-disttarget='grid'/);
	expect(sheet).not.toMatch(/data-dse-sb-charline='one'/);
	expect(sheet).not.toMatch(/data-dse-sb-charbox='off'/);
	expect(sheet).not.toMatch(/data-dse-sb-villain='inline'/);
	expect(sheet).not.toMatch(/data-dse-fb-featstyle='card'/);
	expect(sheet).not.toMatch(/data-dse-fb-stats='grid'/);
});

// SC-146 FIX ROUND 1, I3 — grep-pin guards for every new/changed arm this fix round
// touched. The review's own diagnosis: the original commit shipped a fully green
// battery with a Critical defect (C1, gridc inverted under Steel) because nothing in
// the suite rendered a non-default statblock pref. These are the "cheap tier" fix —
// one assertion per surface, in the sheet-grep style this file already uses. The
// "right tier" (real harness shot variants) lives in visual-harness/entry.ts's
// FIXTURES.statblock (stats-ledger/stats-gridc/featstyle-flat/columns-wide).
describe('SC-146 fix round 1 — regression guards', () => {
	test('no [data-dse-sb-stats] selector anywhere ever targets .dse-sb__items (the mistargeting fix-1 corrected)', () => {
		// Blanket guard for the root defect the whole ticket opened on: sb-stats
		// mis-targeting the PRIMARY row instead of the secondary .dse-sb__grid/.dse-sb__kv
		// block. Scans every [data-dse-sb-stats=...] rule's selector line, not just ledger's.
		for (const m of sheet.matchAll(/\[data-dse-sb-stats='[a-z]+'\][^{]*\{/g)) {
			expect(m[0]).not.toMatch(/\.dse-sb__items/);
		}
	});

	test('gridc has a Steel-scoped, theme-qualified layout arm that flips column-reverse (C1 guard)', () => {
		// This is the single assertion the review's I3 finding says would have caught C1:
		// the Steel box rule at ~5906 (`[data-dse-theme='steel']... .dse-sb__kv { flex-direction: column }`)
		// ties in specificity with an UNSCOPED gridc arm and wins on source order. Only a
		// gridc arm that is ITSELF theme-qualified (attribute-for-attribute at least as
		// specific as the box rule, i.e. carrying data-dse-theme='steel') can beat that tie
		// regardless of where either rule sits in the file.
		const steelGridcKv = /\[data-dse-theme='steel'\][^{]*\[data-dse-sb-stats='gridc'\][^{]*\.dse-sb__kv\s*\{([^}]*)\}/;
		const m = sheet.match(steelGridcKv);
		expect(m).not.toBeNull();
		expect(m![1]).toMatch(/flex-direction:\s*column-reverse/);
		// M4: the site's even-rail floor/centering, folded into the same Steel arm.
		expect(m![1]).toMatch(/justify-content:\s*center/);
		expect(m![1]).toMatch(/min-height:\s*3\.3rem/);
	});

	test('ledger keeps the secondary block a TWO-column grid under Steel (I1 guard) — no display:block survives', () => {
		// The base (Legacy/print) ledger .dse-sb__grid arm must never re-collapse to one
		// column: assert no `display: block` sits inside it.
		const baseGrid = sheet.match(/\[data-dse-element='statblock'\]\[data-dse-sb-stats='ledger'\] \.dse-sb__grid\s*\{([^}]*)\}/);
		expect(baseGrid).not.toBeNull();
		expect(baseGrid![1]).not.toMatch(/display:\s*block/);
		expect(baseGrid![1]).toMatch(/gap:\s*0 1\.6rem/);
		// And the Steel-scoped companion (needed because the plain Steel `.dse-sb__grid
		// { gap: 0.5rem }` rule ties the base arm's specificity and sits later in the file).
		const steelGrid = sheet.match(/\[data-dse-theme='steel'\][^{]*\[data-dse-sb-stats='ledger'\][^{]*\.dse-sb__grid\s*\{([^}]*)\}/);
		expect(steelGrid).not.toBeNull();
		expect(steelGrid![1]).toMatch(/gap:\s*0 1\.6rem/);
	});

	test('ledger under Steel resets the cell to a real hairline row (border-bottom survives, box is gone)', () => {
		const steelKv = sheet.match(/\[data-dse-theme='steel'\][^{]*\[data-dse-sb-stats='ledger'\][^{]*\.dse-sb__kv\s*\{([^}]*)\}/);
		expect(steelKv).not.toBeNull();
		expect(steelKv![1]).toMatch(/border:\s*none/);
		expect(steelKv![1]).toMatch(/border-bottom:\s*1px solid/);
	});

	test('ledger value is right-aligned (M3 guard)', () => {
		expect(sheet).toMatch(/\[data-dse-element='statblock'\]\[data-dse-sb-stats='ledger'\] \.dse-sb__kv-v\s*\{[^}]*text-align:\s*right/);
	});

	test('flat-mode ◆ separator: the sibling selector opens real spacing AND the halo uses the plate colour, not the page token', () => {
		const spacer = sheet.match(/\[data-dse-theme='steel'\][^{]*\[data-dse-sb-featstyle='flat'\][^{]*\.dse-feature__nested > \.dse-feature \+ \.dse-feature:not\(\.dse-fb \*\)\s*\{([^}]*)\}/);
		expect(spacer).not.toBeNull();
		expect(spacer![1]).toMatch(/margin-top:\s*4px/);
		expect(spacer![1]).toMatch(/padding-top:\s*1\.25rem/);
		// The dark base arm (first ::after match in the file) uses the plate's own
		// solid mid-tone as a raw literal, not --dse-page-bg — a one-off halo colour
		// with a single consumer, same precedent as .dse-sb__chars's raw-rgba
		// gradient (no --dse-* token added; see the rule's own comment).
		const diamond = sheet.match(/\.dse-feature \+ \.dse-feature:not\(\.dse-fb \*\)::after\s*\{([^}]*)\}/);
		expect(diamond).not.toBeNull();
		expect(diamond![1]).toMatch(/box-shadow:[\s\S]*#1e2327/);
		// The declaration itself (not the explanatory comment above it, which
		// necessarily names the OLD token it replaced) must not reference it.
		const diamondNoComments = diamond![1].replace(/\/\*[\s\S]*?\*\//g, '');
		expect(diamondNoComments).not.toMatch(/--dse-page-bg/);
		// The light-scheme twin overrides the halo colour to the site's own light
		// plate-solid value (steel-statblock.css:74).
		expect(sheet).toMatch(/body\.theme-light \[data-dse-theme='steel'\][^{]*\[data-dse-sb-featstyle='flat'\][^{]*::after\s*\{[^}]*#f4f6f6/);
	});

	// SC-123 fix round (review L-8, deferred here on purpose until SC-146 landed): the
	// FEATUREBLOCK twin of the separator above. Both settings are called "Flat list" and
	// the site draws separators in both of its flat modes, so the two must not diverge —
	// which is exactly what would happen silently if only one of them ever grew a ◆.
	test('flat-mode ◆ separator: the FEATUREBLOCK twin matches the statblock recipe declaration for declaration', () => {
		const fbSpacer = sheet.match(
			/\[data-dse-theme='steel'\][^{]*\[data-dse-fb-featstyle='flat'\][^{]*\.dse-feature__nested > \.dse-feature \+ \.dse-feature\s*\{([^}]*)\}/,
		);
		expect(fbSpacer).not.toBeNull();
		expect(fbSpacer![1]).toMatch(/margin-top:\s*4px/);
		expect(fbSpacer![1]).toMatch(/padding-top:\s*1\.25rem/);

		const fbDiamond = sheet.match(
			/\[data-dse-theme='steel'\][^{]*\[data-dse-fb-featstyle='flat'\][^{]*\.dse-feature \+ \.dse-feature::after\s*\{([^}]*)\}/,
		);
		expect(fbDiamond).not.toBeNull();
		// Same 8px rotated core, same two halo rings, same plate-solid mid-tone — `.dse-fb`
		// joins the same card-ground selector list as `.dse-sb`, so the ground under both
		// diamonds is the identical gradient.
		expect(fbDiamond![1]).toMatch(/width:\s*8px/);
		expect(fbDiamond![1]).toMatch(/transform:\s*rotate\(45deg\)/);
		expect(fbDiamond![1]).toMatch(/box-shadow:[\s\S]*#1e2327/);
		expect(fbDiamond![1]).toMatch(/box-shadow:[\s\S]*--dse-metal-faint/);
		expect(sheet).toMatch(
			/body\.theme-light \[data-dse-theme='steel'\][^{]*\[data-dse-fb-featstyle='flat'\][^{]*::after\s*\{[^}]*#f4f6f6/,
		);

		// Screen + Steel only, like its twin: Legacy draws no ornaments and print never
		// pays for the seam (both frozen classes, both unreachable here by construction).
		for (const m of sheet.matchAll(
			/^[^\n{}]*\[data-dse-fb-featstyle='flat'\][^\n{}]*\.dse-feature \+ \.dse-feature[^\n{}]*\{/gm,
		)) {
			expect(m[0]).toContain(":not([data-dse-print=\"on\"])");
			expect(m[0]).toContain("[data-dse-theme='steel']");
		}
	});

	test('wide columns packs at the site\'s real 560px (35rem), not the old 448px (28rem) (M6 guard)', () => {
		const wide = sheet.match(/\[data-dse-sb-columns='wide'\] \.dse-sb > \.dse-feature__nested\s*\{([^}]*)\}/);
		expect(wide).not.toBeNull();
		expect(wide![1]).toMatch(/columns:\s*35rem/);
		expect(wide![1]).not.toMatch(/28rem/);
	});
});
