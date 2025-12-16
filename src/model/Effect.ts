import type { Feature } from "@model/Feature";
import { PowerRoll } from "@model/PowerRoll";

export class Effect {
    name?: string; //implemented
    effect?: string; //implemented
    features?: Feature[];
    powerRoll?: PowerRoll; //implemented

    static parse(data: any): Effect {
        // Import Feature dynamically to avoid circular dependency issues
        const { Feature } = require("./Feature");

        const features: Feature[] | undefined =
            data.features && Array.isArray(data.features)
                ? data.features.map((f: any) => Feature.parse(f))
                : undefined;

        return new Effect(
            data.name,
            data.cost,
            data.effect,
            data.roll,
            features,
            data.tier1 || data.t1 || data["11 or lower"],
            data.tier2 || data.t2 || data["12-16"],
            data.tier3 || data.t3 || data["17+"],
        );
    }

    constructor(
        name: string | undefined,
        cost: string | undefined,
        effect: string | undefined,
        roll: string | undefined,
        features: Feature[] | undefined,
        tier1: string | undefined,
        tier2: string | undefined,
        tier3: string | undefined,
    ) {
        this.name = name || "";
        if (name && cost) {
            this.name += " "
        }
        if (cost) {
            this.name += `(${cost})`;
        }
        if (!name && !cost) {
            if (!roll && !tier1 && !tier2 && !tier3) {
                this.name = "Effect"
            }
            else {
                this.name = "";
            }
        }
        this.effect = effect;
        this.features = features;
        this.powerRoll = new PowerRoll(roll, tier1, tier2, tier3);
    }
}
