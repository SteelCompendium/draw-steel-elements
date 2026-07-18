// D7 Task 8 (spec §1.1) — deriveHeroStats: the pure, tested "Derived, never stored"
// math from spec §1.1's bullet list. Every formula below is cited against either the
// spec text itself, the reference docs it cites (RR/AR), or — where a formula consumes a
// resolved SDK model field — the real field name/shape confirmed against a live fixture
// (data-unified/en/unified/md-dse/{class,kit}/*.md, checked 2026-07-18; see each
// function's own comment for the specific field(s) and citation).
//
// Deliberately takes an ALREADY-RESOLVED `ResolvedHeroDefinition` (resolve.ts), not a
// `CompendiumIndex` — this file does no I/O and awaits nothing, so it can be unit-tested
// with plain in-memory fixtures (spec §1.1: "a deriveHeroStats(defn) pure function").
import { resolveResource } from '@/elements/resource/resourceByClass';
import type { HeroDefn } from './model';
import type { ResolvedHeroDefinition } from './resolve';

/** OD-4: every derived stat is tagged so the sheet (Task 9) can show "authored" (an
 *  explicit override won) vs "derived" (computed from the resolved class/kit) vs
 *  "unavailable" (neither an override nor enough resolved data to compute it — the sheet
 *  shows the per-ref degrade notice from `resolve.ts`'s `issues`, spec §3.5). */
export type StatSource = 'authored' | 'derived' | 'unavailable';

export interface DerivedStat<T> {
	value: T;
	source: StatSource;
}

/** Mirrors `resourceByClass.ts`'s `ResourceClassEntry` shape (type/min/gainHint) — the
 *  heroic-resource "derived stat" IS that resolution, just entered through the hero's
 *  resolved `class` model (§1.1's "Resource-per-turn = class rule ... display the rule,
 *  let the player enter the gain") instead of `ds-resource`'s own authored `class:` key. */
export interface DerivedResource {
	type: string;
	min: number;
	gainHint: string;
}

export interface DerivedStats {
	maxStamina: DerivedStat<number | null>;
	recoveryValue: DerivedStat<number | null>;
	windedThreshold: DerivedStat<number | null>;
	deathThreshold: DerivedStat<number | null>;
	recoveriesMax: DerivedStat<number | null>;
	resource: DerivedStat<DerivedResource>;
}

/**
 * RR §13 / spec §1.1 line 34 verbatim: "Echelon derives from level (1–3 / 4–6 / 7–9 /
 * 10)." Level is schema-clamped to 1-10 (schema.yaml `level: minimum 1, maximum 10`),
 * but this is a plain arithmetic mapping regardless (a level outside that range still
 * gets a defined echelon rather than throwing, matching this file's "never throws"
 * posture).
 */
function echelonForLevel(level: number): number {
	if (level >= 10) return 4;
	if (level >= 7) return 3;
	if (level >= 4) return 2;
	return 1;
}

/**
 * Defensive parse of a kit bonus field (`Kit.stamina_bonus`/`stability_bonus`/
 * `speed_bonus` — data-sdk-npm/src/model/Kit.ts, all `string | undefined`, free text
 * with embedded `[...](scc...)` markdown links in real data). Confirmed against every
 * kit fixture with a `stamina_bonus` in data-unified/en/unified/md-dse/kit/*.md
 * (2026-07-18): always "+N per [echelon](...)" — e.g. mountain.md's
 * `stamina_bonus: +9 per [echelon](scc.v1:.../rule.general/echelon)` (spec §1.1's own
 * "Shining Armor kit +12/echelon" example matches shining-armor.md's "+12 per echelon").
 * `stability_bonus`/`speed_bonus` are flat ("+2", no "per echelon") wherever present.
 * Extracts the first signed integer and whether "per echelon" appears; returns `null` for
 * a missing/unparsable string rather than throwing (a hand-authored compendium file could
 * phrase this differently — degrade to "no bonus", not a hard error). The "per echelon"
 * test is deliberately two independent substring checks, not a single `/per\s+echelon/`
 * regex — real fixture text wraps the word in a markdown link (mountain.md:
 * `"+9 per [echelon](scc.v1:.../rule.general/echelon)"`), so "per" and "echelon" are
 * separated by a `[`, not just whitespace.
 */
function parseKitBonus(raw: string | undefined): { amount: number; perEchelon: boolean } | null {
	if (typeof raw !== 'string') return null;
	const match = raw.match(/([+-]?\d+)/);
	if (!match) return null;
	const perEchelon = /\bper\b/i.test(raw) && /echelon/i.test(raw);
	return { amount: parseInt(match[1], 10), perEchelon };
}

/**
 * spec §1.1: "Max Stamina = class base + per-level growth + kit bonus + ancestry/treasure
 * bonuses." `class base` = `Class.starting_stamina` ("Starting Stamina at 1st Level" —
 * class.schema.json / fury.md's `starting_stamina: 21`), `per-level growth` =
 * `Class.stamina_per_level` ("Stamina Gained at 2nd and Higher Levels" — fury.md's
 * `stamina_per_level: 9`) applied `(level - 1)` times from that 1st-level base, `kit
 * bonus` = each resolved kit's `stamina_bonus` (parseKitBonus above), scaled by echelon
 * when the field says "per echelon" (every real kit does).
 *
 * `ancestry/treasure bonuses`: the current SDK `Ancestry` model (data-sdk-npm/src/model/
 * Ancestry.ts) carries NO numeric size/speed/stability/stamina fields at all — only
 * `signature_trait_name`/`signature_trait_description`/`purchased_traits` — and treasures
 * are outside Task 8's resolution scope entirely (spec §3.5 lists class/kits/ancestry as
 * the resolved refs, not treasures). So neither term is computable today; this is a real
 * gap between the spec's wording and what the SDK models actually carry, not an
 * oversight — flagged in the Task 8 report, not silently guessed at.
 */
function deriveMaxStamina(defn: HeroDefn, resolved: ResolvedHeroDefinition): DerivedStat<number | null> {
	if (defn.max_stamina !== undefined) return { value: defn.max_stamina, source: 'authored' };

	const cls = resolved.class?.model;
	if (!cls || typeof cls.starting_stamina !== 'number' || typeof cls.stamina_per_level !== 'number') {
		return { value: null, source: 'unavailable' };
	}

	const echelon = echelonForLevel(defn.level);
	let total = cls.starting_stamina + cls.stamina_per_level * (defn.level - 1);
	for (const kit of resolved.kits) {
		const bonus = parseKitBonus(kit.model.stamina_bonus);
		if (bonus) total += bonus.perEchelon ? bonus.amount * echelon : bonus.amount;
	}
	return { value: total, source: 'derived' };
}

/** Shared by recovery-value/winded-threshold: both are pure functions OF `maxStamina`,
 *  never independently authored (`HeroDefn` has no `recovery_value`/`winded_threshold`
 *  override field — spec §3.1's override set is only `max_stamina`/`recoveries_max`/
 *  `resource`) — so their own `source` is 'derived' whenever computable, 'unavailable'
 *  otherwise, REGARDLESS of whether `maxStamina` itself came from an authored override
 *  (an authored `max_stamina: 48` still makes "recovery value 16" a DERIVED fact, not an
 *  authored one — nobody wrote "16" anywhere). */
function deriveFromMax(
	maxStamina: DerivedStat<number | null>,
	fn: (max: number) => number,
): DerivedStat<number | null> {
	if (maxStamina.value === null) return { value: null, source: 'unavailable' };
	return { value: fn(maxStamina.value), source: 'derived' };
}

/**
 * spec §1.1/§1.3 (RR §8): "Recoveries max = class value (Fury 10, Censor 12, Conduit 10,
 * Elementalist 8, …)." `Class.recoveries` — fury.md's `recoveries: 10`. No kit/ancestry
 * term in the spec's formula for this one (unlike Stamina) — recoveries count is a pure
 * class fact.
 */
function deriveRecoveriesMax(defn: HeroDefn, resolved: ResolvedHeroDefinition): DerivedStat<number | null> {
	if (defn.recoveries_max !== undefined) return { value: defn.recoveries_max, source: 'authored' };
	const cls = resolved.class?.model;
	if (!cls || typeof cls.recoveries !== 'number') return { value: null, source: 'unavailable' };
	return { value: cls.recoveries, source: 'derived' };
}

/**
 * spec §1.1/§1.2: "Resource-per-turn = class rule ... not auto-rolled — display the
 * rule, let the player enter the gain." Reuses `resourceByClass.ts`'s
 * `RESOURCE_BY_CLASS`/`resolveResource` — the SAME static, RR/AR-cited 9-class table
 * `ds-resource` (D7 Task 3) already ships and tests (spec §1.2: "the canonical map,
 * mirrored in ds-resource, §4.1") — rather than a second copy, so the hero sheet and the
 * standalone resource tracker can never drift on class -> resource-name/gain-rule.
 * `Class.name` (e.g. "Fury") feeds the (case-insensitive) class-key lookup; an authored
 * `defn.resource` override always wins (both `type`/`min`, per `HeroResourceOverride`'s
 * "both fields are required together").
 */
function deriveResource(defn: HeroDefn, resolved: ResolvedHeroDefinition): DerivedStat<DerivedResource> {
	const cls = resolved.class?.model;
	const overrides = defn.resource ? { type: defn.resource.type, min: defn.resource.min } : undefined;
	const value = resolveResource(cls?.name, overrides);
	const source: StatSource = defn.resource !== undefined ? 'authored' : cls !== undefined ? 'derived' : 'unavailable';
	return { value, source };
}

/**
 * The view-facing entry point (§3.5: "These feed deriveHeroStats(defn)"). Pure: no I/O,
 * no compendium access — `resolved` (resolve.ts's `resolveHeroDefinition` output) is
 * already-fetched data. Every field degrades independently (spec §3.5 "per ref"): a
 * missing/unresolved `class` blanks `maxStamina`/`recoveryValue`/`windedThreshold`/
 * `deathThreshold`/`recoveriesMax`/`resource`'s class contribution, but an authored
 * `max_stamina`/`recoveries_max`/`resource` override still fills in independently of
 * whether `class` resolved at all.
 */
export function deriveHeroStats(defn: HeroDefn, resolved: ResolvedHeroDefinition): DerivedStats {
	const maxStamina = deriveMaxStamina(defn, resolved);
	// RR §8: "Winded" = at half Stamina max or below; "Dying" = at 0; "Dead" = at negative
	// Winded (spec §1.1: "Death threshold = −winded").
	const windedThreshold = deriveFromMax(maxStamina, (max) => Math.floor(max / 2));
	const deathThreshold: DerivedStat<number | null> =
		windedThreshold.value === null ? { value: null, source: 'unavailable' } : { value: -windedThreshold.value, source: 'derived' };

	return {
		maxStamina,
		// RR §8: Catch Breath heals "recovery value" = ⌊max Stamina / 3⌋.
		recoveryValue: deriveFromMax(maxStamina, (max) => Math.floor(max / 3)),
		windedThreshold,
		deathThreshold,
		recoveriesMax: deriveRecoveriesMax(defn, resolved),
		resource: deriveResource(defn, resolved),
	};
}
