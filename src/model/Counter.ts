import {parseYaml} from "obsidian";

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
		let data: any;
		try {
			data = parseYaml(source);
		} catch (error: any) {
			throw new Error("Invalid YAML format: " + error.message);
		}
		return Counter.parse(data);
	}

	public static parse(data: any): Counter {
		return new Counter(
			data.max_value,
			data.current_value ? data.current_value : 0,
			data.min_value ? data.min_value : 0,
			data.name,
			data.value_height ? data.value_height : 3,
			data.name_height ? data.name_height : 1,
			// FOLLOWUPS #26: passed straight through, never coerced/defaulted — see the
			// field comment above.
			data._dse_anchor);
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
