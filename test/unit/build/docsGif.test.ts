import { execFileSync } from 'child_process';
import path from 'path';

// SC-411 — visual-harness/docs-gif.mjs: the `kind: 'gif'` manifest shape (load-time validation, the step
// interpreter, the --check-stable verdict). ESM `.mjs`, so — like gifEncode.test.ts and
// obsidianAppCssPin.test.ts — each test spawns a real `node --input-type=module` process that imports
// the module, runs a snippet, and prints a JSON result.

const repoRoot = path.resolve(__dirname, '../../..');
const gifModule = path.join(repoRoot, 'visual-harness/docs-gif.mjs');

function run(body: string): any {
	const code = `
		import { createRequire } from 'node:module';
		import vm from 'node:vm';
		import * as g from ${JSON.stringify(gifModule)};
		const { PNG } = createRequire(import.meta.url)('pngjs');
		const png = (w, h, fn) => {
			const p = new PNG({ width: w, height: h });
			for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.data.set([...fn(x, y), 255], (y * w + x) * 4);
			return PNG.sync.write(p);
		};
		const base = (over = {}) => ({ out: 'x.gif', kind: 'gif', source: 'browser', element: 'counter', steps: [{ hold: 500 }], ...over });
		${body}
	`;
	const stdout = execFileSync('node', ['--input-type=module', '-e', code], { cwd: repoRoot, encoding: 'utf8' });
	return JSON.parse(stdout.trim().split('\n').pop() as string);
}

describe('SC-411 docs-gif — entry validation (a malformed gif entry fails at load, not mid-run)', () => {
	it('accepts the shapes the manifest uses', () => {
		const r = run(`console.log(JSON.stringify(g.validateGifEntry(base({ seed: 7, dpr: 2, cursor: false, steps: [
			{ hold: 800 },
			{ click: 'button.dse-roll-btn', write: true, hold: 500 },
			{ type: 'abc', into: 'input.x', select: true, every: 2, hold: 160 },
			{ press: 'Enter', write: true },
			{ hover: '.a' }, { waitFor: 'modal:.dse-modal__body' }, { click: 'a:not(.b)', capture: false },
		] }))))`);
		expect(r).toEqual([]);
	});

	it('rejects an unknown step key and an unknown entry key', () => {
		const r = run(`console.log(JSON.stringify([
			g.validateGifEntry(base({ steps: [{ clik: '.a' }] })),
			g.validateGifEntry(base({ stepz: [] })),
		]))`);
		expect(r[0].join('\n')).toMatch(/step 1: unknown step key "clik"/);
		expect(r[1].join('\n')).toMatch(/unknown entry key "stepz"/);
	});

	it('rejects write: true on a step that is not an action that can write', () => {
		const r = run(`console.log(JSON.stringify([
			g.validateGifEntry(base({ steps: [{ write: true }] })),
			g.validateGifEntry(base({ steps: [{ hover: '.a', write: true }] })),
			g.validateGifEntry(base({ steps: [{ waitFor: '.a', write: true }] })),
			g.validateGifEntry(base({ steps: [{ click: '.a', write: true }] })),
		]))`);
		expect(r[0].join('\n')).toMatch(/write: true needs an action that can write.*capture-only step/);
		expect(r[1].join('\n')).toMatch(/not hover/);
		expect(r[2].join('\n')).toMatch(/not waitFor/);
		expect(r[3]).toEqual([]);
	});

	it('rejects a malformed selector prefix but not CSS pseudo-classes or the modal: prefix', () => {
		const r = run(`console.log(JSON.stringify([
			g.validateGifEntry(base({ steps: [{ click: 'modl:.dse-modal__body' }] })),
			g.validateGifEntry(base({ steps: [{ click: 'Modal:.x' }] })),
			g.validateGifEntry(base({ steps: [{ click: 'modal:' }] })),
			g.validateGifEntry(base({ steps: [{ click: 'modal:.dse-modal__body' }] })),
			g.validateGifEntry(base({ steps: [{ click: 'button:not(.x):hover' }] })),
		]))`);
		expect(r[0].join('\n')).toMatch(/unknown selector prefix "modl:"/);
		expect(r[1].join('\n')).toMatch(/unknown selector prefix "Modal:"/);
		expect(r[2].join('\n')).toMatch(/nothing after the prefix/);
		expect(r[3]).toEqual([]);
		expect(r[4]).toEqual([]);
	});

	it('requires element (the deferred guard keys on it), a .gif name, and a step list that captures', () => {
		const r = run(`console.log(JSON.stringify([
			g.validateGifEntry(base({ element: undefined })),
			g.validateGifEntry(base({ out: 'x.png' })),
			g.validateGifEntry(base({ steps: [] })),
			g.validateGifEntry(base({ steps: [{ click: '.a', capture: false }] })),
			g.validateGifEntry(base({ source: 'obsidian' })),
		]))`);
		expect(r[0].join('\n')).toMatch(/element is required/);
		expect(r[1].join('\n')).toMatch(/plain "<name>\.gif" filename/);
		expect(r[2].join('\n')).toMatch(/steps must be a non-empty array/);
		expect(r[3].join('\n')).toMatch(/no step captures a frame/);
		expect(r[4].join('\n')).toMatch(/exactly one of note \/ body/);
	});

	it('assertValidGifEntries throws once, naming every bad gif entry, and ignores non-gif entries', () => {
		const r = run(`
			let msg = null;
			try { g.assertValidGifEntries([{ out: 'a.png', source: 'browser' }, base({ out: 'b.gif', steps: [{ nope: 1 }] }), base({ out: 'c.gif', steps: [{ write: true }] })]); } catch (e) { msg = e.message; }
			console.log(JSON.stringify({ msg, ok: g.assertValidGifEntries([{ out: 'a.png', source: 'browser' }, base()]) ?? 'fine' }));
		`);
		expect(r.msg).toMatch(/b\.gif: step 1: unknown step key "nope"/);
		expect(r.msg).toMatch(/c\.gif: step 1: write: true needs/);
		expect(r.ok).toBe('fine');
	});
});

describe('SC-411 docs-gif — runGifSteps over a driver', () => {
	// A recording fake driver: every call is appended to `log`; screenshots are tiny distinct PNGs.
	const DRIVER = `
		const log = [];
		let writes = 0, shots = 0;
		const driver = {
			click: async (s) => { log.push('click ' + s); },
			hover: async (s) => { log.push('hover ' + s); },
			type: async (t, o) => { log.push('type ' + t + (o.select ? ' (select)' : '') + (o.into ? ' into ' + o.into : '')); },
			press: async (k) => { log.push('press ' + k); },
			waitFor: async (s) => { log.push('waitFor ' + s); },
			writeMark: async () => writes,
			waitWrite: async (m) => { log.push('waitWrite'); if (process.env.NO_WRITE) throw new Error('write: true, but no block write landed'); },
			prepareFrame: async (o) => { log.push('prepare park=' + o.park); },
			rectOf: async () => ({ x: 1, y: 2, width: 3, height: 4 }),
			screenshotPng: async () => png(2, 2, () => [shots++, 0, 0]),
		};
	`;

	it('runs action -> (write wait) -> capture per step, with one frame per typed chunk, and parks the pointer except on hover', () => {
		const r = run(`${DRIVER}
			const { frames } = await g.runGifSteps(driver, base({ steps: [
				{ hold: 900 },
				{ click: '.a', write: true, hold: 300 },
				{ type: 'abcde', into: 'input.q', select: true, every: 2, hold: 160 },
				{ hover: '.h' },
				{ press: 'Enter', capture: false },
			] }));
			console.log(JSON.stringify({ log, holds: frames.map((f) => f.hold), n: frames.length }));
		`);
		expect(r.n).toBe(6); // 1 + 1 + 3 chunks (ab, cd, e) + 1 hover
		expect(r.holds).toEqual([900, 300, 160, 160, 160, 500]); // an omitted hold is 500 ms
		expect(r.log).toEqual([
			'prepare park=true',
			'click .a', 'waitWrite', 'prepare park=true',
			'type ab (select) into input.q', 'prepare park=true',
			'type cd into input.q', 'prepare park=true',
			'type e into input.q', 'prepare park=true',
			'hover .h', 'prepare park=false',
			'press Enter',
		]);
	});

	it('fails the entry, naming the step, when a write: true step produces no write', () => {
		const r = run(`${DRIVER}
			process.env.NO_WRITE = '1';
			let msg = null;
			try { await g.runGifSteps(driver, base({ steps: [{ hold: 500 }, { click: '.a', write: true }] })); } catch (e) { msg = e.message; }
			console.log(JSON.stringify({ msg }));
		`);
		expect(r.msg).toMatch(/x\.gif step 2\/2 .*"click":"\.a".*no block write landed/);
	});

	it('refuses to run an invalid entry', () => {
		const r = run(`${DRIVER}
			let msg = null;
			try { await g.runGifSteps(driver, base({ steps: [{ bogus: 1 }] })); } catch (e) { msg = e.message; }
			console.log(JSON.stringify({ msg, calls: log.length }));
		`);
		expect(r.msg).toMatch(/invalid gif entry/);
		expect(r.calls).toBe(0);
	});
});

describe('SC-411 docs-gif — determinism helpers', () => {
	it('seedScript installs a Math.random that replays the same sequence for the same seed', () => {
		const r = run(`
			const seq = (seed) => { const ctx = { Math: Object.create(Math) }; vm.runInNewContext(g.seedScript(seed), ctx); return [1, 2, 3].map(() => ctx.Math.random()); };
			const a = seq(7), b = seq(7), c = seq(8);
			console.log(JSON.stringify({ same: JSON.stringify(a) === JSON.stringify(b), differs: JSON.stringify(a) !== JSON.stringify(c), inRange: a.every((v) => v >= 0 && v < 1) }));
		`);
		expect(r).toEqual({ same: true, differs: true, inRange: true });
	});

	it('compareFrameSets: identical sets are stable; a one-pixel difference names the frame, pixel count and delta; a count mismatch fails', () => {
		const r = run(`
			const a = png(4, 4, () => [10, 10, 10]);
			const b = png(4, 4, (x, y) => (x === 1 && y === 2 ? [12, 10, 10] : [10, 10, 10]));
			console.log(JSON.stringify({
				stable: g.compareFrameSets([{ png: a }, { png: b }], [{ png: a }, { png: b }]),
				diff: g.compareFrameSets([{ png: a }, { png: a }], [{ png: a }, { png: b }]),
				count: g.compareFrameSets([{ png: a }], [{ png: a }, { png: a }]),
			}));
		`);
		expect(r.stable).toEqual({ ok: true, lines: [] });
		expect(r.diff).toEqual({ ok: false, lines: ['frame 1: 1 px differ, max channel delta 2'] });
		expect(r.count).toEqual({ ok: false, lines: ['frame count differs: 1 vs 2'] });
	});

	it('unionCrop is the padded union of every frame rect in device pixels, and refuses a card that outgrows the frame', () => {
		const r = run(`
			const frames = [{ rect: { x: 10, y: 20, width: 100, height: 50 } }, { rect: { x: 10, y: 20, width: 100, height: 80 } }];
			const ok = g.unionCrop(frames, 2, { width: 400, height: 400 });
			let err = null;
			try { g.unionCrop(frames, 2, { width: 400, height: 150 }); } catch (e) { err = e.message; }
			console.log(JSON.stringify({ ok, err }));
		`);
		// x clamps at 0 (10 - 12 PAD < 0); right edge (110 + 12) * 2 = 244; y (20 - 12) * 2 = 16, bottom (100 + 12) * 2 = 224.
		expect(r.ok).toEqual({ x: 0, y: 16, w: 244, h: 208 });
		expect(r.err).toMatch(/grew past the 200x75 CSS px frame/);
	});
});

describe('SC-411 docs-gif — the CDP driver (real Obsidian) over a fake CDP target', () => {
	// `call` records every CDP method; `evaluate` answers the driver's few page queries by shape.
	const FAKE = `
		const calls = [];
		const evals = [];
		let notes = ['v1'];            // successive values of the note text (last one repeats)
		let reads = 0;
		const call = async (method, params) => { calls.push({ method, params }); return { data: '' }; };
		const evaluate = async (expr) => {
			evals.push(expr);
			if (expr.includes('adapter.read')) return notes[Math.min(reads++, notes.length - 1)];
			if (expr.includes('__sc411.point(')) return { x: 100, y: 50 };
			if (expr.includes('__sc411.parkSpot')) return [1437, 1097];
			return undefined;
		};
		const driver = g.createCdpDriver({ call, evaluate, sleep: async () => {}, rootExpr: 'document.body', notePath: 'Harness/n.md', dpr: 2 });
		const mouse = () => calls.filter((c) => c.method === 'Input.dispatchMouseEvent').map((c) => c.params.type + '@' + c.params.x + ',' + c.params.y);
	`;

	it('click sends a REAL pointer sequence (move, press, release at the target) after pointing the synthetic cursor', () => {
		const r = run(`${FAKE}
			await driver.click('button.dse-x');
			console.log(JSON.stringify({ mouse: mouse(), cursorFirst: evals.findIndex((e) => e.includes('sc411-cursor')) < calls.length, usesSelector: evals.some((e) => e.includes('button.dse-x')) }));
		`);
		expect(r.mouse).toEqual(['mouseMoved@100,50', 'mousePressed@100,50', 'mouseReleased@100,50']);
		expect(r.usesSelector).toBe(true);
	});

	it('type focuses the target, selects when asked, and sends one real key event per character', () => {
		const r = run(`${FAKE}
			await driver.type('Ab', { into: 'modal:input.dse-condal__input', select: true });
			const keys = calls.filter((c) => c.method === 'Input.dispatchKeyEvent').map((c) => c.params.type + ':' + (c.params.text ?? '-'));
			console.log(JSON.stringify({ keys, focus: evals.find((e) => e.includes('.focus()')) }));
		`);
		expect(r.keys).toEqual(['keyDown:A', 'keyUp:-', 'keyDown:b', 'keyUp:-']);
		expect(r.focus).toContain('modal:input.dse-condal__input');
		expect(r.focus).toContain('select');
	});

	it('waitWrite resolves once the note text changes (then settles) and throws when it never does', () => {
		const r = run(`${FAKE}
			notes = ['v1', 'v1', 'v2'];
			const mark = await driver.writeMark();
			await driver.waitWrite(mark, 1000);
			const reachedChange = reads;
			notes = ['same'];
			reads = 0;
			let msg = null;
			try { await driver.waitWrite('same', 30); } catch (e) { msg = e.message; }
			console.log(JSON.stringify({ mark, reachedChange, msg }));
		`);
		expect(r.mark).toBe('v1');
		expect(r.reachedChange).toBe(3); // the mark read, one unchanged poll, the poll that saw v2
		expect(r.msg).toMatch(/Harness\/n\.md did not change within 30 ms/);
	});

	it('prepareFrame removes notices/tooltips, blurs a focused button, and parks the pointer in a corner, except for a hover step', () => {
		const r = run(`${FAKE}
			await driver.prepareFrame({ park: true });
			const parked = mouse();
			calls.length = 0;
			await driver.prepareFrame({ park: false });
			console.log(JSON.stringify({ parked, hoverMoves: mouse(), removes: evals.some((e) => e.includes('.notice, .tooltip')), blursButtons: evals.some((e) => e.includes('.blur()') && e.includes('input, textarea, select')) }));
		`);
		expect(r.parked).toEqual(['mouseMoved@1437,1097']);
		expect(r.hoverMoves).toEqual([]);
		expect(r.removes).toBe(true);
		// A modal's autofocused button is blurred (its :focus-visible ring depends on input history); text entry is not.
		expect(r.blursButtons).toBe(true);
	});

	it('press maps names to real key events and rejects a key it does not know', () => {
		const r = run(`${FAKE}
			await driver.press('Enter');
			let msg = null;
			try { await driver.press('F13'); } catch (e) { msg = e.message; }
			console.log(JSON.stringify({ enter: g.keyEventFor('Enter'), ctrlA: g.keyEventFor('Control+A').modifiers, none: g.keyEventFor('F13'), sent: calls.map((c) => c.params.key + ':' + c.params.type), msg }));
		`);
		expect(r.enter).toMatchObject({ key: 'Enter', vk: 13 });
		expect(r.ctrlA).toBe(2);
		expect(r.none).toBeNull();
		expect(r.sent).toEqual(['Enter:keyDown', 'Enter:keyUp']);
		expect(r.msg).toMatch(/unsupported key "F13"/);
	});

	it('compareFrameSets with a crop ignores differences outside it (the window title) and still catches them inside', () => {
		const r = run(`
			const a = png(6, 4, () => [10, 10, 10]);
			const outside = png(6, 4, (x, y) => (y === 0 ? [200, 200, 200] : [10, 10, 10]));
			const inside = png(6, 4, (x, y) => (x === 3 && y === 2 ? [90, 10, 10] : [10, 10, 10]));
			const crop = { x: 0, y: 1, w: 6, h: 3 };
			console.log(JSON.stringify({
				outside: g.compareFrameSets([{ png: a }], [{ png: outside }], crop),
				insideDiff: g.compareFrameSets([{ png: a }], [{ png: inside }], crop),
				noCrop: g.compareFrameSets([{ png: a }], [{ png: outside }]).ok,
				valid: g.validateGifEntry(base({ source: 'obsidian', body: 'x', viewport: { width: 980, height: 620 } })),
			}));
		`);
		expect(r.outside).toEqual({ ok: true, lines: [] });
		expect(r.insideDiff).toEqual({ ok: false, lines: ['frame 0: 1 px differ, max channel delta 80'] });
		expect(r.noCrop).toBe(false);
		expect(r.valid).toEqual([]);
	});
});

