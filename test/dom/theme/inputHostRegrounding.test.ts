import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * SC-202 r1 — the input/stepper host re-grounding block (foot of styles-source.css,
 * right after the SC-203 button block it mirrors).
 *
 * The BEHAVIOUR is gated by `assertInputHostLeak` in visual-harness/shoot.mjs, which
 * injects the REAL, locally-extracted Obsidian app.css over the gallery's numeric/text
 * inputs and fails if any sampled property moves (rest + focus-visible, dark + light).
 * That gate self-skips when no local Obsidian asar is installed, so it cannot be
 * trusted as the ONLY protection for this block in every environment — these are
 * source-text contracts for the same reason the sibling `hostRegrounding.test.ts`
 * (SC-203) is: jsdom cascades no var(), computes no calc(), and lays out nothing, so
 * rule text is what is assertable here, and it runs everywhere the sweep cannot.
 */

const rawCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'styles-source.css'), 'utf8');
const blockStart = rawCss.indexOf('SC-202 r1 — INPUT/STEPPER HOST RE-GROUNDING');
const css = rawCss.slice(blockStart).replace(/\/\*[\s\S]*?\*\//g, '');
/** Whitespace-insensitive: the block wraps long selectors across lines. */
const flat = css.replace(/\s+/g, ' ');
const ANCHOR = ':is([data-dse-element], .dse-modal):not([data-dse-print="on"])';

// SC-191 fix round 3: the montage pair renamed from `.dse-mt__skill-input`/
// `.dse-mt__char-input` (the pre-SC-191 board's own record form, redesigned away in
// slice 2) to `.dse-mt__sheet-input`/`.dse-mt__sheet-rollchar` (the Log an action…
// sheet's Skill field / roll-characteristic field) — the rebase onto SC-202's tip
// left this list naming classes no `src/` call site emits any more; renamed rather
// than dropped, since the sheet's own two fields need exactly the same coverage the
// old board fields had (an "SC-202 integration delta", not a montage design change).
const COUSIN_INPUTS = [
	'.dse-init__malice-quickadd-amount',
	'.dse-init__malice-quickadd-label',
	'.dse-mt__sheet-input',
	'.dse-mt__sheet-rollchar',
	'.dse-party__award-input',
	'.dse-prj__roll-input',
	'.dse-prj__points-input',
	'.dse-prj__char-input',
];

test('the SC-202 r1 block is still in the sheet', () => {
	expect(blockStart).toBeGreaterThan(0);
});

describe('SC-202 r1 — GROUP 1: height + box-sizing, all nine input selectors', () => {
	const m = flat.match(
		new RegExp(escape(ANCHOR) + ' :where\\(([^)]*)\\) \\{([^}]*)\\}'),
	);

	test('the shared block exists and names all nine selectors', () => {
		expect(m).not.toBeNull();
		expect(m![1]).toContain('.dse-stepper__input');
		for (const sel of COUSIN_INPUTS) expect(m![1]).toContain(sel);
	});

	test('height is `auto` — never a pixel figure (same lesson as the SC-203 block)', () => {
		expect(m![2]).toContain('height: auto;');
		expect(m![2]).not.toMatch(/height:\s*\d/);
	});

	test('box-sizing is pinned to `content-box` — the UA default these boxes already render at', () => {
		// Obsidian's app.css carries a universal `* { box-sizing: border-box }` reset; without
		// this the height/width comparison keeps failing on every selector that does not
		// already declare its own box-sizing (proven by the can-fail sweep, see the round's
		// report). `content-box` restates today's value, so it moves no pixel on its own.
		expect(m![2]).toContain('box-sizing: content-box;');
	});
});

describe('SC-202 r1 — GROUP 2: the material Obsidian was winning on', () => {
	test("`.dse-stepper__input` restates its own kit-base declarations verbatim", () => {
		const g = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(\\.dse-stepper__input\\) \\{([^}]*)\\}'));
		expect(g).not.toBeNull();
		for (const decl of [
			'padding: 0.25em;',
			'color: var(--dse-fg);',
			'background: var(--dse-surface-sunken);',
			'border: 1px solid var(--dse-border);',
			'border-radius: var(--dse-radius);',
		]) {
			expect(g![1]).toContain(decl);
		}
	});

	test('the malice quick-add pair gets the same plain-field material every sibling input has', () => {
		const g = flat.match(
			new RegExp(
				escape(ANCHOR) +
					' :where\\(\\.dse-init__malice-quickadd-amount, \\.dse-init__malice-quickadd-label\\) \\{([^}]*)\\}',
			),
		);
		expect(g).not.toBeNull();
		for (const decl of [
			'padding: 0.25em 0.4em;',
			'color: var(--dse-fg);',
			'background: var(--dse-surface);',
			'border: 1px solid var(--dse-border);',
			'border-radius: var(--dse-radius);',
		]) {
			expect(g![1]).toContain(decl);
		}
	});
});

describe('SC-202 r1 — GROUP 3: focus-visible border-color + box-shadow', () => {
	test('`:focus-visible` sits OUTSIDE `:where()` — the third class the state needs', () => {
		// :where() contributes zero specificity; Obsidian's border-color/box-shadow rules at
		// :active/:focus/:focus-visible are (0,0,2,1) and a (0,0,2,0) challenger loses the
		// class-count tie on the type-selector tiebreak — exactly why the shared kit
		// focus-ring rule (outline only) survives while a bare :where()-wrapped box-shadow
		// would not. Appending `:focus-visible` to the compound, not inside :where(), reaches
		// (0,0,3,0), which wins outright.
		// Fix round (HIGH-3): three rules now, not two — `.dse-condal__input` gets its own
		// (box-shadow only; its border stays `none`, so a border-color restatement would be
		// cosmetically inert there).
		const rules = [...flat.matchAll(new RegExp(escape(ANCHOR) + ' :where\\(([^)]*)\\):focus-visible \\{([^}]*)\\}', 'g'))];
		expect(rules.length).toBe(3);
		const allSubjects = rules.map((r) => r[1]).join(', ');
		expect(allSubjects).toContain('.dse-stepper__input');
		for (const sel of COUSIN_INPUTS) expect(allSubjects).toContain(sel);
		expect(allSubjects).toContain('.dse-condal__input');
		for (const r of rules) expect(r[2]).toContain('box-shadow: none;');
		const nonCondal = rules.filter((r) => !r[1].includes('.dse-condal__input'));
		expect(nonCondal.length).toBe(2);
		for (const r of nonCondal) expect(r[2]).toContain('border-color: var(--dse-border);');
	});
});

describe('SC-202 r1 fix round (HIGH-1) — GROUP 4: :hover:not(:disabled)', () => {
	test('the stepper entry excludes counter, the cousins restate their own rest fill', () => {
		// Counter's own compound (input.dse-counter__value) is (0,0,3,1) — lower than GROUP
		// 4's (0,0,4,0) for the first time in this block — so without the exclusion GROUP 4
		// would repaint counter's deliberately chrome-stripped look with a hover fill.
		const stepperRule = flat.match(
			new RegExp(escape(ANCHOR) + ' :where\\(\\.dse-stepper__input:not\\(\\.dse-counter__value\\)\\):hover:not\\(:disabled\\) \\{([^}]*)\\}'),
		);
		expect(stepperRule).not.toBeNull();
		expect(stepperRule![1]).toContain('background: var(--dse-surface-sunken);');
		expect(stepperRule![1]).toContain('border-color: var(--dse-border);');

		const cousinsRule = flat.match(
			new RegExp(escape(ANCHOR) + ' :where\\(([^)]*)\\):hover:not\\(:disabled\\) \\{([^}]*)\\}', 'g'),
		);
		expect(cousinsRule).not.toBeNull();
	});

	test('`.dse-condal__input` restates `background: none` on hover, not the Steel surface', () => {
		const g = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(\\.dse-condal__input\\):hover:not\\(:disabled\\) \\{([^}]*)\\}'));
		expect(g).not.toBeNull();
		expect(g![1]).toContain('background: none;');
	});
});

describe('SC-202 r1 fix round (HIGH-2, MED-1) — :disabled and ::placeholder, all twelve', () => {
	test(':disabled restates opacity:1 and cursor:default at (0,0,3,0)', () => {
		const g = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(([^)]*)\\):disabled \\{([^}]*)\\}'));
		expect(g).not.toBeNull();
		expect(g![1]).toContain('.dse-stepper__input');
		expect(g![1]).toContain('.dse-sedit__apply-input');
		expect(g![1]).toContain('.dse-condal__input');
		expect(g![1]).toContain('.dse-form__raw');
		expect(g![2]).toContain('opacity: 1;');
		expect(g![2]).toContain('cursor: default;');
	});

	test('::placeholder restates color to a Steel muted-ink token, all twelve selectors', () => {
		const g = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(([^)]*)\\)::placeholder \\{([^}]*)\\}'));
		expect(g).not.toBeNull();
		expect(g![1]).toContain('.dse-stepper__input');
		expect(g![1]).toContain('.dse-form__raw');
		expect(g![2]).toContain('color: var(--dse-fg-muted);');
	});
});

describe('SC-202 r1 fix round (HIGH-3) — the three modal-only controls get GROUP 2 material', () => {
	test('`.dse-sedit__apply-input` gets the plain-field look', () => {
		const g = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(\\.dse-sedit__apply-input\\) \\{([^}]*)\\}'));
		expect(g).not.toBeNull();
		for (const decl of ['background: var(--dse-surface);', 'border: 1px solid var(--dse-border);', 'caret-color: var(--dse-fg);']) {
			expect(g![1]).toContain(decl);
		}
	});

	test('`.dse-condal__input` restates its own chromeless design, not the Steel field look', () => {
		const g = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(\\.dse-condal__input\\) \\{([^}]*)\\}'));
		expect(g).not.toBeNull();
		for (const decl of ['border: none;', 'background: none;', 'font: inherit;', 'border-radius: 0;']) {
			expect(g![1]).toContain(decl);
		}
		// MED-A (fix round 2, re-review): this rule must NOT restate `outline: none` — it
		// used to, at the same (0,0,2,0) as the shared kit focus-ring rule's
		// `.dse-condal__input:focus-visible`, and being declared ~1,550 lines later, silently
		// killed the ring on a source-order tie. See the dedicated guard test below, which
		// checks this for every selector the ring names, not just condal.
		expect(g![1]).not.toContain('outline: none;');
	});

	test('`.dse-form__raw` gets the modal-section field material, and stays OUT of GROUP 1', () => {
		const g = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(\\.dse-form__raw\\) \\{([^}]*)\\}'));
		expect(g).not.toBeNull();
		expect(g![1]).toContain('background: var(--dse-surface);');
		// GROUP 1's :where() list must NOT name it — its own box-sizing:border-box would
		// fight, not restate, a GROUP-1 `content-box`.
		const group1 = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(([^)]*)\\) \\{ height: auto;'));
		expect(group1).not.toBeNull();
		expect(group1![1]).not.toContain('.dse-form__raw');
	});
});

describe('SC-202 r1 — the counter stepper input keeps its own higher-specificity rule', () => {
	test('`input.dse-counter__value` restates border-radius and box-shadow, not just height', () => {
		const counterBlock = rawCss
			.slice(rawCss.indexOf("input.dse-counter__value {"))
			.split('}')[0];
		expect(counterBlock).toContain('border-radius: 0;');
		expect(counterBlock).toContain('box-shadow: none;');
		// The pre-existing "strip the field chrome" declarations must still be there —
		// this round adds to that rule, it does not replace it.
		expect(counterBlock).toContain('border: none;');
		expect(counterBlock).toContain('background: transparent;');
	});
});

describe('SC-202 r1 — the eight cousins join the Controls font slot and the shared focus ring', () => {
	test('font-family AND font-size (SC-185 twin) both widen to the eight cousins', () => {
		for (const decl of ['font-family: var(--dse-font-controls);', 'font-size: var(--dse-fs-control);']) {
			const idx = rawCss.indexOf(decl);
			expect(idx).toBeGreaterThan(0);
			// The selector LIST immediately preceding the declaration block is what matters —
			// walk back to the nearest '}' (the end of the previous rule) and check every
			// cousin appears in between.
			const priorRuleEnd = rawCss.lastIndexOf('}', idx);
			const selectorList = rawCss.slice(priorRuleEnd, idx);
			for (const sel of COUSIN_INPUTS) expect(selectorList).toContain(sel);
		}
	});

	test('the shared kit focus-ring rule (outline) now names all eight cousins too', () => {
		const ringStart = rawCss.indexOf('.dse-btn:focus-visible,');
		const ringBlock = rawCss.slice(ringStart, rawCss.indexOf('outline: 2px solid var(--dse-focus-ring);', ringStart));
		for (const sel of COUSIN_INPUTS) {
			expect(ringBlock).toContain(`${sel}:focus-visible,`);
		}
	});
});

describe('SC-202 r1 fix round 2 (MED-A) — no re-grounding rule kills the shared focus ring', () => {
	test('no `:where(...)` rule in this block declares `outline: none` for a selector the shared kit ring also names', () => {
		// MED-A, re-review: `.dse-condal__input`'s own GROUP-2 rule used to restate
		// `outline: none` at the same (0,0,2,0) as the shared kit ring's own
		// `.dse-condal__input:focus-visible` rule (~:12072/12091) — a genuine specificity
		// tie, broken by SOURCE ORDER in the LATER rule's favour, silently killing a focus
		// indicator the round's own report claimed the control had gained. This is the
		// general guard the prescribed fix asked for: it would have failed on that
		// regression, and fails on any future selector that repeats it.
		const ringStart = rawCss.indexOf('.dse-btn:focus-visible,');
		const ringBlock = rawCss.slice(ringStart, rawCss.indexOf('outline: 2px solid var(--dse-focus-ring);', ringStart));
		const ringedSelectors = [...ringBlock.matchAll(/(\.dse-[\w-]+):focus-visible,/g)].map((m) => m[1]);
		// The whole input family (stepper + 8 cousins + 3 modal controls) plus the
		// non-input controls (buttons, tabs, etc.) the same rule already covered.
		expect(ringedSelectors.length).toBeGreaterThanOrEqual(12);

		const rules = [...flat.matchAll(/:where\(([^)]*)\)[^{]*\{([^}]*)\}/g)];
		expect(rules.length).toBeGreaterThan(0);
		for (const [, subjects, decls] of rules) {
			if (!decls.includes('outline: none')) continue;
			for (const sel of ringedSelectors) expect(subjects).not.toContain(sel);
		}
	});
});

function escape(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
