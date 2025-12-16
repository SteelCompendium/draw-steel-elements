import { parseYaml } from "obsidian";
import type { GlyphVariant } from "@drawSteelComponents/Common/types";

export class DsGlyph {
    variant: GlyphVariant;
    class: string = 'ds-glyph';

    public static parseYaml(source: string): DsGlyph {
        let data: any;
        try {
            data = parseYaml(source);
        } catch (error: any) {
            throw new Error("Invalid YAML format: " + error.message);
        }
        return DsGlyph.parse(data);
    }

    public static parse(data: any): DsGlyph {
        // If data is just a string, use it as the variant
        if (typeof data === 'string') {
            return new DsGlyph(data as GlyphVariant);
        }
        
        // Otherwise expect an object with variant property
        if (!data.variant) {
            throw new Error("DsGlyph requires a 'variant' property");
        }
        
        return new DsGlyph(data.variant);
    }

    constructor(variant: GlyphVariant) {
        this.variant = variant;
    }
}
