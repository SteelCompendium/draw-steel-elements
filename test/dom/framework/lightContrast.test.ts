// SC-196 — the light scheme's STATE palette must clear WCAG 2.1, and stay clear.
//
// The audit that produced these numbers is a real browser sweep (workspace
// `.superpowers/sdd/sc196-light-contrast/sc196-contrast-audit.mjs`): it walks every node
// of every non-print harness capture, finds the ones painting a `--dse-*` state token,
// screenshots each node's box with its ink forced transparent to read the EFFECTIVE
// ground out of real pixels, and composites the computed ink over it at the node's
// cumulative `opacity`. That is where the `ground` and `opacity` columns below come
// from — they are measurements, not guesses, and each row names the surface it was
// measured on.
//
// What this file adds is the guard. The sweep needs Chromium and ~7 minutes; this test
// re-derives the same ratio arithmetically from the value DECLARED in
// `styles-source.css`, so any future edit that lightens one of these tokens back toward
// its dark value fails in jest, in a second, with the surface named.
//
// It deliberately pins the ratio as well as the threshold: a token that drifts from
// 4.85:1 to 4.55:1 still "passes", but it has spent the margin the fix was chosen to
// carry, and the pin makes that visible instead of silent.
//
// Dark is NOT pinned here. The ticket's standing instruction is to prefer a
// light-scheme override to changing the dark values people already like, and the dark
// scheme has its own open misses (recorded in the audit table, reference only).
import * as fs from 'fs';
import * as path from 'path';

const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

/** Body of the `.theme-light :is([data-dse-element], .dse-modal)[data-dse-theme="steel"]` block. */
function steelLightBlockBody(): string {
	const m = sheet.match(
		/(?:^|\n)[ \t]*\.theme-light\s+:is\(\[data-dse-element\], \.dse-modal\)\[data-dse-theme="steel"\][ \t]*\{([^}]*)\}/,
	);
	if (!m) throw new Error('Steel LIGHT variant block not found in styles-source.css');
	return m[1];
}

function lightValue(name: string): string {
	const m = steelLightBlockBody().match(
		new RegExp(`(?:^|[\\s{;])--dse-${name}\\s*:\\s*([^;]+);`),
	);
	if (!m) throw new Error(`--dse-${name} is not declared in the Steel light block`);
	return m[1].trim();
}

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
	const h = hex.trim().replace(/^#/, '');
	const full =
		h.length === 3
			? h
					.split('')
					.map((c) => c + c)
					.join('')
			: h;
	if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
	return [
		parseInt(full.slice(0, 2), 16),
		parseInt(full.slice(2, 4), 16),
		parseInt(full.slice(4, 6), 16),
	];
}

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: RGB): number {
	const ch = (c: number) => {
		const x = c / 255;
		return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(a: RGB, b: RGB): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/** Alpha-composite `ink` over `ground` — how a group `opacity` actually reaches the eye. */
function composite(ink: RGB, ground: RGB, alpha: number): RGB {
	return ink.map((c, i) => Math.round(alpha * c + (1 - alpha) * ground[i])) as RGB;
}

/** One measured worst case per token: the DARKEST ground it was measured against. */
interface Pin {
	/** `--dse-<token>` in the Steel light block. */
	token: string;
	/** Effective ground, sampled from real pixels in the capture named by `surface`. */
	ground: string;
	/** Cumulative `opacity` at the node (SC-183's spent row dims the instrument to .82). */
	opacity: number;
	/** WCAG threshold: 4.5 body text, 3.0 large text or non-text mark. */
	threshold: number;
	/** Ratio the sweep measured after the fix. Pinned so the margin cannot quietly erode. */
	measured: number;
	/** The surface it was measured on, so a failure says WHERE to look. */
	surface: string;
	/** The pre-SC-196 value, which inherited the dark scheme — the can-fail control. */
	wasDark: string;
}

const PINS: Pin[] = [
	{
		token: 'stamina-healthy',
		ground: '#f2f2f2',
		opacity: 1,
		threshold: 4.5,
		measured: 4.71,
		surface: '.dse-init__stamina[data-state="healthy"] — initiative-fight, spent row',
		wasDark: '#5cc98a',
	},
	{
		token: 'stamina-healthy',
		ground: '#d7d7d7',
		opacity: 1,
		threshold: 3.0,
		measured: 3.66,
		surface: '.dse-init__turn[data-taken] svg fill — initiative-fight',
		wasDark: '#5cc98a',
	},
	{
		token: 'stamina-winded',
		ground: '#eeefef',
		opacity: 1,
		threshold: 4.5,
		measured: 4.85,
		surface: '.dse-init__state[data-state="winded"] chip — initiative-roster',
		wasDark: '#f0b429',
	},
	{
		token: 'stamina-winded',
		ground: '#dddede',
		opacity: 1,
		threshold: 3.0,
		measured: 4.14,
		surface: '.dse-stamina__gpour — initiative-fight',
		wasDark: '#f0b429',
	},
	{
		token: 'stamina-dying',
		ground: '#e1e2e2',
		opacity: 1,
		threshold: 4.5,
		measured: 4.61,
		surface: '.dse-init__cell-stamina[data-state="dead"] — initiative-fight',
		wasDark: '#e74c3c',
	},
	{
		token: 'stamina-temp',
		ground: '#e6e8e8',
		opacity: 0.82,
		threshold: 4.5,
		measured: 4.65,
		surface: '.dse-stamina__ctemp — initiative-fight, spent row (opacity .82)',
		wasDark: '#7c5cd6',
	},
	{
		token: 'tier-crit',
		ground: '#edf0f0',
		opacity: 1,
		threshold: 3.0,
		measured: 7.57,
		surface: ".dse-pr__row[data-tier='crit'] spine — negotiation",
		wasDark: '#e0b050',
	},
	{
		token: 'turn-done',
		ground: '#d7d7d7',
		opacity: 1,
		threshold: 3.0,
		measured: 3.66,
		surface: '.dse-init__turn[data-taken] svg fill — initiative-fight',
		wasDark: '#5cc98a',
	},
	{
		token: 'malice',
		ground: '#f5f7f7',
		opacity: 1,
		threshold: 4.5,
		measured: 4.91,
		surface: '.dse-init__malice-value — initiative',
		wasDark: '#e0584b',
	},
	{
		token: 'vp',
		ground: '#eaeeef',
		opacity: 1,
		threshold: 4.5,
		measured: 7.43,
		surface: '.dse-prj__log-badge on a breakthrough row — project',
		wasDark: '#e0b050',
	},
	{
		token: 'warn',
		ground: '#edf0f0',
		opacity: 1,
		threshold: 4.5,
		measured: 5.25,
		surface: '.dse-mt__outcome[data-outcome="failure"] — montage',
		wasDark: '#e8954a',
	},
	{
		// SC-196 round 2. Ground is the initiative cell's own interior, which is the
		// adjacency the ring has to be discernible against (WCAG 1.4.11).
		token: 'select',
		ground: '#dddddd',
		opacity: 1,
		threshold: 3.0,
		measured: 4.08,
		surface: '.dse-init__cell[data-selected] ring — initiative-cell-selected',
		wasDark: '#e0584b',
	},
	{
		token: 'danger',
		ground: '#e1e2e2',
		opacity: 1,
		threshold: 4.5,
		measured: 4.61,
		surface: 'shares stamina-dying: .dse-btn--danger / killed minion row ink',
		wasDark: '#e74c3c',
	},
];

/**
 * The ink `--dse-turn-done` has to carry, since that token is used as a FILL with
 * `--dse-surface` painted on top of it (`.dse-init__turn[data-taken] svg`). Darkening a
 * fill can break the ink riding it, so the mirror case is pinned beside the fill's own.
 */
const FILL_INK = [
	{
		fill: 'turn-done',
		ink: 'surface',
		threshold: 4.5,
		measured: 4.94,
		surface: '.dse-init__turn[data-taken] svg — glyph ink over the turn-taken fill',
	},
	{
		// SC-196 round 2, the other half of the joint `--dse-select` solve. This row is
		// behind the default-OFF `rollingEnabled` pref, so it renders in NO harness
		// capture and this number is arithmetic rather than a measured shot — which is
		// exactly why it is pinned here.
		fill: 'select',
		ink: 'accent-fg',
		threshold: 4.5,
		measured: 5.55,
		surface: ".dse-pr__row[data-dse-roll-result='active'] — row ink over the select fill",
	},
];

/**
 * INTER-TOKEN separation. Round 1 solved every token against its own ground in isolation
 * and three families of CO-LOCATED tokens collapsed into each other as a result — the
 * four tier spines came within 1.5:1, and `vp`/`warn` (which paint the same element
 * class) within 1.02:1. Meaning survived, because each of those surfaces also carries a
 * word, but the colour channel that told them apart did not, and lightness is the channel
 * that survives for a colourblind reader. These pins are the constraint round 1 lacked.
 */
const SEPARATION: { a: string; b: string; min: number; measured: number; why: string }[] = [
	{
		a: 'tier-crit',
		b: 'tier-mid',
		min: 1.6,
		measured: 2.36,
		why: 'four tier spines stack in one power-roll panel; crit must read as the exceptional row',
	},
	{ a: 'tier-crit', b: 'tier-low', min: 1.5, measured: 1.6, why: 'same stack' },
	{ a: 'tier-crit', b: 'tier-high', min: 1.5, measured: 1.84, why: 'same stack' },
	{
		a: 'vp',
		b: 'warn',
		min: 1.3,
		measured: 1.44,
		why: '.dse-mt__outcome paints both on the SAME class; .dse-enc__summary shows both in one row',
	},
];

describe('SC-196: the Steel LIGHT state palette clears WCAG on its measured grounds', () => {
	test.each(PINS)(
		'--dse-$token on $ground (opacity $opacity) clears $threshold:1 — $surface',
		({ token, ground, opacity, threshold, measured }) => {
			const g = hexToRgb(ground);
			const ink = composite(hexToRgb(lightValue(token)), g, opacity);
			const ratio = contrast(ink, g);
			expect(ratio).toBeGreaterThanOrEqual(threshold);
			// The margin is part of the fix, not a happy accident — pin it.
			expect(ratio).toBeCloseTo(measured, 1);
		},
	);

	test('CAN-FAIL PROOF: the pre-SC-196 (dark-inherited) value fails every one of those pins', () => {
		const survivors: string[] = [];
		for (const { token, ground, opacity, threshold, wasDark, surface } of PINS) {
			const g = hexToRgb(ground);
			const ratio = contrast(composite(hexToRgb(wasDark), g, opacity), g);
			if (ratio >= threshold) survivors.push(`${token} (${wasDark}) on ${ground} — ${surface}`);
		}
		// If this ever comes back non-empty, the pin above stopped testing anything:
		// the "before" value would already satisfy it.
		expect(survivors).toEqual([]);
	});

	test.each(FILL_INK)(
		'--dse-$ink stays legible ON the --dse-$fill fill — $surface',
		({ fill, ink, threshold, measured }) => {
			const ratio = contrast(hexToRgb(lightValue(ink)), hexToRgb(lightValue(fill)));
			expect(ratio).toBeGreaterThanOrEqual(threshold);
			expect(ratio).toBeCloseTo(measured, 1);
		},
	);

	test.each(SEPARATION)(
		'--dse-$a and --dse-$b stay $min:1 apart in light — $why',
		({ a, b, min, measured }) => {
			const ratio = contrast(hexToRgb(lightValue(a)), hexToRgb(lightValue(b)));
			expect(ratio).toBeGreaterThanOrEqual(min);
			expect(ratio).toBeCloseTo(measured, 1);
		},
	);

	test('vp and tier-crit are the SAME gold in light, as they are in dark (SC-106 identity)', () => {
		// Round 1 split them silently. If a future change has to move one, this test is
		// the place that says the other must move with it — or that the split is now
		// deliberate and this expectation should be replaced by a recorded reason.
		expect(lightValue('vp')).toBe(lightValue('tier-crit'));
	});

	test('every pinned token is declared in the light block as a 6-digit hex or #fff', () => {
		const names = new Set([
			...PINS.map((p) => p.token),
			...FILL_INK.flatMap((f) => [f.fill, f.ink]),
			...SEPARATION.flatMap((s) => [s.a, s.b]),
		]);
		for (const token of names) {
			expect(lightValue(token)).toMatch(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
		}
	});

	test('the active roll row takes its own light ink, Steel-scoped and print-excluded', () => {
		// The joint half of the select solve. It must exist, must be scoped so it cannot
		// reach the frozen print class, and must paint the accent-fg role — a bare
		// `--dse-fg` there measures 2.46:1 on the new fill.
		const m = sheet.match(
			/body\.theme-light[\s\S]{0,200}?\.dse-pr__row\[data-dse-roll-result='active'\]\s*\{([^}]*)\}/,
		);
		expect(m).not.toBeNull();
		expect(m?.[0]).toContain(":not([data-dse-print=\"on\"])");
		expect(m?.[0]).toContain("[data-dse-theme='steel']");
		expect(m?.[1]).toContain('color: var(--dse-accent-fg)');
	});

	test('the gauge zero-bulkhead keeps a lit catch-light face against every pour (review L-2)', () => {
		// `--dse-metal-bright` is an INK grade in the light block (#2c3338); this face is
		// not text, it is the lit side of a machined edge sitting ON the pour, so the
		// light scheme re-declares it to the BRIGHT metal grade for this element only.
		const m = sheet.match(
			/body\.theme-light[\s\S]{0,120}?\.dse-stamina__gidx--zero\s*\{([^}]*)\}/,
		);
		expect(m).not.toBeNull();
		const face = hexToRgb((m?.[1].match(/color:\s*(#[0-9a-f]{6})/i) ?? [])[1] ?? '#000000');
		for (const pour of ['stamina-healthy', 'stamina-winded', 'stamina-dying']) {
			expect(contrast(face, hexToRgb(lightValue(pour)))).toBeGreaterThanOrEqual(3.0);
		}
	});

	test('the light tier wash twin exists for ALL FOUR tiers, crit included (SC-196)', () => {
		// `--tw` is the static, pre-`color-mix()` twin of each tier row's 8% wash. crit
		// had no light twin because crit had no light value; now it has both, and the
		// twin must carry crit's LIGHT rgb or the wash and the spine disagree.
		const crit = hexToRgb(lightValue('tier-crit'));
		const want = `rgba(${crit[0]}, ${crit[1]}, ${crit[2]}, 0.08)`;
		const m = sheet.match(
			/body\.theme-light[\s\S]{0,220}?\.dse-pr__row\[data-tier='crit'\]\s*\{([^}]*)\}/,
		);
		expect(m).not.toBeNull();
		expect(m?.[1]).toContain(want);
	});
});
