// D8 Task 2 (spec §1.5) — block addressing without `getSectionInfo`. The sidebar has no
// MarkdownPostProcessorContext, so it can't get block identity for free the way
// ReadingModeBlockHost does; instead every block bound to the sidebar carries a durable
// `_dse_anchor: <id>` line inside its YAML body (round-trips through `serialize` for free
// as long as an element's model passes the key through — see the caveat in
// SidebarBlockHost.ts's file header). `findAnchoredBlock` re-derives the fence position by
// scanning for it, so it survives arbitrary line drift elsewhere in the note (unlike
// reading-mode's lineStart-keyed SessionStore) — the id travels IN the content, not
// alongside it.
import { parseYaml } from 'obsidian';
import type { BlockInfo } from '../host/BlockHost';
import { matchFenceMarker, stripBlockPrefix } from '../host/blockPrefix';
import { blockBodyLines } from '../host/fenceLine';
import { splitLines, stripCr } from '../host/lineEnding';

/** Exported so `framework/pipeline.ts`'s `prepareModel` can exclude this exact key from
 *  what SCHEMA VALIDATION sees (D7 Task 10 finding — see that file's own doc for the
 *  full rationale: an `additionalProperties: false` element schema has no way to "know"
 *  about this sidebar-only key, so the two files must never drift on its spelling). */
export const ANCHOR_KEY = '_dse_anchor';
/** The value of an identity/provenance line: ONE scalar token, optionally quoted, nothing else on the
 *  line. SC-360: wider than the ids we mint (`[A-Za-z0-9_-]`) on purpose - a note the old generator
 *  already damaged holds the id YAML rewrote it to (`56948`, `9.2e+51`, `4e+207`, `.inf`, `-.inf`,
 *  `.nan`, `1e-7`), and a re-pin must READ that as the anchor and reuse it; reading it as "no anchor"
 *  made `ensureAnchor` append a second `_dse_anchor:` line (duplicate key, block dead). The
 *  charset is exactly what a YAML number/inf/nan scalar can contain, so a flow collection, a comment
 *  (`# ...`), a second word or a following line is still not swallowed. `[ \t]*` (not `\s*`) after
 *  the colon so an empty value cannot reach across the newline to the next key; the one allowed
 *  continuation is a value on the NEXT, INDENTED line (valid YAML, read by the pre-SC-360 reader,
 *  r2 review LOW-1) - an unindented next line is the next key and is never taken. */
const SCALAR_TOKEN = String.raw`(?:[ \t]*|[ \t]*\r?\n[ \t]+)['"]?([A-Za-z0-9_.+-]+)['"]?[ \t]*$`; // multiline `$` also stops before a CR (SC-453 CRLF notes)
const ANCHOR_LINE = new RegExp(`^${ANCHOR_KEY}:${SCALAR_TOKEN}`, 'm');

const LEADING_LETTERS = 'abcdf';

/** Small non-crypto id generator (Math.random-based — mobile-safe, no `crypto` node
 *  module; F1/D8 convention for anything that doesn't need cryptographic uniqueness).
 *
 *  SC-360: the id is stamped UNQUOTED (`_dse_anchor: <id>`) and every sidebar write re-emits it
 *  through parseYaml -> model -> stringifyYaml, so it must read back as a plain YAML STRING.
 *  A bare 6-hex-digit id did not: `056948` came back `56948`, `092e50` -> `9.2e+51`,
 *  `4e8540` -> `.inf`, `000000` -> `0` (~3% of ids), and the panel then could not find its
 *  own block ("Backing block not found") right after its first save. Every YAML scalar that
 *  is not a string (numbers incl. 0x/0o/0b and exponents, `.inf`/`.nan`, booleans, null,
 *  sexagesimal) starts with a digit, a sign, a `.`, or one of the words true/false/null/yes/
 *  no/on/off/y/n - none of which can be spelled from hex characters starting with a letter.
 *  One exception: the `yaml` package's 1.1 float rule accepts an empty mantissa, so `e14000`
 *  reads as NaN there (Obsidian ships 1.2, but the sweep in anchor.test.ts holds both) - so the
 *  leading letter is one of a b c d f (never `e`), then 5 hex digits: 6 chars, 5 * 16^5 ids.
 *  One Math.random() call, split arithmetically, keeps the generator deterministic to test. */
export function generateAnchorId(): string {
	const rest = 16 ** 5;
	const n = Math.floor(Math.random() * LEADING_LETTERS.length * rest);
	return LEADING_LETTERS[Math.floor(n / rest)] + (n % rest).toString(16).padStart(5, '0');
}

/** `body`'s dominant end-of-line style — CRLF only when every line break in `body` is
 *  `\r\n` (a mixed-EOL body, or one with no line breaks at all, defaults to LF). Mirrors
 *  `hero/model.ts`'s `detectEol` exactly (same rule, same rationale): the ONLY thing this
 *  feeds is the joiner in front of the freshly-appended anchor line below — `body`'s own
 *  bytes are never rewritten. FOLLOWUPS #28 LOW fix: without this, a CRLF-authored body
 *  got a bare `\n` joiner, leaving the stamped body mixed-EOL. */
function detectEol(body: string): '\r\n' | '\n' {
	const totalNewlines = (body.match(/\n/g) ?? []).length;
	if (totalNewlines === 0) return '\n';
	const crlfNewlines = (body.match(/\r\n/g) ?? []).length;
	return crlfNewlines === totalNewlines ? '\r\n' : '\n';
}

/** Finds an existing `_dse_anchor:` line in `body`, or appends a fresh one. Pure string
 *  op — `body` is a fenced block's BODY text (no fences), never the whole note). The
 *  joiner in front of the fresh anchor line matches `body`'s own dominant EOL (FOLLOWUPS
 *  #28 LOW), so a CRLF-authored block doesn't turn mixed-EOL on first stamp.
 *
 *  SC-158: this appends a LINE, which is only safe for a body whose grammar tolerates an
 *  unknown key — i.e. a YAML mapping. Callers must not call it for an element declaring
 *  `ElementDefinition.strictBody` (see `sendToSidebar`, the only caller); those blocks are
 *  found with `findFenceByBody` below instead. */
export function ensureAnchor(body: string): { body: string; id: string | null } {
	const existing = readAnchor(body);
	if (existing) return { body, id: existing };

	// SC-360 (r2 review LOW-1): the line reader is a regex, YAML is the authority. If YAML already sees an
	// `_dse_anchor` key the reader could not read (a trailing `# comment`, `!!str`, `&a`, `~`, an empty
	// value, `>`, `key :`, a quoted key ...), appending a second one makes the block die with "Map keys must
	// be unique". Reusing its value would not help either: `findAnchoredBlock` goes through the same line
	// reader, so a panel bound to a value it cannot read could never find the block. So: stamp nothing and
	// report `id: null` - the caller refuses the pin and tells the user to fix the line (the safest
	// non-duplicating choice). A body that does not parse AND mentions the key is not stamped either (we
	// cannot know whether a second one would collide).
	let parsed: unknown;
	try {
		parsed = parseYaml(body);
	} catch {
		// r4 re-review MEDIUM-A: a YAML error by itself must not stop a pin (it never did; the panel shows the
		// block's own error card). Refuse only when the body mentions the key - one may be hiding in what we
		// cannot parse - and otherwise stamp as before.
		if (body.includes(ANCHOR_KEY)) return { body, id: null };
		parsed = null;
	}
	if (parsed !== null && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, ANCHOR_KEY)) {
		return { body, id: null };
	}

	const id = generateAnchorId();
	const eol = detectEol(body);
	const trimmed = body.replace(/\s+$/, '');
	const newBody = trimmed.length > 0 ? `${trimmed}${eol}${ANCHOR_KEY}: ${id}` : `${ANCHOR_KEY}: ${id}`;
	return { body: newBody, id };
}

/**
 * SC-153 — the PROVENANCE marker: "this block was generated by the block whose
 * `_dse_anchor` is <id>". Distinct from `ANCHOR_KEY` on purpose: an anchor answers "which
 * block is this" (identity), while this answers "which block made it" (parentage), and a
 * generated block routinely carries BOTH — its own anchor once pinned, plus the id of its
 * generator. The encounter builder writes it into the `ds-initiative` block it generates so
 * that pressing "Open in sidebar" a second time refreshes that block instead of appending
 * another one.
 *
 * Same round-trip contract as ANCHOR_KEY, and it holds for the same reason: initiative's
 * `parse` mutates-and-returns the raw YAML object and `serialize` is `stringifyYaml(model)`,
 * so an unknown top-level key survives a save with no passthrough field (verified by
 * test/dom/framework/sidebarEncounterHandoff.test.ts's round-trip case). Neither the
 * encounter nor the initiative element declares a JSON schema, so — unlike ANCHOR_KEY,
 * which `pipeline.ts`'s `dataForSchemaValidation` must hide from validation — this key
 * needs no such exemption today. If either element ever gains an
 * `additionalProperties: false` schema, this key must be hidden there too.
 */
export const GENERATED_FROM_KEY = '_dse_from';
const GENERATED_FROM_LINE = new RegExp(`^${GENERATED_FROM_KEY}:${SCALAR_TOKEN}`, 'm');

/** Reads the `_dse_from:` value out of a block body, or null if absent/malformed. */
export function readGeneratedFrom(body: string): string | null {
	const match = GENERATED_FROM_LINE.exec(body);
	return match ? match[1] : null;
}

/**
 * The provenance counterpart of `findAnchoredBlock`: the first ```` ```<alias> ```` block in
 * `content` whose body carries `_dse_from: <generatorId>`. Returns null when the generator
 * has never produced one here (or the user deleted it), which the caller reads as "create
 * one", never as an error.
 */
export function findGeneratedBlock(
	content: string,
	alias: string,
	generatorId: string,
): BlockInfo | null {
	for (const block of iterateFences(content, alias)) {
		if (readGeneratedFrom(block.body) === generatorId) return block.info;
	}
	return null;
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
 * regardless of whether it already carries an anchor — `listFences(content, alias)[0]`.
 * `sendToSidebar` (spec §1.7) computes `listFences` itself for the ambiguity check and reuses
 * that array rather than calling this a second time, but this is the small standalone form
 * for any caller that just wants "the first one" (e.g. a future no-cursor entry point).
 */
export function findFirstFence(content: string, alias: string): BlockInfo | null {
	return listFences(content, alias)[0] ?? null;
}

/**
 * SC-158 — the CONTENT-ADDRESSED counterpart of `findAnchoredBlock`, for elements whose
 * body the framework must not write into (`ElementDefinition.strictBody`). Those blocks
 * carry no `_dse_anchor:` line, so their identity is the body text itself: the first
 * ```` ```<alias> ```` block whose body matches `body` exactly.
 *
 * This is a weaker identity than a stamped id and deliberately so — it is what buys a
 * byte-identical note. It survives arbitrary line drift elsewhere in the note (the whole
 * point of the anchor mechanism) and only loses the binding if the block's OWN body is
 * edited, at which point "this is no longer the thing you pinned" is a defensible reading.
 * `SidebarBlockHost` softens even that: in a note with a single block of the alias it
 * re-binds to it rather than degrading.
 *
 * Trailing whitespace is normalized on both sides, mirroring `ensureAnchor`'s own
 * `body.replace(/\s+$/, '')`, so a trailing blank line inside the fence can't desync a
 * binding the user never touched.
 */
export function findFenceByBody(content: string, alias: string, body: string): BlockInfo | null {
	const wanted = stripCr(body).replace(/\s+$/, '');
	for (const block of iterateFences(content, alias)) {
		if (block.body.replace(/\s+$/, '') === wanted) return block.info;
	}
	return null;
}

/**
 * Every ```` ```<alias> ```` (or `~~~`) block in `content`, top-down, in encounter order.
 * `sendToSidebar` uses the length of this to decide whether picking "first" is actually
 * ambiguous (worth a `Notice`) — see registration.ts.
 */
export function listFences(content: string, alias: string): BlockInfo[] {
	return [...iterateFences(content, alias)].map((block) => block.info);
}

/**
 * The ```` ```<alias> ```` (or `~~~`) block whose fence lines (inclusive) contain `line`,
 * or null when `line` doesn't sit inside one. Used by `sendToSidebar` (spec §1.7 / review
 * finding #3) to bind the occurrence nearest the cursor rather than always the first, when
 * a note has multiple blocks sharing the same alias.
 */
export function findFenceAtLine(content: string, alias: string, line: number): BlockInfo | null {
	for (const info of listFences(content, alias)) {
		if (line >= info.lineStart && line <= info.lineEnd) return info;
	}
	return null;
}

/** Matches a fence-marker line, trimming the rest-of-line into either the info string or
 *  empty. Null when `line` isn't a fence marker at all. Exported (with `isFenceClose`
 *  below) so registration.ts's `aliasAtLine` — a live-Editor, prefix-scan variant of this
 *  same open/close matching, needed because it must recognize a fence that's open but
 *  not yet closed (the cursor sitting inside a block the user is still typing) — builds
 *  its open/close test on the exact same primitives instead of a second hand-rolled copy.
 *  SC-455: the line may sit inside a blockquote / callout; `prefix` is that quote prefix
 *  ('' for an un-nested fence) — see host/blockPrefix.ts, the one place that defines it. */
export function matchFenceLine(line: string): { prefix: string; marker: string; rest: string } | null {
	const match = matchFenceMarker(line);
	return match ? { prefix: match.prefix, marker: match.marker, rest: match.rest.trim() } : null;
}

/**
 * SC-184 fix round (MEDIUM-2b) — a fence's ALIAS is only the first whitespace-delimited
 * token of its info string, never the whole trimmed rest. This mirrors what Obsidian's own
 * renderer actually keys a `registerMarkdownCodeBlockProcessor` match on (the mdast-to-hast
 * code renderer computes its `language-<x>` class from `lang.match(/^[^ \t]+(?=[ \t]|$)/)` —
 * first token only, confirmed against the installed Obsidian app bundle), and what
 * `ReadingModeBlockHost`'s own `OPEN_FENCE = /^([\`~]{3,})(\S*)/` already assumed. Before
 * this helper existed, `open.alias`/`aliasAtLine`'s `alias` were the FULL trimmed rest —
 * so a fence carrying extra info-string content past the language token (e.g.
 * ```` ```ds-counter extra ````) had a "language" that agreed with nothing else in the
 * codebase: `registry.get()` (keyed by the bare language token) and the chrome pin item's
 * `getBlockInfo().language` (also first-token-only) could never match it. Exported so both
 * `iterateFences` below and registration.ts's `aliasAtLine` derive an alias the exact same
 * way — one identity, not two independently-evolving ones. */
export function fenceAlias(rest: string): string {
	return rest.split(/\s+/)[0] ?? '';
}

/** True when `line` is a valid CLOSE for a fence opened with `open` — same character,
 *  at least as long, and carrying no info string of its own (a bare close). SC-455: a fence
 *  opened inside a quote (`open.prefix`) is only closed by a line in the SAME quote, so a
 *  fence-looking line outside it (or at another depth) is body content, never a close. */
export function isFenceClose(open: { fenceChar: string; fenceLen: number; prefix?: string }, line: string): boolean {
	const prefix = open.prefix ?? '';
	const inner = stripBlockPrefix(line, prefix);
	if (inner === null) return false;
	const match = matchFenceLine(inner);
	return !!match && match.prefix === '' && match.rest === '' && match.marker[0] === open.fenceChar && match.marker.length >= open.fenceLen;
}

/**
 * Shared fence scanner: yields every CLOSED fence block found in `content`, top-down, with
 * its alias/position/body text, regardless of alias — `findAnchoredBlock`/`listFences`
 * filter by alias afterward. Uniform bracket matching (review finding #4, CRITICAL): opens
 * on ANY fence-marker line, whatever its language token, and only treats the region as
 * closed when a bracket-matching close (same char, length >= open length, no info string)
 * is found — mirroring registration.ts's `aliasAtLine`. This is what makes a
 * fence-marker-looking line INSIDE an already-open region (wrong char, too short, or
 * carrying an info string — e.g. a `_dse_anchor`-lookalike nested in an unrelated
 * ` ```md ` example fence) correctly opaque body content instead of being individually
 * tested and matched: the forward search below only ever calls `isFenceClose` on body
 * lines, never `matchFenceLine`-as-an-opener, so a nested "```ds-counter" body line can
 * never re-open state mid-region.
 *
 * A fence-open that never finds a valid close before EOF is NOT treated as opaque through
 * to EOF (that would let one malformed/truncated fence anywhere earlier in the note
 * permanently hide every real block after it — the second consequence flagged by finding
 * #4). Instead that single candidate open is abandoned (treated as ordinary content) and
 * the scan resumes on the very next line, so a later well-formed block is still found.
 *
 * SC-455 — blockquote / callout prefixes: a fence line may carry a quote prefix (`> `, `> > `, `>`),
 * which `body` comes back without; the block closes only on a line carrying the same prefix, and a
 * line that has left the quote ends it (an unterminated candidate, abandoned as above).
 *
 * SC-453 / SC-460 — line endings: lines are split by OBSIDIAN's rule (`splitLines`: CR, CRLF and LF each
 * end a line), so a CRLF note's fence lines parse and `body` comes back LF-joined, and `info.lineStart/End`
 * are in the same numbering as Obsidian's section lineStart/lineEnd, the editor's cursor line and
 * `replaceFenceBlock`'s indices. A lone CR above a block therefore shifts these numbers exactly as it
 * shifts Obsidian's.
 */
function* iterateFences(content: string, alias: string): Generator<{ info: BlockInfo; body: string }> {
	const lines = splitLines(content);
	let i = 0;
	while (i < lines.length) {
		const openMatch = matchFenceLine(lines[i]);
		if (!openMatch) {
			i++;
			continue;
		}
		const open = {
			fenceChar: openMatch.marker[0],
			fenceLen: openMatch.marker.length,
			alias: fenceAlias(openMatch.rest),
			prefix: openMatch.prefix,
		};
		let j = i + 1;
		// SC-455: a line that no longer carries the opener's quote prefix means the quote ended — the
		// fence never closed inside it, so this candidate is abandoned (like any unterminated fence).
		while (j < lines.length && !isFenceClose(open, lines[j]) && stripBlockPrefix(lines[j], open.prefix) !== null) j++;
		if (j >= lines.length || !isFenceClose(open, lines[j])) {
			// Unterminated — lenient recovery, see doc above: don't abandon the whole
			// scan, just this one candidate open.
			i++;
			continue;
		}

		if (open.alias === alias) {
			yield { info: { language: open.alias, lineStart: i, lineEnd: j }, body: blockBodyLines(lines, i, j).join('\n') };
		}
		i = j + 1;
	}
}
