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
 */

const SRC_DIR = path.join(__dirname, '..', '..', '..', 'src');
const rawCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'styles-source.css'), 'utf8');
const blockStart = rawCss.indexOf('SC-202 r1 — INPUT/STEPPER HOST RE-GROUNDING');
const block = rawCss.slice(blockStart);

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
	tag: 'input' | 'textarea';
	cls: string | null;
	type: string | null;
}

/** Every `createEl('input'|'textarea', { ... })` call site's class + type. Reads a bounded
 *  window after the match rather than a real parser — every call site in this codebase is
 *  a short object literal (checked: none exceeds ~200 chars), so 300 is generous. */
function findInputCallSites(): CallSite[] {
	const out: CallSite[] = [];
	for (const file of walk(SRC_DIR)) {
		const text = fs.readFileSync(file, 'utf8');
		const re = /createEl\(\s*['"](input|textarea)['"]/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(text))) {
			const win = text.slice(m.index, m.index + 300);
			const clsMatch = win.match(/cls:\s*['"]([^'"]+)['"]/);
			const typeMatch = win.match(/type:\s*['"]([^'"]+)['"]/);
			out.push({
				file: path.relative(SRC_DIR, file),
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
		// No class: nothing for a class-keyed CSS block to cover (bare checkboxes read
		// Obsidian's own checkbox rules by design elsewhere in this sheet).
		if (!site.cls) continue;
		// `checkbox`/`color` are later-round families (INFO-1 records the checkbox
		// focus-visible leak for that round) — explicitly out of THIS scan's scope, not an
		// oversight.
		if (site.type === 'checkbox' || site.type === 'color') continue;
		test(`${site.file}: .${site.cls} (${site.tag}${site.type ? `, type=${site.type}` : ''})`, () => {
			expect(block).toContain(`.${site.cls}`);
		});
	}
});
