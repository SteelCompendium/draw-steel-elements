import {parseYaml} from "obsidian";

export class CommonElementWrapper {
    public collapsible: boolean;
    public collapse_default: boolean;

    public static parseYaml(source: string) {
        let data: any;
        try {
            data = parseYaml(source);
        } catch (error: any) {
            throw new Error("Invalid YAML format: " + error.message);
        }
        return CommonElementWrapper.parse(data);
    }

    public static parse(data: any): CommonElementWrapper {
        return new CommonElementWrapper(
            data.collapsible,
            data.collapse_default);
    }

    constructor(collapsible: boolean, collapse_default: boolean) {
        this.collapsible = collapsible ?? true;
        this.collapse_default = collapse_default ?? false;
    }
}
