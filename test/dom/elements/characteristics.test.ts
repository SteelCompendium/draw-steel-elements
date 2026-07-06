// Plan 09 Task 1 (D2 §3.3) — Characteristics on the shared `.dse-statgrid` grammar: the
// characteristicsElement definition + CharacteristicsElementView, driven through the REAL
// ElementPipeline (static-element harness mirroring feature.test.ts / values-row.test.ts;
// T-5 registration blocks mirroring their onload() suites). The redesign folds the deleted
// legacy Characteristics/CharacteristicsView into onMount: one `.dse-statgrid` of the five
// fixed characteristic `__cell`s (`__value` over `__label`) — the SAME grammar
// values-row/view.ts renders ([data-dse-element] distinguishes them at the CSS level; the
// shared CSS contract lives in values-row.test.ts). SC-5 eviction: value_height/name_height
// become --dse-value-scale/--dse-label-scale custom properties — never inline font-size,
// never inline color. Unlike Values Row, the legacy processor DID arm the capture-phase
// click shield, so the framework default (shield ON, noClickShield unset) stays.
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
import { Characteristics } from '@model/Characteristics';
import { App, Plugin, makeFakeContext } from '../../mocks/obsidian';
import { characteristicsElement } from '../../../src/elements/characteristics/definition';
import { CharacteristicsElementView } from '../../../src/elements/characteristics/view';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import { styleGuardFindings } from '../kit/styleGuard';

const CHAR_ALIASES = ['ds-char', 'ds-characteristics'] as const;

const SAMPLE = `might: 2
agility: 1
reason: 0
intuition: -1
presence: 3
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
		getBlockInfo: () => ({ language: 'ds-char', lineStart: 0, lineEnd: 9 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-char::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real service instances, same convention as feature.test.ts's makeDeps(). */
function makeDeps(): ElementPipelineDeps {
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
	};
}

async function renderCharacteristics(source: string, hostOverrides: Partial<BlockHost> = {}) {
	const deps = makeDeps();
	const pipeline = new ElementPipeline(deps);
	const host = makeHost(hostOverrides);
	await pipeline.run(characteristicsElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { pipeline, host, root, deps };
}

describe('Plan 07 Task 5: characteristics ElementDefinition (F1 §6 step 2)', () => {
	test('id/name/aliases/shape match the preserved ds-char/ds-characteristics contract; static, NO schema/serialize/resolveRefs', () => {
		expect(characteristicsElement.id).toBe('characteristics');
		expect(characteristicsElement.name).toBe('Characteristics');
		expect(characteristicsElement.aliases).toEqual([...CHAR_ALIASES]);
		expect(characteristicsElement.shape).toBe('static');
		expect(characteristicsElement.schema).toBeUndefined();
		expect(characteristicsElement.serialize).toBeUndefined();
		expect(characteristicsElement.resolveRefs).toBeUndefined();
		expect(characteristicsElement.autoResolveRefs).toBe(false);
	});

	test('noClickShield stays UNSET — the legacy CharacteristicsProcessor armed the shield, so the framework default (shield ON) is correct', () => {
		expect(characteristicsElement.noClickShield).toBeUndefined();
	});

	test('parse consumes the pipeline\'s PLAIN pre-parsed data (Characteristics.parse), NOT the raw text', () => {
		// `raw` is deliberately garbage: only `data` carries the block — the plain-model
		// case, opposite of feature.test.ts's SDK raw-text case.
		const model = characteristicsElement.parse(
			{ might: 2, agility: 1, intuition: -1, presence: 3, value_height: 2 },
			':::GARBAGE-RAW:::',
		);
		expect(model).toBeInstanceOf(Characteristics);
		expect(model.might).toBe(2);
		expect(model.agility).toBe(1);
		expect(model.reason).toBe(0); // omitted -> default 0
		expect(model.intuition).toBe(-1);
		expect(model.presence).toBe(3);
		expect(model.value_height).toBe(2);
		expect(model.name_height).toBe(1); // default
	});

	test('createView returns a CharacteristicsElementView', () => {
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
		expect(characteristicsElement.createView(cx)).toBeInstanceOf(CharacteristicsElementView);
	});
});

describe('Plan 09 Task 1: characteristics rendered through the REAL ElementPipeline (.dse-statgrid)', () => {
	test('renders ONE .dse-statgrid directly under the element root; NO legacy .ds-characteristics-* DOM survives', async () => {
		const { root } = await renderCharacteristics(SAMPLE);

		const grid = root.querySelector(':scope > .dse-statgrid');
		expect(grid).not.toBeNull();
		expect(root.querySelectorAll('.dse-statgrid')).toHaveLength(1);
		expect(root.querySelector('[class*="ds-characteristics"]')).toBeNull();
	});

	test('root carries data-dse-element="characteristics" + data-dse-theme (the attr that scopes the shared statgrid CSS)', async () => {
		const { root } = await renderCharacteristics(SAMPLE);

		expect(root.getAttribute('data-dse-element')).toBe('characteristics');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
	});

	test('cells: always the five fixed characteristics, each a __value over a __label', async () => {
		const { root } = await renderCharacteristics(SAMPLE);

		const cells = root.querySelectorAll('.dse-statgrid > .dse-statgrid__cell');
		expect(cells).toHaveLength(5);
		for (const cell of Array.from(cells)) {
			const children = Array.from(cell.children).map((el) => el.className);
			expect(children).toEqual(['dse-statgrid__value', 'dse-statgrid__label']);
		}

		const values = Array.from(root.querySelectorAll('.dse-statgrid__value')).map((el) => el.textContent);
		const labels = Array.from(root.querySelectorAll('.dse-statgrid__label')).map((el) => el.textContent);
		expect(values).toEqual(['2', '1', '0', '-1', '3']);
		expect(labels).toEqual(['Might', 'Agility', 'Reason', 'Intuition', 'Presence']);
	});

	test('SC-5 eviction: value_height/name_height arrive as --dse-value-scale/--dse-label-scale via setProperty — NO inline font-size anywhere', async () => {
		const { root } = await renderCharacteristics(SAMPLE);

		const grid = root.querySelector('.dse-statgrid') as HTMLElement;
		expect(grid.style.getPropertyValue('--dse-value-scale')).toBe('2');
		expect(grid.style.getPropertyValue('--dse-label-scale')).toBe('1');

		for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
			expect(el.style.fontSize).toBe('');
		}
	});

	test('omitted characteristics default to 0; omitted heights default to scale 3/1', async () => {
		const { root } = await renderCharacteristics('might: 4\n');

		const values = Array.from(root.querySelectorAll('.dse-statgrid__value')).map((el) => el.textContent);
		expect(values).toEqual(['4', '0', '0', '0', '0']);

		const grid = root.querySelector('.dse-statgrid') as HTMLElement;
		expect(grid.style.getPropertyValue('--dse-value-scale')).toBe('3');
		expect(grid.style.getPropertyValue('--dse-label-scale')).toBe('1');
	});

	test('D2 §5: zero inline color — no element carries style.color or any non---dse-* inline declaration', async () => {
		const { root } = await renderCharacteristics(SAMPLE);

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
			path.join(__dirname, '../../../src/elements/characteristics/view.ts'),
			'utf8',
		);
		expect(styleGuardFindings(src)).toEqual([]);
	});

	test('static: rendering never writes back (no replaceSource) and no error card renders', async () => {
		const { root, host } = await renderCharacteristics(SAMPLE);
		expect(host.replaceSource).not.toHaveBeenCalled();
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
	});

	test('ties CharacteristicsElementView to host.addChild (block lifecycle)', async () => {
		const addChild = jest.fn((child: unknown) => child);
		await renderCharacteristics(SAMPLE, { addChild } as Partial<BlockHost>);
		expect(addChild).toHaveBeenCalledTimes(1);
		expect(addChild.mock.calls[0][0]).toBeInstanceOf(CharacteristicsElementView);
	});

	test('pipeline default click shield replaces the legacy manual mousedown/pointerdown stop', async () => {
		const { root, host } = await renderCharacteristics(SAMPLE);
		document.body.appendChild(host.containerEl);
		try {
			let bubbledToDocument = 0;
			const onDocMousedown = () => bubbledToDocument++;
			document.addEventListener('mousedown', onDocMousedown);
			try {
				const grid = root.querySelector('.dse-statgrid') as HTMLElement;
				grid.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
				expect(bubbledToDocument).toBe(0);
			} finally {
				document.removeEventListener('mousedown', onDocMousedown);
			}
		} finally {
			document.body.removeChild(host.containerEl);
		}
	});

	test('malformed YAML renders the framework error card (stage "parse") — replaces the legacy try/catch div', async () => {
		const { root } = await renderCharacteristics('might: [unclosed');
		expect(root.getAttribute('data-dse-error-stage')).toBe('parse');
		expect(root.querySelector('.dse-error-card')).not.toBeNull();
		expect(root.querySelector('.dse-error-card-title')!.textContent).toContain(
			'Characteristics: failed to render',
		);
		expect(root.querySelector('.dse-statgrid')).toBeNull();
	});
});

describe('T-5: registered EXACTLY ONCE — framework registry owns ds-char*, RegisterElements.ts does not', () => {
	test('registerFrameworkElementDefinitions registers characteristics; every alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);

		expect(registry.get('characteristics')?.id).toBe('characteristics');
		for (const alias of CHAR_ALIASES) {
			expect(registry.get(alias)?.id).toBe('characteristics');
		}
	});

	test('through the REAL onload(): each ds-char* alias gets exactly one registerMarkdownCodeBlockProcessor call (no legacy double-registration)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		const registerSpy = jest.spyOn(plugin, 'registerMarkdownCodeBlockProcessor');

		await plugin.onload();

		for (const alias of CHAR_ALIASES) {
			const calls = registerSpy.mock.calls.filter(([language]: [string]) => language === alias);
			expect(calls).toHaveLength(1);
		}
		expect(plugin.frameworkV2!.registry.get('ds-char')?.id).toBe('characteristics');

		registerSpy.mockRestore();
	});

	test('rendering a ds-char block through the wired processor produces the characteristics statgrid DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-char\n' + SAMPLE.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-char');

		await handler(SAMPLE, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('characteristics');
		expect(root.querySelector(':scope > .dse-statgrid .dse-statgrid__cell')).not.toBeNull();
	});
});
