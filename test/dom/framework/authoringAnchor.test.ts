// SC-145 — "Correct edit button placement". The pipeline's generic authoringControls
// pencil (D9 Plan 15 Task 5, pipeline.ts) used to be appended unconditionally to `root`
// after view.mount(). For views whose visible card frame (border/background) is painted
// directly on root — counter/initiative/encounter/negotiation/montage/project/party/
// feature/featureblock, per the shared "card plate" CSS rule (styles-source.css ~:4068,
// which targets `[data-dse-element='<id>']` compounds) — that put the pencil inside the
// box by construction. For views whose visible card frame is instead a NESTED child div
// — the D6 display-family `.dse-card` (kit/complication/… — DisplayCardView) and
// statblock's `.dse-sb` — root itself carries no border, so the pencil rendered as a
// stray sibling BELOW/OUTSIDE the visible box (Scott's screenshots on the ticket).
//
// The fix: ElementView.authoringAnchor() (framework/view.ts) — default `rootEl`,
// overridden by DisplayCardView/StatblockElementView to return their tracked card node —
// and pipeline.ts now mounts the pencil into `view.authoringAnchor()` instead of a bare
// `root`. A second, easy-to-miss piece: EVERY affected element (all 11 display-family +
// statblock) is wrapped in `withReference()` (shared/withReference.ts), so the view the
// pipeline actually calls `authoringAnchor()` on is `RefUnwrapView`, not
// DisplayCardView/StatblockElementView directly — RefUnwrapView.authoringAnchor() must
// DELEGATE to whichever base view it mounted (`this.mountedChild`), or the override on
// the wrapped view is unreachable dead code. These tests assert the DOM-structural
// contract that anchor now guarantees end-to-end (through the real withReference wrap,
// not a bypass): the
// button is a DESCENDANT of whichever node the theme's CSS actually borders, for one
// "wide card" element from the previously-broken family (a DisplayCardView-driven card,
// the kit/complication shape) and one "narrow card" element from the previously-correct
// family (counter — must NOT regress), plus statblock (the other previously-broken
// family, a different nested anchor class). It also locks in the two per-element
// opt-outs: horizontal-rule's noAuthoringButton (no meaningful YAML to edit) and the
// authoringControls-off default (no authoring buttons render at all, matching the
// pre-D9 pipeline exactly).
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementDefinition } from '@/framework/registry';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { DisplayCardView } from '@/elements/shared/CardLayout';
import type { CardLayout } from '@/elements/shared/CardLayout';
import { withReference } from '@/elements/shared/withReference';
import { counterElement } from '@/elements/counter/definition';
import { statblockElement } from '@/elements/statblock/definition';
import { horizontalRuleElement } from '@/elements/horizontal-rule/definition';
import { makeCompendiumDeps } from '../elements/_refHarness';
import type { ElementPipelineDeps } from '@/framework/pipeline';

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

async function withAuthoringControlsOn(deps: ElementPipelineDeps): Promise<ElementPipelineDeps> {
	await deps.prefs.set('authoringControls', true);
	return deps;
}

/** A minimal stand-in for the D6 display-family shape (kit/complication/…): any real
 *  member registers through `displayFamily()`, which always drives `DisplayCardView` —
 *  the exact class under test here — wrapped in `withReference()`, exactly like every
 *  real display-family def (`displayFamily()` itself always wraps its `base`; see
 *  displayFamily.ts). Wrapping it here too matters, not just for fidelity: the pipeline
 *  never sees a bare `DisplayCardView` in production — `def.createView()` returns the
 *  `RefUnwrapView` `withReference` builds, so it is RefUnwrapView's `authoringAnchor()`
 *  delegation (RefUnwrapView.ts) that actually has to carry DisplayCardView's `.dse-card`
 *  override out to the pipeline. A hand-built LAYOUT keeps the test independent of a real
 *  Kit/Complication SDK model shape or the compendium harness (same convention as
 *  test/dom/elements/displayCard.test.ts's own testDef/testLayout). */
interface WideCardModel {
	name: string;
	body: string;
}

function wideCardLayout(): CardLayout<WideCardModel> {
	return {
		title: (m) => m.name,
		body: (m) => m.body,
	};
}

function wideCardDef(): ReturnType<typeof withReference<WideCardModel>> {
	const base: ElementDefinition<WideCardModel> = {
		id: 'test-wide-card',
		name: 'Test Wide Card',
		aliases: ['ds-test-wide-card'],
		shape: 'static',
		parse: (data) => data as WideCardModel,
		createView: (cx) => new DisplayCardView(cx, wideCardLayout()),
	};
	return withReference(base, { sccType: 'test-wide-card' });
}

const EDIT_BTN = '.dse-btn[aria-label^="Edit "]';

describe('SC-145: authoring pencil anchors to the card frame, not blindly to root', () => {
	test('wide card (DisplayCardView, the kit/complication shape): pencil mounts INSIDE .dse-card, not as a root-level sibling after it', async () => {
		const { deps } = makeCompendiumDeps();
		await withAuthoringControlsOn(deps);
		const pipeline = new ElementPipeline(deps);
		const host = makeHost('ds-test-wide-card');

		await pipeline.run(wideCardDef(), JSON.stringify({ name: 'Chosen One', body: 'Some prose.' }), host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const card = root.querySelector('.dse-card');
		expect(card).not.toBeNull();

		const btn = root.querySelector<HTMLElement>(EDIT_BTN);
		expect(btn).not.toBeNull();
		// The bug: appended as root's own child, a SIBLING of .dse-card, not inside it.
		expect(card!.contains(btn)).toBe(true);
		expect(btn!.parentElement).toBe(card);
		// root itself carries no border/background in this theme — .dse-card does — so a
		// direct child of root (the old behavior) would render visually outside the box.
		expect(btn!.parentElement).not.toBe(root);
	});

	// SC-169 ROUND 3 SUPERSEDES the counter case of this fix, the same way it superseded the
	// statblock case below — `ds-counter` opted into chrome in the rollout, so its pencil is a
	// panel item now. What this case still uniquely proves is the OTHER anchor shape: counter's
	// `authoringAnchor()` is ROOT (the card plate CSS borders root directly for this element,
	// unlike statblock's nested `.dse-sb`), so it pins that the panel — and therefore the
	// pencil — lands on root for a root-anchored element and does NOT wander into the nested
	// `.dse-counter` wrapper. The pre-chrome "direct child of root" contract is still under
	// test above, on `wideCardDef()`, which declares no chrome slot.
	test('narrow card (counter — root itself is the visible box): the chrome panel, and the pencil in it, mount on ROOT', async () => {
		const { deps } = makeCompendiumDeps();
		await withAuthoringControlsOn(deps);
		const pipeline = new ElementPipeline(deps);
		const host = makeHost('ds-counter');

		await pipeline.run(counterElement, 'name: Health\ncurrent_value: 7\nmax_value: 20\nmin_value: 0\n', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const buttons = root.querySelectorAll<HTMLElement>(EDIT_BTN);
		expect(buttons).toHaveLength(1); // never two pencils
		const btn = buttons[0];
		const panel = root.querySelector('.dse-chrome');
		expect(panel).not.toBeNull();
		expect(btn.parentElement).toBe(panel);
		expect(btn.getAttribute('data-dse-chrome-item')).toBe('edit');
		// The anchor is root itself for this element, so the panel is root's own child …
		expect(panel!.parentElement).toBe(root);
		expect(root.classList.contains('dse-chrome-anchor')).toBe(true);
		// … and nothing of the chrome ended up inside the element's content wrapper.
		expect(root.querySelector('.dse-counter')!.contains(btn)).toBe(false);
	});

	// SC-169 SUPERSEDES the statblock case of this fix. The statblock opted into the
	// framework element chrome, and chrome OWNS the edit affordance: the pencil is a panel
	// item (`.dse-chrome`, positioned on the card's top edge) instead of a card-corner
	// button, so there is never a second pencil. `authoringAnchor()` is untouched and
	// still governs every element WITHOUT a chrome slot (the two cases above). The
	// relocation is invisible to the print freeze — `[data-dse-print="on"] .dse-btn
	// { display: none }` already hid the card-corner pencil on paper, which is why
	// `statblock--steel-print.png` and `statblock-edit-btn--steel-print.png` carry the
	// same hash in the baseline.
	test('SC-169: a chrome-bearing element (statblock) puts the pencil in the chrome panel, and only there', async () => {
		const { deps } = makeCompendiumDeps();
		await withAuthoringControlsOn(deps);
		const pipeline = new ElementPipeline(deps);
		const host = makeHost('ds-statblock');

		await pipeline.run(statblockElement, 'type: statblock\nname: Bare Creature\nstamina: "10"\n', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const card = root.querySelector('.dse-sb');
		expect(card).not.toBeNull();

		const buttons = root.querySelectorAll<HTMLElement>(EDIT_BTN);
		expect(buttons).toHaveLength(1);
		const btn = buttons[0];
		const panel = root.querySelector('.dse-chrome');
		expect(panel).not.toBeNull();
		expect(btn.parentElement).toBe(panel);
		expect(btn.getAttribute('data-dse-chrome-item')).toBe('edit');
		// The PANEL still hangs off `authoringAnchor()` — that is how it gets seated on the
		// card's top edge — so the pencil is still a descendant of `.dse-sb`. What changed is
		// that it is no longer a DIRECT child of the card (the pre-SC-169 placement): it is a
		// panel item, out of flow, above the card's top edge.
		expect(card!.contains(btn)).toBe(true);
		expect(btn.parentElement).not.toBe(card);
		expect(panel!.parentElement).toBe(card);
	});
});

describe('SC-145: horizontal-rule opts out of the generic pencil entirely (no meaningful YAML to edit)', () => {
	test('noAuthoringButton is set', () => {
		expect(horizontalRuleElement.noAuthoringButton).toBe(true);
	});

	test('authoringControls on: no Edit button renders for ds-hr', async () => {
		const { deps } = makeCompendiumDeps();
		await withAuthoringControlsOn(deps);
		const pipeline = new ElementPipeline(deps);
		const host = makeHost('ds-hr');

		await pipeline.run(horizontalRuleElement, '', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelector(EDIT_BTN)).toBeNull();
	});
});

describe('SC-145: authoringControls off (the default): no authoring buttons render anywhere', () => {
	test('wide card (DisplayCardView) and counter both render with zero Edit buttons', async () => {
		const { deps } = makeCompendiumDeps(); // authoringControls left at its default (false)
		const pipeline = new ElementPipeline(deps);

		const wideHost = makeHost('ds-test-wide-card');
		await pipeline.run(wideCardDef(), JSON.stringify({ name: 'Chosen One', body: 'Some prose.' }), wideHost);
		const wideRoot = wideHost.containerEl.firstElementChild as HTMLElement;
		expect(wideRoot.querySelector(EDIT_BTN)).toBeNull();

		const counterHost = makeHost('ds-counter');
		await pipeline.run(counterElement, 'name: Health\ncurrent_value: 7\nmax_value: 20\nmin_value: 0\n', counterHost);
		const counterRoot = counterHost.containerEl.firstElementChild as HTMLElement;
		expect(counterRoot.querySelector(EDIT_BTN)).toBeNull();
	});
});
