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
	/** The column the item's text starts at, to WRITE under it: the indentation its continuation lines (and a block under it) carry (leading tabs under a bullet count 2, see below). */
	contentColumn: number;
	/** The same column as an EXISTING line is measured against it (CommonMark's tab stops: a tab goes to the next multiple of 4, under a bullet too). `fenceScan.ts` reads fences with it. */
	readColumn: number;
	/** How many characters of the line the leading whitespace, the marker and the whitespace after it take. */
	length: number;
}

/**
 * Reads `rest` (a line without its quote markers) as the start of a list item: the spaces up to the column where the item's text starts
 * (CommonMark: the marker and the 1-4 spaces after it; 5 or more spaces read as one, the rest being indented code). Null when the line is not a
 * list item. Two columns come back because there are two questions (SC-687 r5):
 *   - `contentColumn`, where a block WRITTEN under the item goes. Measured the way Obsidian's Reading view reads nesting, not by CommonMark's tab
 *     stops: under a BULLET each leading tab counts as 2 columns (`- a⏎⇥- b⏎⇥⇥- c` draws with the block at 6 spaces under c, not at
 *     CommonMark's 10, which Reading view shows as inline code text), under an ORDERED item 4 as CommonMark has it. Measured in Obsidian 1.14.4,
 *     SC-675 r4 (sc675-r4-rereview-report.md MEDIUM-2): 1, 2 and 3 tabs draw in both Reading view and Live Preview at 4, 6 and 8 spaces. Do not
 *     "correct" the 2 to CommonMark's 4. Leading spaces count as themselves.
 *   - `readColumn`, the column a line that is ALREADY in the note is compared with. A fence line indented with tabs is read with CommonMark's tab
 *     stops and the item's text column the same way (SC-687 r5, measured in Obsidian 1.14.4, Reading view and Live Preview: under `- a⏎⇥- b`,
 *     `⇥⇥```js` is a fence in b, `⇥⇥⇥```js` and, under a top-level `- a`, `⇥⇥```js` are not: inline code text). The two columns are equal for
 *     spaces and for tabs under an ordered item.
 */
export function listItemOf(rest: string): ListItemStart | null {
	const list = LIST_MARKER.exec(rest);
	if (!list) return null;
	const [, lead, marker, gap] = list;
	const ordered = /^\d/.test(marker);
	const columns = (leadColumns: number): number => {
		const markerEnd = columnAfter(marker, leadColumns);
		const gapEnd = columnAfter(gap, markerEnd);
		return gapEnd - markerEnd >= 5 ? markerEnd + 1 : gapEnd;
	};
	return {
		contentColumn: columns(ordered ? columnAfter(lead) : lead.replace(/\t/g, '  ').length),
		readColumn: columns(columnAfter(lead)),
		length: list[0].length,
	};
}
