// SC-472 — the backstop every scroll pin / hold falls back on when the redraw it waits for never comes.
//
// The pins (previewScrollPin.ts) and holds (livePreviewScrollHold.ts) are released by the REDRAW they protect: the
// rebuilt block is mounted and the content has its height back. A write Obsidian never redraws (an adopted own write
// that put nothing back, an edit outside every DSE section, a no-op `modify`) has no such moment, so each pin also has
// this backstop. A plain `setTimeout(PIN_TTL_MS)` was measured to run out BEFORE a redraw that a busy main thread
// pushed late (SC-472 r1, CDP 8x CPU throttle, a Reading pane + a Live Preview pane of the same note, an outside
// write: the Reading redraw started 8.6-10.2 s after `modify`, 3/4 writes clamped 2779 -> 2001 when the timer then
// released the pin right after the collapse). The backstop therefore counts the page's own progress, not only the
// wall clock: it fires once PIN_TTL_MS have passed since `arm`, then PIN_BACKSTOP_FRAMES animation frames have been
// painted since, the last BACKSTOP_QUIET_FRAMES of them without `noteActivity()` (a mutation the owner watches), and
// `busy()` (a block of ours still mounting) is false. A main thread busy with someone else's redraw paints no frames,
// so the backstop waits for it. PIN_HARD_CAP_MS bounds everything (and is the only clock in a hidden window, where
// animation frames do not run). A window without `requestAnimationFrame` skips the frame count and retries `busy()`
// every BACKSTOP_RETRY_MS once the wall clock has passed.

/** The backstop's wall-clock minimum, from the last arm (unchanged from the SC-198 TTL). */
export const PIN_TTL_MS = 2500;
/** Animation frames painted after PIN_TTL_MS before the backstop may fire. */
export const PIN_BACKSTOP_FRAMES = 30;
/** Frames without owner activity the backstop needs before it fires. */
export const BACKSTOP_QUIET_FRAMES = 2;
/** While a redraw has started and not finished, the backstop waits until this many frames passed without a mutation. */
export const BACKSTOP_REDRAW_QUIET_FRAMES = 60;
/** Fires whatever `busy` says and whether or not frames run. */
export const PIN_HARD_CAP_MS = 20000;
/** Without animation frames: how often `busy` is asked again after the wall clock has passed. */
export const BACKSTOP_RETRY_MS = 100;

export class Backstop {
	private timer: number | null = null;
	private cap: number | null = null;
	private raf: number | null = null;
	private frames = 0;
	private quiet = 0;

	constructor(
		private readonly win: Window,
		private readonly fire: () => void,
		/** `quiet`: frames painted since the owner's last `noteActivity()` (0 before the deadline's frames start). */
		private readonly busy: (quiet: number) => boolean = () => false,
	) {}

	/** (Re)start from now. */
	arm(): void {
		this.cancel();
		this.timer = this.win.setTimeout(() => this.afterDeadline(), PIN_TTL_MS);
		this.cap = this.win.setTimeout(() => this.done(), PIN_HARD_CAP_MS);
	}

	/** The owner saw a mutation it cares about: the quiet-frame count restarts. */
	noteActivity(): void {
		this.quiet = 0;
	}

	cancel(): void {
		if (this.timer !== null) this.win.clearTimeout(this.timer);
		if (this.cap !== null) this.win.clearTimeout(this.cap);
		if (this.raf !== null) this.win.cancelAnimationFrame?.(this.raf);
		this.timer = this.cap = this.raf = null;
	}

	private afterDeadline(): void {
		this.timer = null;
		this.frames = 0;
		this.quiet = 0;
		if (typeof this.win.requestAnimationFrame !== 'function') return this.tryFire();
		const tick = (): void => {
			this.raf = null;
			this.frames++;
			this.quiet++;
			if (this.frames >= PIN_BACKSTOP_FRAMES && this.quiet >= BACKSTOP_QUIET_FRAMES && !this.busy(this.quiet)) return this.done();
			this.raf = this.win.requestAnimationFrame(tick);
		};
		this.raf = this.win.requestAnimationFrame(tick);
	}

	private tryFire(): void {
		if (!this.busy(Infinity)) this.done();
		else this.timer = this.win.setTimeout(() => this.tryFire(), BACKSTOP_RETRY_MS);
	}

	private done(): void {
		this.cancel();
		this.fire();
	}
}
