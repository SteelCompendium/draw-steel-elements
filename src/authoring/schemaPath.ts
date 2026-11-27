// SC-707 — which schema object does a key typed at the cursor belong to? The in-block autocomplete (schemaSuggest.ts) used to answer only for
// the top level of a block. This module reads the block body above the cursor as YAML BLOCK STRUCTURE (indentation and `- ` list items,
// nothing else) and walks the schema down to the object the cursor line sits in:
//   - a `key:` line with nothing after the colon opens a child: its value is the schema's `properties[key]`;
//   - the next, deeper line is then either a key of that child object, or a `- ` item (the child's `items`);
//   - the first key on a `- key:` line and the keys aligned under it are siblings in the same list item;
//   - a line at the same indentation as a key is a sibling; a shallower one closes the deeper levels.
// The answer is a schema node, or null. Null is the default: this never guesses. It is null on a tab in the indentation, a flow collection
// (`{` `[`) or block scalar (`|` `>`) the cursor could sit in, a quoted string that runs over lines, odd indentation (a line that matches no open
// level), a key the schema does not know, and a list whose entries the schema does not describe as one object. A line ABOVE the cursor that does
// not fit is skipped as the continuation of whatever it follows (a wrapped plain scalar); only the cursor line must resolve.
// The schema walk is the one resolver of schemaShape.ts (`shapeOfNode`: properties + allOf + $ref; `itemsOfNode`).
import { itemsOfNode, shapeOfNode } from './schemaShape';
import type { RawSchemaNode } from './schemaShape';

/** A level the block structure has open. `map`: a mapping whose keys sit at `col`, `node` its schema. `seq`: a list whose `- ` sit at `col`, `node` its entry schema. A null node is a level the schema does not describe. */
interface Frame {
	kind: 'map' | 'seq';
	col: number;
	node: RawSchemaNode | null;
}

/** A `key:` with nothing after the colon: the next deeper line is its value. `node` is the schema of that value. */
interface Pending {
	keyCol: number;
	node: RawSchemaNode | null;
}

interface State {
	frames: Frame[];
	pending: Pending | null;
	/** Lines indented deeper than this are the text of a block scalar (`|` / `>`) and are skipped. */
	scalarCol: number | null;
	/** Open `{` / `[` depth of a flow collection that runs over lines. */
	flowDepth: number;
	/** The quote character of a quoted scalar that runs over lines. */
	quote: '"' | "'" | null;
}

const DASH = /^-(?:[ ]+|$)/;
const BLANK_OR_COMMENT = /^\s*(#.*)?$/;
const KEY_LINE = /^([A-Za-z0-9_-]+):(?:[ ]+(.*))?$/;
// Any other mapping key (quoted, dotted, a merge key): the name is unknown, the structure is the same.
const OTHER_KEY_LINE = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s"'#&*!|>{[\]%@`,-][^#]*?)[ ]*:(?:[ ]+(.*))?$/;

/** What the schema says the value of `key` in `mapNode` is: its `properties[key]`, or null (unknown map, unknown key). */
function childNode(mapNode: RawSchemaNode | null, key: string | null): RawSchemaNode | null {
	if (!mapNode || key === null) return null;
	return shapeOfNode(mapNode).properties[key] ?? null;
}

/** Drops a trailing comment (`# ...` after whitespace) from `text`, quote-aware: a `#` inside a quoted piece (`"Bob #1"`, `'a #b'`) is text, not a
 *  comment. A quote only opens at the start of a token (the start, or after whitespace or `[ { , :`), so an apostrophe inside a plain word is not one. */
function stripComment(text: string): string {
	let quote: '"' | "'" | null = null;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quote === '"') {
			if (ch === '\\') i++;
			else if (ch === '"') quote = null;
		} else if (quote === "'") {
			if (ch === "'") {
				if (text[i + 1] === "'") i++;
				else quote = null;
			}
		} else if ((ch === '"' || ch === "'") && (i === 0 || /[\s[{,:]/.test(text[i - 1]))) {
			quote = ch;
		} else if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) {
			return text.slice(0, i);
		}
	}
	return text;
}

/** The value text after a `key:` with its trailing comment (quote-aware) and the whitespace around it removed. */
function valueOf(text: string | undefined): string {
	return stripComment(text ?? '').trim();
}

/** How many `{[` minus `}]` the text opens, quoted pieces and a trailing comment ignored. */
function flowBalance(text: string): number {
	const bare = stripComment(text).replace(/"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'/g, '');
	let depth = 0;
	for (const ch of bare) {
		if (ch === '{' || ch === '[') depth++;
		else if (ch === '}' || ch === ']') depth--;
	}
	return depth;
}

/** Does `text` close the quote a multi-line quoted scalar opened (an unescaped quote of that kind)? */
function closesQuote(text: string, quote: '"' | "'"): boolean {
	return quote === '"' ? /(^|[^\\])"/.test(text.replace(/\\\\/g, '')) : text.replace(/''/g, '').includes("'");
}

/**
 * Brings the open levels in line with a line at column `col` (a `- ` when `dash`), and returns the schema node the line's content belongs to:
 * the mapping for a key line, the list's entry schema for a `- ` line. Null when the line fits no open level (odd indentation, or a key
 * under a key that has a value). Mutates `st`.
 */
function enter(st: State, col: number, dash: boolean): { node: RawSchemaNode | null } | null {
	const { frames } = st;
	while (frames.length > 0 && frames[frames.length - 1].col > col) frames.pop();
	// A key at the column of a list's dashes ends the list (`heroes:` then `- a` then `malice:`, the non-indented list style).
	if (!dash) while (frames.length > 0 && frames[frames.length - 1].kind === 'seq' && frames[frames.length - 1].col === col) frames.pop();
	let pending = st.pending;
	st.pending = null;
	if (pending && (dash ? col < pending.keyCol : col <= pending.keyCol)) pending = null;
	const top = frames[frames.length - 1];
	if (dash) {
		if (top && top.kind === 'seq' && top.col === col) return { node: top.node };
		if (pending) {
			const seq: Frame = { kind: 'seq', col, node: itemsOfNode(pending.node) };
			frames.push(seq);
			return { node: seq.node };
		}
		return null;
	}
	if (top && top.kind === 'map' && top.col === col) return { node: top.node };
	if (pending) {
		frames.push({ kind: 'map', col, node: pending.node });
		return { node: pending.node };
	}
	return null;
}

/** Reads what follows a key on its line: an empty value opens a child, a block scalar / flow collection / multi-line quote sets its skip state. */
function afterKey(st: State, keyCol: number, mapNode: RawSchemaNode | null, name: string | null, rawValue: string | undefined): void {
	const value = valueOf(rawValue);
	if (value === '' || /^[&!]\S*$/.test(value)) {
		st.pending = { keyCol, node: childNode(mapNode, name) };
	} else if (value[0] === '|' || value[0] === '>') {
		st.scalarCol = keyCol;
	} else if (value[0] === '{' || value[0] === '[') {
		st.flowDepth = Math.max(0, flowBalance(value));
	} else if ((value[0] === '"' || value[0] === "'") && !closesQuote(value.slice(1), value[0])) {
		st.quote = value[0];
	}
}

/** Feeds one line above the cursor into the structure. A line that fits no open level is skipped (see the file header). */
function feed(st: State, line: string): 'ok' | 'abort' {
	if (BLANK_OR_COMMENT.test(line)) return 'ok';
	if (/^ *\t/.test(line)) return 'abort';
	const indent = /^ */.exec(line)![0].length;
	if (st.quote) {
		if (closesQuote(line, st.quote)) st.quote = null;
		return 'ok';
	}
	if (st.flowDepth > 0) {
		st.flowDepth = Math.max(0, st.flowDepth + flowBalance(line));
		return 'ok';
	}
	if (st.scalarCol !== null) {
		if (indent > st.scalarCol) return 'ok';
		st.scalarCol = null;
	}
	let col = indent;
	let rest = line.slice(indent);
	let dash = DASH.exec(rest);
	if (dash) {
		const entry = enter(st, col, true);
		if (!entry) return 'ok'; // a `- ` that fits no open level: skipped
		let item = entry.node;
		let dashCol = col;
		col += dash[0].length;
		rest = rest.slice(dash[0].length);
		// A list inside a list entry (`- - a`): a list the schema does not describe.
		while ((dash = DASH.exec(rest))) {
			st.frames.push({ kind: 'seq', col, node: null });
			item = null;
			dashCol = col;
			col += dash[0].length;
			rest = rest.slice(dash[0].length);
		}
		if (BLANK_OR_COMMENT.test(rest)) {
			// A bare `-`: the entry's keys start on the next, deeper line.
			st.pending = { keyCol: dashCol, node: item };
			return 'ok';
		}
		const key = KEY_LINE.exec(rest);
		const other = key ? null : OTHER_KEY_LINE.exec(rest);
		if (key || other) {
			st.frames.push({ kind: 'map', col, node: item });
			afterKey(st, col, item, key ? key[1] : null, key ? key[2] : other![1]);
		} else if (rest[0] === '{' || rest[0] === '[') {
			st.flowDepth = Math.max(0, flowBalance(rest));
		}
		return 'ok';
	}
	const key = KEY_LINE.exec(rest);
	const other = key ? null : OTHER_KEY_LINE.exec(rest);
	if (!key && !other) {
		// Text that is not a key: a scalar value on its own line, or a wrapped one. It is the value of the `key:` above it.
		st.pending = null;
		if (rest[0] === '{' || rest[0] === '[') st.flowDepth = Math.max(0, flowBalance(rest));
		return 'ok';
	}
	const at = enter(st, col, false);
	if (!at) return 'ok'; // a key at odd indentation, or under a key that has a value: a continuation line, skipped
	afterKey(st, col, at.node, key ? key[1] : null, key ? key[2] : other![1]);
	return 'ok';
}

/**
 * The schema node of the object the cursor's key belongs to, or null (nothing to suggest).
 *   `above`    the lines of the block body above the cursor line, top first (the line after the opening fence down to the line before the cursor);
 *   `indent`   the cursor line's leading spaces;
 *   `dash`     true when the cursor line is `- <key being typed>` (the key is the first one of a new list entry);
 *   `root`     the element's schema root.
 * The cursor line itself must resolve: its indentation must match an open level of the block above it.
 */
export function resolveKeyScope(above: readonly string[], indent: number, dash: boolean, root: RawSchemaNode): RawSchemaNode | null {
	const st: State = { frames: [{ kind: 'map', col: 0, node: root }], pending: null, scalarCol: null, flowDepth: 0, quote: null };
	for (const raw of above) {
		if (feed(st, raw.replace(/\r$/, '')) === 'abort') return null;
	}
	// The cursor line sits inside a block scalar, a flow collection or a multi-line quote: it is text, not a key.
	if (st.quote || st.flowDepth > 0 || (st.scalarCol !== null && indent > st.scalarCol)) return null;
	const at = enter(st, indent, dash);
	return at ? at.node : null;
}
