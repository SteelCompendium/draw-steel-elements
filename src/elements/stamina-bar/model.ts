// D1 Task 3 (Plan 03) / F1 §6 step "Stamina Bar" — model.ts: parse(data, raw) wraps the
// existing @model/StaminaBar class VERBATIM (F3 "keep, renderer-agnostic" — same convention
// as elements/skills/model.ts). The pipeline already validated `data` against
// StaminaBarSchema.yaml (def.schema, F1 §2.4 step 3) before calling this, so
// StaminaBar.parse can construct the typed model directly — no re-validation, matching the
// legacy StaminaBar.parseYaml's post-validate parse step, now centralized in the pipeline.
// `raw` (the block's original source text) is unused: StaminaBar has no SDK reader that
// needs it.
//
// serialize(model): the BYTE-COMPAT boundary (D1 spec §"Step 3"/F1 §6), narrowed by SC-466.
// The legacy write path (the former CodeBlocks.updateStaminaBar -> updateCodeBlock ->
// updateMarkdownCodeBlock, in src/utils/CodeBlocks.ts, deleted in SC-454) did exactly
// `stringifyYaml(data).trim()` where `data` IS the StaminaBar class instance — reusing the
// SAME class instance shape here (rather than building a fresh DTO) keeps the field set and
// insertion order (collapsible, collapse_default, max_stamina, current_stamina, temp_stamina,
// recoveries, recoveries_max, height, style, _dse_anchor) falling out of StaminaBar's own
// constructor assignment order, unchanged. `.trim()` matches the legacy writer exactly and is
// also required by ReadingModeBlockHost.replaceSource, which does `newSource.split('\n')` — an
// untrimmed trailing "\n" from stringifyYaml would otherwise splice in a spurious blank line
// before the closing fence.
//
// SC-466 contract (supersedes byte-compat ONLY for keys absent from the source; a key present
// with the value `undefined` — FormModal's cleared field — counts as absent): StaminaBar.parse
// fills defaults into own properties (collapsible true, collapse_default false, current_stamina 0,
// temp_stamina 0, height 1, style "default"), and the legacy writer leaked them into the user's
// note on the first write. A key is now OMITTED from the written block iff it was ABSENT from the
// parsed source AND its value at write time still equals the default the parser filled in. Every
// key the source declared is written (even if equal to its default); an absent key whose value
// changed is written; key ORDER is unchanged (class order), so a block that declares every key
// serializes byte-identically to before. Blocks the plugin builds itself (fromHero / fromCreature,
// the modal test fixtures) were never parsed from a source, have no recorded absences, and keep
// the old whole-instance output.
//
// Where "which defaults did the source omit" lives: a module-private WeakMap keyed by the parsed
// instance — NOT an own property (an own property would be stringified by stringifyYaml, and a
// non-enumerable one would be lost by any spread/clone), and per-instance, so two blocks in one
// note never share it. Every writer (StaminaEditModal Apply, Catch Breath, the Recoveries strip
// and popover, the undo toast) mutates the SAME parsed instance in place, so the entry survives
// them all; an instance that was never parsed here simply has no entry and serializes whole.
import { stringifyYaml } from 'obsidian';
import { StaminaBar } from '@model/StaminaBar';

/** The values StaminaBar.parse fills in for a key the source did not declare. */
const PARSER_DEFAULTS: Readonly<Record<string, unknown>> = {
	collapsible: true,
	collapse_default: false,
	current_stamina: 0,
	temp_stamina: 0,
	height: 1,
	style: 'default',
};

/** Per parsed instance: the defaulted keys its source did NOT declare (SC-466). */
const undeclaredDefaults = new WeakMap<StaminaBar, ReadonlySet<string>>();

export function parse(data: unknown, _raw: string): StaminaBar {
	const model = StaminaBar.parse(data);
	const declared = data as Record<string, unknown>;
	undeclaredDefaults.set(
		model,
		new Set(Object.keys(PARSER_DEFAULTS).filter((key) => declared[key] === undefined)),
	);
	return model;
}

export function serialize(model: StaminaBar): string {
	const absent = undeclaredDefaults.get(model);
	if (!absent || absent.size === 0) return stringifyYaml(model).trim();
	// Own enumerable properties in class (insertion) order — exactly what stringifyYaml(model) walks.
	const written = Object.fromEntries(
		Object.entries(model).filter(([key, value]) => !(absent.has(key) && value === PARSER_DEFAULTS[key])),
	);
	return stringifyYaml(written).trim();
}
