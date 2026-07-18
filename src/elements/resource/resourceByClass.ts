// D7 Task 3 (spec §4.1/§1.2) — RESOURCE_BY_CLASS: the static, hard-coded 9-class heroic
// resource table from spec §1.2 verbatim ("the canonical map, mirrored in ds-resource,
// §4.1"). Deliberately NOT compendium-backed (spec §4.1: "class-aware via a static
// RESOURCE_BY_CLASS map... not the compendium — D6 only enriches the gain rule when
// present" is future/out-of-scope for this task) — every row below is cited straight
// from the workspace reference docs, not looked up live.
//
// Citations: RR = reference/draw-steel-reference.md (§4 Classes, line 119 header); AR =
// reference/draw-steel-agent-reference.md, whose per-class "**Resource -- <Name>**:"
// line is cited by line number below (2026-07-01 snapshot).

/** One class's heroic-resource defaults: display name, floor, and the (undramatized)
 *  gain-rule text the panel shows as a hint — the player enters gains manually (spec
 *  §1.1: "not auto-rolled — display the rule, let the player enter the gain"). */
export interface ResourceClassEntry {
	readonly type: string;
	readonly min: number;
	readonly gainHint: string;
}

/** Fallback for an absent/unrecognized `class` (spec §4.1 Step 1: "unknown class ->
 *  generic label, min:0"). Never mutated — `resolveResource` always returns a fresh
 *  merged object. */
const GENERIC_RESOURCE: ResourceClassEntry = {
	type: 'Resource',
	min: 0,
	gainHint: '',
};

/** spec §1.2's 9-class table, verbatim. Keys are lowercase class names (the schema/YAML
 *  `class:` field is matched case-insensitively by resolveResource below). */
export const RESOURCE_BY_CLASS: Record<string, ResourceClassEntry> = {
	// AR line 231: "Gain 2/turn (3 at 7th, 4 at 10th). +1 when damaging judged creature
	// (+2 at 4th). Start combat with wrath = Victories."
	censor: {
		type: 'Wrath',
		min: 0,
		gainHint: '2/turn; start = Victories; +1 on damaging a judged creature (RR §4, AR)',
	},
	// AR line 276: "Roll 1d3/turn (1d3+1 at 7th). Start with piety = Victories."
	conduit: {
		type: 'Piety',
		min: 0,
		gainHint: '1d3/turn; start = Victories; prayer risk (RR §4, AR)',
	},
	// AR line 328: "Gain 2/turn. +1 first time each round a creature within 10 squares
	// takes typed damage. Start with essence = Victories."
	elementalist: {
		type: 'Essence',
		min: 0,
		gainHint: '2/turn; start = Victories; persistent-magic drains gain (RR §4, AR)',
	},
	// AR line 366: "1d3/turn (1d3+1 at 7th). +1 first time each round you take damage
	// (+2 at 4th, +3 at 10th). +1d3 first time winded/dying per encounter."
	fury: {
		type: 'Ferocity',
		min: 0,
		gainHint:
			'1d3/turn; +1 on taking damage; +1d3 first winded/dying; Growing Ferocity thresholds 2/4/6/8/10/12 (RR §4, AR)',
	},
	// AR line 406: "Gain 2/turn (3 at 7th, 4 at 10th). +1 first time each round an enemy
	// in Null Field uses main action (+2 at 4th). +1 when Director spends Malice."
	null: {
		type: 'Discipline',
		min: 0,
		gainHint: '2/turn; +1 on enemy main-action in field; +1 on Director Malice (RR §4, AR)',
	},
	// AR line 446: "1d3/turn (1d3+1 at 7th). +1 first time each round you deal damage
	// with surges (+2 at 4th, +3 at 10th). Start with insight = Victories."
	shadow: {
		type: 'Insight',
		min: 0,
		gainHint: '1d3/turn; start = Victories; +1 on surge damage (RR §4, AR)',
	},
	// AR line 478: "Gain 2/turn (3 at 7th, 4 at 10th). +1 first time/round an ally
	// damages a marked creature. +1 first time/round an ally uses a heroic ability."
	tactician: {
		type: 'Focus',
		min: 0,
		gainHint: '2/turn; +1 ally-damages-marked; +1 ally heroic ability (RR §4, AR)',
	},
	// AR line 503/505: "1d3/turn (+1 at 7th, +1 more at 10th)... Start with clarity =
	// Victories." Strain mechanic (AR line 505): "CAN GO NEGATIVE (to -(1+Reason)).
	// Negative = 'strained', taking 1 damage per negative point per turn end." Reason
	// ranges -5..+5 (RR §1); this static default assumes Reason 0 (floor -1) since the
	// table has no per-hero characteristic to consult — author an explicit `min:`
	// override for a hero whose Reason differs from 0 (spec §4.1's overrides seam).
	talent: {
		type: 'Clarity',
		min: -1,
		gainHint:
			'1d3/turn; can go negative to -(1+Reason) ("strained"); self-damage each turn (RR §4, AR)',
	},
	// AR line 541: "1d3/turn. Additional drama from dramatic events: +2 when 3 heroes
	// act same turn, +2 when any hero goes winded, +3 on any natural 19-20, +10 on hero
	// death. At 30 drama while dead, you resurrect. Start with drama = Victories."
	troubadour: {
		type: 'Drama',
		min: 0,
		gainHint:
			'1d3/turn; +2 3-heroes-act; +2 ally winded; +10 hero death; resurrect at 30 (RR §4, AR)',
	},
};

/** Merges a class's static defaults with explicit `type`/`min` overrides (spec §4.1:
 *  "resolveResource(class?, overrides?) merges class defaults with explicit type/min").
 *  Class lookup is case-insensitive (authored `class: Fury` matches the lowercase table
 *  key). An absent/unrecognized class falls back to GENERIC_RESOURCE. `gainHint` always
 *  comes from the class table (or '' for the generic fallback) — it is never
 *  overridable, since it isn't part of ResourceModel's authored fields. */
export function resolveResource(
	cls?: string,
	overrides?: { type?: string; min?: number },
): ResourceClassEntry {
	const base = (cls !== undefined ? RESOURCE_BY_CLASS[cls.toLowerCase()] : undefined) ?? GENERIC_RESOURCE;
	return {
		type: overrides?.type ?? base.type,
		min: overrides?.min ?? base.min,
		gainHint: base.gainHint,
	};
}
