// SC-160 — the statblock STICKY MINI-HEADER: DOM, reveal logic, inert contexts, CSS contract.
//
// Three things are worth pinning here and each one is a thing that would otherwise fail
// silently in the field:
//
//  1. The bar's CONTENT is derived from the same extractions the card renders, so it can
//     never disagree with the header it stands in for. A hand-written second copy of
//     "Stamina, or '-'" is exactly the drift that produces one number in the card and a
//     different one in the pinned bar, with no error anywhere.
//  2. The REVEAL condition is "scrolled off the TOP", not merely "not visible". The lazy
//     version (`!isIntersecting`) is also true for a card still far below the fold, which
//     would leave every statblock in a long note marked stuck while off-screen.
//  3. The bar is INERT in print/export and on canvas. Its base rule is `display: none`
//     and only a Steel, non-print, non-read-only, sticky-on root re-enables it — which is
//     the whole reason this ticket could add DOM to the statblock without moving a single
//     frozen `*--steel-print.png` byte.
//
// jsdom has no IntersectionObserver and no layout, so the observer half is tested against
// a recording FAKE installed on `window` for the case's duration: it captures the target,
// the options and the callback, and each case then hands the callback the entry shape a
// real browser would produce. That tests the DECISION (the predicate over the entry),
// which is the part with a bug in it; it deliberately does not pretend to test scrolling.
import * as fs from 'fs';
import * as path from 'path';
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin } from '../../mocks/obsidian';
import { statblockElement } from '../../../src/elements/statblock/definition';
import {
	STICKY_STUCK_CLASS,
	nearestScroller,
	renderStickyHeader,
} from '../../../src/elements/statblock/stickyHeader';
import { styleGuardFindings } from '../kit/styleGuard';
import humanBanditChief from '../../fixtures/statblock/human-bandit-chief.yaml';

const SHEET = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

/** A statblock carrying every secondary field, so row 2 renders all four cells. */
const WITH_CAPTAIN = `type: statblock
name: Goblin Monarch
level: 2
organization: Horde
role: Controller
ev: "12"
size: 1M
speed: 5
stamina: "40"
stability: 1
free_strike: 3
immunities:
  - poison 2
weaknesses:
  - cold 1
movement: climb
with_captain: Strike damage +2
might: 2
agility: -1
reason: 0
intuition: 1
presence: 3
`;

/** No role word anywhere the tint can map — pins the monochrome fails-safe on the bar. */
const UNMAPPED_ROLE = `type: statblock
name: Nameless Thing
role: Boss
organization: Horde
stamina: "10"
`;

// ——————————————————————————————————————————————————————————————————————————————
// The recording IntersectionObserver fake
// ——————————————————————————————————————————————————————————————————————————————

/** Only the three fields the reveal predicate reads — a full IntersectionObserverEntry
 *  would be ceremony, and casting a partial one to the real interface is a lie tsc is
 *  right to reject. */
interface FakeEntry {
	isIntersecting: boolean;
	boundingClientRect: { top: number; bottom: number };
	rootBounds: { top: number } | null;
}

interface Recorded {
	target: Element;
	options: IntersectionObserverInit | undefined;
	fire: (entry: FakeEntry) => void;
	disconnected: boolean;
}

let recorded: Recorded[] = [];
let originalIO: unknown;

beforeEach(() => {
	recorded = [];
	originalIO = (window as any).IntersectionObserver;
	(window as any).IntersectionObserver = class {
		private readonly entry: Recorded;
		constructor(
			private readonly cb: (entries: IntersectionObserverEntry[]) => void,
			private readonly options?: IntersectionObserverInit,
		) {
			this.entry = {
				target: undefined as unknown as Element,
				options,
				disconnected: false,
				fire: (partial: FakeEntry) => cb([partial as unknown as IntersectionObserverEntry]),
			};
		}
		observe(target: Element): void {
			this.entry.target = target;
			recorded.push(this.entry);
		}
		disconnect(): void {
			this.entry.disconnected = true;
		}
		unobserve(): void {
			/* not used */
		}
	};
});

afterEach(() => {
	(window as any).IntersectionObserver = originalIO;
});

/** The two entry shapes that matter, as a real browser would report them. Only the
 *  fields the predicate reads are populated — anything else would be decoration. */
const scrolledPastTheTop: FakeEntry = {
	isIntersecting: false,
	boundingClientRect: { bottom: -40, top: -160 },
	rootBounds: { top: 0 },
};
const stillBelowTheFold: FakeEntry = {
	isIntersecting: false,
	boundingClientRect: { bottom: 1400, top: 1240 },
	rootBounds: { top: 0 },
};
const partlyVisible: FakeEntry = {
	isIntersecting: true,
	boundingClientRect: { bottom: 60, top: -100 },
	rootBounds: { top: 0 },
};

// ——————————————————————————————————————————————————————————————————————————————
// Render plumbing (same shape as statblock.test.ts's)
// ——————————————————————————————————————————————————————————————————————————————

function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	const session = createSessionStore();
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme,
		prefs,
		refs,
		validation,
		session,
		roll: createRollService(prefs),
	};
}

/** Records the Component the pipeline parents to the host, so a case can unload the view
 *  the way a note close / re-render does. */
let mountedViews: { unload(): void }[] = [];

async function renderStatblock(
	source: string,
	hostOverrides: Partial<BlockHost> = {},
	/** Where to mount. Defaults to `document.body`; a case that cares about the scroller
	 *  resolution passes its own `overflow-y: auto` box. */
	parent: HTMLElement = document.body,
) {
	mountedViews = [];
	const deps = makeDeps();
	const containerEl = document.createElement('div');
	// Attached: `nearestScroller` walks real ancestors, so a detached mount would answer
	// a different (and here, uninteresting) question.
	parent.appendChild(containerEl);
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => {
			mountedViews.push(child as { unload(): void });
			return child;
		},
		getBlockInfo: () => ({ language: 'ds-sb', lineStart: 0, lineEnd: 140 }),
		replaceSource: async () => true,
		blockKey: () => 'Note.md::ds-sb::0',
		...hostOverrides,
	} as BlockHost;
	const pipeline = new ElementPipeline(deps);
	await pipeline.run(statblockElement, source, host);
	const root = containerEl.firstElementChild as HTMLElement;
	return { root, deps, containerEl };
}

const textsOf = (root: HTMLElement, selector: string): string[] =>
	Array.from(root.querySelectorAll(selector)).map((el) => el.textContent ?? '');

// ——————————————————————————————————————————————————————————————————————————————

describe('SC-160 sticky mini-header — DOM', () => {
	test('the anchor is the element root\'s FIRST child, ahead of the card, and is aria-hidden', async () => {
		const { root } = await renderStatblock(humanBanditChief);
		const anchor = root.firstElementChild as HTMLElement;
		expect(anchor.className).toBe('dse-sb__sticky');
		// Ahead of the card, deliberately: the anchor has to be able to park at the
		// scroller's top edge once the card's own top has scrolled past it.
		expect(anchor.nextElementSibling?.classList.contains('dse-sb')).toBe(true);
		// Every word in the bar is a duplicate of the real header; announcing it twice
		// would be a regression for a screen-reader user, not a feature.
		expect(anchor.getAttribute('aria-hidden')).toBe('true');
		expect(anchor.querySelector('.dse-sb__sticky-inner')).not.toBeNull();
	});

	test('row 1 repeats the card\'s name, org+role line, five stats and five characteristics VERBATIM', async () => {
		const { root } = await renderStatblock(WITH_CAPTAIN);
		expect(root.querySelector('.dse-sb__sticky-name')!.textContent).toBe('Goblin Monarch');
		// The same "Horde Controller" string the card head's right-primary slot prints.
		expect(root.querySelector('.dse-sb__sticky-role')!.textContent).toBe('Horde Controller');
		// …and these are byte-for-byte the card's own item cells, value-then-label, same
		// order — the point of hoisting the extraction rather than writing a second copy.
		const expected = ['1MSize', '5Speed', '40Stamina', '1Stability', '3Free Strike'];
		expect(textsOf(root, '.dse-sb__sticky-defs .dse-sb__sticky-m')).toEqual(expected);
		expect(textsOf(root, '.dse-sb__items .dse-sb__item')).toEqual(expected);
		// Characteristics: value over the boxed INITIAL (the site's `.c` shape), with
		// formatCharacteristic's +N / -N / +0 spellings intact.
		expect(textsOf(root, '.dse-sb__sticky-chars .dse-sb__sticky-c')).toEqual([
			'+2M', '-1A', '+0R', '+1I', '+3P',
		]);
	});

	test('row 2 is the site\'s sticky ORDER (Movement, With Captain, Immunity, Weakness) — not the card grid\'s', async () => {
		const { root } = await renderStatblock(WITH_CAPTAIN);
		expect(textsOf(root, '.dse-sb__sticky-row2 .dse-sb__sticky-sm')).toEqual([
			'Movementclimb',
			'With CaptainStrike damage +2',
			'Immunitypoison 2',
			'Weaknesscold 1',
		]);
		// The full card keeps its own legacy order — the two are deliberately different.
		expect(textsOf(root, '.dse-sb__grid .dse-sb__kv-l')).toEqual([
			'Immunity', 'Weakness', 'Movement', 'With Captain',
		]);
	});

	test('row 2 is ALWAYS built (never conditional DOM) — the sub-toggle is a CSS reflow, which is what makes it per-block overridable', async () => {
		// No captain field: three cells, and the row still exists so `sbStickyMeta` has
		// something to hide. A conditional-DOM sub-toggle would have to be global-only,
		// like sbCharLine/sbCharBox/sbVillain are.
		const { root } = await renderStatblock(humanBanditChief);
		const row2 = root.querySelector('.dse-sb__sticky-row2')!;
		expect(row2).not.toBeNull();
		expect(row2.querySelectorAll('.dse-sb__sticky-sm').length).toBe(3);
		// The pref reflects as an attribute on the ROOT (the reflow channel), never as a
		// missing node.
		expect(root.getAttribute('data-dse-sb-stickymeta')).toBe('on');
		expect(root.getAttribute('data-dse-sb-sticky')).toBe('on');
	});

	test('turning either pref off changes ONLY the reflected attribute — the DOM is identical', async () => {
		const on = await renderStatblock(humanBanditChief);
		const onHtml = (on.root.querySelector('.dse-sb__sticky') as HTMLElement).innerHTML;
		const off = await renderStatblock(humanBanditChief);
		await off.deps.prefs.set('sbSticky', 'off');
		await off.deps.prefs.set('sbStickyMeta', 'off');
		expect(off.root.getAttribute('data-dse-sb-sticky')).toBe('off');
		expect(off.root.getAttribute('data-dse-sb-stickymeta')).toBe('off');
		expect((off.root.querySelector('.dse-sb__sticky') as HTMLElement).innerHTML).toBe(onHtml);
	});

	test('the role tint is applied to the anchor as well as the card (the bar is OUTSIDE the card, so it inherits nothing)', async () => {
		const { root } = await renderStatblock(WITH_CAPTAIN);
		const anchor = root.querySelector('.dse-sb__sticky') as HTMLElement;
		expect(anchor.getAttribute('data-dse-role')).toBe('controller');
		expect(anchor.style.getPropertyValue('--dse-role')).toBe('var(--dse-role-controller)');
	});

	test('an unmapped role tints NEITHER card nor bar (the same fails-safe, not a second code path)', async () => {
		const { root } = await renderStatblock(UNMAPPED_ROLE);
		const anchor = root.querySelector('.dse-sb__sticky') as HTMLElement;
		expect(anchor.hasAttribute('data-dse-role')).toBe(false);
		expect(anchor.style.getPropertyValue('--dse-role')).toBe('');
	});
});

describe('SC-160 sticky mini-header — the reveal', () => {
	test('observes the card\'s REAL header, rooted at the nearest scrolling ancestor, at threshold 0', async () => {
		// The stand-in for Obsidian's preview scroller / a sidebar leaf: an ancestor that
		// scrolls. Rooting the observer here rather than at the viewport is the whole
		// reason ONE implementation can be correct in the reading view, a sidebar leaf and
		// a pop-out window — in a leaf the viewport is the entire 1400px window and would
		// report the header "visible" long after the leaf clipped it away.
		const scroller = document.createElement('div');
		scroller.style.overflowY = 'auto';
		document.body.appendChild(scroller);

		const { root } = await renderStatblock(humanBanditChief, {}, scroller);
		expect(recorded).toHaveLength(1);
		expect(recorded[0].target).toBe(root.querySelector('.dse-sb > .dse-head'));
		expect(recorded[0].options?.root).toBe(scroller);
		expect(recorded[0].options?.threshold).toBe(0);
		expect(nearestScroller(root.querySelector('.dse-sb__sticky') as HTMLElement)).toBe(scroller);
	});

	test('nearestScroller returns null (the viewport) when nothing between the card and the document scrolls', async () => {
		const { root } = await renderStatblock(humanBanditChief);
		expect(nearestScroller(root.querySelector('.dse-sb__sticky') as HTMLElement)).toBeNull();
	});

	test('stuck ONLY when the header has scrolled off the TOP — never merely because it is off-screen', async () => {
		const { root } = await renderStatblock(humanBanditChief);
		const anchor = root.querySelector('.dse-sb__sticky') as HTMLElement;
		expect(anchor.classList.contains(STICKY_STUCK_CLASS)).toBe(false);

		recorded[0].fire(scrolledPastTheTop);
		expect(anchor.classList.contains(STICKY_STUCK_CLASS)).toBe(true);

		// Scrolling back up un-sticks it.
		recorded[0].fire(partlyVisible);
		expect(anchor.classList.contains(STICKY_STUCK_CLASS)).toBe(false);

		// The bug this guards: `!isIntersecting` alone is ALSO true here, for a card the
		// reader has not reached yet. Marking that stuck would paint a pinned bar the
		// instant a distant statblock's top edge appeared.
		recorded[0].fire(stillBelowTheFold);
		expect(anchor.classList.contains(STICKY_STUCK_CLASS)).toBe(false);
	});

	test('a canvas card (host cannot persist ⇒ data-dse-readonly) still BUILDS the bar but wires no observer', async () => {
		const { root } = await renderStatblock(humanBanditChief, { canPersist: false });
		expect(root.getAttribute('data-dse-readonly')).toBe('true');
		// The DOM is unconditional — print/canvas inertness is CSS's job, so that the
		// rendered tree stays identical across every context (which is what keeps the
		// print freeze honest).
		expect(root.querySelector('.dse-sb__sticky-inner')).not.toBeNull();
		// …but there is nothing for an observer to achieve where the bar can never show.
		expect(recorded).toHaveLength(0);
	});

	test('the observer dies with the view (nothing keeps writing to DOM that is gone)', async () => {
		await renderStatblock(humanBanditChief);
		expect(recorded).toHaveLength(1);
		expect(recorded[0].disconnected).toBe(false);
		// The pipeline parents the view to the host's child registry — unloading it is
		// what a note close, a re-render, or a pref-driven remount does. An observer that
		// survived that would keep toggling a class on a detached node forever.
		expect(mountedViews.length).toBeGreaterThan(0);
		for (const view of mountedViews) view.unload();
		expect(recorded[0].disconnected).toBe(true);
	});
});

describe('SC-160 sticky mini-header — CSS contract', () => {
	test('the BASE layer hides it outright — the one rule that keeps the new DOM worth zero print pixels', () => {
		// Not `visibility`/`opacity`: those still lay a box out. `display: none` is what
		// guarantees a zero-height sticky anchor + an absolutely-positioned bar cannot
		// shift a single frozen `*--steel-print.png` byte.
		expect(SHEET).toMatch(/\n\.dse-sb__sticky \{\n\tdisplay: none;\n\}/);
	});

	test('the ONLY rule that re-enables it carries all four guards: Steel, not print, not read-only, pref on', () => {
		const reveal = SHEET.match(/^[^\n]*> \.dse-sb__sticky \{$/m)?.[0];
		expect(reveal).toBeDefined();
		expect(reveal).toContain("[data-dse-theme='steel']");
		expect(reveal).toContain(':not([data-dse-print="on"])');
		expect(reveal).toContain(':not([data-dse-readonly])');
		expect(reveal).toContain("[data-dse-sb-sticky='on']");
	});

	test('real printing (@media print, where no data-dse-print attribute exists) hides it too', () => {
		const printBlocks = SHEET.split('@media print {').slice(1);
		expect(printBlocks.some((block) => /\n\t\.dse-sb__sticky,/.test(block))).toBe(true);
	});

	test('the secondary-stats sub-toggle is a display reflow keyed to the reflected attribute', () => {
		expect(SHEET).toContain("[data-dse-sb-stickymeta='off'] .dse-sb__sticky-row2 {");
	});

	test('the bar has a FLAT, var()-only opaque ground, and every color-mix() tint is behind an @supports gate', () => {
		// The bug this pins, found by running the branch in a real Obsidian (Chromium
		// 106.0.5249.199 / Electron 21.4.1 — the documented support floor): the sheet's
		// usual "static declaration, then the color-mix() one, same property, same rule"
		// fallback pair does NOT work when the enhanced declaration contains `var()`.
		// It then parses fine and fails at COMPUTED-VALUE time, after the cascade has
		// already dropped the static declaration — so `background` resolved to
		// `rgba(0, 0, 0, 0)` and the pinned bar rendered SEE-THROUGH, with the card body
		// scrolling visibly behind its own stat line. `@supports` is the only form that
		// holds, because a floor engine never enters the block at all.
		const innerRule = SHEET.match(
			/^\[data-dse-theme='steel'\]:not\(\[data-dse-print="on"\]\) \.dse-sb__sticky-inner \{\n([\s\S]*?)^\}/m,
		)?.[1];
		expect(innerRule).toBeDefined();
		expect(innerRule).toContain('background: var(--dse-surface);');
		// …and NOT the thing that broke: no color-mix anywhere in the ungated rule.
		expect(innerRule).not.toContain('color-mix');

		// Every sticky color-mix() that does exist sits inside an @supports block.
		const gate = SHEET.match(
			/@supports \(background: color-mix\([^)]*\)\) \{\n([\s\S]*?)^\}/m,
		)?.[1];
		expect(gate).toBeDefined();
		expect(gate).toContain('.dse-sb__sticky-inner');
		expect(gate).toContain('color-mix(in srgb, var(--dse-role, var(--dse-metal)) 14%, var(--dse-surface))');
		// The gated block still keeps the static line first — cssSupportFloor.test.ts
		// scans source text and does not model @supports, so the adjacency must be real.
		expect(gate).toMatch(/background: var\(--dse-surface\);\n\t\tbackground: linear-gradient/);
	});

	test('narrow panes are handled by CONTAINER queries, not media queries (a sidebar leaf is narrow inside a WIDE window)', () => {
		expect(SHEET).toContain('container-name: dse-sb-sticky;');
		expect(SHEET).toContain('@container dse-sb-sticky (max-width: 34rem)');
		expect(SHEET).toContain('@container dse-sb-sticky (max-width: 21rem)');
	});

	test('every sticky rule outside the base off-switch is Steel- and print-scoped', () => {
		const offenders = SHEET.split('\n')
			.filter((line) => /^[^\s/].*\.dse-sb__sticky/.test(line) && line.trim().endsWith('{'))
			.filter((line) => !line.startsWith("[data-dse-theme='steel']:not([data-dse-print=\"on\"])"))
			// the base off-switch itself, and the light-scheme shadow twin
			.filter((line) => line !== '.dse-sb__sticky {')
			.filter((line) => !line.startsWith('body.theme-light '));
		expect(offenders).toEqual([]);
	});

	test('hygiene: the sticky module writes no inline colour and no colour literal', () => {
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/elements/statblock/stickyHeader.ts'),
			'utf8',
		);
		expect(styleGuardFindings(src)).toEqual([]);
	});
});

describe('SC-160 renderStickyHeader — the builder in isolation', () => {
	test('an empty parts bag still produces a well-formed (empty) bar rather than throwing', () => {
		const host = document.createElement('div');
		const anchor = renderStickyHeader(host, {
			name: '',
			role: '',
			defenses: [],
			characteristics: [],
			secondary: [],
		});
		expect(anchor.querySelector('.dse-sb__sticky-row1')).not.toBeNull();
		expect(anchor.querySelector('.dse-sb__sticky-row2')!.children.length).toBe(0);
	});
});
