// SC-198 — PreviewScrollPin: the reading-mode scroll fix.
//
// The bug is a passive CLAMP, not a scroll: Obsidian's post-write preview rebuild collapses
// `.markdown-preview-sizer`'s min-height, `scrollHeight` falls to `clientHeight`, and the
// browser truncates `scrollTop` as a layout consequence. The fix therefore asserts the ONE
// thing that prevents a clamp — that the scroller is held tall enough across the rebuild —
// and, just as importantly, that the pin is never left behind (TTL, releaseAll, unload) and
// is never taken when there is nothing to protect.
//
// jsdom has no layout, so scrollTop/scrollHeight/clientHeight are defined per-element below;
// that is exactly the input the production code reads, so the guards are exercised for real.
import { PreviewScrollPin, pinRule } from '../../../src/framework/host/previewScrollPin';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { registerFrameworkElements } from '../../../src/framework/registerFrameworkElements';
import type { ElementDefinition, ElementRegistry } from '../../../src/framework/registry';
import type { ElementPipeline } from '../../../src/framework/pipeline';
import type { BlockHost } from '../../../src/framework/host/BlockHost';
import { ViewRegistry } from '../../../src/framework/host/viewRegistry';
import { App, Component, Plugin, makeFakeContext } from '../../mocks/obsidian';

const PIN_ATTR = 'data-dse-scroll-pin';
const STYLE_ATTR = 'data-dse-scroll-pin-style';
/** Must match PIN_TTL_MS in previewScrollPin.ts. */
const TTL = 2500;

interface Metrics {
	scrollTop?: number;
	scrollHeight?: number;
	clientHeight?: number;
}

const setMetric = (scroller: HTMLElement, key: keyof Metrics, value: number): void => {
	Object.defineProperty(scroller, key, { value, configurable: true, writable: true });
};

/** A reading-view shape: `.markdown-preview-view` > `.markdown-preview-sizer` > block el. */
function makeScroller(metrics: Metrics = {}, doc: Document = document): { scroller: HTMLElement; el: HTMLElement } {
	const scroller = doc.createElement('div');
	scroller.className = 'markdown-preview-view';
	const sizer = doc.createElement('div');
	sizer.className = 'markdown-preview-sizer';
	const el = doc.createElement('div');
	sizer.appendChild(el);
	scroller.appendChild(sizer);
	doc.body.appendChild(scroller);
	for (const [key, value] of Object.entries({
		scrollTop: 2596,
		scrollHeight: 4883,
		clientHeight: 974,
		...metrics,
	})) {
		Object.defineProperty(scroller, key, { value, configurable: true, writable: true });
	}
	return { scroller, el };
}

const isPinned = (scroller: HTMLElement): boolean => scroller.hasAttribute(PIN_ATTR);
/** The `<style>` that holds the scroller's pin rule (SC-470), looked up in the scroller's own document. */
const pinStyle = (scroller: HTMLElement): HTMLStyleElement | null =>
	scroller.ownerDocument.head.querySelector<HTMLStyleElement>(`style[${STYLE_ATTR}="${scroller.getAttribute(PIN_ATTR)}"]`);
/** The height the scroller's rule holds, as '<n>px' ('' when no rule). */
const pinnedPx = (scroller: HTMLElement): string => {
	const m = /min-height: (\d+)px !important/.exec(pinStyle(scroller)?.textContent ?? '');
	return m ? `${m[1]}px` : '';
};
const sizerOf = (scroller: HTMLElement): HTMLElement => scroller.querySelector<HTMLElement>(':scope > .markdown-preview-sizer')!;
/** Let MutationObserver callbacks run (jsdom delivers them as microtasks). */
const flushObservers = async (): Promise<void> => {
	for (let i = 0; i < 3; i++) await Promise.resolve();
};
const allPinStyles = (doc: Document = document): number => doc.head.querySelectorAll(`style[${STYLE_ATTR}]`).length;

// Tests that pin without advancing the TTL leave their injected rule behind; start every test clean.
afterEach(() => {
	document.head.querySelectorAll(`style[${STYLE_ATTR}]`).forEach((n) => n.remove());
});

describe('SC-198: PreviewScrollPin', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	describe('pin()', () => {
		test('holds the scroller at its CURRENT height, keyed on the scroller itself', () => {
			const { scroller, el } = makeScroller();
			new PreviewScrollPin().pin(el);
			expect(isPinned(scroller)).toBe(true);
			expect(pinnedPx(scroller)).toBe('4883px');
			// On the scroller, never the sizer: Obsidian may replace the sizer node during
			// the rebuild, which would take an attribute set there with it.
			expect(scroller.querySelector('.markdown-preview-sizer')!.hasAttribute(PIN_ATTR)).toBe(false);
		});

		// SC-470: the height rides in a per-pin stylesheet rule, never in an inherited custom
		// property on the scroller (its set/clear restyled the whole preview: ~220 ms each way).
		test('SC-470: the height is one injected rule keyed on the attribute value; no custom property or inline style on the scroller', () => {
			const { scroller, el } = makeScroller();
			new PreviewScrollPin().pin(el);
			const id = scroller.getAttribute(PIN_ATTR)!;
			expect(id).not.toBe('');
			const styles = document.head.querySelectorAll(`style[${STYLE_ATTR}]`);
			expect(styles).toHaveLength(1);
			expect(styles[0].textContent).toBe(
				`.markdown-preview-view[${PIN_ATTR}="${id}"] > .markdown-preview-sizer { min-height: 4883px !important; }`,
			);
			expect(scroller.getAttribute('style')).toBeNull();
			expect(scroller.style.getPropertyValue('--dse-scroll-pin')).toBe('');
		});

		test('SC-470: two pinned scrollers get distinct ids and rules (neither rule can match the other)', () => {
			const a = makeScroller();
			const b = makeScroller({ scrollHeight: 6000 });
			const pin = new PreviewScrollPin();
			pin.pin(a.el);
			pin.pin(b.el);
			expect(a.scroller.getAttribute(PIN_ATTR)).not.toBe(b.scroller.getAttribute(PIN_ATTR));
			expect(allPinStyles()).toBe(2);
			expect(pinnedPx(a.scroller)).toBe('4883px');
			expect(pinnedPx(b.scroller)).toBe('6000px');
		});

		test("SC-470: a scroller in another window's document gets its rule in THAT document's head, and releaseAll() clears it there", () => {
			const frame = document.createElement('iframe');
			document.body.appendChild(frame);
			const popout = frame.contentDocument!;
			const main = makeScroller();
			const out = makeScroller({}, popout);
			const pin = new PreviewScrollPin();
			pin.pin(main.el);
			pin.pin(out.el);
			expect(allPinStyles(document)).toBe(1);
			expect(allPinStyles(popout)).toBe(1);
			expect(pinnedPx(out.scroller)).toBe('4883px');
			pin.releaseAll();
			expect(allPinStyles(document)).toBe(0);
			expect(allPinStyles(popout)).toBe(0);
			expect(isPinned(out.scroller)).toBe(false);
		});

		test('does nothing when the block is not inside a reading-view scroller (sidebar/embed/canvas)', () => {
			const orphan = document.createElement('div');
			document.body.appendChild(orphan);
			expect(() => new PreviewScrollPin().pin(orphan)).not.toThrow();
			expect(document.querySelector(`[${PIN_ATTR}]`)).toBeNull();
		});

		test('does nothing when the view is already at the top — nothing can be clamped away', () => {
			const { scroller, el } = makeScroller({ scrollTop: 0 });
			new PreviewScrollPin().pin(el);
			expect(isPinned(scroller)).toBe(false);
		});

		test('does nothing when the document does not scroll at all', () => {
			const { scroller, el } = makeScroller({ scrollTop: 0, scrollHeight: 900, clientHeight: 974 });
			new PreviewScrollPin().pin(el);
			expect(isPinned(scroller)).toBe(false);
		});
	});

	describe('release', () => {
		beforeEach(() => jest.useFakeTimers());
		afterEach(() => jest.useRealTimers());

		test('the TTL drops the pin even if the expected rebuild never arrives', () => {
			const { scroller, el } = makeScroller();
			new PreviewScrollPin().pin(el);
			jest.advanceTimersByTime(TTL - 1);
			expect(isPinned(scroller)).toBe(true);
			jest.advanceTimersByTime(1);
			expect(isPinned(scroller)).toBe(false);
			expect(pinStyle(scroller)).toBeNull();
			expect(allPinStyles()).toBe(0); // the injected rule goes with the attribute
		});

		test('a re-pin refreshes the TTL and takes no ratchet from the scroller\'s own padding on rapid clicks', () => {
			const { scroller, el } = makeScroller();
			scroller.style.paddingTop = '32px';
			scroller.style.paddingBottom = '32px';
			// Obsidian's own inline sizer min-height: the scroller's scrollHeight minus its padding.
			sizerOf(scroller).style.minHeight = '4819px';
			const pin = new PreviewScrollPin();
			pin.pin(el);
			expect(pinnedPx(scroller)).toBe('4883px');

			// The rule replaces the inline value, so while pinned scrollHeight reads back as the
			// pinned value plus the scroller's padding, and the inline value is unchanged.
			// Re-measuring either raw would ratchet the pin up on every write.
			setMetric(scroller, 'scrollHeight', 4883 + 64);
			jest.advanceTimersByTime(TTL - 500);
			pin.pin(el);
			pin.pin(el);
			expect(pinnedPx(scroller)).toBe('4883px');

			// ...and the second pin's own full TTL is now running.
			jest.advanceTimersByTime(TTL - 1);
			expect(isPinned(scroller)).toBe(true);
			jest.advanceTimersByTime(1);
			expect(isPinned(scroller)).toBe(false);
		});

		test('a re-pin is taken even from scrollTop 0 — the held position is still worth protecting', () => {
			const { scroller, el } = makeScroller();
			const pin = new PreviewScrollPin();
			pin.pin(el);
			Object.defineProperty(scroller, 'scrollTop', { value: 0, configurable: true, writable: true });
			jest.advanceTimersByTime(1000);
			pin.pin(el);
			jest.advanceTimersByTime(TTL - 1);
			expect(isPinned(scroller)).toBe(true);
		});

		test('releaseAll() drops every outstanding pin and is idempotent', () => {
			const a = makeScroller();
			const b = makeScroller();
			const pin = new PreviewScrollPin();
			pin.pin(a.el);
			pin.pin(b.el);
			expect(isPinned(a.scroller)).toBe(true);
			expect(isPinned(b.scroller)).toBe(true);
			pin.releaseAll();
			pin.releaseAll();
			expect(isPinned(a.scroller)).toBe(false);
			expect(isPinned(b.scroller)).toBe(false);
			expect(allPinStyles()).toBe(0);
			// Nothing left running that could re-touch a scroller the plugin no longer owns.
			jest.advanceTimersByTime(TTL * 2);
			expect(document.querySelector(`[${PIN_ATTR}]`)).toBeNull();
		});
	});
});

const NOTE = ['# Session notes', '', '```ds-initiative', 'round: 1', '```', '', 'After.'].join('\n');

describe('SC-198: ReadingModeBlockHost pins around its own write', () => {
	test('pins inside the vault.process callback, before the write lands — the pin must be up when Obsidian sees the modify', async () => {
		const app = new App();
		app.vault.setFile('Note.md', NOTE);
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, 'Note.md');
		const { el } = makeScroller();
		el.appendChild(ctx.el);

		const contentAtPin: Array<string | null | undefined> = [];
		const scrollPin = new PreviewScrollPin();
		const spy = jest.spyOn(scrollPin, 'pin').mockImplementation(() => {
			contentAtPin.push(app.vault.getContent('Note.md'));
		});

		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-initiative', scrollPin);
		await host.replaceSource('round: 2');

		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith(ctx.el);
		// The note was still untouched at pin time — i.e. the pin is not racing the rebuild.
		expect(contentAtPin[0]).toBe(NOTE);
		expect(app.vault.getContent('Note.md')).toContain('round: 2');
		document.body.innerHTML = '';
	});

	// SC-260: a write whose result is byte-identical to the disk is no-opped by Obsidian (no
	// `modify`, no rebuild), so a pin taken for it would hold phantom scroll space for the full
	// TTL. The pin is therefore decided inside the Vault.process callback, once the result is known.
	test('SC-260: a no-op write (body identical to disk) takes no pin, still resolves true and leaves no claim ticket', async () => {
		const app = new App();
		app.vault.setFile('Note.md', NOTE);
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, 'Note.md');
		const { scroller, el } = makeScroller();
		el.appendChild(ctx.el);
		const scrollPin = new PreviewScrollPin();
		const spy = jest.spyOn(scrollPin, 'pin');
		const registry = new ViewRegistry({ enabled: true });
		registry.load();

		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-initiative', scrollPin, registry);
		const entry = registry.own(new Component() as any, host, document.createElement('div'));
		await expect(host.replaceSource('round: 1')).resolves.toBe(true);

		expect(spy).not.toHaveBeenCalled();
		expect(scroller.hasAttribute(PIN_ATTR)).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(NOTE);
		expect(entry.tickets).toHaveLength(0);
		document.body.innerHTML = '';
	});

	test('SC-260: a changing write pins exactly once, inside the callback, before the vault write lands', async () => {
		const app = new App();
		app.vault.setFile('Note.md', NOTE);
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, 'Note.md');
		const { el } = makeScroller();
		el.appendChild(ctx.el);
		const scrollPin = new PreviewScrollPin();
		const order: string[] = [];
		jest.spyOn(scrollPin, 'pin').mockImplementation(() => {
			order.push(`pin(disk=${app.vault.getContent('Note.md') === NOTE ? 'old' : 'new'})`);
		});
		const original = app.vault.process.bind(app.vault);
		app.vault.process = (async (file: any, fn: any) => {
			order.push('process-start');
			const result = await original(file, (content: string) => {
				const next = fn(content);
				order.push('callback-returns');
				return next;
			});
			order.push('process-done');
			return result;
		}) as any;

		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-initiative', scrollPin);
		await expect(host.replaceSource('round: 2')).resolves.toBe(true);

		expect(scrollPin.pin).toHaveBeenCalledTimes(1);
		expect(order).toEqual(['process-start', 'pin(disk=old)', 'callback-returns', 'process-done']);
		expect(app.vault.getContent('Note.md')).toContain('round: 2');
		document.body.innerHTML = '';
	});

	test('SC-260: a pin() that throws does not abort the write — it resolves true, the disk changes and the next write lands', async () => {
		const app = new App();
		app.vault.setFile('Note.md', NOTE);
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, 'Note.md');
		const { el } = makeScroller();
		el.appendChild(ctx.el);
		const scrollPin = new PreviewScrollPin();
		const spy = jest.spyOn(scrollPin, 'pin').mockImplementation(() => {
			throw new Error('pin exploded');
		});
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-initiative', scrollPin);
		await expect(host.replaceSource('round: 2')).resolves.toBe(true);
		expect(app.vault.getContent('Note.md')).toContain('round: 2');
		expect(warn).toHaveBeenCalledTimes(1);

		// knownBody stayed in step with the disk, so a second write still finds its block.
		await expect(host.replaceSource('round: 3')).resolves.toBe(true);
		expect(app.vault.getContent('Note.md')).toContain('round: 3');
		expect(spy).toHaveBeenCalledTimes(2);
		warn.mockRestore();
		document.body.innerHTML = '';
	});

	test("SC-260: a write the host drops ('miss') or aborts ('abort') takes no pin", async () => {
		const app = new App();
		app.vault.setFile('Note.md', NOTE);
		const plugin = new Plugin(app);
		const { el } = makeScroller();
		const scrollPin = new PreviewScrollPin();
		const spy = jest.spyOn(scrollPin, 'pin');
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		const sectionInfo = { text: NOTE, lineStart: 2, lineEnd: 4 };

		// 'miss': section resolves but the body on disk is not what this host last knew, and
		// nothing in the note matches the known body either.
		const missCtx = makeFakeContext(app, 'Note.md');
		el.appendChild(missCtx.el);
		const missHost = new ReadingModeBlockHost(plugin as any, missCtx.el, missCtx as any, 'ds-initiative', scrollPin);
		missHost.setMountedBody('round: 99');
		await expect(missHost.replaceSource('round: 100')).resolves.toBe(false);

		// 'abort': the section range does not hold a fence and the host has no durable identity.
		const abortCtx = makeFakeContext(app, 'Note.md');
		(abortCtx as any).getSectionInfo = () => ({ ...sectionInfo, lineStart: 0, lineEnd: 0 });
		el.appendChild(abortCtx.el);
		const abortHost = new ReadingModeBlockHost(plugin as any, abortCtx.el, abortCtx as any, 'ds-initiative', scrollPin);
		await expect(abortHost.replaceSource('round: 5')).resolves.toBe(false);

		expect(spy).not.toHaveBeenCalled();
		expect(app.vault.getContent('Note.md')).toBe(NOTE);
		warn.mockRestore();
		document.body.innerHTML = '';
	});

	test('the pin is optional — a host constructed without one writes exactly as before', async () => {
		const app = new App();
		app.vault.setFile('Note.md', NOTE);
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, 'Note.md');

		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-initiative');
		await expect(host.replaceSource('round: 3')).resolves.toBe(true);
		expect(app.vault.getContent('Note.md')).toContain('round: 3');
	});

	test('no pin is taken when the write is refused (canvas: sourcePath "")', async () => {
		const app = new App();
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, '');
		const scrollPin = new PreviewScrollPin();
		const spy = jest.spyOn(scrollPin, 'pin');

		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-initiative', scrollPin);
		await expect(host.replaceSource('round: 4')).resolves.toBe(false);
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('SC-198: registerFrameworkElements shares one pin and releases it on unload', () => {
	function fakeDef(): ElementDefinition {
		return {
			id: 'fake',
			name: 'Fake',
			aliases: ['ds-fake'],
			shape: 'static',
			parse: (data) => data,
			createView: () => ({}) as any,
		};
	}

	test('every host built by the wiring loop gets a pin, and plugin unload drops any held pin', async () => {
		const app = new App();
		app.vault.setFile('Note.md', NOTE);
		const plugin = new Plugin(app);
		// SC-337: Component.unload is now a guarded no-op on a never-loaded component
		// (matching Obsidian 1.14.2) — real Obsidian's plugin manager loads a plugin
		// when enabling it, so a loaded plugin is the faithful fixture.
		plugin.load();
		const hosts: BlockHost[] = [];
		const pipeline = {
			run: jest.fn(async (_d: ElementDefinition, _s: string, host: BlockHost) => {
				hosts.push(host);
			}),
		} as unknown as ElementPipeline;
		const registry: ElementRegistry = {
			register: () => {
				throw new Error('unexpected');
			},
			get: () => undefined,
			all: () => [fakeDef()],
		};

		registerFrameworkElements(plugin as any, { registry, pipeline });
		const handler = plugin.registeredProcessors.get('ds-fake')!;

		const ctx = makeFakeContext(app, 'Note.md');
		const { scroller, el } = makeScroller();
		el.appendChild(ctx.el);
		await handler('round: 1', ctx.el, ctx as any);

		expect(hosts).toHaveLength(1);
		await hosts[0].replaceSource('round: 9');
		expect(scroller.hasAttribute(PIN_ATTR)).toBe(true);

		plugin.unload();
		expect(scroller.hasAttribute(PIN_ATTR)).toBe(false);
		expect(allPinStyles()).toBe(0);
		document.body.innerHTML = '';
	});
});

// SC-470: the `modify` pin — every Reading view of the written note that shows a DSE block.
describe('SC-470: PreviewScrollPin.pinReadingViewsOf', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	/** A markdown leaf whose view shows `path` in `mode`; its scroller sits under `.markdown-reading-view` as in 1.14.4. */
	function makeLeaf(path: string, mode: 'preview' | 'source', { dse = true, metrics = {} as Metrics } = {}) {
		const { scroller, el } = makeScroller(metrics);
		if (dse) el.setAttribute('data-dse-element', 'initiative');
		const reading = document.createElement('div');
		reading.className = 'markdown-reading-view';
		reading.appendChild(scroller);
		document.body.appendChild(reading);
		return { scroller, leaf: { view: { file: { path }, getMode: () => mode, previewMode: { containerEl: reading } } } };
	}
	const workspaceOf = (...leaves: Array<{ leaf: unknown }>) =>
		({ getLeavesOfType: (type: string) => (type === 'markdown' ? leaves.map((l) => l.leaf) : []) }) as any;

	test('pins every Reading view of the note that shows a DSE block, at its own current height', () => {
		const a = makeLeaf('Note.md', 'preview');
		const b = makeLeaf('Note.md', 'preview', { metrics: { scrollHeight: 6000 } });
		new PreviewScrollPin().pinReadingViewsOf(workspaceOf(a, b), 'Note.md');
		expect(pinnedPx(a.scroller)).toBe('4883px');
		expect(pinnedPx(b.scroller)).toBe('6000px');
	});

	test('leaves alone: another note, a Live Preview/Source view, a view without a DSE block, a deferred view', () => {
		const other = makeLeaf('Other.md', 'preview');
		const source = makeLeaf('Note.md', 'source');
		const plain = makeLeaf('Note.md', 'preview', { dse: false });
		const deferred = { leaf: { view: {} } };
		new PreviewScrollPin().pinReadingViewsOf(workspaceOf(other, source, plain, deferred), 'Note.md');
		for (const l of [other, source, plain]) expect(isPinned(l.scroller)).toBe(false);
	});

	test('keeps every pin() fail-safe: not scrolled, or a document that does not scroll, is never pinned', () => {
		const top = makeLeaf('Note.md', 'preview', { metrics: { scrollTop: 0 } });
		const short = makeLeaf('Note.md', 'preview', { metrics: { scrollTop: 0, scrollHeight: 900, clientHeight: 974 } });
		new PreviewScrollPin().pinReadingViewsOf(workspaceOf(top, short), 'Note.md');
		expect(isPinned(top.scroller)).toBe(false);
		expect(isPinned(short.scroller)).toBe(false);
	});

	test("the writer's view, already pinned by its write, is re-pinned without ever being lowered (a collapsed height is never captured)", () => {
		jest.useFakeTimers();
		try {
			const a = makeLeaf('Note.md', 'preview');
			const pin = new PreviewScrollPin();
			pin.pin(a.scroller.querySelector('[data-dse-element]') as HTMLElement);
			setMetric(a.scroller, 'scrollHeight', 300);
			pin.pinReadingViewsOf(workspaceOf(a), 'Note.md');
			expect(pinnedPx(a.scroller)).toBe('4883px');
			jest.advanceTimersByTime(TTL);
			expect(isPinned(a.scroller)).toBe(false);
		} finally {
			jest.useRealTimers();
		}
	});

	test('registerFrameworkElements registers it on the vault `modify` event', () => {
		const app = new App();
		const plugin = new Plugin(app);
		plugin.load();
		const on = jest.spyOn(app.vault, 'on');
		const spy = jest.spyOn(PreviewScrollPin.prototype, 'pinReadingViewsOf').mockImplementation(() => {});
		try {
			const registry: ElementRegistry = { register: () => undefined as never, get: () => undefined, all: () => [] };
			registerFrameworkElements(plugin as any, { registry, pipeline: {} as ElementPipeline });
			const call = on.mock.calls.find(([name]) => name === 'modify');
			expect(call).toBeDefined();
			(call![1] as (file: { path: string }) => void)({ path: 'Note.md' });
			expect(spy).toHaveBeenCalledWith(app.workspace, 'Note.md');
		} finally {
			spy.mockRestore();
			on.mockRestore();
		}
	});
});

// SC-470 (Risk 4, r4): the pin is a FLOOR. The rule's `!important` min-height replaces Obsidian's inline
// sizer min-height, so `scrollHeight` cannot show growth while pinned; what can is Obsidian
// writing a larger inline `min-height` (observed) — and a re-pin applies the same max. These
// tests drive that input (inline min-height written while the rule holds the sizer) rather than
// a hand-set scrollHeight.
describe('SC-470: the pin is a floor (re-pin and observer)', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});
	afterEach(() => {
		jest.useRealTimers();
		document.body.innerHTML = '';
	});

	/** Pinned at 4883 with Obsidian's inline value 4819 (= the scrollHeight less the 64px padding). */
	function pinned() {
		const { scroller, el } = makeScroller();
		scroller.style.paddingTop = '32px';
		scroller.style.paddingBottom = '32px';
		sizerOf(scroller).style.minHeight = '4819px';
		const pin = new PreviewScrollPin();
		pin.pin(el);
		return { scroller, el, pin };
	}

	test('Obsidian writing a larger inline min-height while pinned raises the rule within the same task, keeping the id and the one <style>', async () => {
		const { scroller } = pinned();
		const id = scroller.getAttribute(PIN_ATTR);
		sizerOf(scroller).style.minHeight = '5901px';
		await flushObservers();
		expect(pinnedPx(scroller)).toBe('5901px');
		expect(scroller.getAttribute(PIN_ATTR)).toBe(id);
		expect(allPinStyles()).toBe(1);
		sizerOf(scroller).style.minHeight = '7101px';
		await flushObservers();
		expect(pinnedPx(scroller)).toBe('7101px');
	});

	test('Obsidian collapsing the inline min-height (46px, 2446px) never lowers the floor', async () => {
		const { scroller } = pinned();
		for (const collapsed of ['2446px', '46px', '0px', '']) {
			sizerOf(scroller).style.minHeight = collapsed;
			await flushObservers();
			expect(pinnedPx(scroller)).toBe('4883px');
		}
		sizerOf(scroller).style.minHeight = '5000px';
		await flushObservers();
		sizerOf(scroller).style.minHeight = '46px';
		await flushObservers();
		expect(pinnedPx(scroller)).toBe('5000px');
	});

	test('a replaced sizer node (Obsidian rebuilds it) is followed too', async () => {
		const { scroller } = pinned();
		const fresh = document.createElement('div');
		fresh.className = 'markdown-preview-sizer';
		fresh.style.minHeight = '6200px';
		scroller.replaceChild(fresh, sizerOf(scroller));
		await flushObservers();
		expect(pinnedPx(scroller)).toBe('6200px');
	});

	test('a re-pin applies the same max: a larger inline value is taken at once; padding-inflated scrollHeight and collapses are not', () => {
		const { scroller, el, pin } = pinned();
		setMetric(scroller, 'scrollHeight', 4883 + 64); // the pinned px plus padding: no growth
		pin.pin(el);
		expect(pinnedPx(scroller)).toBe('4883px');
		for (const collapsed of [4883, 2446, 246, 0]) {
			setMetric(scroller, 'scrollHeight', collapsed);
			sizerOf(scroller).style.minHeight = `${collapsed}px`;
			pin.pin(el);
			expect(pinnedPx(scroller)).toBe('4883px');
		}
		sizerOf(scroller).style.minHeight = '5901px'; // written, observer not yet run
		pin.pin(el);
		expect(pinnedPx(scroller)).toBe('5901px');
		// content height from scrollHeight (rule not holding the sizer): the padding is taken off
		setMetric(scroller, 'scrollHeight', 6500 + 64);
		pin.pin(el);
		expect(pinnedPx(scroller)).toBe('6500px');
	});

	test('the observer is disconnected at release (TTL) and by releaseAll(): later inline writes touch nothing', async () => {
		const a = pinned();
		const b = pinned();
		jest.advanceTimersByTime(TTL);
		expect(allPinStyles()).toBe(0);
		sizerOf(a.scroller).style.minHeight = '9000px';
		await flushObservers();
		expect(allPinStyles()).toBe(0);
		expect(isPinned(a.scroller)).toBe(false);

		const c = pinned();
		c.pin.releaseAll();
		sizerOf(c.scroller).style.minHeight = '9000px';
		await flushObservers();
		expect(allPinStyles()).toBe(0);
		void b;
	});

	test('our own rule rewrite does not re-enter the observer (the text settles)', async () => {
		const { scroller } = pinned();
		sizerOf(scroller).style.minHeight = '5901px';
		await flushObservers();
		const style = pinStyle(scroller)!;
		const text = style.textContent;
		const writes: string[] = [];
		const desc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
		Object.defineProperty(style, 'textContent', {
			configurable: true,
			get: () => desc.get!.call(style),
			set: (v) => {
				writes.push(String(v));
				desc.set!.call(style, v);
			},
		});
		await flushObservers();
		await flushObservers();
		expect(writes).toEqual([]);
		expect(style.textContent).toBe(text);
	});

	test('a re-pin restarts the TTL (autosave keeps the pin alive) and the release still removes the rule', () => {
		const { scroller, el, pin } = pinned();
		jest.advanceTimersByTime(TTL - 100);
		pin.pin(el);
		jest.advanceTimersByTime(TTL - 1);
		expect(isPinned(scroller)).toBe(true);
		jest.advanceTimersByTime(1);
		expect(isPinned(scroller)).toBe(false);
		expect(allPinStyles()).toBe(0);
	});
});

// SC-470 r4 (HIGH-1): an embed inside the note renders its own `.markdown-preview-view >
// .markdown-preview-sizer`; the rule must not reach it (a descendant selector grew it 535 -> 4024px).
describe('SC-470: the pin rule targets the scroller\'s own sizer only', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	test('a nested embed sizer does not match the rule; the scroller\'s direct sizer does', () => {
		const { scroller, el } = makeScroller();
		const embed = document.createElement('div');
		embed.innerHTML =
			'<div class="markdown-embed-content"><div class="markdown-preview-view"><div class="markdown-preview-sizer"></div></div></div>';
		sizerOf(scroller).appendChild(embed);
		new PreviewScrollPin().pin(el);
		const rule = pinStyle(scroller)!.textContent!;
		const selector = rule.slice(0, rule.indexOf(' {'));
		const nested = embed.querySelector('.markdown-preview-sizer')!;
		expect(selector).toBe(pinRule(scroller.getAttribute(PIN_ATTR)!, 4883).slice(0, selector.length));
		expect(nested.matches(selector)).toBe(false);
		expect(sizerOf(scroller).matches(selector)).toBe(true);
		// the document-wide query only ever finds the scroller's own sizer
		expect(Array.from(document.querySelectorAll(selector))).toEqual([sizerOf(scroller)]);
	});
});

// SC-470 r4 (MEDIUM-2): a popout closed while pinned never fires its TTL.
describe('SC-470: pins in a closed popout are released', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	function inFrame() {
		const frame = document.createElement('iframe');
		document.body.appendChild(frame);
		const doc = frame.contentDocument!;
		const made = makeScroller({}, doc);
		return { frame, doc, ...made };
	}

	test('a pin call sweeps an entry whose scroller was disconnected (the popout leaf detached), removing its rule', () => {
		const pin = new PreviewScrollPin();
		const out = inFrame();
		pin.pin(out.el);
		expect(isPinned(out.scroller)).toBe(true);
		out.scroller.remove(); // Obsidian detaches the closed popout's view DOM
		const main = makeScroller();
		pin.pin(main.el);
		expect(isPinned(out.scroller)).toBe(false);
		expect(allPinStyles(out.doc)).toBe(0);
		expect(isPinned(main.scroller)).toBe(true);
		pin.releaseAll();
		expect((pin as any).pins.size).toBe(0);
	});

	test('a pin call sweeps an entry whose window is closed even if its DOM is still connected', () => {
		const pin = new PreviewScrollPin();
		const out = inFrame();
		pin.pin(out.el);
		Object.defineProperty(out.doc.defaultView!, 'closed', { value: true, configurable: true });
		const main = makeScroller();
		pin.pin(main.el);
		expect(isPinned(out.scroller)).toBe(false);
		expect(allPinStyles(out.doc)).toBe(0);
		expect((pin as any).pins.size).toBe(1);
		pin.releaseAll();
	});

	test('releaseWindow(win) releases that window\'s pins and leaves the others held', () => {
		const pin = new PreviewScrollPin();
		const out = inFrame();
		const main = makeScroller();
		pin.pin(out.el);
		pin.pin(main.el);
		pin.releaseWindow(out.doc.defaultView!);
		expect(isPinned(out.scroller)).toBe(false);
		expect(allPinStyles(out.doc)).toBe(0);
		expect(isPinned(main.scroller)).toBe(true);
		pin.releaseAll();
	});

	test('registerFrameworkElements releases a window\'s pins on the workspace `window-close` event', () => {
		const app = new App();
		const plugin = new Plugin(app);
		plugin.load();
		const on = jest.spyOn(app.workspace, 'on');
		const spy = jest.spyOn(PreviewScrollPin.prototype, 'releaseWindow').mockImplementation(() => {});
		try {
			const registry: ElementRegistry = { register: () => undefined as never, get: () => undefined, all: () => [] };
			registerFrameworkElements(plugin as any, { registry, pipeline: {} as ElementPipeline });
			const call = on.mock.calls.find(([name]) => name === 'window-close');
			expect(call).toBeDefined();
			const win = {} as Window;
			(call![1] as (a: unknown, b: Window) => void)({}, win);
			expect(spy).toHaveBeenCalledWith(win);
		} finally {
			spy.mockRestore();
			on.mockRestore();
		}
	});
});
