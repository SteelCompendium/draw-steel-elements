// Plan 06 Task 2 — initiative resolveRefs: bare-path `statblock` resolution + the
// merge-dependent tail of the legacy parseEncounterData that Task 1's sync parse split off
// (src/drawSteelAdmonition/EncounterData.ts:110-128 hero merge, :211-228 creature merge,
// :130/:133/:230/:240 validations, and the max_stamina-derived fills).
//
// Task 4 wires this as the initiative ElementDefinition's `resolveRefs`, so these errors
// surface from pipeline stage `reference` (error card) instead of legacy's sync throw —
// deliberate per plan; the wording stays identical.
//
// THREE PHASES, IN LOAD-BEARING ORDER:
//   1. MERGE — for each hero/creature whose `statblock` is a string, resolve it as a BARE
//      path (refs.resolveBarePath: legacy 5-step findFile with sourcePath "", first ds-*
//      block, legacy @/[[...]] stripping) and copy name / max_stamina (legacy `+` coercion)
//      / image ONLY-IF-UNSET. The `statblock` string STAYS on the model — legacy kept it
//      after merging, so it serializes back into the block byte-identically. Resolution
//      errors — file not found, no ds-* block, malformed block YAML — re-throw the legacy
//      multi-line "Failed to resolve … multiple instances …" hint verbatim
//      (EncounterData.ts:119-127). A block that parses to NULL is the one non-throwing
//      miss (resolveBarePath → null): legacy truth-tested the parsed data and silently
//      skipped the merge, so phase 2 reports any genuinely missing field instead.
//   2. VALIDATE — the four checks Task 1 deferred because legacy ran them only after the
//      merge, byte-identical messages, legacy per-entry order (name before max_stamina),
//      for ALL entries: a ref-FREE hero missing max_stamina must still fail here.
//   3. RE-APPLY the max_stamina-dependent fills parse had to skip when max was
//      statblock-sourced. Every fill is `??`/`== null`-guarded, so for a ref-free
//      (explicit-max) model this function is a byte-identity on serialize — and the keys
//      being filled were already INSERTED at their legacy positions by parse (assigned
//      undefined), so refilling never reorders serialized keys.
//      (For ref-bearing entries, the MERGED name/max_stamina/image keys are appended after
//      parse's keys where legacy inserted them mid-object — a value-neutral key-order
//      divergence on the first write-back of a ref-bearing block, accepted by Plan 06.)
import type { ReferenceService, ResolvedRef } from '@/framework/seams/refs';
import type { EncounterData } from './model';

/** The fields the legacy merge reads off a resolved statblock payload. */
interface StatblockFields {
	name?: unknown;
	stamina?: unknown;
	image?: unknown;
}

// SC-134: matches the SAME shape the built-in "scc" provider slot and SccRefProvider
// claim (src/framework/seams/refs.ts's SCC_PREFIX_RE, src/refs/SccRefProvider.ts's
// SCC_PREFIX) — a local mirror, not an import, following this codebase's existing
// convention of a per-file copy of this exact regex (also duplicated in
// ReferenceResolver.ts and rewriteSccAnchors.ts) rather than a shared export.
const SCC_PREFIX_RE = /^scc(\.v\d+)?:/;

/**
 * SC-134 fix: the encounter builder emits `statblock: scc.v1:<code>` (encounter/view.ts
 * soloGroup + the squad minion/captain rows), but this function previously resolved
 * EVERY `statblock` string as a bare vault path (`refs.resolveBarePath`), which never
 * consults the registered `SccRefProvider` — so a builder-emitted ref was treated as a
 * literal filename, could never be found, and threw, aborting the whole tracker (SC-134
 * report, `docs/scc-log.md`-adjacent diagnosis in the SC-134 Linear thread).
 *
 * Route an `scc:`/`scc.vN:`-shaped ref through `refs.resolve()` — the SAME provider
 * chain `resolveDeep`/every other element uses, so the registered `SccRefProvider`
 * resolves it — and leave every other `statblock` string on `resolveBarePath`'s
 * existing bare-vault-path behavior, byte-identical to before this fix. `sourcePath` is
 * hardcoded `''` for the scc branch, matching `resolveBarePath`'s own hardcoded `''`:
 * `SccRefProvider.resolve` never consults `req.sourcePath` (an SCC code is vault-global
 * identity, not note-relative), so there is nothing to lose by not threading the real
 * note path through here.
 *
 * Mirrors `resolveBarePath`'s null contract: a resolved ds-* block that parses to
 * null/undefined returns null (skip the merge, no error) rather than `ResolvedRef`.
 */
async function resolveStatblockRef(refs: ReferenceService, raw: string): Promise<ResolvedRef | null> {
	if (SCC_PREFIX_RE.test(raw.trim())) {
		const resolved = await refs.resolve(raw, '');
		return resolved.data == null ? null : resolved;
	}
	return refs.resolveBarePath(raw);
}

export async function resolveInitiativeRefs(
	model: EncounterData,
	refs: ReferenceService,
): Promise<EncounterData> {
	// ---- Phase 1: merge statblock refs (EncounterData.ts:110-128 / :211-228) ----
	for (const [index, hero] of model.heroes.entries()) {
		if (typeof hero.statblock === 'string') {
			try {
				// Throws the legacy messages on a dangling ref (file/block absent) and on
				// malformed block YAML; null ONLY when the block parses to null. SC-134:
				// dispatches to the SCC provider chain for `scc:`/`scc.vN:` refs, bare-path
				// otherwise — see resolveStatblockRef.
				const resolved = await resolveStatblockRef(refs, hero.statblock);
				// Legacy truth-tested the parsed DATA (`if (resolved)`): a block that
				// parses to null skips the merge without erroring.
				const data = resolved?.data as StatblockFields | null | undefined;
				if (data) {
					if (!hero.name && data.name) hero.name = data.name as string;
					if (!hero.max_stamina && data.stamina) hero.max_stamina = +(data.stamina as string | number);
					if (!hero.image && data.image) hero.image = data.image as string;
				}
			} catch (e) {
				// Legacy hint VERBATIM (EncounterData.ts:120-125), incl. the leading/trailing
				// newlines and the 4-space indent before the inner message.
				const message = `
Failed to resolve hero statblock reference at index ${index} (${hero.statblock}):
    ${(e as Error).message}

Are there multiple instances of the '${hero.statblock}' file in your vault? If so, please specify the full path.
`;
				throw new Error(message);
			}
		}
	}

	for (const group of model.enemy_groups) {
		for (const [creatureIndex, creature] of group.creatures.entries()) {
			if (typeof creature.statblock === 'string') {
				try {
					// SC-134: see resolveStatblockRef above.
					const resolved = await resolveStatblockRef(refs, creature.statblock);
					const data = resolved?.data as StatblockFields | null | undefined;
					if (data) {
						if (!creature.name && data.name) creature.name = data.name as string;
						if (!creature.max_stamina && data.stamina) creature.max_stamina = +(data.stamina as string | number);
						if (!creature.image && data.image) creature.image = data.image as string;
					}
				} catch (e) {
					const message = `
Failed to resolve creature statblock reference at index ${creatureIndex} (${creature.statblock}):
    ${(e as Error).message}

Are there multiple instances of the '${creature.statblock}' file in your vault? If so, please specify the full path.
`;
					throw new Error(message);
				}
			}
		}
	}

	// ---- Phase 2: deferred validations, ALL entries (legacy :130/:133/:230/:240) ----
	for (const [index, hero] of model.heroes.entries()) {
		if (!hero.name) {
			throw new Error(`Hero at index ${index} is missing the 'name' field.`);
		}
		if (typeof hero.max_stamina !== 'number') {
			throw new Error(`Hero '${hero.name}' is missing or has an invalid 'max_stamina' field.`);
		}
	}
	for (const group of model.enemy_groups) {
		for (const [creatureIndex, creature] of group.creatures.entries()) {
			if (!creature.name) {
				throw new Error(
					`Creature at index ${creatureIndex} in group '${group.name}' is missing the 'name' field.`,
				);
			}
			if (typeof creature.max_stamina !== 'number') {
				throw new Error(
					`Creature '${creature.name}' in group '${group.name}' is missing or has an invalid 'max_stamina' field.`,
				);
			}
		}
	}

	// ---- Phase 3: re-apply the max_stamina-dependent fills parse skipped ----
	// (EncounterData.ts:158 hero current, :159 hero temp, :318-319 existing instances,
	// :305-306 fresh instances, :252-255 minion pool.) All guarded → no-ops when parse
	// already filled them from an explicit max_stamina.
	for (const hero of model.heroes) {
		hero.current_stamina = hero.current_stamina ?? hero.max_stamina;
		hero.temp_stamina = hero.temp_stamina ?? 0;
	}
	for (const group of model.enemy_groups) {
		for (const creature of group.creatures) {
			if (group.is_squad && creature.squad_role === 'minion') {
				// parse's NaN-guard deliberately left the pool unset when max_stamina was
				// still statblock-sourced; with max merged + validated, apply the legacy
				// init. `== null` keeps an explicit or parse-initialized pool untouched.
				if (group.minion_stamina_pool == null) {
					group.minion_stamina_pool = creature.max_stamina * creature.amount;
				}
				// Squad-minion instances carry no per-instance stamina (legacy :256-264).
			} else {
				for (const instance of creature.instances ?? []) {
					instance.current_stamina = instance.current_stamina ?? creature.max_stamina;
					instance.temp_stamina = instance.temp_stamina ?? 0;
				}
			}
		}
	}

	return model;
}
