// SC-408 e2e driver: cross-cutting checks run automatically after EVERY test (S2 section 4.1):
// no page errors, no orphaned modals, note integrity, and the view-registry collision stats
// the lifecycle gate checks (collisions == ambiguous == 0).
import { integrityProblems } from './noteFences';
import { ev, REGISTRY } from './page';
import { eventsSince } from './recorders';
import { readFixture, state } from './state';

// SC-456: the note/fence scanning and comparison live in ./noteFences (pure, so jest can pin it); re-exported here
// for the specs and driver files that import them from the invariants.
export { fencesOf, integrityProblems, skeletonOf } from './noteFences';
export type { Fence, Skeleton } from './noteFences';

export const readNote = (rel: string): Promise<string> =>
	ev<string>(`app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(rel)}))`);

/** Run every invariant; returns the violations (empty = clean). */
export async function invariantProblems(): Promise<string[]> {
	const problems: string[] = [];

	const ev0 = await eventsSince(state.mark);
	for (const e of ev0.errs) problems.push(`page error: ${e.text.slice(0, 300)}`);

	const modals = await ev<number>(`document.querySelectorAll('.modal-container').length`);
	if (modals > 0) problems.push(`${modals} orphaned .modal-container left open`);

	const paths = new Set<string>([...state.touched, ...ev0.mods.map((m) => m.path)]);
	for (const rel of paths) {
		let fixture: string;
		try {
			fixture = readFixture(rel);
		} catch {
			continue; // not a fixture note (e.g. created by the test itself)
		}
		problems.push(...integrityProblems(rel, await readNote(rel), fixture, state.targets.get(rel), state.exempt.has(rel)));
	}

	const stats = await ev<{ collisions: number; ambiguous: number } | null>(
		`(() => { const r = ${REGISTRY}; return r ? Object.assign({}, r.stats) : null; })()`,
	);
	if (stats && (stats.collisions !== 0 || stats.ambiguous !== 0)) {
		problems.push(`view registry collisions=${stats.collisions} ambiguous=${stats.ambiguous} (expected 0/0)`);
	}
	return problems;
}
