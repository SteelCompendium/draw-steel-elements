// SC-482 — one mechanism for "a write adds no default keys the user never wrote", generalising
// SC-466's stamina-bar fix to every element whose OWN parser fills defaults into the model
// (counter, project, montage, party, encounter, negotiation, stamina-bar).
//
// The contract (SC-466, adopted by SC-482): a key is OMITTED from the written block iff it was
// ABSENT from the parsed source AND its value at write time still equals the default the parser
// filled in. Every key the source declared is written (even if equal to its default); an absent
// key whose value changed is written; key ORDER is unchanged; a model the plugin built itself
// (never parsed from a source) has no record and keeps today's whole output. A key present with
// the value `undefined` (FormModal's cleared field) counts as absent, as does a null/blank body
// (nothing declared).
//
// How it differs from SC-466's first cut (a constant default table per element):
//   1. It records the VALUE the parse filled in (a JSON snapshot), not a constant, so a derived
//      default (negotiation current_patience = initial_patience) and an object/array default
//      mutated in place later (`rolls.push`, `party.hero_count = 4`) are both compared by value.
//   2. Presence is read BEFORE the inner parse runs: party and encounter parse by mutating the
//      incoming `data` in place, so a check afterwards would see the filled value as "declared".
//   3. It records on any object, not only on a class instance, and omits from any DTO: montage
//      serializes an ordered DTO, and negotiation's nested Motivation / Pitfall are instances of
//      their own.
//
// Where the record lives: a module-private WeakMap keyed by the parsed instance — NOT an own
// property (stringifyYaml would write it, and a non-enumerable one is lost by any spread/clone),
// and per-instance, so two blocks in one note never share it. Every writer mutates the SAME parsed
// instance in place, so the entry survives them all; a re-parse (external edit, sidebar echo,
// FormModal) builds a new instance and records afresh from its new source.

/** Per parsed object: for each key the source left absent, a JSON snapshot of the value parse filled in. */
const filled = new WeakMap<object, ReadonlyMap<string, string>>();

/** The keys of `data` as a lookup, or an empty one when the body was null / blank / not a mapping. */
function declaredOf(data: unknown): Record<string, unknown> {
	return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
}

/** Wrap a parse: reads which of `keys` the source left absent BEFORE `parse` runs, then records the
 *  values the parsed model holds for exactly those keys. */
export function recordingDefaults<M extends object>(
	parse: (data: unknown, raw: string) => M,
	keys: readonly string[],
): (data: unknown, raw: string) => M {
	return (data, raw) => {
		const declared = declaredOf(data);
		const absent = keys.filter((key) => declared[key] === undefined);
		const model = parse(data, raw);
		recordAbsentDefaults(model, absent);
		return model;
	};
}

/** Lower level, for an instance built during a parse (e.g. each negotiation Motivation): record the
 *  value `owner` holds NOW for each of `absentKeys` as "the default the parser filled in". */
export function recordAbsentDefaults(owner: object, absentKeys: readonly string[]): void {
	const snapshot = new Map<string, string>();
	for (const key of absentKeys) {
		const json = JSON.stringify((owner as Record<string, unknown>)[key]);
		if (json !== undefined) snapshot.set(key, json);
	}
	filled.set(owner, snapshot);
}

/** `dto` (default: `owner` itself) as a new object in the SAME key order, minus every key recorded
 *  absent for `owner` whose value still JSON-equals its parse-time snapshot. With no record (a model
 *  the plugin built itself) or nothing recorded, `dto` is returned unchanged. */
export function omitUntouchedDefaults<T extends object>(owner: object, dto: T = owner as T): Partial<T> {
	const record = filled.get(owner);
	if (!record || record.size === 0) return dto;
	return Object.fromEntries(
		Object.entries(dto).filter(([key, value]) => !(record.has(key) && JSON.stringify(value) === record.get(key))),
	) as Partial<T>;
}
