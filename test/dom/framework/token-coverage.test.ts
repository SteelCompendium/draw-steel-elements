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
