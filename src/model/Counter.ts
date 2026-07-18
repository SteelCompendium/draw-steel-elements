import {parseYaml} from "obsidian";

/** Raw YAML shape for a `ds-counter` block — every field optional, matching the
 *  pre-existing truthy-check/default pattern at each call site in `parse` below (no
 *  new runtime checks or coercions introduced; the interface only documents what was
 *  already an implicit assumption under `any`). */
interface RawCounterData {
	max_value?: number;
	current_value?: number;
	min_value?: number;
	name?: string;
	value_height?: number;
	name_height?: number;
	_dse_anchor?: string;
}

export class Counter {
	max_value?: number;
	current_value: number;
	min_value: number;
	name: string;
	value_height: number;
	name_height: number;
	/** FOLLOWUPS #26 (D8 spec §1.5) — sidebar block anchor passthrough. Round-trips
	 *  untouched (assigned LAST so it serializes last, matching the other trackers'
	 *  convention); ignored by every piece of game logic in this element. `undefined`
	 *  when the block never declared `_dse_anchor:` — never coerced, so a block
	 *  without one round-trips through serialize() without the key materializing. */
	_dse_anchor?: string;

	public static parseYaml(source: string) {
		let data: unknown;
		try {
			data = parseYaml(source);
		} catch (error: unknown) {
			throw new Error("Invalid YAML format: " + (error instanceof Error ? error.message : String(error)));
		}
		return Counter.parse(data);
	}

	public static parse(data: unknown): Counter {
		const raw = data as RawCounterData;
		return new Counter(
			raw.max_value,
			raw.current_value ? raw.current_value : 0,
			raw.min_value ? raw.min_value : 0,
			raw.name as string,
			raw.value_height ? raw.value_height : 3,
			raw.name_height ? raw.name_height : 1,
			// FOLLOWUPS #26: passed straight through, never coerced/defaulted — see the
			// field comment above.
			raw._dse_anchor);
	}

	constructor(
		max_value: number| undefined,
		current_value: number,
		min_value: number,
		name: string,
		value_height: number,
		name_height: number,
		// FOLLOWUPS #26: appended at the END of the parameter list (never inserted
		// before an existing param) so every existing positional call site keeps
		// passing its args unchanged. Assignment ORDER below controls serialized key
		// order — see the comment there.
		_dse_anchor?: string,
	) {
		this.max_value = max_value;
		this.current_value = current_value;
		this.min_value = min_value;
		this.name = name;
		this.value_height = value_height;
		this.name_height = name_height;
		// Assigned LAST so it serializes last when present; when absent it contributes
		// no key at all, a no-op for every existing byte-compat fixture.
		this._dse_anchor = _dse_anchor;
	}
}
