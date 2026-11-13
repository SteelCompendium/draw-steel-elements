// SC-586 — resolve a condition colour to the `#rrggbb` a native <input type="color"> holds.
//
// Lives beside conditionColor.ts, not in it: that file is under a source guard that bans any `.style` access, because its
// job is to keep user colour OUT of inline styles (SC-5). This helper does write a colour to an inline style — but only a
// colour `isConditionColor` already validated, on a hidden throwaway probe that is removed before it can paint — to make the
// browser's own parser do the work. It never touches a visible element.
import { isConditionColor } from './conditionColor';

/**
 * The `#rrggbb` (lowercase) a native `<input type="color">` can hold for any colour `isConditionColor` accepts: a CSS
 * name, `#rgb`, `#rrggbb`, `rgb()`/`hsl()` in any case, and the CSS Color 4 spellings. The browser does the parsing, in
 * two steps. (1) The colour is set on a throwaway hidden element and read back as its computed `rgb()`/`rgba()` value;
 * keywords such as `currentcolor`/`inherit` resolve against `<body>` there, not against the row. (2) `oklch()`, `lab()`,
 * `lch()`, `color()` and `color-mix()` keep their own syntax when computed, so that computed string is painted on a 1x1
 * canvas and the sRGB pixel is read back. Alpha is dropped, since the native input has none. `undefined` for an
 * unparseable string, and when step 2 has no 2D canvas context to use (jsdom).
 */
export function conditionColorHex(color: string | undefined, doc: Document): string | undefined {
	if (!isConditionColor(color) || !doc.body || !doc.defaultView) return undefined;
	const probe = doc.body.appendChild(doc.createElement('span'));
	try {
		probe.hidden = true;
		probe.style.color = color;
		const computed = doc.defaultView.getComputedStyle(probe).color;
		let rgb: number[] | undefined = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(computed)?.slice(1, 4).map(Number);
		if (!rgb) {
			// Paint the COMPUTED string (never the note's raw text): it is already a value the engine accepted.
			const canvas = doc.createElement('canvas');
			canvas.width = canvas.height = 1;
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			if (!ctx) return undefined;
			ctx.fillStyle = computed;
			ctx.fillRect(0, 0, 1, 1);
			rgb = Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
		}
		return '#' + rgb.map((n) => Math.min(255, Math.round(n)).toString(16).padStart(2, '0')).join('');
	} finally {
		probe.remove();
	}
}
