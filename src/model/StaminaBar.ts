import {parseYaml} from "obsidian";
import {Creature, CreatureInstance, Hero} from "@drawSteelAdmonition/EncounterData";
import { ComponentWrapper } from "@model/ComponentWrapper";
import { validateYamlWithYamlSchema, ValidationError } from "@utils/JsonSchemaValidator";
import staminaBarSchemaYaml from "@model/schemas/StaminaBarSchema.yaml";

/** Raw YAML shape after AJV validation against StaminaBarSchema.yaml (see parseYaml
 *  below) — every field stays optional here and is still read with a truthy-check/
 *  default (or passed straight through) below, same as the pre-existing `any`-typed
 *  code. */
interface RawStaminaBarData {
	collapsible?: boolean;
	collapse_default?: boolean;
	max_stamina?: number;
	current_stamina?: number;
	temp_stamina?: number;
	height?: number;
	style?: string;
	recoveries?: number;
	recoveries_max?: number;
	_dse_anchor?: string;
}

export class StaminaBar extends ComponentWrapper{
	max_stamina: number;
	current_stamina: number;
	temp_stamina: number;
	/** D7 Task 4 (spec §4.2, additive/optional): Recoveries remaining in the pool.
	 *  `undefined` when the block never declared `recoveries:` — never coerced to 0,
	 *  so a legacy/unconfigured block round-trips through serialize() without this key
	 *  materializing (yaml's stringify drops own-properties whose value is `undefined`,
	 *  same convention StaminaBarSchema/ComponentWrapper's header documents). */
	recoveries?: number;
	/** D7 Task 4 (spec §4.2, additive/optional): the size of the Recoveries pool.
	 *  `undefined` unless the block declares `recoveries_max:` — this is also the
	 *  presence gate the view uses to decide whether to render the recoveries pip
	 *  row / Catch Breath control / winded-dying badge at all. */
	recoveries_max?: number;
	height: number;
    style: string;
	/** FOLLOWUPS #26 (D8 spec §1.5) — sidebar block anchor passthrough. Round-trips
	 *  untouched (assigned LAST so it serializes last); ignored by every piece of game
	 *  logic in this element. `undefined` when the block never declared
	 *  `_dse_anchor:` — never coerced, so a block without one round-trips through
	 *  serialize() without the key materializing. */
	_dse_anchor?: string;

	public static parseYaml(source: string) {
		try {
			// Validate YAML content against YAML schema (all dependencies pre-registered)
			const validation = validateYamlWithYamlSchema(source, staminaBarSchemaYaml);
			if (!validation.valid) {
				const errorMessages = validation.errors.map((error: ValidationError) => 
					`${error.path}: ${error.message}`
				).join(', ');
				throw new Error("Schema validation failed: " + errorMessages);
			}

			// Parse the YAML after validation
			const data: unknown = parseYaml(source);
			return StaminaBar.parse(data);
		} catch (error: unknown) {
			throw new Error("Invalid YAML format: " + (error instanceof Error ? error.message : String(error)));
		}
	}

	public static parse(data: unknown): StaminaBar {
		const raw = data as RawStaminaBarData;
		return new StaminaBar(
            raw.collapsible as boolean,
            raw.collapse_default as boolean,
			raw.max_stamina as number,
			raw.current_stamina ? raw.current_stamina : 0,
			raw.temp_stamina ? raw.temp_stamina : 0,
			raw.height ? raw.height : 1,
            raw.style,
            // D7 Task 4: passed straight through, never coerced/defaulted — a block
            // that never declared these keys gets `undefined` on both, which is the
            // "no materialization" contract (see the field comments above).
            raw.recoveries,
            raw.recoveries_max,
            // FOLLOWUPS #26: same "passed straight through" convention.
            raw._dse_anchor);
	}

	// TODO - should this be in Hero and CreatureInstance instead?  probably, but those are interfaces
	public static fromHero(hero: Hero) {
		return new StaminaBar(false, false, hero.max_stamina, hero.current_stamina ?? 0, hero.temp_stamina ?? 0, 1);
	}

	public static fromCreature(being: CreatureInstance, creature: Creature) {
		return new StaminaBar(false, false, creature.max_stamina, being.current_stamina ?? 0, being.temp_stamina ?? 0, 1);
	}

	constructor(
        collapsible: boolean,
        collapse_default: boolean,
        max_stamina: number,
        current_stamina: number,
        temp_stamina: number,
        height: number,
        style: string = "default",
        // D7 Task 4: appended at the END of the parameter list (never inserted before
        // `height`) so every existing positional call site (fromHero/fromCreature, the
        // byte-compat suite, StaminaEditModal's test fixture) keeps passing `height` as
        // its 6th arg unchanged. Assignment ORDER below (not param order) controls the
        // serialized key order — see the comment there.
        recoveries?: number,
        recoveries_max?: number,
        // FOLLOWUPS #26: appended at the END of the parameter list (never inserted
        // before an existing param) so every existing positional call site (fromHero/
        // fromCreature, the byte-compat suite, StaminaEditModal's test fixture) keeps
        // passing its args unchanged. Assignment ORDER (last) controls serialized key
        // order — see the comment there.
        _dse_anchor?: string,
    ) {
        super(collapsible, collapse_default);
		this.max_stamina = max_stamina;
		this.current_stamina = current_stamina;
		this.temp_stamina = temp_stamina;
        // Assigned here (right after temp_stamina, before height/style) purely to match
        // the doc/spec's YAML field order when these DO serialize; when both are
        // `undefined` (the legacy/absent case) they contribute no key at all, so this
        // placement is a no-op for every existing byte-compat fixture.
        this.recoveries = recoveries;
        this.recoveries_max = recoveries_max;
		this.height = height;
        this.style = style
        // Assigned LAST so it serializes last when present; a no-op (contributes no
        // key) when absent, same convention as recoveries/recoveries_max above.
        this._dse_anchor = _dse_anchor;
	}

	public updateHero(hero: Hero) {
		hero.max_stamina = this.max_stamina;
		hero.current_stamina = this.current_stamina;
		hero.temp_stamina = this.temp_stamina;
	}

	public updateCreature(creature: CreatureInstance) {
		creature.current_stamina = this.current_stamina;
		creature.temp_stamina = this.temp_stamina;
	}

	// -- D7 Task 4 (spec §4.2): derived Stamina/Recoveries thresholds -------------------
	// DERIVED, never stored (HARD INVARIANT): these are `get` accessors on the
	// prototype, so `Object.keys`/yaml's stringify never see them as own properties —
	// verified against the `yaml` package directly (a class with a getter serializes
	// only its own assigned fields). Formulas per the Draw Steel core rules,
	// "Stamina and Death" (reference/draw-steel-reference.md lines 274-279, cited here
	// as RR §8 per the task brief's convention):
	//   "Winded: At half Stamina max or below."
	//   "Dying: At 0 Stamina or below. ... Can't Catch Breath."
	//   "Death: Stamina reaches negative of the winded value."
	//   "Recovery value: 1/3 of Stamina max."
	// FOLLOWUPS #27a (fixed): the StaminaBarPanel kit core's `staminaState` fill-color
	// threshold (framework/kit/StaminaBarPanel.ts) originally used a stricter `current <
	// floor(max/2)`, disagreeing with this getter's `<=` at exactly half stamina. The
	// kit core now also uses `<=`, so the bar-fill color and this getter (and the
	// winded badge) agree at the boundary.

	/** RR §8 "Winded": half of max_stamina, floored. */
	get windedThreshold(): number {
		return Math.floor(this.max_stamina / 2);
	}

	/** RR §8 "Winded: At half Stamina max or below." */
	get isWinded(): boolean {
		return this.current_stamina <= this.windedThreshold;
	}

	/** RR §8 "Dying: At 0 Stamina or below." */
	get isDying(): boolean {
		return this.current_stamina <= 0;
	}

	/** RR §8 "Death: Stamina reaches negative of the winded value." */
	get deathThreshold(): number {
		return -this.windedThreshold;
	}

	/** RR §8 "Recovery value: 1/3 of Stamina max." (Matches StaminaEditModal's
	 *  pre-existing "Spend Recovery" quick action, which computes the same
	 *  `Math.floor(maxStamina / 3)` inline.) */
	get recoveryValue(): number {
		return Math.floor(this.max_stamina / 3);
	}
}

// FOLLOWUPS #27-fix-round finding 3 (LOW): the "-1 Recovery, +recoveryValue Stamina"
// spend formula (RR §8 "Catch Breath (spend Recovery)") was duplicated verbatim in
// three places: stamina-bar/view.ts's catchBreath(), hero/view.ts's catchBreath(), and
// StaminaEditModal's Spend Recovery quick action. Free function (not a StaminaBar
// method) because hero/view.ts spends against HeroState's stamina/recoveries fields,
// not a StaminaBar instance — only the plain numbers are shared.
//
// `capped` (default true) is the convention of the two IMMEDIATE-apply call sites
// (stamina-bar/view.ts, hero/view.ts): the heal never overshoots `max` headroom, since
// the mutation lands on the model the instant Catch Breath is clicked.
// StaminaEditModal's Spend Recovery passes `capped: false` — that modal defers ALL
// clamping to its own Apply-time clampStamina, and deliberately does NOT bound the
// per-press amount (see the modal's "KNOWN DEVIATION" comment on why stacked presses
// are allowed to overshoot before Apply reconciles them) — that design question is
// unrelated to this consolidation and stays exactly as it was.
export function recoveryHealAmount(recoveryValue: number, current: number, max: number, capped = true): number {
	return capped ? Math.max(Math.min(recoveryValue, max - current), 0) : recoveryValue;
}
