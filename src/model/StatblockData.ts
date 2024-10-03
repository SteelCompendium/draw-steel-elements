import { parseYaml } from "obsidian";

export class StatblockData {
    name?: string;
    level?: number;
    roles?: string[];
    ancestry?: string[];
    ev?: number;
    stamina?: number;
    immunities?: string[];
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

export class Ability {
    name: string;
    cost?: string;
    type?: string;
    roll?: string;
    keywords: string[];
    distance?: string;
    target?: string;
    tier1?: string;
    tier2?: string;
    tier3?: string;
    crit?: string;
    effect?: string;
    additionalEffects?: AdditionalEffect[];
    trigger?: string;

    constructor(data: Partial<Ability>) {
        this.name = data.name?.trim() ?? '';
        this.cost = data.cost;
        this.type = data.type;
        this.roll = data.roll;
        if (data.keywords) {
            this.keywords = Array.isArray(data.keywords) ? data.keywords : [data.keywords];
        } else {
            this.keywords = [];
        }
        this.distance = data.distance;
        this.target = data.target;

        // Normalize tier properties
        this.tier1 = data.tier_1 ?? data.t1;
        this.tier2 = data.tier_2 ?? data.t2;
        this.tier3 = data.tier_3 ?? data.t3;

        this.crit = data.crit;
        this.effect = data.effect;
        this.additionalEffects = data.additional_effects?.map(ae => new AdditionalEffect(ae)) ?? [];
        this.trigger = data.trigger;
    }
}

export class AdditionalEffect {
    cost: string;
    effect: string;

    constructor(data: Partial<AdditionalEffect>) {
        this.cost = data.cost ?? '';
        this.effect = data.effect ?? '';
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
