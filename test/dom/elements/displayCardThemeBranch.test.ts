// test/dom/elements/displayCardThemeBranch.test.ts — Plan 24 / SC-100 Task 2: contract
// tests for the theme-conditional composition seam in DisplayCardView (CardLayout.ts) — the
// pattern every future `layout.steel` adopter (Task 3's kit rebuild, then whatever family
// follows it) relies on. Real `createThemeService` over a real `PreferenceStore` (same
// convention as displayFamily.test.ts's `makeInlineDeps()`), driving theme switches through
// `theme.setActive()` — never by hand-stamping `data-dse-theme` directly, since the pattern
// under test is "does a real theme-pref change reflow into a real re-render."
//
// Four contracts (plan Architecture section, Task 2 Step 3):
//   (a) a steel-less layout renders byte-identical DOM under EVERY theme (legacy, steel, and
//       an arbitrary open-union snippet id) — both across fresh mounts AND across a live
//       switch on one mounted view (no `layout.steel` ⇒ no re-render subscription at all).
//   (b) a layout WITH `steel` still renders the LEGACY DOM verbatim under every non-steel
//       theme (legacy is the canonical fallback for every theme id that isn't literally
//       'steel', not just literal 'legacy') — and, as a sanity check that the branch exists
//       at all, renders something DIFFERENT under 'steel'.
//   (c) a live `setActive('legacy') -> setActive('steel')` and back swaps the DOM in both
//       directions, never touches a pipeline-owned sibling appended to root AFTER mount (the
//       authoring-pencil stand-in), and unloads the outgoing branch's owned children.
//   (d) is evidence, not a test in this file — see task-2-report.md for the can-fail
//       reproduction (each contract's guarding code was temporarily broken, the exact test
//       above was watched to fail, then the code was restored and the suite re-run green).
//
// Plus two guard tests for Step 2's explicit lifecycle contract: the re-render handler
// refuses to run before the first render has completed (asserted, not silently tolerated),
// and it never fires again once the view has unloaded (owner-registered auto-unsubscribe).
import { createRenderContext } from '@/framework/context';
import type { RenderContext } from '@/framework/context';
import { createThemeService } from '@/framework/seams/theme';
import type { ThemeServiceInternal } from '@/framework/seams/theme';
import { createPreferenceStore } from '@/framework/seams/prefs';
import type { PrefsStorage } from '@/framework/seams/prefs';
import { createReferenceService } from '@/framework/seams/refs';
import { createValidationService } from '@/framework/validation';
import { createSessionStore } from '@/framework/session';
import { createRollService } from '@/framework/roll/service';
import { DEFAULT_SETTINGS } from '@model/Settings';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { App, Plugin, Component } from '../../mocks/obsidian';
import { DisplayCardView } from '@/elements/shared/CardLayout';
import type { CardLayout, SteelBand } from '@/elements/shared/CardLayout';

interface TestModel {
	name: string;
	note: string;
}

const MODEL: TestModel = { name: 'Panther', note: 'A sleek predator.' };

/** One macrotask — long enough for any chain of the mock's async renderMarkdown/microtask
 *  awaits to settle. Established pattern in this suite (test/dom/framework/seams.test.ts,
 *  test/mocks/obsidian-core.ts's own `macrotask()` helper) for exactly this shape: a
 *  fire-and-forget theme.onChange callback (`void this.onThemeChange(...)`, CardLayout.ts)
 *  that the test has no promise handle to await directly. */
function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeHost(): BlockHost & { containerEl: HTMLElement } {
	const containerEl = document.createElement('div');
	return {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child) => child,
		getBlockInfo: () => ({ language: 'ds-test', lineStart: 0, lineEnd: 1 }),
		replaceSource: async () => true,
		blockKey: () => 'Note.md::ds-test::0',
	};
}

/** Real theme service over a real prefs store (no attrs beyond the builtin `theme` key
 *  needed — this seam doesn't read any other pref). Returns the internal handle
 *  (setActive) alongside the RenderContext the view consumes. */
function makeCx(host: BlockHost): { cx: RenderContext; theme: ThemeServiceInternal } {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	const session = createSessionStore();
	const cx = createRenderContext({
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		host,
		theme,
		prefs,
		refs,
		session,
		roll: createRollService(prefs),
		validation,
	});
	return { cx, theme };
}

function steellessLayout(): CardLayout<TestModel> {
	return {
		title: (m) => m.name,
		flavor: (m) => m.note,
	};
}

/** A minimal but real Steel composition — NOT the kit composition (Task 3's concern);
 *  just enough to prove the seam's generic branch/re-render mechanics. */
function steelLayout(): CardLayout<TestModel> {
	return {
		title: (m) => m.name,
		flavor: (m) => m.note,
		steel: {
			eyebrow: () => 'Test Kind',
			crestIcon: () => 'backpack',
			bands: (m): SteelBand[] => [
				{
					head: 'Test Band',
					render: (container, renderMarkdown) => renderMarkdown(m.note, container.createDiv({ cls: 'dse-test-band-body' })),
				},
			],
		},
	};
}

describe('SC-100 Task 2 contract (a): a steel-less layout renders byte-identical DOM under every theme', () => {
	test('fresh mounts under legacy / steel / an arbitrary snippet id ("parchment") produce identical DOM', async () => {
		const host = makeHost();
		const { cx, theme } = makeCx(host);
		const layout = steellessLayout();

		async function renderUnder(themeId: string): Promise<string> {
			theme.setActive(themeId);
			const view = new DisplayCardView(cx, layout);
			const root = document.createElement('div');
			await view.mount(root, MODEL);
			return root.innerHTML;
		}

		const legacyHtml = await renderUnder('legacy');
		const steelHtml = await renderUnder('steel');
		const snippetHtml = await renderUnder('parchment');

		expect(steelHtml).toBe(legacyHtml);
		expect(snippetHtml).toBe(legacyHtml);
		// Sanity: the fixture actually rendered something (not two empty strings matching).
		expect(legacyHtml).toContain('Panther');
	});

	test('a LIVE theme switch on one mounted steel-less view never changes the DOM (no subscription registered at all)', async () => {
		const host = makeHost();
		const { cx, theme } = makeCx(host);
		const layout = steellessLayout();

		theme.setActive('legacy');
		const view = new DisplayCardView(cx, layout);
		const root = document.createElement('div');
		await view.mount(root, MODEL);
		const before = root.innerHTML;

		theme.setActive('steel');
		await flush();
		theme.setActive('parchment');
		await flush();

		expect(root.innerHTML).toBe(before);
	});
});

describe('SC-100 Task 2 contract (b): a layout WITH steel renders the legacy DOM verbatim under every non-steel theme', () => {
	test('legacy DOM under "legacy" and under a snippet id ("parchment") matches the steel-less baseline; "steel" renders something else', async () => {
		const host = makeHost();
		const { cx, theme } = makeCx(host);
		const bareLayout = steellessLayout();
		const withSteel = steelLayout();

		async function renderUnder(layout: CardLayout<TestModel>, themeId: string): Promise<string> {
			theme.setActive(themeId);
			const view = new DisplayCardView(cx, layout);
			const root = document.createElement('div');
			await view.mount(root, MODEL);
			return root.innerHTML;
		}

		const baselineLegacy = await renderUnder(bareLayout, 'legacy');
		const withSteelUnderLegacy = await renderUnder(withSteel, 'legacy');
		const withSteelUnderSnippet = await renderUnder(withSteel, 'parchment');

		expect(withSteelUnderLegacy).toBe(baselineLegacy);
		expect(withSteelUnderSnippet).toBe(baselineLegacy);

		// Sanity that the branch actually exists: under 'steel' this SAME layout renders
		// something different — the cardHead grammar (.dse-head), never present in legacy.
		const underSteel = await renderUnder(withSteel, 'steel');
		expect(underSteel).not.toBe(baselineLegacy);
		expect(underSteel).toContain('dse-head');
		expect(baselineLegacy).not.toContain('dse-head');
	});
});

describe('SC-100 Task 2 contract (c): a live theme switch swaps the DOM both directions, preserves a pipeline-owned sibling, and unloads the outgoing branch\'s owned children', () => {
	test('legacy -> steel -> legacy', async () => {
		const host = makeHost();
		const { cx, theme } = makeCx(host);
		const layout = steelLayout();

		theme.setActive('legacy');
		const view = new DisplayCardView(cx, layout);
		const root = document.createElement('div');
		await view.mount(root, MODEL);

		// Compare the CARD's own outerHTML (not root.innerHTML) across the whole test —
		// the pencil sibling is appended to root right after this and stays there for
		// the rest of the test, so root.innerHTML is never the same two-element shape
		// twice; the card itself is what must swap-then-swap-back byte-for-byte.
		const legacyHtml = root.querySelector('.dse-card')!.outerHTML;
		expect(root.querySelector('.dse-head')).toBeNull();

		// The pipeline appends siblings to `root` AFTER mount() returns (e.g. the
		// authoring pencil — pipeline.ts, iconButton(root, ...)). A re-render must never
		// touch this: `rootEl.empty()` would destroy it too.
		const pencil = root.createDiv({ cls: 'pencil-stand-in' });

		// Simulate an owned child the legacy render's markdown/nested-feature machinery
		// registered (this.addChild — ElementView tracks these as "ownedChildren").
		// Proves the swap actually UNLOADS the outgoing branch's children, not merely
		// discards their DOM.
		// The mock Component's self-referencing generics don't structurally satisfy the
		// real `obsidian` package's Component type under tsc — established convention
		// (test/dom/framework/seams.test.ts's fakeOwner()) is to cast through `any`.
		const legacyOnunload = jest.fn();
		class LegacyChild extends Component {
			onunload(): void {
				legacyOnunload();
			}
		}
		view.addChild(new LegacyChild() as any);

		theme.setActive('steel');
		await flush();

		expect(root.contains(pencil)).toBe(true);
		expect(root.querySelector('.dse-head')).not.toBeNull();
		const steelHtml = root.querySelector('.dse-card')!.outerHTML;
		expect(steelHtml).not.toBe(legacyHtml);
		expect(legacyOnunload).toHaveBeenCalledTimes(1);

		const steelOnunload = jest.fn();
		class SteelChild extends Component {
			onunload(): void {
				steelOnunload();
			}
		}
		view.addChild(new SteelChild() as any);

		theme.setActive('legacy');
		await flush();

		expect(root.contains(pencil)).toBe(true);
		expect(root.querySelector('.dse-head')).toBeNull();
		const backToLegacyHtml = root.querySelector('.dse-card')!.outerHTML;
		expect(backToLegacyHtml).not.toBe(steelHtml);
		expect(backToLegacyHtml).toBe(legacyHtml); // swapped back to the SAME legacy DOM
		expect(steelOnunload).toHaveBeenCalledTimes(1);
	});
});

describe('SC-100 Task 2: re-render lifecycle guards', () => {
	test('the theme-change handler throws if invoked before the first render has completed (asserted, not silently tolerated)', async () => {
		const host = makeHost();
		const { cx, theme } = makeCx(host);
		theme.setActive('legacy');
		const view = new DisplayCardView(cx, steelLayout());
		const root = document.createElement('div');

		// Reach the private handler directly (structurally unreachable in production —
		// it's only ever registered from inside onMount, AFTER the first render — but the
		// brief calls for the guard to be ASSERTED, so it must fail loudly if provoked).
		await expect((view as unknown as { onThemeChange: (root: HTMLElement) => Promise<void> }).onThemeChange(root)).rejects.toThrow(
			/fired before the first render completed/,
		);
	});

	test('once the view unloads, a later theme change no longer re-renders it (owner-registered auto-unsubscribe)', async () => {
		const host = makeHost();
		const { cx, theme } = makeCx(host);
		theme.setActive('legacy');
		const view = new DisplayCardView(cx, steelLayout());
		const root = document.createElement('div');
		await view.mount(root, MODEL);
		const legacyHtml = root.innerHTML;

		view.unload();
		theme.setActive('steel');
		await flush();

		// Had the subscription survived unload, this would now contain .dse-head.
		expect(root.innerHTML).toBe(legacyHtml);
		expect(root.querySelector('.dse-head')).toBeNull();
	});
});

// Review fix (Task 2 I1, task-2-review.md): `onMount` is re-enterable — ElementView.update()'s
// default path (no onUpdate override here) re-invokes onMount on every model change, and
// SidebarPanel.handleExternalChange calls `previous.update(model)` directly as its
// live-preview refresh fast path. Pins that the theme.onChange subscription registers
// EXACTLY ONCE per view instance no matter how many times onMount re-enters via update() —
// distinct closures never dedupe by content, so without a guard this count grows unboundedly
// (1 -> 2 -> 3 -> ..., reviewer's empirical finding) and none is ever unsubscribed until the
// view itself unloads.
describe('SC-100 Task 2 fix (I1): the theme.onChange subscription registers exactly once per view instance, even across repeated update() calls', () => {
	test('mount + two update() calls: theme.onChange is called exactly once total', async () => {
		const host = makeHost();
		const { cx, theme } = makeCx(host);
		theme.setActive('legacy');
		const onChangeSpy = jest.spyOn(theme, 'onChange');
		const view = new DisplayCardView(cx, steelLayout());
		const root = document.createElement('div');

		await view.mount(root, MODEL);
		expect(onChangeSpy).toHaveBeenCalledTimes(1);

		await view.update({ ...MODEL, note: 'Updated once.' });
		expect(onChangeSpy).toHaveBeenCalledTimes(1);

		await view.update({ ...MODEL, note: 'Updated twice.' });
		expect(onChangeSpy).toHaveBeenCalledTimes(1);

		// And the single surviving subscription still works: a live theme switch after
		// two updates still re-renders correctly (the guard didn't accidentally break
		// re-render, it only de-duplicated registration).
		theme.setActive('steel');
		await flush();
		expect(root.querySelector('.dse-head')).not.toBeNull();
	});

	test('a steel-less layout across mount + update() never registers a subscription at all', async () => {
		const host = makeHost();
		const { cx, theme } = makeCx(host);
		theme.setActive('legacy');
		const onChangeSpy = jest.spyOn(theme, 'onChange');
		const view = new DisplayCardView(cx, steellessLayout());
		const root = document.createElement('div');

		await view.mount(root, MODEL);
		await view.update({ ...MODEL, note: 'Updated.' });

		expect(onChangeSpy).not.toHaveBeenCalled();
	});
});
