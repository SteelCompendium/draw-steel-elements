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
import { PreviewScrollPin } from '../../../src/framework/host/previewScrollPin';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { registerFrameworkElements } from '../../../src/framework/registerFrameworkElements';
import type { ElementDefinition, ElementRegistry } from '../../../src/framework/registry';
import type { ElementPipeline } from '../../../src/framework/pipeline';
import type { BlockHost } from '../../../src/framework/host/BlockHost';
import { App, Plugin, makeFakeContext } from '../../mocks/obsidian';

const PIN_ATTR = 'data-dse-scroll-pin';
const PIN_VAR = '--dse-scroll-pin';
/** Must match PIN_TTL_MS in previewScrollPin.ts. */
const TTL = 2500;

interface Metrics {
	scrollTop?: number;
	scrollHeight?: number;
	clientHeight?: number;
}

/** A reading-view shape: `.markdown-preview-view` > `.markdown-preview-sizer` > block el. */
function makeScroller(metrics: Metrics = {}): { scroller: HTMLElement; el: HTMLElement } {
	const scroller = document.createElement('div');
	scroller.className = 'markdown-preview-view';
	const sizer = document.createElement('div');
	sizer.className = 'markdown-preview-sizer';
	const el = document.createElement('div');
	sizer.appendChild(el);
	scroller.appendChild(sizer);
	document.body.appendChild(scroller);
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
const pinnedPx = (scroller: HTMLElement): string => scroller.style.getPropertyValue(PIN_VAR);

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
			expect(pinnedPx(scroller)).toBe('');
		});

		test('a re-pin refreshes the TTL but KEEPS the original height (no ratchet on rapid clicks)', () => {
			const { scroller, el } = makeScroller();
			const pin = new PreviewScrollPin();
			pin.pin(el);
			expect(pinnedPx(scroller)).toBe('4883px');

			// While pinned, scrollHeight reads back inflated (the pinned value plus the
			// scroller's own padding). Re-measuring would ratchet the pin up on every write.
			Object.defineProperty(scroller, 'scrollHeight', { value: 4947, configurable: true, writable: true });
			jest.advanceTimersByTime(TTL - 500);
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
			// Nothing left running that could re-touch a scroller the plugin no longer owns.
			jest.advanceTimersByTime(TTL * 2);
			expect(document.querySelector(`[${PIN_ATTR}]`)).toBeNull();
		});
	});
});

const NOTE = ['# Session notes', '', '```ds-initiative', 'round: 1', '```', '', 'After.'].join('\n');

describe('SC-198: ReadingModeBlockHost pins around its own write', () => {
	test('pins BEFORE vault.process runs — the pin must be up when Obsidian sees the modify', async () => {
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
		document.body.innerHTML = '';
	});
});
