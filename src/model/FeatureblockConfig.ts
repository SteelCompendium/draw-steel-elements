import { parseYaml, stringifyYaml } from "obsidian";
import { Feature, Featureblock, YamlReader } from "steel-compendium-sdk";

/**
 * SC-141 fix round (M2) — normalize each `features[]` entry to carry a `feature_type`
 * before the SDK reader sees it.
 *
 * `Featureblock.fromDTO` maps `dto.features` through `Feature.fromDTO(f)`, but
 * `FeatureblockDTO`'s constructor assigns `source.features` through UNWRAPPED — they are
 * still the plain objects `parseYaml` produced. `Feature.fromDTO` only tolerates that when
 * the entry names its own `feature_type`; otherwise it falls through to `dto.isTrait()`,
 * a FeatureDTO METHOD that a plain object does not have, and throws
 * `TypeError: dto.isTrait is not a function`.
 *
 * Every `features[]` entry in this repo's authored fixtures (`featureblock/example.yaml`)
 * sets `feature_type`, so the whole plugin-side test surface sails past it — while
 * `steel-etl` emits **none**, so the throw hits 100% of real content. Measured over
 * data-unified 2026-08-10: **117/117 `type: featureblock` files and 35/35
 * `dynamic-terrain` files** fail to parse. That is a PRE-EXISTING bug on `main`,
 * independent of SC-141's type-scope root cause — SC-141 only surfaced it by bringing
 * `dynamic-terrain` into the family (before, those 35 failed one step earlier, as
 * "no adapter claims this type").
 *
 * The shim is deliberately the SDK's OWN decision, not a reimplementation: `Feature.isTrait`
 * is a public STATIC taking plain data, and it is exactly what `Feature.fromDTO` would have
 * called via `dto.isTrait()`. So an entry that already declares `feature_type` is untouched
 * (the authored path is byte-identical), and one that doesn't gets precisely the value the
 * SDK would have derived. Belongs here for the same reason `applyLegacyStatblockKeys` does
 * (StatblockConfig.ts): this model layer is the plugin's established seam for reconciling
 * real-world YAML with the SDK reader's expectations.
 *
 * Remove once the SDK wraps `FeatureblockDTO.features` in `FeatureDTO`s (or steel-etl emits
 * `feature_type` per entry) — see the SC-141 fix report for the ticket-worthy write-up.
 */
export function applyFeatureTypeDefaults(raw: unknown): unknown {
    if (raw === null || typeof raw !== "object") return raw;
    const block = raw as Record<string, unknown>;
    if (!Array.isArray(block.features)) return raw;
    let changed = false;
    const features: unknown[] = (block.features as unknown[]).map((entry): unknown => {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return entry;
        const feature = entry as Record<string, unknown>;
        if (feature.feature_type !== undefined) return entry;
        changed = true;
        return { ...feature, feature_type: Feature.isTrait(feature) ? "trait" : "ability" };
    });
    return changed ? { ...block, features } : raw;
}

/**
 * The SDK reader consumes TEXT, so the shim above (which needs parsed data) has to
 * round-trip. Deliberately IDENTITY-GATED: when nothing needed defaulting —
 * every authored fixture in this repo, every hand-written block — the ORIGINAL text is
 * handed to the reader untouched, so no `parseYaml`/`stringifyYaml` round-trip can perturb
 * quoting, key order or block scalars on the path the frozen shots render. A parse failure
 * also falls back to the original text, leaving the SDK reader to raise its own error
 * rather than this shim raising a worse one.
 */
function normalizeFeatureblockYaml(text: string): string {
    let parsed: unknown;
    try {
        parsed = parseYaml(text);
    } catch {
        return text;
    }
    const normalized = applyFeatureTypeDefaults(parsed);
    return normalized === parsed ? text : stringifyYaml(normalized);
}

export class FeatureblockConfig {
    featureblock: Featureblock;

    public constructor(data: Featureblock) {
        this.featureblock = data;
    }

    public static readYaml(text: string) {
        const featureblock: Featureblock = Featureblock.read(
            new YamlReader(Featureblock.modelDTOAdapter),
            normalizeFeatureblockYaml(text),
        );
        return new FeatureblockConfig(featureblock);
    }
}
