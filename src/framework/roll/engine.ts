// Plan 14 Task 1 (D5 §2.2) — resolveRoll: the normative Draw Steel roll math.
// PURE + TOTAL: deterministic given `dice`, clamps out-of-range counts, no
// throws for junk numeric input, no Math.random, no wall clock, no DOM. This is
// the ONE place tiers/edges/banes/crits are computed — D7/D8 import it; a
// regression here is a bug against this module's tests, never re-derived.
//
// Rules provenance (D5 §1): 2d10 + characteristic; tiers ≤11 / 12–16 / 17+;
// single edge/bane = flat ±2, double = tier shift ±1 (opposed: flat ±4 instead);
// natural 19–20 (the SUM, before modifiers) always tier 3 — overriding even a
// double bane — and crits only on main-action ability power rolls.
import type { DiceSource, RollInput, RollResult, RollTier } from './types';

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Resolve one roll. Draws from `dice` (2 faces for tiered modes; `flat.count` for flat). */
export function resolveRoll(input: RollInput, dice: DiceSource): RollResult {
	const tiered = input.mode !== 'flat';

	// 1. Roll dice.
	const faces: number[] = [];
	if (tiered) {
		faces.push(dice.rollDie(10), dice.rollDie(10));
	} else {
		const count = Math.max(1, Math.trunc(input.flat?.count ?? 1));
		const sides = Math.max(2, Math.trunc(input.flat?.sides ?? 10));
		for (let i = 0; i < count; i++) faces.push(dice.rollDie(sides));
	}
	const natural = faces.reduce((sum, face) => sum + face, 0);

	// 2. Net edges/banes: cap EACH side at 2 first, THEN cancel (D5 §1.3;
	// rulebook "Rolling With Edges and Banes": "If you have a double edge and
	// just one bane, the roll is made with one edge, regardless of how many
	// individual edges contribute to the double edge" — symmetric for banes,
	// and double vs double cancels fully). Cancel-then-cap would wrongly turn
	// e.g. 3 edges + 1 bane into a double edge.
	const edges = Math.max(0, Math.trunc(input.edges ?? 0));
	const banes = Math.max(0, Math.trunc(input.banes ?? 0));
	const net = Math.min(edges, 2) - Math.min(banes, 2);

	// 3. Flat portion of edge/bane (mode-dependent; doubles shift instead — step 5).
	let edgeBaneFlat = 0;
	if (input.mode === 'opposed') {
		edgeBaneFlat = net === 2 ? 4 : net === -2 ? -4 : 2 * net; // double = ±4, single = ±2
	} else if (tiered) {
		edgeBaneFlat = Math.abs(net) >= 2 ? 0 : 2 * net; // double = no flat; single = ±2
	} // flat mode: edges/banes ignored entirely.

	// 4. Total.
	const total =
		natural +
		(input.characteristic ?? 0) +
		(input.skillBonus ?? 0) +
		(input.flatBonus ?? 0) +
		edgeBaneFlat +
		(input.mode === 'flat' ? input.flat?.bonus ?? 0 : 0);

	// 5-6. Tier (power-roll & test only) + nat detection.
	const isNat = tiered && natural >= 19;
	let tier: RollTier | undefined;
	let tierShifted = 0;
	if (input.mode === 'power-roll' || input.mode === 'test') {
		const base = (total <= 11 ? 1 : total <= 16 ? 2 : 3) as RollTier;
		const shift = net === 2 ? 1 : net === -2 ? -1 : 0;
		tier = clamp(base + shift, 1, 3) as RollTier;
		if (isNat) tier = 3; // nat 19–20 ALWAYS tier 3, overriding shifts (D5 §1.4)
		tierShifted = tier - base;
	}

	// 7. Crit: nat + power-roll + main-action ability, nothing else (D5 §1.4).
	const isCritical = isNat && input.mode === 'power-roll' && input.isMainActionAbility === true;

	return {
		input,
		dice: faces,
		natural,
		net,
		edgeBaneFlat,
		total,
		tier,
		tierShifted,
		isNat,
		isCritical,
		breakdown: renderBreakdown(input, faces, natural, net, edgeBaneFlat, tierShifted, total),
	};
}

/** Human-readable trace: every number in `total` accounted for, in apply order. */
function renderBreakdown(
	input: RollInput,
	faces: number[],
	natural: number,
	net: number,
	edgeBaneFlat: number,
	tierShifted: number,
	total: number,
): string {
	const sides = input.mode === 'flat' ? Math.max(2, Math.trunc(input.flat?.sides ?? 10)) : 10;
	const parts: string[] = [`${faces.length}d${sides} [${faces.join(', ')}] = ${natural}`];
	const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
	if (input.characteristic) parts.push(`${signed(input.characteristic)} characteristic`);
	if (input.skillBonus) parts.push(`${signed(input.skillBonus)} skill`);
	if (input.flatBonus) parts.push(`${signed(input.flatBonus)} bonus`);
	if (input.mode === 'flat' && input.flat?.bonus) parts.push(`${signed(input.flat.bonus)} bonus`);
	if (edgeBaneFlat !== 0) {
		parts.push(`${signed(edgeBaneFlat)} ${net > 0 ? 'edge' : 'bane'}`);
	} else if (Math.abs(net) === 2) {
		parts.push(
			input.mode === 'opposed'
				? `double ${net > 0 ? 'edge' : 'bane'}`
				: `double ${net > 0 ? 'edge' : 'bane'} → tier ${net > 0 ? '+1' : '−1'}`,
		);
	}
	return `${parts.join(', ')} → ${total}`;
}
