// D7 Task 7 (spec §3.1/§3.4, OD-1/OD-2) — ds-hero model: the flagship's greenfield
// `hero:`/`state:` two-section split and the BYTE-STABLE state-scoped splice serialize.
// No legacy predecessor and no prior "raw text splice" convention in this codebase — every
// other persisted element's serialize is a pure `stringifyYaml(dto).trim()` projection
// (resource/surges/tokens/conditions), because those blocks are small enough that a full
// re-serialize is an acceptable diff. `ds-hero` is different: the "definition" half
// (name/level/class/kits/abilities/…) is large, hand-authored, comment-laden, and MUST
// NOT be rewritten by an ordinary stamina click (spec §3.4 — "the note stays diff-friendly
// and hand-authored content is never re-emitted"). So `parse` captures the authored
// definition region **verbatim** as `defnRaw`, and `serialize` re-emits ONLY `state:`,
// splicing `defnRaw` back byte-for-byte:
//
//   serialize(model) = defnRaw + "\nstate:\n" + indent(stringifyYaml(model.state))
//
// (the source's dominant EOL replaces the two literal "\n"s above when it's CRLF — fix
// round 1, see `detectEol`.) Finding `defnRaw`'s exact boundary is a REAL structural
// line-scan over `raw` (`findStateSpan`/`splitDefnRaw`, below) — not a regex assuming
// `state:` is the last top-level key written in block style; see those functions' docs
// (task-7-review.md MUST-FIX 1-3) for why that assumption used to be corruption-prone.
//
// The `hero:`/`state:` "split" is conceptual, not a literal YAML key — spec §3.1's own
// example shows definition fields flat at the document root (`name:`, `level:`, …) with a
// single `state:` sub-map alongside them, NOT a `hero:` wrapper key (confirmed by OD-1:
// "the in-block hero:/state: split in one ds-hero block", spec §3.6's ElementDefinition
// sketch, and the plan-18 Task 7 brief verbatim). Schema/TS-interface naming ("HeroDefn")
// reflects that — there is no `data.hero` anywhere in this file.
import { stringifyYaml } from 'obsidian';
import type { Condition } from '@drawSteelAdmonition/EncounterData';

export type { Condition };

/** spec §3.1 — the five Draw Steel characteristics (RR §1). Every hero authors all five;
 *  the schema constrains the object to exactly this key set. */
export interface CharacteristicsBlock {
	might: number;
	agility: number;
	reason: number;
	intuition: number;
	presence: number;
}

/** spec §3.1's inline `resource: { type: Ferocity, min: 0 }` override — used only when
 *  NOT compendium-resolving a class (§3.5); both fields are required together. */
export interface HeroResourceOverride {
	type: string;
	min: number;
}

/**
 * spec §3.1/§3.4 (verbatim from the Task 7 brief): the authored/resolved definition half.
 * `ancestry`/`class` accept either an SCC ref string (`scc.v1:mcdm.heroes.v1/…`) or an
 * inline object — D6 resolution (Task 8) is out of scope here; this model only carries
 * the value through untouched (schema validates it as a string; ref resolution is Task
 * 8's `resolveRefs`, not this task — brief: "no resolveRefs (recon delta 2)"). `titles`/
 * `perks`/`treasures`/`complication` are optional display-only passthrough fields the
 * sheet view (Task 9) renders but this model never interprets.
 */
export interface HeroDefn {
	name: string;
	level: number;
	ancestry?: string | Record<string, unknown>;
	class?: string | Record<string, unknown>;
	subclass?: string;
	kits?: string[];
	characteristics: CharacteristicsBlock;
	skills?: string[];
	abilities?: (string | Record<string, unknown>)[];
	/** Override; else derived from class+kit+level at render (Task 8/9), not here. */
	max_stamina?: number;
	/** Override; else class-derived at render (Task 8/9), not here. */
	recoveries_max?: number;
	/** Override; else class-derived at render (Task 8/9), not here. */
	resource?: HeroResourceOverride;
	titles?: unknown[];
	perks?: unknown[];
	treasures?: unknown[];
	complication?: unknown;
}

export interface HeroStamina {
	current: number;
	temp: number;
}

/**
 * spec §3.1/§3.4 — the small, volatile play surface. Every field but `stamina` is
 * optional at the TYPE level (a hand-authored partial `state:` is legal input), but
 * `parse` always MATERIALIZES every defaulted field (spec §3.4: "current=max,
 * recoveries=max, resource=min, surges/victories=0, conditions=[]") — only `tokens_ref`
 * (not part of the default-seed list) stays absent unless authored.
 */
export interface HeroState {
	stamina: HeroStamina;
	resource?: number;
	surges?: number;
	recoveries?: number;
	victories?: number;
	conditions?: Condition[];
	/** Optional read-through to the canonical party pool block (§4.5, OD-3). Plain
	 *  string; never resolved/dereferenced by this model. */
	tokens_ref?: string;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

const CHARACTERISTIC_KEYS = ['might', 'agility', 'reason', 'intuition', 'presence'] as const;

function parseCharacteristics(value: unknown): CharacteristicsBlock {
	const data = asRecord(value, "'characteristics'");
	const out = {} as CharacteristicsBlock;
	for (const key of CHARACTERISTIC_KEYS) {
		const raw = data[key];
		if (typeof raw !== 'number') {
			throw new Error(`'characteristics.${key}' must be a number.`);
		}
		out[key] = raw;
	}
	return out;
}

function parseResourceOverride(value: unknown): HeroResourceOverride {
	const data = asRecord(value, "'resource'");
	if (typeof data.type !== 'string' || data.type.trim() === '') {
		throw new Error("'resource.type' must be a string.");
	}
	if (typeof data.min !== 'number') {
		throw new Error("'resource.min' must be a number.");
	}
	return { type: data.type, min: data.min };
}

/**
 * Extracts and validates the definition half from the already-parsed YAML object
 * (`data` — the pipeline's `rawData`, which still carries `state` as a sibling key; this
 * function simply never reads it). Deliberately NOT a byte-preservation concern — that is
 * `defnRaw`'s (raw-text) job; this only needs to produce the typed view-facing model
 * (Task 8/9 consume it), so unknown/passthrough fields beyond the documented set are not
 * specially preserved here (they ARE preserved on the wire, because serialize never
 * re-emits `defnRaw` from this object at all — see `HeroModel.serializeStateSplice`).
 */
function parseDefn(data: Record<string, unknown>): HeroDefn {
	if (typeof data.name !== 'string' || data.name.trim() === '') {
		throw new Error("ds-hero requires a 'name' field.");
	}
	if (typeof data.level !== 'number') {
		throw new Error("ds-hero requires a numeric 'level' field.");
	}

	const defn: HeroDefn = {
		name: data.name,
		level: data.level,
		characteristics: parseCharacteristics(data.characteristics),
	};

	if (data.ancestry !== undefined) defn.ancestry = data.ancestry as HeroDefn['ancestry'];
	if (data.class !== undefined) defn.class = data.class as HeroDefn['class'];
	if (typeof data.subclass === 'string') defn.subclass = data.subclass;
	if (Array.isArray(data.kits)) defn.kits = data.kits as string[];
	if (Array.isArray(data.skills)) defn.skills = data.skills as string[];
	if (Array.isArray(data.abilities)) defn.abilities = data.abilities as HeroDefn['abilities'];
	if (typeof data.max_stamina === 'number') defn.max_stamina = data.max_stamina;
	if (typeof data.recoveries_max === 'number') defn.recoveries_max = data.recoveries_max;
	if (data.resource !== undefined) defn.resource = parseResourceOverride(data.resource);
	if (Array.isArray(data.titles)) defn.titles = data.titles;
	if (Array.isArray(data.perks)) defn.perks = data.perks;
	if (Array.isArray(data.treasures)) defn.treasures = data.treasures;
	if (data.complication !== undefined) defn.complication = data.complication;

	return defn;
}

function parseCondition(entry: unknown, index: number): Condition {
	if (typeof entry === 'string') {
		if (entry.trim() === '') {
			throw new Error(`state.conditions[${index}] must not be a blank string.`);
		}
		return { key: entry };
	}
	const data = asRecord(entry, `state.conditions[${index}]`);
	if (typeof data.key !== 'string' || data.key.trim() === '') {
		throw new Error(`state.conditions[${index}] must have a string 'key'.`);
	}
	const condition: Condition = { key: data.key };
	if (typeof data.color === 'string') condition.color = data.color;
	if (typeof data.effect === 'string') condition.effect = data.effect;
	return condition;
}

function parseStamina(value: unknown): HeroStamina {
	const data = asRecord(value, "'state.stamina'");
	if (typeof data.current !== 'number') {
		throw new Error("'state.stamina.current' must be a number.");
	}
	if (typeof data.temp !== 'number') {
		throw new Error("'state.stamina.temp' must be a number.");
	}
	return { current: data.current, temp: data.temp };
}

/** spec §3.4's default-seed rule, computed from whatever the definition authored (an
 *  unresolved `max_stamina`/`recoveries_max`/`resource.min` — Task 8's compendium
 *  resolution isn't wired yet, spec §3.5 — falls back to 0, the same "inline-only, no
 *  guessing" posture every other element takes with an absent override). */
function defaultState(defn: HeroDefn): HeroState {
	return {
		stamina: { current: defn.max_stamina ?? 0, temp: 0 },
		resource: defn.resource?.min ?? 0,
		surges: 0,
		recoveries: defn.recoveries_max ?? 0,
		victories: 0,
		conditions: [],
	};
}

/** Throws when `value` is present but not a `number` — mirrors `parseStamina`'s and
 *  `parseDefn`'s own convention (Task 7 review LOW finding #4). Before this, the
 *  scalar `state:` fields silently fell back to the seeded default on a type mismatch,
 *  inconsistent with every other typed field in this file; shielded in practice by AJV
 *  schema validation on the standard `prepareModel()` pipeline path, but not for direct
 *  `HeroModel.parse`/`parse` callers (future tooling, tests, a different host). */
function parseRequiredNumber(value: unknown, label: string): number {
	if (typeof value !== 'number') {
		throw new Error(`${label} must be a number.`);
	}
	return value;
}

/** Merges authored `state:` fields over the seeded defaults — a hand-authored PARTIAL
 *  `state:` block (e.g. only `stamina:` written) still gets the rest defaulted, matching
 *  the schema's "typed optional sub-fields" contract (spec §3.1). `value === undefined`
 *  (no `state:` key at all) returns the defaults untouched — spec §3.4's "seeded in
 *  memory only, not written until first interaction". */
function parseState(value: unknown, defn: HeroDefn): HeroState {
	const defaults = defaultState(defn);
	if (value === undefined || value === null) return defaults;

	const data = asRecord(value, "'state'");
	const state: HeroState = {
		stamina: data.stamina !== undefined ? parseStamina(data.stamina) : defaults.stamina,
		resource:
			data.resource !== undefined ? parseRequiredNumber(data.resource, "'state.resource'") : defaults.resource,
		surges: data.surges !== undefined ? parseRequiredNumber(data.surges, "'state.surges'") : defaults.surges,
		recoveries:
			data.recoveries !== undefined
				? parseRequiredNumber(data.recoveries, "'state.recoveries'")
				: defaults.recoveries,
		victories:
			data.victories !== undefined ? parseRequiredNumber(data.victories, "'state.victories'") : defaults.victories,
		conditions: Array.isArray(data.conditions)
			? data.conditions.map((entry, index) => parseCondition(entry, index))
			: defaults.conditions,
	};
	if (typeof data.tokens_ref === 'string') state.tokens_ref = data.tokens_ref;
	return state;
}

// ---------------------------------------------------------------------------------------
// Fix round 1 (Task 7 review MUST-FIX 1-3): the splitter is a REAL structural line-scan,
// not a regex that assumes `state:` is the LAST top-level key written in BLOCK style.
// Neither assumption is enforceable from the schema (`additionalProperties: false`
// constrains key *set*, not key *order* or *style*) or documented anywhere a user would
// see it, and violating either one used to actively corrupt a previously-valid file
// (silently dropping fields authored after `state:`, or manufacturing a duplicate
// `state:` key on CRLF/inline-flow sources — see task-7-review.md findings 1-3).
//
// This scanner (structural, not a full YAML parse — same precedent as
// `sidebar/anchor.ts`'s fence scanner: bracket/quote/comment-aware, one pass, no CST)
// finds the top-level `state:` key's REAL source span — wherever it sits, whatever style
// it's written in — and `splitDefnRaw` REMOVES that exact byte range from `raw`, rather
// than assuming "everything after the first match is disposable". That's what makes
// out-of-order placement, and definition content authored AFTER `state:`, survive.
//
// Only obsidian's `parseYaml`/`stringifyYaml` (the `yaml` npm package's `parse(src, null,
// {})`/`stringify(value, null, {})` at defaults) are available to `src/` code — the full
// `yaml` package (Document/CST API) is a devDependency only (used by the test mocks to
// mirror Obsidian's real implementation), not bundled into the plugin. A hand-rolled
// structural scanner is therefore the shape this fix takes, not a CST walk.
// ---------------------------------------------------------------------------------------

interface RawLine {
	/** Byte offset of this line's first character. */
	start: number;
	/** This line's text, with its EOL (if any) stripped. */
	text: string;
}

/**
 * Splits `raw` into lines, EOL-agnostic (`\r\n`, bare `\n`, or a lone `\r`) — MUST-FIX #2:
 * the old `raw.split('\n')` left a trailing `\r` on every line of a CRLF source, which
 * silently broke the old `$`-anchored regex (a CRLF `state:` line was never recognized).
 * Every `RawLine.text` here is EOL-free regardless of source line-ending style, and
 * `start` is a real byte offset into `raw` (not a line index), so callers can slice `raw`
 * itself rather than rejoining lines (which would normalize/lose the original EOLs).
 * `raw` with no trailing EOL still produces a correct, non-duplicated final entry.
 */
function splitRawLines(raw: string): RawLine[] {
	const lines: RawLine[] = [];
	const eolRe = /\r\n|\r|\n/g;
	let cursor = 0;
	let match: RegExpExecArray | null;
	while ((match = eolRe.exec(raw))) {
		lines.push({ start: cursor, text: raw.slice(cursor, match.index) });
		cursor = match.index + match[0].length;
	}
	lines.push({ start: cursor, text: raw.slice(cursor) });
	return lines;
}

/** A plain top-level YAML key line: an identifier at column 0 immediately followed by
 *  `:`. Leading whitespace fails the `^` anchor, so this never matches an indented
 *  block-style continuation line or a block-scalar body line (YAML requires both to be
 *  indented relative to their owning key) — only a REAL top-level key line matches. */
const TOP_LEVEL_KEY_RE = /^([A-Za-z_][\w.-]*):(.*)$/;

/**
 * Net YAML flow-collection bracket depth contributed by one line of source text —
 * quote- and comment-aware, mirroring `anchor.ts`'s fence-scanner precedent (structural,
 * not a full parse). Single- and double-quoted scalars are skipped whole (respecting
 * YAML's `''`/`\"` escaping), so a brace/bracket INSIDE a quoted string (or the literal
 * substring `state:`, spec-legal per the existing "state: inside a string value" test)
 * is never miscounted; a `#` only opens a comment when it is line-initial or preceded by
 * whitespace and not inside a string (YAML's own comment rule), so it never truncates the
 * scan early on a glued-together token. Used both to recognize a single-line inline flow
 * `state: { ... }` (MUST-FIX #3 — net depth 0, no continuation) and to correctly skip
 * through some OTHER key's multi-line flow value without miscounting a `state:`-looking
 * line inside it as a new top-level key.
 */
function computeFlowDelta(text: string): number {
	let depth = 0;
	let i = 0;
	const n = text.length;
	while (i < n) {
		const ch = text[i];
		if (ch === "'") {
			i++;
			while (i < n) {
				if (text[i] === "'") {
					if (text[i + 1] === "'") {
						i += 2;
						continue;
					}
					i++;
					break;
				}
				i++;
			}
			continue;
		}
		if (ch === '"') {
			i++;
			while (i < n) {
				if (text[i] === '\\') {
					i += 2;
					continue;
				}
				if (text[i] === '"') {
					i++;
					break;
				}
				i++;
			}
			continue;
		}
		if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) break;
		if (ch === '{' || ch === '[') depth++;
		else if (ch === '}' || ch === ']') depth--;
		i++;
	}
	return depth;
}

/**
 * Finds the top-level `state:` entry's exact line span [startLine, endLine] (inclusive) —
 * MUST-FIX 1-3's core: a REAL structural scan, not "assume state is last and block-style".
 * Walks every line once, tracking which top-level key "owns" each non-key line (an
 * indented block-style continuation, a blank line, or a line inside an unclosed flow
 * bracket all belong to whichever top-level key line most recently opened) and the
 * running flow-bracket depth for multi-line flow collections.
 *
 * A second top-level `state:` key line is a hard parse error: YAML requires unique keys.
 * `parseYaml` already enforces this for anything that reaches it through the normal
 * pipeline (`prepareModel` calls `parseYaml(source)` before `def.parse`), but this
 * scanner walks `raw` independently of whatever `data` the caller passed as `input` —
 * `HeroModel.parse`/the exported `parse` are directly importable with the two arguments
 * out of sync (see this task's regression test), so this is the authoritative check for
 * THIS scanner's own contract, not a redundant re-check of the caller's parseYaml.
 */
function findStateSpan(lines: RawLine[]): { startLine: number; endLine: number } | null {
	let span: { startLine: number; endLine: number } | null = null;
	let currentKeyIsState = false;
	let flowDepth = 0;
	let inFlow = false;

	for (let i = 0; i < lines.length; i++) {
		const text = lines[i].text;
		if (!inFlow) {
			const keyMatch = TOP_LEVEL_KEY_RE.exec(text);
			if (keyMatch) {
				const key = keyMatch[1];
				if (key === 'state') {
					if (span) {
						throw new Error("ds-hero: duplicate top-level 'state:' key in source — YAML keys must be unique.");
					}
					span = { startLine: i, endLine: i };
				}
				currentKeyIsState = key === 'state';
				flowDepth = Math.max(0, computeFlowDelta(keyMatch[2]));
				inFlow = flowDepth > 0;
				continue;
			}
			if (currentKeyIsState && span) span.endLine = i;
			continue;
		}
		flowDepth += computeFlowDelta(text);
		if (currentKeyIsState && span) span.endLine = i;
		if (flowDepth <= 0) {
			flowDepth = 0;
			inFlow = false;
		}
	}
	return span;
}

/**
 * Splits `raw` into the authored definition region, preserved BYTE-FOR-BYTE (comments,
 * unusual indentation, quoted strings, trailing whitespace, key order — spec §3.4) —
 * AND now (MUST-FIX 1-3), preserved regardless of the top-level `state:` key's layout:
 * before/after other fields, CRLF-terminated, or inline flow style. `state:`'s own
 * source span is REMOVED from `raw` (via `findStateSpan`) rather than assumed to be
 * "everything from the first match to EOF" — that's what makes out-of-order placement,
 * and definition content authored AFTER `state:`, survive untouched. `state:` always
 * serializes LAST (documented normalization, spec unaffected): an authored mid-document
 * `state:` moves to the end the first time this model round-trips, then stays stable.
 * When no top-level `state:` key exists, the whole block IS the definition (trailing
 * whitespace trimmed only, matching every other persisted element's trimmed-output
 * convention).
 */
function splitDefnRaw(raw: string): string {
	const lines = splitRawLines(raw);
	const span = findStateSpan(lines);
	if (!span) return raw.replace(/\s+$/u, '');

	const removeStart = lines[span.startLine].start;
	const removeEnd = span.endLine + 1 < lines.length ? lines[span.endLine + 1].start : raw.length;
	const spliced = raw.slice(0, removeStart) + raw.slice(removeEnd);
	return spliced.replace(/\s+$/u, '');
}

/**
 * The raw source's dominant end-of-line style — CRLF only when EVERY line break in `raw`
 * is `\r\n` (a mixed-EOL source defaults to LF, the safer/spec-standard choice). This
 * only ever affects the FRESH `state:` block's own newlines and the joiner between it and
 * `defnRaw` on serialize (MUST-FIX #2) — `defnRaw` itself is sliced verbatim from `raw`
 * and keeps whatever EOLs its bytes already had, untouched.
 */
function detectEol(raw: string): '\r\n' | '\n' {
	const totalNewlines = (raw.match(/\n/g) ?? []).length;
	if (totalNewlines === 0) return '\n';
	const crlfNewlines = (raw.match(/\r\n/g) ?? []).length;
	return crlfNewlines === totalNewlines ? '\r\n' : '\n';
}

/** Indents every non-blank line of `text` by two spaces — yaml's own default nesting
 *  indent, matching the authored `state:` block's own indentation (spec §3.1 example).
 *  Blank lines stay blank (never padded with trailing whitespace). */
function indent(text: string): string {
	return text
		.split('\n')
		.map((line) => (line.length === 0 ? line : `  ${line}`))
		.join('\n');
}

/**
 * The flagship model (spec §3.4): `defn`/`state` are the typed, view-facing halves;
 * `defnRaw` is the private byte-exact authored text `serializeStateSplice` splices back
 * on every write. `defnRaw` is intentionally NOT exposed as a public field — the only
 * thing that should ever reconstruct a block from it is this class's own serializer, so a
 * consumer can't accidentally treat it as swappable/derivable state. `eol` (fix round 1,
 * MUST-FIX #2) is the source's dominant line-ending style, applied only to the FRESH
 * `state:` block this class re-emits — `defnRaw`'s own bytes (and their EOLs) are never
 * touched. Defaults to `'\n'` for any caller that constructs a `HeroModel` directly
 * without going through `parse` (matching this file's pre-fix hardcoded behavior).
 */
export class HeroModel {
	defn: HeroDefn;
	state: HeroState;
	private readonly defnRaw: string;
	private readonly eol: '\r\n' | '\n';

	constructor(defn: HeroDefn, state: HeroState, defnRaw: string, eol: '\r\n' | '\n' = '\n') {
		this.defn = defn;
		this.state = state;
		this.defnRaw = defnRaw;
		this.eol = eol;
	}

	/** OD-2 — the state-scoped splice: re-emit ONLY `state:`, splice the untouched
	 *  authored definition back verbatim. `serialize(model) = defnRaw + "\nstate:\n" +
	 *  indent(stringifyYaml(model.state))`, verbatim from spec §3.4 — with the source's
	 *  dominant EOL (fix round 1, MUST-FIX #2) applied to the joiner and the fresh
	 *  `state:` block itself; `defnRaw` keeps whatever EOLs its own bytes already had. */
	serializeStateSplice(): string {
		const stateYamlLf = indent(stringifyYaml(this.state).replace(/\n+$/u, ''));
		const stateYaml = this.eol === '\r\n' ? stateYamlLf.replace(/\n/g, '\r\n') : stateYamlLf;
		return `${this.defnRaw}${this.eol}state:${this.eol}${stateYaml}`;
	}

	static parse(input: unknown, raw: string): HeroModel {
		const data = asRecord(input, 'The ds-hero block');
		const defn = parseDefn(data);
		const state = parseState(data.state, defn);
		const defnRaw = splitDefnRaw(raw);
		const eol = detectEol(raw);
		return new HeroModel(defn, state, defnRaw, eol);
	}
}

export function parse(input: unknown, raw: string): HeroModel {
	return HeroModel.parse(input, raw);
}

export function serialize(model: HeroModel): string {
	return model.serializeStateSplice();
}
