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
    speed?: number;
    size?: string;
    stability?: number;
    freeStrike?: number;
    characteristics: Characteristics;
    traits: Trait[];
    abilities: AbilityOld[];

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
        this.abilities = data.abilities?.map(a => new AbilityOld(a)) ?? [];
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

/*
```ds-sb
name: Human Bandit Chief
level: 3
roles:
  - Boss
ancestry:
  - Human
  - Humanoid
ev: 54
stamina: 120
immunities:
  - Magic 2
  - Psionic 2
speed: 5
size: 1M
stability: 2
free_strike: 5
might: +2
agility: +2
reason: -1
intuition: +2
presence: +2
traits:
- name: End Effect
  effect: At the end of their turn, the bandit chief can take 5 damage to end one EoE effect affecting them. This damage can’t be reduced in any way.
abilities:
- name: Whip & Magic Longsword
  cost: Signature
  type: Action
  roll: 2d10 + 2
  keywords:
    - Attack
    - Magic
    - Melee
    - Weapon
  distance: Reach 1
  target: Two enemies or objects
  tier 1: 5 damage; pull 1
  tier 2: 9 damage; pull 2
  tier 3: 12 damage; pull 3
  crit: 12 damage; pull 3; another action
  effect: A target who is adjacent to the bandit chief after the attack is resolved takes 9 corruption damage.
  additional_effects:
    - cost: 2 VP
      effect: This ability targets three enemies or objects.
- name: Kneel, Peasant!
  type: Maneuver
  keywords:
  - Attack
  - Melee
  - Weapon
  distance: Reach 1
  target: One enemy or object
  t1: Push 1
  t2: Push 2; prone
  t3: Push 3; prone
  additional_effects:
    - cost: 2 VP
      effect: This ability targets each enemy adjacent to the bandit chief.
- name: Bloodstones
  type: Triggered Action
  keywords:
    - Magic
  distance: Self
  target: Self
  trigger: The bandit chief makes a power roll for an attack.
  effect: The bandit chief takes 4 corruption damage and increases the result of the power roll by one tier.
- name: Shoot!
  type: Villain Action
  cost: 1 VP
  keywords: Area
  distance: 10 burst
  target: Each ally
  effect: Each target can make a ranged free strike.
- name: Form Up!
  type: Villain Action
  cost: 2 VP
  effect: Each target shifts up to their speed. Until the end of the encounter, any enemy takes a bane on attacks against the bandit chief or any of the bandit chief’s allies if they are adjacent to that target.
  keywords: Area
  distance: 10 burst
  target: Each ally
  effect: Each target shifts up to their speed. Until the end of the encounter, any enemy takes a bane on attacks against the bandit chief or any of the bandit chief’s allies if they are adjacent to that target.
- name: Lead From the Front
  type: Villain Action 3
  cost: 3 VP
  keywords:
    - Attack
    - Weapon
  distance: Self
  target: Self
  effect: The bandit chief shifts twice their speed. During or after this movement, they can attack up to four targets with Whip & Magic Longsword. Any ally of the bandit chief adjacent to a target can make a free strike against that target.
```*/
