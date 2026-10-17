// visual-harness/gif-encode.mjs — SC-411: PNG frames -> one animated GIF, pure JS and
// deterministic (`gifenc` 1.0.3 + `pngjs` 7.0.0, exact-pinned devDependencies; no ffmpeg, no
// system binary — a fresh clone + devbox is enough).
//
//     encodeGif(frames, holds, crop) -> Uint8Array
//       frames  PNG buffers, all the same size (the camera's full-viewport screenshots)
//       holds   ms each frame stays on screen (same length as `frames`)
//       crop    { x, y, w, h } in device pixels — the same box is cut from every frame
//
// WHY THESE CHOICES (all measured in the SC-411 r1 encoder spike):
//   - ONE global palette (255 colours + a reserved transparent index). A per-frame local
//     palette is 5x the bytes (1.19 MB vs 216 kB for the same 19 frames).
//   - The palette is built from SAMPLED pixels, not the concatenated frames: whole-frame
//     concatenation peaked at 607 MB RSS at 2x. Sampling is a fixed stride, so it is
//     deterministic; every pixel that CHANGED between consecutive frames is sampled in full,
//     because those are the new UI colours (a one-pixel amber tick must not be lost to the
//     stride).
//   - Transparent-diff frames with dispose=1: after the first frame only the pixels that
//     changed are painted, everything else is the reserved transparent index.
//   - Consecutive identical frames (after the crop) are MERGED and their holds ADDED — a hold
//     is a delay, never a duplicate frame.
//   - No randomness anywhere: identical frames give a byte-identical GIF.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

/** The palette index reserved for "unchanged since the previous frame". */
const TRANSPARENT = 255;
/** Palette-sampling stride over the first frame (every Nth pixel). */
const SAMPLE_STRIDE = 4;
/** Cap on the changed pixels sampled from one frame (a full-frame change falls back to a
 *  stride so a scene change cannot blow the sample up). */
const MAX_CHANGED_SAMPLES = 400_000;

/** Decode a PNG buffer and cut `crop` out of it -> RGBA bytes (w*h*4). Throws if the crop
 *  does not fit inside the image, rather than encoding a quietly-short frame. */
export function decodeCropped(pngBuffer, crop) {
	const png = PNG.sync.read(pngBuffer);
	const { x, y, w, h } = crop;
	if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > png.width || y + h > png.height) {
		throw new Error(`gif crop ${JSON.stringify(crop)} does not fit inside the ${png.width}x${png.height} frame`);
	}
	const out = new Uint8Array(w * h * 4);
	for (let row = 0; row < h; row++) {
		const src = ((y + row) * png.width + x) * 4;
		out.set(png.data.subarray(src, src + w * 4), row * w * 4);
	}
	return out;
}

function sameBytes(a, b) {
	return a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.length), Buffer.from(b.buffer, b.byteOffset, b.length)) === 0;
}

/** Merge consecutive identical frames; their holds add. Returns [{ px, delay }]. */
export function mergeIdentical(rgbaFrames, holds) {
	const merged = [];
	rgbaFrames.forEach((px, i) => {
		const hold = holds[i];
		const prev = merged[merged.length - 1];
		if (prev && sameBytes(prev.px, px)) prev.delay += hold;
		else merged.push({ px, delay: hold });
	});
	return merged;
}

/** The pixels the palette is learned from (see the header). RGBA, 4 bytes per sample. */
function samplePixels(merged) {
	const parts = [];
	const first = merged[0].px;
	const base = new Uint8Array(Math.ceil(first.length / 4 / SAMPLE_STRIDE) * 4);
	let n = 0;
	for (let p = 0; p < first.length; p += 4 * SAMPLE_STRIDE) {
		base.set(first.subarray(p, p + 4), n);
		n += 4;
	}
	parts.push(base.subarray(0, n));
	for (let f = 1; f < merged.length; f++) {
		const cur = merged[f].px;
		const prev = merged[f - 1].px;
		let changed = 0;
		for (let p = 0; p < cur.length; p += 4) {
			if (cur[p] !== prev[p] || cur[p + 1] !== prev[p + 1] || cur[p + 2] !== prev[p + 2]) changed++;
		}
		const stride = Math.max(1, Math.ceil(changed / MAX_CHANGED_SAMPLES));
		const buf = new Uint8Array(Math.ceil(changed / stride) * 4 + 4);
		let m = 0;
		let seen = 0;
		for (let p = 0; p < cur.length; p += 4) {
			if (cur[p] === prev[p] && cur[p + 1] === prev[p + 1] && cur[p + 2] === prev[p + 2]) continue;
			if (seen++ % stride === 0) {
				buf.set(cur.subarray(p, p + 4), m);
				m += 4;
			}
		}
		parts.push(buf.subarray(0, m));
	}
	const total = parts.reduce((a, b) => a + b.length, 0);
	const all = new Uint8Array(total);
	let off = 0;
	for (const part of parts) {
		all.set(part, off);
		off += part.length;
	}
	return all;
}

/** Encode already-decoded, same-sized RGBA frames. Exported for the camera paths that
 *  decode once (to write review frames) and for the unit tests. */
export function encodeRgbaGif(rgbaFrames, holds, width, height) {
	if (rgbaFrames.length === 0) throw new Error('encodeGif: no frames');
	if (holds.length !== rgbaFrames.length) {
		throw new Error(`encodeGif: ${rgbaFrames.length} frames but ${holds.length} holds`);
	}
	const merged = mergeIdentical(rgbaFrames, holds);
	const palette = quantize(samplePixels(merged), 255, { format: 'rgb565' });
	while (palette.length < 255) palette.push([0, 0, 0]);
	const colours = palette.slice(0, 255);
	const globalPalette = [...colours, [255, 0, 255]]; // slot 255 is never displayed
	const gif = GIFEncoder();
	let prevIdx = null;
	for (const m of merged) {
		const idx = applyPalette(m.px, colours, 'rgb565');
		let out = idx;
		if (prevIdx) {
			out = new Uint8Array(idx.length);
			for (let p = 0; p < idx.length; p++) out[p] = idx[p] === prevIdx[p] ? TRANSPARENT : idx[p];
		}
		gif.writeFrame(out, width, height, {
			palette: prevIdx ? undefined : globalPalette,
			delay: m.delay,
			transparent: prevIdx !== null,
			transparentIndex: TRANSPARENT,
			dispose: 1,
		});
		prevIdx = idx;
	}
	gif.finish();
	return gif.bytes();
}

/** PNG frames -> GIF bytes. See the header. */
export function encodeGif(frames, holds, crop) {
	const rgba = frames.map((png) => decodeCropped(png, crop));
	return encodeRgbaGif(rgba, holds, crop.w, crop.h);
}
