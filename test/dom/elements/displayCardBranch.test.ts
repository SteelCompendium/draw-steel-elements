// test/dom/elements/displayCardBranch.test.ts — contract tests for the composition seam in
// DisplayCardView (CardLayout.ts): the mechanism `layout.steel` adopters (SC-100 Task 3's
// kit rebuild, then whatever family follows it) rely on.
//
// SC-144 shrank this seam. It used to be THEME-conditional — a layout with a composition
// rendered the base DOM under the legacy theme, and the view carried a `cx.theme.onChange`
// subscription so a picker flip swapped branches live on a mounted view. With the legacy
// theme dropped there is only one theme, so the branch is a static property of the LAYOUT
// and cannot change over a view's lifetime. The four theme-switching contracts (a/b/c and
// the re-render lifecycle guards) tested behaviour that no longer exists and went with it.
//
// What survives is the part that is still load-bearing, restated for the new rule:
//   1. Branch selection: `layout.steel` present => the composition; absent => the base DOM.
//      Neither depends on the active theme id any more — proven by rendering under 'steel'
//      and under an arbitrary open-union snippet id and getting identical DOM.
//   2. No theme subscription is EVER registered, for either kind of layout, across mount
//      and repeated update() calls. This is the direct guard on the deleted machinery: it
//      pins that the branch can't be made to churn at runtime again by accident, and it
//      subsumes SC-100's old I1 fix (a re-enterable onMount registering a fresh closure per
//      update, leaking listeners unboundedly).
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
import { App, Plugin } from '../../mocks/obsidian';
import { DisplayCardView } from '@/elements/shared/CardLayout';
import type { CardLayout, SteelBand } from '@/elements/shared/CardLayout';

interface TestModel {
	name: string;
	note: string;
}

const MODEL: TestModel = { name: 'Panther', note: 'A sleek predator.' };

/** One macrotask — long enough for any chain of the mock's async renderMarkdown/microtask
 *  awaits to settle. Established pattern in this suite (test/dom/framework/seams.test.ts,
 *  test/mocks/obsidian-core.ts's own `macrotask()` helper). */
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

/** A minimal but real Steel composition — NOT the kit composition (SC-100 Task 3's
 *  concern); just enough to prove the seam's generic branch mechanics. */
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

async function renderUnder(
	cx: RenderContext,
	theme: ThemeServiceInternal,
	layout: CardLayout<TestModel>,
	themeId: string,
): Promise<string> {
	theme.setActive(themeId);
	const view = new DisplayCardView(cx, layout);
	const root = document.createElement('div');
	await view.mount(root, MODEL);
	return root.innerHTML;
}

describe('DisplayCardView branch selection: the layout decides, not the theme (SC-144)', () => {
	test('a layout WITH `steel` renders the composition; one without renders the base DOM', async () => {
		const host = makeHost();
		const { cx, theme } = makeCx(host);

		const baseHtml = await renderUnder(cx, theme, steellessLayout(), 'steel');
		const steelHtml = await renderUnder(cx, theme, steelLayout(), 'steel');

		// Sanity: both fixtures actually rendered a card.
		expect(baseHtml).toContain('Panther');
		expect(steelHtml).toContain('Panther');

		// The composition is distinguishable by the cardHead grammar, which the base
		// branch never emits.
		expect(steelHtml).toContain('dse-head');
		expect(baseHtml).not.toContain('dse-head');
		expect(steelHtml).not.toBe(baseHtml);
	});

	test('the active theme id no longer changes either branch (an arbitrary snippet id renders identically to "steel")', async () => {
		const host = makeHost();
		const { cx, theme } = makeCx(host);

		const baseUnderSteel = await renderUnder(cx, theme, steellessLayout(), 'steel');
		const baseUnderSnippet = await renderUnder(cx, theme, steellessLayout(), 'parchment');
		expect(baseUnderSnippet).toBe(baseUnderSteel);

		// Pre-SC-144 this was the theme-fallback case: a layout with a composition
		// rendered the BASE DOM under any non-steel id. It now gets the composition.
		const steelUnderSteel = await renderUnder(cx, theme, steelLayout(), 'steel');
		const steelUnderSnippet = await renderUnder(cx, theme, steelLayout(), 'parchment');
		expect(steelUnderSnippet).toBe(steelUnderSteel);
		expect(steelUnderSnippet).toContain('dse-head');
	});
});

describe('DisplayCardView registers NO theme subscription (SC-144 — the branch cannot change at runtime)', () => {
	test('a layout with a Steel composition: mount + two update() calls register zero onChange listeners, and a live theme change is inert', async () => {
		const host = makeHost();
		const { cx, theme } = makeCx(host);
		theme.setActive('steel');
		const onChangeSpy = jest.spyOn(theme, 'onChange');
		const view = new DisplayCardView(cx, steelLayout());
		const root = document.createElement('div');

		await view.mount(root, MODEL);
		await view.update({ ...MODEL, note: 'Updated once.' });
		await view.update({ ...MODEL, note: 'Updated twice.' });
		expect(onChangeSpy).not.toHaveBeenCalled();

		const before = root.innerHTML;
		theme.setActive('parchment');
		await flush();
		expect(root.innerHTML).toBe(before);
	});

	test('a steel-less layout across mount + update() never registers a subscription either', async () => {
		const host = makeHost();
		const { cx, theme } = makeCx(host);
		theme.setActive('steel');
		const onChangeSpy = jest.spyOn(theme, 'onChange');
		const view = new DisplayCardView(cx, steellessLayout());
		const root = document.createElement('div');

		await view.mount(root, MODEL);
		await view.update({ ...MODEL, note: 'Updated.' });

		expect(onChangeSpy).not.toHaveBeenCalled();
	});
});
