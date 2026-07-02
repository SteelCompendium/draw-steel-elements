// D1 Task 3 (Plan 03) — Stamina Bar: the first *persisted* element on Framework v2 (F1 §6
// step 4) and the LAST Vue element (unblocks Vue teardown, D1 step 4). Mirrors
// horizontal-rule.test.ts / skills.test.ts's convention of driving elements through the
// REAL ElementPipeline with real framework services; additionally drives the persisted
// write path through a REAL ReadingModeBlockHost + FakeVault (reading-mode-host.test.ts's
// pattern) to prove the "exactly one replaceSource, fence/alias preserved" contract, and
// asserts BYTE-COMPAT of `serialize` against the legacy `stringifyYaml(StaminaBar.parseYaml)`
// write path (D1 spec §"Step 3" / F1 §6's "byte-compatible output is the compatibility bar").
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { StaminaBar } from '@model/StaminaBar';
import { initializeSchemaRegistry, resetSchemaRegistry } from '@utils/JsonSchemaValidator';
import componentWrapperSchemaLegacy from '@model/schemas/ComponentWrapperSchema.yaml';
import { App, Plugin, stringifyYaml, makeFakeContext } from '../../mocks/obsidian';
import { staminaBarElement } from '../../../src/elements/stamina-bar/definition';
import { StaminaBarView } from '../../../src/elements/stamina-bar/view';
import { serialize as frameworkSerialize } from '../../../src/elements/stamina-bar/model';
// StaminaBarSchema.yaml $refs the shared component-wrapper dependency schema (F1 §5) — same
// convention as skills.test.ts.
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';

/** The documented example block (docs/stamina-bar.md / test/fixtures/stamina/basic.yaml). */
const BASIC_YAML = ['max_stamina: 20', 'current_stamina: 15', 'temp_stamina: 5'].join('\n');

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-stam', lineStart: 0, lineEnd: 4 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-stam::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real service instances, same convention as horizontal-rule.test.ts / skills.test.ts. */
function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const theme = createThemeService();
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) {
		validation.addDependencySchema(id, schema);
	}
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

/** Extracts the numeric percentage out of either a plain "NN.NNN%" or a
 *  "calc(NN.NNN% - Xpx)" inline style value. */
function pctOf(style: string): number {
	const match = style.match(/([\d.]+)%/);
	if (!match) throw new Error(`not a "...%..." value: "${style}"`);
	return Number(match[1]);
}

describe('D1 Task 3: stamina-bar ElementDefinition (F1 §6 step 4)', () => {
	test('id/aliases/shape/schema/serialize match the preserved ds-stam contract (persisted)', () => {
		expect(staminaBarElement.id).toBe('stamina-bar');
		expect(staminaBarElement.aliases).toEqual(['ds-stam', 'ds-stamina', 'ds-stamina-bar']);
		expect(staminaBarElement.shape).toBe('persisted');
		expect(staminaBarElement.schema).toBeDefined();
		expect(staminaBarElement.serialize).toBeDefined();
	});

	test('createView returns a StaminaBarView', () => {
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
		expect(staminaBarElement.createView(cx as any)).toBeInstanceOf(StaminaBarView);
	});
});

describe('D1 Task 3: stamina-bar rendered through the REAL ElementPipeline', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('root carries data-dse-element="stamina-bar" and data-dse-theme (F1 §3.5 contract)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, BASIC_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('stamina-bar');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
	});

	test('renders the bar with correct indicator width/color, temp overlay, dying/winded overlay width, and the (cur/max + temp) pill', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, BASIC_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const bar = root.querySelector('.ds-stamina-bar') as HTMLElement;
		expect(bar).not.toBeNull();
		expect(bar.classList.contains('clickable')).toBe(true);
		expect(bar.style.height).toBe('calc(1em + 4px)');

		// max=20, current=15, temp=5 -> dyingStamina=10, totalStamina=30.
		const indicator = bar.querySelector('.ds-stamina-bar-indicator') as HTMLElement;
		expect(pctOf(indicator.style.width)).toBeCloseTo(((15 + 10) / 30) * 100, 2);
		expect(indicator.style.backgroundColor).toBe('var(--stamina-bar-color)'); // 15 >= floor(20/2)=10

		const tempIndicator = bar.querySelector('.ds-stamina-bar-temp-indicator') as HTMLElement;
		expect(pctOf(tempIndicator.style.width)).toBeCloseTo((5 / 30) * 100, 2);

		const overlayPct = ((10) / 30) * 100; // floor(max/2)=10, ignoreDying
		const dying = bar.querySelector('.ds-stamina-bar-dying-overlay') as HTMLElement;
		const winded = bar.querySelector('.ds-stamina-bar-winded-overlay') as HTMLElement;
		expect(pctOf(dying.style.width)).toBeCloseTo(overlayPct, 2);
		expect(pctOf(winded.style.width)).toBeCloseTo(overlayPct, 2);

		const pill = bar.querySelector('.ds-stamina-bar-stamina-overlay .background-pill') as HTMLElement;
		expect(pill.textContent).toBe('(15/20 + 5)');
	});

	test('temp_stamina omitted (0): the pill omits the "+ N" suffix (CB-17 fix)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, 'max_stamina: 20\ncurrent_stamina: 15', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const pill = root.querySelector('.ds-stamina-bar-stamina-overlay .background-pill') as HTMLElement;
		expect(pill.textContent).toBe('(15/20)');
	});

	test('current_stamina <= 0: dying color', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, 'max_stamina: 20\ncurrent_stamina: 0', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const indicator = root.querySelector('.ds-stamina-bar-indicator') as HTMLElement;
		expect(indicator.style.backgroundColor).toBe('var(--stamina-bar-color-dying)');
	});

	test('current_stamina below half max: winded color', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, 'max_stamina: 20\ncurrent_stamina: 5', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const indicator = root.querySelector('.ds-stamina-bar-indicator') as HTMLElement;
		expect(indicator.style.backgroundColor).toBe('var(--stamina-bar-color-winded)');
	});

	test('CB-15 pinned: current_stamina omitted defaults to 0, not max (preserved, not "fixed" under D1)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, 'max_stamina: 20', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const pill = root.querySelector('.ds-stamina-bar-stamina-overlay .background-pill') as HTMLElement;
		expect(pill.textContent).toBe('(0/20)');
	});

	test('style: sheet renders the "not implemented" notice, not the bar', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, 'max_stamina: 20\nstyle: sheet', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelector('.ds-stamina-bar')).toBeNull();
		const notice = root.querySelector('.ds-stamina-bar-sheet-notice') as HTMLElement;
		expect(notice.textContent).toBe('Sheet style is not implemented, use default style');
	});

	test('collapse_default: true starts the whole element collapsed (component-wrapper, preserved YAML contract)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, `${BASIC_YAML}\ncollapse_default: true`, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelector('.ds-kit-collapsed-wrapper')).not.toBeNull();
		expect(root.querySelector('.ds-stamina-bar')).toBeNull();
		expect(root.querySelector('.ds-kit-collapsed-wrapper strong')?.textContent).toBe('Stamina Bar');
	});

	test('collapsible: false in the YAML is NOT honored — matches the legacy Vue quirk (StaminaBar.vue always passed `!disable_click`, never `model.collapsible`, to ComponentWrapper)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, `${BASIC_YAML}\ncollapsible: false`, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		// The eye-toggle indicator is still shown (collapsible is hardcoded true).
		expect(root.querySelector('.ds-kit-eye-container')).not.toBeNull();
	});

	test('schema validation failure (missing max_stamina) renders the error card, not the bar', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, 'current_stamina: 5', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-error-stage')).toBe('schema');
		expect(root.querySelector('.dse-error-card')).not.toBeNull();
		expect(root.querySelector('.ds-stamina-bar')).toBeNull();
	});

	test('ties StaminaBarView to host.addChild (block lifecycle)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const addChild = jest.fn((child: unknown) => child);
		const hostWithSpy = { ...host, addChild };

		await pipeline.run(staminaBarElement, BASIC_YAML, hostWithSpy as BlockHost);

		expect(addChild).toHaveBeenCalledTimes(1);
		expect(addChild.mock.calls[0][0]).toBeInstanceOf(StaminaBarView);
	});

	describe('canPersist: false (F1 §4.4 — visible but inert, not a dead-end click)', () => {
		test('no "clickable" class, a read-only tooltip, and clicking never opens the modal / never writes', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost({ canPersist: false });

			await pipeline.run(staminaBarElement, BASIC_YAML, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const bar = root.querySelector('.ds-stamina-bar') as HTMLElement;
			expect(bar.classList.contains('clickable')).toBe(false);
			expect(bar.getAttribute('data-tooltip')).toBe('Read-only in this context');

			document.body.appendChild(host.containerEl);
			const childCountBefore = document.body.children.length;
			try {
				bar.click();
				expect(document.body.children.length).toBe(childCountBefore); // no modal appended
				expect(host.replaceSource).not.toHaveBeenCalled();
			} finally {
				document.body.removeChild(host.containerEl);
			}
		});
	});

	describe('click -> DOM StaminaEditModal (OD-D1-1) -> edit -> persist', () => {
		test('clicking the bar opens the existing DOM StaminaEditModal (not a re-expression of the deleted Vue modal)', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();

			await pipeline.run(staminaBarElement, BASIC_YAML, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const bar = root.querySelector('.ds-stamina-bar') as HTMLElement;
			const bodyChildrenBefore = document.body.children.length;

			bar.click();

			expect(document.body.children.length).toBe(bodyChildrenBefore + 1);
			const modalEl = document.body.lastElementChild as HTMLElement;
			expect(modalEl.classList.contains('modal-container')).toBe(true);
			expect(modalEl.querySelector('.stamina-header')?.textContent?.trim()).toBe('Stamina');
			expect(modalEl.querySelector('.apply-input')).not.toBeNull(); // DOM modal's own markup
		});

		test('applying "Full Heal" mutates the model, refreshes the bar in place, and — after the debounce — persists exactly once with the expected byte-exact YAML', async () => {
			jest.useFakeTimers();
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();

			await pipeline.run(staminaBarElement, BASIC_YAML, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const bar = root.querySelector('.ds-stamina-bar') as HTMLElement;
			const indicator = bar.querySelector('.ds-stamina-bar-indicator') as HTMLElement;
			const pill = bar.querySelector('.ds-stamina-bar-stamina-overlay .background-pill') as HTMLElement;
			const widthBefore = indicator.style.width;

			bar.click();
			const modalEl = document.body.lastElementChild as HTMLElement;
			(modalEl.querySelectorAll('.quick-mod-btn')[1] as HTMLElement).click(); // Full Heal
			(modalEl.querySelector('.action-button') as HTMLElement).click();

			// Targeted update happened synchronously (no rebuild, no debounce needed for the
			// visual refresh) — current 15/20 + temp 5 -> Full Heal -> current 20, temp 0.
			expect(pill.textContent).toBe('(20/20)');
			expect(indicator.style.width).not.toBe(widthBefore);
			expect(host.replaceSource).not.toHaveBeenCalled(); // still inside the debounce window

			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			const written = host.replaceSource.mock.calls[0][0] as string;
			expect(written).toBe(
				['collapsible: true', 'collapse_default: false', 'max_stamina: 20', 'current_stamina: 20', 'temp_stamina: 0', 'height: 1', 'style: default'].join('\n'),
			);
		});

		test('a modal opened by the view is closed on view unload (F1 §4.5)', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();
			const addChild = jest.fn((child: unknown) => child);
			const hostWithSpy = { ...host, addChild };

			await pipeline.run(staminaBarElement, BASIC_YAML, hostWithSpy as BlockHost);
			const view = addChild.mock.calls[0][0] as StaminaBarView;

			const root = host.containerEl.firstElementChild as HTMLElement;
			(root.querySelector('.ds-stamina-bar') as HTMLElement).click();
			const modalEl = document.body.lastElementChild as HTMLElement;
			expect(document.body.contains(modalEl)).toBe(true);

			view.unload();

			expect(document.body.contains(modalEl)).toBe(false);
		});
	});
});

describe('D1 Task 3: persisted write path through a REAL ReadingModeBlockHost + FakeVault (F1 §3.4/§4.2)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('the documented example block (docs/stamina-bar.md, ~~~ds-stamina-bar fences): edit -> exactly one Vault write; fence style + alias preserved; surrounding note intact', async () => {
		jest.useFakeTimers();
		const app = new App();
		const note = [
			'# Session notes',
			'',
			'Before text.',
			'',
			'~~~ds-stamina-bar',
			'max_stamina: 20',
			'current_stamina: 15',
			'temp_stamina: 5',
			'~~~',
			'',
			'After text.',
		].join('\n');
		app.vault.setFile('Note.md', note);
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, 'Note.md');
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-stamina-bar');
		const pipeline = new ElementPipeline(makeDeps());

		await pipeline.run(staminaBarElement, 'max_stamina: 20\ncurrent_stamina: 15\ntemp_stamina: 5', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const bar = root.querySelector('.ds-stamina-bar') as HTMLElement;
		bar.click();
		const modalEl = document.body.lastElementChild as HTMLElement;
		(modalEl.querySelectorAll('.quick-mod-btn')[0] as HTMLElement).click(); // Kill
		(modalEl.querySelector('.action-button') as HTMLElement).click();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(app.vault.modifyCalls).toHaveLength(1);
		const updated = app.vault.getContent('Note.md')!;
		// Surrounding note + fence style + alias preserved (CB-5): the block is rewritten as
		// "~~~ds-stamina-bar" (never rewritten to a different alias/canonical form or to
		// backtick fences), everything outside the block byte-for-byte unchanged.
		expect(updated.startsWith('# Session notes\n\nBefore text.\n\n~~~ds-stamina-bar\n')).toBe(true);
		expect(updated.endsWith('\n~~~\n\nAfter text.')).toBe(true);
		const body = updated.match(/~~~ds-stamina-bar\n([\s\S]*?)\n~~~/)?.[1];
		// Hero (isHero:true), max 20 -> Kill floors at ceil(-0.5*20) = -10; temp -> 0.
		expect(body).toBe(
			['collapsible: true', 'collapse_default: false', 'max_stamina: 20', 'current_stamina: -10', 'temp_stamina: 0', 'height: 1', 'style: default'].join('\n'),
		);
	});
});

describe('D1 Task 3: byte-compat — serialize(parse(yaml)) === legacy stringifyYaml(StaminaBar.parseYaml(yaml)).trim() (F1 §6)', () => {
	// StaminaBar.parseYaml (the LEGACY path, kept alive for this comparison only) validates
	// via the separate legacy JsonSchemaValidator registry, not the framework's
	// ValidationService — same beforeAll/afterAll convention as
	// test/unit/model/stamina-bar.test.ts.
	beforeAll(() => {
		initializeSchemaRegistry([
			{ id: 'https://steelcompendium.io/schemas/component-wrapper-1.0.0', schema: componentWrapperSchemaLegacy },
		]);
	});
	afterAll(() => resetSchemaRegistry());

	test('the documented example block', () => {
		const legacy = stringifyYaml(StaminaBar.parseYaml(BASIC_YAML)).trim();
		const model = staminaBarElement.parse(
			{ max_stamina: 20, current_stamina: 15, temp_stamina: 5 },
			BASIC_YAML,
		);
		expect(frameworkSerialize(model)).toBe(legacy);
		expect(legacy).toBe(
			['collapsible: true', 'collapse_default: false', 'max_stamina: 20', 'current_stamina: 15', 'temp_stamina: 5', 'height: 1', 'style: default'].join('\n'),
		);
	});

	test('with collapsible/collapse_default/style explicitly set', () => {
		const yaml = 'max_stamina: 12\ncollapsible: false\ncollapse_default: true\nstyle: sheet\nheight: 2';
		const legacy = stringifyYaml(StaminaBar.parseYaml(yaml)).trim();
		const model = staminaBarElement.parse(
			{ max_stamina: 12, collapsible: false, collapse_default: true, style: 'sheet', height: 2 },
			yaml,
		);
		expect(frameworkSerialize(model)).toBe(legacy);
	});

	test('after an in-place edit (mutating existing fields does not change key insertion order)', () => {
		const model = staminaBarElement.parse({ max_stamina: 20, current_stamina: 15, temp_stamina: 5 }, BASIC_YAML);
		model.current_stamina = 20;
		model.temp_stamina = 0;

		const legacyEquivalent = new StaminaBar(true, false, 20, 20, 0, 1, 'default');
		const legacy = stringifyYaml(legacyEquivalent).trim();

		expect(frameworkSerialize(model)).toBe(legacy);
	});
});
