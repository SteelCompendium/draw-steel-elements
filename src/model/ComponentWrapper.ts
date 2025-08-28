import {parseYaml} from "obsidian";
import {Creature, CreatureInstance, Hero} from "@drawSteelAdmonition/EncounterData";

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
        this.collapsible = collapsible ?? true;
        this.collapse_default = collapse_default ?? false;
    }
}
