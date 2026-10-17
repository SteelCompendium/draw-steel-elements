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
		let clock = 0;
		const driver = g.createCdpDriver({ call, evaluate, sleep: async (ms) => { clock += ms; }, now: () => clock, rootExpr: 'document.body', notePath: 'Harness/n.md', dpr: 2 });
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
		expect(r.reachedChange).toBeGreaterThanOrEqual(3); // the mark read, an unchanged poll, the poll that saw v2, then the quiet reads
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

// ---------------------------------------------------------------------------------------------
// SC-411 r4 — the review's findings. Each test below was proven by mutation (see sc411-r4-report.md):
// re-applying the mutation named in its comment turns the test red.
describe('SC-411 r4 docs-gif — validation refuses keys the camera does not read (LOW-1)', () => {
	it('refuses `frame`, `pref`, and keys that belong to the other camera, instead of silently ignoring them', () => {
		const r = run(`console.log(JSON.stringify({
			frame: g.validateGifEntry(base({ frame: 'leaf' })),
			pref: g.validateGifEntry(base({ pref: ['a', true] })),
			bgOnObsidian: g.validateGifEntry(base({ source: 'obsidian', body: 'x', bg: 'light' })),
			fixtureOnObsidian: g.validateGifEntry(base({ source: 'obsidian', body: 'x', fixture: 'mid' })),
			noteOnBrowser: g.validateGifEntry(base({ note: 'n' })),
			okBrowser: g.validateGifEntry(base({ fixture: 'mid', width: 400, bg: 'dark', prefs: { a: 1 } })),
			okObsidian: g.validateGifEntry(base({ source: 'obsidian', note: 'n', prefs: { a: 1 }, viewport: { width: 9, height: 9 } })),
		}))`);
		expect(r.frame.join('\n')).toMatch(/unknown entry key "frame"/);
		expect(r.pref.join('\n')).toMatch(/unknown entry key "pref"/);
		expect(r.bgOnObsidian.join('\n')).toMatch(/entry key "bg" is not read by the obsidian camera/);
		expect(r.fixtureOnObsidian.join('\n')).toMatch(/entry key "fixture" is not read by the obsidian camera/);
		expect(r.noteOnBrowser.join('\n')).toMatch(/entry key "note" is not read by the browser camera/);
		expect(r.okBrowser).toEqual([]);
		expect(r.okObsidian).toEqual([]);
	});
});

describe('SC-411 r4 docs-gif — the step runner (LOW-3 mutations)', () => {
	const DRIVER = `
		const log = [];
		const driver = {
			click: async (s) => log.push('click ' + s), hover: async (s) => log.push('hover ' + s),
			type: async (t) => log.push('type ' + t), press: async (k) => log.push('press ' + k),
			waitFor: async () => {}, writeMark: async () => 0, waitWrite: async () => log.push('waitWrite'),
			cursorAside: async (s) => log.push('aside ' + s),
			prepareFrame: async () => {}, rectOf: async () => ({ x: 1, y: 2, width: 3, height: 4 }),
			screenshotPng: async () => png(2, 2, () => [0, 0, 0]),
		};
	`;

	it('a typed step with write: true waits for the write ONCE, after the LAST chunk (mutation: wait after every chunk)', () => {
		const r = run(`${DRIVER}
			await g.runGifSteps(driver, base({ steps: [{ type: 'abcde', into: 'input.q', every: 2, write: true }] }));
			console.log(JSON.stringify(log.filter((l) => !l.startsWith('aside'))));
		`);
		expect(r).toEqual(['type ab', 'type cd', 'type e', 'waitWrite']);
	});

	it('the synthetic cursor steps aside after each typed chunk and after a press (INFO-7)', () => {
		const r = run(`${DRIVER}
			await g.runGifSteps(driver, base({ steps: [{ type: 'ab', into: 'input.q', every: 1 }, { press: 'Enter' }, { click: '.b' }] }));
			console.log(JSON.stringify(log));
		`);
		expect(r).toEqual(['type a', 'aside input.q', 'type b', 'aside input.q', 'press Enter', 'aside null', 'click .b']);
	});
});

describe('SC-411 r4 docs-gif — the CDP driver against a real (jsdom) DOM (LOW-3, INFO-3, INFO-7)', () => {
	// jsdom has no layout, so boxes come from data-box="x,y,w,h" and elementFromPoint from win.__hit.
	const DOM = `
		const { JSDOM } = createRequire(import.meta.url)('jsdom');
		const dom = new JSDOM('<body><div id="root">' +
			'<button class="a" data-box="10,10,40,20">1</button><button class="a" data-box="60,10,40,20">2</button>' +
			'<button class="b" data-box="10,50,40,20">3</button><input class="f" data-box="10,90,80,24">' +
			'</div><div id="cover" data-box="0,0,200,200"></div></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
		const win = dom.window;
		win.Element.prototype.getBoundingClientRect = function () {
			const [x, y, width, height] = (this.dataset.box ?? '0,0,0,0').split(',').map(Number);
			return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height };
		};
		win.document.elementFromPoint = () => win.__hit;
		const calls = [];
		let clock = 0;
		const note = { text: 'v1' };
		const evaluate = async (expr) => (expr.includes('adapter.read') ? note.text : win.eval(expr));
		const sleep = async (ms) => { clock += ms; if (typeof onSleep === 'function') onSleep(clock); };
		let onSleep = null;
		const driver = g.createCdpDriver({ call: async (m, p) => { calls.push({ m, p }); return {}; }, evaluate, sleep, now: () => clock, rootExpr: 'document.getElementById("root")', notePath: 'Harness/n.md' });
		await driver.install();
		const tryIt = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
		const mouse = () => calls.filter((c) => c.m === 'Input.dispatchMouseEvent').map((c) => c.p.type);
	`;

	it('a selector must match EXACTLY ONE node (mutation: at least one)', () => {
		const r = run(`${DOM}
			win.__hit = win.document.querySelector('button.a');
			console.log(JSON.stringify({ two: await tryIt(() => driver.click('button.a')), none: await tryIt(() => driver.click('button.zzz')), moves: mouse().length }));
		`);
		expect(r.two).toMatch(/button\.a: 2 matches \(a step selector must match exactly one node\)/);
		expect(r.none).toMatch(/0 matches/);
		expect(r.moves).toBe(0);
	});

	it('refuses to click a control that something else covers, but clicks one that is hit directly (mutation: drop the covered check)', () => {
		const r = run(`${DOM}
			win.__hit = win.document.getElementById('cover');
			const covered = await tryIt(() => driver.click('button.b'));
			const movedWhileCovered = mouse().length;
			win.__hit = win.document.querySelector('button.b');
			const clean = await tryIt(() => driver.click('button.b'));
			console.log(JSON.stringify({ covered, movedWhileCovered, clean, sent: mouse() }));
		`);
		expect(r.covered).toMatch(/button\.b is covered by DIV/);
		expect(r.movedWhileCovered).toBe(0);
		expect(r.clean).toBeNull();
		expect(r.sent).toEqual(['mouseMoved', 'mousePressed', 'mouseReleased']);
	});

	it('waitWrite also waits for quiet: a second change inside the quiet window extends the wait', () => {
		const r = run(`${DOM}
			// the note changes at t=100 ms and AGAIN at t=400 ms (a late debounced write)
			onSleep = (t) => { if (t >= 100 && note.text === 'v1') note.text = 'v2'; if (t >= 400 && note.text === 'v2') note.text = 'v3'; };
			const t0 = clock;
			await driver.waitWrite('v1', 5000);
			console.log(JSON.stringify({ elapsed: clock - t0, text: note.text, quiet: g.WRITE_QUIET_MS }));
		`);
		expect(r.text).toBe('v3');
		// first change at ~100, second at ~400, then WRITE_QUIET_MS of quiet, then the 500 ms render settle
		expect(r.elapsed).toBeGreaterThanOrEqual(400 + r.quiet + 500);
	});

	it('cursorAside puts the synthetic cursor at the typed field\'s bottom-right corner (INFO-7), and is a no-op off a text field', () => {
		const r = run(`${DOM}
			await driver.cursorAside('input.f');
			const cursor = (await evaluate("document.getElementById('sc411-cursor').style.transform"));
			win.document.getElementById('sc411-cursor').style.transform = 'none';
			win.document.querySelector('button.b').focus();
			await driver.cursorAside(null);
			console.log(JSON.stringify({ cursor, afterButton: await evaluate("document.getElementById('sc411-cursor').style.transform") }));
		`);
		expect(r.cursor).toBe('translate(90px, 114px)');
		expect(r.afterButton).toBe('none');
	});
});

describe('SC-411 r4 docs-gif — the Playwright driver over a fake page (LOW-2, INFO-3, INFO-7)', () => {
	const PAGE = `
		const calls = [];
		let clock = 0;
		let writes = 1;
		let schedule = [];
		const loc = (path) => ({
			locator: (s) => loc(path + '>' + s),
			click: async (o) => calls.push(['click', path, o]), hover: async (o) => calls.push(['hover', path, o]),
			scrollIntoViewIfNeeded: async (o) => calls.push(['scroll', path, o]),
			boundingBox: async (o) => (calls.push(['box', path, o]), { x: 10, y: 20, width: 30, height: 40 }),
			press: async (k, o) => calls.push(['press', path, o]), pressSequentially: async (t, o) => calls.push(['seq', path, o]),
			waitFor: async (o) => calls.push(['waitFor', path, o]),
		});
		const cursorAt = [];
		const page = {
			locator: loc,
			addStyleTag: async () => {},
			evaluate: async (fn, arg) => {
				const src = String(fn);
				if (src.includes('__dseHarnessWrites')) return writes;
				if (src.includes('sc411-cursor') && arg) cursorAt.push([arg.x, arg.y]);
				if (src.includes('activeElement')) return { x: 1, y: 2, width: 3, height: 4 };
				return undefined;
			},
			waitForFunction: async () => {},
			waitForTimeout: async (ms) => { clock += ms; for (const [t, f] of schedule) if (clock >= t) f(); },
			keyboard: { press: async () => {}, type: async () => {} },
		};
		const driver = await g.createPageDriver(page, { now: () => clock });
	`;

	it('every selector wait is bounded by SELECTOR_TIMEOUT_MS (5 s), not Playwright\'s 30 s default', () => {
		const r = run(`${PAGE}
			await driver.click('button.x'); await driver.hover('button.x'); await driver.waitFor('modal:.m');
			await driver.type('1', { into: 'input.i', select: true });
			console.log(JSON.stringify({ calls: calls.map((c) => c[0] + ':' + c[2]?.timeout), limit: g.SELECTOR_TIMEOUT_MS }));
		`);
		expect(r.limit).toBe(5000);
		expect(r.calls).toEqual(['scroll:5000', 'box:5000', 'click:5000', 'scroll:5000', 'box:5000', 'hover:5000', 'waitFor:5000', 'press:5000', 'seq:5000']);
	});

	it('waitWrite waits for quiet: a second write inside the quiet window extends the wait', () => {
		const r = run(`${PAGE}
			schedule = [[300, () => { writes = 2; }]];   // a straggler 300 ms in
			const t0 = clock;
			await driver.waitWrite(0, 5000);
			console.log(JSON.stringify({ elapsed: clock - t0, writes, quiet: g.WRITE_QUIET_MS }));
		`);
		expect(r.writes).toBe(2);
		expect(r.elapsed).toBeGreaterThanOrEqual(300 + r.quiet);
	});

	it('cursorAside tips the cursor at the typed field\'s bottom-right corner', () => {
		const r = run(`${PAGE}
			await driver.cursorAside('input.i');
			console.log(JSON.stringify(cursorAt.at(-1)));
		`);
		expect(r).toEqual([40, 60]); // box {x:10,y:20,w:30,h:40}: right 40, bottom 60
	});
});

describe('SC-411 r4 docs-gif — browser capture set-up (LOW-3: launch flag and dice seed)', () => {
	it('launches Chromium with --disable-partial-raster', () => {
		const r = run(`
			let got = null;
			await g.launchGifBrowser({ launch: async (o) => (got = o) });
			console.log(JSON.stringify({ got, args: g.BROWSER_LAUNCH_ARGS }));
		`);
		expect(r.got).toEqual({ args: ['--disable-partial-raster'] });
	});

	it('installs the seeded Math.random BEFORE navigating, only when a seed is set (mutation: drop addInitScript)', () => {
		const r = run(`
			const mk = () => { const log = []; return { log, page: {
				on: () => {}, addInitScript: async (s) => log.push('init:' + s), goto: async (u) => log.push('goto:' + u),
				waitForFunction: async () => {}, evaluate: async (fn) => (String(fn).includes('__dseHarnessDone') ? { errors: [] } : undefined),
			} }; };
			const seeded = mk(); await g.openBrowserGifPage(seeded.page, base({ seed: 7, prefs: { rollingEnabled: true } }), 'file:///h.html');
			const plain = mk(); await g.openBrowserGifPage(plain.page, base(), 'file:///h.html');
			console.log(JSON.stringify({ seeded: seeded.log.map((l) => l.slice(0, 5)), seedBody: seeded.log[0] === 'init:' + g.seedScript(7), url: seeded.log[1], plain: plain.log.map((l) => l.slice(0, 5)) }));
		`);
		expect(r.seeded).toEqual(['init:', 'goto:']);
		expect(r.seedBody).toBe(true);
		expect(r.plain).toEqual(['goto:']);
		// experimental=0 (no deferred chrome), pad=16 (room for the hover chrome), prefs as key:value
		expect(r.url).toContain('experimental=0');
		expect(r.url).toContain('pad=16');
		expect(r.url).toContain('prefs=rollingEnabled%3Atrue');
	});
});

describe('SC-411 r4 docs-gif — small guards (INFO-2, INFO-4, INFO-5)', () => {
	it('unionCrop refuses a rect that starts left of / above the frame instead of clamping it silently', () => {
		const r = run(`
			let msg = null;
			try { g.unionCrop([{ rect: { x: -8, y: 5, width: 50, height: 20 } }], 2, { width: 400, height: 400 }); } catch (e) { msg = e.message; }
			let msg2 = null;
			try { g.unionCrop([{ rect: { x: 5, y: -3, width: 50, height: 20 } }], 2, { width: 400, height: 400 }); } catch (e) { msg2 = e.message; }
			console.log(JSON.stringify({ msg, msg2 }));
		`);
		expect(r.msg).toMatch(/off the frame's top\/left edge/);
		expect(r.msg2).toMatch(/off the frame's top\/left edge/);
	});

	it('runGifEntry removes a stale <out>.run2 directory left by an earlier unstable run', () => {
		const r = run(`
			const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
			const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sc411-run2-'));
			const framesDir = path.join(root, 'frames', 't.gif');
			fs.mkdirSync(framesDir + '.run2', { recursive: true });
			fs.writeFileSync(path.join(framesDir + '.run2', '00.png'), 'stale');
			const frame = { png: png(40, 30, () => [10, 10, 10]), hold: 500, rect: { x: 1, y: 1, width: 10, height: 5 }, what: 'x' };
			const log = console.log; console.log = () => {};
			await g.runGifEntry({ out: 't.gif', dpr: 1 }, async () => [frame], { camera: 'browser', outDir: path.join(root, 'out'), framesDir });
			console.log = log;
			console.log(JSON.stringify({ staleGone: !fs.existsSync(framesDir + '.run2'), wrote: fs.existsSync(path.join(root, 'out', 't.gif')) }));
			fs.rmSync(root, { recursive: true, force: true });
		`);
		expect(r).toEqual({ staleGone: true, wrote: true });
	});

	it('the Obsidian seed is saved and restored: Math.random is the original again after an entry', () => {
		const r = run(`
			const ctx = { Math: Object.create(Math), window: {} };
			ctx.window = ctx;
			const original = ctx.Math.random;
			vm.runInNewContext(g.saveRandomScript(), ctx);
			vm.runInNewContext(g.seedScript(7), ctx);
			const seeded = ctx.Math.random !== original;
			vm.runInNewContext(g.restoreRandomScript(), ctx);
			console.log(JSON.stringify({ seeded, restored: ctx.Math.random === original, cleaned: ctx.__sc411Random === undefined }));
		`);
		expect(r).toEqual({ seeded: true, restored: true, cleaned: true });
	});
});

