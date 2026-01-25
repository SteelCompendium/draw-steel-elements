import { Featureblock, YamlReader } from "steel-compendium-sdk";

export class FeatureblockConfig {
    featureblock: Featureblock;

    public constructor(data: Featureblock) {
        this.featureblock = data;
    }

    public static readYaml(text: string) {
        const featureblock: Featureblock = Featureblock.read(new YamlReader(Featureblock.modelDTOAdapter), text);
        return new FeatureblockConfig(featureblock);
    }
}