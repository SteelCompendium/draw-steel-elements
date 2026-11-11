// SC-594: heading names read from a note's TEXT (not from Obsidian's metadata cache, which lags an outside edit by a moment), for placing a card
// that is drawn in a heading hover preview or a heading embed.

/** A heading name as a link and a heading line are compared: trimmed, whitespace collapsed, lower case (the rule `[[note#Heading]]` matching uses first). */
export function normalizeHeadingName(name: string): string {
	return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The ATX heading lines of `lines` (`## Name`, up to three spaces of indent, an optional closing run of `#`), outside fenced code blocks, as
 * { line, name }. A setext heading, a heading inside a quote or a list item, and a `#` line inside a fence are not listed.
 */
export function atxHeadings(lines: readonly string[]): Array<{ line: number; name: string }> {
	const out: Array<{ line: number; name: string }> = [];
	let fence: string | null = null;
	lines.forEach((l, i) => {
		const f = /^ {0,3}(`{3,}|~{3,})/.exec(l);
		if (fence !== null) {
			if (f && f[1][0] === fence[0] && f[1].length >= fence.length && l.trim() === f[1]) fence = null;
			return;
		}
		if (f) {
			fence = f[1];
			return;
		}
		const h = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(l);
		if (h) out.push({ line: i, name: h[1] });
	});
	return out;
}
