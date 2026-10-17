import { execFileSync } from 'child_process';
import path from 'path';

// SC-411 — visual-harness/gif-encode.mjs, the PNG-frames -> GIF encoder behind `npm run
// docs-shots`'s animated docs images. It is an ESM `.mjs` module and this repo's jest config has
// no ESM support (see obsidianAppCssPin.test.ts's header), so the tests spawn a real `node
// --input-type=module` process that builds synthetic PNG frames with pngjs, encodes them, and
// prints a JSON description of the resulting GIF (a small block-level parser lives in the
// spawned script — gifenc ships no decoder).

const repoRoot = path.resolve(__dirname, '../../..');
const encodeModule = path.join(repoRoot, 'visual-harness/gif-encode.mjs');

/** Run `body` (ESM source; `png(w,h,fn)`, `encodeGif`, `describe(bytes)` are in scope) and parse
 *  the last stdout line as JSON. */
function run(body: string): any {
	const code = `
		import { createRequire } from 'node:module';
		import crypto from 'node:crypto';
		import { encodeGif } from ${JSON.stringify(encodeModule)};
		const { PNG } = createRequire(import.meta.url)('pngjs');
		// A w x h PNG whose pixel (x,y) is fn(x,y) = [r,g,b].
		const png = (w, h, fn) => {
			const p = new PNG({ width: w, height: h });
			for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
				const [r, g, b] = fn(x, y);
				p.data.set([r, g, b, 255], (y * w + x) * 4);
			}
			return PNG.sync.write(p);
		};
		// Walk the GIF blocks: size, global-table flag, and per image { delayCs, transparent, dispose, local }.
		const describe = (bytes) => {
			const b = Buffer.from(bytes);
			const out = { header: b.subarray(0, 6).toString(), width: b.readUInt16LE(6), height: b.readUInt16LE(8), globalTable: !!(b[10] & 0x80), images: [], sha: crypto.createHash('sha256').update(b).digest('hex') };
			let p = 13 + (b[10] & 0x80 ? 3 * (1 << ((b[10] & 7) + 1)) : 0);
			let gce = null;
			while (b[p] !== 0x3b) {
				if (b[p] === 0x21) {
					if (b[p + 1] === 0xf9) gce = { dispose: (b[p + 3] >> 2) & 7, transparent: !!(b[p + 3] & 1), delayCs: b.readUInt16LE(p + 4), transparentIndex: b[p + 6] };
					p += 2;
					while (b[p] !== 0) p += b[p] + 1;
					p += 1;
				} else if (b[p] === 0x2c) {
					const local = !!(b[p + 9] & 0x80);
					out.images.push({ ...gce, local, w: b.readUInt16LE(p + 5), h: b.readUInt16LE(p + 7) });
					p += 10 + (local ? 3 * (1 << ((b[p + 9] & 7) + 1)) : 0) + 1;
					while (b[p] !== 0) p += b[p] + 1;
					p += 1;
				} else throw new Error('bad block ' + b[p] + ' at ' + p);
			}
			return out;
		};
		${body}
	`;
	const stdout = execFileSync('node', ['--input-type=module', '-e', code], { cwd: repoRoot, encoding: 'utf8' });
	return JSON.parse(stdout.trim().split('\n').pop() as string);
}

// Three 40x30 frames: a flat panel; the same panel with a red square; the same again.
const FRAMES = `
	const bg = (x, y) => [20 + (y % 3), 30, 40];
	const A = png(40, 30, bg);
	const B = png(40, 30, (x, y) => (x >= 10 && x < 20 && y >= 5 && y < 15 ? [220, 40, 40] : bg(x, y)));
`;

describe('SC-411 gif-encode — encodeGif(frames, holds, crop)', () => {
	it('is deterministic: the same frames give the same bytes, run after run', () => {
		const r = run(`${FRAMES}
			const crop = { x: 0, y: 0, w: 40, h: 30 };
			const a = encodeGif([A, B], [400, 600], crop);
			const b = encodeGif([A, B], [400, 600], crop);
			console.log(JSON.stringify({ same: Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0, ...describe(a) }));
		`);
		expect(r.same).toBe(true);
		expect(r.header).toBe('GIF89a');
		// A pinned digest: any change to the palette sampling / diff / merge rules shows up here.
		expect(r.sha).toBe('993df80403ba5e1951f797955b6f06e695a031c545ad11e9f60bac8a39ae2ecc');
	});

	it('merges consecutive identical frames and adds their delays', () => {
		const r = run(`${FRAMES}
			const bytes = encodeGif([A, A, B, B, B], [100, 200, 300, 400, 500], { x: 0, y: 0, w: 40, h: 30 });
			console.log(JSON.stringify(describe(bytes)));
		`);
		expect(r.images).toHaveLength(2);
		expect(r.images.map((i: any) => i.delayCs)).toEqual([30, 120]);
	});

	it('paints only changed pixels after the first frame: one global palette, a reserved transparent index, dispose=1', () => {
		const r = run(`${FRAMES}
			const bytes = encodeGif([A, B], [500, 500], { x: 0, y: 0, w: 40, h: 30 });
			console.log(JSON.stringify(describe(bytes)));
		`);
		expect(r.globalTable).toBe(true);
		expect(r.images.map((i: any) => i.local)).toEqual([false, false]);
		expect(r.images.map((i: any) => i.transparent)).toEqual([false, true]);
		expect(r.images[1].transparentIndex).toBe(255);
		expect(r.images.map((i: any) => i.dispose)).toEqual([1, 1]);
	});

	it('cuts the crop box out of every frame, and refuses a box that runs off the frame', () => {
		const r = run(`${FRAMES}
			const ok = describe(encodeGif([A, B], [500, 500], { x: 5, y: 2, w: 20, h: 16 }));
			let err = null;
			try { encodeGif([A], [500], { x: 30, y: 0, w: 20, h: 10 }); } catch (e) { err = String(e.message); }
			console.log(JSON.stringify({ w: ok.width, h: ok.height, err }));
		`);
		expect([r.w, r.h]).toEqual([20, 16]);
		expect(r.err).toMatch(/does not fit inside the 40x30 frame/);
	});

	it('rejects a holds array that does not match the frames, and an empty frame list', () => {
		const r = run(`${FRAMES}
			const errs = [];
			for (const f of [() => encodeGif([A, B], [500], { x: 0, y: 0, w: 40, h: 30 }), () => encodeGif([], [], { x: 0, y: 0, w: 40, h: 30 })]) {
				try { f(); errs.push(null); } catch (e) { errs.push(String(e.message)); }
			}
			console.log(JSON.stringify(errs));
		`);
		expect(r[0]).toMatch(/2 frames but 1 holds/);
		expect(r[1]).toMatch(/no frames/);
	});
});
