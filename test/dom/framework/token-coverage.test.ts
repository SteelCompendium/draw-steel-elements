// D3 Plan 10 Task 1 (scaffold; Task 6 finalizes) — token reconciliation-map coverage.
//
// The D3 token map (docs/superpowers/dse-overhaul/D3-token-map.md, WORKSPACE repo)
// is the single authoritative source for the Steel/Legacy/Print value of every
// --dse-* token — Tasks 3-5 author CSS value blocks FROM it. This test pins the
// map to the DSE_TOKEN_NAMES union: exactly one map row per union name, no
// missing, no extra. Task 6 extends this file into the full build guard (every
// token present in the Legacy base AND covered by the Steel + Print blocks).
//
// The map lives in the WORKSPACE superproject (not this submodule), so the file
// is resolved against the known workspace layouts (main checkout: submodule at
// <workspace>/draw-steel-elements; worktree: <root>/worktrees/<name>/draw-steel-elements
// beside <root>/workspace). DSE_TOKEN_MAP_PATH overrides for exotic layouts.
import * as fs from 'fs';
import * as path from 'path';
import { DSE_TOKEN_NAMES } from '../../../src/framework/tokens';

const repoRoot = path.join(__dirname, '../../..');
const MAP_RELATIVE = 'docs/superpowers/dse-overhaul/D3-token-map.md';

/** Candidate locations for the workspace-repo map doc, in resolution order. */
const candidates = [
	process.env.DSE_TOKEN_MAP_PATH, // explicit override
	path.join(repoRoot, '..', MAP_RELATIVE), // superproject checkout (main or full worktree)
	path.join(repoRoot, '../../../workspace', MAP_RELATIVE), // worktree submodule → main workspace checkout
].filter((p): p is string => !!p);

function locateMap(): string | undefined {
	return candidates.find((p) => fs.existsSync(p));
}

/**
 * Token names claimed by the map: every table row whose FIRST cell is a
 * backticked `--dse-<name>`. Rows anywhere else in the doc (prose mentions,
 * values like var(--dse-fg) in later columns, the spec-concept appendix)
 * intentionally do not match — only a leading first-column entry counts.
 */
function mapTokenRows(md: string): string[] {
	const names: string[] = [];
	for (const line of md.split('\n')) {
		const m = line.match(/^\|\s*`--dse-([a-z0-9-]+)`\s*\|/);
		if (m) names.push(m[1]);
	}
	return names;
}

describe('D3 Task 1: token reconciliation map covers the DSE_TOKEN_NAMES union', () => {
	test('the map doc exists at a known workspace location', () => {
		const found = locateMap();
		if (!found) {
			throw new Error(
				`D3-token-map.md not found. Looked at:\n  ${candidates.join('\n  ')}\n` +
					'Author the map (D3 Plan 10 Task 1) or point DSE_TOKEN_MAP_PATH at it.',
			);
		}
		expect(fs.existsSync(found)).toBe(true);
	});

	test('one map row per union token — no missing, no extra, no duplicates', () => {
		const mapPath = locateMap();
		if (!mapPath) throw new Error('map doc missing (see previous test)');
		const rows = mapTokenRows(fs.readFileSync(mapPath, 'utf8'));

		const union = new Set<string>(DSE_TOKEN_NAMES);
		const rowSet = new Set(rows);

		const missing = DSE_TOKEN_NAMES.filter((n) => !rowSet.has(n));
		const extra = rows.filter((n) => !union.has(n));
		const seen = new Set<string>();
		const dups = rows.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));

		expect(missing).toEqual([]);
		expect(extra).toEqual([]);
		expect(dups).toEqual([]);
		expect(rows.length).toBe(DSE_TOKEN_NAMES.length);
	});
});

// ====================================================================
//   D3 Task 6 — the BUILD GUARD + Legacy fidelity assertion (spec §7.3)
// ====================================================================
//
// The "added a token, forgot a theme block" net TypeScript can't see: for EVERY
// name in DSE_TOKEN_NAMES, assert --dse-<name> is present in the Legacy base AND
// (overridden in Steel OR map-marked Steel-invariant) AND (overridden in a Print
// block OR map-marked print-invariant). Plus: the Legacy base still resolves to
// the map's Legacy column verbatim (Legacy is byte-frozen by D3). Same
// parse-the-declaration strategy the theme tests use (jsdom cannot cascade var()).

const styleSheet = fs.readFileSync(path.join(repoRoot, 'styles-source.css'), 'utf8');

/** All --dse-* definitions inside the given block body. */
function defsIn(body: string): string[] {
	const defs: string[] = [];
	for (const d of body.matchAll(/(?:^|[\s{;])--dse-([a-z0-9-]+)\s*:/g)) defs.push(d[1]);
	return defs;
}
function valueIn(body: string, name: string): string | undefined {
	const m = body.match(new RegExp(`(?:^|[\\s{;])--dse-${name}\\s*:\\s*([^;]+);`));
	return m ? m[1].trim() : undefined;
}
function blockBody(re: RegExp, label: string): string {
	const m = styleSheet.match(re);
	if (!m) throw new Error(`${label} block not found in styles-source.css`);
	return m[1];
}

// The four value blocks D3 owns (the Legacy base is the unscoped :root).
const legacyBase = (() => {
	// The last :root block holds the --dse-* Legacy vocabulary (an earlier :root
	// only aliases the legacy --stamina-bar-* names); concatenate all to be safe.
	let all = '';
	for (const b of styleSheet.matchAll(/:root\s*\{([^}]*)\}/g)) all += b[1] + '\n';
	return all;
})();
const steelDark = blockBody(
	/(?:^|\n)[ \t]*\[data-dse-element\]\[data-dse-theme="steel"\][ \t]*\{([^}]*)\}/,
	'Steel dark',
);
const steelLight = blockBody(
	/(?:^|\n)[ \t]*\.theme-light\s+\[data-dse-element\]\[data-dse-theme="steel"\][ \t]*\{([^}]*)\}/,
	'Steel light',
);
const printNeutral = blockBody(
	/(?:^|\n)[ \t]*\[data-dse-element\]\[data-dse-print="on"\][ \t]*\{([^}]*)\}/,
	'print neutral twin',
);
const printSteel = blockBody(
	/\[data-dse-element\]\[data-dse-theme="steel"\]\[data-dse-print="on"\][ \t]*\{([^}]*)\}/,
	'print Steel twin',
);

// Map-declared "intentionally not overridden" sets (mirror the map's columns).
const STEEL_INVARIANT = new Set(['page-bg', 'pad', 'touch-min', 'font-mono', 'rule-fade']);
const PRINT_INVARIANT = new Set([
	'touch-min', 'font-display', 'font-mono', 'rule-fade',
	...DSE_TOKEN_NAMES.filter((n) => n.startsWith('role-')), // "= Steel (exact)"
]);

const inBase = new Set(defsIn(legacyBase));
const inSteel = new Set(defsIn(steelDark));
const inPrint = new Set([...defsIn(printNeutral), ...defsIn(printSteel)]);

/** The guard predicate: names NOT covered by a block (present OR intentionally invariant). */
function baseGaps(names: readonly string[]): string[] {
	return names.filter((n) => !inBase.has(n));
}
function steelGaps(names: readonly string[]): string[] {
	return names.filter((n) => !inSteel.has(n) && !STEEL_INVARIANT.has(n));
}
function printGaps(names: readonly string[]): string[] {
	return names.filter((n) => !inPrint.has(n) && !PRINT_INVARIANT.has(n));
}

/** The full, frozen Legacy column (= today's shipped :root base, verbatim from the map). */
const LEGACY_MAP: Record<string, string> = {
	surface: 'var(--code-background)',
	'surface-raised': 'var(--color-base-25)',
	'surface-sunken': 'rgba(0,0,0,.2)',
	'page-bg': 'var(--background-primary)',
	border: 'var(--background-modifier-border)',
	'border-strong': 'var(--text-normal)',
	radius: '5px',
	pad: '1rem',
	hover: 'var(--background-modifier-hover)',
	'hairline-fade': 'linear-gradient(to right, var(--icon-color), transparent)',
	'touch-min': '44px',
	heading: 'var(--text-normal)',
	fg: 'var(--text-normal)',
	'fg-muted': 'var(--text-muted)',
	'fg-faint': 'var(--text-faint)',
	'font-display': 'var(--font-text)',
	'font-mono': 'var(--font-monospace)',
	'chip-bg': 'var(--tag-background)',
	accent: 'var(--interactive-accent)',
	'accent-fg': 'var(--text-on-accent)',
	'focus-ring': 'var(--interactive-accent)',
	select: '#D50000',
	'metal-grad': 'none',
	'metal-line': 'none',
	'metal-faint': 'none',
	bevel: 'none',
	emboss: 'none',
	'card-bg': 'none',
	'crest-shape': 'none',
	rule: 'var(--icon-color)',
	'rule-fade': 'transparent',
	'tier-low': 'var(--text-normal)',
	'tier-mid': 'var(--text-normal)',
	'tier-high': 'var(--text-normal)',
	'tier-crit': 'var(--text-normal)',
	'badge-fg': 'var(--dse-fg)',
	'stamina-healthy': 'limegreen',
	'stamina-winded': 'yellow',
	'stamina-dying': 'red',
	'stamina-temp': 'deepskyblue',
	'stamina-track': 'var(--code-background)',
	'turn-done': 'limegreen',
	malice: 'red',
	vp: 'orange',
	warn: 'orange',
	danger: 'crimson',
	'role-ambusher': 'var(--dse-fg-muted)',
	'role-harrier': 'var(--dse-fg-muted)',
	'role-artillery': 'var(--dse-fg-muted)',
	'role-brute': 'var(--dse-fg-muted)',
	'role-controller': 'var(--dse-fg-muted)',
	'role-hexer': 'var(--dse-fg-muted)',
	'role-mount': 'var(--dse-fg-muted)',
	'role-support': 'var(--dse-fg-muted)',
	'role-defender': 'var(--dse-fg-muted)',
	'role-leader': 'var(--dse-fg-muted)',
	'role-solo': 'var(--dse-fg-muted)',
	'role-minion': 'var(--dse-fg-muted)',
	'act-main': 'none',
	'act-maneuver': 'none',
	'act-triggered': 'none',
	'act-move': 'none',
	'act-none': 'none',
	'act-trait': 'none',
};

describe('D3 Task 6: build guard — every token covered by base + Steel + Print (§7.3)', () => {
	test('EVERY union token appears in the Legacy base :root block', () => {
		expect(baseGaps(DSE_TOKEN_NAMES)).toEqual([]);
	});

	test('EVERY union token is overridden in Steel OR map-marked Steel-invariant', () => {
		expect(steelGaps(DSE_TOKEN_NAMES)).toEqual([]);
		// The map's exact split: 59 overridden + 5 invariant = 64.
		const overridden = DSE_TOKEN_NAMES.filter((n) => inSteel.has(n));
		expect(overridden.length).toBe(59);
		expect(STEEL_INVARIANT.size).toBe(5);
	});

	test('EVERY union token is overridden in a Print block OR map-marked print-invariant', () => {
		expect(printGaps(DSE_TOKEN_NAMES)).toEqual([]);
		// 48 overridden (42 neutral + 6 Steel-scoped act) + 16 invariant = 64.
		const overridden = DSE_TOKEN_NAMES.filter((n) => inPrint.has(n));
		expect(overridden.length).toBe(48);
		expect(PRINT_INVARIANT.size).toBe(16);
		expect(overridden.length + PRINT_INVARIANT.size).toBe(DSE_TOKEN_NAMES.length);
	});

	test('the guard HAS TEETH: a token missing from a block IS reported as a gap', () => {
		// A phantom token exists in the union but in NONE of the blocks / invariant sets.
		const phantom = ['zzz-phantom-token'] as const;
		expect(baseGaps(phantom)).toEqual(['zzz-phantom-token']);
		expect(steelGaps(phantom)).toEqual(['zzz-phantom-token']);
		expect(printGaps(phantom)).toEqual(['zzz-phantom-token']);
	});

	test('both print delivery surfaces are present (@media print + preview twin)', () => {
		expect(styleSheet).toMatch(/@media print\s*\{/);
		expect(styleSheet).toMatch(/\[data-dse-element\]\[data-dse-print="on"\]\s*\{/);
	});
});

describe('D3 Task 6: Legacy fidelity — the base is FROZEN at the map Legacy column', () => {
	test('every token under a bare [data-dse-element] resolves to its map Legacy value', () => {
		for (const name of DSE_TOKEN_NAMES) {
			expect(valueIn(legacyBase, name)).toBe(LEGACY_MAP[name]);
		}
	});

	test('the Legacy map covers exactly the union (no drift in the fidelity fixture)', () => {
		expect(new Set(Object.keys(LEGACY_MAP))).toEqual(new Set<string>(DSE_TOKEN_NAMES));
	});
});
