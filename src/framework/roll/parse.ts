// Plan 14 Task 1 (D5 §2.5) — the lenient roll-expression parser. Ability YAML
// stores free text ("Power Roll + Reason", "2d10 + 5", "Might test"); this maps
// it to a partial roll shape. PURE, total (garbage → power-roll passthrough).
// A pure module export, NOT a RollService method (OD-D5-10).
import type { CharacteristicName, RollMode } from './types';

export interface ParsedRollExpression {
	/** "test" iff the word test appears; else "power-roll". */
	mode: RollMode;
	/** FIRST matched characteristic keyword — labels/binds the stepper, never a value. */
	characteristic?: CharacteristicName;
	/** Trailing "+ N" when NO characteristic keyword matched. */
	flatBonus?: number;
	/** Explicit "NdM" when present; tiered rolls default 2d10 without it. */
	dice?: { count: number; sides: number };
	raw: string;
}

const CHARACTERISTICS: readonly CharacteristicName[] = [
	'might',
	'agility',
	'reason',
	'intuition',
	'presence',
];

/** Parse an ability/`ds-roll` `roll:` string. Never throws. */
export function parseRollExpression(expr: string): ParsedRollExpression {
	const raw = expr;
	const lower = expr.toLowerCase();
	const out: ParsedRollExpression = {
		mode: /\btest\b/.test(lower) ? 'test' : 'power-roll',
		raw,
	};
	for (const ch of CHARACTERISTICS) {
		if (new RegExp(`\\b${ch}\\b`).test(lower)) {
			out.characteristic = ch;
			break; // first keyword wins ("Might or Agility" → might; the UI labels one stepper)
		}
	}
	const dice = lower.match(/\b(\d+)\s*d\s*(\d+)\b/);
	if (dice) out.dice = { count: parseInt(dice[1], 10), sides: parseInt(dice[2], 10) };
	if (!out.characteristic) {
		const bonus = lower.match(/\+\s*(\d+)\s*$/);
		if (bonus) out.flatBonus = parseInt(bonus[1], 10);
	}
	return out;
}
