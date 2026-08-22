// SC-186 — shared condition DISPLAY fallbacks for UNREGISTERED (custom) condition keys.
// A statblock's bespoke condition (e.g. "hexed") was previously unreachable from any UI
// (only hand-authored YAML could produce a key the ConditionManager doesn't recognize)
// and every renderer silently DROPPED it (kit/conditionIcons.ts's `if (!condition)
// continue`). ConditionsModal's "Add custom: <text>" row makes it a supported path, so
// every renderer now needs the SAME fallback story: a generic glyph (Lucide
// circle-dashed) and a title-cased label derived from the key, so the condition renders
// as SOMETHING instead of disappearing.
//
// kit/conditionIcons.ts duplicates `FALLBACK_CONDITION_ICON`/title-casing locally rather
// than importing from here — framework/kit must never import from src/elements (F1 OD-8;
// kit-index.test.ts enforces it with a real import scan), the same boundary that already
// forced applyConditionColor/applyConditionEffect to be duplicated there.
export const FALLBACK_CONDITION_ICON = 'circle-dashed';

/** "used-triggered-action" / "high ground" -> "Used Triggered Action" / "High Ground". */
export function titleCaseConditionKey(key: string): string {
	return key
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/** The longest slug this function will ever return (SC-186 fix-round LOW-2) — a
 *  generous cap on a condition NAME, not a real limit anyone should hit by typing. */
const MAX_SLUG_LENGTH = 64;

/** Typed custom-condition text -> a `Condition.key` slug (SettingsTab.ts's `slugify`
 *  convention, src/views/SettingsTab.ts, extended for SC-186 fix-round LOW-2):
 *  NFKD-normalizes first so an accented Latin letter degrades to its base letter rather
 *  than being dropped outright ("Ünholy" -> "unholy", not "nholy" — NFKD decomposes 'Ü'
 *  into 'U' + a combining diaeresis, which the character-class strip below then removes
 *  as a combining mark, leaving the base letter), then clamps length. Blank/
 *  punctuation-only input slugs to ''. */
export function slugConditionKey(text: string): string {
	const slug = text
		.normalize('NFKD')
		// Combining Diacritical Marks block (U+0300-U+036F) — what NFKD decomposes an
		// accented letter INTO (e.g. 'U+00DC Ü' -> 'U+0055 U' + 'U+0308 combining
		// diaeresis'); stripping this range is what turns "Ünholy" into "unholy"
		// instead of dropping the accented letter's base character entirely.
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	return slug.length > MAX_SLUG_LENGTH ? slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, '') : slug;
}
