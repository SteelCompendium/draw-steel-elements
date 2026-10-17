import { parseYaml } from "obsidian";
import { Feature, Statblock } from "steel-compendium-sdk";

/** SDK 3.0's MarkdownStatblockReader organization-name set (fixed, uppercase). */
const ORGANIZATIONS = new Set(["MINION", "HORDE", "PLATOON", "ELITE", "SOLO", "LEADER"]);

/**
 * OD-4 (F2 §2.1 B1): one-cycle compat shim for pre-7.0.0 homebrew `ds-sb` YAML.
 * `roles: string[]` → `organization` (entries in the organization-name set) + `role`
 * (the rest); `ancestry: string[]` → `keywords`. Modern keys always win per-axis.
 * DEPRECATED — remove in 8.0.0.
 */
/** A legacy key may be a list (the documented shape) or a bare scalar (a plausible
 * hand-authoring mistake, e.g. `roles: Horde`). Coerce either into a one-entry list
 * rather than silently dropping the value. */
function toLegacyList(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [value];
}

export function applyLegacyStatblockKeys(raw: Record<string, unknown>): Record<string, unknown> {
    const shimRoles = raw.roles !== undefined
        && raw.role === undefined && raw.organization === undefined;
    const shimAncestry = raw.ancestry !== undefined && raw.keywords === undefined;
    const hasLegacyKeys = raw.roles !== undefined || raw.ancestry !== undefined;
    if (!hasLegacyKeys) return raw;

    const out: Record<string, unknown> = { ...raw };
    if (shimRoles) {
        // Mirrors the SDK 3.0 MarkdownStatblockReader's classification loop
        // (data-sdk-npm/src/io/markdown/MarkdownStatblockReader.ts:130-141) exactly:
        // last-wins per axis, not accumulate-and-join.
        let organization = "";
        let role = "";
        for (const entry of toLegacyList(raw.roles)) {
            const text = String(entry);
            if (ORGANIZATIONS.has(text.toUpperCase())) {
                organization = text;
            } else {
                role = text;
            }
        }
        out.organization = organization;
        out.role = role;
    }
    if (shimAncestry) {
        out.keywords = toLegacyList(raw.ancestry).map(String);
    }
    delete out.roles;
    delete out.ancestry;
    console.warn(
        "Draw Steel Elements: `roles:` / `ancestry:` in ds-sb/ds-statblock blocks are " +
        "deprecated since 7.0.0 — use `role:`, `organization:`, and `keywords:` instead. " +
        "Support will be removed in 8.0.0.");
    return out;
}

const FEATURE_TYPES = new Set(["ability", "trait", "subtrait"]);

/**
 * SC-390: settle an off-enum or missing `feature_type` on a statblock's `features[]`.
 *
 * steel-etl embeds a beastheart companion's plain Level-1 features as `feature_type:
 * feature` (the member's own entity type), and hand-written blocks may omit the key. SDK
 * 3.0.0's `Feature.fromDTO` handles both by calling `dto.isTrait()`, which a plain parsed
 * object does not have — the whole card failed with "dto.isTrait is not a function" (fixed in
 * a later SDK, SC-155, which calls the static rule instead). This applies that SAME rule
 * (`Feature.isTrait`: no keywords, usage, distance or target => trait, else ability) up
 * front, so the card renders on the pinned SDK. It is a no-op on an SDK that has the fix
 * (the type is already settled the way the SDK would settle it) and can be deleted with the
 * SDK pin bump that carries SC-155.
 */
export function settleStatblockFeatureTypes(raw: Record<string, unknown>): Record<string, unknown> {
    const features = raw.features;
    if (!Array.isArray(features)) return raw;
    let changed = false;
    const settled = features.map((entry: unknown) => {
        if (entry === null || typeof entry !== "object") return entry;
        const feature = entry as Record<string, unknown>;
        if (typeof feature.feature_type === "string" && FEATURE_TYPES.has(feature.feature_type)) return entry;
        changed = true;
        return { ...feature, feature_type: Feature.isTrait(feature) ? "trait" : "ability" };
    });
    return changed ? { ...raw, features: settled } : raw;
}

export class StatblockConfig {
    statblock: Statblock;

    public constructor(data: Statblock) {
        this.statblock = data;
    }

    public static readYaml(text: string): StatblockConfig {
        // Parse once with Obsidian's YAML (same parser the rest of the plugin uses),
        // shim legacy keys, then feed the SDK's DTO→model adapter directly. This
        // replaces the SDK YamlReader path (which parses with the `yaml` package)
        // so the shim sees the raw object before the DTO is constructed.
        const raw = (parseYaml(text) ?? {}) as Record<string, unknown>;
        return new StatblockConfig(Statblock.modelDTOAdapter(settleStatblockFeatureTypes(applyLegacyStatblockKeys(raw))));
    }
}
