import {parseYaml} from "obsidian";

/** Raw YAML shape read by ComponentWrapper.parse — every field optional, matching
 *  the pre-existing `?? true`/`?? false` default pattern in the constructor (no new
 *  runtime checks or coercions introduced). */
interface RawComponentWrapperData {
    collapsible?: boolean;
    collapse_default?: boolean;
}

/**
 * The model fields stay concrete booleans (`?? true` / `?? false` in the constructor):
 * `yaml`'s stringify DROPS own-properties whose value is `undefined`, and stamina-bar's
 * `serialize()` does a bare `stringifyYaml(model)` on this class, so an `undefined` field
 * would silently strip `collapsible:`/`collapse_default:` from a persisted block's YAML
 * on its first re-serialize. Whether a block actually DECLARED either key is decided
 * elsewhere, from the raw keys (`framework/chrome/collapsedKey.ts` `extractCollapseKeys`).
 */
export class ComponentWrapper {
    collapsible: boolean;
    collapse_default: boolean;

    public static parseYaml(source: string) {
        let data: unknown;
        try {
            data = parseYaml(source);
        } catch (error: unknown) {
            throw new Error("Invalid YAML format: " + (error instanceof Error ? error.message : String(error)));
        }
        return ComponentWrapper.parse(data);
    }

    public static parse(data: unknown): ComponentWrapper {
        const raw = data as RawComponentWrapperData;
        return new ComponentWrapper(
            raw.collapsible as boolean,
            raw.collapse_default as boolean);
    }

    constructor(collapsible: boolean, collapse_default: boolean) {
        this.collapsible = collapsible ?? true;
        this.collapse_default = collapse_default ?? false;
    }
}
