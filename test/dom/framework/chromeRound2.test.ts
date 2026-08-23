// SC-169 ROUND 2 — Scott's rulings of 2026-08-18, one describe block per ruling.
//
//   1. PLACEMENT   the panel sits the same distance from the card's right edge everywhere.
//   2. LAYERING    the panel never paints over the card's border.
//   3. YAML KEYS   `collapsed:` stays; `collapsible:` and `collapse_default:` join it.
//   4. ds-stamina  the old "Stamina Bar" disclosure header is gone.
//   5. COLLAPSED   only the expand icon; the resolved NAME, never the SCC code.
//
// Rulings 1 and 2 are GEOMETRY, and jsdom computes no layout at all — a `getBoundingClientRect`
// here returns zeros for every node, so a test written in this file could only ever pass
// vacuously. Their real gate is `assertChromePlacement` in visual-harness/shoot.mjs, which
// measures the rendered page in Chromium and fails `npm run shots`. What IS pinned here is
// the CSS CONTRACT those measurements depend on — the declarations whose deletion would make
// the geometry gate go red — so a reader of this file can see the whole rule set, and so a
// regression is named in the suite rather than only in the camera.
import { describe, it, test, expect, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementPipelineDeps } from '@/framework/pipeline';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { staminaBarElement } from '@/elements/stamina-bar/definition';
import { statblockElement } from '@/elements/statblock/definition';
import { setChromeMobileOverride } from '@/framework/chrome';
import { extractCollapseKeys, resolveCollapseState, withCollapseKeys } from '@/framework/chrome/collapsedKey';
import {
	makeCompendiumDeps,
	loadMdDseFixture,
	makeHost as makeRefHost,
} from '../elements/_refHarness';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';

function makeDeps(): ElementPipelineDeps {
	const { deps } = makeCompendiumDeps();
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) {
		deps.validation.addDependencySchema(id, schema);
	}
	return deps;
}

const STAMINA_BODY = 'max_stamina: 48\ncurrent_stamina: 31\ntemp_stamina: 0\n';
const STATBLOCK_BODY = 'type: statblock\nname: Bare Creature\nstamina: "10"\n';
/** The same real md-dse fixture test/dom/elements/statblockRef.test.ts resolves. */
const GOBLIN_CODE = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';
const GOBLIN_REL = 'monster/goblin/statblock/goblin-stinker.md';

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

const CSS = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
/** The `.dse-chrome` declaration block that owns the panel's box. */
const panelBlock = (): string => {
	const start = CSS.indexOf(`[data-dse-theme='steel']:not([data-dse-print="on"]) .dse-chrome {`);
	expect(start).toBeGreaterThan(-1);
	return CSS.slice(start, CSS.indexOf('}', start));
};

afterEach(() => setChromeMobileOverride(undefined));

// ------------------------------------------------------------------ 1. placement
describe('SC-169 R2 §1 — one placement geometry for every element', () => {
	test('the inset is a single named token, in px, declared once on the anchor', () => {
		// A px value, not an `em`: an em resolves against whatever font-size the card sets,
		// which would move the panel per element — one of the three causes of round 1's drift.
		expect(CSS).toContain('--dse-chrome-inset: 10px;');
		expect(panelBlock()).toContain('right: calc(var(--dse-chrome-inset) - var(--dse-chrome-frame-border-right, 0px))');
	});

	test('no per-element content gutter can displace the panel', () => {
		// statblock's `.dse-sb > :not(.dse-head) { margin-left/right: 1.5rem }` (0,4,0) beat
		// the panel's own rule and pushed it 24px left. The framework invariant wins outright.
		expect(panelBlock()).toContain('margin: 0 !important;');
	});

	test('mountChrome republishes the anchor border widths CSS cannot read', async () => {
		const { root } = await render(statblockElement, STATBLOCK_BODY, 'ds-statblock');
		const anchor = root.querySelector<HTMLElement>('.dse-chrome-anchor') ?? root;
		// jsdom reports 0px borders (no UA stylesheet arithmetic), so the VALUE here is not
		// the point — the property being written at all is: without it the panel is offset
		// from the anchor's padding box while the reader measures its border box.
		expect(anchor.style.getPropertyValue('--dse-chrome-frame-border-top')).toMatch(/^\d/);
		expect(anchor.style.getPropertyValue('--dse-chrome-frame-border-right')).toMatch(/^\d/);
	});
});

// ------------------------------------------------------------------ 2. layering
describe('SC-169 R2 §2 — the panel never covers the card border', () => {
	test('the panel stops ABOVE the frame border-box top, with no negative pull', () => {
		const block = panelBlock();
		expect(block).toContain('bottom: calc(100% + var(--dse-chrome-frame-border-top, 0px))');
		// Round 1's `margin-bottom: -1px` (the "shared hairline" seated tab) is what cropped
		// the amber winded / red dying frames. Its absence is the fix.
		expect(block).not.toContain('margin-bottom: -1px');
	});

	test("ds-stamina's chrome anchor is the state-coloured plate, not an unframed wrapper", async () => {
		const { root } = await render(staminaBarElement, STAMINA_BODY, 'ds-stamina');
		const anchor = root.querySelector('.dse-chrome-anchor');
		expect(anchor).not.toBeNull();
		expect(anchor?.classList.contains('dse-stamina__cluster')).toBe(true);
	});
});

// ------------------------------------------------------------------ 3. the YAML keys
describe('SC-169 R2 §3 — `collapsed:`, `collapsible:`, `collapse_default:`', () => {
	it('CLAIMS all three for a chrome element that does not own the legacy pair', () => {
		const data: Record<string, unknown> = {
			collapsed: true,
			collapsible: false,
			collapse_default: true,
			name: 'x',
		};
		const keys = extractCollapseKeys(data, true);
		expect(keys).toMatchObject({ collapsed: true, collapsible: false, collapseDefault: true });
		expect(data).toEqual({ name: 'x' });
		expect(keys.popped).toEqual({ collapsed: true, collapsible: false, collapse_default: true });
	});

	it('READS but does not pop the legacy pair when the element owns them (or has no chrome)', () => {
		// ds-stamina: these are ComponentWrapper model fields. Popping them would let the
		// constructor substitute its own defaults and rewrite the author's values. ds-skills
		// reaches the same branch for the other reason — it declares no `chrome` slot, so
		// the pipeline never claims the pair at all.
		const data: Record<string, unknown> = { collapsed: true, collapsible: false, collapse_default: true };
		const keys = extractCollapseKeys(data, false);
		expect(keys).toMatchObject({ collapsed: true, collapsible: false, collapseDefault: true });
		expect(data).toEqual({ collapsible: false, collapse_default: true });
		expect(keys.popped).toEqual({ collapsed: true });
	});

	it('a NON-chrome element is untouched apart from the brand-new `collapsed:` key', async () => {
		// The blast-radius guard, on an element that is still opted OUT after the ROUND 3
		// rollout: `ds-hr` declares no `chrome` slot, so the pipeline never claims the legacy
		// pair and emits no chrome DOM or attributes at all.
		const { horizontalRuleElement } = await import('@/elements/horizontal-rule/definition');
		expect(horizontalRuleElement.chrome).toBeUndefined();
		const { root } = await render(horizontalRuleElement, '', 'ds-hr');
		expect(root.querySelector('.dse-chrome')).toBeNull();
		expect(root.querySelector('.dse-chrome-summary')).toBeNull();
		expect(root.hasAttribute('data-dse-chrome')).toBe(false);
	});

	it('ROUND 3 — `ds-skills` opts in and keeps ownership of the legacy pair', async () => {
		// The rollout's one new `collapseKeysOwnedByModel` element. Two things must hold at
		// once: the framework reads `collapsible:`/`collapse_default:` for the PANEL, and the
		// model still parses them for its own ComponentWrapper wrapper — which is only true
		// while the pipeline leaves them in the body.
		const { skillsElement } = await import('@/elements/skills/definition');
		expect(skillsElement.chrome).toBeDefined();
		expect(skillsElement.collapseKeysOwnedByModel).toBe(true);

		const data: Record<string, unknown> = { collapsible: false, collapse_default: true, skills: ['climb'] };
		const keys = extractCollapseKeys(data, false);
		expect(keys).toMatchObject({ collapsible: false, collapseDefault: true });
		expect(data).toEqual({ collapsible: false, collapse_default: true, skills: ['climb'] });

		// `collapsible: false` removes the collapse control and the inner wrapper — but
		// since SC-182 the skills VIEW contributes its own menu item (the show/hide-
		// unowned eye, ElementView.chromeItems), so the panel now SURVIVES carrying
		// exactly that one item. This is mountChrome's designed "no panel only if that
		// leaves it empty" semantics (SC-169 ruling 2) finally meeting a surviving item:
		// the eye toggle is session-only state, not a collapse affordance, and taking it
		// away because the block opted out of FOLDING would conflate two unrelated
		// controls.
		const { root } = await render(skillsElement, 'collapsible: false\nskills:\n  - climb\n', 'ds-skills');
		const items = Array.from(root.querySelectorAll('.dse-chrome [data-dse-chrome-item]')).map((el) =>
			el.getAttribute('data-dse-chrome-item'),
		);
		expect(items).toEqual(['skills-unowned']); // the eye survives; NO collapse item
		expect(root.querySelector('.dse-chrome-summary')).toBeNull(); // no one-line form either
		expect(root.querySelector(':scope > .dse-collapse')).toBeNull();
		expect(root.querySelector(':scope > .dse-skills')).not.toBeNull();
	});

	it('`collapsed:` beats `collapse_default:` when a block sets both', () => {
		const state = resolveCollapseState(
			{ collapsed: false, collapseDefault: true, popped: {} },
			{ collapsibleDefault: true, collapseDefault: false },
		);
		expect(state.collapsedDefault).toBe(false);
	});

	it('falls back key → global preference → built-in, in that order', () => {
		const prefs = { collapsibleDefault: false, collapseDefault: true };
		expect(resolveCollapseState({ popped: {} }, prefs)).toEqual({ collapsible: false, collapsedDefault: true });
		expect(resolveCollapseState({ collapsible: true, collapsed: false, popped: {} }, prefs)).toEqual({
			collapsible: true,
			collapsedDefault: false,
		});
	});

	it('ignores (and warns about) a non-boolean value rather than failing the block', () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		const data: Record<string, unknown> = { collapsed: 'yes' };
		expect(extractCollapseKeys(data).collapsed).toBeUndefined();
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it('re-emits only the keys it popped, and never doubles one already in the body', () => {
		expect(withCollapseKeys(() => 'max_stamina: 48\n', { collapsed: true, collapsible: false })(undefined)).toBe(
			'collapsed: true\ncollapsible: false\nmax_stamina: 48\n',
		);
		const raw = 'collapsed: true\nname: Torin\n';
		expect(withCollapseKeys(() => raw, { collapsed: true })(undefined)).toBe(raw);
	});

	test('`collapsible: false` mounts NO panel when nothing else would be in it', async () => {
		const { root } = await render(staminaBarElement, `collapsible: false\n${STAMINA_BODY}`, 'ds-stamina');
		expect(root.querySelector('.dse-chrome')).toBeNull();
		expect(root.querySelector('.dse-chrome-summary')).toBeNull();
		expect(root.hasAttribute('data-dse-chrome')).toBe(false);
		expect(root.hasAttribute('data-dse-collapsed')).toBe(false);
		// …and the element itself still rendered.
		expect(root.querySelector('.dse-stamina')).not.toBeNull();
	});

	test('`collapsible: false` keeps a panel that still has a real item (the edit pencil)', async () => {
		const deps = makeDeps();
		await deps.prefs.set('authoringControls', true);
		const { root } = await render(staminaBarElement, `collapsible: false\n${STAMINA_BODY}`, 'ds-stamina', { deps });
		const items = Array.from(root.querySelectorAll('.dse-chrome [data-dse-chrome-item]')).map((el) =>
			el.getAttribute('data-dse-chrome-item'),
		);
		expect(items).toEqual(['edit']);
		expect(root.querySelector('.dse-chrome-summary')).toBeNull();
	});
});

// ------------------------------------------------------------------ 4. ds-stamina
describe('SC-169 R2 §4 — ds-stamina drops its own "Stamina Bar" header', () => {
	test('no kit collapsible, no disclosure header, bar mounted straight onto root', async () => {
		const { root } = await render(staminaBarElement, STAMINA_BODY, 'ds-stamina');
		expect(root.querySelector('.dse-collapse')).toBeNull();
		expect(root.querySelector('.dse-collapse__header')).toBeNull();
		expect(root.textContent).not.toContain('Stamina Bar');
		expect(root.querySelector('.dse-stamina')).not.toBeNull();
	});

	test('BACKWARD COMPAT: an existing `collapse_default: true` note still starts collapsed', async () => {
		// The exact promise SC-169 round 2 makes to every vault that already has one of these
		// blocks: same key, same visible outcome, new mechanism (the panel, not the header).
		const { root } = await render(staminaBarElement, `collapse_default: true\n${STAMINA_BODY}`, 'ds-stamina');
		expect(root.getAttribute('data-dse-collapsed')).toBe('on');
		expect(root.querySelector('.dse-chrome-summary__detail')?.textContent).toBe(' (31/48)');
	});

	test('BACKWARD COMPAT: `collapse_default:` stays in the block body (model round-trip)', async () => {
		let written: string | undefined;
		const host = makeHost('ds-stamina', {
			replaceSource: async (body: string) => {
				written = body;
				return true;
			},
		});
		await render(staminaBarElement, `collapse_default: true\n${STAMINA_BODY}`, 'ds-stamina', { host });
		// The model still owns the key, so the element's own serializer emits it — the
		// framework must NOT prepend a second copy.
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-collapsed')).toBe('on');
		expect(written).toBeUndefined(); // no write happened just by rendering
	});
});

// ------------------------------------------------------------------ 5. the collapsed form
describe('SC-169 R2 §5 — the collapsed form', () => {
	test('shows only the expand control (the floating panel is suppressed while collapsed)', async () => {
		const { root } = await render(staminaBarElement, `collapsed: true\n${STAMINA_BODY}`, 'ds-stamina');
		expect(root.getAttribute('data-dse-collapsed')).toBe('on');
		const inBar = Array.from(root.querySelectorAll('.dse-chrome-summary [data-dse-chrome-item]')).map((el) =>
			el.getAttribute('data-dse-chrome-item'),
		);
		expect(inBar).toEqual(['expand']);
		// The rule that hides the panel is CSS (jsdom applies no stylesheet), so pin the rule.
		expect(CSS).toContain(
			`[data-dse-theme='steel']:not([data-dse-print="on"])[data-dse-collapsed='on'] .dse-chrome {`,
		);
	});

	// NOTE on how these two collapse the block. A whole-block REFERENCE body is the
	// reference and nothing else (`detectWholeBlockRef`), so there is nowhere to put a
	// `collapsed:` line — `collapsed: true\nscc.v1:…` is not valid YAML and produces a parse
	// error card. The authored default is therefore unreachable for a bare-ref body today;
	// the reachable collapse is the user's own, which is what the SessionStore seed below
	// stands in for (identical code path: mountChrome reads the session value at mount).
	// Reported to Scott as an open question rather than papered over.
	const collapsedSession = (host: ReturnType<typeof makeRefHost>, deps: ElementPipelineDeps) =>
		deps.session.set(host.blockKey(), 'chrome.collapsed', true);

	test('a REFERENCE body collapses to the resolved name, never the SCC code', async () => {
		// Ruling 5, end to end against the real resolution stack: `scc.v1:<code>` in, the
		// creature's own name out. Round 1 showed the code here, because the parsed model at
		// the chrome layer is a `{kind:'ref', raw}` wrapper — the resolved statblock only
		// exists inside RefUnwrapView, which now answers `chromeSummary()`.
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, GOBLIN_REL);
		const host = makeRefHost('ds-statblock');
		collapsedSession(host, deps);
		await new ElementPipeline(deps).run(statblockElement, `scc.v1:${GOBLIN_CODE}`, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.getAttribute('data-dse-collapsed')).toBe('on');
		const text = root.querySelector('.dse-chrome-summary__text')?.textContent ?? '';
		expect(text).toContain('Goblin Stinker');
		expect(text).not.toContain('scc.v1:');
		expect(text).not.toContain(GOBLIN_CODE);
	});

	test('an UNRESOLVED reference degrades to the honest line rather than a wrong name', async () => {
		// No fixture loaded: nothing to resolve, so the pipeline renders an error card and
		// `chromeSummary()` stays undefined. The collapsed line falls back to the definition's
		// own lifted summary — the type name plus exactly what the author typed.
		const { deps } = makeCompendiumDeps();
		const host = makeRefHost('ds-statblock');
		collapsedSession(host, deps);
		await new ElementPipeline(deps).run(statblockElement, `scc.v1:${GOBLIN_CODE}`, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelector('.dse-chrome-summary__text')?.textContent).toContain(GOBLIN_CODE);
	});
});
