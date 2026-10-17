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

export interface Fence {
	lang: string;
	/** The whole fence, opening line to closing line, byte for byte. */
	text: string;
}

/** Every fenced block of a note, in order. */
export function fencesOf(note: string): Fence[] {
	const out: Fence[] = [];
	const lines = note.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const m = /^```(\S*)/.exec(lines[i]);
		if (!m) continue;
		let j = i + 1;
		while (j < lines.length && lines[j].trim() !== '```') j++;
		out.push({ lang: m[1], text: lines.slice(i, Math.min(j, lines.length - 1) + 1).join('\n') });
		i = j;
	}
	return out;
}

/**
 * Compare a note against its fixture. Outside the fences: byte-identical. Fences: the same count,
 * and every fence that is NOT in `targets` byte-identical too, so a write that lands in a sibling
 * block of the same note is caught (the pilot's own twin-block rule). `exempt` (the test edited the
 * note itself) relaxes the fences to "same count". Returns problems.
 */
export function integrityProblems(rel: string, now: string, fixture: string, targets: ReadonlySet<number> = new Set(), exempt = false): string[] {
	const a = skeletonOf(now);
	const b = skeletonOf(fixture);
	const problems: string[] = [];
	if (a.unterminated) problems.push(`${rel}: a fence was left unterminated`);
	if (a.fences !== b.fences) problems.push(`${rel}: fence count ${b.fences} -> ${a.fences}`);
	if (a.text !== b.text) problems.push(`${rel}: content outside the blocks changed`);
	if (!exempt && a.fences === b.fences) {
		const na = fencesOf(now);
		const nb = fencesOf(fixture);
		na.forEach((f, i) => {
			if (!targets.has(i) && f.text !== nb[i]?.text) {
				problems.push(`${rel}: fence #${i} (${f.lang}) changed but is not a block this test declared it was editing (declared: ${[...targets].join(', ') || 'none'})`);
			}
		});
	}
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
