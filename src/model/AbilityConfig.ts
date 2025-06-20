import { parseYaml } from "obsidian";
import { Ability, YamlReader } from "steel-compendium-sdk";

export class AbilityConfig {
    ability: Ability;
    indent?: number;

    public constructor(data: Ability, indent?: number) {
        this.ability = data;
        this.indent = indent;
    }

    public static readYaml(text: string) {
        const ability: Ability = Ability.read(new YamlReader(Ability.modelDTOAdapter), text);
        const yaml = parseYaml(text);
        return new AbilityConfig(ability, yaml.indent);
    }

    public static allFrom(abilities: Ability[]): AbilityConfig[] {
        return abilities.map(a => new AbilityConfig(a));
    }

    // public toYaml(): string {
    //     const output = this.ability.toDTO();
    //     output.indent = this.indent;
    //     return dumpYaml(output);
    // }
} 