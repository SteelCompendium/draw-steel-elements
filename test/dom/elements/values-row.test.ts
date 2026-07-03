// Plan 07 Task 5 (F1 §6 step 2) — Values Row on Framework v2: valuesRowElement definition
// + ValuesRowElementView, driven through the REAL ElementPipeline (static-element harness
// mirroring feature.test.ts; T-5 registration blocks mirroring its onload() suite). The
// element view is a thin wrapper: it recreates the legacy ValuesRowProcessor's
// `.ds-values-row-ele-container` root and delegates ALL rendering to the KEPT
// ValuesRow/ValuesRowView — so the golden test pins the wrapper byte-for-byte against a
// direct ValuesRowView.build() call. Unlike most legacy DOM processors, ValuesRowProcessor
// never armed a click shield, so the definition opts OUT (noClickShield: true, same
// byte-identical rationale as horizontal-rule).
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { createElementRegistry } from '../../../src/framework/registry';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { KeyValuePairs } from '@model/KeyValuePairs';
import { ValuesRowView } from '@drawSteelAdmonition/ValuesRow/ValuesRowView';
import { App, Plugin, makeFakeContext } from '../../mocks/obsidian';
import { valuesRowElement } from '../../../src/elements/values-row/definition';
import { ValuesRowElementView } from '../../../src/elements/values-row/view';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';

const VR_ALIASES = ['ds-vr', 'ds-value-row', 'ds-values-row'] as const;

const SAMPLE = `values:
  - Speed: 5
  - Size: 1M
  - Stability: 0
value_height: 2
name_height: 1
`;

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-vr', lineStart: 0, lineEnd: 8 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-vr::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real service instances, same convention as feature.test.ts's makeDeps(). */
function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const theme = createThemeService();
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
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
	};
}

async function renderValuesRow(source: string, hostOverrides: Partial<BlockHost> = {}) {
	const deps = makeDeps();
	const pipeline = new ElementPipeline(deps);
	const host = makeHost(hostOverrides);
	await pipeline.run(valuesRowElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { pipeline, host, root, deps };
}

describe('Plan 07 Task 5: values-row ElementDefinition (F1 §6 step 2)', () => {
	test('id/name/aliases/shape match the preserved ds-vr/ds-value-row/ds-values-row contract; static, NO schema/serialize/resolveRefs', () => {
		expect(valuesRowElement.id).toBe('values-row');
		expect(valuesRowElement.name).toBe('Values row');
		expect(valuesRowElement.aliases).toEqual([...VR_ALIASES]);
		expect(valuesRowElement.shape).toBe('static');
		expect(valuesRowElement.schema).toBeUndefined();
		expect(valuesRowElement.serialize).toBeUndefined();
		expect(valuesRowElement.resolveRefs).toBeUndefined();
		expect(valuesRowElement.autoResolveRefs).toBe(false);
	});

	test('noClickShield: true — the legacy ValuesRowProcessor never armed a click shield (byte-identical opt-out, like horizontal-rule)', () => {
		expect(valuesRowElement.noClickShield).toBe(true);
	});

	test('parse consumes the pipeline\'s PLAIN pre-parsed data (KeyValuePairs.parse), NOT the raw text', () => {
		// `raw` is deliberately garbage: only `data` carries the block — the plain-model
		// case, opposite of feature.test.ts's SDK raw-text case.
		const model = valuesRowElement.parse(
			{ values: [{ Speed: 5 }, { Size: '1M' }], value_height: 2 },
			':::GARBAGE-RAW:::',
		);
		expect(model).toBeInstanceOf(KeyValuePairs);
		expect(model.values).toHaveLength(2);
		expect(model.values[0].name).toBe('Speed');
		expect(model.values[0].value).toBe('5');
		expect(model.values[1].name).toBe('Size');
		expect(model.values[1].value).toBe('1M');
		expect(model.value_height).toBe(2);
		expect(model.name_height).toBe(1); // default
	});

	test('createView returns a ValuesRowElementView', () => {
		const deps = makeDeps();
		const host = makeHost();
		const cx = {
			app: deps.app,
			plugin: deps.plugin,
			settings: deps.settings,
			host,
			mode: host.mode,
			theme: deps.theme,
			prefs: deps.prefs,
			refs: deps.refs,
			session: deps.session,
		};
		expect(valuesRowElement.createView(cx)).toBeInstanceOf(ValuesRowElementView);
	});
});

describe('Plan 07 Task 5: values-row rendered through the REAL ElementPipeline', () => {
	test('golden render: byte-identical to the legacy wrapper (ds-values-row-ele-container + ValuesRowView.build)', async () => {
		const { root, deps } = await renderValuesRow(SAMPLE);

		// The legacy ValuesRowProcessor DOM, minus the framework-owned root div: a
		// `.ds-values-row-ele-container` wrapper around ValuesRowView.build().
		const golden = document.createElement('div');
		const goldenContainer = golden.createEl('div', { cls: 'ds-values-row-ele-container' });
		new ValuesRowView(deps.plugin, KeyValuePairs.parseYaml(SAMPLE), { sourcePath: 'Note.md' } as any).build(
			goldenContainer,
		);

		expect(root.innerHTML).toBe(golden.innerHTML);
	});

	test('root carries data-dse-element="values-row" + data-dse-theme; container classes match the legacy processor', async () => {
		const { root } = await renderValuesRow(SAMPLE);

		expect(root.getAttribute('data-dse-element')).toBe('values-row');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
		const container = root.querySelector(':scope > .ds-values-row-ele-container');
		expect(container).not.toBeNull();
		expect(container!.querySelector(':scope > .ds-values-row-container')).not.toBeNull();
	});

	test('cells: one .ds-values-row-cell per pair with value/name text and the configured em font sizes', async () => {
		const { root } = await renderValuesRow(SAMPLE);

		const cells = root.querySelectorAll('.ds-values-row-row > .ds-values-row-cell');
		expect(cells).toHaveLength(3);

		const values = Array.from(root.querySelectorAll('.ds-values-row-value')).map((el) => el.textContent);
		const names = Array.from(root.querySelectorAll('.ds-values-row-name')).map((el) => el.textContent);
		expect(values).toEqual(['5', '1M', '0']);
		expect(names).toEqual(['Speed', 'Size', 'Stability']);

		expect((root.querySelector('.ds-values-row-value') as HTMLElement).style.fontSize).toBe('2em');
		expect((root.querySelector('.ds-values-row-name') as HTMLElement).style.fontSize).toBe('1em');
	});

	test('nameless (scalar) entries render a value with an empty name (KVPair.nameless path)', async () => {
		const { root } = await renderValuesRow('values:\n  - lone value\n  - 42\n');

		const values = Array.from(root.querySelectorAll('.ds-values-row-value')).map((el) => el.textContent);
		const names = Array.from(root.querySelectorAll('.ds-values-row-name')).map((el) => el.textContent);
		expect(values).toEqual(['lone value', '42']);
		expect(names).toEqual(['', '']);
		// Defaults apply when heights are omitted: value 3em, name 1em.
		expect((root.querySelector('.ds-values-row-value') as HTMLElement).style.fontSize).toBe('3em');
	});

	test('static: rendering never writes back (no replaceSource) and no error card renders', async () => {
		const { root, host } = await renderValuesRow(SAMPLE);
		expect(host.replaceSource).not.toHaveBeenCalled();
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
	});

	test('ties ValuesRowElementView to host.addChild (block lifecycle)', async () => {
		const addChild = jest.fn((child: unknown) => child);
		await renderValuesRow(SAMPLE, { addChild } as Partial<BlockHost>);
		expect(addChild).toHaveBeenCalledTimes(1);
		expect(addChild.mock.calls[0][0]).toBeInstanceOf(ValuesRowElementView);
	});

	test('noClickShield: true — mousedown bubbles normally (the legacy processor never shielded)', async () => {
		const { root, host } = await renderValuesRow(SAMPLE);
		document.body.appendChild(host.containerEl);
		try {
			let bubbledToDocument = 0;
			const onDocMousedown = () => bubbledToDocument++;
			document.addEventListener('mousedown', onDocMousedown);
			try {
				const container = root.querySelector('.ds-values-row-container') as HTMLElement;
				container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
				expect(bubbledToDocument).toBe(1);
			} finally {
				document.removeEventListener('mousedown', onDocMousedown);
			}
		} finally {
			document.body.removeChild(host.containerEl);
		}
	});

	test('malformed YAML renders the framework error card (stage "parse") — replaces the legacy try/catch div', async () => {
		const { root } = await renderValuesRow('values: [unclosed');
		expect(root.getAttribute('data-dse-error-stage')).toBe('parse');
		expect(root.querySelector('.dse-error-card')).not.toBeNull();
		expect(root.querySelector('.dse-error-card-title')!.textContent).toContain('Values row: failed to render');
		expect(root.querySelector('.ds-values-row-container')).toBeNull();
	});

	test('valid YAML but bad shape (values not an array) renders the error card with the model\'s message (stage "render")', async () => {
		const { root } = await renderValuesRow('values: not-an-array\n');
		expect(root.getAttribute('data-dse-error-stage')).toBe('render');
		expect(root.querySelector('.dse-error-card')).not.toBeNull();
		expect(root.querySelector('.dse-error-card-message')!.textContent).toContain('Expected effects to be an array');
	});
});

describe('T-5: registered EXACTLY ONCE — framework registry owns ds-vr*, RegisterElements.ts does not', () => {
	test('registerFrameworkElementDefinitions registers values-row; every alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);

		expect(registry.get('values-row')?.id).toBe('values-row');
		for (const alias of VR_ALIASES) {
			expect(registry.get(alias)?.id).toBe('values-row');
		}
	});

	test('through the REAL onload(): each ds-vr* alias gets exactly one registerMarkdownCodeBlockProcessor call (no legacy double-registration)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		const registerSpy = jest.spyOn(plugin, 'registerMarkdownCodeBlockProcessor');

		await plugin.onload();

		for (const alias of VR_ALIASES) {
			const calls = registerSpy.mock.calls.filter(([language]: [string]) => language === alias);
			expect(calls).toHaveLength(1);
		}
		expect(plugin.frameworkV2!.registry.get('ds-vr')?.id).toBe('values-row');

		registerSpy.mockRestore();
	});

	test('rendering a ds-vr block through the wired processor produces the values-row DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-vr\n' + SAMPLE.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-vr');

		await handler(SAMPLE, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('values-row');
		expect(root.querySelector('.ds-values-row-ele-container .ds-values-row-container')).not.toBeNull();
	});
});
