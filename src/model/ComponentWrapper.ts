import {parseYaml} from "obsidian";
import {Creature, CreatureInstance, Hero} from "@drawSteelAdmonition/EncounterData";

/**
 * D4 §1.3 amendment (Plan 13 Task 5, blocker resolution — see
 * docs/superpowers/dse-overhaul... task-5-report-d4.md "Continuation"). The blocked
 * approach made `collapsible`/`collapse_default` `undefined` on the model when a block
 * omitted them, so `resolveCollapsePrefs` could fall through to the global pref — but
 * `yaml`'s stringify DROPS own-properties whose value is `undefined`, so any persisted
 * block that never declared those keys silently lost the `collapsible:`/
 * `collapse_default:` lines from its on-disk YAML the first time it was re-serialized
 * (stamina-bar's `serialize()` does a bare `stringifyYaml(model)` on this class). That
 * broke byte-compat for the base case, not just the new `prefs:` feature.
 *
 * Fix: the model fields stay concrete booleans (the `?? true` / `?? false` below,
 * UNCHANGED from pre-D4) — every serialize path stays byte-identical forever,
 * structurally, because the model never carries `undefined` for these two fields. What
 * changed is a side channel recording whether the source YAML actually DECLARED each
 * key, independent of the model's (always-concrete) value. Only `resolveCollapsePrefs`
 * (render time, never serialize) consults it: declared -> the model's value wins
 * (author wins, exactly today's behavior); not declared -> the global pref applies
 * instead of the old hard default.
 *
 * Known/accepted semantic edge: once a persisted block's edit cycle materializes
 * `collapsible: true` / `collapse_default: false` onto disk (today's existing
 * serialize behavior, unchanged by this file), that block's key reads as DECLARED on
 * every later parse and the global pref no longer applies to it. This is identical to
 * the status quo's behavior (a materialized value has always been "the" value — there
 * was never anything else to fall back to); the amendment just makes it explicit via
 * the side channel instead of leaving it as an emergent property of `?? true`/`?? false`.
 */
export interface DeclaredCollapsePrefs {
    collapsible: boolean;
    collapseDefault: boolean;
}

/** Keyed by the constructed ComponentWrapper (or subclass) instance itself — never
 *  touches the model shape, so it cannot leak into serialize output, and it is
 *  reclaimed automatically once the model instance is garbage-collected. */
const declaredCollapsePrefsByInstance = new WeakMap<object, DeclaredCollapsePrefs>();

/**
 * Whether `collapsible:` / `collapse_default:` were present (non-`undefined`) in the
 * source data used to construct `model`. Returns `undefined` for a model never
 * constructed through ComponentWrapper's constructor (shouldn't happen for any real
 * element model today — both `Skills` and `StaminaBar` extend ComponentWrapper — but
 * `resolveCollapsePrefs` treats that defensively as "declared" so it falls back to the
 * model's own (already-concrete) field rather than throwing or silently misreading an
 * unrelated object.
 */
export function declaredCollapsePrefs(model: object): DeclaredCollapsePrefs | undefined {
    return declaredCollapsePrefsByInstance.get(model);
}

export class ComponentWrapper {
    collapsible: boolean;
    collapse_default: boolean;

    public static parseYaml(source: string) {
        let data: any;
        try {
            data = parseYaml(source);
        } catch (error: any) {
            throw new Error("Invalid YAML format: " + error.message);
        }
        return ComponentWrapper.parse(data);
    }

    public static parse(data: any): ComponentWrapper {
        return new ComponentWrapper(
            data.collapsible,
            data.collapse_default);
    }

    constructor(collapsible: boolean, collapse_default: boolean) {
        // Recorded from the RAW constructor args, before the `?? true`/`?? false`
        // coercion below: YAML booleans are never `undefined` themselves, so
        // "the source didn't declare the key" and "this arg is undefined" are the same
        // condition. Subclasses (Skills, StaminaBar) pass their own constructor's
        // collapsible/collapse_default straight through to `super()`, so this single
        // recording site covers every ComponentWrapper subclass uniformly — including
        // synthetic construction (e.g. StaminaBar.fromHero/fromCreature), which passes
        // explicit `false` and is therefore correctly treated as "declared".
        declaredCollapsePrefsByInstance.set(this, {
            collapsible: collapsible !== undefined,
            collapseDefault: collapse_default !== undefined,
        });
        this.collapsible = collapsible ?? true;
        this.collapse_default = collapse_default ?? false;
    }
}
