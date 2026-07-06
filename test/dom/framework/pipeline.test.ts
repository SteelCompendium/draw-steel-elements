// T-9 (Plan 02): ElementPipeline + renderErrorCard — F1 §2.4 (render pipeline &
// lifecycle), §3.8 (renderErrorCard), §2.2 (ASCII diagram), §4.2 (persisted write path).
//
// This is the integration keystone: it wires Tasks 1-8 (validation, session, refs,
// theme+prefs, BlockHost, RenderContext, ElementView, registry) together behind ONE error
// boundary. Fake ElementDefinitions below stand in for real elements (feature/counter/…)
// — the pipeline itself never imports src/elements/*.
//
// Ordering note (read F1 §2.4's PROSE, not the simplified §2.2 diagram — the task brief
// calls this out explicitly): `def.resolveRefs?(model, refs)` takes the MODEL, so a
// declared `resolveRefs` runs AFTER `def.parse`; an opt-in `autoResolveRefs: true`
// instead resolves the RAW parsed-YAML data BEFORE `def.parse` runs. Hardening pass
// after F1's final review: autoResolveRefs is opt-in (default OFF) — omitting both
// resolveRefs and autoResolveRefs skips reference resolution entirely. All three
// branches (resolveRefs, autoResolveRefs:true, the default skip) are exercised below,
// plus the explicit autoResolveRefs:false skip.
import { ElementPipeline, renderErrorCard, ElementStageError } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { ElementDefinition } from '../../../src/framework/registry';
import { ElementView, PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import type { ReferenceService, RefProvider } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import type { ValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, stringifyYaml } from '../../mocks/obsidian';

// ---------------------------------------------------------------- shared test fixtures

interface LabelModel {
	label: string;
}

/** Minimal static view: one labeled div, class "label-content". */
class LabelView extends ElementView<LabelModel> {
	protected onMount(root: HTMLElement, model: LabelModel): void {
		root.createEl('div', { cls: 'label-content', text: model.label });
	}
}

const LABEL_SCHEMA = ['type: object', 'properties:', '  label:', '    type: string', 'required:', '  - label'].join(
	'\n',
);

function labelDef(overrides: Partial<ElementDefinition<LabelModel>> = {}): ElementDefinition<LabelModel> {
	return {
		id: 'test-label',
		name: 'Test Label',
		aliases: ['ds-test-label'],
		shape: 'static',
		schema: LABEL_SCHEMA,
		parse: (data) => ({ label: String((data as { label: unknown }).label) }),
		createView: (cx) => new LabelView(cx),
		...overrides,
	};
}

interface CounterModel {
	count: number;
}

/** Persisted view: a button that increments the model and calls persist(). */
class CounterView extends ElementView<CounterModel> {
	protected onMount(root: HTMLElement, model: CounterModel): void {
		const span = root.createEl('span', { cls: 'count', text: String(model.count) });
		const button = root.createEl('button', { cls: 'increment', text: '+1' });
		this.registerDomEvent(button, 'click', () => {
			this.model.count += 1;
			span.textContent = String(this.model.count);
			void this.persist();
		});
	}
}

function counterDef(overrides: Partial<ElementDefinition<CounterModel>> = {}): ElementDefinition<CounterModel> {
	return {
		id: 'test-counter',
		name: 'Test Counter',
		aliases: ['ds-test-counter'],
		shape: 'persisted',
		parse: (data) => ({ count: Number((data as { count: unknown }).count ?? 0) }),
		serialize: (model) => stringifyYaml({ count: model.count }),
		createView: (cx) => new CounterView(cx),
		...overrides,
	};
}

// ---------------------------------------------------------------- test harness helpers

/** Hand-rolled BlockHost fake — same convention as element-view.test.ts's makeHost. */
function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const addChild = jest.fn((child: unknown) => child);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild,
		getBlockInfo: jest.fn(() => ({ language: 'ds-test', lineStart: 0, lineEnd: 2 })),
		replaceSource,
		blockKey: jest.fn(() => 'Note.md::ds-test::0'),
		...overrides,
	};
	return host as BlockHost & {
		containerEl: HTMLElement;
		replaceSource: typeof replaceSource;
		addChild: typeof addChild;
	};
}

/** Real service instances (per the task brief: use the real framework modules, not mocks). */
function makeDeps(): { deps: ElementPipelineDeps; refs: ReferenceService } {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	const session = createSessionStore();
	const deps: ElementPipelineDeps = {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme,
		prefs,
		refs,
		validation,
		session,
	};
	return { deps, refs };
}

describe('T-9 (Plan 02): ElementPipeline.run (F1 §2.4)', () => {
	describe('static element: parse -> validate -> createView -> mount', () => {
		test('renders the expected DOM; root carries data-dse-element/data-dse-theme', async () => {
			const { deps } = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			await pipeline.run(labelDef(), 'label: Hello World', host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root).not.toBeNull();
			expect(root.getAttribute('data-dse-element')).toBe('test-label');
			expect(root.getAttribute('data-dse-theme')).toBe('steel');
			expect(root.querySelector('.label-content')?.textContent).toBe('Hello World');
			expect(root.querySelector('.dse-error-card')).toBeNull();
		});

		test('ties the view to host.addChild (block lifecycle)', async () => {
			const { deps } = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			await pipeline.run(labelDef(), 'label: x', host);

			expect(host.addChild).toHaveBeenCalledTimes(1);
			expect(host.addChild.mock.calls[0][0]).toBeInstanceOf(LabelView);
		});

		test('theme/prefs attrs are present on root BEFORE onMount runs (first paint, F1 §2.4 step 4)', async () => {
			const { deps } = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();
			let themeAttrDuringMount: string | null | undefined;

			class CheckingView extends ElementView<LabelModel> {
				protected onMount(root: HTMLElement): void {
					themeAttrDuringMount = root.getAttribute('data-dse-theme');
				}
			}

			await pipeline.run(labelDef({ createView: (cx) => new CheckingView(cx) }), 'label: x', host);

			expect(themeAttrDuringMount).toBe('steel');
		});

		test('cx.theme.apply AND cx.prefs.reflect are both invoked BEFORE view.mount (F1 §2.4 step 4/5 ordering)', async () => {
			const { deps } = makeDeps();
			const applySpy = jest.spyOn(deps.theme, 'apply');
			const reflectSpy = jest.spyOn(deps.prefs, 'reflect');
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();
			let mountSpy: jest.SpyInstance | undefined;

			const def = labelDef({
				createView: (cx) => {
					const view = new LabelView(cx);
					mountSpy = jest.spyOn(view, 'mount');
					return view;
				},
			});

			await pipeline.run(def, 'label: x', host);

			expect(applySpy).toHaveBeenCalledTimes(1);
			expect(reflectSpy).toHaveBeenCalledTimes(1);
			expect(mountSpy).toHaveBeenCalledTimes(1);
			const applyOrder = applySpy.mock.invocationCallOrder[0];
			const reflectOrder = reflectSpy.mock.invocationCallOrder[0];
			const mountOrder = mountSpy!.mock.invocationCallOrder[0];
			expect(applyOrder).toBeLessThan(mountOrder);
			expect(reflectOrder).toBeLessThan(mountOrder);
		});
	});

	describe('persisted element: interaction -> persist() -> exactly one host.replaceSource (F1 §4.2)', () => {
		afterEach(() => {
			jest.useRealTimers();
		});

		test('clicking increment serializes the model and writes via host.replaceSource exactly once', async () => {
			jest.useFakeTimers();
			const { deps } = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			await pipeline.run(counterDef(), 'count: 1', host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			const button = root.querySelector('.increment') as HTMLButtonElement;
			button.click();
			button.click(); // second click within the debounce window — must coalesce

			jest.advanceTimersByTime(PERSIST_DEBOUNCE_MS);

			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			expect(host.replaceSource).toHaveBeenCalledWith(stringifyYaml({ count: 3 }));
			expect(root.querySelector('.count')?.textContent).toBe('3');
		});
	});

	describe('read-only stamp (data-dse-readonly) — host.canPersist', () => {
		test('canPersist === false: root is stamped data-dse-readonly; element/theme stamps unchanged', async () => {
			const { deps } = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost({ canPersist: false });

			await pipeline.run(counterDef(), 'count: 1', host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.hasAttribute('data-dse-readonly')).toBe(true);
			// Additive: the existing element/theme stamping is untouched.
			expect(root.getAttribute('data-dse-element')).toBe('test-counter');
			expect(root.getAttribute('data-dse-theme')).toBe('steel');
		});

		test('canPersist === true: the data-dse-readonly attribute is ABSENT', async () => {
			const { deps } = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost(); // canPersist: true (the fake's default)

			await pipeline.run(counterDef(), 'count: 1', host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.hasAttribute('data-dse-readonly')).toBe(false);
		});
	});

	describe('reference resolution ordering (F1 §2.4 step 3 prose)', () => {
		test('autoResolveRefs: true (opt-in): raw data is resolved BEFORE def.parse runs', async () => {
			const { deps, refs } = makeDeps();
			const parseCalls: unknown[] = [];
			const provider: RefProvider = {
				kind: 'test-ref',
				canResolve: (raw) => raw === 'REF:thing',
				resolve: async () => ({ data: { resolved: true } }),
			};
			refs.register(provider);
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			const def: ElementDefinition<LabelModel> = {
				id: 'test-autoref',
				name: 'Test Autoref',
				aliases: ['ds-test-autoref'],
				shape: 'static',
				autoResolveRefs: true, // opt-in (default is now OFF — F1 hardening pass)
				parse: (data) => {
					parseCalls.push(data);
					return { label: JSON.stringify(data) };
				},
				createView: (cx) => new LabelView(cx),
			};

			await pipeline.run(def, 'REF:thing', host);

			expect(parseCalls).toEqual([{ resolved: true }]); // NOT the raw string "REF:thing"
		});

		test('declared def.resolveRefs: def.parse runs FIRST, then resolveRefs receives the MODEL', async () => {
			const { deps } = makeDeps();
			const calls: string[] = [];
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			const def: ElementDefinition<LabelModel> = {
				id: 'test-customref',
				name: 'Test Customref',
				aliases: ['ds-test-customref'],
				shape: 'static',
				parse: (data) => {
					calls.push('parse');
					return { label: String((data as { label: unknown }).label) };
				},
				resolveRefs: async (model) => {
					calls.push('resolveRefs');
					return { label: `${model.label}-resolved` };
				},
				createView: (cx) => new LabelView(cx),
			};

			await pipeline.run(def, 'label: raw', host);

			expect(calls).toEqual(['parse', 'resolveRefs']);
			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelector('.label-content')?.textContent).toBe('raw-resolved');
		});

		test('autoResolveRefs: false with no resolveRefs: refs.resolveDeep is never called; parse gets raw data', async () => {
			const { deps, refs } = makeDeps();
			const resolveDeepSpy = jest.spyOn(refs, 'resolveDeep');
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			const def = labelDef({ autoResolveRefs: false, schema: undefined });

			await pipeline.run(def, 'label: "REF:thing"', host);

			expect(resolveDeepSpy).not.toHaveBeenCalled();
			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelector('.label-content')?.textContent).toBe('REF:thing');
		});

		test('neither resolveRefs nor autoResolveRefs declared (the new default, opt-in): refs.resolveDeep is never called; parse gets the raw string unchanged', async () => {
			const { deps, refs } = makeDeps();
			const resolveDeepSpy = jest.spyOn(refs, 'resolveDeep');
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			const def = labelDef(); // no resolveRefs, no autoResolveRefs

			await pipeline.run(def, 'label: "REF:thing"', host);

			expect(resolveDeepSpy).not.toHaveBeenCalled();
			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelector('.label-content')?.textContent).toBe('REF:thing');
		});
	});

	describe('click shield (F1 §2.4 step 4 / §1.2)', () => {
		function dispatchMousedownOnContent(root: HTMLElement): void {
			const content = root.querySelector('.label-content') as HTMLElement;
			content.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
		}

		test('capture-phase mousedown never bubbles past the root by default', async () => {
			const { deps } = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();
			document.body.appendChild(host.containerEl);
			try {
				await pipeline.run(labelDef(), 'label: x', host);
				const root = host.containerEl.firstElementChild as HTMLElement;
				let bubbledToDocument = 0;
				const onDocMousedown = () => bubbledToDocument++;
				document.addEventListener('mousedown', onDocMousedown);
				try {
					dispatchMousedownOnContent(root);
					expect(bubbledToDocument).toBe(0);
				} finally {
					document.removeEventListener('mousedown', onDocMousedown);
				}
			} finally {
				document.body.removeChild(host.containerEl);
			}
		});

		test('def.noClickShield === true: mousedown bubbles normally (shield not armed)', async () => {
			const { deps } = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();
			document.body.appendChild(host.containerEl);
			try {
				await pipeline.run(labelDef({ noClickShield: true }), 'label: x', host);
				const root = host.containerEl.firstElementChild as HTMLElement;
				let bubbledToDocument = 0;
				const onDocMousedown = () => bubbledToDocument++;
				document.addEventListener('mousedown', onDocMousedown);
				try {
					dispatchMousedownOnContent(root);
					expect(bubbledToDocument).toBe(1);
				} finally {
					document.removeEventListener('mousedown', onDocMousedown);
				}
			} finally {
				document.body.removeChild(host.containerEl);
			}
		});
	});

	describe('error boundary — ONE error card, correct stage, never half-mounted (F1 §2.4 / §3.8)', () => {
		test('bad YAML syntax -> ONE error card, stage "parse"', async () => {
			const { deps } = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			await pipeline.run(labelDef(), 'label: [unterminated', host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelectorAll('.dse-error-card')).toHaveLength(1);
			expect(root.getAttribute('data-dse-error-stage')).toBe('parse');
			expect(root.textContent).toContain('Test Label');
			expect(root.querySelector('.label-content')).toBeNull(); // not half-mounted
		});

		test('an unresolvable reference -> ONE error card, stage "reference" (4th stage, bonus coverage)', async () => {
			const { deps } = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			// "@NoSuchNote" satisfies the schema (a string) but the built-in at-path
			// provider's findFile fails (nothing registered in the fake vault) — with
			// autoResolveRefs opted in, the deep-walk (F1 §2.4 step 3) rejects before
			// def.parse ever runs.
			await pipeline.run(labelDef({ autoResolveRefs: true }), 'label: "@NoSuchNote"', host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelectorAll('.dse-error-card')).toHaveLength(1);
			expect(root.getAttribute('data-dse-error-stage')).toBe('reference');
			expect(root.querySelector('.label-content')).toBeNull(); // not half-mounted
		});

		test('a rejecting custom def.resolveRefs -> ONE error card, stage "reference" (no half-mount)', async () => {
			const { deps } = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			const def: ElementDefinition<LabelModel> = {
				id: 'test-rejecting-resolveRefs',
				name: 'Test Rejecting ResolveRefs',
				aliases: ['ds-test-rejecting-resolveRefs'],
				shape: 'static',
				parse: (data) => ({ label: String((data as { label: unknown }).label) }),
				resolveRefs: async () => {
					throw new Error('resolveRefs boom');
				},
				createView: (cx) => new LabelView(cx),
			};

			await pipeline.run(def, 'label: raw', host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelectorAll('.dse-error-card')).toHaveLength(1);
			expect(root.getAttribute('data-dse-error-stage')).toBe('reference');
			expect(root.textContent).toContain('resolveRefs boom');
			expect(root.querySelector('.label-content')).toBeNull(); // not half-mounted
		});

		test('ValidationService.validate throwing (distinct from a returned {valid:false}) -> ONE error card, stage "schema"', async () => {
			const { deps } = makeDeps();
			const throwingValidation: ValidationService = {
				addDependencySchema: () => {},
				validate: () => {
					throw new Error('validate boom');
				},
			};
			const pipeline = new ElementPipeline({ ...deps, validation: throwingValidation });
			const host = makeHost();

			await pipeline.run(labelDef(), 'label: x', host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelectorAll('.dse-error-card')).toHaveLength(1);
			expect(root.getAttribute('data-dse-error-stage')).toBe('schema');
			expect(root.textContent).toContain('validate boom');
			expect(root.querySelector('.label-content')).toBeNull(); // not half-mounted
		});

		test('schema-invalid input -> ONE error card, stage "schema", path: message list', async () => {
			const { deps } = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			await pipeline.run(labelDef(), 'nope: 1', host); // missing required "label"

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelectorAll('.dse-error-card')).toHaveLength(1);
			expect(root.getAttribute('data-dse-error-stage')).toBe('schema');
			const items = Array.from(root.querySelectorAll('li')).map((li) => li.textContent);
			expect(items.length).toBeGreaterThan(0);
			expect(items[0]).toMatch(/:/); // "path: message" shape
			expect(root.querySelector('.label-content')).toBeNull(); // not half-mounted
		});

		test('createView throws -> ONE error card, stage "render"', async () => {
			const { deps } = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			const def = labelDef({
				createView: () => {
					throw new Error('createView boom');
				},
			});

			await pipeline.run(def, 'label: x', host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelectorAll('.dse-error-card')).toHaveLength(1);
			expect(root.getAttribute('data-dse-error-stage')).toBe('render');
			expect(root.textContent).toContain('createView boom');
			expect(host.addChild).not.toHaveBeenCalled();
		});

		test('onMount throws after building partial DOM -> ONE error card, root is NOT half-mounted', async () => {
			const { deps } = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			class PartialThenThrowView extends ElementView<LabelModel> {
				protected onMount(root: HTMLElement): void {
					root.createEl('div', { cls: 'partial-content', text: 'half built' });
					throw new Error('onMount boom');
				}
			}
			const def = labelDef({ createView: (cx) => new PartialThenThrowView(cx) });

			await pipeline.run(def, 'label: x', host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelectorAll('.dse-error-card')).toHaveLength(1);
			expect(root.querySelector('.partial-content')).toBeNull(); // partial DOM was cleared
			expect(root.getAttribute('data-dse-error-stage')).toBe('render');
			expect(root.textContent).toContain('onMount boom');
		});

		test('a rejected onMount (async) is caught by the same single boundary -> stage "render"', async () => {
			const { deps } = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost();

			class AsyncThrowingView extends ElementView<LabelModel> {
				protected async onMount(): Promise<void> {
					await Promise.resolve();
					throw new Error('async onMount boom');
				}
			}
			const def = labelDef({ createView: (cx) => new AsyncThrowingView(cx) });

			await pipeline.run(def, 'label: x', host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelectorAll('.dse-error-card')).toHaveLength(1);
			expect(root.getAttribute('data-dse-error-stage')).toBe('render');
			expect(root.textContent).toContain('async onMount boom');
		});
	});
});

describe('T-9 (Plan 02): renderErrorCard (F1 §3.8)', () => {
	test('renders element name + stage + message for an ElementStageError-tagged Error', () => {
		const root = document.createElement('div');

		renderErrorCard(root, { id: 'thing-x', name: 'Thing X' }, new ElementStageError('render', new Error('kaboom')));

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(1);
		expect(root.getAttribute('data-dse-error-stage')).toBe('render');
		expect(root.textContent).toContain('Thing X');
		expect(root.textContent).toContain('kaboom');
	});

	test('an untagged plain Error defaults to stage "render"', () => {
		const root = document.createElement('div');

		renderErrorCard(root, { id: 'thing-x', name: 'Thing X' }, new Error('plain failure'));

		expect(root.getAttribute('data-dse-error-stage')).toBe('render');
		expect(root.textContent).toContain('plain failure');
	});

	test('a ValidationResult renders stage "schema" and one path: message <li> per error', () => {
		const root = document.createElement('div');
		const validationResult = {
			valid: false,
			errors: [
				{ message: 'must be string', path: 'label' },
				{ message: 'is required', path: 'name' },
			],
		};

		renderErrorCard(root, { id: 'thing-x', name: 'Thing X' }, validationResult);

		expect(root.getAttribute('data-dse-error-stage')).toBe('schema');
		const items = Array.from(root.querySelectorAll('li')).map((li) => li.textContent);
		expect(items).toEqual(['label: must be string', 'name: is required']);
	});

	test('clears any pre-existing root content before rendering (idempotent, never stacks)', () => {
		const root = document.createElement('div');
		root.createEl('div', { cls: 'stale', text: 'leftover' });

		renderErrorCard(root, { id: 'thing-x', name: 'Thing X' }, new Error('boom'));

		expect(root.querySelector('.stale')).toBeNull();
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(1);
	});

	test('built with createEl, not innerHTML (a "<script>"-laced message is text, not markup)', () => {
		const root = document.createElement('div');

		renderErrorCard(root, { id: 'thing-x', name: 'Thing X' }, new Error('<script>evil()</script>'));

		expect(root.querySelector('script')).toBeNull();
		expect(root.textContent).toContain('<script>evil()</script>');
	});
});
