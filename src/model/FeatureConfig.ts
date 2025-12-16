import { parseYaml } from "obsidian";
import { Feature, YamlReader } from "steel-compendium-sdk";

export class FeatureConfig {
    feature: Feature;
    indent?: number;

    public constructor(data: Feature, indent?: number) {
        this.feature = data;
        this.indent = indent;
    }

    public static readYaml(text: string) {
        const feature: Feature = Feature.read(new YamlReader(Feature.modelDTOAdapter), text);
        const yaml = parseYaml(text);
        return new FeatureConfig(feature, yaml.indent);
    }

    public static allFrom(features: Feature[]): FeatureConfig[] {
        return features.map(f => new FeatureConfig(f));
    }

    // public toYaml(): string {
    //     const output = this.ability.toDTO();
    //     output.indent = this.indent;
    //     return dumpYaml(output);
    // }
} 
