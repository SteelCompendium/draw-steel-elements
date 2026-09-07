import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * SC-202 r1 fix round (independent review, HIGH-3) — the structural guard a gallery-shaped
 * sweep cannot provide.
 *
 * `assertInputHostLeak` (visual-harness/shoot.mjs) walks `#mount` in the browser GALLERY,
 * exactly the way `assertBtnHostLeak`/the phase-1 census did — and modals never mount
 * there, so `.dse-sedit__apply-input`, `.dse-condal__input` and `.dse-form__raw` (a
 * `<textarea>`) shipped unfixed and invisible to every gate for one whole round, found only
 * by an independent reviewer measuring a real Obsidian by hand. Browser-gallery modal
 * fixtures are NOT required to close this (owner ruling, decisions.md 2026-09-02) — this
 * source-contract test is the guard instead: it scans every `createEl('input'|'textarea',
 * {...})` call site in `src/**` and asserts the resulting CSS class is covered by the
 * SC-202 r1 re-grounding block, so a FUTURE input the sweep also cannot see still fails a
 * test instead of shipping silently leaking.
 *
 * SC-202 r4-resume Step A — this guard itself had a real bug: its per-call-site scan
 * window was a flat character slice that could bleed into the FOLLOWING statement and
 * mis-attribute a leak to a sibling element's class. It caught SC-277's own unclassed
 * `type='search'` icon-filter input (`ConditionsModal.ts`) — but under the wrong name,
 * a neighbouring `<div>`'s class. See `findInputCallSites`'s own comment for the fix.
 *
 * SC-202 r4 fix round (independent review, HIGH-1) — Step A's OWN unclassed-branch fix
 * was itself vacuous: it turned the silent skip into a named test whose assertion
 * (`expect(site.cls).toBeNull()`) restates the very condition that put it in the branch,
 * so it could never fail. Mutation-proven: re-removing SC-277's own class left the whole
 * suite green. An unclassed, non-exempt call site now FAILS, naming the site — the
 * promise at `:17-18` above is true again.
 */

const SRC_DIR = path.join(__dirname, '..', '..', '..', 'src');
const rawCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'styles-source.css'), 'utf8');
const blockStart = rawCss.indexOf('SC-202 r1 — INPUT/STEPPER HOST RE-GROUNDING');
/** MED-C (fix round 2, re-review) — comments stripped BEFORE matching, same as
 *  `inputHostRegrounding.test.ts`'s own `flat` derivation. Round 1's `block` kept the
 *  block's prose comments in the searched text, and the block's own comment names every
 *  covered class several times over — so a bare `toContain` on `block` kept passing even
 *  after the reviewer renamed all SIX rule occurrences of `.dse-condal__input` and left
 *  the NINE comment occurrences untouched: exactly the HIGH-3 defect this test exists to
 *  catch, reintroduced with the suite green. `codeOnly` is what every assertion below
 *  actually searches. */
const codeOnly = rawCss.slice(blockStart).replace(/\/\*[\s\S]*?\*\//g, '');

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) out.push(full);
	}
	return out;
}

interface CallSite {
	file: string;
	line: number;
	tag: 'input' | 'textarea';
	cls: string | null;
	type: string | null;
}

/** Every `createEl('input'|'textarea', { ... })` call site's class + type.
 *
 *  SC-202 r4-resume Step A (guard fix) — this used to slice a FLAT 300-char text window
 *  after the match rather than bounding it to the call's own options object, on the
 *  theory that "every call site … is a short object literal (checked: none exceeds
 *  ~200 chars)". That is true of the object literal itself, but the window is measured
 *  from the match, not the object literal's own start — so a short SUBSEQUENT statement
 *  (a `.setAttribute(...)` call, a sibling `createDiv({ cls: … })`) still sits well
 *  inside 300 chars and its own `cls:`/`type:` text was silently captured as if it
 *  belonged to THIS call site. Exactly this happened for SC-277's `ConditionsModal.ts`
 *  icon-filter input (no class of its own): the window bled into the very next
 *  statement, `picker.createDiv({ cls: 'dse-cond-icons__grid' })`, and the guard
 *  reported the leak under the GRID's class — a real defect, attributed to the wrong
 *  selector, which would have sent a fixer to re-ground `.dse-cond-icons__grid`
 *  instead of the actual unclassed `<input>`. Fixed to balance braces from the options
 *  object's own OPENING `{` (if the call has one at all) to its matching `}`, so the
 *  scan never reads past the call's own argument list. */
function findInputCallSites(): CallSite[] {
	const out: CallSite[] = [];
	for (const file of walk(SRC_DIR)) {
		const text = fs.readFileSync(file, 'utf8');
		const re = /createEl\(\s*['"](input|textarea)['"]/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(text))) {
			const line = text.slice(0, m.index).split('\n').length;
			// Bound the scan to the options object literal: from its own opening `{`
			// to the matching `}` (brace-depth counted, not regex-guessed), stopping
			// at the call's own closing `)` if there is no options object at all
			// (a bare `createEl('textarea')`). A generous 2000-char cap guards
			// against a malformed/unbalanced file rather than reading to EOF.
			const closeParenIdx = text.indexOf(')', m.index);
			const openBraceIdx = text.indexOf('{', m.index);
			let win = '';
			if (openBraceIdx !== -1 && (closeParenIdx === -1 || openBraceIdx < closeParenIdx)) {
				let depth = 0;
				let i = openBraceIdx;
				for (; i < text.length && i < openBraceIdx + 2000; i++) {
					if (text[i] === '{') depth++;
					else if (text[i] === '}') {
						depth--;
						if (depth === 0) {
							i++;
							break;
						}
					}
				}
				win = text.slice(openBraceIdx, i);
			}
			const clsMatch = win.match(/cls:\s*['"]([^'"]+)['"]/);
			const typeMatch = win.match(/type:\s*['"]([^'"]+)['"]/);
			out.push({
				file: path.relative(SRC_DIR, file),
				line,
				tag: m[1] as 'input' | 'textarea',
				cls: clsMatch?.[1] ?? null,
				type: typeMatch?.[1] ?? null,
			});
		}
	}
	return out;
}

test('the SC-202 r1 block is still in the sheet (the scan below parses against it)', () => {
	expect(blockStart).toBeGreaterThan(0);
});

describe('every plugin input/textarea class is re-grounded against the host', () => {
	const sites = findInputCallSites();

	test('the scan is non-vacuous', () => {
		// As of this round: stepper, the malice pair, the montage pair, party award, the
		// project trio, the two sedit-apply sites, condal, form-raw — plus several bare
		// checkbox/color sites this scan also finds and deliberately excludes below. A count
		// this low means the walk found nothing, not that the plugin has few inputs.
		expect(sites.length).toBeGreaterThanOrEqual(15);
	});

	for (const site of sites) {
		// `checkbox`/`color` are later-round families (INFO-1 records the checkbox
		// focus-visible leak for that round) — explicitly out of THIS scan's scope, not an
		// oversight. Checked BEFORE the class check below: several of these are
		// themselves unclassed (bare checkboxes read Obsidian's own checkbox rules by
		// design elsewhere in this sheet), and must stay silently excluded rather than
		// surfacing as an "unclassed" report — that would just be noise for a family
		// this scan was never meant to police.
		if (site.type === 'checkbox' || site.type === 'color') continue;
		if (!site.cls) {
			// SC-202 r4 fix round (independent review, HIGH-1) — the Step A rewrite made
			// this branch a named test, but `expect(site.cls).toBeNull()` can NEVER fail
			// (it asserts the very condition that put the site in this branch), so the
			// guard went back to passing silently on an unclassed, non-exempt input — the
			// exact defect it exists to catch (mutation-proven: re-removing SC-277's own
			// `cls: 'dse-cond-icons__search'` left this suite fully green). FAIL instead,
			// naming the site — give it a class and fold it into the SC-202 r1 block
			// (checkbox/color are already excluded by TYPE above, not by being unclassed;
			// nothing else is unclassed by design today).
			test(`${site.file}:${site.line} — unclassed ${site.tag}${site.type ? `, type=${site.type}` : ''} must carry a class covered by the SC-202 r1 block`, () => {
				expect(site.cls).not.toBeNull();
			});
			continue;
		}
		test(`${site.file}:${site.line}: .${site.cls} (${site.tag}${site.type ? `, type=${site.type}` : ''})`, () => {
			// A SELECTOR POSITION, not a bare substring: `.` + the class name, not
			// immediately followed by another word/hyphen character (so `.dse-mt__char-input`
			// cannot be satisfied by a comment mentioning `.dse-mt__char-input-extra`, and a
			// comment sentence that happens to contain the class as plain prose no longer
			// counts at all — comments were already stripped out of `codeOnly` above).
			expect(codeOnly).toMatch(new RegExp('\\.' + escapeRegex(site.cls!) + '(?![\\w-])'));
		});
	}
});

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
