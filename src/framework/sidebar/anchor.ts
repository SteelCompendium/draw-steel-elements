// D8 Task 2 (spec §1.5) — block addressing without `getSectionInfo`. The sidebar has no
// MarkdownPostProcessorContext, so it can't get block identity for free the way
// ReadingModeBlockHost does; instead every block bound to the sidebar carries a durable
// `_dse_anchor: <id>` line inside its YAML body (round-trips through `serialize` for free
// as long as an element's model passes the key through — see the caveat in
// SidebarBlockHost.ts's file header). `findAnchoredBlock` re-derives the fence position by
// scanning for it, so it survives arbitrary line drift elsewhere in the note (unlike
// reading-mode's lineStart-keyed SessionStore) — the id travels IN the content, not
// alongside it.
import type { BlockInfo } from '../host/BlockHost';

const ANCHOR_KEY = '_dse_anchor';
const ANCHOR_LINE = new RegExp(`^${ANCHOR_KEY}:\\s*['"]?([A-Za-z0-9_-]+)['"]?\\s*$`, 'm');

/** A fence-open line: 3+ backticks/tildes (captured), then the info-string language token. */
const FENCE_OPEN = /^([`~]{3,})(\S*)\s*$/;
/** A fence-close line: 3+ backticks/tildes, nothing else on the line. */
const FENCE_CLOSE = /^([`~]{3,})\s*$/;

/** Small non-crypto id generator (Math.random-based — mobile-safe, no `crypto` node
 *  module; F1/D8 convention for anything that doesn't need cryptographic uniqueness). */
function generateAnchorId(): string {
	return Math.random().toString(16).slice(2, 8).padEnd(6, '0');
}

/** Finds an existing `_dse_anchor:` line in `body`, or appends a fresh one. Pure string
 *  op — `body` is a fenced block's BODY text (no fences), never the whole note. */
export function ensureAnchor(body: string): { body: string; id: string } {
	const existing = readAnchor(body);
	if (existing) return { body, id: existing };

	const id = generateAnchorId();
	const trimmed = body.replace(/\s+$/, '');
	const newBody = trimmed.length > 0 ? `${trimmed}\n${ANCHOR_KEY}: ${id}` : `${ANCHOR_KEY}: ${id}`;
	return { body: newBody, id };
}

/** Reads the `_dse_anchor:` value out of a block body, or null if absent/malformed. */
export function readAnchor(body: string): string | null {
	const match = ANCHOR_LINE.exec(body);
	return match ? match[1] : null;
}

/**
 * Scans `content` (a whole note's text) top-down for a ```` ```<alias> ```` (or
 * `~~~`-fenced) block whose body contains `_dse_anchor: <id>`. Returns the fence's
 * position (fence lines inclusive), or null when no such block exists — the caller (the
 * sidebar host) reads that as "not addressable right now" (block deleted/renamed/note
 * edited out from under the panel), never throws.
 *
 * Fences don't nest (CommonMark): a full top-down scan threading open/close state is used
 * rather than a naive "first fence-looking line" walk, so a fence-marker-looking line
 * inside an open block's own content (wrong char, too short, or carrying an info string)
 * is correctly treated as literal content instead of a spurious close.
 */
export function findAnchoredBlock(content: string, alias: string, id: string): BlockInfo | null {
	for (const block of iterateFences(content, alias)) {
		if (readAnchor(block.body) === id) return block.info;
	}
	return null;
}

/**
 * The un-anchored counterpart: the FIRST ```` ```<alias> ```` (or `~~~`) block in `content`,
 * regardless of whether it already carries an anchor. Used by "send to sidebar" (spec
 * §1.7) to pick a block to stamp an id onto in the common case of one block per alias per
 * note; disambiguating multiple same-alias blocks in one note is deferred to the real
 * per-block "send to sidebar" UI action (Task 10 — that one has a live BlockHost/lineStart
 * in hand and doesn't need to guess).
 */
export function findFirstFence(content: string, alias: string): BlockInfo | null {
	const first = iterateFences(content, alias).next();
	return first.done ? null : first.value.info;
}

/** Shared fence scanner: yields every ```` ```<alias> ```` (or `~~~`-fenced) block found
 *  in `content`, top-down, with its position and body text. See findAnchoredBlock's doc
 *  for why this must thread state top-down rather than walk upward from a target line. */
function* iterateFences(content: string, alias: string): Generator<{ info: BlockInfo; body: string }> {
	const lines = content.split('\n');
	let i = 0;
	while (i < lines.length) {
		const open = lines[i].match(FENCE_OPEN);
		if (!open || open[2] !== alias) {
			i++;
			continue;
		}
		const fenceChar = open[1][0];
		const fenceLen = open[1].length;
		let j = i + 1;
		while (j < lines.length) {
			const close = lines[j].match(FENCE_CLOSE);
			if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) break;
			j++;
		}
		if (j >= lines.length) return; // unterminated fence — nothing valid past here

		yield { info: { language: alias, lineStart: i, lineEnd: j }, body: lines.slice(i + 1, j).join('\n') };
		i = j + 1;
	}
}
