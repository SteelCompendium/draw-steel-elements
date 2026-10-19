import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import * as ts from 'typescript';

/**
 * SC-450 — the structural guard against a fifth `data-pressed` drift.
 *
 * SC-423: the kit's `iconButton.setPressed` writes `aria-pressed` AND `[data-pressed]`, a by-hand
 * in-place repaint wrote only `aria-pressed`, and the kit's sheen rule (keyed on
 * `.dse-btn:not([data-pressed])`) then painted a toggled control differently from a rebuilt one.
 * SC-450 audited every other writer in `src/` and collapsed them into ONE function,
 * `setPressedState` (src/framework/kit/iconButton.ts). This test keeps it that way: it parses
 * every `src/**` file with the TypeScript compiler and fails on any write of `aria-pressed` /
 * `data-pressed` outside that function's body, naming file:line.
 *
 * It works on the AST, not on text, so comments and CSS selector strings (`[aria-pressed="true"]`,
 * which never equal the bare name) are invisible by construction, and a string containing ` //`
 * cannot hide a write after it (SC-450 R2 LOW-2). A hit is any of:
 *   - a string / template literal whose compile-time value is `aria-pressed` or `data-pressed`
 *     (folds `'aria-' + 'pressed'` and `` `aria-${'pressed'}` ``), unless it is the first argument of a
 *     `getAttribute` / `hasAttribute` READ;
 *   - `.dataset.pressed` / `.dataset['pressed']` as an assignment target, `delete`, or `++`/`--` operand;
 *   - `.ariaPressed` / `['ariaPressed']` as an assignment target (`=`, `??=`, `||=`, `&&=`, ...);
 *   - attribute names compare case-insensitively (HTML lower-cases them: `'ARIA-PRESSED'` is a real write);
 *   - a `pressed` key in an object literal passed to `Object.assign(<x>.dataset, ...)`;
 *   - an `ariaPressed` object key (`Object.assign(el, { ariaPressed: 'true' })`) or the literal `'ariaPressed'`.
 * To add a toggle: call `setPressedState(el, pressed)` (re-exported from `@/framework/kit`), or use an
 * `iconButton` handle's `setPressed`. Extend ALLOWED only for an element that is deliberately NOT a
 * toggle control, with the reason; entries match by exact line text and exact count.
 */

const SRC_DIR = path.join(__dirname, '..', '..', '..', 'src');

/** The one module that owns the pair, and the one function in it allowed to write. */
const WRITER_MODULE = 'framework/kit/iconButton.ts';
const WRITER_FN = 'setPressedState';

/**
 * Bare writes that are intentionally not routed through `setPressedState`. Matched per hit by the
 * trimmed text of its line; `count` is exact, so swapping one allowed write for a different bare
 * one (same count, different text) fails.
 */
const ALLOWED: { file: string; line: string; count: number; reason: string }[] = [
	{
		file: 'elements/initiative/view.ts',
		line: "el.toggleAttribute('data-pressed', pressed);",
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

interface Hit {
	line: number;
	text: string;
	/** Name of the enclosing function declaration, if any. */
	fn: string | null;
}

const PRESSED_NAMES = new Set(['aria-pressed', 'data-pressed']);
const ASSIGNMENT_KINDS = new Set<ts.SyntaxKind>([
	ts.SyntaxKind.EqualsToken,
	ts.SyntaxKind.PlusEqualsToken,
	ts.SyntaxKind.MinusEqualsToken,
	ts.SyntaxKind.QuestionQuestionEqualsToken,
	ts.SyntaxKind.BarBarEqualsToken,
	ts.SyntaxKind.AmpersandAmpersandEqualsToken,
]);

/** The compile-time string value of an expression made only of literals, `+` and template spans. */
function staticText(node: ts.Node): string | undefined {
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
	if (ts.isParenthesizedExpression(node)) return staticText(node.expression);
	if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
		const l = staticText(node.left);
		const r = staticText(node.right);
		return l !== undefined && r !== undefined ? l + r : undefined;
	}
	if (ts.isTemplateExpression(node)) {
		let s = node.head.text;
		for (const span of node.templateSpans) {
			const v = staticText(span.expression);
			if (v === undefined) return undefined;
			s += v + span.literal.text;
		}
		return s;
	}
	return undefined;
}

/** Is `node` the target of a write (assignment of any kind, `delete`, `++`/`--`)? */
function isWriteTarget(node: ts.Node): boolean {
	const p = node.parent;
	if (!p) return false;
	if (ts.isBinaryExpression(p) && p.left === node && ASSIGNMENT_KINDS.has(p.operatorToken.kind)) return true;
	if (ts.isDeleteExpression(p)) return true;
	if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) &&
		(p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)) return true;
	return false;
}

/** `x.dataset.pressed` / `x.dataset['pressed']`; `x.ariaPressed` / `x['ariaPressed']` - by member name. */
function memberName(node: ts.Node): { name: string; owner: ts.Expression } | null {
	if (ts.isPropertyAccessExpression(node)) return { name: node.name.text, owner: node.expression };
	if (ts.isElementAccessExpression(node)) {
		const v = staticText(node.argumentExpression);
		if (v !== undefined) return { name: v, owner: node.expression };
	}
	return null;
}

function isDatasetOwner(owner: ts.Expression): boolean {
	const m = memberName(owner);
	return !!m && m.name === 'dataset';
}

/** Every write of aria-pressed / data-pressed (or its property-form twins) in `source`, one hit per line. */
function findPressedWrites(source: string, fileName = 'x.ts'): Hit[] {
	const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
	const lines = source.split('\n');
	const hits = new Map<number, Hit>();
	const add = (node: ts.Node): void => {
		const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
		let fn: string | null = null;
		for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
			if (ts.isFunctionDeclaration(p) && p.name) {
				fn = p.name.text;
				break;
			}
		}
		if (!hits.has(line)) hits.set(line, { line: line + 1, text: lines[line].trim(), fn });
	};
	const visit = (node: ts.Node): void => {
		// Names: any literal / folded expression whose value is a pressed attribute name (or `ariaPressed`),
		// except the first argument of a getAttribute / hasAttribute READ.
		const v = staticText(node);
		if (v !== undefined && (PRESSED_NAMES.has(v.toLowerCase()) || v === 'ariaPressed') && !(node.parent && staticText(node.parent) !== undefined)) {
			const p = node.parent;
			const isRead =
				!!p && ts.isCallExpression(p) && p.arguments[0] === node &&
				ts.isPropertyAccessExpression(p.expression) && ['getAttribute', 'hasAttribute'].includes(p.expression.name.text);
			if (!isRead) add(node);
		}
		// `ariaPressed` as an identifier key in an object literal / shorthand.
		if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) && ts.isIdentifier(node.name) && node.name.text === 'ariaPressed') add(node);
		// `Object.assign(el.dataset, { pressed: '' })`: a `pressed` key written into a dataset.
		if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
			const key = ts.isIdentifier(node.name) ? node.name.text : ts.isStringLiteralLike(node.name) ? node.name.text : undefined;
			const lit = node.parent;
			const call = lit && ts.isObjectLiteralExpression(lit) ? lit.parent : undefined;
			if (key === 'pressed' && call && ts.isCallExpression(call) && call.arguments[0] !== lit &&
				ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'assign' &&
				call.arguments[0] && isDatasetOwner(call.arguments[0])) add(node);
		}
		const m = memberName(node);
		if (m && isWriteTarget(node)) {
			if (m.name === 'ariaPressed') add(node);
			if (m.name === 'pressed' && isDatasetOwner(m.owner)) add(node);
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return [...hits.values()];
}

describe('SC-450: aria-pressed / data-pressed are written by ONE function', () => {
	const files = walk(SRC_DIR).map((f) => ({
		rel: path.relative(SRC_DIR, f).split(path.sep).join('/'),
		src: fs.readFileSync(f, 'utf8'),
	}));

	/** Hits in a file that are neither inside the writer function nor consumed by an allowlist entry. */
	function offendersOf(rel: string, src: string): { offenders: Hit[]; unused: string[] } {
		let hits = findPressedWrites(src, rel);
		if (rel === WRITER_MODULE) hits = hits.filter((h) => h.fn !== WRITER_FN);
		const remaining = new Map(ALLOWED.filter((a) => a.file === rel).map((a) => [a.line, a.count]));
		const offenders: Hit[] = [];
		for (const h of hits) {
			const left = remaining.get(h.text);
			if (left !== undefined && left > 0) remaining.set(h.text, left - 1);
			else offenders.push(h);
		}
		return { offenders, unused: [...remaining].filter(([, n]) => n > 0).map(([line, n]) => `${rel}: ${n} allowed write(s) of "${line}" no longer present`) };
	}

	test('no write exists in src/ outside setPressedState (iconButton.ts is scanned too), bar the allowlist', () => {
		const offenders: string[] = [];
		for (const { rel, src } of files) {
			const r = offendersOf(rel, src);
			if (r.offenders.length) {
				offenders.push(`${rel}:\n` + r.offenders.map((h) => `    line ${h.line}: ${h.text}`).join('\n'));
			}
		}
		expect(offenders).toEqual([]);
	});

	test('the allowlist carries no stale entry (each allowed line still occurs exactly its count)', () => {
		for (const a of ALLOWED) {
			const f = files.find((x) => x.rel === a.file);
			expect(f).toBeDefined();
			expect(offendersOf(a.file, f!.src).unused).toEqual([]);
			expect(findPressedWrites(f!.src, a.file).filter((h) => h.text === a.line)).toHaveLength(a.count);
		}
	});

	test('the writer function owns both attributes, and nothing else in its module writes', () => {
		const writer = files.find((x) => x.rel === WRITER_MODULE)!;
		const inFn = findPressedWrites(writer.src, WRITER_MODULE).filter((h) => h.fn === WRITER_FN);
		expect(inFn.map((h) => h.text).join('\n')).toMatch(/aria-pressed[\s\S]*data-pressed/);
		expect(offendersOf(WRITER_MODULE, writer.src).offenders).toEqual([]);
	});

	test('the scanner recognises every write shape and ignores reads, comments and selectors (can fail)', () => {
		const writes = [
			`chip.setAttribute('aria-pressed', String(on));`,
			`chip.setAttribute("aria-pressed", "true");`,
			`el.toggleAttribute('data-pressed', on);`,
			`el.removeAttribute('data-pressed');`,
			`parent.createEl('button', { attr: { 'aria-pressed': 'false' } });`,
			'el.setAttribute(`aria-pressed`, x);',
			`el.setAttribute('aria-' + 'pressed', x);`,
			`el.setAttribute('data-' + 'pressed', x);`,
			'el.setAttribute(`aria-${"pressed"}`, x);',
			`const NAME = 'aria-pressed'; el.setAttribute(NAME, x);`,
			`el.setAttribute('ARIA-PRESSED', 'true');`,
			`el.toggleAttribute('Data-Pressed', on);`,
			`Object.assign(el.dataset, { pressed: '' });`,
			`Object.assign(el.dataset, { 'pressed': '' });`,
			`el.dataset.pressed = '';`,
			`el.dataset['pressed'] = '';`,
			`delete el.dataset.pressed;`,
			`el.ariaPressed = 'true';`,
			`el.ariaPressed ??= 'true';`,
			`el.ariaPressed ||= 'true';`,
			`el.ariaPressed &&= 'true';`,
			`el['ariaPressed'] = 'true';`,
			`Object.assign(el, { ariaPressed: 'true' });`,
			`Object.assign(el, { 'ariaPressed': 'true' });`,
			`const u = 'http://x//y'; el.setAttribute('aria-pressed', x);`, // a ` //` in a string must not hide the write
		];
		// Every shape yields a hit.
		for (const s of writes) expect({ s, hit: findPressedWrites(s).length > 0 }).toEqual({ s, hit: true });

		const harmless = [
			`const on = chip.getAttribute('aria-pressed') === 'true';`,
			`if (chip.hasAttribute('data-pressed')) {}`,
			`root.querySelector('button[aria-pressed="true"]');`,
			`// chip.setAttribute('aria-pressed', 'true');`,
			`/* el.toggleAttribute('data-pressed', on); */`,
			`const ok = el.ariaPressed === 'true';`,
			`const p = el.dataset.pressed;`,
			`el.setAttribute('aria-label', 'x');`,
			`Object.assign(el.dataset, { other: '' });`,
			`Object.assign(el.style, { pressed: '' });`,
		];
		for (const s of harmless) expect({ s, n: findPressedWrites(s).length }).toEqual({ s, n: 0 });
	});

	test('an allowlist entry matches by line text: swapping an allowed write for a different bare write fails', () => {
		const view = files.find((x) => x.rel === 'elements/initiative/view.ts')!;
		const allowedLine = ALLOWED[0].line;
		// Remove one allowed span write, add a bare aria-pressed write in its place: the count of hits stays equal.
		const swapped = view.src.replace(allowedLine, `chip.setAttribute('aria-pressed', 'true');`);
		expect(swapped).not.toBe(view.src);
		const before = findPressedWrites(view.src, view.rel).length;
		expect(findPressedWrites(swapped, view.rel)).toHaveLength(before);
		const r = offendersOf(view.rel, swapped);
		expect(r.offenders.map((h) => h.text)).toEqual([`chip.setAttribute('aria-pressed', 'true');`]);
		expect(r.unused).not.toEqual([]);
	});
});
