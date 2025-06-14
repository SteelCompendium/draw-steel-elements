import { parseYaml } from "obsidian";
import { Ability } from "./Ability";
import { Trait } from "./Trait";

export class StatblockData {
    name?: string;
    level?: number;
    roles?: string[];
    ancestry?: string[];
    ev?: string;
    stamina?: number;
    immunities?: string[];
    weaknesses?: string[];
    speed?: string;
    size?: string;
    stability?: number;
    freeStrike?: number;
    withCaptain?: string;
    characteristics: Characteristics;
    traits: Trait[];
    abilities: Ability[];

    constructor(data: Partial<StatblockData> & { free_strike?: number, with_captain?: string }) {
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
        this.withCaptain = data.with_captain ?? data.withCaptain;
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

export function parseStatblockData(source: string): StatblockData {
    let data: any;
    try {
        data = parseYaml(source);
    } catch (error: any) {
        throw new Error("Invalid YAML format: " + error.message);
    }

    const statblockData: Partial<StatblockData> = {};

    // Directly assign known properties
    statblockData.name = data.name;
    statblockData.level = data.level;
    statblockData.roles = data.roles ?? [];
    statblockData.ancestry = data.ancestry ?? [];
    statblockData.ev = data.ev;
    statblockData.stamina = data.stamina;
    statblockData.immunities = data.immunities ?? [];
    statblockData.weaknesses = data.weaknesses ?? [];
    statblockData.speed = "" + data.speed;
    statblockData.size = data.size;
    statblockData.stability = data.stability;
    statblockData.freeStrike = data.free_strike ?? data.freeStrike;
    statblockData.withCaptain = data.with_captain;

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
        statblockData.traits = data.traits.map((t: any) => Trait.parseData(t));
    }

    // Handle abilities
    if ('abilities' in data) {
        statblockData.abilities = data.abilities.map((a: any) => Ability.parseData(a));
    }

    return new StatblockData(statblockData);
}

function parseCharacteristic(attrValue: string): number | undefined {
    if (typeof attrValue === 'string') {
        const value = parseInt(attrValue.replace('+', ''));
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
