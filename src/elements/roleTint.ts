// Plan 09 Task 6 (D2 §3.7/§3.8, OD-5) — the SHARED combat-role tint helper.
//
// ONE role vocabulary for every role-tinted card: featureblock (T6a) maps its
// SDK `featureblock_type` ("Hazard Hexer" → hexer), statblock (T6b) maps its SDK
// `roles` line ("Horde, Harrier" → harrier). Extracted verbatim from the T6a
// featureblock view (fbRoleOf) when T6b needed the identical map.
//
// The tint pair is fails-safe by construction (the same pattern as
// renderFeature's data-dse-act): a mapped role sets BOTH
// [data-dse-role="<role>"] and the --dse-role ELEMENT-SET ALIAS
// (--dse-role: var(--dse-role-<role>)); unmapped text sets NEITHER, so CSS
// consuming var(--dse-role, <fallback>) degrades to grey/monochrome. In Legacy
// every --dse-role-* token is the muted grey anyway — the accent is Steel-only
// (OD-2; D3 lights the tokens).

/** The combat-role vocabulary (matches the --dse-role-* token family, D2 §5). */
export const DSE_ROLES = [
	'ambusher',
	'harrier',
	'artillery',
	'brute',
	'controller',
	'hexer',
	'mount',
	'support',
	'defender',
	'leader',
	'solo',
	'minion',
] as const;
export type DseRole = (typeof DSE_ROLES)[number];

/**
 * Extracts the combat role from role-bearing SDK text ("Hazard Hexer" → "hexer",
 * "Horde, Harrier" → "harrier"). Returns undefined when no role word appears —
 * the caller then sets NO attribute/alias, so the tint fails safe to monochrome.
 */
export function roleOf(text: string | undefined): DseRole | undefined {
	if (!text) return undefined;
	const words = text.toLowerCase().split(/[^a-z]+/);
	return DSE_ROLES.find((role) => words.includes(role));
}

/** Applies the fails-safe tint pair to a card root: attribute + alias, or neither. */
export function applyRoleTint(el: HTMLElement, text: string | undefined): DseRole | undefined {
	const role = roleOf(text);
	if (role) {
		el.setAttribute('data-dse-role', role);
		el.style.setProperty('--dse-role', `var(--dse-role-${role})`);
	}
	return role;
}
