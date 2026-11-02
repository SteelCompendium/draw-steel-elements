// SC-472 — Backstop: the wall-clock + painted-frames + quiet-frames + busy rule every scroll pin / hold falls back on
// (redrawBackstop.ts). The owner classes' use of it (what counts as busy, what is activity) is tested with them
// (previewScrollPin.test.ts, livePreviewScrollHold.test.ts); this file pins the Backstop's own guards, each one in
// a test that fails when the guard is removed (the SC-472 r2 mutation check).
import {
	BACKSTOP_QUIET_FRAMES,
	BACKSTOP_RETRY_MS,
	Backstop,
	PIN_BACKSTOP_FRAMES,
	PIN_HARD_CAP_MS,
	PIN_TTL_MS,
} from '../../../src/framework/host/redrawBackstop';
import { installFrames, removeFrames } from './_frames';
import type { Frames } from './_frames';

describe('SC-472: Backstop', () => {
	let frames: Frames;
	beforeEach(() => {
		jest.useFakeTimers();
		frames = installFrames();
	});
	afterEach(() => {
		frames.restore();
		jest.useRealTimers();
	});

	test('constants: the wall clock is the old TTL; 30 painted frames, 2 quiet, 20 s cap', () => {
		expect([PIN_TTL_MS, PIN_BACKSTOP_FRAMES, BACKSTOP_QUIET_FRAMES, PIN_HARD_CAP_MS]).toEqual([2500, 30, 2, 20000]);
	});

	test('never fires before PIN_TTL_MS, however many frames are painted', () => {
		const fire = jest.fn();
		new Backstop(window, fire).arm();
		jest.advanceTimersByTime(PIN_TTL_MS - 1);
		frames.run(100);
		expect(fire).not.toHaveBeenCalled();
	});

	test('after the wall clock it waits for PIN_BACKSTOP_FRAMES painted frames: 29 are not enough, the 30th fires', () => {
		const fire = jest.fn();
		new Backstop(window, fire).arm();
		jest.advanceTimersByTime(PIN_TTL_MS);
		expect(fire).not.toHaveBeenCalled(); // the timer alone (a busy main thread paints nothing) does not fire it
		frames.run(PIN_BACKSTOP_FRAMES - 1);
		expect(fire).not.toHaveBeenCalled();
		frames.run(1);
		expect(fire).toHaveBeenCalledTimes(1);
	});

	test('frames painted BEFORE the wall clock do not count towards the 30', () => {
		const fire = jest.fn();
		const b = new Backstop(window, fire);
		b.arm();
		frames.run(5); // no frame loop yet: nothing is queued before the deadline
		jest.advanceTimersByTime(PIN_TTL_MS);
		frames.run(PIN_BACKSTOP_FRAMES - 1);
		expect(fire).not.toHaveBeenCalled();
		frames.run(1);
		expect(fire).toHaveBeenCalledTimes(1);
	});

	test('the last BACKSTOP_QUIET_FRAMES frames must have no activity: a mutation on frame 30 delays the fire by two frames', () => {
		const fire = jest.fn();
		const b = new Backstop(window, fire);
		b.arm();
		jest.advanceTimersByTime(PIN_TTL_MS);
		frames.run(PIN_BACKSTOP_FRAMES - 1);
		b.noteActivity(); // between frame 29 and 30
		frames.run(1); // frame 30: only 1 quiet frame since
		expect(fire).not.toHaveBeenCalled();
		frames.run(1); // quiet frame 2
		expect(fire).toHaveBeenCalledTimes(1);
	});

	test('busy() holds the fire past the 30 frames and releases on the first frame it reads false; it is told the quiet-frame count', () => {
		const fire = jest.fn();
		let busy = true;
		const seen: number[] = [];
		const b = new Backstop(window, fire, (quiet) => {
			seen.push(quiet);
			return busy;
		});
		b.arm();
		jest.advanceTimersByTime(PIN_TTL_MS);
		frames.run(PIN_BACKSTOP_FRAMES + 20);
		expect(fire).not.toHaveBeenCalled();
		expect(seen[seen.length - 1]).toBe(PIN_BACKSTOP_FRAMES + 20); // no activity since the deadline: quiet == frames
		b.noteActivity();
		frames.run(3);
		expect(seen.slice(-2)).toEqual([2, 3]); // activity restarts the count (busy is asked from the 2nd quiet frame on)
		busy = false;
		frames.run(1);
		expect(fire).toHaveBeenCalledTimes(1);
	});

	test('PIN_HARD_CAP_MS fires whatever busy() says and with no frames running at all (a hidden window)', () => {
		const fire = jest.fn();
		new Backstop(window, fire, () => true).arm();
		jest.advanceTimersByTime(PIN_TTL_MS); // frame loop queued, but the page paints nothing
		jest.advanceTimersByTime(PIN_HARD_CAP_MS - PIN_TTL_MS - 1);
		expect(fire).not.toHaveBeenCalled();
		jest.advanceTimersByTime(1);
		expect(fire).toHaveBeenCalledTimes(1);
		expect(frames.pending()).toBe(0); // the frame loop is cancelled with it
		frames.run(50);
		expect(fire).toHaveBeenCalledTimes(1);
	});

	test('fires once: after the fire neither the cap nor stray frames fire it again', () => {
		const fire = jest.fn();
		new Backstop(window, fire).arm();
		jest.advanceTimersByTime(PIN_TTL_MS);
		frames.run(PIN_BACKSTOP_FRAMES);
		expect(fire).toHaveBeenCalledTimes(1);
		jest.advanceTimersByTime(PIN_HARD_CAP_MS);
		frames.run(10);
		expect(fire).toHaveBeenCalledTimes(1);
	});

	test('arm() again restarts the wall clock, the cap and the frame count', () => {
		const fire = jest.fn();
		const b = new Backstop(window, fire);
		b.arm();
		jest.advanceTimersByTime(PIN_TTL_MS - 100);
		b.arm();
		jest.advanceTimersByTime(PIN_TTL_MS - 1);
		frames.run(100);
		expect(fire).not.toHaveBeenCalled(); // 2499 ms into the second arm
		jest.advanceTimersByTime(1);
		frames.run(PIN_BACKSTOP_FRAMES - 1);
		expect(fire).not.toHaveBeenCalled();
		frames.run(1);
		expect(fire).toHaveBeenCalledTimes(1);

		// ...and a re-arm after the frames started drops the old count
		const fire2 = jest.fn();
		const c = new Backstop(window, fire2);
		c.arm();
		jest.advanceTimersByTime(PIN_TTL_MS);
		frames.run(PIN_BACKSTOP_FRAMES - 1);
		c.arm();
		jest.advanceTimersByTime(PIN_TTL_MS);
		frames.run(PIN_BACKSTOP_FRAMES - 1);
		expect(fire2).not.toHaveBeenCalled();
		frames.run(1);
		expect(fire2).toHaveBeenCalledTimes(1);
	});

	test('cancel() stops the clock, the frame loop and the cap', () => {
		const fire = jest.fn();
		const b = new Backstop(window, fire);
		b.arm();
		jest.advanceTimersByTime(PIN_TTL_MS);
		expect(frames.pending()).toBe(1);
		b.cancel();
		expect(frames.pending()).toBe(0);
		frames.run(100);
		jest.advanceTimersByTime(PIN_HARD_CAP_MS * 2);
		expect(fire).not.toHaveBeenCalled();
		const early = new Backstop(window, fire);
		early.arm();
		early.cancel();
		jest.advanceTimersByTime(PIN_HARD_CAP_MS * 2);
		frames.run(100);
		expect(fire).not.toHaveBeenCalled();
	});

	describe('a window without requestAnimationFrame', () => {
		let none: { restore(): void };
		beforeEach(() => {
			none = removeFrames();
		});
		afterEach(() => none.restore());

		test('fires at the wall clock when not busy, no frame count', () => {
			const fire = jest.fn();
			new Backstop(window, fire).arm();
			jest.advanceTimersByTime(PIN_TTL_MS - 1);
			expect(fire).not.toHaveBeenCalled();
			jest.advanceTimersByTime(1);
			expect(fire).toHaveBeenCalledTimes(1);
		});

		test('asks busy() again every BACKSTOP_RETRY_MS until it reads false (told Infinity quiet frames), and the cap still ends it', () => {
			const fire = jest.fn();
			let busy = true;
			const seen: number[] = [];
			new Backstop(window, fire, (q) => {
				seen.push(q);
				return busy;
			}).arm();
			jest.advanceTimersByTime(PIN_TTL_MS + 5 * BACKSTOP_RETRY_MS);
			expect(fire).not.toHaveBeenCalled();
			expect(seen).toHaveLength(6);
			expect(seen.every((q) => q === Infinity)).toBe(true);
			busy = false;
			jest.advanceTimersByTime(BACKSTOP_RETRY_MS);
			expect(fire).toHaveBeenCalledTimes(1);

			const stuck = jest.fn();
			new Backstop(window, stuck, () => true).arm();
			jest.advanceTimersByTime(PIN_HARD_CAP_MS);
			expect(stuck).toHaveBeenCalledTimes(1);
		});
	});
});
