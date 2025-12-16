export class PowerRoll {
    roll?: string;
    tier1?: string;
    tier2?: string;
    tier3?: string;

    constructor(
        roll: string | undefined,
        tier1: string | undefined,
		tier2: string | undefined,
		tier3: string | undefined,
    ) {
        this.roll = roll;
        this.tier1 = tier1;
		this.tier2 = tier2;
		this.tier3 = tier3;
    }
}
