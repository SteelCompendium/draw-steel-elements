import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * SC-450 — the structural guard against a fifth `data-pressed` drift.
 *
 * SC-423: the kit's `iconButton.setPressed` writes `aria-pressed` AND `[data-pressed]`, a by-hand
 * in-place repaint wrote only `aria-pressed`, and the kit's sheen rule (keyed on
 * `.dse-btn:not([data-pressed])`) then painted a toggled control differently from a rebuilt one.
 * SC-450 audited every other writer in `src/` and collapsed them into ONE function,
 * `setPressedState` (src/framework/kit/iconButton.ts). This test keeps it that way: it scans
 * `src/**` for any write of `aria-pressed` or `data-pressed` outside that file and fails on it,
 * naming file:line. Reads (`getAttribute` / `hasAttribute`), comments, and CSS selector strings
 * (`[aria-pressed="true"]`, which never contain the quoted bare name) are not writes.
 *
 * To add a toggle: call `setPressedState(el, pressed)` (re-exported from `@/framework/kit`), or
 * use an `iconButton` handle's `setPressed`. Only extend ALLOWED below for an element that is
 * deliberately NOT a toggle control, with the reason.
 */

const SRC_DIR = path.join(__dirname, '..', '..', '..', 'src');

/** The one module that owns the pair. */
const WRITER_MODULE = 'framework/kit/iconButton.ts';

/** Bare writes that are intentionally not routed through `setPressedState`. `count` is exact. */
const ALLOWED: { file: string; count: number; reason: string }[] = [
	{
		file: 'elements/initiative/view.ts',
		count: 2,
		reason:
			'the read-only action-economy <span>s (no controller): a static state display, not a toggle - ' +
			'it has no aria-pressed (a span is not a button) and only the `span.dse-init__action-toggle[data-pressed]` style hooks',
	},
];

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
	}
	return out;
}

/** Blanks block comments (keeping newlines so line numbers hold) and `//` line comments. */
function stripComments(src: string): string {
	return src
		.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
		.replace(/(^|\s)\/\/.*$/gm, '$1');
}

interface Hit {
	line: number;
	text: string;
}

/** Every quoted `aria-pressed` / `data-pressed` that is not the argument of a read. */
function findPressedWrites(src: string): Hit[] {
	const code = stripComments(src);
	const hits: Hit[] = [];
	const token = /(['"`])(aria-pressed|data-pressed)\1/g;
	let m: RegExpExecArray | null;
	while ((m = token.exec(code))) {
		const before = code.slice(Math.max(0, m.index - 24), m.index);
		if (/\b(get|has)Attribute\(\s*$/.test(before)) continue;
		const line = code.slice(0, m.index).split('\n').length;
		hits.push({ line, text: code.split('\n')[line - 1].trim() });
	}
	// The property form: `el.ariaPressed = ...`.
	const prop = /\.ariaPressed\s*=(?!=)/g;
	while ((m = prop.exec(code))) {
		const line = code.slice(0, m.index).split('\n').length;
		hits.push({ line, text: code.split('\n')[line - 1].trim() });
	}
	return hits;
}

describe('SC-450: aria-pressed / data-pressed are written by ONE function', () => {
	const files = walk(SRC_DIR).map((f) => ({
		rel: path.relative(SRC_DIR, f).split(path.sep).join('/'),
		src: fs.readFileSync(f, 'utf8'),
	}));

	test('no bare aria-pressed / data-pressed write exists in src/ outside iconButton.ts (bar the allowlist)', () => {
		const offenders: string[] = [];
		for (const { rel, src } of files) {
			if (rel === WRITER_MODULE) continue;
			const hits = findPressedWrites(src);
			const allowed = ALLOWED.find((a) => a.file === rel)?.count ?? 0;
			if (hits.length > allowed) {
				offenders.push(
					`${rel}: ${hits.length} write(s), ${allowed} allowed:\n` +
						hits.map((h) => `    line ${h.line}: ${h.text}`).join('\n'),
				);
			}
		}
		expect(offenders).toEqual([]);
	});

	test('the allowlist carries no stale entry (each file still has exactly its allowed bare writes)', () => {
		for (const a of ALLOWED) {
			const f = files.find((x) => x.rel === a.file);
			expect(f).toBeDefined();
			expect({ file: a.file, writes: findPressedWrites(f!.src).length }).toEqual({ file: a.file, writes: a.count });
		}
	});

	test('the writer module really owns both attributes, and the scanner recognises every write shape (can fail)', () => {
		const writer = files.find((x) => x.rel === WRITER_MODULE)!;
		expect(findPressedWrites(writer.src).map((h) => h.text).join('\n')).toMatch(/aria-pressed[\s\S]*data-pressed/);

		const shapes = [
			`chip.setAttribute('aria-pressed', String(on));`,
			`chip.setAttribute("aria-pressed", "true");`,
			`el.toggleAttribute('data-pressed', on);`,
			`el.removeAttribute('data-pressed');`,
			`parent.createEl('button', { attr: { 'aria-pressed': 'false' } });`,
			`el.ariaPressed = 'true';`,
			'el.setAttribute(`aria-pressed`, x);',
		];
		for (const s of shapes) expect({ s, n: findPressedWrites(s).length }).toEqual({ s, n: 1 });

		const harmless = [
			`const on = chip.getAttribute('aria-pressed') === 'true';`,
			`if (chip.hasAttribute('data-pressed')) {}`,
			`root.querySelector('button[aria-pressed="true"]');`,
			`// chip.setAttribute('aria-pressed', 'true');`,
			`/* el.toggleAttribute('data-pressed', on); */`,
			`const ok = el.ariaPressed === 'true';`,
		];
		for (const s of harmless) expect({ s, n: findPressedWrites(s).length }).toEqual({ s, n: 0 });
	});
});
