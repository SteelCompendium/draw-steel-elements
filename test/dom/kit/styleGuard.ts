// Plan 09 Task 0 — the shared kit `.style` guard, reconciled to kit-index.test.ts's
// tsColorFindings shape. The original per-file guards banned ALL `.style` access, but
// the D2 Global Constraint explicitly ALLOWS `el.style.setProperty('--dse-*', value)`
// for dynamic GEOMETRY (--dse-fill, --dse-value-scale, …) — the Plan 09 Task 3/4/9
// widgets drive clip-path/scale geometry through custom properties. So:
//   - inline COLOR stays banned: .style.color, color-ish props, color literals;
//   - setProperty on a `--dse-*` custom property is the ONE allowed .style use;
//   - any OTHER .style access is still banned (the original guard's intent).
// Imported by the per-file hygiene guards (iconButton/collapsible2/cardHead.test.ts).

export function styleGuardFindings(src: string): string[] {
	const findings: string[] = [];
	// Comments never style anything; the ALLOWED geometry writes are blanked out so
	// the blanket `.style` scan below only sees what is NOT the escape hatch.
	const code = src
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '')
		.replace(/\.style\.setProperty\(\s*(['"`])--dse-[^'"`]*\1\s*,/g, '');
	if (/\.style\.color\b/.test(code)) findings.push('el.style.color inline style');
	if (/\.style\.(?:background|backgroundColor|borderColor|fill|outline)\b/.test(code)) {
		findings.push('inline color-ish style assignment');
	}
	if (/\.style\b/.test(code)) findings.push('non-geometry .style access');
	if (/#[0-9a-fA-F]{3,8}\b/.test(code)) findings.push('hex color literal');
	if (/\b(?:(?:rgb|hsl)a?|hwb|lab|lch|oklab|oklch|color)\(/.test(code)) {
		findings.push('color-function literal');
	}
	if (
		/\b(?:red|green|blue|limegreen|deepskyblue|crimson|yellow|orange|white|black|grey|gray)\b/i.test(
			code,
		)
	) {
		findings.push('named color literal');
	}
	return findings;
}
