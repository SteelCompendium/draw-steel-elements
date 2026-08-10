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
});

test('defaults are CSS no-ops: no selector exists for any catalog default value (legacy fidelity)', () => {
	expect(sheet).not.toMatch(/data-dse-density='comfortable'/);
	expect(sheet).not.toMatch(/data-dse-sb-featstyle='card'/);
	expect(sheet).not.toMatch(/data-dse-sb-columns='single'/);
	expect(sheet).not.toMatch(/data-dse-sb-stats='grid'/);
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

	test('wide columns packs at the site\'s real 560px (35rem), not the old 448px (28rem) (M6 guard)', () => {
		const wide = sheet.match(/\[data-dse-sb-columns='wide'\] \.dse-sb > \.dse-feature__nested\s*\{([^}]*)\}/);
		expect(wide).not.toBeNull();
		expect(wide![1]).toMatch(/columns:\s*35rem/);
		expect(wide![1]).not.toMatch(/28rem/);
	});
});
