// SC-343 (spec SC-340 §8 "Durable miss", §13 Q2 — Scott: "Show the obsidian notice.").
//
// A pending write is DROPPED when its block changed or vanished on disk first (sync, a hand
// edit, or undo landing inside the ~400 ms persist debounce, or a stale leaked embed copy
// writing an old model). A dropped write is lost user data, so it is never silent: an
// Obsidian Notice (at most one per note per 5 s, so a burst of misses is one message) plus
// a console.warn on every drop for diagnosis.
import { Notice } from 'obsidian';

export const DROPPED_WRITE_NOTICE_INTERVAL_MS = 5000;

/** Approved text, verbatim (spec §8). `noteName` is the note's basename, no extension. */
export function droppedWriteMessage(noteName: string): string {
	return `Draw Steel Elements: a change to a block in ${noteName} was not saved — the block changed on disk first.`;
}

/** sourcePath -> time (ms) the last Notice for that note was shown. */
const lastShownAt = new Map<string, number>();

/**
 * Report one dropped write. Always warns; shows the Notice unless one was shown for the same
 * note less than DROPPED_WRITE_NOTICE_INTERVAL_MS ago. Returns whether a Notice was shown.
 */
export function notifyDroppedWrite(sourcePath: string, noteName: string, now: number = Date.now()): boolean {
	console.warn(
		`Draw Steel Elements: dropped a write to ${sourcePath} — the block was not found by its last known body.`,
	);
	const previous = lastShownAt.get(sourcePath);
	if (previous !== undefined && now - previous < DROPPED_WRITE_NOTICE_INTERVAL_MS) return false;
	lastShownAt.set(sourcePath, now);
	new Notice(droppedWriteMessage(noteName));
	return true;
}

/** Test-only: forget every note's last-shown time. */
export function resetDroppedWriteNotices(): void {
	lastShownAt.clear();
}
