// Plan 09 Task 1 (D2 §3.2) — Values Row on the shared `.dse-statgrid` grammar: the
// valuesRowElement definition + ValuesRowElementView, driven through the REAL
// ElementPipeline (static-element harness mirroring feature.test.ts; T-5 registration
// blocks mirroring its onload() suites). The redesign folds the deleted legacy
// ValuesRow/ValuesRowView into onMount: one `.dse-statgrid` of `__cell` (`__value` over
// `__label`) — the SAME grammar characteristics/view.ts renders ([data-dse-element]
// distinguishes them at the CSS level). SC-5 eviction: the value_height/name_height YAML
// knobs become --dse-value-scale/--dse-label-scale custom properties (sanctioned --dse-*
// geometry) — NEVER inline font-size, never inline color. Unlike most legacy DOM
// processors, ValuesRowProcessor never armed a click shield, so the definition opts OUT
// (noClickShield: true, same rationale as horizontal-rule).
import * as fs from 'fs';
import * as path from 'path';
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
import { App, Plugin, makeFakeContext } from '../../mocks/obsidian';
import { valuesRowElement } from '../../../src/elements/values-row/definition';
import { ValuesRowElementView } from '../../../src/elements/values-row/view';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import { styleGuardFindings } from '../kit/styleGuard';

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

describe('Plan 09 Task 1: values-row rendered through the REAL ElementPipeline (.dse-statgrid)', () => {
	test('renders ONE .dse-statgrid directly under the element root; NO legacy .ds-values-row-* DOM survives', async () => {
		const { root } = await renderValuesRow(SAMPLE);

		const grid = root.querySelector(':scope > .dse-statgrid');
		expect(grid).not.toBeNull();
		expect(root.querySelectorAll('.dse-statgrid')).toHaveLength(1);
		expect(root.querySelector('[class*="ds-values-row"]')).toBeNull();
	});

	test('root carries data-dse-element="values-row" + data-dse-theme (the attr that scopes the shared statgrid CSS)', async () => {
		const { root } = await renderValuesRow(SAMPLE);

		expect(root.getAttribute('data-dse-element')).toBe('values-row');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
	});

	test('cells: one __cell per pair, each a __value over a __label with the pair\'s text', async () => {
		const { root } = await renderValuesRow(SAMPLE);

		const cells = root.querySelectorAll('.dse-statgrid > .dse-statgrid__cell');
		expect(cells).toHaveLength(3);
		for (const cell of Array.from(cells)) {
			const children = Array.from(cell.children).map((el) => el.className);
			expect(children).toEqual(['dse-statgrid__value', 'dse-statgrid__label']);
		}

		const values = Array.from(root.querySelectorAll('.dse-statgrid__value')).map((el) => el.textContent);
		const labels = Array.from(root.querySelectorAll('.dse-statgrid__label')).map((el) => el.textContent);
		expect(values).toEqual(['5', '1M', '0']);
		expect(labels).toEqual(['Speed', 'Size', 'Stability']);
	});

	test('SC-5 eviction: value_height/name_height arrive as --dse-value-scale/--dse-label-scale via setProperty — NO inline font-size anywhere', async () => {
		const { root } = await renderValuesRow(SAMPLE);

		const grid = root.querySelector('.dse-statgrid') as HTMLElement;
		expect(grid.style.getPropertyValue('--dse-value-scale')).toBe('2');
		expect(grid.style.getPropertyValue('--dse-label-scale')).toBe('1');

		for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
			expect(el.style.fontSize).toBe('');
		}
	});

	test('defaults apply when heights are omitted: --dse-value-scale 3 / --dse-label-scale 1', async () => {
		const { root } = await renderValuesRow('values:\n  - lone value\n  - 42\n');

		const grid = root.querySelector('.dse-statgrid') as HTMLElement;
		expect(grid.style.getPropertyValue('--dse-value-scale')).toBe('3');
		expect(grid.style.getPropertyValue('--dse-label-scale')).toBe('1');
	});

	test('nameless (scalar) entries render a value with an empty label (KVPair.nameless path)', async () => {
		const { root } = await renderValuesRow('values:\n  - lone value\n  - 42\n');

		const values = Array.from(root.querySelectorAll('.dse-statgrid__value')).map((el) => el.textContent);
		const labels = Array.from(root.querySelectorAll('.dse-statgrid__label')).map((el) => el.textContent);
		expect(values).toEqual(['lone value', '42']);
		expect(labels).toEqual(['', '']);
	});

	test('D2 §5: zero inline color — no element carries style.color or any non---dse-* inline declaration', async () => {
		const { root } = await renderValuesRow(SAMPLE);

		for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
			expect(el.style.color).toBe('');
			const inline = el.getAttribute('style');
			if (inline !== null) {
				for (const decl of inline.split(';')) {
					if (decl.trim() === '') continue;
					expect(decl.trim().startsWith('--dse-')).toBe(true);
				}
			}
		}
	});

	test('view source hygiene: the ONLY .style access is setProperty("--dse-*", …) (shared kit style guard)', () => {
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/elements/values-row/view.ts'),
			'utf8',
		);
		expect(styleGuardFindings(src)).toEqual([]);
	});

	test('CSS contract: .dse-statgrid is scoped under BOTH element roots, consumes --dse-fg/--dse-fg-muted + the scale properties, and keeps the @media column flip', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

		// One shared block scoped under both [data-dse-element] roots (D2 §3.2/3.3).
		expect(sheet).toMatch(
			/\[data-dse-element="values-row"\]\s+\.dse-statgrid,\s*\n\s*\[data-dse-element="characteristics"\]\s+\.dse-statgrid\s*\{/,
		);

		const block = sheet.match(
			/\[data-dse-element="values-row"\]\s+\.dse-statgrid,\s*\n\s*\[data-dse-element="characteristics"\]\s+\.dse-statgrid\s*\{[\s\S]*?\n\}/,
		);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/var\(--dse-fg\)/);
		expect(block![0]).toMatch(/var\(--dse-fg-muted\)/);
		expect(block![0]).toMatch(/calc\(var\(--dse-value-scale/);
		expect(block![0]).toMatch(/calc\(var\(--dse-label-scale/);

		// Today's <=600px column flip, preserved (D2 §3.2 "today's @media column flip") —
		// a top-level media rule re-selecting both statgrid roots (see the CSS comment:
		// a nested `& {}` inside @media gets mangled by esbuild's minifier).
		const media = sheet.match(
			/@media\s*\(max-width:\s*600px\)\s*\{\s*\n\s*\[data-dse-element="values-row"\]\s+\.dse-statgrid,\s*\n\s*\[data-dse-element="characteristics"\]\s+\.dse-statgrid\s*\{[\s\S]*?\n\}/,
		);
		expect(media).not.toBeNull();
		expect(media![0]).toMatch(/flex-direction:\s*column/);

		// The old legacy class block is gone (both elements now render the statgrid).
		expect(sheet).not.toMatch(/\.ds-values-row-container/);
		expect(sheet).not.toMatch(/\.ds-characteristics-container/);
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
				const grid = root.querySelector('.dse-statgrid') as HTMLElement;
				grid.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
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
		expect(root.querySelector('.dse-statgrid')).toBeNull();
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

	test('rendering a ds-vr block through the wired processor produces the values-row statgrid DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-vr\n' + SAMPLE.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-vr');

		await handler(SAMPLE, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('values-row');
		expect(root.querySelector(':scope > .dse-statgrid .dse-statgrid__cell')).not.toBeNull();
	});
});
