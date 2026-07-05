// Plan 08 Task 1 — D2 §6: the --dse-* token vocabulary.
//
// Every token name, WITHOUT the `--dse-` prefix: ThemeService.cssVar adds it
// (cssVar("accent") → "var(--dse-accent)"). This union is the contract the whole
// D2 UI overhaul references (widgets/elements in Plan 08 Tasks 2-4, D3 themes,
// D4 prefs) — names here are load-bearing; do not rename casually.
//
// Values: the Legacy defaults (= today's look) live as the UNSCOPED :root base
// block in styles-source.css. D3 owns the value space and adds the
// [data-dse-theme="steel"] override layer on top of that base.
//
// Lives at framework/ root (NOT under kit/): seams/theme.ts imports this type,
// and seams must not import kit.

export const DSE_TOKEN_NAMES = [
	// -- Structure / surface (D2 §6) --
	'surface',
	'surface-raised',
	'surface-sunken',
	'page-bg', // the HOST PAGE background (divider punch-out) — Task-5 gap-close
	'border',
	'border-strong',
	'radius',
	'pad',
	'hover',
	'hairline-fade',
	'touch-min',
	// -- Text --
	'heading',
	'fg',
	'fg-muted',
	'fg-faint',
	'font-display',
	'font-mono',
	'chip-bg',
	// -- Accent / interaction --
	'accent',
	'accent-fg',
	'focus-ring',
	'select',
	// -- Steel ornament (Legacy = flat/none; Steel = the --fx-* analogs, D3) --
	'metal-grad',
	'metal-line',
	'metal-faint',
	'bevel',
	'emboss',
	'card-bg',
	'crest-shape',
	'rule',
	'rule-fade',
	// -- Semantic: power-roll tiers --
	'tier-low',
	'tier-mid',
	'tier-high',
	'tier-crit',
	'badge-fg', // tier-badge text color (§2.8 D3 hook) — Task-5 gap-close
	// -- Semantic: stamina --
	'stamina-healthy',
	'stamina-winded',
	'stamina-dying',
	'stamina-temp',
	'stamina-track',
	// -- Semantic: encounter --
	'turn-done',
	'malice',
	'vp',
	'warn',
	'danger',
	// -- Combat-role accents (OD-2: Legacy = leader-grey monochrome; Steel colors them) --
	'role-ambusher',
	'role-harrier',
	'role-artillery',
	'role-brute',
	'role-controller',
	'role-hexer',
	'role-mount',
	'role-support',
	'role-defender',
	'role-leader',
	'role-solo',
	'role-minion',
	// -- Ability action-type accents (OD-2: Legacy = none; Steel colors them) --
	'act-main',
	'act-maneuver',
	'act-triggered',
	'act-move',
	'act-none',
	'act-trait',
] as const;

/** The narrowed token-name union (D2 §6 / F1 §3.5). `cssVar(name)` → `var(--dse-<name>)`. */
export type DseTokenName = (typeof DSE_TOKEN_NAMES)[number];
