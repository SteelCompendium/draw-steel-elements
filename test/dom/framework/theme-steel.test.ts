// D3 Plan 10 Task 3 — the Steel theme value block ([data-dse-theme="steel"]).
//
// D3 authors the --dse-* VALUE layer on top of D2's Legacy base. Task 3 adds the
// [data-dse-element][data-dse-theme="steel"] override block that swaps the look to
// High-Fantasy Steel. Values are transcribed VERBATIM from the authoritative token
// map (docs/superpowers/dse-overhaul/D3-token-map.md, "Steel value (dark)" column) —
// never re-decided here; this test pins the transcription.
//
// jsdom's getComputedStyle does not cascade custom properties from a <style> sheet
// (nor resolve var()), so — exactly like test/dom/kit/tokens.test.ts — we assert the
// DECLARED values by parsing styles-source.css: the Legacy value from the unscoped
// :root base, the Steel value from the scoped override block. A mounted root then
// demonstrates the attribute-selector semantics the cascade relies on (the Steel
// block matches iff data-dse-theme="steel"; without it, only the Legacy base does).
import * as fs from 'fs';
import * as path from 'path';
import { DSE_TOKEN_NAMES } from '../../../src/framework/tokens';

const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

/** Declared value of --dse-<name> in the unscoped :root Legacy base (or undefined). */
function baseValue(name: string): string | undefined {
	for (const block of sheet.matchAll(/:root\s*\{([^}]*)\}/g)) {
		const m = block[1].match(new RegExp(`(?:^|[\\s{;])--dse-${name}\\s*:\\s*([^;]+);`));
		if (m) return m[1].trim();
	}
	return undefined;
}

/**
 * Body of the DARK Steel override block. Anchored to the start of a line so the
 * T4 light variant (`.theme-light [data-dse-element][data-dse-theme="steel"]`),
 * which shares the trailing selector, is NOT captured here.
 */
function steelBlockBody(): string {
	const m = sheet.match(
		/(?:^|\n)[ \t]*\[data-dse-element\]\[data-dse-theme="steel"\][ \t]*\{([^}]*)\}/,
	);
	if (!m) throw new Error('Steel override block [data-dse-theme="steel"] not found in styles-source.css');
	return m[1];
}

/** Declared value of --dse-<name> inside the Steel block, or undefined if absent. */
function steelValue(name: string): string | undefined {
	const m = steelBlockBody().match(new RegExp(`(?:^|[\\s{;])--dse-${name}\\s*:\\s*([^;]+);`));
	return m ? m[1].trim() : undefined;
}

/** All --dse-* names DEFINED (not var()-referenced) in the Steel block. */
function steelDefinitions(): string[] {
	const defs: string[] = [];
	for (const d of steelBlockBody().matchAll(/(?:^|[\s{;])--dse-([a-z0-9-]+)\s*:/g)) defs.push(d[1]);
	return defs;
}

/**
 * Tokens the map marks "= Legacy (theme-invariant)" — deliberately ABSENT from the
 * Steel block so the base value flows through. NB radius (0.4em) and crest-shape
 * (polygon) are NOT here: the map gives them concrete Steel values (they differ
 * from Legacy), so Steel overrides them.
 */
// SC-10: badge-fg joined the invariants — the tier-badge frame is a hollow
// clip-path whose interior is the card surface, so its ink is ink-on-surface
// (var(--dse-fg)) in EVERY theme; the old per-theme overrides assumed solid
// fills and rendered invisible (ground-truth-confirmed, Plan 12).
const THEME_INVARIANT = ['page-bg', 'pad', 'touch-min', 'font-mono', 'rule-fade', 'badge-fg'] as const;

/**
 * The authoritative Steel (dark) values — transcribed from D3-token-map.md. A
 * representative slice across every category; the coverage test below checks the
 * remaining tokens are present (non-undefined), and Task 6 finalizes the full guard.
 */
const STEEL_DARK: Record<string, string> = {
	// surfaces
	surface: '#1a1e21',
	'surface-raised': '#22272b',
	'surface-sunken': 'rgba(220,226,230,0.06)',
	// borders / shape
	border: 'rgba(220,226,230,0.12)',
	'border-strong': 'rgba(220,226,230,0.24)',
	radius: '0.4em',
	hover: 'rgba(77,184,199,0.10)',
	'hairline-fade': 'linear-gradient(to right, var(--dse-rule), var(--dse-rule-fade))',
	// fg / text
	heading: 'rgba(220,226,230,0.95)',
	fg: 'rgba(220,226,230,0.88)',
	'fg-muted': 'rgba(220,226,230,0.62)',
	'fg-faint': 'rgba(220,226,230,0.38)',
	'chip-bg': 'rgba(220,226,230,0.06)',
	// fonts (OD-4: Source Serif 4 fallback)
	'font-display': '"Source Serif 4", var(--font-text)',
	// accent
	accent: '#4db8c7',
	'accent-fg': '#0f1214',
	'focus-ring': '#4db8c7',
	select: '#e0584b',
	// ornament
	'metal-grad': 'linear-gradient(180deg, #e3e7e9 0%, #a9b0b5 48%, #686f74 100%)',
	'metal-line': 'rgba(176,183,187,.5)',
	'metal-faint': 'rgba(176,183,187,.16)',
	// Plan 20 Task 3 — the material layer (site steel-redesign.css:15-16 +
	// steel-ability-cards.css:117/118/160).
	metal: '#a9b0b5',
	'metal-bright': '#d9dee1',
	sheen: 'linear-gradient(180deg, rgba(255,255,255,.07), rgba(0,0,0,.14))',
	'sheen-soft': 'linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,0))',
	'chip-bevel': 'inset 0 1px 0 rgba(255,255,255,.08), 0 1px 3px rgba(0,0,0,.3)',
	bevel: 'inset 0 1px 0 rgba(255,255,255,.07)',
	emboss: '0 1px 0 rgba(0,0,0,.55), 0 -1px 0 rgba(255,255,255,.04)',
	'card-bg': 'linear-gradient(160deg, #232a2e, #181c1f)',
	'crest-shape': 'polygon(6% 0, 94% 0, 94% 58%, 50% 100%, 6% 58%)',
	rule: 'var(--sc-steel, #8e959a)',
	// tiers
	'tier-low': 'var(--sc-tier-low, #e74c3c)',
	'tier-mid': 'var(--sc-tier-mid, #f0b429)',
	'tier-high': 'var(--sc-tier-high, #4caf6a)',
	'tier-crit': '#e3c14a',
	// stamina / HP
	'stamina-healthy': 'var(--sc-role-hexer, #5cc98a)',
	'stamina-winded': '#f0b429',
	'stamina-dying': '#e74c3c',
	// SC-10 Task 6 (taste #1, "match the site" 2026-07-19): flipped from the
	// D3 draft blue to purple — frees blue for --sc-act-maneuver, the site's
	// reserved action-type hue.
	'stamina-temp': '#7c5cd6',
	'stamina-track': 'rgba(220,226,230,0.06)',
	// encounter
	'turn-done': 'var(--sc-role-hexer, #5cc98a)',
	malice: '#e0584b',
	vp: '#e3c14a',
	warn: '#e8954a',
	danger: '#e74c3c',
	// combat-role accents (--sc-role-* verbatim)
	'role-controller': 'var(--sc-role-controller, #e0584b)',
	'role-hexer': 'var(--sc-role-hexer, #5cc98a)',
	'role-defender': 'var(--sc-role-defender, #c7a173)',
	'role-leader': 'var(--sc-role-leader, #9aa2a8)',
	// action-type spines (--sc-ability-* slots)
	// SC-10 realignment: the site's CANONICAL --sc-act-* action-type tokens
	// (steel-ability-cards.css), not the --sc-ability-* classification hues.
	'act-main': 'var(--sc-act-main, #e74c3c)',
	'act-maneuver': 'var(--sc-act-maneuver, #5dade2)',
	'act-triggered': 'var(--sc-act-triggered, #4caf6a)',
	'act-move': 'var(--sc-act-move, #e8a13a)',
	'act-none': 'var(--sc-act-none, #cdd1d4)',
	'act-trait': 'var(--sc-act-trait, #bb8fce)',
};

describe('D3 Task 3: Steel theme value block ([data-dse-theme="steel"])', () => {
	test('the scoped Steel override block exists after the Legacy base', () => {
		expect(sheet).toMatch(/\[data-dse-element\]\[data-dse-theme="steel"\]\s*\{/);
		// It comes AFTER the :root Legacy base (override layering).
		const base = sheet.search(/:root\s*\{[^}]*--dse-surface\s*:/);
		const steel = sheet.search(/\[data-dse-element\]\[data-dse-theme="steel"\]\s*\{/);
		expect(base).toBeGreaterThan(-1);
		expect(steel).toBeGreaterThan(base);
	});

	test('representative tokens carry their Steel (dark) map values verbatim', () => {
		for (const [name, expected] of Object.entries(STEEL_DARK)) {
			expect(steelValue(name)).toBe(expected);
		}
	});

	test('Source Serif 4 is the Steel display-font fallback (OD-4)', () => {
		expect(steelValue('font-display')).toBe('"Source Serif 4", var(--font-text)');
	});

	test('WITHOUT the theme attr, tokens resolve to the UNCHANGED Legacy base', () => {
		// The base is byte-unchanged by Task 3 — spot-check the anchor Legacy values.
		expect(baseValue('surface')).toBe('var(--code-background)');
		expect(baseValue('fg')).toBe('var(--text-normal)');
		expect(baseValue('accent')).toBe('var(--interactive-accent)');
		expect(baseValue('font-display')).toBe('var(--font-text)');
		expect(baseValue('radius')).toBe('5px');
		expect(baseValue('crest-shape')).toBe('none');
		// role/act accents stay Legacy-monochrome in the base.
		expect(baseValue('role-controller')).toBe('var(--dse-fg-muted)');
		expect(baseValue('act-main')).toBe('none');
	});

	test('every overridden token actually DIFFERS from its Legacy base value', () => {
		for (const name of Object.keys(STEEL_DARK)) {
			expect(baseValue(name)).toBeDefined();
			expect(steelValue(name)).not.toBe(baseValue(name));
		}
	});

	test('theme-invariant tokens are NOT overridden in the Steel block (inherit Legacy)', () => {
		for (const name of THEME_INVARIANT) {
			expect(steelValue(name)).toBeUndefined();
		}
	});

	test('every union token is EITHER overridden in Steel OR intentionally invariant', () => {
		const overridden = DSE_TOKEN_NAMES.filter((n) => steelValue(n) !== undefined);
		const uncovered = DSE_TOKEN_NAMES.filter(
			(n) => steelValue(n) === undefined && !(THEME_INVARIANT as readonly string[]).includes(n),
		);
		expect(uncovered).toEqual([]);
		// The map's exact split: 63 overridden + 6 theme-invariant = 69 union tokens
		// (SC-10: badge-fg → invariant; Plan 20 Task 3: +5 material tokens).
		expect(overridden.length).toBe(63);
		expect(THEME_INVARIANT.length).toBe(6);
		expect(overridden.length + THEME_INVARIANT.length).toBe(DSE_TOKEN_NAMES.length);
	});

	test('the Steel block defines no stray token outside the union, none twice', () => {
		const union = new Set<string>(DSE_TOKEN_NAMES);
		const defs = steelDefinitions();
		expect(defs.filter((n) => !union.has(n))).toEqual([]);
		const seen = new Set<string>();
		expect(defs.filter((n) => (seen.has(n) ? true : (seen.add(n), false)))).toEqual([]);
	});

	test('attribute selector semantics: the Steel block matches iff data-dse-theme="steel"', () => {
		const el = document.createElement('div');
		el.setAttribute('data-dse-element', 'statblock');
		// No theme attr → only the Legacy base ([data-dse-element] / :root) applies.
		expect(el.matches('[data-dse-element][data-dse-theme="steel"]')).toBe(false);
		el.dataset.dseTheme = 'steel';
		// Now the Steel override block applies (closest scoped def wins).
		expect(el.matches('[data-dse-element][data-dse-theme="steel"]')).toBe(true);
		// A dark root (no .theme-light ancestor) must NOT match the T4 light variant.
		expect(el.matches('.theme-light [data-dse-element][data-dse-theme="steel"]')).toBe(false);
	});
});

// ====================================================================
//   D3 Task 4 — the Steel LIGHT variant (.theme-light [data-dse-theme])
// ====================================================================
//
// Obsidian stamps .theme-light / .theme-dark on <body>. Steel's DARK block is
// the signature default; the light variant OVERRIDES only the tokens whose value
// shifts under light (per the token map's "Steel light" column — surfaces, fg,
// and the light-column ability/tier hues). Role hues, stamina fills, tier-crit,
// select, encounter markers are light/dark-STABLE → deliberately NOT re-listed.
// Same parse-the-declaration strategy as the dark block above.

/** Body of the `.theme-light [data-dse-element][data-dse-theme="steel"]` block. */
function steelLightBlockBody(): string {
	const m = sheet.match(
		/(?:^|\n)[ \t]*\.theme-light\s+\[data-dse-element\]\[data-dse-theme="steel"\][ \t]*\{([^}]*)\}/,
	);
	if (!m)
		throw new Error(
			'Steel LIGHT variant block `.theme-light [data-dse-element][data-dse-theme="steel"]` not found in styles-source.css',
		);
	return m[1];
}

/** Declared value of --dse-<name> in the Steel light block, or undefined if absent. */
function steelLightValue(name: string): string | undefined {
	const m = steelLightBlockBody().match(new RegExp(`(?:^|[\\s{;])--dse-${name}\\s*:\\s*([^;]+);`));
	return m ? m[1].trim() : undefined;
}

/** All --dse-* names DEFINED in the Steel light block. */
function steelLightDefinitions(): string[] {
	const defs: string[] = [];
	for (const d of steelLightBlockBody().matchAll(/(?:^|[\s{;])--dse-([a-z0-9-]+)\s*:/g)) defs.push(d[1]);
	return defs;
}

/**
 * The authoritative Steel LIGHT overrides — transcribed VERBATIM from the map's
 * "Steel light" column (ONLY the rows whose light value is non-blank). Exactly
 * the set that shifts vs. the dark ground; everything else inherits dark Steel.
 */
const STEEL_LIGHT: Record<string, string> = {
	// surfaces
	surface: '#f6f8f8',
	'surface-raised': '#edf0f0',
	'surface-sunken': '#eaeeef',
	// borders
	border: '#c8cdd0',
	'border-strong': '#8e959a',
	// hover
	hover: 'rgba(42,123,136,0.10)',
	// text
	heading: '#1a1d20',
	fg: '#2c2e30',
	'fg-muted': '#555960',
	'fg-faint': '#828890',
	'chip-bg': '#eaeeef',
	// accent
	accent: '#2a7b88',
	'accent-fg': '#fff',
	'focus-ring': '#2a7b88',
	// ornament (site's default/light --fx-* block)
	'metal-grad': 'linear-gradient(180deg, #9aa1a6 0%, #6a7176 48%, #474d51 100%)',
	'metal-line': 'rgba(95,103,108,.45)',
	'metal-faint': 'rgba(95,103,108,.14)',
	// Plan 20 Task 3: only these three of the five material tokens shift for the
	// light scheme — the site overrides just the cost chip's gradient
	// (steel-ability-cards.css:119) and the two metal text colours
	// (steel-redesign.css:26-27); sheen-soft and chip-bevel have no light rule.
	metal: '#5f676c',
	'metal-bright': '#2c3338',
	sheen: 'linear-gradient(180deg, rgba(255,255,255,.9), rgba(0,0,0,.04))',
	bevel: 'inset 0 1px 0 rgba(255,255,255,.8)',
	emboss: 'none', // site: no light emboss
	'card-bg': 'linear-gradient(160deg, #ffffff, #eef1f1)',
	rule: '#5a6368',
	// power-roll tiers (darkened light-column hues)
	'tier-low': '#c0392b',
	'tier-mid': '#b9770e',
	'tier-high': '#1e8449',
	// stamina bar track
	'stamina-track': '#eaeeef',
	// action-type spines (darkened light-column hues)
	// SC-10 realignment: the site's light --sc-act-* values.
	'act-main': '#c0392b',
	'act-maneuver': '#2874a6',
	'act-triggered': '#1e8449',
	'act-move': '#b9770e',
	'act-none': '#5a6368',
	'act-trait': '#7d3c98',
};

/**
 * Tokens that are light/dark-STABLE per the map (Steel light column blank): they
 * MUST NOT appear in the light block (they inherit the dark Steel value).
 */
const STEEL_LIGHT_STABLE = [
	// all 12 role hues (locked in palette.css, light/dark-stable)
	'role-ambusher', 'role-harrier', 'role-artillery', 'role-brute', 'role-controller',
	'role-hexer', 'role-mount', 'role-support', 'role-defender', 'role-leader',
	'role-solo', 'role-minion',
	// stamina fills + crit + encounter markers + select: fills, no contrast pressure
	'stamina-healthy', 'stamina-winded', 'stamina-dying', 'stamina-temp',
	'tier-crit', 'turn-done', 'malice', 'vp', 'warn', 'danger', 'select',
	// geometry / typography carried from dark (radius, crest-shape, font-display …)
	'radius', 'crest-shape', 'font-display', 'hairline-fade',
] as const;

describe('D3 Task 4: Steel LIGHT variant (.theme-light [data-dse-theme="steel"])', () => {
	test('the light-variant block exists AFTER the dark Steel block', () => {
		const dark = sheet.search(/(?:^|\n)[ \t]*\[data-dse-element\]\[data-dse-theme="steel"\][ \t]*\{/);
		const light = sheet.search(/\.theme-light\s+\[data-dse-element\]\[data-dse-theme="steel"\]\s*\{/);
		expect(dark).toBeGreaterThan(-1);
		expect(light).toBeGreaterThan(dark);
	});

	test('every light override carries its map value VERBATIM', () => {
		for (const [name, expected] of Object.entries(STEEL_LIGHT)) {
			expect(steelLightValue(name)).toBe(expected);
		}
	});

	test('the light block overrides EXACTLY the shifting tokens (34) — none extra, none twice', () => {
		const defs = steelLightDefinitions();
		expect(new Set(defs)).toEqual(new Set(Object.keys(STEEL_LIGHT)));
		expect(defs.length).toBe(34); // SC-10: badge-fg no longer light-overridden; Plan 20: +metal/-bright/sheen
		expect(Object.keys(STEEL_LIGHT).length).toBe(34);
		const seen = new Set<string>();
		expect(defs.filter((n) => (seen.has(n) ? true : (seen.add(n), false)))).toEqual([]);
	});

	test('every light override actually DIFFERS from the dark Steel value (only-what-shifts)', () => {
		for (const name of Object.keys(STEEL_LIGHT)) {
			expect(steelLightValue(name)).not.toBe(steelValue(name));
		}
	});

	test('light/dark-stable tokens (role hues, stamina fills, crit, encounter) are NOT re-listed', () => {
		for (const name of STEEL_LIGHT_STABLE) {
			expect(steelLightValue(name)).toBeUndefined();
		}
	});

	test('the light block defines no token outside the union', () => {
		const union = new Set<string>(DSE_TOKEN_NAMES);
		expect(steelLightDefinitions().filter((n) => !union.has(n))).toEqual([]);
	});

	test('attribute-selector semantics: light block matches ONLY under a .theme-light ancestor', () => {
		const wrap = document.createElement('div');
		wrap.className = 'theme-light';
		const el = document.createElement('div');
		el.setAttribute('data-dse-element', 'statblock');
		el.dataset.dseTheme = 'steel';
		wrap.appendChild(el);
		document.body.appendChild(wrap);
		try {
			expect(el.matches('.theme-light [data-dse-element][data-dse-theme="steel"]')).toBe(true);
			// The dark Steel block still matches too — light is an override ON TOP of it.
			expect(el.matches('[data-dse-element][data-dse-theme="steel"]')).toBe(true);
			// Remove the light ancestor → light variant no longer applies (dark ground).
			wrap.className = '';
			expect(el.matches('.theme-light [data-dse-element][data-dse-theme="steel"]')).toBe(false);
		} finally {
			wrap.remove();
		}
	});
});
