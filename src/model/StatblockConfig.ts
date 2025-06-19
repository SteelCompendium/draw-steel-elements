import { Statblock, YamlReader } from "steel-compendium-sdk";

export class StatblockConfig {
    statblock: Statblock;

    public constructor(data: Statblock) {
        this.statblock = data;
    }

    public static readYaml(text: string) {
        const statblock: Statblock = Statblock.read(new YamlReader(Statblock.modelDTOAdapter), text);
        return new StatblockConfig(statblock);
    }

    // public toYaml(): string {
    //     const output = this.statblock.toDTO();
    //     output.indent = this.indent;
    //     return dumpYaml(output);
    // }
} 