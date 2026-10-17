// SC-408 e2e driver: cross-cutting checks run automatically after EVERY test (S2 section 4.1):
// no page errors, no orphaned modals, note integrity, and the view-registry collision stats
// the lifecycle gate checks (collisions == ambiguous == 0).
import { ev, REGISTRY } from './page';
import { eventsSince } from './recorders';
import { readFixture, state } from './state';

export interface Skeleton {
	/** The note with every fenced block replaced by a `<<fence lang>>` placeholder. */
	text: string;
	fences: number;
	/** True when a fence was opened and never closed. */
	unterminated: boolean;
}

/** Everything outside the fences, exactly; fences only counted. (The lifecycle's scanOutside,
 *  tightened from "set of outside lines" to the byte-exact outside text.) */
export function skeletonOf(note: string): Skeleton {
	const out: string[] = [];
	let inFence = false;
	let fences = 0;
	for (const line of note.split('\n')) {
		if (!inFence) {
			const m = /^```(\S*)/.exec(line);
			if (m) {
				inFence = true;
				fences++;
				out.push(`<<fence ${m[1]}>>`);
			} else out.push(line);
		} else if (line.trim() === '```') inFence = false;
	}
	return { text: out.join('\n'), fences, unterminated: inFence };
}

/** Compare a note against its fixture: only fenced blocks may differ. Returns problems. */
export function integrityProblems(rel: string, now: string, fixture: string): string[] {
	const a = skeletonOf(now);
	const b = skeletonOf(fixture);
	const problems: string[] = [];
	if (a.unterminated) problems.push(`${rel}: a fence was left unterminated`);
	if (a.fences !== b.fences) problems.push(`${rel}: fence count ${b.fences} -> ${a.fences}`);
	if (a.text !== b.text) problems.push(`${rel}: content outside the blocks changed`);
	return problems;
}

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
		problems.push(...integrityProblems(rel, await readNote(rel), fixture));
	}

	const stats = await ev<{ collisions: number; ambiguous: number } | null>(
		`(() => { const r = ${REGISTRY}; return r ? Object.assign({}, r.stats) : null; })()`,
	);
	if (stats && (stats.collisions !== 0 || stats.ambiguous !== 0)) {
		problems.push(`view registry collisions=${stats.collisions} ambiguous=${stats.ambiguous} (expected 0/0)`);
	}
	return problems;
}
