// test/dom/elements/displayCard.test.ts — D6 Task 5 (spec §2.4): CardLayout<M> +
// DisplayCardView, the shared frame every by-SCC display card renders through. Two halves:
//
//   - the pure-model path, driven through the REAL ElementPipeline (same convention as
//     horizontal-rule.test.ts / statblockRef.test.ts) with a hand-built tiny model + layout;
//   - the hybrid/SourceAware seam (setSource(), called before mount — mirrors
//     RefUnwrapView.mountBase's contract), exercised by instantiating DisplayCardView
//     directly, since no real definition wires it through withReference yet (that's Task 9).
//     Only the flags + row-filtering land here; the source-body render itself is a
//     TODO(Task 9) stub that must not throw.
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementDefinition } from '@/framework/registry';
import { createRenderContext } from '@/framework/context';
import { DisplayCardView } from '@/elements/shared/CardLayout';
import type { CardLayout } from '@/elements/shared/CardLayout';
import type { RefSource } from '@/elements/shared/withReference';
import { MarkdownRenderer } from '../../mocks/obsidian';
import { fakeTFile } from '../../fakes/fakeObsidian';
import { makeHost, makeCompendiumDeps } from './_refHarness';

interface TestCardModel {
	name: string;
	kind: string;
	keywords: string[];
	echelon?: string;
	distance?: string;
	note?: string; // omitted (undefined) in the fixture — proves undefined rows drop out
	flavor: string;
	content: string;
}

// `distance`/`note` deliberately omitted — both optional, and JSON.stringify (this
// suite's pipeline-source encoding) drops undefined-valued keys entirely, so the parsed
// model's `.distance`/`.note` come back `undefined`, exactly like a real author leaving
// an optional field out of their YAML.
const MODEL: TestCardModel = {
	name: 'Panther',
	kind: 'Kit — Agile',
	keywords: ['Agile', 'Kit'],
	echelon: '1',
	flavor: 'A **sleek** predator.',
	content: 'Grants +1 to **Speed** while worn.',
};

function testLayout(): CardLayout<TestCardModel> {
	return {
		title: (m) => m.name,
		subtitle: (m) => m.kind,
		badges: (m) => [
			{ text: m.keywords.join(', '), tone: 'keyword' },
			{ text: `Echelon ${m.echelon}`, tone: 'echelon' },
		],
		flavor: (m) => m.flavor,
		rows: [
			{ label: 'Echelon', value: (m) => m.echelon },
			{ label: 'Distance', value: (m) => m.distance }, // undefined -> omitted
			{ label: 'Note', value: (m) => m.note, omitWhenSource: true }, // undefined pure-model too
		],
		body: (m) => m.content,
	};
}

function testDef(layout: CardLayout<TestCardModel>): ElementDefinition<TestCardModel> {
	return {
		id: 'test-display-card',
		name: 'Test Display Card',
		aliases: ['ds-test-display-card'],
		shape: 'static',
		parse: (data): TestCardModel => data as TestCardModel,
		createView: (cx) => new DisplayCardView(cx, layout),
	};
}

describe('D6 Task 5: DisplayCardView pure-model render path (spec §2.4)', () => {
	test('renders the full frame: head/title/subtitle/badges/flavor/rows/body under [data-dse-element] > .dse-card', async () => {
		const { deps } = makeCompendiumDeps();
		const pipeline = new ElementPipeline(deps);
		const host = makeHost('ds-test-display-card');
		const addChild = jest.fn((child: unknown) => child);
		const hostWithSpy = { ...host, addChild };
		const renderSpy = jest.spyOn(MarkdownRenderer, 'render');

		await pipeline.run(testDef(testLayout()), JSON.stringify(MODEL), hostWithSpy as typeof host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('test-display-card');
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);

		const card = root.querySelector(':scope > .dse-card');
		expect(card).not.toBeNull();

		expect(card!.querySelector('.dse-card__title')?.textContent).toBe('Panther');
		expect(card!.querySelector('.dse-card__subtitle')?.textContent).toBe('Kit — Agile');

		const badges = card!.querySelectorAll('.dse-card__badge');
		expect(badges).toHaveLength(2);
		expect(badges[0].textContent).toBe('Agile, Kit');
		expect(badges[0].classList.contains('dse-card__badge--keyword')).toBe(true);
		expect(badges[1].textContent).toBe('Echelon 1');
		expect(badges[1].classList.contains('dse-card__badge--echelon')).toBe(true);

		expect(card!.querySelector('.dse-card__flavor')).not.toBeNull();

		// Rows: "Distance" (undefined value) is omitted; "Echelon" and "Note" (both
		// pure-model — no source, so omitWhenSource is inert) render. Only "Note"'s value
		// is undefined too, so exactly ONE row survives: Echelon.
		const rows = card!.querySelectorAll('.dse-card__row');
		expect(rows).toHaveLength(1);
		expect(rows[0].querySelector('.dse-card__row-label')?.textContent).toBe('Echelon');
		expect(rows[0].querySelector('.dse-card__row-value')?.textContent).toBe('1');

		expect(card!.querySelector('.dse-card__body')).not.toBeNull();

		// Markdown ran through THIS view's renderMarkdown (owner-parented, ML-1) for
		// flavor + body — never a bare innerHTML/text assignment. The mock recorder
		// appends raw markdown as text (F3 §4.2 convention — no HTML-shape assertions).
		const view = addChild.mock.calls[0][0] as DisplayCardView<TestCardModel>;
		expect(view).toBeInstanceOf(DisplayCardView);
		const flavorCalls = renderSpy.mock.calls.filter((c) => c[1] === MODEL.flavor);
		expect(flavorCalls).toHaveLength(1);
		expect(flavorCalls[0][4]).toBe(view); // 5th arg = owning Component = this view
		expect(card!.querySelector('.dse-card__flavor')?.textContent).toBe(MODEL.flavor);
		const bodyCalls = renderSpy.mock.calls.filter((c) => c[1] === MODEL.content);
		expect(bodyCalls).toHaveLength(1);
		expect(bodyCalls[0][4]).toBe(view);
		expect(card!.querySelector('.dse-card__body')?.textContent).toBe(MODEL.content);
	});

	test('a markdown: true row renders its value through renderMarkdown, not plain text', async () => {
		const { deps } = makeCompendiumDeps();
		const pipeline = new ElementPipeline(deps);
		const host = makeHost('ds-test-display-card');
		const renderSpy = jest.spyOn(MarkdownRenderer, 'render');

		const layout: CardLayout<TestCardModel> = {
			...testLayout(),
			rows: [{ label: 'Note', value: () => '**bold** note', markdown: true }],
		};
		await pipeline.run(testDef(layout), JSON.stringify(MODEL), host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const row = root.querySelector('.dse-card__row-value');
		expect(row?.textContent).toBe('**bold** note');
		expect(renderSpy.mock.calls.some((c) => c[1] === '**bold** note')).toBe(true);
	});

	test('optional slots (subtitle/badges/flavor/rows/body) all omit cleanly when absent', async () => {
		const { deps } = makeCompendiumDeps();
		const pipeline = new ElementPipeline(deps);
		const host = makeHost('ds-test-display-card');
		const bareLayout: CardLayout<TestCardModel> = { title: (m) => m.name };

		await pipeline.run(testDef(bareLayout), JSON.stringify(MODEL), host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const card = root.querySelector(':scope > .dse-card')!;
		expect(card.querySelector('.dse-card__title')?.textContent).toBe('Panther');
		expect(card.querySelector('.dse-card__subtitle')).toBeNull();
		expect(card.querySelector('.dse-card__badges')).toBeNull();
		expect(card.querySelector('.dse-card__flavor')).toBeNull();
		expect(card.querySelector('.dse-card__rows')).toBeNull();
		expect(card.querySelector('.dse-card__body')).toBeNull();
	});
});

describe('D6 Task 5: DisplayCardView hybrid seam (SourceAware, flags land now; body render is Task 9)', () => {
	function makeCx(host: ReturnType<typeof makeHost>) {
		const { deps } = makeCompendiumDeps();
		return createRenderContext({
			app: deps.app,
			plugin: deps.plugin,
			settings: deps.settings,
			host,
			theme: deps.theme,
			prefs: deps.prefs,
			refs: deps.refs,
			session: deps.session,
			roll: deps.roll,
			sccAnchors: deps.sccAnchors,
			compendium: deps.compendium,
		});
	}

	function fakeSource(): RefSource {
		return { file: fakeTFile('Compendium/panther.md'), frontmatter: {}, body: 'resolved file body' };
	}

	test('omitWhenSource rows still render in PURE-MODEL mode (no setSource call)', async () => {
		const host = makeHost('ds-test-display-card');
		const cx = makeCx(host);
		const layout: CardLayout<TestCardModel> = {
			title: (m) => m.name,
			rows: [{ label: 'Note', value: () => 'always present', omitWhenSource: true }],
		};
		const view = new DisplayCardView(cx, layout);
		const root = document.createElement('div');

		await view.mount(root, MODEL);

		const rows = root.querySelectorAll('.dse-card__row');
		expect(rows).toHaveLength(1);
		expect(rows[0].querySelector('.dse-card__row-value')?.textContent).toBe('always present');
	});

	test('setSource() flips hybrid mode: an omitWhenSource row is suppressed, a plain row is not', async () => {
		const host = makeHost('ds-test-display-card');
		const cx = makeCx(host);
		const layout: CardLayout<TestCardModel> = {
			title: (m) => m.name,
			rows: [
				{ label: 'Note', value: () => 'suppressed in hybrid', omitWhenSource: true },
				{ label: 'Kept', value: () => 'stays' },
			],
		};
		const view = new DisplayCardView(cx, layout);
		view.setSource(fakeSource());
		const root = document.createElement('div');

		await view.mount(root, MODEL);

		const rows = Array.from(root.querySelectorAll('.dse-card__row'));
		expect(rows).toHaveLength(1);
		expect(rows[0].querySelector('.dse-card__row-label')?.textContent).toBe('Kept');
	});

	test('hybrid + useSourceBody default (true): body render is the Task 9 stub — no throw, renders nothing', async () => {
		const host = makeHost('ds-test-display-card');
		const cx = makeCx(host);
		const layout: CardLayout<TestCardModel> = {
			title: (m) => m.name,
			body: (m) => m.content, // present, but hybrid + default useSourceBody claims the slot
		};
		const view = new DisplayCardView(cx, layout);
		view.setSource(fakeSource());
		const root = document.createElement('div');

		await expect(view.mount(root, MODEL)).resolves.toBeUndefined();

		expect(root.querySelector('.dse-card__body')).toBeNull();
	});

	test('hybrid + useSourceBody: false — the inline body still renders (flag opts OUT of the source body)', async () => {
		const host = makeHost('ds-test-display-card');
		const cx = makeCx(host);
		const layout: CardLayout<TestCardModel> = {
			title: (m) => m.name,
			body: (m) => m.content,
			useSourceBody: false,
		};
		const view = new DisplayCardView(cx, layout);
		view.setSource(fakeSource());
		const root = document.createElement('div');

		await view.mount(root, MODEL);

		expect(root.querySelector('.dse-card__body')?.textContent).toBe(MODEL.content);
	});
});
