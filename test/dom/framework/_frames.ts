// SC-472 — a hand-driven animation-frame queue for the scroll pin / hold / backstop tests. jsdom's own
// `requestAnimationFrame` (and jest's fake timers' version of it) tick every 16 ms of faked time; the backstop counts
// PAINTED frames, so these tests need to say exactly how many frames passed, independent of the wall clock.
export interface Frames {
	/** Run `n` frames: each runs the callbacks queued before it started (callbacks queued during a frame wait for the next). */
	run(n?: number): void;
	/** Callbacks waiting for the next frame. */
	pending(): number;
	/** Put the window's own requestAnimationFrame back. */
	restore(): void;
}

// The window's own functions, read when the module loads (before any test fakes timers): what `restore()` puts back.
const original = new WeakMap<Window, { raf: unknown; caf: unknown }>();
const originalOf = (win: Window): { raf: unknown; caf: unknown } => {
	if (!original.has(win)) {
		const w = win as unknown as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown };
		original.set(win, { raf: w.requestAnimationFrame, caf: w.cancelAnimationFrame });
	}
	return original.get(win)!;
};
originalOf(window);

/** Replace `win.requestAnimationFrame` / `cancelAnimationFrame` with a manual queue; `restore()` undoes it. */
export function installFrames(win: Window = window): Frames {
	const saved = originalOf(win);
	let next = 1;
	let queue = new Map<number, FrameRequestCallback>();
	// Locked (assignments are ignored): jest's fake timers fake `requestAnimationFrame` too, and `jest.useFakeTimers()` may be
	// called after this install (describe-level beforeEach) or between two phases of one test.
	const lock = (name: 'requestAnimationFrame' | 'cancelAnimationFrame', value: unknown): void => {
		Object.defineProperty(win, name, { configurable: true, get: () => value, set: () => undefined });
	};
	lock('requestAnimationFrame', (cb: FrameRequestCallback): number => {
		const id = next++;
		queue.set(id, cb);
		return id;
	});
	lock('cancelAnimationFrame', (id: number): void => {
		queue.delete(id);
	});
	return {
		run(n = 1) {
			for (let i = 0; i < n; i++) {
				const batch = queue;
				queue = new Map();
				for (const cb of batch.values()) cb(0);
			}
		},
		pending: () => queue.size,
		restore() {
			Object.defineProperty(win, 'requestAnimationFrame', { configurable: true, writable: true, value: saved.raf });
			Object.defineProperty(win, 'cancelAnimationFrame', { configurable: true, writable: true, value: saved.caf });
		},
	};
}

/** Remove `requestAnimationFrame` altogether (a window that has none); `restore()` of the returned handle puts it back. */
export function removeFrames(win: Window = window): { restore(): void } {
	const saved = originalOf(win);
	Object.defineProperty(win, 'requestAnimationFrame', { configurable: true, get: () => undefined, set: () => undefined });
	Object.defineProperty(win, 'cancelAnimationFrame', { configurable: true, get: () => undefined, set: () => undefined });
	return {
		restore() {
			Object.defineProperty(win, 'requestAnimationFrame', { configurable: true, writable: true, value: saved.raf });
			Object.defineProperty(win, 'cancelAnimationFrame', { configurable: true, writable: true, value: saved.caf });
		},
	};
}
