// Plan 14 Task 4 (D5 §3.3) — the D7 injection hook. D5 ships the MANUAL path
// (stepper in the roll bar) + this interface; D7 composes a hero sheet and calls
// FeatureElementView.setCharacteristicProvider() so bound abilities read the
// hero's scores instead. Pure types — no Obsidian, no DOM.
import type { CharacteristicName } from './types';

export interface CharacteristicProvider {
	/** Score for a characteristic, or undefined if unknown (roller falls back to manual). */
	get(ch: CharacteristicName): number | undefined;
	/** Optional: an applicable-skill default (+2) the bar can pre-toggle. */
	skillBonus?(): number | undefined;
}
