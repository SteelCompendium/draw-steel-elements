// Plan 15 Tasks 3-4 (D9 §2.2 + §5.1) — shared fence-scanning machinery. Two EditorSuggests
// need "is line N inside an already-opened fence" state: the /ds scaffolder (suppress
// itself inside ANY fence, regardless of language — accepting mid-fence would corrupt
// whatever block the cursor sits in) and the in-fence key/enum DsSchemaSuggest (needs to
// know not just IF the cursor is inside a fence but WHICH ds-* language it opened with).
// One scanner, two consumers — extracted here (rather than duplicated) to avoid drift.
import type { Editor } from 'obsidian';
import { fenceLanguage } from '../framework/host/blockPrefix';

// A fence-marker line: an optional Obsidian callout/blockquote prefix (one or more `> `,
// e.g. nested callouts), up to 3 leading spaces (CommonMark still treats that as
// unindented), then 3+ backticks OR 3+ tildes (captured — group 1), then the rest of the
// line (group 2: the info string for an opener, or nothing for a closer).
const BQ_PREFIX = String.raw`(?:>\s?)*`;
const LEADING_WS = '[ ]{0,3}';
export const FENCE_LINE = new RegExp(`^${BQ_PREFIX}${LEADING_WS}(\`{3,}|~{3,})(.*)$`);

export interface FenceState {
	/** True if `line` sits inside an already-opened fence (any language). */
	inFence: boolean;
	/** The opening fence's language: the first whitespace-delimited token of its info string, case kept (e.g. "ds-roll", "js", ""; Obsidian only dispatches an exact-case match). Null when not inside a fence. */
	lang: string | null;
}

/**
 * Scans top-down from the start of the document through (not including) `line`, threading
 * fence open/close state. This is deliberately a full top-down scan, not a walk-upward
 * first-match: fences don't nest in CommonMark, so "am I inside a fence" is state that must
 * be threaded from the top — walking upward and stopping at the nearest fence-looking line
 * can mis-clear that state when an unclosed fence is followed, further down but still above
 * the cursor, by a fence-looking line that isn't actually a valid closer for it (wrong
 * marker char, too short, or carrying an info string) — that line is just literal content of
 * the still-open fence, not a real close. A real closer must match the opener's marker
 * character and be at least as long (mirrors CommonMark: ```` ``` ```` can't close ` ```` `,
 * and a tilde fence only closes with tildes).
 */
export function scanFenceState(editor: Editor, line: number): FenceState {
	let inFence = false;
	let lang: string | null = null;
	let fenceChar = '';
	let fenceLen = 0;
	for (let i = 0; i < line; i++) {
		const m = FENCE_LINE.exec(editor.getLine(i));
		if (!m) continue;
		const marker = m[1];
		const rest = m[2];
		if (!inFence) {
			// SC-476: CommonMark forbids a backtick in a BACKTICK fence's info string, so
			// ```` ```ds-stamina-bar `x` ```` is paragraph text, not an opener (tilde fences
			// may carry backticks). Treat it as literal content.
			if (marker[0] === '`' && rest.includes('`')) continue;
			inFence = true;
			fenceChar = marker[0];
			fenceLen = marker.length;
			// SC-476: the block's type is the FIRST token of the info string (```` ```ds-counter extra ````
			// is a ds-counter), by the one rule the rest of DSE uses (SC-457 `fenceLanguage`: leading
			// spaces and tabs only are skipped, so a no-break space before the name gives no type, as
			// in Obsidian). Case is kept: Obsidian dispatches a block to its processor by exact
			// language, so ```` ```DS-Stamina-Bar ```` never renders.
			lang = fenceLanguage(rest, marker[0]);
		} else if (marker[0] === fenceChar && marker.length >= fenceLen && rest.trim() === '') {
			inFence = false;
			lang = null;
		}
		// else: a fence-marker-looking line while already inside an open fence, but it
		// doesn't validly close it (wrong char, too short, or has an info string) — treat
		// it as literal content and keep scanning in the current state.
	}
	return { inFence, lang };
}
