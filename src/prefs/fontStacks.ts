// src/prefs/fontStacks.ts — SC-112 (Plan 23 Task 6): the font-slot value layer.
//
// Three things live here, shared by the catalog descriptors (catalog.ts) and the
// Task 8 settings control:
//   - sanitizeFamily(): user text → a safe font-family list (or null = default);
//   - fontCss(): sanitized family + the slot's fallback tail — the string the
//     css-bearing descriptor stamps as the inline custom property;
//   - CURATED_FONTS / DEFAULT_FONT_OPTION: the dropdown choices (values are BARE
//     family names — fontCss builds the stack; the site's FONT_OPTIONS bakes full
//     stacks into values, which we deliberately do NOT copy:
//     v2/docs/javascripts/settings-panel.js:47-73 is a model, not a template).
//
// Fallback tails are the §5 fallback story of sc105-font-tokens-design.md, matching
// the value-block chains in styles-source.css (the unscoped base, then the Steel block):
// Title/Body bottom out at the vault's --font-text, Mono at --font-monospace, and
// the three chained slots (Controls/Card-body → Body, Label → Title) fall back to
// their PARENT SLOT token — so overriding Body alone still carries Controls and
// Card-body with it, exactly like the default chains do.
//
// SC-112 final-review I1: the three chained tails carry a NESTED var() fallback to
// --font-text. Without it, an inline override on a LEGACY root silently no-ops
// unless the parent slot is also set: Legacy's --dse-font-body/--dse-font-title
// live only in the (IACVT-dead) :root chain set — the Task 3 root cause — so the
// bare var() is invalid at computed-value time and one invalid var() invalidates
// the WHOLE inline font-family. With the fallback, the chain degrades to the vault
// font instead of dying; under Steel (block-scoped chains valid) and under
// Legacy-with-parent-set the extra fallback never fires, so behavior is unchanged.

/** The six font slots, keyed to their pref (`font<Slot>`) and token (`--dse-font-<slot>`). */
export type FontSlot = 'title' | 'body' | 'controls' | 'cardBody' | 'label' | 'mono';

/** Per-slot fallback tail appended after the user's family (§5 fallback story). */
const SLOT_FALLBACK: Record<FontSlot, string> = {
	title: 'var(--font-text)',
	body: 'var(--font-text)',
	controls: 'var(--dse-font-body, var(--font-text))',
	cardBody: 'var(--dse-font-body, var(--font-text))',
	label: 'var(--dse-font-title, var(--font-text))',
	mono: 'var(--font-monospace)',
};

// CSS generic family / system keywords stay UNQUOTED — quoting one ("system-ui")
// turns it into a literal family-name lookup and silently kills the fallback.
// Everything else is emitted quoted, which both satisfies families with spaces and
// neutralizes any residual oddball characters (a quoted string has no CSS meaning).
const GENERIC_FAMILIES = new Set([
	'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
	'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
	'math', 'emoji', 'fangsong',
]);

// Stripped outright from every token: declaration/block breakers (; { }),
// function-call parens (var()/url()), string delimiters + escapes (" ' \ `),
// and control characters. What survives is either a bare generic keyword or a
// quoted string — neither can smuggle CSS syntax through the inline property.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[;{}()"'\\`\u0000-\u001f\u007f]/g;

/**
 * User text → a safe, normalized font-family list: split on commas, strip
 * forbidden characters, trim + collapse whitespace, drop empty tokens, quote
 * every non-generic token, rejoin. Returns `null` when nothing survives —
 * callers treat that exactly like the '' default (no override).
 */
export function sanitizeFamily(input: string): string | null {
	const tokens = input
		.split(',')
		.map((token) => token.replace(FORBIDDEN_CHARS, '').replace(/\s+/g, ' ').trim())
		.filter((token) => token.length > 0)
		.map((token) => (GENERIC_FAMILIES.has(token.toLowerCase()) ? token : `"${token}"`));
	return tokens.length > 0 ? tokens.join(', ') : null;
}

/**
 * The inline custom-property value for `slot` holding `family`: the sanitized
 * family list plus the slot's fallback tail. `null` (family sanitized away to
 * nothing) means "no override" — the descriptor's toCss passes it straight
 * through to reflect()'s removeProperty path.
 */
export function fontCss(slot: FontSlot, family: string): string | null {
	const sanitized = sanitizeFamily(family);
	if (sanitized === null) return null;
	return `${sanitized}, ${SLOT_FALLBACK[slot]}`;
}

export interface FontOption {
	/** BARE family name (or generic keyword) — fontCss builds the full stack. */
	readonly value: string;
	readonly label: string;
}

/**
 * The uniform first/default dropdown option for every font slot (Scott's
 * 2026-08-02 ruling): '' = no override — today's vault-font behavior (directly
 * for Title/Body, via the theme-block chains for the other four slots, and what
 * Legacy always renders at defaults).
 */
export const DEFAULT_FONT_OPTION: FontOption = {
	value: '',
	label: 'Default (Obsidian vault fonts)',
};

/**
 * Curated dropdown choices (modeled on the site's FONT_OPTIONS): `text` for the
 * five text slots — Source Serif 4 (the bundled Steel face) first, then a small
 * cross-platform serif/sans set; `mono` for the Mono slot.
 */
export const CURATED_FONTS: { readonly text: readonly FontOption[]; readonly mono: readonly FontOption[] } = {
	text: [
		{ value: 'Source Serif 4', label: 'Source Serif 4 (bundled)' },
		{ value: 'Georgia', label: 'Georgia' },
		{ value: 'Palatino Linotype', label: 'Palatino Linotype' },
		{ value: 'Times New Roman', label: 'Times New Roman' },
		{ value: 'Inter', label: 'Inter' },
		{ value: 'system-ui', label: 'System UI' },
		{ value: 'Arial', label: 'Arial' },
	],
	mono: [
		{ value: 'JetBrains Mono', label: 'JetBrains Mono' },
		{ value: 'Fira Code', label: 'Fira Code' },
		{ value: 'ui-monospace', label: 'System monospace' },
	],
};
