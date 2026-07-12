// Plan 15 Task 1 (D9 §2.1) — the pure scaffold builder. buildScaffold(def) yields the
// fenced block the insert command / suggester drops at the cursor: a curated
// authoring.example when present, else a body walked from def.schema (required keys first,
// optionals commented), else a placeholder. PURE: parseYaml aside, no Obsidian, no DOM,
// no editor mutation — the editor writes happen in insert.ts/suggest.ts.
import { parseYaml } from 'obsidian';
import type { EditorPosition } from 'obsidian';
import type { ElementDefinition } from '@/framework/registry';

export interface Scaffold {
	/** Full fenced block text to insert. */
	text: string;
	/** Offset (chars into `text`) to drop the cursor: the first body character. */
	cursorOffset: number;
}

/** Wrap a YAML body in the canonical fence, guaranteeing exactly one trailing newline. */
export function wrapFence(alias: string, body: string): string {
	const trimmed = body.replace(/\n+$/, '');
	return '```' + alias + '\n' + trimmed + '\n```';
}

/** Placeholder value for a property, by JSON-Schema node: default → enum[0] → typed stub. */
function stubFor(prop: unknown): string {
	if (!prop || typeof prop !== 'object') return '""';
	const p = prop as {
		default?: unknown;
		enum?: unknown[];
		type?: string;
		minimum?: number;
		exclusiveMinimum?: number;
	};
	if ('default' in p) return typeof p.default === 'string' ? p.default : JSON.stringify(p.default);
	if (Array.isArray(p.enum) && p.enum.length > 0) {
		// Same plain-scalar treatment as a string default: an unquoted string enum value
		// reads as authored YAML, not a JSON.stringify'd literal.
		const first = p.enum[0];
		return typeof first === 'string' ? first : JSON.stringify(first);
	}
	switch (p.type) {
		case 'integer':
		case 'number':
			// Respect a declared floor: a bare 0 would be schema-invalid out of the box
			// for e.g. `minimum: 1` fields.
			if (typeof p.minimum === 'number') return String(p.minimum);
			if (typeof p.exclusiveMinimum === 'number') return String(p.exclusiveMinimum + 1);
			return '0';
		case 'boolean':
			return 'false';
		case 'array':
			return '[]';
		case 'object':
			return '{}';
		default:
			return '""';
	}
}

/** Walk a YAML JSON-Schema into a scaffold body. Empty string if it has no properties. */
export function scaffoldFromSchema(schemaYaml: string | undefined): string {
	if (!schemaYaml) return '';
	let schema: unknown;
	try {
		schema = parseYaml(schemaYaml);
	} catch {
		return '';
	}
	if (!schema || typeof schema !== 'object') return '';
	const s = schema as { properties?: Record<string, unknown>; required?: unknown };
	const props = s.properties;
	if (!props || typeof props !== 'object') return '';
	const requiredSet = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
	const names = Object.keys(props);
	const required = names.filter((n) => requiredSet.has(n));
	const optional = names.filter((n) => !requiredSet.has(n));

	const lines: string[] = [];
	const emit = (name: string, commented: boolean): void => {
		const prop = props[name];
		const desc =
			prop && typeof prop === 'object' && typeof (prop as { description?: unknown }).description === 'string'
				? `  # ${(prop as { description: string }).description}`
				: '';
		const line = `${name}: ${stubFor(prop)}${desc}`;
		lines.push(commented ? `# ${line}` : line);
	};
	for (const n of required) emit(n, false);
	if (optional.length > 0) {
		lines.push('# --- optional ---');
		for (const n of optional) emit(n, true);
	}
	return lines.join('\n');
}

/**
 * Walk `text` forward from `base` by `offset` characters (pure string math, no editor
 * access): each `\n` bumps the line and resets `ch` to 0, everything else advances `ch`.
 * Used to turn a Scaffold's `cursorOffset` into the concrete EditorPosition to drop the
 * cursor at, relative to wherever the scaffold text was actually inserted.
 */
export function advancePosition(base: EditorPosition, text: string, offset: number): EditorPosition {
	let line = base.line;
	let ch = base.ch;
	const end = Math.min(offset, text.length);
	for (let i = 0; i < end; i++) {
		if (text[i] === '\n') {
			line++;
			ch = 0;
		} else {
			ch++;
		}
	}
	return { line, ch };
}

/** Build the ready-to-insert scaffold for an element. */
export function buildScaffold(def: ElementDefinition): Scaffold {
	const alias = def.aliases[0];
	const body = (def.authoring?.example ?? scaffoldFromSchema(def.schema)) || '# fill in fields';
	return {
		text: wrapFence(alias, body),
		cursorOffset: ('```' + alias + '\n').length,
	};
}
