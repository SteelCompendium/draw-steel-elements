import {parseYaml} from "obsidian";

/** Raw YAML shape for a `KeyValuePairs` block — parsed YAML is inherently untyped;
 *  every field is read with a truthy-check/default below, same as before this file
 *  was typed. */
interface RawKeyValuePairsData {
	values?: unknown;
	value_height?: number;
	name_height?: number;
}

export class KeyValuePairs {
	values: KVPair[];
	value_height: number;
	name_height: number;

	public static parseYaml(source: string) {
		let data: unknown;
		try {
			data = parseYaml(source);
		} catch (error: unknown) {
			throw new Error("Invalid YAML format: " + (error instanceof Error ? error.message : String(error)));
		}
		return KeyValuePairs.parse(data);
	}

	public static parse(data: unknown): KeyValuePairs {
		const raw = data as RawKeyValuePairsData;
		return new KeyValuePairs(KVPair.parseAll(raw.values),
			raw.value_height ? raw.value_height : 3,
			raw.name_height ? raw.name_height : 1);
	}

	constructor(values: KVPair[], value_height: number, name_height: number) {
		this.values = values;
		this.value_height = value_height;
		this.name_height = name_height;
	}
}

export class KVPair {
	name?: string;
	value?: string;

	static parseAll(values: unknown): KVPair[] {
		if (!values) {
			return [];
		}
		if (!Array.isArray(values)) {
			throw new Error("Expected effects to be an array");
		}
		let effects: KVPair[] = [];
		for (const raw of values as unknown[]) {
			if (typeof raw === "string" || typeof raw === "number") {
				// Mirrors the pre-existing order: a string/number entry can never have
				// truthy `.name`/`.effect` properties, so checking type first (instead
				// of the original's `entry.name && entry.effect` first) is equivalent,
				// but lets `raw` stay `unknown` until narrowed here.
				effects.push(KVPair.nameless(raw));
				continue;
			}
			const entry = raw as Record<string, unknown>;
			if (entry && entry.name && entry.effect) {
				effects.push(KVPair.parse(entry));
			} else {
				effects.push(KVPair.parseKeyValue(entry));
			}
		}
		return effects;
	}

	static parseKeyValue(data: Record<string, unknown>) {
		const key: string = Object.keys(data)[0];
		// `data` is untyped parsed YAML, so `Object.values` can't infer an element type
		// beyond `unknown`; the `.toString()` call below is unchanged from before.
		const value: string = (Object.values(data)[0] as { toString(): string }).toString();
		return new KVPair(key, value);
	}

	static parse(data: Record<string, unknown>) {
		return new KVPair(data.name as string | undefined, data.effect as string | undefined);
	}

	static nameless(effect: string | number) {
		return new KVPair(undefined, effect?.toString());
	}

	constructor(name?: string, value?: string) {
		this.name = name;
		this.value = value;
	}
}
