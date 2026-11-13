// SC-586 — resolve a condition colour to the `#rrggbb` a native <input type="color"> holds.
//
// Lives beside conditionColor.ts, not in it: that file is under a source guard that bans any `.style` access, because its
// job is to keep user colour OUT of inline styles (SC-5). This helper does write a colour to an inline style — but only a
// colour `isConditionColor` already validated, on a hidden throwaway probe that is removed before it can paint — to make the
// browser's own parser do the work. It never touches a visible element.
import { isConditionColor } from './conditionColor';

/**
 * The `#rrggbb` (lowercase) a native `<input type="color">` can hold for any colour `isConditionColor` accepts: a CSS
 * name, `#rgb`, `#rrggbb`, `rgb()`/`hsl()` in any case. The browser does the parsing: the colour is set on a throwaway
 * hidden element and read back as its computed `rgb()`/`rgba()` value (the same engine that decides `CSS.supports`, so
 * it can never disagree with `isConditionColor`). Alpha is dropped, since the native input has none. `undefined` for
 * anything that does not resolve to a plain rgb triple (an unparseable string, or `inherit`, which stays itself).
 */
export function conditionColorHex(color: string | undefined, doc: Document = document): string | undefined {
	if (!isConditionColor(color) || !doc.body || !doc.defaultView) return undefined;
	const probe = doc.body.appendChild(doc.createElement('span'));
	try {
		probe.style.display = 'none';
		probe.style.color = color;
		const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(doc.defaultView.getComputedStyle(probe).color);
		if (!rgb) return undefined;
		return '#' + rgb.slice(1, 4).map((n) => Math.min(255, Math.round(Number(n))).toString(16).padStart(2, '0')).join('');
	} finally {
		probe.remove();
	}
}
