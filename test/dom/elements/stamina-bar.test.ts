// Plan 09 Task 3 (D2 §3.5) — Stamina Bar on the D2 kit: the whole-element wrapper is the
// kit collapsible (title "Stamina Bar", seeded from collapse_default, NO session
// persistence — the element was never session-tracked), and the bar renders the
// .dse-stamina grammar: state COLOR via the [data-state] class (never inline), fill
// widths via --dse-fill/--dse-temp-fill setProperty geometry (SC-5). Clicking opens the
// unified managedModal StaminaEditModal (§3.5b).
//
// Carries forward D1 Task 3's persistence nets unchanged in SUBSTANCE: the write path
// through a REAL ReadingModeBlockHost + FakeVault ("exactly one replaceSource,
// fence/alias preserved") and BYTE-COMPAT of `serialize` against the legacy
// `stringifyYaml(StaminaBar.parseYaml)` — the compatibility bar for this task is that
// the DOM/CSS redesign changes NOTHING about the persisted YAML.
import * as fs from 'fs';
import * as path from 'path';
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
import { styleGuardFindings } from '../kit/styleGuard';
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

/** Numeric value of a --dse-* percentage custom property on an element. */
function dseVar(el: HTMLElement, prop: string): number {
	const raw = el.style.getPropertyValue(prop);
	if (raw === '') throw new Error(`no ${prop} custom property set`);
	return parseFloat(raw);
}

/** The kit iconButton (inside an open modal) carrying the given accessible name. */
function modalBtn(modalEl: HTMLElement, label: string): HTMLButtonElement {
	const el = modalEl.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
	if (!el) throw new Error(`no button [aria-label="${label}"]`);
	return el;
}

/** The unified modal's footer apply button (accent variant, dynamic text). */
function modalApplyBtn(modalEl: HTMLElement): HTMLButtonElement {
	const el = modalEl.querySelector<HTMLButtonElement>('.dse-modal__footer .dse-btn--accent');
	if (!el) throw new Error('no footer accent action button');
	return el;
}

afterEach(() => {
	document.body.innerHTML = '';
});

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

describe('D2 §3.5: stamina-bar rendered through the REAL ElementPipeline', () => {
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

	test('renders .dse-stamina: fill/temp/zone geometry as --dse-* custom properties, state via [data-state], the (cur/max + temp) pill — ZERO inline colors/widths', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, BASIC_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const bar = root.querySelector('.dse-stamina') as HTMLElement;
		expect(bar).not.toBeNull();
		expect(bar.classList.contains('dse-stamina--clickable')).toBe(true);
		expect(bar.style.getPropertyValue('--dse-bar-h')).toBe('1em');

		// max=20, current=15, temp=5 -> dyingStamina=10, totalStamina=30.
		const fill = bar.querySelector('.dse-stamina__fill') as HTMLElement;
		expect(dseVar(fill, '--dse-fill')).toBeCloseTo(((15 + 10) / 30) * 100, 2);
		expect(fill.getAttribute('data-state')).toBe('healthy'); // 15 >= floor(20/2)=10
		expect(fill.style.backgroundColor).toBe(''); // color is the [data-state] CSS rule's job
		expect(fill.style.width).toBe(''); // width is the --dse-fill CSS rule's job

		const temp = bar.querySelector('.dse-stamina__temp') as HTMLElement;
		expect(dseVar(temp, '--dse-temp-fill')).toBeCloseTo((5 / 30) * 100, 2);

		// One shared zone width feeds both threshold regions (floor(max/2)=10, ignoreDying).
		const track = bar.querySelector('.dse-stamina__track') as HTMLElement;
		expect(dseVar(track, '--dse-zone')).toBeCloseTo((10 / 30) * 100, 2);
		const thresholds = bar.querySelectorAll('.dse-stamina__threshold');
		expect(thresholds).toHaveLength(2);
		expect(thresholds[0].textContent).toBe('Dying');
		expect(thresholds[1].textContent).toBe('Winded');

		const pill = bar.querySelector('.dse-stamina__num .dse-stamina__pill') as HTMLElement;
		expect(pill.textContent).toBe('(15/20 + 5)');

		// SC-5: the ONLY inline styles anywhere under the element root are --dse-* props.
		for (const el of Array.from(root.querySelectorAll<HTMLElement>('[style]'))) {
			for (const decl of el.getAttribute('style')!.split(';')) {
				if (decl.trim() === '') continue;
				expect(decl.trim()).toMatch(/^--dse-/);
			}
		}
	});

	test('temp_stamina omitted (0): the pill omits the "+ N" suffix (CB-17 fix)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, 'max_stamina: 20\ncurrent_stamina: 15', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const pill = root.querySelector('.dse-stamina__num .dse-stamina__pill') as HTMLElement;
		expect(pill.textContent).toBe('(15/20)');
	});

	test('current_stamina <= 0: [data-state="dying"]', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, 'max_stamina: 20\ncurrent_stamina: 0', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const fill = root.querySelector('.dse-stamina__fill') as HTMLElement;
		expect(fill.getAttribute('data-state')).toBe('dying');
		expect(fill.style.backgroundColor).toBe('');
	});

	test('current_stamina below half max: [data-state="winded"]', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, 'max_stamina: 20\ncurrent_stamina: 5', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const fill = root.querySelector('.dse-stamina__fill') as HTMLElement;
		expect(fill.getAttribute('data-state')).toBe('winded');
	});

	test('CB-15 pinned: current_stamina omitted defaults to 0, not max (preserved, not "fixed" under D2)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, 'max_stamina: 20', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const pill = root.querySelector('.dse-stamina__num .dse-stamina__pill') as HTMLElement;
		expect(pill.textContent).toBe('(0/20)');
	});

	test('style: sheet renders the "not implemented" notice, not the bar', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, 'max_stamina: 20\nstyle: sheet', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelector('.dse-stamina')).toBeNull();
		const notice = root.querySelector('.dse-stamina__notice') as HTMLElement;
		expect(notice.textContent).toBe('Sheet style is not implemented, use default style');
	});

	describe('whole-element wrapper = kit collapsible (collapse_default YAML contract; NOT session-tracked)', () => {
		test('wraps the bar in ONE .dse-collapse titled "Stamina Bar", expanded by default', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();

			await pipeline.run(staminaBarElement, BASIC_YAML, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const wrapper = root.querySelector(':scope > .dse-collapse') as HTMLElement;
			expect(wrapper).not.toBeNull();
			const header = wrapper.querySelector(':scope > .dse-collapse__header') as HTMLButtonElement;
			expect(header.tagName).toBe('BUTTON');
			expect(header.getAttribute('aria-expanded')).toBe('true');
			expect(header.querySelector('.dse-collapse__title')?.textContent).toBe('Stamina Bar');
			const region = wrapper.querySelector(':scope > .dse-collapse__region') as HTMLElement;
			expect(region.hidden).toBe(false);
			expect(region.querySelector('.dse-stamina')).not.toBeNull();
			// The old kit ComponentWrapper chrome is gone.
			expect(root.querySelector('.ds-kit-eye-container')).toBeNull();
			expect(root.querySelector('.ds-kit-collapsed-wrapper')).toBeNull();
		});

		test('collapse_default: true starts collapsed (region hidden — content stays in the DOM)', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();

			await pipeline.run(staminaBarElement, `${BASIC_YAML}\ncollapse_default: true`, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const header = root.querySelector(':scope > .dse-collapse > .dse-collapse__header') as HTMLButtonElement;
			const region = root.querySelector(':scope > .dse-collapse > .dse-collapse__region') as HTMLElement;
			expect(header.getAttribute('aria-expanded')).toBe('false');
			expect(region.hidden).toBe(true);
			expect(region.querySelector('.dse-stamina')).not.toBeNull(); // hidden, not skipped
		});

		test('collapsible: false in the YAML is NOT honored — the legacy Vue quirk is preserved (StaminaBar.vue always passed `!disable_click`, never `model.collapsible`)', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();

			await pipeline.run(staminaBarElement, `${BASIC_YAML}\ncollapsible: false`, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			// The collapse affordance is still rendered (collapsible is hardcoded true).
			expect(root.querySelector(':scope > .dse-collapse > .dse-collapse__header')).not.toBeNull();
		});

		test('NOT session-tracked: a remount with the same blockKey starts fresh from collapse_default (unlike Skills)', async () => {
			const deps = makeDeps();

			const hostA = makeHost();
			await new ElementPipeline(deps).run(staminaBarElement, BASIC_YAML, hostA);
			const rootA = hostA.containerEl.firstElementChild as HTMLElement;
			const headerA = rootA.querySelector(':scope > .dse-collapse > .dse-collapse__header') as HTMLButtonElement;
			headerA.click(); // user collapses
			expect(headerA.getAttribute('aria-expanded')).toBe('false');

			// Same deps (same SessionStore) + same blockKey: the echo-rebuild equivalent.
			const hostB = makeHost();
			await new ElementPipeline(deps).run(staminaBarElement, BASIC_YAML, hostB);
			const rootB = hostB.containerEl.firstElementChild as HTMLElement;
			const headerB = rootB.querySelector(':scope > .dse-collapse > .dse-collapse__header') as HTMLButtonElement;
			expect(headerB.getAttribute('aria-expanded')).toBe('true'); // fresh, not remembered
		});
	});

	test('schema validation failure (missing max_stamina) renders the error card, not the bar', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, 'current_stamina: 5', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-error-stage')).toBe('schema');
		expect(root.querySelector('.dse-error-card')).not.toBeNull();
		expect(root.querySelector('.dse-stamina')).toBeNull();
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
		test('no clickable modifier, a read-only tooltip, and clicking never opens the modal / never writes', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost({ canPersist: false });

			await pipeline.run(staminaBarElement, BASIC_YAML, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			// The framework-level read-only affordance flows end-to-end through a real
			// element: the pipeline stamps data-dse-readonly on the root when
			// host.canPersist === false (the CSS badge hangs off this attribute).
			expect(root.hasAttribute('data-dse-readonly')).toBe(true);
			const bar = root.querySelector('.dse-stamina') as HTMLElement;
			expect(bar.classList.contains('dse-stamina--clickable')).toBe(false);
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

	describe('click -> the unified managedModal StaminaEditModal (§3.5b) -> edit -> persist', () => {
		test('clicking the bar opens the kit DseModal-based StaminaEditModal', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();

			await pipeline.run(staminaBarElement, BASIC_YAML, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const bar = root.querySelector('.dse-stamina') as HTMLElement;
			const bodyChildrenBefore = document.body.children.length;

			bar.click();

			expect(document.body.children.length).toBe(bodyChildrenBefore + 1);
			const modalEl = document.body.lastElementChild as HTMLElement;
			expect(modalEl.classList.contains('modal-container')).toBe(true);
			expect(modalEl.classList.contains('dse-modal')).toBe(true); // the kit scaffold
			expect(modalEl.querySelector('.dse-modal__title')?.textContent).toBe('Stamina');
			expect(modalEl.querySelector('.dse-sedit__apply-input')).not.toBeNull();
		});

		test('applying "Full Heal" mutates the model, refreshes the bar in place, and — after the debounce — persists exactly once with the expected byte-exact YAML', async () => {
			jest.useFakeTimers();
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();

			await pipeline.run(staminaBarElement, BASIC_YAML, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const bar = root.querySelector('.dse-stamina') as HTMLElement;
			const fill = bar.querySelector('.dse-stamina__fill') as HTMLElement;
			const pill = bar.querySelector('.dse-stamina__num .dse-stamina__pill') as HTMLElement;
			const fillBefore = dseVar(fill, '--dse-fill');

			bar.click();
			const modalEl = document.body.lastElementChild as HTMLElement;
			modalBtn(modalEl, 'Full Heal').click();
			modalApplyBtn(modalEl).click();

			// Targeted update happened synchronously (no rebuild, no debounce needed for the
			// visual refresh) — current 15/20 + temp 5 -> Full Heal -> current 20, temp 0.
			expect(pill.textContent).toBe('(20/20)');
			expect(dseVar(fill, '--dse-fill')).not.toBe(fillBefore);
			expect(dseVar(fill, '--dse-fill')).toBeCloseTo(100, 2);
			expect(host.replaceSource).not.toHaveBeenCalled(); // still inside the debounce window

			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			const written = host.replaceSource.mock.calls[0][0] as string;
			expect(written).toBe(
				['collapsible: true', 'collapse_default: false', 'max_stamina: 20', 'current_stamina: 20', 'temp_stamina: 0', 'height: 1', 'style: default'].join('\n'),
			);
		});

		test('a stepper edit updates the bar IN PLACE (same fill node, no rebuild) and persists exactly once, byte-identical', async () => {
			jest.useFakeTimers();
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();

			await pipeline.run(staminaBarElement, BASIC_YAML, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const bar = root.querySelector('.dse-stamina') as HTMLElement;
			const fill = bar.querySelector('.dse-stamina__fill') as HTMLElement;

			bar.click();
			const modalEl = document.body.lastElementChild as HTMLElement;
			modalBtn(modalEl, 'Increase Stamina').click(); // kit stepper: 15 -> 16
			modalApplyBtn(modalEl).click();

			// The SAME fill element was updated in place via setProperty — no DOM rebuild.
			expect(bar.querySelector('.dse-stamina__fill')).toBe(fill);
			expect(dseVar(fill, '--dse-fill')).toBeCloseTo(((16 + 10) / 30) * 100, 2);

			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			expect(host.replaceSource.mock.calls[0][0]).toBe(
				['collapsible: true', 'collapse_default: false', 'max_stamina: 20', 'current_stamina: 16', 'temp_stamina: 5', 'height: 1', 'style: default'].join('\n'),
			);
		});

		test('a modal opened by the view is closed on view unload (F1 §4.5, via openManagedModal)', async () => {
			const pipeline = new ElementPipeline(makeDeps());
			const host = makeHost();
			const addChild = jest.fn((child: unknown) => child);
			const hostWithSpy = { ...host, addChild };

			await pipeline.run(staminaBarElement, BASIC_YAML, hostWithSpy as BlockHost);
			const view = addChild.mock.calls[0][0] as StaminaBarView;

			const root = host.containerEl.firstElementChild as HTMLElement;
			(root.querySelector('.dse-stamina') as HTMLElement).click();
			const modalEl = document.body.lastElementChild as HTMLElement;
			expect(document.body.contains(modalEl)).toBe(true);

			view.unload();

			expect(document.body.contains(modalEl)).toBe(false);
		});
	});

	test('view source hygiene: no old-kit imports, kit from @/framework/kit, style guard clean (SC-5)', () => {
		const src = fs.readFileSync(path.join(__dirname, '../../../src/elements/stamina-bar/view.ts'), 'utf8');
		expect(src).not.toMatch(/mountComponentWrapper|mountCollapsibleHeading/);
		expect(src).toMatch(/from '@\/framework\/kit'/);
		expect(styleGuardFindings(src)).toEqual([]);
	});

	test('CSS contract: .dse-stamina consumes the --dse-stamina-* tokens via [data-state]; the old .ds-stamina-bar block is gone', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		expect(sheet).toMatch(/\.dse-stamina__fill\[data-state="healthy"\][^}]*var\(--dse-stamina-healthy\)/);
		expect(sheet).toMatch(/\.dse-stamina__fill\[data-state="winded"\][^}]*var\(--dse-stamina-winded\)/);
		expect(sheet).toMatch(/\.dse-stamina__fill\[data-state="dying"\][^}]*var\(--dse-stamina-dying\)/);
		expect(sheet).toMatch(/\.dse-stamina__temp\b[^}]*var\(--dse-stamina-temp\)/);
		expect(sheet).toMatch(/\.dse-stamina__track\b[^}]*var\(--dse-stamina-track\)/);
		// The D1 legacy-port block (its widths/colors were inline) is fully evicted.
		expect(sheet).not.toMatch(/\.ds-stamina-bar/);
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
		const bar = root.querySelector('.dse-stamina') as HTMLElement;
		bar.click();
		const modalEl = document.body.lastElementChild as HTMLElement;
		modalBtn(modalEl, 'Kill').click();
		modalApplyBtn(modalEl).click();

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
