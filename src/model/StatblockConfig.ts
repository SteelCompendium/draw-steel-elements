import { parseYaml } from "obsidian";
import { Statblock } from "steel-compendium-sdk";

/** SDK 3.0's MarkdownStatblockReader organization-name set (fixed, uppercase). */
const ORGANIZATIONS = new Set(["MINION", "HORDE", "PLATOON", "ELITE", "SOLO", "LEADER"]);

/**
 * OD-4 (F2 §2.1 B1): one-cycle compat shim for pre-6.0.0 homebrew `ds-sb` YAML.
 * `roles: string[]` → `organization` (entries in the organization-name set) + `role`
 * (the rest); `ancestry: string[]` → `keywords`. Modern keys always win per-axis.
 * DEPRECATED — remove in 7.0.0.
 */
export function applyLegacyStatblockKeys(raw: Record<string, any>): Record<string, any> {
    const shimRoles = Array.isArray(raw.roles)
        && raw.role === undefined && raw.organization === undefined;
    const shimAncestry = Array.isArray(raw.ancestry) && raw.keywords === undefined;
    const hasLegacyKeys = raw.roles !== undefined || raw.ancestry !== undefined;
    if (!hasLegacyKeys) return raw;

    const out: Record<string, any> = { ...raw };
    if (shimRoles) {
        const orgs: string[] = [];
        const roles: string[] = [];
        for (const entry of raw.roles as unknown[]) {
            const text = String(entry);
            (ORGANIZATIONS.has(text.toUpperCase()) ? orgs : roles).push(text);
        }
        out.organization = orgs.join(" ");
        out.role = roles.join(" ");
    }
    if (shimAncestry) {
        out.keywords = (raw.ancestry as unknown[]).map(String);
    }
    delete out.roles;
    delete out.ancestry;
    console.warn(
        "Draw Steel Elements: `roles:` / `ancestry:` in ds-sb/ds-statblock blocks are " +
        "deprecated since 6.0.0 — use `role:`, `organization:`, and `keywords:` instead. " +
        "Support will be removed in 7.0.0.");
    return out;
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
        const raw = (parseYaml(text) ?? {}) as Record<string, any>;
        return new StatblockConfig(Statblock.modelDTOAdapter(applyLegacyStatblockKeys(raw)));
    }
}
