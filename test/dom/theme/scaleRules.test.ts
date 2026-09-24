import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * The SC-112 Task 7 size-scale CONSUMER contract (source-text, like its siblings
 * steelTypography.test.ts / steelMaterial.test.ts — jsdom cannot cascade var()
 * or compute calc(), so this suite pins the RULE TEXT of styles-source.css):
 *
 *  - the TEXT rule (`font-size: calc(1em * var(--dse-text-scale))`) exists as
 *    THREE SEPARATE rules (SC-230 r3, MEDIUM-1/-2/LOW-1 — never one `.dse-modal`
 *    arm plus a shared `:is(...)`, which let `.dse-modal` and the body/footer
 *    arms compound to scale² whenever Obsidian's own `.modal-content` reset is
 *    absent): the bare pre-SC-230 element-root rule; a modal rule anchored on
 *    `.dse-modal` as a pure print-guard (never itself scaled) targeting
 *    `.dse-modal__body`/`.dse-modal__footer`; and a modal-title rule anchored the
 *    same way targeting `.dse-modal__title-text` (a span `setDseTitle()` wraps
 *    the title text in, so Obsidian's own version-dependent `.modal-title`
 *    absolute size is multiplied via inherited `1em`, never hardcoded) — all
 *    three print-excluded, all three anchored on the actual node that would be
 *    stamped, never a bare descendant `:not(...)` (FOLLOWUPS #43);
 *  - the CARD rule (`zoom: var(--dse-card-scale)`) exists on the card hosts
 *    (.dse-sb/.dse-card descendants + the feature/featureblock root-compound)
 *    and is print-excluded;
 *  - BOTH nested resets exist (a nested element root resets font-size to
 *    var(--dse-fs-body), the role-scale token for "1em" since SC-185 round 2; a
 *    card host under a second element root resets zoom to 1) and are
 *    source-ordered AFTER their scale rule — a referenced card (by-SCC kit
 *    mounting a real nested feature) scales exactly once, like the site's
 *    zoom-one-wrapper rule (v2 extra.css:61).
 *
 * Comments are text (the section prose names these very selectors), so every
 * match runs against a comment-stripped copy of the file.
 */

const rawCss = fs.readFileSync(
	path.join(__dirname, '..', '..', '..', 'styles-source.css'),
	'utf8',
);
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
	selector: string;
	body: string;
	/** Character offset in the stripped file — for source-order assertions. */
	at: number;
}

const rules: Rule[] = (() => {
	const out: Rule[] = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(css))) out.push({ selector: m[1].trim(), body: m[2], at: m.index });
	return out;
})();

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const PRINT_GUARD = ':not([data-dse-print="on"])';

function only(predicate: (r: Rule) => boolean, what: string): Rule {
	const hits = rules.filter(predicate);
	if (hits.length !== 1) {
		throw new Error(`expected exactly one ${what}, found ${hits.length}`);
	}
	return hits[0];
}

const TEXT_SCALE_BODY = 'font-size: calc(1em * var(--dse-text-scale))';
const TEXT_SCALE_HOSTS = '[data-dse-element], .dse-modal, .dse-modal__body, .dse-modal__footer';

/** The three rules that consume --dse-text-scale, found by EXACT selector text
 *  (their bodies are all identical, so `only()`-by-body no longer disambiguates
 *  them — SC-230 r3 split one `.dse-modal`-inclusive rule into three). */
const elementRootRule = only(
	(r) => norm(r.selector) === `[data-dse-element]${PRINT_GUARD}` && norm(r.body).includes(TEXT_SCALE_BODY),
	'bare element-root text-scale rule',
);
const modalBodyFooterRule = only(
	(r) =>
		norm(r.selector) === `.dse-modal${PRINT_GUARD} :is(.dse-modal__body, .dse-modal__footer)` &&
		norm(r.body).includes(TEXT_SCALE_BODY),
	'modal body/footer text-scale rule',
);
const modalTitleRule = only(
	(r) =>
		norm(r.selector) === `.dse-modal${PRINT_GUARD} .dse-modal__title-text` &&
		norm(r.body).includes(TEXT_SCALE_BODY),
	'modal title text-scale rule',
);
const zoomRule = only(
	(r) => r.body.includes('var(--dse-card-scale)'),
	'rule consuming var(--dse-card-scale)',
);

describe('SC-112 Task 7 / SC-230 r3: text-scale consumer', () => {
	// SC-230: modals track the text-size scale exactly as rendered blocks in notes
	// do (owner ruling). r3 (MEDIUM-1/-2): `.dse-modal` is NEVER itself in a
	// font-size arm — it is only ever the print-anchor GUARD (compounded via
	// `:not(...)` on the SAME node a stamp would land on, the FOLLOWUPS #43 shape
	// the owner ruling requires) — because scaling `.dse-modal` directly, on top
	// of also scaling its body/footer, compounds to scale² whenever Obsidian's own
	// `.modal-content` absolute-font-size reset is absent (a theme/snippet, or a
	// future Obsidian).
	test('the bare element-root rule is UNCHANGED from pre-SC-230 (never merged with the modal arm)', () => {
		expect(norm(elementRootRule.selector)).toBe(`[data-dse-element]${PRINT_GUARD}`);
	});

	test('the modal body/footer rule anchors the print guard on .dse-modal, never scales .dse-modal itself', () => {
		const sel = norm(modalBodyFooterRule.selector);
		expect(sel).toBe(`.dse-modal${PRINT_GUARD} :is(.dse-modal__body, .dse-modal__footer)`);
		// .dse-modal appears only as the ancestor/guard, never as a bare compound
		// subject of its own (that shape is the r1 mistake this round fixes).
		expect(sel).not.toMatch(/^:is\(.*\.dse-modal.*\)/);
	});

	test('the modal title rule anchors the same way, targets the wrapped title span, not .modal-title itself', () => {
		expect(norm(modalTitleRule.selector)).toBe(`.dse-modal${PRINT_GUARD} .dse-modal__title-text`);
	});

	test('the nested-root reset exists (font-size: var(--dse-fs-body)), covers every host form, print-guarded, ordered AFTER every scale rule', () => {
		const expectedSel = `:is(${TEXT_SCALE_HOSTS}) [data-dse-element]${PRINT_GUARD}`;
		const reset = only(
			(r) => norm(r.selector) === expectedSel && norm(r.body).includes('font-size: var(--dse-fs-body)'),
			'nested element-root font-size reset',
		);
		// A nested element root under any of the four hosts (.dse-modal kept here
		// per the reviewer's prescribed shape, even though it no longer carries the
		// multiplier itself above) resets to plain inheritance — no 1.4 × 1.4
		// compounding when a modal ever hosts a nested element root.
		expect(norm(reset.selector)).toBe(expectedSel);
		expect(reset.at).toBeGreaterThan(elementRootRule.at);
		expect(reset.at).toBeGreaterThan(modalBodyFooterRule.at);
		expect(reset.at).toBeGreaterThan(modalTitleRule.at);
	});

	// SC-230 r3, MEDIUM-2: a DOM-level assertion (real selector matching via
	// Element.matches — jsdom supports selector matching even though it can't
	// compute calc()/var() VALUES) that a print-stamped `.dse-modal` actually
	// excludes its body/footer/title arms, proving the guard is anchored on the
	// node that would really be stamped, not on the always-unstamped descendants
	// (the FOLLOWUPS #43 shape).
	describe('the print guard is anchored on .dse-modal itself (MEDIUM-2), not on always-unstamped descendants', () => {
		function buildModalDom(printStamped: boolean): { body: HTMLElement; footer: HTMLElement; titleText: HTMLElement } {
			const modal = document.createElement('div');
			modal.className = 'dse-modal';
			if (printStamped) modal.setAttribute('data-dse-print', 'on');
			const body = document.createElement('div');
			body.className = 'dse-modal__body';
			const footer = document.createElement('div');
			footer.className = 'dse-modal__footer';
			const title = document.createElement('div');
			title.className = 'dse-modal__title';
			const titleText = document.createElement('span');
			titleText.className = 'dse-modal__title-text';
			title.appendChild(titleText);
			modal.append(body, footer, title);
			document.body.appendChild(modal);
			return { body, footer, titleText };
		}

		afterEach(() => {
			document.body.innerHTML = '';
		});

		test('unstamped .dse-modal: body/footer/title all MATCH their scale-rule selectors', () => {
			const { body, footer, titleText } = buildModalDom(false);
			expect(body.matches(norm(modalBodyFooterRule.selector))).toBe(true);
			expect(footer.matches(norm(modalBodyFooterRule.selector))).toBe(true);
			expect(titleText.matches(norm(modalTitleRule.selector))).toBe(true);
		});

		test('print-stamped .dse-modal[data-dse-print="on"]: body/footer/title all STOP matching (the guard fires on the real stamped node)', () => {
			const { body, footer, titleText } = buildModalDom(true);
			expect(body.matches(norm(modalBodyFooterRule.selector))).toBe(false);
			expect(footer.matches(norm(modalBodyFooterRule.selector))).toBe(false);
			expect(titleText.matches(norm(modalTitleRule.selector))).toBe(false);
		});
	});
});

describe('SC-112 Task 7: card-scale consumer', () => {
	test('the card hosts zoom by the token, print-excluded on every arm', () => {
		expect(norm(zoomRule.body)).toContain('zoom: var(--dse-card-scale)');
		const sel = norm(zoomRule.selector);
		// Arm 1: .dse-sb/.dse-card descendants of an element root or modal.
		expect(sel).toContain(`:is([data-dse-element], .dse-modal)${PRINT_GUARD} :is(.dse-sb, .dse-card)`);
		// Arm 2: the feature/featureblock ROOT-compound (Task 4's card-host set).
		expect(sel).toMatch(/:not\(\[data-dse-print="on"\]\):is\(\s*\[data-dse-element='feature'\],\s*\[data-dse-element='featureblock'\]\s*\):not\(\[data-dse-error-stage\]\)/);
	});

	test('the nested reset exists (zoom: 1) covering BOTH host forms, ordered AFTER', () => {
		const reset = only(
			(r) => norm(r.body).includes('zoom: 1'),
			'nested card-host zoom reset',
		);
		const sel = norm(reset.selector);
		// A card host under a SECOND element root…
		expect(sel).toContain(`[data-dse-element] [data-dse-element]${PRINT_GUARD} :is(.dse-sb, .dse-card)`);
		// …and a feature/featureblock root nested inside another element root.
		expect(sel).toMatch(/\[data-dse-element\]\s+:is\(\s*\[data-dse-element='feature'\],\s*\[data-dse-element='featureblock'\]\s*\):not\(\[data-dse-print="on"\]\)/);
		expect(reset.at).toBeGreaterThan(zoomRule.at);
	});
});

describe('SC-112 Task 7: the :root defaults are the inert 1', () => {
	test('--dse-text-scale / --dse-card-scale default to 1 in the Legacy base', () => {
		const roots = css.match(/:root\s*\{[^}]*\}/g)?.join('\n') ?? '';
		expect(roots).toMatch(/--dse-text-scale:\s*1;/);
		expect(roots).toMatch(/--dse-card-scale:\s*1;/);
	});
});
