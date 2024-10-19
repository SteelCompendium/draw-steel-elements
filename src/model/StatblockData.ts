import { parseYaml } from "obsidian";
import {Ability} from "./Ability";

export class StatblockData {
    name?: string;
    level?: number;
    roles?: string[];
    ancestry?: string[];
    ev?: number;
    stamina?: number;
    immunities?: string[];
    weaknesses?: string[];
    speed?: number;
    size?: string;
    stability?: number;
    freeStrike?: number;
    characteristics: Characteristics;
    traits: Trait[];
    abilities: Ability[];

    constructor(data: Partial<StatblockData>) {
        this.name = data.name;
        this.level = data.level;
        this.roles = data.roles ?? [];
        this.ancestry = data.ancestry ?? [];
        this.ev = data.ev;
        this.stamina = data.stamina;
        this.immunities = data.immunities ?? [];
        this.weaknesses = data.weaknesses ?? [];
        this.speed = data.speed;
        this.size = data.size;
        this.stability = data.stability;
        this.freeStrike = data.free_strike ?? data.freeStrike;
        this.characteristics = data.characteristics ? new Characteristics(data.characteristics) : new Characteristics({});
        this.traits = data.traits?.map(t => new Trait(t)) ?? [];
        this.abilities = data.abilities?.map(a => new Ability(a)) ?? [];
    }
}

export class Characteristics {
    might?: number;
    agility?: number;
    reason?: number;
    intuition?: number;
    presence?: number;

    constructor(data: Partial<Characteristics>) {
        this.might = data.might;
        this.agility = data.agility;
        this.reason = data.reason;
        this.intuition = data.intuition;
        this.presence = data.presence;
    }
}

export class Trait {
    name: string;
    type?: string;
    effect: string;

    constructor(data: Partial<Trait>) {
        this.name = data.name?.trim() ?? '';
        this.type = data.type?.trim();
        this.effect = data.effect?.trim() ?? '';
    }
}

export function parseStatblockData(source: string): StatblockData {
    let data: any;
    try {
        data = parseYaml(source);
    } catch (error: any) {
        throw new Error("Invalid YAML format: " + error.message);
    }

    let statblockData: Partial<StatblockData> = {};

    // Directly assign known properties
    statblockData.name = data.name;
    statblockData.level = data.level;
    statblockData.roles = data.roles ?? [];
    statblockData.ancestry = data.ancestry ?? [];
    statblockData.ev = data.ev;
    statblockData.stamina = data.stamina;
    statblockData.immunities = data.immunities ?? [];
    statblockData.weaknesses = data.weaknesses ?? [];
    statblockData.speed = data.speed;
    statblockData.size = data.size;
    statblockData.stability = data.stability;
    statblockData.freeStrike = data.free_strike ?? data.freeStrike;

    // Handle characteristics
    statblockData.characteristics = new Characteristics({
        might: parseCharacteristic(data.might),
        agility: parseCharacteristic(data.agility),
        reason: parseCharacteristic(data.reason),
        intuition: parseCharacteristic(data.intuition),
        presence: parseCharacteristic(data.presence),
    });

    // Handle traits
    if ('traits' in data) {
        statblockData.traits = data.traits.map((t: any) => new Trait(t));
    }

    // Handle abilities
    if ('abilities' in data) {
        statblockData.abilities = data.abilities.map((a: any) => new Ability(a));
    }

    return new StatblockData(statblockData);
}

function parseCharacteristic(attrValue: string): number | undefined {
    if (typeof attrValue === 'string') {
        let value = parseInt(attrValue.replace('+', ''));
        if (!isNaN(value)) {
            return value;
        } else {
            console.warn(`Invalid characteristic value: ${attrValue}`);
            return undefined;
        }
    } else if (typeof attrValue === 'number') {
        return attrValue;
    } else {
        return undefined;
    }
}
