// D6 Task 3 (spec §1.5) — RefUnwrapView degrade ladder, driven through the REAL
// ElementPipeline (same harness convention as horizontal-rule.test.ts / scc-anchor-render
// .test.ts). The base def here is a trivial stub — full model resolution against real
// fixtures is exercised in Task 4/6; this file's whole focus is the ladder itself:
//   inline                                -> base view renders directly, no ref resolution
//   ref, no cx.compendium                 -> "compendium not installed" card
//   ref, cx.compendium.available === false -> same
//   ref, bare slug with 0/2+ candidates   -> "no match" / "ambiguous" card
//   ref, resolved code -> web             -> .dse-ref-web-card w/ steelcompendium.io link
//   ref, resolved code -> unresolved      -> "unknown SCC code" card naming the code
//   ref, resolved code -> vault, no model -> "found but not renderable" card
//   ref, resolved code -> vault, model    -> base view renders WITH the resolved model +
//                                             threads RefSource into a SourceAware base view
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementPipelineDeps } from '@/framework/pipeline';
import type { ElementDefinition } from '@/framework/registry';
import { ElementView } from '@/framework/view';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { createThemeService } from '@/framework/seams/theme';
import { createPreferenceStore } from '@/framework/seams/prefs';
import { createRollService } from '@/framework/roll/service';
import type { PrefsStorage } from '@/framework/seams/prefs';
import { createReferenceService } from '@/framework/seams/refs';
import { createValidationService } from '@/framework/validation';
import { createSessionStore } from '@/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, parseYaml } from '../../mocks/obsidian';
import type { SccAnchorResolver } from '@/refs/rewriteSccAnchors';
import type { CompendiumIndex, CompendiumEntity } from '@/services/CompendiumIndex';
import type { RefProvider } from '@/framework/seams/refs';
import { fakeTFile } from '../../fakes/fakeObsidian';
import { withReference, type RefSource, type SourceAware } from '@/elements/shared/withReference';

const CODE = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';

interface BaseModel {
	text: string;
}

/** Plain base view — renders the model as a data attribute, no source-awareness. */
class BaseView extends ElementView<BaseModel> {
	protected onMount(root: HTMLElement, model: BaseModel): void {
		root.createDiv({ cls: 'test-base-view', attr: { 'data-test-model': model.text } });
	}
}

/** Source-aware base view (mirrors DisplayCardView's opt-in, §2.3) — records the RefSource
 *  threaded in by RefUnwrapView so the vault-success case can assert it was passed. */
class SourceAwareBaseView extends ElementView<BaseModel> implements SourceAware {
	lastSource?: RefSource;
	setSource(source: RefSource): void {
		this.lastSource = source;
	}
	protected onMount(root: HTMLElement, model: BaseModel): void {
		root.createDiv({
			cls: 'test-base-view',
			attr: { 'data-test-model': model.text, 'data-source-file': this.lastSource?.file.path ?? '' },
		});
	}
}

function baseDef(viewFactory: (cx: any) => ElementView<BaseModel> = (cx) => new BaseView(cx)): ElementDefinition<BaseModel> {
	return {
		id: 'test-base',
		name: 'Test Base',
		aliases: ['ds-test-base'],
		shape: 'static',
		parse: (data): BaseModel => ({
			text: data && typeof data === 'object' && 'text' in (data as any) ? String((data as any).text) : String(data),
		}),
		createView: viewFactory,
	};
}

/** A `raw`-driven base def (mirrors the REAL ds-block family shape --
 *  `(_data, raw) => X.readYaml(raw)`, statblock/feature/featureblock -- unlike `baseDef`
 *  above, which is `data`-driven and so can't distinguish RefUnwrapView.legacyRefRawText's
 *  two branches). Used by the fallback-branch test below (fix round 1, finding 3). */
function rawBaseDef(): ElementDefinition<BaseModel> {
	return {
		id: 'test-raw-base',
		name: 'Test Raw Base',
		aliases: ['ds-test-raw-base'],
		shape: 'static',
		parse: (_data, raw): BaseModel => {
			const parsed = parseYaml(raw);
			return {
				text: parsed && typeof parsed === 'object' && 'text' in parsed ? String((parsed as any).text) : String(parsed),
			};
		},
		createView: (cx) => new BaseView(cx),
	};
}

function makeHost(): BlockHost & { containerEl: HTMLElement } {
	const containerEl = document.createElement('div');
	return {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child) => child,
		getBlockInfo: () => ({ language: 'ds-test-base', lineStart: 0, lineEnd: 1 }),
		replaceSource: async () => true,
		blockKey: () => 'Note.md::ds-test-base::0',
	};
}

function makeDeps(opts?: { sccAnchors?: SccAnchorResolver; compendium?: CompendiumIndex }): ElementPipelineDeps {
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
		sccAnchors: opts?.sccAnchors,
		compendium: opts?.compendium,
	};
}

/** Minimal fake CompendiumIndex — only the members RefUnwrapView actually calls
 *  (available/resolveSlug/getEntity) do real work; the rest throw if reached. */
function fakeCompendium(over: {
	available?: boolean;
	resolveSlug?: (slug: string, scope: string | RegExp) => string[];
	getEntity?: (code: string) => Promise<CompendiumEntity | null>;
}): CompendiumIndex {
	return {
		available: over.available ?? true,
		getEntry: () => {
			throw new Error('not stubbed');
		},
		getEntity: over.getEntity ?? (async () => null),
		getStatblock: async () => {
			throw new Error('not stubbed');
		},
		query: () => {
			throw new Error('not stubbed');
		},
		resolveSlug: over.resolveSlug ?? (() => []),
		registerWatchers: () => {},
	};
}

function fakeSccAnchors(resolve: SccAnchorResolver['resolve']): SccAnchorResolver {
	return { resolve: jest.fn(resolve) };
}

describe('RefUnwrapView (spec §1.5 degrade ladder)', () => {
	test('inline body: base view renders directly, no ref resolution attempted', async () => {
		const def = withReference(baseDef(), { sccType: /statblock$/ });
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(def, 'text: hello inline', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const rendered = root.querySelector('.test-base-view')!;
		expect(rendered.getAttribute('data-test-model')).toBe('hello inline');
	});

	test('ref body, no cx.compendium at all: "compendium not installed" card', async () => {
		const def = withReference(baseDef(), { sccType: /statblock$/ });
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(def, 'goblin-stinker', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const card = root.querySelector('.dse-error-card-message');
		expect(card?.textContent).toContain('Compendium not installed');
	});

	test('ref body, cx.compendium.available === false: same "not installed" card', async () => {
		const def = withReference(baseDef(), { sccType: /statblock$/ });
		const pipeline = new ElementPipeline(makeDeps({ compendium: fakeCompendium({ available: false }) }));
		const host = makeHost();

		await pipeline.run(def, 'goblin-stinker', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const card = root.querySelector('.dse-error-card-message');
		expect(card?.textContent).toContain('Compendium not installed');
	});

	test('bare slug with no matching candidates: "no match" card', async () => {
		const def = withReference(baseDef(), { sccType: /statblock$/ });
		const pipeline = new ElementPipeline(
			makeDeps({ compendium: fakeCompendium({ resolveSlug: () => [] }) }),
		);
		const host = makeHost();

		await pipeline.run(def, 'nonexistent-slug', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const card = root.querySelector('.dse-error-card-message');
		expect(card?.textContent).toContain('No compendium entry matches');
		expect(card?.textContent).toContain('nonexistent-slug');
	});

	test('bare slug with 2+ matching candidates: "ambiguous" card listing them', async () => {
		const other = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-boss';
		const def = withReference(baseDef(), { sccType: /statblock$/ });
		const pipeline = new ElementPipeline(
			makeDeps({ compendium: fakeCompendium({ resolveSlug: () => [CODE, other] }) }),
		);
		const host = makeHost();

		await pipeline.run(def, 'goblin', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const card = root.querySelector('.dse-error-card-message');
		expect(card?.textContent).toContain('ambiguous');
		expect(card?.textContent).toContain(CODE);
		expect(card?.textContent).toContain(other);
	});

	test('resolved code classifies as web: renders .dse-ref-web-card with the steelcompendium.io link', async () => {
		const def = withReference(baseDef(), { sccType: /statblock$/ });
		const sccAnchors = fakeSccAnchors(() => ({ kind: 'web', url: `https://steelcompendium.io/scc/${CODE}/` }));
		const compendium = fakeCompendium({ resolveSlug: () => [CODE] });
		const pipeline = new ElementPipeline(makeDeps({ sccAnchors, compendium }));
		const host = makeHost();

		await pipeline.run(def, 'goblin-stinker', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const card = root.querySelector('.dse-ref-web-card')!;
		expect(card).not.toBeNull();
		expect(card.getAttribute('data-scc')).toBe(CODE);
		const link = card.querySelector('.dse-ref-web-card__link') as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe(`https://steelcompendium.io/scc/${CODE}/`);
		expect(link.textContent).toBe('View on steelcompendium.io');
		expect(link.getAttribute('target')).toBe('_blank');
		// SC-317 — leaves the vault, so it carries `external-link` (the plugin-drawn icon's
		// hook), the same class Obsidian's own MarkdownRenderer stamps on a markdown-authored
		// external link.
		expect(link.classList.contains('external-link')).toBe(true);
	});

	test('resolved code classifies as unresolved: "unknown SCC code" card naming the code', async () => {
		const def = withReference(baseDef(), { sccType: /statblock$/ });
		const sccAnchors = fakeSccAnchors(() => ({ kind: 'unresolved', code: CODE }));
		const compendium = fakeCompendium({ resolveSlug: () => [CODE] });
		const pipeline = new ElementPipeline(makeDeps({ sccAnchors, compendium }));
		const host = makeHost();

		await pipeline.run(def, 'goblin-stinker', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const card = root.querySelector('.dse-error-card-message');
		expect(card?.textContent).toContain('Unknown SCC code');
		expect(card?.textContent).toContain(CODE);
	});

	test('resolved code classifies as vault but getEntity() finds nothing indexed: "not renderable" card', async () => {
		const def = withReference(baseDef(), { sccType: /statblock$/ });
		const sccAnchors = fakeSccAnchors(() => ({
			kind: 'vault',
			file: fakeTFile('DS Compendium/monster/goblin/statblock/goblin-stinker.md'),
			linkpath: 'DS Compendium/monster/goblin/statblock/goblin-stinker.md',
		}));
		const compendium = fakeCompendium({ resolveSlug: () => [CODE], getEntity: async () => null });
		const pipeline = new ElementPipeline(makeDeps({ sccAnchors, compendium }));
		const host = makeHost();

		await pipeline.run(def, 'goblin-stinker', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const card = root.querySelector('.dse-error-card-message');
		expect(card?.textContent).toContain('found but not renderable');
		expect(card?.textContent).toContain(CODE);
	});

	test('resolved code classifies as vault, entity found but model() undefined: "not renderable" card naming the entry', async () => {
		const def = withReference(baseDef(), { sccType: /statblock$/ });
		const file = fakeTFile('DS Compendium/monster/goblin/statblock/goblin-stinker.md');
		const sccAnchors = fakeSccAnchors(() => ({ kind: 'vault', file, linkpath: file.path }));
		const entity: CompendiumEntity = {
			scc: CODE,
			type: 'monster.goblin.statblock',
			name: 'Goblin Stinker',
			source: 'mcdm.monsters.v1',
			file,
			frontmatter: { type: 'monster.goblin.statblock' },
			body: async () => 'body text',
			model: async () => undefined,
		};
		const compendium = fakeCompendium({ resolveSlug: () => [CODE], getEntity: async () => entity });
		const pipeline = new ElementPipeline(makeDeps({ sccAnchors, compendium }));
		const host = makeHost();

		await pipeline.run(def, 'goblin-stinker', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const card = root.querySelector('.dse-error-card-message');
		expect(card?.textContent).toContain('found but not renderable');
		expect(card?.textContent).toContain('Goblin Stinker');
		// Minor fix (review round 1, spec §1.5): names the file path + frontmatter
		// `type`, not just the entity's display name.
		expect(card?.textContent).toContain(file.path);
		expect(card?.textContent).toContain('monster.goblin.statblock');
	});

	test('resolved code classifies as vault with a typed model: mounts the base view with the resolved model', async () => {
		const def = withReference(baseDef(), { sccType: /statblock$/ });
		const file = fakeTFile('DS Compendium/monster/goblin/statblock/goblin-stinker.md');
		const sccAnchors = fakeSccAnchors(() => ({ kind: 'vault', file, linkpath: file.path }));
		const entity: CompendiumEntity = {
			scc: CODE,
			type: 'monster.goblin.statblock',
			name: 'Goblin Stinker',
			source: 'mcdm.monsters.v1',
			file,
			frontmatter: { type: 'monster.goblin.statblock' },
			body: async () => 'body text',
			model: async () => ({ text: 'Goblin Stinker Model' }),
		};
		// Full source/type/item code as the raw body -- exercises the "already a full code"
		// branch of toCode (no resolveSlug call needed).
		const compendium = fakeCompendium({
			resolveSlug: () => {
				throw new Error('resolveSlug should not be called for a full code');
			},
			getEntity: async () => entity,
		});
		const pipeline = new ElementPipeline(makeDeps({ sccAnchors, compendium }));
		const host = makeHost();

		await pipeline.run(def, CODE, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const rendered = root.querySelector('.test-base-view')!;
		expect(rendered.getAttribute('data-test-model')).toBe('Goblin Stinker Model');
	});

	test('vault resolution threads RefSource into a SourceAware base view', async () => {
		const def = withReference(baseDef((cx) => new SourceAwareBaseView(cx)), { sccType: /statblock$/ });
		const file = fakeTFile('DS Compendium/monster/goblin/statblock/goblin-stinker.md');
		const sccAnchors = fakeSccAnchors(() => ({ kind: 'vault', file, linkpath: file.path }));
		const entity: CompendiumEntity = {
			scc: CODE,
			type: 'monster.goblin.statblock',
			name: 'Goblin Stinker',
			source: 'mcdm.monsters.v1',
			file,
			frontmatter: { type: 'monster.goblin.statblock' },
			body: async () => 'body text',
			model: async () => ({ text: 'Goblin Stinker Model' }),
		};
		const compendium = fakeCompendium({ getEntity: async () => entity });
		const pipeline = new ElementPipeline(makeDeps({ sccAnchors, compendium }));
		const host = makeHost();

		await pipeline.run(def, CODE, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const rendered = root.querySelector('.test-base-view')!;
		expect(rendered.getAttribute('data-source-file')).toBe(file.path);
	});
});

// Fix round 1 (Critical finding) — the legacy `@path` / `[[wikilink]]` whole-block
// forms D6 spec §1.1 headlines as "still works" were 0-for-2 end-to-end: `@Homebrew/
// Fireball` never survived the pipeline's own `parseYaml(source)` step (YAML reserves
// a leading `@` on a plain scalar), and `[[Thorn Dragon]]` — which DOES survive
// parsing — was misrouted through the SCC ladder (`cx.sccAnchors.resolve`, which only
// understands `scc:`/`scc.vN:`) instead of `cx.refs` (the ReferenceService's at-path/
// wikilink providers). Neither was exercised end-to-end through the REAL
// ElementPipeline before this fix round — that gap is exactly why the bugs shipped.
// These tests drive the real pipeline + real ReferenceService (no compendium seam at
// all — proof these forms don't depend on cx.sccAnchors/cx.compendium).
describe('RefUnwrapView — legacy @path / [[wikilink]] whole-block refs (D6 spec §1.1, fix round 1)', () => {
	const DS_BLOCK = (text: string) => ['```ds-test-base', `text: ${text}`, '```'].join('\n');

	test('@path body: pipeline parse-stage guard + cx.refs resolution renders the base card', async () => {
		const def = withReference(baseDef(), { sccType: /statblock$/ });
		const deps = makeDeps();
		(deps.app as any).vault.setFile('Homebrew/Fireball.md', DS_BLOCK('Fireball Card'));
		const pipeline = new ElementPipeline(deps);
		const host = makeHost();

		await pipeline.run(def, '@Homebrew/Fireball', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const rendered = root.querySelector('.test-base-view')!;
		expect(rendered.getAttribute('data-test-model')).toBe('Fireball Card');
	});

	test('[[wikilink]] body: cx.refs resolution (not the SCC ladder) renders the base card', async () => {
		const def = withReference(baseDef(), { sccType: /statblock$/ });
		const deps = makeDeps();
		(deps.app as any).vault.setFile('Bestiary/Thorn Dragon.md', DS_BLOCK('Thorn Dragon Card'));
		const pipeline = new ElementPipeline(deps);
		const host = makeHost();

		await pipeline.run(def, '[[Thorn Dragon]]', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const rendered = root.querySelector('.test-base-view')!;
		expect(rendered.getAttribute('data-test-model')).toBe('Thorn Dragon Card');
	});

	test('@path body that fails to resolve: error card surfaces the ReferenceService not-found message', async () => {
		const def = withReference(baseDef(), { sccType: /statblock$/ });
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(def, '@NoSuchFile', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const card = root.querySelector('.dse-error-card-message');
		expect(card?.textContent).toContain('Reference file (NoSuchFile) not found');
	});

	test('malformed multi-line body starting with @ still parse-error-cards (guard stays narrow)', async () => {
		const def = withReference(baseDef(), { sccType: /statblock$/ });
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(def, '@Homebrew/Fireball\nextra: [unterminated', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-error-stage')).toBe('parse');
	});

	// Fix round 1 (Low, task-4-review.md finding 3): `RefUnwrapView.resolveLegacyRef` now
	// prefers the byte-original block TEXT via `extractFirstDsBlockText(app, file)` (the
	// helper the by-SCC path uses) whenever `ResolvedRef.file` is present -- both built-in
	// providers (at-path/wikilink) always set it, so the two describe-block tests above
	// exercise that primary path. This test pins the OTHER branch: a `RefProvider`
	// (the public `ReferenceService.register` seam) that resolves data with NO backing
	// vault file, which can only fall back to the `stringifyYaml` round-trip -- there is
	// no file to re-read block text from. Uses `rawBaseDef`, which (like the real
	// statblock/feature/featureblock defs) parses `raw`, not `data`, so this actually
	// exercises `legacyRefRawText`'s fallback branch rather than being a no-op the way
	// `baseDef`'s `data`-driven parse would be.
	test('@path body resolved by a custom RefProvider with no backing file: falls back to the stringifyYaml round-trip', async () => {
		const def = withReference(rawBaseDef(), { sccType: /statblock$/ });
		const deps = makeDeps();
		const noFileProvider: RefProvider = {
			kind: 'at-path',
			canResolve: (raw) => raw.startsWith('@'),
			resolve: async () => ({ data: { text: 'No-File Card' } }),
		};
		deps.refs.register(noFileProvider);
		const pipeline = new ElementPipeline(deps);
		const host = makeHost();

		await pipeline.run(def, '@Anything', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const rendered = root.querySelector('.test-base-view')!;
		expect(rendered.getAttribute('data-test-model')).toBe('No-File Card');
	});
});

// SC-525 -- the in-flight depth guard (IN_FLIGHT_REFS) is keyed on blockKey + reference and records the
// view that owns the entry. A reference already resolving in the SAME block is refused only while its
// owner is a live view: a superseded (unloaded) owner -- the block edit form's preview, which remounts a
// fresh view into the same blockKey on every keystroke -- no longer blocks its replacement, and its late
// `finally` no longer clears the replacement's entry. A genuine nesting cycle stays refused.
describe('RefUnwrapView — in-flight depth guard (SC-525)', () => {
	interface NestModel {
		text: string;
		next?: string;
	}
	const NESTING = /nesting too deep/i;
	let setupSeq = 0;

	/** Base view that renders `text`, then (like a card whose body holds a whole-block ref) mounts the ref
	 *  `next` names through a nested pipeline run on the SAME host, so it sees the same blockKey. */
	function setup() {
		const table: Record<string, NestModel> = {};
		const holds: Array<() => void> = [];
		let holding = false;
		const views: ElementView<any>[] = [];
		const deps = makeDeps();
		const pipeline = new ElementPipeline(deps);
		const host = makeHost();
		// SC-525 r3 (INFO-3): IN_FLIGHT_REFS is module-level, so a test that fails while a lookup is held would leave
		// a live entry behind and refuse the same reference in every later test. A key of its own per setup keeps
		// each test's entries to itself.
		const blockKey = `Note.md::ds-test-base::sc525-${++setupSeq}`;
		host.blockKey = () => blockKey;
		class NestView extends ElementView<NestModel> {
			protected async onMount(root: HTMLElement, model: NestModel): Promise<void> {
				root.createDiv({ cls: 'test-base-view', attr: { 'data-test-model': model.text } });
				if (model.next) await pipeline.run(def, model.next, host);
			}
		}
		const nestBase: ElementDefinition<NestModel> = {
			id: 'test-base',
			name: 'Test Base',
			aliases: ['ds-test-base'],
			shape: 'static',
			parse: (data) => data as NestModel,
			createView: (cx) => new NestView(cx),
		};
		const wrapped = withReference(nestBase, { sccType: /statblock$/ });
		const def: ElementDefinition<any> = {
			...wrapped,
			createView: (cx: any) => {
				const view = wrapped.createView(cx) as ElementView<any>;
				views.push(view);
				return view;
			},
		};
		deps.refs.register({
			kind: 'at-path',
			canResolve: (raw) => raw in table,
			resolve: ({ raw }) =>
				holding
					? new Promise((resolve) => holds.push(() => resolve({ data: table[raw] })))
					: Promise.resolve({ data: table[raw] }),
		});
		return {
			table,
			holds,
			views,
			host,
			run: (ref: string) => pipeline.run(def, ref, host),
			hold: (on: boolean) => {
				holding = on;
			},
			roots: () => Array.from(host.containerEl.children) as HTMLElement[],
		};
	}
	const tick = async () => {
		for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
	};
	const nestingErrors = (roots: HTMLElement[]) =>
		roots.filter((r) => NESTING.test(r.querySelector('.dse-error-card-message')?.textContent ?? ''));
	const rendered = (root: HTMLElement) => root.querySelector('.test-base-view')?.getAttribute('data-test-model');

	test('a cycle A -> B -> A in one live block is refused at the second A', async () => {
		const s = setup();
		s.table['@A'] = { text: 'A', next: '@B' };
		s.table['@B'] = { text: 'B', next: '@A' };
		await s.run('@A');
		const roots = s.roots();
		expect(roots).toHaveLength(3);
		expect(rendered(roots[0])).toBe('A');
		expect(rendered(roots[1])).toBe('B');
		expect(nestingErrors(roots)).toEqual([roots[2]]);
		expect(roots[2].querySelector('.dse-error-card-message')?.textContent).toContain('`@A`');
	});

	test('a reference to itself (A -> A) is refused', async () => {
		const s = setup();
		s.table['@A'] = { text: 'A', next: '@A' };
		await s.run('@A');
		const roots = s.roots();
		expect(roots).toHaveLength(2);
		expect(rendered(roots[0])).toBe('A');
		expect(nestingErrors(roots)).toEqual([roots[1]]);
	});

	test('two live views in one block resolving the same reference at once: the later one is refused, the earlier one still renders', async () => {
		const s = setup();
		s.table['@A'] = { text: 'A' };
		s.hold(true);
		const first = s.run('@A');
		await tick();
		const second = s.run('@A');
		await tick();
		expect(nestingErrors(s.roots())).toEqual([s.roots()[1]]);
		s.holds.forEach((release) => release());
		await Promise.all([first, second]);
		expect(rendered(s.roots()[0])).toBe('A');
		expect(nestingErrors(s.roots())).toEqual([s.roots()[1]]);
	});

	test('once a resolution settles, the same reference resolves again in that block', async () => {
		const s = setup();
		s.table['@A'] = { text: 'A' };
		await s.run('@A');
		await s.run('@A');
		expect(s.roots().map(rendered)).toEqual(['A', 'A']);
		expect(nestingErrors(s.roots())).toEqual([]);
	});

	test('an unloaded view\'s pending lookup does not block a new view of the same reference, and it renders once released', async () => {
		const s = setup();
		s.table['@A'] = { text: 'A' };
		s.hold(true);
		const first = s.run('@A');
		await tick();
		s.views[0].load();
		s.views[0].unload(); // superseded, as the form's preview view is on the next keystroke
		const second = s.run('@A');
		await tick();
		expect(nestingErrors(s.roots())).toEqual([]);
		expect(s.holds).toHaveLength(2);
		s.holds[1]();
		await second;
		expect(rendered(s.roots()[1])).toBe('A');
		s.holds[0]();
		await first;
		expect(nestingErrors(s.roots())).toEqual([]);
		expect(rendered(s.roots()[1])).toBe('A');
	});

	test('a superseded owner\'s late finally leaves the new owner\'s entry in place: a third live view is still refused', async () => {
		const s = setup();
		s.table['@A'] = { text: 'A' };
		s.hold(true);
		const first = s.run('@A');
		await tick();
		s.views[0].load();
		s.views[0].unload();
		const second = s.run('@A'); // takes the entry over
		await tick();
		s.holds[0](); // the superseded lookup finishes first: its finally runs while `second` is still in flight
		await first;
		const third = s.run('@A');
		await tick();
		expect(nestingErrors(s.roots())).toEqual([s.roots()[2]]);
		await third;
		s.holds[1]();
		await second;
		// the owner's own finally cleared the entry: a later run resolves normally
		s.hold(false);
		await s.run('@A');
		expect(rendered(s.roots()[3])).toBe('A');
		expect(nestingErrors(s.roots())).toEqual([s.roots()[2]]);
	});

	// SC-525 r3 (LOW-1) -- the SAME view re-enters resolveAndMount while its own lookup is still running (the
	// sidebar's `previous.update(model)` on a pinned card whose note changed again). Two resolutions of one view:
	// only the later one may write, and no child view may be left loaded behind it.
	const ownedChildren = (v: ElementView<any>) => (v as any).ownedChildren.length as number;
	const baseViews = (root: HTMLElement) => Array.from(root.querySelectorAll('.test-base-view')).map((n) => n.getAttribute('data-test-model'));
	/** ownedChildren after one uninterrupted resolution and one more update: what "nothing left behind" means. */
	async function settledOwnedChildren(): Promise<number> {
		const c = setup();
		c.table['@A'] = { text: 'A' };
		await c.run('@A');
		await c.views[0].update(c.views[0].currentModel());
		return ownedChildren(c.views[0]);
	}

	describe.each([
		['the earlier lookup finishes first', [0, 1]],
		['the later lookup finishes first', [1, 0]],
	] as Array<[string, number[]]>)('a view updated while its own lookup is running (%s)', (_name, order) => {
		test('same reference: one card, no nesting error, no orphan child', async () => {
			const s = setup();
			s.table['@A'] = { text: 'A' };
			s.hold(true);
			const first = s.run('@A');
			await tick();
			const v = s.views[0];
			const model = v.currentModel();
			const updated = v.update(model);
			await tick();
			expect(nestingErrors(s.roots())).toEqual([]);
			expect(s.holds).toHaveLength(2);
			for (const i of order) {
				s.holds[i]();
				await tick();
			}
			await Promise.all([first, updated]);
			expect(nestingErrors(s.roots())).toEqual([]);
			expect(baseViews(s.roots()[0])).toEqual(['A']);
			s.hold(false);
			await v.update(model);
			expect(baseViews(s.roots()[0])).toEqual(['A']);
			expect(ownedChildren(v)).toBe(await settledOwnedChildren());
		});

		test('a different reference (A then B): only B is drawn, nothing of A is left', async () => {
			const s = setup();
			s.table['@A'] = { text: 'A' };
			s.table['@B'] = { text: 'B' };
			s.hold(true);
			const first = s.run('@A');
			await tick();
			const v = s.views[0];
			const updated = v.update({ kind: 'ref', raw: '@B' });
			await tick();
			expect(s.holds).toHaveLength(2);
			for (const i of order) {
				s.holds[i]();
				await tick();
			}
			await Promise.all([first, updated]);
			expect(nestingErrors(s.roots())).toEqual([]);
			expect(baseViews(s.roots()[0])).toEqual(['B']);
			s.hold(false);
			await v.update({ kind: 'ref', raw: '@B' });
			expect(baseViews(s.roots()[0])).toEqual(['B']);
			expect(ownedChildren(v)).toBe(await settledOwnedChildren());
		});

		test('a superseded resolution leaves no entry behind: a fresh view of the same reference resolves', async () => {
			const s = setup();
			s.table['@A'] = { text: 'A' };
			s.hold(true);
			const first = s.run('@A');
			await tick();
			const updated = s.views[0].update(s.views[0].currentModel());
			await tick();
			for (const i of order) {
				s.holds[i]();
				await tick();
			}
			await Promise.all([first, updated]);
			s.hold(false);
			await s.run('@A');
			expect(rendered(s.roots()[s.roots().length - 1])).toBe('A');
			expect(nestingErrors(s.roots())).toEqual([]);
		});
	});

	test.each([
		['the earlier entity read finishes first', [0, 1]],
		['the later entity read finishes first', [1, 0]],
	] as Array<[string, number[]]>)('an SCC code, view updated while its entity read is running (%s): one card, nothing left behind', async (_name, order) => {
		const views: ElementView<any>[] = [];
		const wrapped = withReference(baseDef(), { sccType: /statblock$/ });
		const def: ElementDefinition<any> = {
			...wrapped,
			createView: (cx: any) => {
				const view = wrapped.createView(cx) as ElementView<any>;
				views.push(view);
				return view;
			},
		};
		const file = fakeTFile('DS Compendium/monster/goblin/statblock/goblin-stinker.md');
		const reads: Array<() => void> = [];
		const entity: CompendiumEntity = {
			scc: CODE,
			type: 'monster.goblin.statblock',
			name: 'Goblin Stinker',
			source: 'mcdm.monsters.v1',
			file,
			frontmatter: { type: 'monster.goblin.statblock' },
			body: async () => 'body text',
			model: async () => ({ text: 'Goblin Stinker Model' }),
		};
		const deps = makeDeps({
			sccAnchors: fakeSccAnchors(() => ({ kind: 'vault', file, linkpath: file.path })),
			compendium: fakeCompendium({ getEntity: () => new Promise((resolve) => reads.push(() => resolve(entity))) }),
		});
		const host = makeHost();
		const blockKey = `Note.md::ds-test-base::sc525-${++setupSeq}`;
		host.blockKey = () => blockKey;
		const first = new ElementPipeline(deps).run(def, CODE, host);
		await tick();
		const updated = views[0].update(views[0].currentModel());
		await tick();
		expect(reads).toHaveLength(2);
		for (const i of order) {
			reads[i]();
			await tick();
		}
		await Promise.all([first, updated]);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(baseViews(root)).toEqual(['Goblin Stinker Model']);
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
	});

	test('a self-reference (A -> A) still stops when its view was updated while its lookup ran', async () => {
		const s = setup();
		s.table['@A'] = { text: 'A', next: '@A' };
		s.hold(true);
		const first = s.run('@A');
		await tick();
		const updated = s.views[0].update(s.views[0].currentModel());
		await tick();
		s.hold(false);
		s.holds.forEach((release) => release());
		await Promise.all([first, updated]);
		expect(s.views.length).toBeLessThanOrEqual(6); // bounded: no endless recursion
		expect(nestingErrors(s.roots()).length).toBeGreaterThanOrEqual(1);
	});
});
