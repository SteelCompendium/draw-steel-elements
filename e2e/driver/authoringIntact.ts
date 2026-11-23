// SC-443: a pure assertion about what an insert left of the block (or the frontmatter) the cursor was inside (no wdio / page access, so
// jest and the e2e specs share it). Written for the SC-687 markers: it states only that nothing existing was damaged, so a fix that
// refuses (the note is unchanged) and one that moves the new block below the existing one both pass it.
import { scanFences } from './noteFences';

/**
 * Null when the note is exactly as it was, or when every existing fenced block is still there byte for byte, no fence is left
 * unclosed, and the frontmatter (a leading `---` ... `---`) is untouched. Otherwise a sentence saying what was damaged.
 */
export function existingBlocksIntactProblem(before: string, after: string): string | null {
	if (after === before) return null;
	const front = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(before)?.[0];
	if (front !== undefined && !after.startsWith(front)) return `the frontmatter changed: ${JSON.stringify(front)} is not at the start of the note`;
	const now = scanFences(after);
	const unclosed = now.find((f) => !f.closed);
	if (unclosed) return `a fence was left unclosed: ${JSON.stringify(unclosed.openLine)}`;
	const texts = new Set(now.map((f) => f.text));
	const lost = scanFences(before).find((f) => !texts.has(f.text));
	if (lost) return `an existing block did not survive: ${JSON.stringify(lost.text)}`;
	return null;
}
