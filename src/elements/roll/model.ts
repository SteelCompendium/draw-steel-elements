// Plan 14 Task 5 (D5 §5.2) — RollModel: the ds-roll block's plain model. Folds
// the free-text `roll:` via parseRollExpression; `roll` wins over structured
// fields where both speak. Pure (schema already validated the shape).
import { parseRollExpression } from '@/framework/roll/parse';
import type { FlatDice, RollMode } from '@/framework/roll/types';

export interface RollModel {
	name?: string;
	mode: RollMode;
	/** Keyword characteristic → labels the manual stepper. */
	characteristicLabel?: string;
	/** Numeric characteristic → used directly (read-only in the bar). */
	characteristicValue?: number;
	/** Seed skill (+2) on. */
	skill: boolean;
	edges: number;
	banes: number;
	bonus: number;
	difficulty?: 'easy' | 'medium' | 'hard';
	mainAction: boolean;
	/** Flat-mode dice (defaults 1d10 when mode is flat and no dice given). */
	flat?: FlatDice;
	tiers?: { t1?: string; t2?: string; t3?: string };
	crit?: string;
	autoRoll: boolean;
	/** Human line shown under the head ("Power Roll + Reason", "1d6+2", …). */
	expressionText: string;
}

interface RawRoll {
	name?: string;
	roll?: string;
	mode?: RollMode;
	characteristic?: number | string;
	skill?: boolean | string;
	edges?: number;
	banes?: number;
	bonus?: number;
	difficulty?: 'easy' | 'medium' | 'hard';
	main_action?: boolean;
	dice?: string;
	tiers?: { t1?: string; t2?: string; t3?: string };
	crit?: string;
	auto_roll?: boolean;
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Schema-validated data → RollModel. `null` (empty block) ⇒ a bare power roll. */
export function parseRollModel(data: unknown): RollModel {
	const raw: RawRoll = data ?? {};
	const parsed = raw.roll !== undefined ? parseRollExpression(raw.roll) : undefined;

	const mode: RollMode = raw.mode ?? parsed?.mode ?? 'power-roll';

	// Characteristic: the roll string's keyword wins; else the structured field
	// (number ⇒ value, string keyword ⇒ stepper label).
	let characteristicLabel: string | undefined;
	let characteristicValue: number | undefined;
	if (parsed?.characteristic) characteristicLabel = capitalize(parsed.characteristic);
	else if (typeof raw.characteristic === 'number') characteristicValue = raw.characteristic;
	else if (typeof raw.characteristic === 'string') characteristicLabel = capitalize(raw.characteristic);

	// Flat dice: mode flat reads `dice:` ("1d6+2"); default 1d10.
	let flat: FlatDice | undefined;
	if (mode === 'flat') {
		const diceParsed = raw.dice !== undefined ? parseRollExpression(raw.dice) : undefined;
		flat = {
			count: diceParsed?.dice?.count ?? 1,
			sides: diceParsed?.dice?.sides ?? 10,
			bonus: diceParsed?.flatBonus ?? 0,
		};
	}

	const bonus = (raw.bonus ?? 0) + (mode !== 'flat' ? parsed?.flatBonus ?? 0 : 0);

	const expressionText =
		raw.roll?.trim() ||
		(mode === 'flat'
			? `${flat!.count}d${flat!.sides}${flat!.bonus ? `+${flat!.bonus}` : ''}`
			: [
					mode === 'test' ? 'Test' : mode === 'opposed' ? 'Opposed Power Roll' : 'Power Roll',
					characteristicLabel !== undefined ? `+ ${characteristicLabel}` : '',
					characteristicValue !== undefined ? `+ ${characteristicValue}` : '',
				]
					.filter(Boolean)
					.join(' '));

	return {
		name: raw.name,
		mode,
		characteristicLabel,
		characteristicValue,
		skill: raw.skill === true || typeof raw.skill === 'string',
		edges: raw.edges ?? 0,
		banes: raw.banes ?? 0,
		bonus,
		difficulty: raw.difficulty,
		mainAction: raw.main_action ?? false,
		flat,
		tiers: raw.tiers,
		crit: raw.crit,
		autoRoll: raw.auto_roll ?? false,
		expressionText,
	};
}
