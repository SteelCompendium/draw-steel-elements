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

// --------------------------------------------- SC-189 R3: the host's button chrome
// Scott's four defects of 2026-08-25 ("some layer bleeding over the top side", "a shadow
// below the menu panel", "the border around the card cuts off on the corner", "the panel is
// one pixel too low") were ONE cause with four faces, and it was not geometry: the panel's
// box is exactly where SC-169 put it (`gap` = 0.00px, re-measured this round on every
// family). A kit `.dse-btn` is a real `<button>`, so Obsidian's app.css
// `button:not(.clickable-icon) { box-shadow: var(--input-shadow) }` reaches it, and this
// sheet re-grounded the button's background, border, radius and colour but never its
// box-shadow — so each glyph wore Obsidian's five-layer plate shadow, whose downward half
// spilled past the panel's border-less, padding-less bottom edge onto the card's top
// border row.
//
// jsdom applies no author cascade to a real <button> here and computes no colour, so the
// same discipline §1/§2 state above applies: what is pinned HERE is the declaration, and
// the measurement is `assertChromeHostLeak` in visual-harness/shoot.mjs, which injects
// Obsidian's real rules into Chromium and re-reads the border row on and off the panel.
describe('SC-189 R3 — the chrome panel neutralises the HOST\'s button chrome', () => {
	/** A declaration block, by the exact selector line that opens it. */
	const blockFor = (selector: string): string => {
		const start = CSS.indexOf(`${selector} {`);
		expect(start).toBeGreaterThan(-1);
		return CSS.slice(start, CSS.indexOf('}', start));
	};
	const PANEL_BTN = "[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-chrome .dse-btn";
	const SUMMARY_BTN = "[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-chrome-summary .dse-btn";

	test.each([
		['the floating panel', PANEL_BTN],
		['the collapsed bar', SUMMARY_BTN],
	])('%s re-grounds box-shadow to `none`', (_label, selector) => {
		const block = blockFor(selector);
		// `none`, not a retuned value: E3 is declared once, on the panel itself. A button in
		// the panel is a glyph on that plate, never a plate of its own.
		expect(block).toMatch(/\n\tbox-shadow: none;/);
		// The three the rule already had — kept together, because dropping any one of them
		// re-opens the same class of leak from a different Obsidian declaration.
		expect(block).toContain('background: transparent;');
		expect(block).toContain('border: 0;');
	});

	test('both resets are Steel-scoped and print-excluded', () => {
		// The panel is `display:none` in the unscoped base and print never reveals it, so a
		// reset that reached print would be dead weight at best and a frozen-byte move at
		// worst. Both halves of the scope, per the sheet's theming contract.
		for (const selector of [PANEL_BTN, SUMMARY_BTN]) {
			expect(selector).toContain("[data-dse-theme='steel']");
			expect(selector).toContain(':not([data-dse-print="on"])');
			expect(CSS).toContain(`${selector} {`);
		}
	});

	test('neither reset hardcodes a font-size (SC-185)', () => {
		for (const selector of [PANEL_BTN, SUMMARY_BTN]) expect(blockFor(selector)).not.toContain('font-size');
	});

	test('the fix is in the BASE panel, not inside a `chromeSeat` candidate arm', () => {
		// The defect is in the panel every card wears, so `current` and all four candidates
		// have to be fixed by the same declaration. A candidate-scoped reset would fix only
		// whichever seat happened to be selected.
		for (const selector of [PANEL_BTN, SUMMARY_BTN]) expect(selector).not.toContain('chrome-seat');
	});

	test('the panel keeps its OWN E3 material (the reset is on the buttons only)', () => {
		// Scott sanctioned E3 on SC-169 ("Option D and E3. Sanctioned"); this round removes a
		// leak, it does not retune the crown or the upward cast shadow.
		const block = panelBlock();
		expect(block).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.22)');
		expect(block).toContain('0 -3px 7px rgb(0 0 0 / 34%)');
	});
});

// --------------------------------------------- SC-189 R4: the host owns no part of the box
// Round 3 fixed the panel's MATERIAL leak and, in its own hand-back, named a second instance
// of the identical omission: Obsidian's base rule also sets `height: var(--input-height)`
// (30px desktop), and a used `height` beats a `min-height`, so the panel's own
// `min-height: 1.5em` never applied in a real vault. Measured on the harness page with
// Obsidian's rule injected, dark: the panel box 21.39px -> 31.00px (+45%), the collapsed bar
// 33.80px -> 40.00px. Every picture of the panel in this repo drew the short one, because the
// harness ships no host.
//
// jsdom computes no layout, so the MEASUREMENT is `assertChromeHostLeak` in
// visual-harness/shoot.mjs — which since this round injects Obsidian's whole base `button`
// rule and fails if the panel's box moves at all under it. What is pinned HERE is the
// declaration that makes that true.
describe('SC-189 R4 — the chrome panel owns its own BOX', () => {
	const blockFor = (selector: string): string => {
		const start = CSS.indexOf(`${selector} {`);
		expect(start).toBeGreaterThan(-1);
		return CSS.slice(start, CSS.indexOf('}', start));
	};
	const PANEL_BTN = "[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-chrome .dse-btn";
	const SUMMARY_BTN = "[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-chrome-summary .dse-btn";

	test.each([
		['the floating panel', PANEL_BTN],
		['the collapsed bar', SUMMARY_BTN],
	])('%s re-grounds height to `auto`', (_label, selector) => {
		// `auto`, not a px figure: the size is already declared — `min-height: 1.5em` on the
		// panel button, `--dse-control-min` (SC-121) on the collapsed bar's — and in `em`, so
		// it tracks the user's text/card-size prefs where Obsidian's 30px freezes.
		expect(blockFor(selector)).toMatch(/\n\theight: auto;/);
	});

	test('the panel button still declares its OWN size, which `height: auto` hands back to', () => {
		const block = blockFor(PANEL_BTN);
		expect(block).toContain('min-height: 1.5em;');
		expect(block).toContain('min-width: 1.7em;');
		// A px height here would defeat the point of re-grounding the host's px height.
		expect(block).not.toMatch(/\n\theight: \d/);
	});

	test('the height fix is in the BASE panel, not in a `chromeSeat` candidate arm', () => {
		for (const selector of [PANEL_BTN, SUMMARY_BTN]) expect(selector).not.toContain('chrome-seat');
	});

	test('the coarse-pointer twin still owns the touch box (it is not overridden by `auto`)', () => {
		// `height: auto` sits in the fine-pointer rule; the touch answer stays the media
		// query's min-sizes, which `auto` lets through rather than freezing at Obsidian's
		// 40px mobile `--input-height`.
		const at = CSS.indexOf('@media (pointer: coarse)', CSS.indexOf(PANEL_BTN));
		const block = CSS.slice(at, CSS.indexOf('}', CSS.indexOf('{', CSS.indexOf(PANEL_BTN, at))));
		expect(block).toContain('min-width: var(--dse-touch-min);');
		expect(block).toContain('min-height: 2em;');
	});
});

// ------------------------------------------- SC-189 R5: `tuck`, and the panel's own box
// Scott ruled twice on this panel. 2026-08-26: delete the whole `chromeSeat` A/B — the four
// seam candidates were compensating for defects rounds 3-5 turned out to be real bugs, so
// the original panel is right once they are fixed. 2026-08-27: "Lets go with the `tuck`
// design" — the one candidate that was never a seam fix. It is therefore two unconditional
// declarations on the BASE panel here, not a pref: the card's lifted top edge casts a small
// shadow onto the bottom of the plate, so the panel reads as a TAB TUCKED BEHIND the card
// rather than a slab parked against it.
//
// The mechanism is the contract. `tuck` is authored as an INSET on the panel, never as a
// cast shadow on the card, so it is clipped to the panel's own border box — it cannot reach
// the card's border row, which is the exact spill round 3 spent a whole round removing.
// That property is what these tests pin; the picture is the `chrome-hover-*` shots.
describe('SC-189 R5 — `tuck` is in the base panel, as an inset that cannot leave it', () => {
	const TUCK_DARK = 'inset 0 -5px 6px -3px rgb(0 0 0 / 55%)';
	const TUCK_LIGHT = 'inset 0 -5px 6px -3px rgb(0 0 0 / 22%)';
	const LIGHT_PANEL = "body.theme-light [data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-chrome";
	const lightPanelBlock = (): string => {
		const start = CSS.indexOf(`${LIGHT_PANEL} {`);
		expect(start).toBeGreaterThan(-1);
		return CSS.slice(start, CSS.indexOf('}', start));
	};

	test('both schemes carry it, retuned rather than reused', () => {
		// 55% black under a dark card is the cast weight E3 already uses there; on the
		// near-white light plate the same value reads as grime, not as an edge — the same
		// reasoning, and the same ratio, as E3's own 34% -> 15% light retune.
		expect(panelBlock()).toContain(TUCK_DARK);
		expect(lightPanelBlock()).toContain(TUCK_LIGHT);
	});

	test('the tuck layer is an INSET, and it appears ONLY inside a chrome-panel box-shadow', () => {
		// This is the round-4 "sets box-shadow and nothing else" contract, restated for the
		// promoted form. It is what stops someone re-authoring the effect the obvious way —
		// a real `box-shadow` on `.dse-sb` — which would paint a dark band along the card's
		// WHOLE top edge, at rest, on every card, revealed panel or not, and would put the
		// shadow back on the card's border row.
		for (const layer of [TUCK_DARK, TUCK_LIGHT]) {
			expect(layer.startsWith('inset ')).toBe(true);
			let from = CSS.indexOf(layer);
			expect(from).toBeGreaterThan(-1);
			let seen = 0;
			while (from !== -1) {
				const ruleStart = CSS.lastIndexOf('{', from);
				const selector = CSS.slice(CSS.lastIndexOf('}', ruleStart) + 1, ruleStart);
				expect(selector).toContain('.dse-chrome');
				expect(CSS.slice(ruleStart, from)).toContain('box-shadow:');
				seen += 1;
				from = CSS.indexOf(layer, from + 1);
			}
			expect(seen).toBe(1);
		}
	});

	test('it keeps E3 verbatim — the crown and the upward cast shadow are both still there', () => {
		// The three layers describe DIFFERENT edges: the plate still floats over whatever is
		// above it, and only its bottom edge is newly overlapped. `tuck` adds a layer; it does
		// not retune Scott's sanctioned material.
		expect(panelBlock()).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.22)');
		expect(panelBlock()).toContain('0 -3px 7px rgb(0 0 0 / 34%)');
		expect(lightPanelBlock()).toContain('inset 0 1px 0 rgb(255 255 255 / 100%)');
		expect(lightPanelBlock()).toContain('0 -3px 7px rgb(0 0 0 / 15%)');
	});

	test('the light twin still declares nothing but the panel MATERIAL', () => {
		// No geometry here, ever: `assertChromePlacement` re-measures the panel's exact seat
		// every sweep, and a light-only offset would make the two schemes disagree about it.
		const props = [...lightPanelBlock().matchAll(/\n\t([a-z-]+):/g)].map((m) => m[1]);
		expect(props).toEqual(['border-top-color', 'box-shadow']);
	});

	test('the whole `chromeSeat` A/B is gone from the sheet', () => {
		// Scott, 2026-08-26: delete it. Five branches, one hidden pref, six shot ids.
		expect(CSS).not.toContain('chrome-seat');
	});

	test('BREATHING ROOM: the panel button pads in `em`, and keeps no px height', () => {
		// Scott, 2026-08-27: "the 'edit' icon is nearly touching the top of the panel …the
		// icons themselves need a margin or padding or something". Measured with Obsidian's
		// host CSS injected, dark, statblock: the glyph box sat 3.19px from the panel's top
		// edge and 2.20px from its bottom; it now sits 5.08px from both, and the panel is
		// 26.16px tall (was 21.39px). `em` so it tracks the text/card-size prefs, which is
		// the whole reason round 4 re-grounded Obsidian's px `height` in the first place.
		const start = CSS.indexOf(
			"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-chrome .dse-btn {",
		);
		expect(start).toBeGreaterThan(-1);
		const block = CSS.slice(start, CSS.indexOf('}', start));
		expect(block).toMatch(/\n\tpadding: 0\.3em [\d.]+em;/);
		expect(block).toContain('min-height: 1.5em;');
		expect(block).toMatch(/\n\theight: auto;/);
		expect(block).not.toMatch(/\n\theight: \d/);
		// The 1px is the plate's own top border, given back at the bottom so the glyph sits
		// on the optical centre — a px because what it compensates for is a px.
		expect(panelBlock()).toContain('padding: 0 1px 1px;');
	});
});

// ------------------------------------------------- SC-189 R5: the card's corner hairline
// Scott, 2026-08-27: "The border of the card is still lost in the corner. Top border looks
// good. Right border looks good. At the corner it fades away." It was never the panel: with
// the panel unrevealed, on a card nobody is hovering, the sb/fb head band painted straight
// over the plate's 1px hairline for the whole 90 degrees of each top corner.
//
// CAUSE. The band is the plate's first child and sits FLUSH in its padding box, so its top
// corners are drawn at the plate's corner — but its radius came from `--dse-radius`, which
// is `0.4em` and therefore resolves against whichever element USES it (6.4px in the band's
// font-size context), while the plate's own radius is the site-parity `0.65rem` = 10.4px. A
// tighter arc anchored at the same corner bulges OUTSIDE a looser one, and a non-positioned
// child's background paints AFTER its parent's border, so the band won. `.dse-sb` cannot
// clip its overflow — the chrome panel is an absolutely positioned child that paints ABOVE
// the card's top edge — so nothing stopped it.
//
// Measured, dark, artillery band, dsf 12, panel NOT revealed, at 45 degrees on the arc:
//   straight top rgb(49,52,56) / straight right rgb(57,63,68) / arc BEFORE rgb(82,67,104)
//   (the band's own fill) / arc AFTER rgb(59,63,71). Across all 16 family/scheme combos the
// worst arc-vs-straight-edge deviation went 53/255 -> 8/255. jsdom computes no layout and no
// colour, so the MEASUREMENT is `assertChromeHostLeak` check (c) in visual-harness/shoot.mjs;
// what is pinned HERE is the arithmetic that makes it true.
describe('SC-189 R5 — the head band cannot paint over the plate it sits in', () => {
	const PLATE = "[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb {";
	const BANDS = [
		"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb[data-dse-role] > .dse-head {",
		"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-fb > .dse-head {",
	];
	const blockAt = (needle: string): string => {
		const start = CSS.indexOf(needle);
		expect(start).toBeGreaterThan(-1);
		return CSS.slice(start, CSS.indexOf('}', start));
	};

	test('the plate NAMES its radius, in `rem`, and uses the name', () => {
		// `rem`, never `em`: a custom property's `em` re-resolves against whichever element
		// consumes it, which is precisely the trap that produced this bug.
		const block = blockAt(PLATE);
		expect(block).toContain('--dse-plate-radius: 0.65rem;');
		expect(block).toContain('border-radius: var(--dse-plate-radius);');
		expect(CSS).not.toContain('\tborder-radius: 0.65rem;');
	});

	test('both head bands DERIVE their top corners from that radius, minus the border', () => {
		// The standard inner-radius arithmetic: a child flush inside a 1px border gets the
		// outer radius minus that border. Derived, not restated, so the two cannot drift.
		for (const band of BANDS) {
			expect(blockAt(band)).toContain(
				'border-radius: calc(var(--dse-plate-radius) - 1px) calc(var(--dse-plate-radius) - 1px) 0 0;',
			);
		}
	});

	test('no head band still keys its corners on the em-valued `--dse-radius`', () => {
		for (const band of BANDS) expect(blockAt(band)).not.toContain('border-radius: var(--dse-radius)');
	});

	test('the fix is Steel-screen-scoped, so no frozen print byte can move', () => {
		// The bands are screen-only rules already (print gets plain ink), and the plate rule
		// they read the token from carries the same exclusion — which is why the print
		// baseline is untouched by a change to the card's corner.
		for (const sel of [PLATE, ...BANDS]) {
			expect(sel).toContain("[data-dse-theme='steel']");
			expect(sel).toContain(':not([data-dse-print="on"])');
		}
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
