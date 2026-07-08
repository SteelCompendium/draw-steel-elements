// Plan 08 Task 4 (D2 §2.7) — kit/cardHead: the 6-slot header grid. Ports DESIGN.md's
// unified .sc-head (3-lane × 2-column) so statblock / featureblock / feature /
// negotiation share ONE header grammar: left eyebrow/primary(name)/deck stacked,
// right column mirrored. The name is the card's heading (role="heading" +
// aria-level); any omitted slot collapses to a gap — NEVER a mislabeled placeholder.
//
// Also hosts the Task-4 kit hygiene guard (reconciled by Plan 09 Task 0): the three
// kit files must contain no inline COLOR and no color literal (D2 §5 — tokens only);
// el.style.setProperty('--dse-*', …) dynamic geometry is allowed (see ./styleGuard.ts).
import * as fs from 'fs';
import * as path from 'path';
import { cardHead } from '../../../src/framework/kit/cardHead';
import { styleGuardFindings } from './styleGuard';

const ALL_SLOTS = {
	leftEyebrow: 'Ability',
	name: 'Gouge',
	leftDeck: 'Fury · Berserker',
	rightEyebrow: 'Level 1',
	rightPrimary: 'Signature',
	rightDeck: 'Main Action',
};

function mount(opts: Record<string, unknown>) {
	const parent = document.createElement('div');
	document.body.appendChild(parent);
	const handle = cardHead(parent, opts as any);
	return { parent, handle };
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('Plan 08 Task 4: kit/cardHead (D2 §2.7)', () => {
	describe('the 6-slot grid — each provided field lands in ITS slot', () => {
		test('root is .dse-head and every slot carries lane + side classes', () => {
			const { handle } = mount(ALL_SLOTS);
			expect(handle.rootEl.hasClass('dse-head')).toBe(true);

			const bySlot: Array<[string, string]> = [
				['.dse-head__eyebrow--left', 'Ability'],
				['.dse-head__primary--left', 'Gouge'],
				['.dse-head__deck--left', 'Fury · Berserker'],
				['.dse-head__eyebrow--right', 'Level 1'],
				['.dse-head__primary--right', 'Signature'],
				['.dse-head__deck--right', 'Main Action'],
			];
			for (const [selector, text] of bySlot) {
				const el = handle.rootEl.querySelector<HTMLElement>(selector);
				expect(el).not.toBeNull();
				expect(el!.textContent).toBe(text);
			}
			// Lane base classes are present too (styling shared across both sides).
			expect(handle.rootEl.querySelectorAll('.dse-head__eyebrow')).toHaveLength(2);
			expect(handle.rootEl.querySelectorAll('.dse-head__primary')).toHaveLength(2);
			expect(handle.rootEl.querySelectorAll('.dse-head__deck')).toHaveLength(2);
		});

		test('render-style defaults: left column = --line, right column = --chip (§2.7)', () => {
			const { handle } = mount(ALL_SLOTS);
			for (const sel of ['.dse-head__eyebrow--left', '.dse-head__primary--left', '.dse-head__deck--left']) {
				const el = handle.rootEl.querySelector<HTMLElement>(sel)!;
				expect(el.className).toMatch(/--line\b/);
				expect(el.className).not.toMatch(/--chip\b/);
			}
			for (const sel of ['.dse-head__eyebrow--right', '.dse-head__primary--right', '.dse-head__deck--right']) {
				const el = handle.rootEl.querySelector<HTMLElement>(sel)!;
				expect(el.className).toMatch(/--chip\b/);
				expect(el.className).not.toMatch(/--line\b/);
			}
		});

		test('the handle exposes rootEl, nameEl, and only the PROVIDED slots', () => {
			const { handle } = mount({ name: 'Gouge', rightDeck: 'Main Action' });
			expect(handle.nameEl.textContent).toBe('Gouge');
			expect(handle.nameEl).toBe(handle.rootEl.querySelector('.dse-head__primary--left'));
			expect(Object.keys(handle.slots).sort()).toEqual(['name', 'rightDeck']);
			expect(handle.slots.rightDeck!.textContent).toBe('Main Action');
		});
	});

	describe('name = the card heading (§2.7 a11y)', () => {
		test('name renders role="heading" with the default aria-level 3', () => {
			const { handle } = mount({ name: 'Gouge' });
			expect(handle.nameEl.getAttribute('role')).toBe('heading');
			expect(handle.nameEl.getAttribute('aria-level')).toBe('3');
		});

		test('a `level` opt overrides the aria-level (nesting-appropriate)', () => {
			const { handle } = mount({ name: 'Gouge', level: 2 });
			expect(handle.nameEl.getAttribute('aria-level')).toBe('2');
		});

		test('the heading is NOT a control (no button, no tabindex)', () => {
			const { handle } = mount(ALL_SLOTS);
			expect(handle.nameEl.tagName).not.toBe('BUTTON');
			expect(handle.nameEl.hasAttribute('tabindex')).toBe(false);
		});
	});

	describe('omitted slots collapse to a GAP — never a mislabeled placeholder', () => {
		test('name-only mount renders exactly ONE slot element and nothing else', () => {
			const { handle } = mount({ name: 'Gouge' });
			for (const sel of [
				'.dse-head__eyebrow--left',
				'.dse-head__deck--left',
				'.dse-head__eyebrow--right',
				'.dse-head__primary--right',
				'.dse-head__deck--right',
			]) {
				expect(handle.rootEl.querySelector(sel)).toBeNull();
			}
			expect(handle.rootEl.children).toHaveLength(1); // the name, nothing more
			expect(handle.rootEl.textContent).toBe('Gouge'); // no placeholder text anywhere
		});

		test('a sparse fill renders only its own slots (right rail without left deck)', () => {
			const { handle } = mount({ name: 'Cleave', rightEyebrow: 'Level 2', rightDeck: '5 Rage' });
			expect(handle.rootEl.querySelector('.dse-head__eyebrow--right')!.textContent).toBe('Level 2');
			expect(handle.rootEl.querySelector('.dse-head__deck--right')!.textContent).toBe('5 Rage');
			expect(handle.rootEl.querySelector('.dse-head__deck--left')).toBeNull();
			expect(handle.rootEl.querySelector('.dse-head__primary--right')).toBeNull();
		});
	});

	describe('crest embedding (§2.7 → §2.9)', () => {
		test('crest opt embeds a .dse-crest with the setIcon glyph as a DIRECT child of the grid', () => {
			const { handle } = mount({ ...ALL_SLOTS, crest: { icon: 'sword' } });
			const crestEl = handle.rootEl.querySelector<HTMLElement>(':scope > .dse-crest');
			expect(crestEl).not.toBeNull();
			expect(crestEl!.querySelector('.dse-crest__glyph[data-icon="sword"]')).not.toBeNull();
		});

		test('no crest opt → no .dse-crest (a gap, like any omitted slot)', () => {
			const { handle } = mount(ALL_SLOTS);
			expect(handle.rootEl.querySelector('.dse-crest')).toBeNull();
		});

		test('a crest opt WITHOUT an icon degrades to nothing (§2.9)', () => {
			const { handle } = mount({ name: 'Gouge', crest: {} });
			expect(handle.rootEl.querySelector('.dse-crest')).toBeNull();
		});
	});

	describe('grid CSS contract (styles-source.css)', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

		test('.dse-head is a 3-column grid with three explicit lane rows', () => {
			// Anchor to the base rule at a line start: a grouped selector line
			// (".dse-x,\n.dse-head { … }") or a compound (".dse-head__x { … }",
			// ".dse-head > … {") must not be picked up positionally — we want the
			// standalone `.dse-head { … }` rule.
			const block = sheet.match(/^\.dse-head\s*\{([^}]*)\}/m);
			expect(block).not.toBeNull();
			expect(block![1]).toMatch(/display:\s*grid/);
			expect(block![1]).toMatch(/grid-template-columns:/);
			expect(block![1]).toMatch(/grid-template-rows:/);
		});

		test('every slot has an explicit grid-area (lanes are ROWS — omitted slots stay a gap)', () => {
			for (const slot of [
				'eyebrow--left',
				'primary--left',
				'deck--left',
				'eyebrow--right',
				'primary--right',
				'deck--right',
			]) {
				expect(sheet).toMatch(new RegExp(`\\.dse-head__${slot}[^{]*\\{[^}]*grid-area:`));
			}
		});
	});
});

describe('Plan 08 Task 4: kit hygiene guard (D2 §5 — no inline color, tokens only)', () => {
	const kitDir = path.join(__dirname, '../../../src/framework/kit');
	const taskFiles = ['cardHead.ts', 'powerRollPanel.ts', 'crest.ts'];

	test.each(taskFiles)('%s: inline color banned; --dse-* geometry setProperty allowed', (file) => {
		const src = fs.readFileSync(path.join(kitDir, file), 'utf8');
		// The reconciled SC-5 rule (Plan 09 Task 0): inline COLOR + color literals are
		// banned, but the D2 Global Constraint's dynamic-geometry escape hatch —
		// el.style.setProperty('--dse-*', …) — is allowed. See ./styleGuard.ts.
		expect(styleGuardFindings(src)).toEqual([]);
	});

	// Proof the reconciled guard discriminates (Plan 09 Task 0) — the geometry escape
	// hatch passes, everything the old blanket /\.style\b/ guard meant to stop still fails.
	describe('the reconciled guard (styleGuardFindings) discriminates', () => {
		test("ALLOWS setProperty('--dse-*', …) dynamic geometry", () => {
			expect(styleGuardFindings("el.style.setProperty('--dse-fill', '50%');")).toEqual([]);
			expect(
				styleGuardFindings('el.style.setProperty("--dse-value-scale", String(v));'),
			).toEqual([]);
		});

		test('still BANS inline color, color literals, and non-geometry .style access', () => {
			expect(styleGuardFindings("el.style.color = 'red';")).not.toEqual([]);
			expect(styleGuardFindings('const c = "#ff0000";')).not.toEqual([]);
			expect(styleGuardFindings('el.style.setProperty("--not-dse", "x");')).not.toEqual([]);
			expect(styleGuardFindings("el.style.display = 'none';")).not.toEqual([]);
		});
	});

	test.each(taskFiles)('%s does not import elements or the Obsidian app surface (kit⊥elements)', (file) => {
		const src = fs.readFileSync(path.join(kitDir, file), 'utf8');
		expect(src).not.toMatch(/from\s+['"].*\/elements\//);
		expect(src).not.toMatch(/\bMarkdownRenderer\b/); // md renders via the renderMd callback
	});
});
