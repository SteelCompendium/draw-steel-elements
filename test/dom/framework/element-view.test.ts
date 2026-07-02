// T-7 (Plan 02): ElementView<M> base (+ HeroPanel<S> stub) — F1 §3.3, §4.2 (persisted
// write path), §4.5 (cleanup semantics).
//
// A concrete TestView subclass exercises the abstract base: onMount builds real DOM
// (jsdom createEl); public wrapper methods expose the `protected` renderMarkdown/
// persist/win members so tests can drive them directly (protected is a compile-time-only
// boundary — a subclass may call them on itself, so the wrappers stay type-clean under
// tsc, matching the no-`as any`-on-protected-access convention this suite otherwise
// follows).
import { ElementView, HeroPanel, PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import type { PanelHost } from '../../../src/framework/view';
import type { RenderContext } from '../../../src/framework/context';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { App, Component, MarkdownRenderer, Plugin } from '../../mocks/obsidian';

interface TestModel {
	value: string;
}

function makeHost(overrides: Partial<BlockHost> = {}) {
	// No explicit BlockHost-typed annotation on the literal itself (contextual typing
	// against an interface + `& jest.Mock` intersection collapses jest.fn()'s inferred
	// Mock type down to the interface's plain function signature); infer freely, then
	// cast once at the return — same "cast at the boundary" convention as
	// reading-mode-host.test.ts / context.test.ts.
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl: document.createElement('div'),
		canPersist: true,
		addChild: jest.fn((child: unknown) => child),
		getBlockInfo: jest.fn(() => ({ language: 'ds-test', lineStart: 0, lineEnd: 2 })),
		replaceSource,
		blockKey: jest.fn(() => 'Note.md::ds-test::0'),
		...overrides,
	};
	return host as BlockHost & { replaceSource: typeof replaceSource };
}

function makeContext(host: BlockHost): { cx: RenderContext; app: App; plugin: Plugin } {
	const app = new App();
	const plugin = new Plugin(app);
	// app/plugin cast to `any`: the mock App/Plugin are intentionally partial (no
	// keymap/scope/fileManager/… — see context.test.ts's identical convention) and
	// RenderContext uses them only via cx.app.vault / cx.plugin passthroughs elsewhere.
	const cx = {
		app: app as any,
		plugin: plugin as any,
		settings: {} as any,
		host,
		mode: host.mode,
		theme: {} as any,
		prefs: {} as any,
		refs: {} as any,
		session: {} as any,
	} as RenderContext;
	return { cx, app, plugin };
}

/** Minimal concrete subclass: builds one labeled div; exposes protected members for tests. */
class TestView extends ElementView<TestModel> {
	protected onMount(root: HTMLElement, model: TestModel): void {
		root.createEl('div', { cls: 'content', text: model.value });
	}

	triggerRenderMarkdown(markdown: string, el: HTMLElement): Promise<void> {
		return this.renderMarkdown(markdown, el);
	}
	triggerPersist(): Promise<boolean> {
		return this.persist();
	}
	get winForTest(): Window {
		return this.win;
	}
	injectSerializer(fn: (model: TestModel) => string): void {
		this.setSerializer(fn);
	}
	setModelForTest(model: TestModel): void {
		this.model = model;
	}
}

describe('T-7 (Plan 02): ElementView<M> (F1 §3.3)', () => {
	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	describe('mount(root, model)', () => {
		test('runs onMount and builds DOM via createEl', async () => {
			const host = makeHost();
			const { cx } = makeContext(host);
			const view = new TestView(cx);
			const root = document.createElement('div');

			await view.mount(root, { value: 'hello' });

			const content = root.querySelector('.content');
			expect(content).not.toBeNull();
			expect(content?.textContent).toBe('hello');
		});
	});

	describe('renderMarkdown(markdown, el)', () => {
		test('parents the render child to THIS VIEW, never the plugin (F1 §3.3)', async () => {
			const host = makeHost();
			const { cx, plugin } = makeContext(host);
			const view = new TestView(cx);
			const root = document.createElement('div');
			await view.mount(root, { value: 'x' });

			const renderSpy = jest.spyOn(MarkdownRenderer, 'render');
			const target = document.createElement('div');

			await view.triggerRenderMarkdown('**bold**', target);

			expect(renderSpy).toHaveBeenCalledTimes(1);
			const [appArg, markdownArg, elArg, sourcePathArg, componentArg] = renderSpy.mock.calls[0];
			expect(appArg).toBe(cx.app);
			expect(markdownArg).toBe('**bold**');
			expect(elArg).toBe(target);
			expect(sourcePathArg).toBe(host.sourcePath);
			// The load-bearing assertion: the 5th (owning-Component) arg is the VIEW...
			expect(componentArg).toBe(view);
			// ...never the plugin (so it tears down with the view, not plugin lifetime).
			expect(componentArg).not.toBe(plugin);
			expect(target.textContent).toBe('**bold**'); // mock recorder behavior (F3 §4.2)
		});
	});

	describe('Component lifecycle / cleanup (F1 §4.5)', () => {
		test('unload() detaches listeners registered via this.registerDomEvent', async () => {
			const host = makeHost();
			const { cx } = makeContext(host);
			let clicks = 0;
			class ListenerView extends ElementView<TestModel> {
				protected onMount(root: HTMLElement): void {
					const button = root.createEl('button');
					this.registerDomEvent(button, 'click', () => {
						clicks++;
					});
				}
			}
			const view = new ListenerView(cx);
			const root = document.createElement('div');
			await view.mount(root, { value: 'x' });
			const button = root.querySelector('button')!;

			button.click();
			expect(clicks).toBe(1);

			view.unload();
			button.click();
			expect(clicks).toBe(1); // no further increments: listener was torn down
		});
	});

	describe('update(model)', () => {
		test('delegates to onUpdate when the subclass provides it (no DOM rebuild)', async () => {
			const host = makeHost();
			const { cx } = makeContext(host);
			const seen: TestModel[] = [];
			class UpdatingView extends ElementView<TestModel> {
				protected onMount(root: HTMLElement, model: TestModel): void {
					root.createEl('div', { cls: 'content', text: model.value });
				}
				protected onUpdate(model: TestModel): void {
					seen.push(model);
				}
			}
			const view = new UpdatingView(cx);
			const root = document.createElement('div');
			await view.mount(root, { value: 'a' });

			await view.update({ value: 'b' });

			expect(seen).toEqual([{ value: 'b' }]);
			// onMount never re-ran: still exactly one .content div, still holding "a"
			// (onUpdate — not the base class — owns any DOM diffing in this path).
			expect(root.querySelectorAll('.content')).toHaveLength(1);
			expect(root.querySelector('.content')?.textContent).toBe('a');
		});

		test('default (no onUpdate): unloads owned children, empties rootEl, reruns onMount', async () => {
			const host = makeHost();
			const { cx } = makeContext(host);
			let childUnloaded = false;
			class RebuildingView extends ElementView<TestModel> {
				protected onMount(root: HTMLElement, model: TestModel): void {
					root.createEl('div', { cls: 'content', text: model.value });
					const child = new Component();
					child.onunload = () => {
						childUnloaded = true;
					};
					// Mock Component instance vs. the real `obsidian` Component type
					// ElementView.addChild's generic bound resolves to at compile time
					// (jest maps 'obsidian' to this same mock module at runtime — see
					// reading-mode-host.test.ts's identical `owned as any` convention).
					this.addChild(child as any);
				}
			}
			const view = new RebuildingView(cx);
			const root = document.createElement('div');
			await view.mount(root, { value: 'a' });
			expect(root.querySelector('.content')?.textContent).toBe('a');

			await view.update({ value: 'b' });

			expect(childUnloaded).toBe(true); // last onMount's owned child torn down
			expect(root.querySelectorAll('.content')).toHaveLength(1); // rebuilt, not accumulated
			expect(root.querySelector('.content')?.textContent).toBe('b');
		});
	});

	describe('win getter', () => {
		test('resolves to rootEl.ownerDocument.defaultView (popout-safe)', async () => {
			const host = makeHost();
			const { cx } = makeContext(host);
			const view = new TestView(cx);
			const root = document.createElement('div');
			await view.mount(root, { value: 'x' });

			expect(view.winForTest).toBe(root.ownerDocument.defaultView);
		});
	});

	describe('persist() (F1 §4.2)', () => {
		test('returns false and schedules nothing when host.canPersist is false', async () => {
			const host = makeHost({ canPersist: false });
			const { cx } = makeContext(host);
			const view = new TestView(cx);
			const root = document.createElement('div');
			await view.mount(root, { value: 'x' });
			view.injectSerializer((m) => `value: ${m.value}`);

			await expect(view.triggerPersist()).resolves.toBe(false);
			expect(host.replaceSource).not.toHaveBeenCalled();
		});

		test('throws immediately (fail-fast) when called before setSerializer() was wired', async () => {
			const host = makeHost();
			const { cx } = makeContext(host);
			const view = new TestView(cx);
			const root = document.createElement('div');
			await view.mount(root, { value: 'x' });
			// No injectSerializer() call.

			expect(() => view.triggerPersist()).toThrow(/setSerializer/);
			expect(host.replaceSource).not.toHaveBeenCalled();
		});

		test('serializes the model and writes via host.replaceSource after the debounce window', async () => {
			jest.useFakeTimers();
			const host = makeHost();
			const { cx } = makeContext(host);
			const view = new TestView(cx);
			const root = document.createElement('div');
			await view.mount(root, { value: 'initial' });
			view.injectSerializer((m) => `value: ${m.value}`);

			const result = view.triggerPersist();
			expect(host.replaceSource).not.toHaveBeenCalled(); // debounced, not immediate

			jest.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			expect(host.replaceSource).toHaveBeenCalledWith('value: initial');
			await expect(result).resolves.toBe(true);
		});

		test('rapid calls within the debounce window coalesce into exactly ONE write, using the LATEST model', async () => {
			jest.useFakeTimers();
			const host = makeHost();
			const { cx } = makeContext(host);
			const view = new TestView(cx);
			const root = document.createElement('div');
			await view.mount(root, { value: 'v1' });
			view.injectSerializer((m) => `value: ${m.value}`);

			const p1 = view.triggerPersist();
			view.setModelForTest({ value: 'v2' });
			const p2 = view.triggerPersist();
			view.setModelForTest({ value: 'v3' });
			const p3 = view.triggerPersist();

			jest.advanceTimersByTime(PERSIST_DEBOUNCE_MS - 1);
			expect(host.replaceSource).not.toHaveBeenCalled(); // still inside the trailing window

			jest.advanceTimersByTime(1);
			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			expect(host.replaceSource).toHaveBeenCalledWith('value: v3'); // model AT FLUSH TIME

			await expect(Promise.all([p1, p2, p3])).resolves.toEqual([true, true, true]);
		});

		test('a pending debounced write flushes immediately on unload — never drops the last edit (F1 §4.5)', async () => {
			jest.useFakeTimers();
			const host = makeHost();
			const { cx } = makeContext(host);
			const view = new TestView(cx);
			const root = document.createElement('div');
			await view.mount(root, { value: 'unsaved' });
			view.injectSerializer((m) => `value: ${m.value}`);

			const pending = view.triggerPersist();
			expect(host.replaceSource).not.toHaveBeenCalled();

			view.unload(); // note closed / block torn down before the 400ms timer fires

			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			expect(host.replaceSource).toHaveBeenCalledWith('value: unsaved');
			await expect(pending).resolves.toBe(true);

			// The debounce timer was cleared by the flush: advancing time must not double-write.
			jest.advanceTimersByTime(10_000);
			expect(host.replaceSource).toHaveBeenCalledTimes(1);
		});

		test('unload() with nothing pending is a harmless no-op (no spurious write)', async () => {
			const host = makeHost();
			const { cx } = makeContext(host);
			const view = new TestView(cx);
			const root = document.createElement('div');
			await view.mount(root, { value: 'x' });
			view.injectSerializer((m) => `value: ${m.value}`);

			view.unload();

			expect(host.replaceSource).not.toHaveBeenCalled();
		});
	});
});

describe('T-7 (Plan 02): HeroPanel<S> stub (D7 OD-7, additive)', () => {
	test('a concrete subclass mounts/updates a slice, emits onChange, and is Component-lifecycle-compatible', () => {
		const host = makeHost();
		const { cx } = makeContext(host);
		const panelHost: PanelHost = { readOnly: false };
		const changes: Array<Partial<{ count: number }>> = [];
		const updates: Array<{ count: number }> = [];

		class CounterPanel extends HeroPanel<{ count: number }> {
			mountPanel(
				root: HTMLElement,
				slice: { count: number },
				onChange: (patch: Partial<{ count: number }>) => void,
			): void {
				root.createEl('span', { cls: 'count', text: String(slice.count) });
				onChange({ count: slice.count + 1 });
			}
			updatePanel(slice: { count: number }): void {
				updates.push(slice);
			}
		}

		const panel = new CounterPanel(cx, panelHost);
		const root = document.createElement('div');

		panel.mountPanel(root, { count: 1 }, (patch) => changes.push(patch));
		panel.updatePanel({ count: 2 });

		expect(root.querySelector('.count')?.textContent).toBe('1');
		expect(changes).toEqual([{ count: 2 }]);
		expect(updates).toEqual([{ count: 2 }]);
		// No model/persist/refs concerns — but it IS a Component, so a container can
		// this.addChild(panel) and get correctly cascaded teardown (F1 §4.5).
		expect(panel).toBeInstanceOf(Component);
	});
});
