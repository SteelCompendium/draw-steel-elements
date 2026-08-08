// SC-132 CANDIDATE-STAGE ONLY — the stamina-cluster design-direction switch.
//
// The ground-up High-Fantasy Steel redesign of the stamina cluster is being run
// candidates-first: 3-4 genuinely distinct directions, implemented far enough to
// screenshot for real, presented to Scott for a pick. Nothing here ships as-is —
// once a direction is chosen it gets implemented properly (full states, print,
// tests, modal alignment) and THIS MODULE IS DELETED along with the three losing
// candidates' CSS.
//
// Contract (deliberately narrow, so the candidate work cannot touch production):
//   * The active candidate defaults to `null`, and NOTHING in the plugin ever sets
//     it — only the visual harness's `?cand=` URL param does (visual-harness/
//     entry.ts). So in the real plugin, in jest, and in the standard `npm run
//     shots` sweep, `getStaminaCandidate()` is always null.
//   * When it is null, `renderStaminaBar` builds byte-identical DOM to before
//     (StaminaBarPanel.ts's candidate block is behind an early return), so every
//     existing stamina test and every frozen legacy/print PNG is untouched by
//     construction, not merely by CSS scoping.
//   * Every candidate CSS rule is additionally prefixed with the
//     `[data-dse-stamina-cand=…]` root attribute, which likewise only the harness
//     ever stamps — belt and braces on the freeze gate.
export type StaminaCandidate = 'a' | 'b' | 'c' | 'd';

let active: StaminaCandidate | null = null;

/** Harness-only. Production/jest never call this, so the default (null) holds. */
export function setStaminaCandidate(value: StaminaCandidate | null): void {
	active = value;
}

export function getStaminaCandidate(): StaminaCandidate | null {
	return active;
}

/** Narrows an untrusted string (the `?cand=` param) to a known candidate id. */
export function parseStaminaCandidate(value: string | null | undefined): StaminaCandidate | null {
	return value === 'a' || value === 'b' || value === 'c' || value === 'd' ? value : null;
}
