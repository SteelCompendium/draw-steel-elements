import {parseYaml} from "obsidian";

export abstract class AbstractModel {
    public static parseYaml(source: string) {
        let data: any;
        try {
            data = parseYaml(source);
        } catch (error: any) {
            throw new Error("Invalid YAML format: " + error.message);
        }
        return this.parse(data);
    }

    public static parse(data: any): AbstractModel {
        throw new Error("Subclasses of AbstractModel must implement parse()");
    }
}
