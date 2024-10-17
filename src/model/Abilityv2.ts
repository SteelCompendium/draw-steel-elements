import { parseYaml } from "obsidian";
import {Effect} from "./Effect";

export class Abilityv2 {
    indent?: number;
    name?: string;
    cost?: string;
    flavor?: string;
    keywords: string[];
    type?: string;
    distance?: string;
    target?: string;
    trigger?: string;
    effects: Effect[];

    constructor(data: any) {
        this.indent = typeof data.indent === 'string' ? parseInt(data.indent) : data.indent;
        this.name = data.name;
        this.cost = data.cost;
        this.flavor = data.flavor;
        if (data.keywords) {
            this.keywords = Array.isArray(data.keywords) ? data.keywords : [data.keywords];
        }
        this.type = data.type;
        this.distance = data.distance;
        this.target = data.target;
        this.trigger = data.trigger;
        this.effects = Effect.parseAll(data.effects);
    }
}

export function parseAbilityData(source: string): Abilityv2 {
    let data: any;
    try {
        data = parseYaml(source);
    } catch (error: any) {
        throw new Error("Invalid YAML format: " + error.message);
    }
    return new Abilityv2(data);
}
