// D7 Task 5 (spec §4.3) — ds-surges model: parse + byte-stable serialize for the trivial
// surge tracker. BRAND NEW element (no legacy predecessor); mirrors resource/model.ts's
// convention exactly (parse copies through only authored keys, serialize is a pure
// projection) — there is nothing to normalize or class-default here, only two flat
// numeric fields to pass through or omit.
import { stringifyYaml } from 'obsidian';

export interface SurgeModel {
	/** Surge count. Required — every ds-surges block authors a current value. Floor 0
	 *  at the UI (panel.ts's stepper `min: 0`); "cleared to 0 at end of encounter" is a
	 *  surfaced affordance the player drives, never auto-applied by this element (spec
	 *  §4.3: "surface, not auto"). */
	surges: number;
	/** The hero's highest characteristic score, when the author wants the panel to show
	 *  the "each = +N damage" hint (AR: "each surge adds extra damage equal to your
	 *  highest characteristic score", reference/draw-steel-agent-reference.md:44).
	 *  Absent = no hint line (spec §4.3: "when provided"). Not derived here — this
	 *  element has no characteristics of its own to compute from; a consumer (e.g. the
	 *  ds-hero flagship) supplies it. */
	highest_characteristic?: number;
}

export function parse(input: unknown, _raw: string): SurgeModel {
	if (typeof input !== 'object' || input === null) {
		throw new Error('The input must be a YAML object.');
	}
	const data = input as Record<string, unknown>;
	if (typeof data.surges !== 'number') {
		throw new Error("ds-surges requires a numeric 'surges' field.");
	}
	const model: SurgeModel = { surges: data.surges };
	if (typeof data.highest_characteristic === 'number') {
		model.highest_characteristic = data.highest_characteristic;
	}
	return model;
}

/** Field order (surges, highest_characteristic) matches the schema's own property order
 *  and the spec §4.3 shape — an absent `highest_characteristic` is simply never
 *  assigned onto `dto`, so stringifyYaml (keepUndefined: false by default) omits it
 *  entirely, the same convention as resource/model.ts's class/type/min/max. */
export function serialize(model: SurgeModel): string {
	const dto: Record<string, unknown> = { surges: model.surges };
	if (model.highest_characteristic !== undefined) dto.highest_characteristic = model.highest_characteristic;
	return stringifyYaml(dto).trim();
}
