// SC-169 — the standard element menu panel + whole-element collapse.
//
// Five contracts are pinned here, in the order a reviewer would want to check them:
//   1. OPT-IN. A definition without the `chrome` slot emits ZERO extra DOM and no
//      attributes — the property that lets this land on three elements without touching
//      the other 30-odd, and the property the print freeze depends on.
//   2. PANEL SHAPE. Icon-only buttons, collapse/expand ALWAYS rightmost (the anchor the
//      panel grows leftward from), the edit pencil gated by `authoringControls` and
//      rendered as a panel item rather than a card-corner button.
//   3. COLLAPSE. Two layers: the reserved `collapsed:` YAML key (authored default) and
//      the SessionStore toggle — which must survive a re-mount and must NEVER write the
//      note. The collapsed line is `label: name (detail)`, recomputed at collapse time.
//   4. ROUND-TRIP. A persisted element's write-back re-emits `collapsed:`, and does NOT
//      double it for a serializer that splices raw text back (ds-hero).
//   5. PRINT ABSENCE, as a CSS-text gate. Every `.dse-chrome*` rule in styles-source.css
//      is either the unscoped `display: none` base or carries the print exclusion, so the
//      panel cannot appear on paper in either the desktop or the mobile mode. This is the
//      cheap standing version of what `check-freeze.sh` proves in bytes.
import { describe, it, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementPipelineDeps } from '@/framework/pipeline';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { statblockElement } from '@/elements/statblock/definition';
import { staminaBarElement } from '@/elements/stamina-bar/definition';
import { heroElement } from '@/elements/hero/definition';
import { counterElement } from '@/elements/counter/definition';
import { setChromeMobileOverride, CHROME_COLLAPSE_SLOT } from '@/framework/chrome';
import { extractCollapsedDefault, withCollapsedDefault } from '@/framework/chrome/collapsedKey';
import { makeCompendiumDeps } from '../elements/_refHarness';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';

/** `_refHarness` builds a bare ValidationService; ds-stamina's schema `$ref`s the shared
 *  component-wrapper dependency schema, which only main.ts's onload registers. Same
 *  seeding every other suite that renders a wrapper-schema'd element does. */
function makeDeps(): ElementPipelineDeps {
	const { deps } = makeCompendiumDeps();
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) {
		deps.validation.addDependencySchema(id, schema);
	}
	return deps;
}

const STATBLOCK_BODY = 'type: statblock\nname: Bare Creature\nstamina: "10"\n';
const STAMINA_BODY = 'max_stamina: 48\ncurrent_stamina: 31\ntemp_stamina: 0\n';
const HERO_BODY = [
	'name: Torin Stonefist',
	'level: 3',
	'characteristics: { might: 2, agility: 1, reason: 0, intuition: 1, presence: -1 }',
	'max_stamina: 48',
	'',
].join('\n');

function makeHost(language: string, overrides: Partial<BlockHost> = {}) {
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language, lineStart: 0, lineEnd: 1 }),
		replaceSource: async () => true,
		blockKey: () => `Note.md::${language}::0`,
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement };
}

async function render(
	def: Parameters<ElementPipeline['run']>[0],
	body: string,
	language: string,
	opts: { deps?: ElementPipelineDeps; host?: BlockHost & { containerEl: HTMLElement } } = {},
): Promise<{ root: HTMLElement; deps: ElementPipelineDeps; host: BlockHost & { containerEl: HTMLElement } }> {
	const deps = opts.deps ?? makeDeps();
	const host = opts.host ?? makeHost(language);
	await new ElementPipeline(deps).run(def, body, host);
	return { root: host.containerEl.firstElementChild as HTMLElement, deps, host };
}

const itemIds = (root: HTMLElement): (string | null)[] =>
	Array.from(root.querySelectorAll('.dse-chrome [data-dse-chrome-item]')).map((el) =>
		el.getAttribute('data-dse-chrome-item'),
	);

const summaryText = (root: HTMLElement): string =>
	root.querySelector('.dse-chrome-summary__text')?.textContent ?? '';

afterEach(() => setChromeMobileOverride(undefined));

// ---------------------------------------------------------------- 1. opt-in
describe('SC-169 §1 — the `chrome` slot is the opt-in, and absence changes nothing', () => {
	test('an element WITHOUT the slot emits no chrome DOM and no chrome attributes', async () => {
		const { root } = await render(
			counterElement,
			'name: Health\ncurrent_value: 7\nmax_value: 20\nmin_value: 0\n',
			'ds-counter',
		);
		expect(counterElement.chrome).toBeUndefined();
		expect(root.querySelector('.dse-chrome')).toBeNull();
		expect(root.querySelector('.dse-chrome-summary')).toBeNull();
		expect(root.querySelector('.dse-chrome-anchor')).toBeNull();
		expect(root.hasAttribute('data-dse-chrome')).toBe(false);
		expect(root.hasAttribute('data-dse-collapsed')).toBe(false);
	});

	test('the three SC-169 prototype elements DO declare it; trivial elements never will', () => {
		expect(statblockElement.chrome).toBeDefined();
		expect(staminaBarElement.chrome).toBeDefined();
		expect(heroElement.chrome).toBeDefined();
	});

	test('an element WITH the slot stamps the root and mounts both nodes', async () => {
		const { root } = await render(statblockElement, STATBLOCK_BODY, 'ds-statblock');
		expect(root.hasAttribute('data-dse-chrome')).toBe(true);
		expect(root.querySelector('.dse-chrome')).not.toBeNull();
		// The collapsed one-line bar is a direct child of ROOT (it replaces the card), while
		// the panel hangs off the card frame — see mountChrome's `anchor`.
		expect(root.querySelector<HTMLElement>('.dse-chrome-summary')!.parentElement).toBe(root);
		expect(root.querySelector('.dse-chrome')!.parentElement).toBe(root.querySelector('.dse-sb'));
		// …and starts EXPANDED, so the rendered page is unchanged for an author who never
		// touches the panel.
		expect(root.hasAttribute('data-dse-collapsed')).toBe(false);
	});
});

// ---------------------------------------------------------------- 2. panel shape
describe('SC-169 §2 — panel shape', () => {
	test('default panel is collapse-only; collapse is the LAST (rightmost) child', async () => {
		const { root } = await render(statblockElement, STATBLOCK_BODY, 'ds-statblock');
		expect(itemIds(root)).toEqual(['collapse']);
		const panel = root.querySelector('.dse-chrome')!;
		expect(panel.lastElementChild!.getAttribute('data-dse-chrome-item')).toBe('collapse');
		expect(panel.getAttribute('role')).toBe('toolbar');
	});

	test('authoringControls ON adds the edit pencil to the LEFT of collapse (right-to-left growth)', async () => {
		const deps = makeDeps();
		await deps.prefs.set('authoringControls', true);
		const { root } = await render(statblockElement, STATBLOCK_BODY, 'ds-statblock', { deps });
		expect(itemIds(root)).toEqual(['edit', 'collapse']);
	});

	test('a host that cannot persist gets no edit item, but still gets the panel', async () => {
		const deps = makeDeps();
		await deps.prefs.set('authoringControls', true);
		const host = makeHost('ds-statblock', { canPersist: false });
		const { root } = await render(statblockElement, STATBLOCK_BODY, 'ds-statblock', { deps, host });
		expect(itemIds(root)).toEqual(['collapse']);
	});

	test('an element that opts out of the generic pencil (ds-hero) gets no edit item either', async () => {
		const deps = makeDeps();
		await deps.prefs.set('authoringControls', true);
		const { root } = await render(heroElement, HERO_BODY, 'ds-hero', { deps });
		expect(heroElement.noAuthoringButton).toBe(true);
		expect(itemIds(root)).toEqual(['collapse']);
	});

	test('every panel control is a REAL icon-only button with an accessible name', async () => {
		const { root } = await render(staminaBarElement, STAMINA_BODY, 'ds-stamina');
		for (const el of Array.from(root.querySelectorAll('[data-dse-chrome-item]'))) {
			expect(el.tagName).toBe('BUTTON');
			expect(el.getAttribute('type')).toBe('button');
			expect(el.classList.contains('dse-btn--icon')).toBe(true);
			expect(el.getAttribute('aria-label')).toBeTruthy();
		}
	});
});

// ---------------------------------------------------------------- 3. collapse
describe('SC-169 §3 — whole-element collapse', () => {
	test('clicking collapse sets the attribute, paints the summary, and flips both aria states', async () => {
		const { root } = await render(heroElement, HERO_BODY, 'ds-hero');
		const toggle = root.querySelector<HTMLButtonElement>('[data-dse-chrome-item="collapse"]')!;
		expect(toggle.getAttribute('aria-expanded')).toBe('true');

		toggle.click();

		expect(root.getAttribute('data-dse-collapsed')).toBe('on');
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(toggle.getAttribute('aria-label')).toBe('Expand Hero sheet');
		expect(summaryText(root)).toBe('Hero: Torin Stonefist');
	});

	test("the collapsed bar's own expand button (always visible, on the right) expands again", async () => {
		const { root } = await render(heroElement, HERO_BODY, 'ds-hero');
		root.querySelector<HTMLButtonElement>('[data-dse-chrome-item="collapse"]')!.click();
		const expand = root.querySelector<HTMLButtonElement>('[data-dse-chrome-item="expand"]')!;
		// It lives in the collapsed bar, not the hover panel — the hover panel is
		// unreachable on a touch device, so a collapsed element would otherwise dead-end.
		expect(expand.parentElement).toBe(root.querySelector('.dse-chrome-summary'));
		expand.click();
		expect(root.hasAttribute('data-dse-collapsed')).toBe(false);
	});

	test('the summary is the element\'s own: type label + name + optional key data', async () => {
		const sb = await render(statblockElement, STATBLOCK_BODY, 'ds-statblock');
		sb.root.querySelector<HTMLButtonElement>('[data-dse-chrome-item="collapse"]')!.click();
		expect(summaryText(sb.root)).toBe('Statblock: Bare Creature');

		const stam = await render(staminaBarElement, STAMINA_BODY, 'ds-stamina');
		stam.root.querySelector<HTMLButtonElement>('[data-dse-chrome-item="collapse"]')!.click();
		// The KEY-DATA case from the ticket: no name of its own, two numbers that matter.
		expect(summaryText(stam.root)).toBe('Stamina (31/48)');
	});

	test('the reserved `collapsed:` key is the AUTHORED default — and never reaches the model or the schema', async () => {
		// ds-stamina's schema declares additionalProperties: false, so an unpopped key would
		// hard-fail validation and render an error card instead.
		const { root } = await render(staminaBarElement, `collapsed: true\n${STAMINA_BODY}`, 'ds-stamina');
		expect(root.querySelector('.dse-error-card')).toBeNull();
		expect(root.getAttribute('data-dse-collapsed')).toBe('on');
		expect(summaryText(root)).toBe('Stamina (31/48)');
	});

	test('a non-boolean `collapsed:` is warned about and ignored, not an error card', async () => {
		const { root } = await render(staminaBarElement, `collapsed: maybe\n${STAMINA_BODY}`, 'ds-stamina');
		expect(root.querySelector('.dse-error-card')).toBeNull();
		expect(root.hasAttribute('data-dse-collapsed')).toBe(false);
	});

	test('toggling persists to the SessionStore under (blockKey, "chrome.collapsed") and NEVER writes the note', async () => {
		const deps = makeDeps();
		const host = makeHost('ds-stamina');
		const replaceSource = jest.fn(async () => true);
		host.replaceSource = replaceSource;
		const { root } = await render(staminaBarElement, STAMINA_BODY, 'ds-stamina', { deps, host });

		// Mounting alone writes nothing (the kit collapsible's contract).
		expect(deps.session.get('Note.md::ds-stamina::0', CHROME_COLLAPSE_SLOT)).toBeUndefined();

		root.querySelector<HTMLButtonElement>('[data-dse-chrome-item="collapse"]')!.click();
		expect(deps.session.get('Note.md::ds-stamina::0', CHROME_COLLAPSE_SLOT)).toBe(true);
		expect(replaceSource).not.toHaveBeenCalled();
	});

	test('a persisted session value beats the authored default (survives the echo-rebuild)', async () => {
		const deps = makeDeps();
		deps.session.set('Note.md::ds-stamina::0', CHROME_COLLAPSE_SLOT, false);
		const { root } = await render(staminaBarElement, `collapsed: true\n${STAMINA_BODY}`, 'ds-stamina', { deps });
		expect(root.hasAttribute('data-dse-collapsed')).toBe(false);
	});
});

// ---------------------------------------------------------------- 4. round-trip
describe('SC-169 §4 — the `collapsed:` key survives a write-back', () => {
	it('re-emits the key for a model-serializing element', () => {
		const wrapped = withCollapsedDefault(() => 'max_stamina: 48\n', true);
		expect(wrapped(undefined)).toBe('collapsed: true\nmax_stamina: 48\n');
	});

	it('does NOT double it for a serializer that splices the raw body back (ds-hero)', () => {
		const raw = 'collapsed: true\nname: Torin Stonefist\nstate:\n  stamina: 4\n';
		const wrapped = withCollapsedDefault(() => raw, true);
		expect(wrapped(undefined)).toBe(raw);
	});

	it('pops the key off the parsed data (mutating), leaving everything else', () => {
		const data: Record<string, unknown> = { collapsed: true, name: 'x' };
		expect(extractCollapsedDefault(data)).toBe(true);
		expect(data).toEqual({ name: 'x' });
		expect(extractCollapsedDefault({ name: 'x' })).toBeUndefined();
	});
});

// ---------------------------------------------------------------- 5. mobile + print
describe('SC-169 §5 — mobile mode', () => {
	beforeEach(() => setChromeMobileOverride(undefined));

	test('desktop (the default) stamps no mobile attribute', async () => {
		const { root } = await render(staminaBarElement, STAMINA_BODY, 'ds-stamina');
		expect(root.hasAttribute('data-dse-chrome-mobile')).toBe(false);
	});

	test('Platform.isMobile stamps data-dse-chrome-mobile="on" (panel always visible + reserved top space)', async () => {
		setChromeMobileOverride(true);
		const { root } = await render(staminaBarElement, STAMINA_BODY, 'ds-stamina');
		expect(root.getAttribute('data-dse-chrome-mobile')).toBe('on');
	});
});

describe('SC-169 §6 — the chrome is COMPLETELY absent from the print scheme', () => {
	const rawCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'styles-source.css'), 'utf8');
	const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
	const rules = (() => {
		const out: { selector: string; body: string }[] = [];
		const re = /([^{}]+)\{([^{}]*)\}/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(css))) out.push({ selector: m[1].trim(), body: m[2] });
		return out;
	})();
	const chromeRules = rules.filter((r) => /\.dse-chrome(?![\w-]*-anchor)/.test(r.selector));

	it('finds the chrome rules at all (guard against a vacuous pass)', () => {
		expect(chromeRules.length).toBeGreaterThan(8);
	});

	it('the unscoped BASE rule hides both nodes, so an unthemed/print render shows nothing', () => {
		const base = rules.find((r) => r.selector === '.dse-chrome,\n.dse-chrome-summary');
		expect(base).toBeDefined();
		expect(base!.body.replace(/\s/g, '')).toBe('display:none;');
	});

	it('every OTHER chrome rule carries the print exclusion', () => {
		const offenders = chromeRules
			// A rule whose ONLY declaration is `display: none` can never make the chrome
			// visible — that is the print hide-list inside `@media print` (whose selector
			// carries no attribute, by construction) and the unscoped base.
			.filter((r) => r.body.replace(/\s/g, '') !== 'display:none;')
			.filter((r) => !/\[data-dse-print="on"\]/.test(r.selector))
			.map((r) => r.selector);
		expect(offenders).toEqual([]);
	});

	it('the mobile mode is print-excluded too — it is the one mode that reserves layout space', () => {
		const mobile = chromeRules.filter((r) => /data-dse-chrome-mobile/.test(r.selector));
		expect(mobile.length).toBeGreaterThan(0);
		expect(mobile.every((r) => /:not\(\[data-dse-print="on"\]\)/.test(r.selector))).toBe(true);
	});

	it('the COLLAPSE rules are print-excluded, so a collapsed element prints in full', () => {
		const collapse = rules.filter((r) => /data-dse-collapsed/.test(r.selector));
		expect(collapse.length).toBeGreaterThan(0);
		expect(collapse.every((r) => /:not\(\[data-dse-print="on"\]\)/.test(r.selector))).toBe(true);
	});
});
