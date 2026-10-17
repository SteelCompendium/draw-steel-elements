// visual-harness/docs-gif.mjs — SC-411: the `kind: 'gif'` docs-manifest entry shape.
//
// A gif entry is an output filename plus a SCRIPTED INTERACTION: a list of steps (click this,
// type that, wait for the write, hover there), each followed by one captured frame. The
// runner drives the steps, collects the frames, and gif-encode.mjs turns them into
// `docs/Media/<out>`. Same provenance rule as the PNGs: a GIF that no command can
// regenerate does not belong in docs/Media.
//
// This module is camera-agnostic. It owns
//   - validateGifEntry / assertValidGifEntries — a malformed entry is a loud error at load,
//     never mid-run;
//   - runGifSteps(driver, entry)               — the step interpreter, over a small DRIVER
//     interface (below);
//   - the pieces every camera needs around it: the seeded-PRNG init script, the shared crop
//     rule, the review-frame dump, and compareFrameSets (the `--check-stable` verdict).
// and the Playwright-page driver (createPageDriver) used by docs-shots.mjs's browser half.
// The real-Obsidian camera (obsidian-camera.mjs --docs) supplies its own CDP driver with the
// same shape — runGifSteps does not know which one it has.
//
// ---------------------------------------------------------------------------------------
// ENTRY SHAPE
//
//   {
//     out: 'initiative-tracker.gif', kind: 'gif',
//     source: 'browser' | 'obsidian',
//     element: 'initiative',          // REQUIRED, both sources: the deferred-element guard
//                                     // (docs-deferred-guard.cjs) keys on it
//     // browser: fixture?, width?, prefs?        obsidian: note? | body?
//     seed?: 7,                       // seeds Math.random (dice) before the page runs
//     dpr?: 2,                        // 2 unless over the byte budget, then 1 (like the PNGs)
//     cursor?: true,                  // synthetic pointer overlay; false turns it off
//     viewport?: { width, height },   // browser; default 1000x1400 (must hold the whole card)
//     frame?: 'element' | 'leaf',     // obsidian only (2b)
//     steps: [ … ],
//   }
//
// STEP VOCABULARY — each step is  action -> settle -> capture one frame (unless capture:false)
//
//   (no action)          capture the current state (the resting first frame, the last frame)
//   click:  sel          move the synthetic cursor to sel, then send a REAL pointer click
//   hover:  sel          move both cursors only (hover-revealed UI); the pointer is NOT parked
//   type:   text         focus `into` (or use the focused element), `select:true` selects all
//                        first, insert the text with real key events; `every:n` captures one
//                        frame per n characters (a typing animation)
//   press:  key          real key event ('Enter', 'Escape', 'Control+A')
//   waitFor: sel         wait until sel exists (e.g. a modal body after a click)
//   write:  true         modifier on click/type/press: WAIT FOR THE BLOCK WRITE before
//                        capturing; no write within 5 s FAILS the entry (the script is wrong
//                        or the product is)
//   hold:   ms           how long this frame stays on screen (default 500); consecutive
//                        identical frames are merged and their holds added
//   capture: false       act without capturing
//   what:   'text'       free-form annotation for logs / the review frames
//
// SELECTORS resolve INSIDE the element root (`#mount` in the browser, the active leaf's
// `[data-dse-element]` in Obsidian), so they can never hit a second copy; they must match
// exactly one node (a strict match, so a vague selector fails loudly instead of clicking
// the first of three). The prefix `modal:` resolves inside `.dse-modal` instead (Obsidian
// appends modals to <body>). Use DSE classes and aria-labels; never positional :nth-child.
//
// DRIVER INTERFACE (every method async):
//   click(sel) hover(sel) type(text, { into, select }) press(key) waitFor(sel)
//   writeMark()                  -> opaque mark of "writes so far"
//   waitWrite(mark, timeoutMs)   -> resolves once a write after `mark` landed + settled,
//                                   throws on timeout
//   prepareFrame({ park })       -> remove notices/tooltips, wait for fonts, park the real
//                                   pointer off the element (unless park === false), settle
//   rectOf()                     -> { x, y, width, height } CSS px: what the frame must show
//                                   (the element root, plus any open modal)
//   screenshotPng()              -> Buffer, a FULL fixed-size frame (cropped later, once the
//                                   union over every frame is known)
// ---------------------------------------------------------------------------------------
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { decodeCropped, encodeRgbaGif, mergeIdentical } from './gif-encode.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

export const GIF_BYTE_BUDGET = 1_000_000;
export const DEFAULT_HOLD_MS = 500;
export const WRITE_TIMEOUT_MS = 5000;
/** CSS px of breathing room around the union of element rects. */
export const FRAME_PAD = 12;

const ACTION_KEYS = ['click', 'hover', 'type', 'press', 'waitFor'];
/** Actions that can cause a block write (hover/waitFor only observe). */
const WRITING_ACTIONS = ['click', 'type', 'press'];
const MODIFIER_KEYS = ['hold', 'write', 'capture', 'what', 'into', 'select', 'every'];
const TYPE_ONLY_KEYS = ['into', 'select', 'every'];
const STEP_KEYS = new Set([...ACTION_KEYS, ...MODIFIER_KEYS]);
const ENTRY_KEYS = new Set([
	'out', 'kind', 'source', 'element', 'fixture', 'width', 'prefs', 'note', 'body', 'seed',
	'dpr', 'cursor', 'viewport', 'frame', 'steps', 'bg', 'pref',
]);

/** A selector prefix is `<ident>:` followed by something that starts a selector (a class, id,
 *  attribute, universal, combinator or whitespace) — never a CSS pseudo-class name, which
 *  follows its colon with an identifier. `modal:` is the only prefix there is. */
const PREFIX_RE = /^([A-Za-z][\w-]*):(?=[.#[*\s>+~])/;

/** Problems with one selector string (empty array = fine). */
export function selectorProblems(sel) {
	if (typeof sel !== 'string' || sel.trim() === '') return ['selector must be a non-empty string'];
	if (/^modal:\s*$/.test(sel)) return ['selector "modal:" has nothing after the prefix'];
	const m = PREFIX_RE.exec(sel);
	if (m && m[1] !== 'modal') {
		return [`unknown selector prefix "${m[1]}:" in ${JSON.stringify(sel)} (the only prefix is "modal:")`];
	}
	return [];
}

/** The one action key a step carries, or null for a capture-only step. */
export function actionOf(step) {
	const keys = ACTION_KEYS.filter((k) => step[k] !== undefined);
	return keys.length === 0 ? null : keys[0];
}

function stepProblems(step) {
	if (step === null || typeof step !== 'object' || Array.isArray(step)) return ['step must be an object'];
	const out = [];
	for (const k of Object.keys(step)) {
		if (!STEP_KEYS.has(k)) out.push(`unknown step key "${k}" (known: ${[...STEP_KEYS].join(', ')})`);
	}
	const actions = ACTION_KEYS.filter((k) => step[k] !== undefined);
	if (actions.length > 1) out.push(`a step has one action, found ${actions.join(' + ')}`);
	const action = actions[0] ?? null;
	if (step.write !== undefined) {
		if (step.write !== true) out.push('write must be true when present');
		else if (!WRITING_ACTIONS.includes(action)) {
			out.push(
				`write: true needs an action that can write (${WRITING_ACTIONS.join(', ')}), not ${action ?? 'a capture-only step'}`,
			);
		}
	}
	for (const k of TYPE_ONLY_KEYS) {
		if (step[k] !== undefined && action !== 'type') out.push(`"${k}" is only meaningful on a type step`);
	}
	for (const k of ['click', 'hover', 'waitFor']) {
		if (step[k] !== undefined) out.push(...selectorProblems(step[k]));
	}
	if (step.into !== undefined) out.push(...selectorProblems(step.into));
	if (action === 'type' && (typeof step.type !== 'string' || step.type === '')) out.push('type needs a non-empty string');
	if (action === 'press' && (typeof step.press !== 'string' || step.press === '')) out.push('press needs a key name');
	if (step.every !== undefined && !(Number.isInteger(step.every) && step.every > 0)) {
		out.push('every must be a positive integer');
	}
	if (step.select !== undefined && step.select !== true) out.push('select must be true when present');
	if (step.hold !== undefined && !(Number.isFinite(step.hold) && step.hold >= 20 && step.hold <= 60_000)) {
		out.push('hold must be 20..60000 ms');
	}
	if (step.capture !== undefined && step.capture !== false) out.push('capture must be false when present');
	if (step.capture === false && step.hold !== undefined) out.push('hold on a capture:false step does nothing');
	return out;
}

/** Every problem with one `kind: 'gif'` entry (empty array = valid). */
export function validateGifEntry(entry) {
	const out = [];
	if (typeof entry.out !== 'string' || !/^[\w.-]+\.gif$/.test(entry.out)) out.push('out must be a plain "<name>.gif" filename');
	for (const k of Object.keys(entry)) if (!ENTRY_KEYS.has(k)) out.push(`unknown entry key "${k}"`);
	if (entry.source !== 'browser' && entry.source !== 'obsidian') out.push('source must be "browser" or "obsidian"');
	if (typeof entry.element !== 'string' || entry.element === '') {
		out.push('element is required (the deferred-element guard keys on it)');
	}
	if (entry.source === 'obsidian' && (entry.note === undefined) === (entry.body === undefined)) {
		out.push('an obsidian gif needs exactly one of note / body');
	}
	if (entry.source === 'browser' && (entry.note !== undefined || entry.body !== undefined)) {
		out.push('note / body are obsidian-only');
	}
	if (entry.seed !== undefined && !Number.isInteger(entry.seed)) out.push('seed must be an integer');
	if (entry.dpr !== undefined && entry.dpr !== 1 && entry.dpr !== 2) out.push('dpr must be 1 or 2');
	if (entry.cursor !== undefined && typeof entry.cursor !== 'boolean') out.push('cursor must be a boolean');
	if (entry.frame !== undefined && !['element', 'leaf'].includes(entry.frame)) out.push('frame must be "element" or "leaf"');
	if (entry.viewport !== undefined) {
		const v = entry.viewport;
		if (!v || !(v.width > 0) || !(v.height > 0)) out.push('viewport needs positive width and height');
	}
	if (!Array.isArray(entry.steps) || entry.steps.length === 0) {
		out.push('steps must be a non-empty array');
		return out;
	}
	entry.steps.forEach((step, i) => {
		for (const p of stepProblems(step)) out.push(`step ${i + 1}: ${p}`);
	});
	if (entry.steps.every((s) => s && s.capture === false)) out.push('no step captures a frame');
	return out;
}

/** Throws one error naming every malformed gif entry in `shots`. Runs before anything is
 *  launched. Non-gif entries are ignored. */
export function assertValidGifEntries(shots) {
	const lines = [];
	for (const shot of shots) {
		if (shot.kind !== 'gif') continue;
		for (const p of validateGifEntry(shot)) lines.push(`  ${shot.out ?? '(no out)'}: ${p}`);
	}
	if (lines.length) throw new Error(`docs-manifest.mjs has invalid gif entr${lines.length === 1 ? 'y' : 'ies'}:\n${lines.join('\n')}`);
}

// ----------------------------------------------------------------------- step interpreter
const chunksOf = (text, n) => {
	if (!n) return [text];
	const out = [];
	for (let i = 0; i < text.length; i += n) out.push(text.slice(i, i + n));
	return out;
};

/**
 * Drive `entry.steps` over `driver`. Returns `{ frames }`, each
 * `{ png, hold, rect, what }` in capture order (png = full frame Buffer; rect = what the
 * frame must show, CSS px). Any failing step throws an Error naming the entry and step.
 */
export async function runGifSteps(driver, entry) {
	const problems = validateGifEntry(entry);
	if (problems.length) throw new Error(`${entry.out}: invalid gif entry:\n  ${problems.join('\n  ')}`);
	const frames = [];
	const capture = async (step, what) => {
		await driver.prepareFrame({ park: actionOf(step) !== 'hover' });
		const rect = await driver.rectOf();
		const png = await driver.screenshotPng();
		frames.push({ png, hold: step.hold ?? DEFAULT_HOLD_MS, rect, what });
	};
	for (const [i, step] of entry.steps.entries()) {
		const where = `${entry.out} step ${i + 1}/${entry.steps.length} ${JSON.stringify(step)}`;
		try {
			const action = actionOf(step);
			const label = step.what ?? (action ? `${action}: ${step[action]}` : 'hold');
			const mark = step.write ? await driver.writeMark() : null;
			const doCapture = step.capture !== false;
			if (action === 'type') {
				const parts = chunksOf(step.type, step.every);
				for (const [n, part] of parts.entries()) {
					await driver.type(part, { into: step.into, select: step.select === true && n === 0 });
					const last = n === parts.length - 1;
					if (last && step.write) await driver.waitWrite(mark, WRITE_TIMEOUT_MS);
					if (doCapture) await capture(step, `${label} [${n + 1}/${parts.length}]`);
				}
				continue;
			}
			if (action === 'click') await driver.click(step.click);
			else if (action === 'hover') await driver.hover(step.hover);
			else if (action === 'press') await driver.press(step.press);
			else if (action === 'waitFor') await driver.waitFor(step.waitFor);
			if (step.write) await driver.waitWrite(mark, WRITE_TIMEOUT_MS);
			if (doCapture) await capture(step, label);
		} catch (e) {
			throw new Error(`${where}: ${e && e.message ? e.message : e}`);
		}
	}
	if (frames.length === 0) throw new Error(`${entry.out}: the script captured no frames`);
	return { frames };
}

// --------------------------------------------------------------------------- shared helpers
/** Width/height of a PNG buffer, read from its IHDR (no decode). */
export function pngSize(buf) {
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * The one crop every frame is cut with: the union of every frame's `rect` (CSS px) plus
 * FRAME_PAD, in device pixels, clamped to the frame. Throws when a rect runs off the frame
 * (the viewport is too small for the card — a quiet cut-off GIF is worse than a failure).
 */
export function unionCrop(frames, dpr, frameSize) {
	const u = frames.reduce(
		(a, f) => ({
			x0: Math.min(a.x0, f.rect.x),
			y0: Math.min(a.y0, f.rect.y),
			x1: Math.max(a.x1, f.rect.x + f.rect.width),
			y1: Math.max(a.y1, f.rect.y + f.rect.height),
		}),
		{ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
	);
	const over = (v, max) => v > max + 0.5;
	if (over(u.x1, frameSize.width / dpr) || over(u.y1, frameSize.height / dpr)) {
		throw new Error(
			`the element grew past the ${frameSize.width / dpr}x${frameSize.height / dpr} CSS px frame ` +
				`(union reaches ${Math.ceil(u.x1)}x${Math.ceil(u.y1)}) — raise the entry's viewport`,
		);
	}
	const x = Math.max(0, Math.floor((u.x0 - FRAME_PAD) * dpr));
	const y = Math.max(0, Math.floor((u.y0 - FRAME_PAD) * dpr));
	const x2 = Math.min(frameSize.width, Math.ceil((u.x1 + FRAME_PAD) * dpr));
	const y2 = Math.min(frameSize.height, Math.ceil((u.y1 + FRAME_PAD) * dpr));
	return { x, y, w: x2 - x, h: y2 - y };
}

/** sha256 hex of a buffer. */
export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * A seeded `Math.random` installed before the page's own scripts run (browser:
 * page.addInitScript; Obsidian: Runtime.evaluate before the first step). mulberry32 — tiny,
 * no dependency, identical sequence everywhere. Product code is untouched: NATIVE_DICE
 * (src/framework/roll/service.ts) is the only randomness the dice path uses.
 */
export function seedScript(seed) {
	return (
		`(() => { let a = ${seed >>> 0}; Math.random = () => { a = (a + 0x6D2B79F5) | 0; ` +
		`let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; ` +
		`return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`
	);
}

/** Write the raw frames (exactly the bytes --check-stable hashes) + a frames.json to
 *  `<dir>/NN.png` for human review. `dir` is under the git-ignored visual-harness/dist/. */
export function writeReviewFrames(dir, frames, meta) {
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(dir, { recursive: true });
	const rows = frames.map((f, i) => {
		const file = `${String(i).padStart(2, '0')}.png`;
		fs.writeFileSync(path.join(dir, file), f.png);
		return { file, hold: f.hold, what: f.what, rect: f.rect, sha256: sha256(f.png) };
	});
	fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ ...meta, frames: rows }, null, 1) + '\n');
}

/** Differing-pixel count and max channel delta between two PNG buffers (same size assumed;
 *  a size mismatch reports every pixel). With `crop`, only that box is compared. */
function pixelDiff(a, b, crop) {
	const pa = PNG.sync.read(a);
	const pb = PNG.sync.read(b);
	if (pa.width !== pb.width || pa.height !== pb.height) {
		return { sizeMismatch: `${pa.width}x${pa.height} vs ${pb.width}x${pb.height}` };
	}
	const box = crop ?? { x: 0, y: 0, w: pa.width, h: pa.height };
	let px = 0;
	let max = 0;
	for (let y = box.y; y < box.y + box.h; y++) {
		for (let x = box.x; x < box.x + box.w; x++) {
			const p = (y * pa.width + x) * 4;
			let d = 0;
			for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(pa.data[p + c] - pb.data[p + c]));
			if (d > 0) px++;
			if (d > max) max = d;
		}
	}
	return { px, max };
}

/**
 * The `--check-stable` verdict. `a` and `b` are two captures of the same entry (arrays of
 * `{ png }`). Stable = the same frame count and a byte-identical PNG for every frame (the GIF
 * is a pure function of the frames, so this implies an identical GIF). Returns
 * `{ ok, lines }`; on a mismatch `lines` names the frame indices, the differing pixel count
 * and the max channel delta.
 *
 * `crop` (optional, { x, y, w, h } device px) restricts the comparison to the box the GIF is
 * actually cut from. The real-Obsidian camera needs it: its full-window frames carry the tab
 * title (the scratch note's name, which differs per capture by design), and nothing outside the
 * crop reaches the GIF. Frames whose raw bytes match are stable either way.
 */
export function compareFrameSets(a, b, crop) {
	const lines = [];
	if (a.length !== b.length) {
		lines.push(`frame count differs: ${a.length} vs ${b.length}`);
		return { ok: false, lines };
	}
	for (let i = 0; i < a.length; i++) {
		if (sha256(a[i].png) === sha256(b[i].png)) continue;
		const d = pixelDiff(a[i].png, b[i].png, crop);
		if (crop && !d.sizeMismatch && d.px === 0) continue;
		lines.push(
			d.sizeMismatch
				? `frame ${i}: size differs (${d.sizeMismatch})`
				: `frame ${i}: ${d.px} px differ, max channel delta ${d.max}`,
		);
	}
	return { ok: lines.length === 0, lines };
}

// ------------------------------------------------------------------- one entry, end to end
/** Capture + encode one gif entry: 2x, then 1x if the 2x GIF busts the byte budget (the PNG
 *  rule). `capture(dpr)` is the camera's own scripted capture (fresh page / fresh note every
 *  call) and returns the raw frames. Returns { frames, bytes, dpr, crop, merged }. */
export async function renderGifEntry(entry, capture) {
	const first = entry.dpr ?? 2;
	const dprs = first === 1 ? [1] : [first, 1];
	let result = null;
	for (const dpr of dprs) {
		const frames = await capture(dpr);
		const crop = unionCrop(frames, dpr, pngSize(frames[0].png));
		const holds = frames.map((f) => f.hold);
		const rgba = frames.map((f) => decodeCropped(f.png, crop));
		const merged = mergeIdentical(rgba, holds).length;
		const bytes = encodeRgbaGif(rgba, holds, crop.w, crop.h);
		result = { frames, bytes, dpr, crop, merged };
		if (bytes.length <= GIF_BYTE_BUDGET) break;
		if (dpr > 1) console.log(`     (re-shooting ${entry.out} at 1x — 2x was ${bytes.length} B, over ${GIF_BYTE_BUDGET})`);
	}
	return result;
}

/**
 * Run one gif entry for either camera. `capture(dpr)` as above; `camera` is 'browser' |
 * 'obsidian' (log label only). Writes the review frames to `framesDir`; then either writes
 * `<outDir>/<out>` or, with `checkStable`, captures a SECOND time and throws unless both runs
 * produced the same frame count and byte-identical frames (and so the same GIF). Throws on any
 * failure; the caller records it. Returns the one-line summary it logged.
 */
export async function runGifEntry(entry, capture, { camera, outDir, framesDir, checkStable = false }) {
	const a = await renderGifEntry(entry, capture);
	const loopSec = (a.frames.reduce((n, f) => n + f.hold, 0) / 1000).toFixed(1);
	const sha = sha256(a.bytes);
	writeReviewFrames(framesDir, a.frames, { out: entry.out, camera, dpr: a.dpr, crop: a.crop, bytes: a.bytes.length, gifSha256: sha });
	const over = a.bytes.length > GIF_BYTE_BUDGET ? ` — OVER BUDGET (${GIF_BYTE_BUDGET}), shorten the script` : '';
	const summary = `${a.bytes.length} bytes, ${a.frames.length} captured / ${a.merged} gif frames, ${loopSec}s loop, ${camera} @${a.dpr}x`;
	if (checkStable) {
		const b = await renderGifEntry(entry, capture);
		const verdict = compareFrameSets(a.frames, b.frames, a.crop);
		if (a.dpr !== b.dpr) verdict.lines.push(`dpr differs between runs: ${a.dpr} vs ${b.dpr}`);
		if (verdict.lines.length === 0 && sha256(b.bytes) !== sha) verdict.lines.push('frames identical but GIF bytes differ (encoder is not deterministic)');
		if (verdict.lines.length) {
			// Keep the second run's frames beside the first's, so the differing frames can be diffed.
			writeReviewFrames(`${framesDir}.run2`, b.frames, { out: entry.out, camera, dpr: b.dpr, crop: b.crop, bytes: b.bytes.length });
			throw new Error(`NOT STABLE across two runs (second run's frames: ${framesDir}.run2):\n    ${verdict.lines.join('\n    ')}`);
		}
		console.log(`  stable ${entry.out} (${summary}, gif sha256 ${sha.slice(0, 12)})${over}`);
	} else {
		fs.mkdirSync(outDir, { recursive: true });
		fs.writeFileSync(path.join(outDir, entry.out), a.bytes);
		console.log(`  ok ${entry.out} (${summary})${over}`);
	}
	return summary;
}

// ------------------------------------------------------------------ Playwright page driver
export const CURSOR_CSS = `#sc411-cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;
background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22'><path d='M2 2 L2 18 L6.5 13.5 L9.5 20 L12 19 L9 12.5 L15 12.5 Z' fill='white' stroke='black' stroke-width='1.4' stroke-linejoin='round'/></svg>") no-repeat;}`;

/**
 * The driver for a Playwright `page` already showing the F4 harness (`#mount` filled).
 * `cursor` (default true) paints the synthetic pointer: headless Chromium draws none, and a
 * GIF where things change with no visible cause is hard to follow. The overlay is runner-only
 * DOM (a fixed-position node on <body>, outside #mount); the REAL pointer is parked off the
 * element before every capture so hover chrome and hover timing never reach a frame.
 */
export async function createPageDriver(page, { cursor = true } = {}) {
	const root = () => page.locator('#mount');
	const resolve = (sel) => (sel.startsWith('modal:') ? page.locator('.dse-modal').locator(sel.slice(6).trim()) : root().locator(sel));
	if (cursor) {
		await page.addStyleTag({ content: CURSOR_CSS });
		await page.evaluate(() => {
			const c = document.createElement('div');
			c.id = 'sc411-cursor';
			c.style.display = 'none';
			document.body.appendChild(c);
		});
	}
	const moveCursor = async (loc) => {
		if (!cursor) return;
		await loc.scrollIntoViewIfNeeded();
		const box = await loc.boundingBox();
		if (!box) throw new Error('target has no box to point at');
		await page.evaluate(
			({ x, y }) => {
				const c = document.getElementById('sc411-cursor');
				c.style.display = 'block';
				c.style.transform = `translate(${x}px, ${y}px)`;
			},
			{ x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) },
		);
	};
	// Two rAF + a short timer: the views update in place, or via rebuild + a debounced write.
	const settle = () =>
		page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))));
	return {
		async click(sel) {
			const loc = resolve(sel);
			await moveCursor(loc);
			await loc.click();
		},
		async hover(sel) {
			const loc = resolve(sel);
			await moveCursor(loc);
			await loc.hover();
		},
		async type(text, { into, select } = {}) {
			if (into) {
				const loc = resolve(into);
				if (select) await loc.press('Control+A');
				await loc.pressSequentially(text);
			} else {
				if (select) await page.keyboard.press('Control+A');
				await page.keyboard.type(text);
			}
		},
		async press(key) {
			await page.keyboard.press(key);
		},
		async waitFor(sel) {
			await resolve(sel).waitFor({ state: 'attached', timeout: 5000 });
		},
		writeMark: () => page.evaluate(() => window.__dseHarnessWrites ?? 0),
		async waitWrite(mark, timeoutMs) {
			try {
				await page.waitForFunction((m) => (window.__dseHarnessWrites ?? 0) > m, mark, { timeout: timeoutMs });
			} catch {
				throw new Error(`write: true, but no block write landed within ${timeoutMs} ms (the script is wrong, or the product is)`);
			}
			await settle();
		},
		async prepareFrame({ park }) {
			await page.evaluate(async () => {
				document.querySelectorAll('.notice, .tooltip').forEach((n) => n.remove());
				await document.fonts.ready;
			});
			if (park !== false) {
				// A corner outside #mount (checked, not assumed).
				const vp = page.viewportSize();
				const spots = [[1, 1], [vp.width - 2, 1], [1, vp.height - 2], [vp.width - 2, vp.height - 2]];
				let spot = null;
				for (const [x, y] of spots) {
					const inside = await page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('#mount'), [x, y]);
					if (!inside) {
						spot = [x, y];
						break;
					}
				}
				if (!spot) throw new Error('no viewport corner outside #mount to park the pointer in');
				await page.mouse.move(spot[0], spot[1]);
			}
			await settle();
			const scroll = await page.evaluate(() => window.scrollY);
			if (scroll !== 0) throw new Error(`the page scrolled to ${scroll}px — raise the entry's viewport height`);
		},
		rectOf: () =>
			page.evaluate(() => {
				// The element chrome (expand/collapse icons) is revealed by focus/hover and sits
				// ABOVE the card's top edge; without it in the rect a focused frame shows a
				// clipped strip of icons along the crop's top.
				const boxes = [document.getElementById('mount'), ...document.querySelectorAll('#mount .dse-chrome, .dse-modal')]
					.filter(Boolean)
					.map((n) => n.getBoundingClientRect())
					.filter((r) => r.width > 0 && r.height > 0);
				const x0 = Math.min(...boxes.map((r) => r.left));
				const y0 = Math.min(...boxes.map((r) => r.top));
				const x1 = Math.max(...boxes.map((r) => r.right));
				const y1 = Math.max(...boxes.map((r) => r.bottom));
				return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
			}),
		// caret 'hide' is Playwright's default; 'disabled' finishes transitions before the shot.
		screenshotPng: () => page.screenshot({ animations: 'disabled', caret: 'hide' }),
	};
}

// -------------------------------------------------------------------------- CDP driver
/** Freeze CSS for real Obsidian: no transitions/animations, no caret. Without it ~1 capture in
 *  3 differed by 8 px on a focused textarea's ring (SC-411 r1 spike); with it 5/5 identical. */
export const FREEZE_CSS = '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}';

/** Keys `press` understands (CDP key-event fields). Single characters are typed as text. */
const KEYS = {
	Enter: { key: 'Enter', code: 'Enter', vk: 13 },
	Escape: { key: 'Escape', code: 'Escape', vk: 27 },
	Tab: { key: 'Tab', code: 'Tab', vk: 9 },
	Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
	ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
	ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
	ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
	ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
};

/** CDP `Input.dispatchKeyEvent` params for a `press` key name, or null when unsupported. */
export function keyEventFor(name) {
	if (KEYS[name]) return KEYS[name];
	if (name === 'Control+A') return { key: 'a', code: 'KeyA', vk: 65, modifiers: 2, commands: ['selectAll'] };
	return null;
}

/**
 * The driver for real Obsidian over raw CDP (obsidian-camera.mjs --docs). Same interface as the
 * Playwright driver, so `runGifSteps` cannot tell them apart. Inputs are REAL: pointer clicks
 * through `Input.dispatchMouseEvent` (move, press, release — hover and focus fire, unlike
 * `el.click()`) and key events through `Input.dispatchKeyEvent`.
 *
 *   call(method, params)   CDP call on the main target
 *   evaluate(expr)         Runtime.evaluate (awaits promises), returns the value
 *   sleep(ms)
 *   rootExpr               JS expression yielding the element root (selectors resolve inside it)
 *   notePath               vault path of the note the element lives in — `write: true` polls
 *                          its text (a block write is the note text changing)
 *   dpr                    capture scale
 *   cursor                 synthetic pointer overlay (default true)
 * Call `await driver.install()` before the first step and `await driver.dispose()` after.
 */
export function createCdpDriver({ call, evaluate, sleep, rootExpr, notePath, dpr = 2, cursor = true }) {
	const q = JSON.stringify;
	const installJs = `(() => {
		const root = () => (${rootExpr});
		const scopes = (sel) => (sel.startsWith('modal:') ? [...document.querySelectorAll('.dse-modal')] : [root()]);
		const inner = (sel) => (sel.startsWith('modal:') ? sel.slice(6).trim() : sel);
		window.__sc411 = {
			all(sel) { return scopes(sel).flatMap((sc) => (sc ? [...sc.querySelectorAll(inner(sel))] : [])); },
			one(sel) {
				const hits = this.all(sel);
				if (hits.length !== 1) throw new Error(sel + ': ' + hits.length + ' matches (a step selector must match exactly one node)');
				return hits[0];
			},
			point(sel) {
				const el = this.one(sel);
				const r = el.getBoundingClientRect();
				if (r.width <= 0 || r.height <= 0) throw new Error(sel + ' has no box (not visible)');
				const x = r.x + r.width / 2, y = r.y + r.height / 2;
				if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) throw new Error(sel + ' is outside the window');
				const hit = document.elementFromPoint(x, y);
				if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) throw new Error(sel + ' is covered by ' + (hit ? hit.tagName + '.' + hit.className : 'nothing'));
				return { x, y };
			},
			rect() {
				const boxes = [root(), ...document.querySelectorAll('.dse-modal')].filter(Boolean).map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
				const x0 = Math.min(...boxes.map((r) => r.left)), y0 = Math.min(...boxes.map((r) => r.top));
				const x1 = Math.max(...boxes.map((r) => r.right)), y1 = Math.max(...boxes.map((r) => r.bottom));
				return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
			},
			parkSpot() {
				const spots = [[window.innerWidth - 3, window.innerHeight - 3], [3, window.innerHeight - 3], [window.innerWidth - 3, 3], [3, 3]];
				const dirty = (el) => !el || el.closest('.dse-modal') || (root() && root().contains(el));
				return spots.find(([x, y]) => !dirty(document.elementFromPoint(x, y))) ?? null;
			},
		};
		const st = document.createElement('style');
		st.id = 'sc411-style';
		st.textContent = ${q(FREEZE_CSS)} + ${q(cursor ? CURSOR_CSS : '')};
		document.head.appendChild(st);
		if (${cursor}) {
			const c = document.createElement('div');
			c.id = 'sc411-cursor';
			c.style.display = 'none';
			document.body.appendChild(c);
		}
	})()`;
	const mouse = (type, x, y) =>
		call('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
	const point = (sel) => evaluate(`window.__sc411.point(${q(sel)})`);
	const moveCursor = async ({ x, y }) => {
		if (!cursor) return;
		await evaluate(`(() => { const c = document.getElementById('sc411-cursor'); c.style.display = 'block'; c.style.transform = 'translate(${Math.round(x)}px, ${Math.round(y)}px)'; })()`);
	};
	const settle = () => evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 80))))');
	const keyDown = (e, text) => call('Input.dispatchKeyEvent', { type: 'keyDown', key: e.key, code: e.code, windowsVirtualKeyCode: e.vk, modifiers: e.modifiers ?? 0, ...(e.commands ? { commands: e.commands } : {}), ...(text ? { text } : {}) });
	const keyUp = (e) => call('Input.dispatchKeyEvent', { type: 'keyUp', key: e.key, code: e.code, windowsVirtualKeyCode: e.vk, modifiers: e.modifiers ?? 0 });
	return {
		install: () => evaluate(installJs),
		async dispose() {
			await evaluate(`(() => { document.getElementById('sc411-style')?.remove(); document.getElementById('sc411-cursor')?.remove(); delete window.__sc411; })()`).catch(() => {});
		},
		async click(sel) {
			const p = await point(sel);
			await moveCursor(p);
			await mouse('mouseMoved', p.x, p.y);
			await mouse('mousePressed', p.x, p.y);
			await mouse('mouseReleased', p.x, p.y);
		},
		async hover(sel) {
			const p = await point(sel);
			await moveCursor(p);
			await mouse('mouseMoved', p.x, p.y);
		},
		async type(text, { into, select } = {}) {
			if (into) {
				await evaluate(`(() => { const el = window.__sc411.one(${q(into)}); el.focus(); ${select ? 'el.select?.();' : ''} })()`);
			} else if (select) {
				const e = keyEventFor('Control+A');
				await keyDown(e);
				await keyUp(e);
			}
			for (const ch of text) {
				const e = { key: ch, code: ch === ' ' ? 'Space' : /[a-z]/i.test(ch) ? `Key${ch.toUpperCase()}` : /[0-9]/.test(ch) ? `Digit${ch}` : '', vk: ch.toUpperCase().charCodeAt(0) };
				await keyDown(e, ch);
				await keyUp(e);
			}
		},
		async press(name) {
			const e = keyEventFor(name);
			if (!e) throw new Error(`press: unsupported key ${q(name)} (known: ${[...Object.keys(KEYS), 'Control+A'].join(', ')})`);
			await keyDown(e);
			await keyUp(e);
		},
		async waitFor(sel) {
			const t0 = Date.now();
			while (!(await evaluate(`window.__sc411.all(${q(sel)}).length > 0`))) {
				if (Date.now() - t0 > 5000) throw new Error(`${sel} did not appear within 5000 ms`);
				await sleep(50);
			}
		},
		// A block write IS the note's text changing: the mark is the text now.
		writeMark: () => evaluate(`window.app.vault.adapter.read(${q(notePath)})`),
		async waitWrite(mark, timeoutMs) {
			const t0 = Date.now();
			while ((await evaluate(`window.app.vault.adapter.read(${q(notePath)})`)) === mark) {
				if (Date.now() - t0 > timeoutMs) {
					throw new Error(`write: true, but ${notePath} did not change within ${timeoutMs} ms (the script is wrong, or the product is)`);
				}
				await sleep(50);
			}
			// The write (PERSIST_DEBOUNCE_MS ~400 ms in) re-renders the section and the view adopts
			// the new body; frames must not be taken mid-adoption.
			await sleep(500);
			await settle();
		},
		async prepareFrame({ park }) {
			await evaluate(`(async () => { document.querySelectorAll('.notice, .tooltip').forEach((n) => n.remove()); await document.fonts.ready; })()`);
			if (park !== false) {
				const spot = await evaluate('window.__sc411.parkSpot()');
				if (!spot) throw new Error('no window corner outside the element/modal to park the pointer in');
				await mouse('mouseMoved', spot[0], spot[1]);
			}
			// Blur a focused BUTTON-like control (a modal autofocuses its first chip). Whether that
			// control paints a `:focus-visible` ring is decided by Chromium from process-wide input
			// history, so the same modal had its ring in one capture and not in another (measured: the
			// montage sheet's "Success" chip, 1 935 px, between a lone `--only` run and a full
			// `docs-shots` run, and between consecutive captures in one session). Text entry stays
			// focused: its ring is part of what a typing frame shows, and it always paints.
			await evaluate(`(() => {
				const a = document.activeElement;
				if (a && a !== document.body && !a.matches('input, textarea, select, [contenteditable]')) a.blur();
			})()`);
			await settle();
			// A tooltip can be created between the removal above and the parked pointer leaving.
			await evaluate(`document.querySelectorAll('.notice, .tooltip').forEach((n) => n.remove())`);
		},
		rectOf: () => evaluate('window.__sc411.rect()'),
		async screenshotPng() {
			const vp = await evaluate('({ w: window.innerWidth, h: window.innerHeight })');
			const res = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: vp.w, height: vp.h, scale: dpr } });
			return Buffer.from(res.data, 'base64');
		},
	};
}
