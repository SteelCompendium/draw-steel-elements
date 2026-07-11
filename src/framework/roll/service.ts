// Plan 14 Task 2 (D5 §2.3/§6.3) — RollService: the plugin-scoped roll seam.
// Owns the ACTIVE dice source: native Math.random d10s, or (pref-gated,
// capability-detected) the Dice Roller bridge. The math itself is always
// resolveRoll — the bridge only supplies faces, which the service replays into
// the pure engine. Detection re-runs per roll (cheap: a Set lookup + property
// probe) so enabling/disabling Dice Roller mid-session Just Works and a broken
// bridge degrades to native on the very next roll (§6.3).
//
// History is NOT recorded here (reconciliation delta 8): the service has no
// blockKey — callers (the feature roll controller, RollView) write cx.session.
import type { App } from 'obsidian';
import type { PreferenceStore } from '../seams/prefs';
import type { DiceSource, RollInput, RollResult } from './types';
import { resolveRoll } from './engine';
import { detectDiceRoller } from './diceBridge';

export type RollDelegate = 'native' | 'dice-roller';

/** The interactive roll seam views reach via cx.roll (fills the F1 stub). */
export interface RollService {
	/** The pure math, re-exposed for callers who bring their own dice. */
	resolve(input: RollInput, dice?: DiceSource): RollResult;
	/** Roll now with the active source (native, or the Dice Roller bridge). */
	roll(input: RollInput): Promise<RollResult>;
	/** The always-available native source (tests/tools may want it explicitly). */
	readonly dice: DiceSource;
	/** What the NEXT roll() would use, honoring the rollerEngine pref + live detection. */
	readonly delegate: RollDelegate;
}

/** The in-repo RNG (OD table: no dependency). 1..sides, uniform. */
export const NATIVE_DICE: DiceSource = {
	rollDie: (sides: number): number => 1 + Math.floor(Math.random() * sides),
};

/** Replays pre-rolled faces into the sync engine (bridge → resolveRoll marriage). */
function replaySource(faces: readonly number[]): DiceSource {
	let i = 0;
	return { rollDie: (): number => faces[i++] ?? 1 };
}

class DseRollService implements RollService {
	readonly dice = NATIVE_DICE;

	constructor(
		private readonly prefs: PreferenceStore,
		private readonly app?: App,
	) {}

	get delegate(): RollDelegate {
		return this.activeBridge() ? 'dice-roller' : 'native';
	}

	resolve(input: RollInput, dice: DiceSource = NATIVE_DICE): RollResult {
		return resolveRoll(input, dice);
	}

	async roll(input: RollInput): Promise<RollResult> {
		const bridge = this.activeBridge();
		if (bridge) {
			try {
				const count = input.mode === 'flat' ? Math.max(1, Math.trunc(input.flat?.count ?? 1)) : 2;
				const sides = input.mode === 'flat' ? Math.max(2, Math.trunc(input.flat?.sides ?? 10)) : 10;
				const faces = await bridge.rollDice(count, sides);
				return resolveRoll(input, replaySource(faces));
			} catch (error) {
				// The bridge can never break rolling (§6): log once, fall through to native.
				console.warn('Draw Steel Elements: Dice Roller bridge failed; rolling natively.', error);
			}
		}
		return resolveRoll(input, NATIVE_DICE);
	}

	/** The bridge, iff the pref asks for it AND detection succeeds right now. */
	private activeBridge() {
		if (this.prefs.get('rollerEngine') !== 'dice-roller') return null;
		return this.app ? detectDiceRoller(this.app) : null;
	}
}

/** Construct the roll seam. `app` optional: without it (tests/harness) the
 *  service is native-only — detection needs the live plugin registry. */
export function createRollService(prefs: PreferenceStore, app?: App): RollService {
	return new DseRollService(prefs, app);
}
