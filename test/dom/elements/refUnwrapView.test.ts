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
import { App, Plugin } from '../../mocks/obsidian';
import type { SccAnchorResolver } from '@/refs/rewriteSccAnchors';
import type { CompendiumIndex, CompendiumEntity } from '@/services/CompendiumIndex';
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
