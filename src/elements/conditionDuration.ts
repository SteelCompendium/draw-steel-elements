// SC-186 — shared condition DURATION helpers: the additive `Condition.duration` field's
// resolve/format logic, used by every consumer that shows a duration badge or acts on
// duration (ConditionsPanel's strip badge + save-ends roll, the hero sheet's respite
// EoE clear, and ConditionsModal's row badges + inline editor). Centralizes what used to
// be duplicated ad hoc (panel.ts's durationBadgeText/isSaveEnds, hero/view.ts's private
// conditionDuration) so every consumer reads the SAME value the SAME way, and so the
// Customize clobbering bug (opening the old modal and hitting Save silently stripped a
// YAML-authored duration because Save wrote BOTH controls back unconditionally) cannot
// recur: `resolveDuration` is the one place duration is ever DERIVED, and callers that
// migrate a legacy `effect`-string duration into the first-class field do so explicitly
// (ConditionsModal.setEffect), never as a side effect of writing an unrelated control.
import type { Condition } from '@drawSteelAdmonition/EncounterData';

export type ConditionDuration = 'eot' | 'save-ends' | 'eoe';

const KNOWN_DURATIONS: readonly ConditionDuration[] = ['eot', 'save-ends', 'eoe'];

function isKnownDuration(value: string): value is ConditionDuration {
	return (KNOWN_DURATIONS as readonly string[]).includes(value);
}

/** Tolerant legacy fallback: the pre-SC-186 free-text `effect` duration vocabulary
 *  ('save ends' | 'eot' | 'eoe', case/whitespace-insensitive — the only duration
 *  spelling that existed before the first-class field). */
function legacyDurationFromEffect(effect: string | undefined): ConditionDuration | undefined {
	switch ((effect ?? '').trim().toLowerCase()) {
		case 'save ends':
			return 'save-ends';
		case 'eot':
			return 'eot';
		case 'eoe':
			return 'eoe';
		default:
			return undefined;
	}
}

/**
 * The condition's EFFECTIVE duration: the first-class `duration` field wins when
 * present and valid; otherwise the legacy `effect`-string is tolerantly parsed (spec:
 * "readers... prefer duration and keep the existing tolerant effect-string parse as
 * legacy fallback, so hand-authored YAML keeps working unchanged"). Absent both ->
 * undefined ("until removed").
 */
export function resolveDuration(entry: Pick<Condition, 'duration' | 'effect'>): ConditionDuration | undefined {
	if (entry.duration && isKnownDuration(entry.duration)) return entry.duration;
	return legacyDurationFromEffect(entry.effect);
}

/** The panel/badge text vocabulary (spec §1.5) — null when the condition carries no
 *  duration (renders no badge). */
export function durationBadgeText(duration: ConditionDuration | undefined): string | null {
	switch (duration) {
		case 'save-ends':
			return 'Save Ends';
		case 'eot':
			return 'EoT';
		case 'eoe':
			return 'EoE';
		default:
			return null;
	}
}

/** Only "save ends" offers the d10-save affordance (spec §4.4: "roll d10, 6+ ends"). */
export function isSaveEnds(duration: ConditionDuration | undefined): boolean {
	return duration === 'save-ends';
}
