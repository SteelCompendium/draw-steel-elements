// SC-408 coverage manifests: the checkable definition of "comprehensive" for one UI surface.
// Pure data + two tiny helpers, no wdio/jest imports, so the SAME file is read by the e2e
// exercised-set gate (e2e/run.mjs), the jsdom census (test/dom/e2eCensus.test.ts) and the
// real-Obsidian census (e2e/specs/_census.e2e.ts).
//
// A control id names one interactive node (`data-dse-control`). Each id lists the interaction
// KINDS a scenario must drive at least once, using exactly the kinds the driver records:
//   click | click-disabled | dblclick | type | blur | press:<Key>
// `rows` annotates which S1 inventory rows (sc408-s1-stamina-inventory.md) the control covers.

export interface ControlSpec {
	kinds: readonly string[];
	rows: readonly string[];
}

/** A control on ANOTHER host's DOM that opens this surface (an entry point). */
export interface ReachSpec extends ControlSpec {
	host: string;
	control: string;
}

export interface Surface {
	name: string;
	reach: readonly ReachSpec[];
	controls: Readonly<Record<string, ControlSpec>>;
}

export function surface(
	name: string,
	def: { reach?: readonly ReachSpec[]; controls: Readonly<Record<string, ControlSpec>> },
): Surface {
	return { name, reach: def.reach ?? [], controls: def.controls };
}

/** Shorthand used by the manifests below. */
export const c = (kinds: readonly string[], rows: readonly string[] = []): ControlSpec => ({ kinds, rows });

/** Every id a surface declares (its own controls plus its reach entry points). */
export function idsOf(s: Surface): string[] {
	return [...Object.keys(s.controls), ...s.reach.map((r) => r.control)];
}

/** Every (control, kind) pair the exercised-set gate requires. */
export function pairsOf(s: Surface): Array<{ control: string; kind: string; surface: string }> {
	const out: Array<{ control: string; kind: string; surface: string }> = [];
	for (const [control, spec] of Object.entries(s.controls)) for (const kind of spec.kinds) out.push({ control, kind, surface: s.name });
	for (const r of s.reach) for (const kind of r.kinds) out.push({ control: r.control, kind, surface: s.name });
	return out;
}
