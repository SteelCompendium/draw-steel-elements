// Plan 08 Task 4 (D2 §2.9) — kit/crest: the Steel-only heraldic shield (mirrors the
// site's .sc-crest). A decorative <span> holding a setIcon glyph. STEEL-ONLY: the
// Legacy base hides it via display:none so today's look is unchanged — the
// show-override ships with D3's [data-dse-theme="steel"] skin layer, not here.
// Degrades to nothing when no icon is given.
import * as fs from 'fs';
import * as path from 'path';
import { crest } from '../../../src/framework/kit/crest';

afterEach(() => {
	document.body.innerHTML = '';
});

describe('Plan 08 Task 4: kit/crest (D2 §2.9)', () => {
	describe('DOM', () => {
		test('renders a .dse-crest <span> holding the setIcon glyph', () => {
			const parent = document.createElement('div');
			const handle = crest(parent, { icon: 'swords' })!;

			expect(handle).not.toBeNull();
			expect(handle.rootEl).toBeInstanceOf(HTMLSpanElement);
			expect(handle.rootEl.hasClass('dse-crest')).toBe(true);
			expect(handle.rootEl.parentElement).toBe(parent);

			const glyph = handle.rootEl.querySelector<HTMLElement>('.dse-crest__glyph')!;
			expect(glyph).not.toBeNull();
			expect(glyph.getAttribute('data-icon')).toBe('swords'); // the mock setIcon stamp
		});

		test('is decorative ornament: aria-hidden, no role, not focusable', () => {
			const parent = document.createElement('div');
			const { rootEl } = crest(parent, { icon: 'swords' })!;
			expect(rootEl.getAttribute('aria-hidden')).toBe('true');
			expect(rootEl.hasAttribute('tabindex')).toBe(false);
		});

		test('size "lg" adds .dse-crest--lg; the default adds no size modifier', () => {
			const parent = document.createElement('div');
			const large = crest(parent, { icon: 'swords', size: 'lg' })!;
			expect(large.rootEl.hasClass('dse-crest--lg')).toBe(true);

			const plain = crest(parent, { icon: 'swords' })!;
			expect(plain.rootEl.hasClass('dse-crest--lg')).toBe(false);
		});

		test('degrades to NOTHING without an icon: returns null, renders no DOM', () => {
			const parent = document.createElement('div');
			expect(crest(parent, {})).toBeNull();
			expect(parent.childElementCount).toBe(0);
		});
	});

	describe('Steel-only CSS (styles-source.css)', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		// Strip comments (rule discussion mentions selectors) and anchor at line start
		// (`.dse-head > .dse-crest` would otherwise shadow the base rule).
		const rules = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
		const base = rules.match(/^\.dse-crest\s*\{([^}]*)\}/m);

		test('the Legacy BASE hides the crest: .dse-crest { display: none } (today unchanged)', () => {
			expect(base).not.toBeNull();
			expect(base![1]).toMatch(/display:\s*none/);
		});

		test('no premature show-override: this sheet ships NO theme-scoped .dse-crest display rule (D3 owns it)', () => {
			// The active theme id is already "steel" (DEFAULT_THEME_ID) while the Steel
			// SKIN layer doesn't exist until D3 — a [data-dse-theme="steel"] display
			// override here would flash bare glyphs today. It must ship WITH D3's layer.
			expect(rules).not.toMatch(/\[data-dse-theme[^\]]*\][^{]*\.dse-crest/);
		});

		test('the shield consumes the Steel ornament tokens (inert while hidden)', () => {
			expect(base![1]).toMatch(/var\(--dse-metal-grad\)/);
			expect(base![1]).toMatch(/clip-path:\s*var\(--dse-crest-shape\)/);
			expect(base![1]).toMatch(/var\(--dse-bevel\)/);
			expect(sheet).toMatch(/\.dse-crest::before\s*\{[^}]*var\(--dse-metal-line\)/);
		});
	});
});
