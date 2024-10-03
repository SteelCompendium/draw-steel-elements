import { parseYaml } from "obsidian";

export class Ability {
    indent?: number;
    name?: string;
    cost?: string;
    flavor?: string;
    keywords: string[];
    type?: string;
    distance?: string;
    target?: string;
    trigger?: string;
    roll?: string;
    t1?: string;
    t2?: string;
    t3?: string;
    crit?: string;
    effect?: string;
    fields?: Field[];
    spend?: Spend;
    persistent?: Persistent;
    notes?: string[] | string;

    constructor(data: any) {
        this.indent = typeof data.indent === 'string' ? parseInt(data.indent) : data.indent;
        this.name = data.name;
        this.cost = data.cost;
        this.flavor = data.flavor;
        if (data.keywords) {
            this.keywords = Array.isArray(data.keywords) ? data.keywords : [data.keywords];
        } else {
            this.keywords = [];
        }
        this.type = data.type;
        this.distance = data.distance;
        this.target = data.target;
        this.trigger = data.trigger;
        this.roll = data.roll;
        this.t1 = data.t1 ?? data["tier 1"] ?? data["11 or lower"];
        this.t2 = data.t2 ?? data["tier 2"] ?? data["12-16"];
        this.t3 = data.t3 ?? data["tier 3"] ?? data["17+"];
        this.crit = data.critical ?? data.crit ?? data["nat 19-20"];
        this.effect = data.effect;

        const fieldsData = data.custom_fields ?? data.fields;
        if (Array.isArray(fieldsData)) {
            this.fields = fieldsData.map((fieldData: any) => new Field(fieldData));
        } else {
            this.fields = [];
        }

        if (data.spend) {
            this.spend = new Spend(data.spend);
        }

        if (data.persistent) {
            this.persistent = new Persistent(data.persistent);
        }

        this.notes = data.notes ?? data.note;
    }
}

export class Field {
    name: string;
    value: string;

    constructor(data: any) {
        this.name = data.name?.trim() ?? '';
        this.value = data.value?.trim() ?? '';
    }
}

export class Spend {
    cost: string;
    value: string;

    constructor(data: any) {
        this.cost = String(data.cost).trim();
        this.value = data.value?.trim() ?? '';
    }
}

export class Persistent {
    cost: string;
    value: string;

    constructor(data: any) {
        this.cost = String(data.cost).trim();
        this.value = data.value?.trim() ?? '';
    }
}

export function parseAbilityData(source: string): Ability {
    let data: any;
    try {
        data = parseYaml(source);
    } catch (error: any) {
        throw new Error("Invalid YAML format: " + error.message);
    }
    return new Ability(data);
}
