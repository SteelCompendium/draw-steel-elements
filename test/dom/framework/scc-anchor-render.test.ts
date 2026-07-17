// F2 final-review fix wave, MUST-FIX #1 — §4.3(a)/§4.4: rewriteSccAnchors was never
// wired into the element render path. framework/view.ts's ElementView.renderMarkdown
// called MarkdownRenderer.render and returned; nothing in framework/context.ts or the
// pipeline carried the SccResolver, so every inline scc.v1: link inside a rendered
// compendium feature/statblock card stayed an inert external anchor.
//
// This test drives the REAL ElementPipeline (same harness convention as pipeline.test.ts)
// with a minimal element whose view calls `this.renderMarkdown(...)` — the one render
// path every migrated element uses — and asserts the resulting anchor was rewritten
// against a fake vault-hit resolver. It was RED before the fix (cx.sccAnchors did not
// exist, renderMarkdown never called rewriteSccAnchors); wiring context.ts/pipeline.ts/
// view.ts (+ main.ts's construction-order fix) turns it GREEN.
//
// The jest MarkdownRenderer mock (test/mocks/obsidian-core.ts) only appends the raw
// markdown as a text node — by design (F3 §4.2: "tests assert on text content, never on
// rendered markdown HTML"), it never produces real anchors. A scoped jest.spyOn just for
// this file stands in for Obsidian's real markdown pipeline (a `[text](href)` link becomes
// a real `<a>`, tagged `external-link` exactly like Obsidian tags any unrecognized-scheme
// href) — restored after every test, so no other suite is affected.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { ElementDefinition } from '../../../src/framework/registry';
import { ElementView } from '../../../src/framework/view';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, MarkdownRenderer } from '../../mocks/obsidian';
import type { SccAnchorResolver } from '@/refs/rewriteSccAnchors';
import { fakeTFile } from '../../fakes/fakeObsidian';

const SCC_HREF = 'scc.v1:mcdm.heroes.v1/rule.combat/turn';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- structural marker, no fields
interface EmptyModel {}

/** Mounts one target div and renders a single markdown link into it via
 *  ElementView.renderMarkdown — the wiring point under test. */
class MarkdownHostView extends ElementView<EmptyModel> {
	protected async onMount(root: HTMLElement): Promise<void> {
		const target = root.createDiv({ cls: 'md-target' });
		await this.renderMarkdown(`[Turn](${SCC_HREF})`, target);
	}
}

function sccHostDef(): ElementDefinition<EmptyModel> {
	return {
		id: 'test-scc-anchor-host',
		name: 'Test Scc Anchor Host',
		aliases: ['ds-test-scc-anchor-host'],
		shape: 'static',
		parse: () => ({}),
		createView: (cx) => new MarkdownHostView(cx),
	};
}

function makeHost(): BlockHost & { containerEl: HTMLElement } {
	const containerEl = document.createElement('div');
	return {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: jest.fn((child: unknown) => child),
		getBlockInfo: jest.fn(() => ({ language: 'ds-test', lineStart: 0, lineEnd: 1 })),
		replaceSource: jest.fn(async () => true),
		blockKey: jest.fn(() => 'Note.md::ds-test::0'),
	} as unknown as BlockHost & { containerEl: HTMLElement };
}

function makeDeps(sccAnchors?: SccAnchorResolver): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
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
		sccAnchors,
	};
}

describe('F2 fix wave MUST-FIX #1 — rewriteSccAnchors wired into ElementView.renderMarkdown', () => {
	let renderSpy: jest.SpyInstance;

	beforeEach(() => {
		renderSpy = jest
			.spyOn(MarkdownRenderer, 'render')
			.mockImplementation(async (_app: unknown, markdown: string, el: HTMLElement) => {
				const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(markdown);
				if (!match) {
					el.appendChild(el.ownerDocument.createTextNode(markdown));
					return;
				}
				const anchor = el.ownerDocument.createElement('a');
				anchor.textContent = match[1];
				anchor.setAttribute('href', match[2]);
				// Obsidian's own default for an unrecognized-scheme href (mirrors what
				// rewriteSccAnchors' vault branch has to remove — see SccResolver.test.ts /
				// rewriteSccAnchors.test.ts).
				anchor.classList.add('external-link');
				el.appendChild(anchor);
			});
	});

	afterEach(() => {
		renderSpy.mockRestore();
	});

	test('an scc.v1: link inside a rendered element becomes an internal-link (fake resolver vault-hit)', async () => {
		const resolver: SccAnchorResolver = {
			resolve: jest.fn(() => ({
				kind: 'vault' as const,
				file: fakeTFile('DS Compendium/rule/combat/turn.md'),
				linkpath: 'DS Compendium/rule/combat/turn.md',
			})),
		};
		const pipeline = new ElementPipeline(makeDeps(resolver));
		const host = makeHost();

		await pipeline.run(sccHostDef(), '', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const anchor = root.querySelector('a')!;
		expect(anchor).not.toBeNull();
		expect(anchor.classList.contains('internal-link')).toBe(true);
		expect(anchor.classList.contains('external-link')).toBe(false);
		expect(anchor.getAttribute('href')).toBe('DS Compendium/rule/combat/turn.md');
		expect(resolver.resolve).toHaveBeenCalledWith(SCC_HREF);
	});

	test('cx.sccAnchors absent (no resolver wired): the anchor is left exactly as Obsidian rendered it', async () => {
		const pipeline = new ElementPipeline(makeDeps(undefined));
		const host = makeHost();

		await pipeline.run(sccHostDef(), '', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const anchor = root.querySelector('a')!;
		expect(anchor.classList.contains('external-link')).toBe(true);
		expect(anchor.getAttribute('href')).toBe(SCC_HREF);
	});
});
