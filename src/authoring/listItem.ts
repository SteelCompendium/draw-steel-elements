// SC-675 / SC-687 — where the text of a list item starts, in the one place both readers of a line share: blockInsert.ts (the indentation
// it writes under an item) and fenceScan.ts (which lines of a note sit under an item, so a fence indented under it is seen).

// A list item marker and the whitespace after it, after the line's own leading whitespace (CommonMark: a bullet, or 1-9 digits and a `.` / `)`).
const LIST_MARKER = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)/;

/** Column reached after `text` when it starts at column `start` (a tab goes to the next multiple of 4). */
export function columnAfter(text: string, start = 0): number {
	let col = start;
	for (const ch of text) col = ch === '\t' ? col + 4 - (col % 4) : col + 1;
	return col;
}

export interface ListItemStart {
	/** The column the item's text starts at: the indentation its continuation lines (and a block under it) carry. */
	contentColumn: number;
	/** How many characters of the line the leading whitespace, the marker and the whitespace after it take. */
	length: number;
}

/**
 * Reads `rest` (a line without its quote markers) as the start of a list item: the spaces up to the column where the item's text starts
 * (CommonMark, except that a leading tab counts as 2 columns under a bullet, see below: the marker and the 1-4 spaces after it; 5 or more
 * spaces read as one, the rest being indented code). Null when the line is not a list item.
 */
export function listItemOf(rest: string): ListItemStart | null {
	const list = LIST_MARKER.exec(rest);
	if (!list) return null;
	const [, lead, marker, gap] = list;
	// Where the item's text starts is measured the way Obsidian's Reading view reads it, not by CommonMark's tab stops: under a BULLET
	// each leading tab counts as 2 columns (`- a⏎⇥- b⏎⇥⇥- c` draws with the block at 6 spaces under c, not at CommonMark's 10, which Reading
	// view shows as inline code text), under an ORDERED item 4 as CommonMark has it. Measured in Obsidian 1.14.4, SC-675 r4
	// (sc675-r4-rereview-report.md MEDIUM-2): 1, 2 and 3 tabs draw in both Reading view and Live Preview at 4, 6 and 8 spaces. Do not
	// "correct" the 2 to CommonMark's 4. Leading spaces count as themselves.
	const leadColumns = /^\d/.test(marker) ? columnAfter(lead) : lead.replace(/\t/g, '  ').length;
	const markerEnd = columnAfter(marker, leadColumns);
	const gapEnd = columnAfter(gap, markerEnd);
	return { contentColumn: gapEnd - markerEnd >= 5 ? markerEnd + 1 : gapEnd, length: list[0].length };
}
