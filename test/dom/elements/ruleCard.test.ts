// test/dom/elements/ruleCard.test.ts — D6 Task 8 (spec §3): ds-rule, genericCard()'s only
// instance. Two claims under test, mirroring displayFamily.test.ts's convention:
//   1. Inline: the block body is NOT YAML data at all — it's raw markdown (OD-D6-7's
//      reference-only, raw-markdown-fallback decision: rules ship no SDK model). The
//      pure-model DisplayCardView path renders it as-is (title falls back to the
//      element's human name — there's no frontmatter in inline mode to source one from),
//      and it goes through renderMarkdown (not plain setText), matching every other
//      display card's body field.
//      NB: the inline body MUST span more than one line — `withReference`'s
//      `detectWholeBlockRef` (Task 3) treats a single-line, non-YAML-mapping block body as
//      "bare-slug reference sugar" (same rule bare slugs like `panther`/`bleeding` rely
//      on); a real single-sentence homebrew rule would misfire as a ref lookup. A second
//      paragraph (blank-line-separated, folded to one literal `\n` by YAML's plain-scalar
//      rules — verified against the real `yaml` package this repo's parseYaml wraps) is
//      the same shape every multi-paragraph md-dse rule body already has, so this is not
//      an artificial test-only constraint.
//   2. By-SCC: a whole-block reference (bare slug + full `scc.v1:` code) resolves against
//      a fake vault seeded with the REAL md-dse `rule/combat/opportunity-attack.md`
//      fixture -> hybrid mode, title from frontmatter `item_name`, body = the resolved
//      file's own source markdown (NOT a no-op — genericLayout sets `useSourceBody: false`
//      because GenericNote.body already IS the source body on the by-SCC path too, built
//      by TYPE_ADAPTERS' `genericNoteAdapter` (typeAdapters.ts) rather than the still-TODO
//      `this.source!.body` hybrid path CardLayout.ts documents for the SDK-backed
//      families), and its embedded `scc.v1:` links get rewritten (§4.3(a)) — asserted with
//      a scoped MarkdownRenderer.render override (same convention as
//      test/dom/framework/scc-anchor-render.test.ts, generalized to multiple links inside
//      one prose string instead of one bare `[text](href)`).
//   Bare-slug scoping: `ds-rule` given `bleeding` (a condition, not a rule) error-cards —
//      same invariant displayFamily.test.ts pins for `ds-kit`.
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementPipelineDeps } from '@/framework/pipeline';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { createThemeService } from '@/framework/seams/theme';
import { createPreferenceStore } from '@/framework/seams/prefs';
import { createRollService } from '@/framework/roll/service';
import type { PrefsStorage } from '@/framework/seams/prefs';
import { createReferenceService } from '@/framework/seams/refs';
import { createValidationService } from '@/framework/validation';
import { createSessionStore } from '@/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, MarkdownRenderer } from '../../mocks/obsidian';
import { ruleElement } from '@/elements/display';
import { makeHost, makeCompendiumDeps, loadMdDseFixture } from './_refHarness';

const RULE_REL = 'rule/combat/opportunity-attack.md';
const RULE_CODE = 'mcdm.heroes.v1/rule.combat/opportunity-attack';

// Deliberately NOT example.yaml's content — a purpose-built, two-paragraph inline body
// (see file header re: single-line bodies misfiring as bare-slug references) exercising
// both markdown emphasis and a plain sentence.
const INLINE_BODY =
	'A homebrew rule can be written directly inline, with **bold** and _italic_ markdown, and needs no SDK model at all.\n\n' +
	'This second paragraph exists solely so the whole-block-reference detector treats the body as inline data rather than a compendium reference.';

/** Real service instances, same convention as displayFamily.test.ts's makeInlineDeps() —
 *  no compendium/sccAnchors: the inline-mode tests never resolve a reference. */
function makeInlineDeps(): ElementPipelineDeps {
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
	};
}

function inlineHost(language: string): BlockHost & { containerEl: HTMLElement } {
	const containerEl = document.createElement('div');
	return {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child) => child,
		getBlockInfo: () => ({ language, lineStart: 0, lineEnd: 1 }),
		replaceSource: async () => true,
		blockKey: () => `Note.md::${language}::0`,
	};
}

describe('D6 Task 8: ds-rule (genericCard) inline rendering', () => {
	test('inline raw-markdown body: no SDK model, title falls back to "Rule", body renders through renderMarkdown', async () => {
		const renderSpy = jest.spyOn(MarkdownRenderer, 'render');
		const host = inlineHost('ds-rule');
		await new ElementPipeline(makeInlineDeps()).run(ruleElement, INLINE_BODY, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.querySelector('.dse-card__title')!.textContent).toBe('Rule');
		// No frontmatter in inline mode -> genericLayout's type badge never renders.
		expect(root.querySelector('.dse-card__badge')).toBeNull();

		const body = root.querySelector('.dse-card__body')!;
		expect(body.textContent).toContain('A homebrew rule can be written directly inline');
		expect(body.textContent).toContain('**bold**');
		// Went through the markdown render path (not valEl.setText()) — the dispatch
		// recorder is the reliable signal (F3 §4.2: DOM text alone can't distinguish
		// the two paths under the jest mock).
		expect(renderSpy.mock.calls.some((c) => c[1] === INLINE_BODY)).toBe(true);
	});
});

describe('D6 Task 8: ds-rule by-SCC reference (spec §1, §2.3, §3)', () => {
	test('full scc.v1: code and bare slug both resolve, no error card, title/body from the resolved file', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, RULE_REL);

		const codeHost = makeHost('ds-rule');
		await new ElementPipeline(deps).run(ruleElement, `scc.v1:${RULE_CODE}`, codeHost);
		const codeRoot = codeHost.containerEl.firstElementChild as HTMLElement;
		expect(codeRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(codeRoot.querySelector('.dse-card__title')!.textContent).toBe('Opportunity Attacks');
		// By-SCC: frontmatter `type: rule` -> genericLayout's badge renders (unlike inline).
		expect(codeRoot.querySelector('.dse-card__badge')!.textContent).toBe('Rule');
		expect(codeRoot.querySelector('.dse-card__body')!.textContent).toContain('opportunity attack');

		const slugHost = makeHost('ds-rule');
		await new ElementPipeline(deps).run(ruleElement, 'opportunity-attack', slugHost);
		const slugRoot = slugHost.containerEl.firstElementChild as HTMLElement;
		expect(slugRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(slugRoot.querySelector('.dse-card__title')!.textContent).toBe('Opportunity Attacks');
	});

	test('embedded scc.v1: links inside the resolved body are rewritten (§4.3(a))', async () => {
		// Generalizes scc-anchor-render.test.ts's single-link scoped mock to multiple
		// `[text](href)` links embedded inside one prose string — Obsidian's real
		// MarkdownRenderer turns each into an anchor; the jest mock (by design, F3 §4.2)
		// only ever appends raw text, so this file-scoped override stands in for it.
		const renderSpy = jest.spyOn(MarkdownRenderer, 'render').mockImplementation(
			async (_app: unknown, markdown: string, el: HTMLElement) => {
				const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
				let lastIndex = 0;
				let match: RegExpExecArray | null;
				while ((match = linkRe.exec(markdown))) {
					if (match.index > lastIndex) {
						el.appendChild(el.ownerDocument.createTextNode(markdown.slice(lastIndex, match.index)));
					}
					const anchor = el.ownerDocument.createElement('a');
					anchor.textContent = match[1];
					anchor.setAttribute('href', match[2]);
					anchor.classList.add('external-link');
					el.appendChild(anchor);
					lastIndex = linkRe.lastIndex;
				}
				if (lastIndex < markdown.length) {
					el.appendChild(el.ownerDocument.createTextNode(markdown.slice(lastIndex)));
				}
			},
		);

		try {
			const { vault, deps } = makeCompendiumDeps();
			loadMdDseFixture(vault, RULE_REL);

			const host = makeHost('ds-rule');
			await new ElementPipeline(deps).run(ruleElement, `scc.v1:${RULE_CODE}`, host);
			const root = host.containerEl.firstElementChild as HTMLElement;

			expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
			// None of the linked codes (adjacent/shifting/melee/free-strike/…) are synced
			// locally in this test's tiny vault -> DEFAULT_SETTINGS.sccWebFallback (true)
			// resolves every one of them to "web", not "vault" -> `.ds-scc-web` gets added
			// (the "vault" branch is the one that strips `.external-link`; "web" doesn't —
			// rewriteSccAnchors.ts — so this only asserts the web-fallback class landed).
			// The vault-hit branch itself is already covered end-to-end by
			// test/dom/framework/scc-anchor-render.test.ts and rewriteSccAnchors.test.ts.
			const webLinks = root.querySelectorAll('a.ds-scc-web');
			expect(webLinks.length).toBeGreaterThan(0);
			expect(root.querySelectorAll('a.internal-link').length).toBe(0);
		} finally {
			renderSpy.mockRestore();
		}
	});

	test('bare slug scoped to a DIFFERENT type family: ds-rule given "bleeding" (a condition) error-cards', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, RULE_REL);
		loadMdDseFixture(vault, 'condition/bleeding.md');

		const host = makeHost('ds-rule');
		await new ElementPipeline(deps).run(ruleElement, 'bleeding', host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const card = root.querySelector('.dse-error-card-message');
		expect(card?.textContent).toContain('No compendium entry matches');
		expect(card?.textContent).toContain('bleeding');
	});
});
