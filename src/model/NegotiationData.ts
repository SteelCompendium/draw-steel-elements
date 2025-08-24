import {parseYaml} from "obsidian";

export class NegotiationData {
    name?: string;
    initial_patience?: number;
    current_patience: number;
    initial_interest?: number;
    current_interest: number;
    motivations: Motivation[];
    pitfalls: Pitfall[];
    currentArgument: CurrentArgument;
    i5: string;
    i4: string;
    i3: string;
    i2: string;
    i1: string;
    i0: string;

    private static readonly default_patience: number = 5;
    private static readonly default_interest: number = 0;

    constructor(data: Partial<NegotiationData>) {
        this.name = data.name;
        this.initial_patience = data.initial_patience;
        this.current_patience = data.current_patience ?? data.initial_patience ?? NegotiationData.default_patience;
        this.initial_interest = data.initial_interest;
        this.current_interest = data.current_interest ?? data.initial_interest ?? NegotiationData.default_interest;
        this.motivations = data.motivations?.map(mot => new Motivation(mot)) ?? [];
        this.pitfalls = data.pitfalls?.map(pit => new Pitfall(pit)) ?? [];
        this.currentArgument = data.currentArgument ? new CurrentArgument(data.currentArgument) : new CurrentArgument({});
        this.i5 = data.i5 ?? "Interest 5 result";
        this.i4 = data.i4 ?? "Interest 4 result";
        this.i3 = data.i3 ?? "Interest 3 result";
        this.i2 = data.i2 ?? "Interest 2 result";
        this.i1 = data.i1 ?? "Interest 1 result";
        this.i0 = data.i0 ?? "Interest 0 result";
    }

    setMotivationUsed(motivationName: string, used: boolean) {
        const mot = this.motivations.find(m => m.name === motivationName);
		if (mot) {
        	mot.hasBeenAppealedTo = used;
		}

        // if a motivation is getting marked as "used previously" and the current argument also uses that motivation,
        // then mark the current argument as reusing the motivation
        if (used && this.currentArgument.motivationsUsed.contains(motivationName)) {
            this.currentArgument.reusedMotivation = true;
        }

        // if motivation is getting marked as "not previously used" and the current argument also uses that motivation,
        // then we can set resuedMotivation to false ONLY if all the other motivations in the current argument have
        // not been used previously.  If the current argument uses 2 motivations that are both previously used, then
        // we have to leave the reusedMotivations flag alone.
        if (!used && this.currentArgument.motivationsUsed.contains(motivationName)) {
            let canSetReusedMotivationFlag = true;
            this.currentArgument.motivationsUsed.forEach(currentMotivation => {
                let globalMotivation = this.motivations.find(m => m.name === currentMotivation);
                if (globalMotivation && globalMotivation.hasBeenAppealedTo) {
                    // dont touch the reusedMotivaton flag
                    canSetReusedMotivationFlag = false;
                }
            })
            if (canSetReusedMotivationFlag) {
                this.currentArgument.reusedMotivation = false;
            }
        }
    }

    /**
     * Determines if any of the motivations used in the current argument have been reused.
     * @returns {boolean} True if any motivation has been reused; otherwise, false.
     */
    argumentReusesMotivation(): boolean {
        return this.currentArgument.motivationsUsed.some(motName => {
            const mot = this.motivations.find(m => m.name === motName);
            return mot?.hasBeenAppealedTo ?? false;
        });
    }

    resetData() {
        this.current_patience = this.initial_patience ?? NegotiationData.default_patience;
        this.current_interest = this.initial_interest ?? NegotiationData.default_interest;
        this.motivations.forEach(m => m.hasBeenAppealedTo = false);
        this.currentArgument.resetData();
    }
}

export class CurrentArgument {
    motivationsUsed: string[];
    pitfallsUsed: string[];
    lieUsed: boolean;
    sameArgumentUsed: boolean;
    reusedMotivation: boolean;

    constructor(data: Partial<CurrentArgument>) {
        this.motivationsUsed = data.motivationsUsed ?? [];
        this.pitfallsUsed = data.pitfallsUsed ?? [];
        this.lieUsed = data.lieUsed ?? false;
        this.sameArgumentUsed = data.sameArgumentUsed ?? false;
        this.reusedMotivation = data.reusedMotivation ?? false;
    }

    /**
     * Checks if any motivations have been used in the current argument.
     * @returns {boolean} True if motivations have been used; otherwise, false.
     */
    usesMotivation(): boolean {
        return this.motivationsUsed.length > 0;
    }

    /**
     * Checks if any pitfalls have been used in the current argument.
     * @returns {boolean} True if pitfalls have been used; otherwise, false.
     */
    usesPitfall(): boolean {
        return this.pitfallsUsed.length > 0;
    }

    resetData() {
        this.motivationsUsed = [];
        this.pitfallsUsed = [];
        this.lieUsed = false;
        this.sameArgumentUsed = false;
        this.reusedMotivation = false;
    }
}

export class Motivation {
    name: string;
    reason: string;
    hasBeenAppealedTo: boolean;

    constructor(data: Partial<Motivation>) {
        this.name = data.name?.trim() ?? '';
        this.reason = data.reason?.trim() ?? '';
        this.hasBeenAppealedTo = data.hasBeenAppealedTo ?? false;
    }
}

export class Pitfall {
    name: string;
    reason: string;

    constructor(data: Partial<Pitfall>) {
        this.name = data.name?.trim() ?? '';
        this.reason = data.reason?.trim() ?? '';
    }
}

/**
 * Parses a YAML string into a NegotiationData object.
 * Initializes default values and ensures all nested objects are properly instantiated.
 *
 * @param {string} source - The YAML string to parse.
 * @returns {NegotiationData} The parsed and initialized NegotiationData object.
 * @throws {Error} If the YAML format is invalid.
 */
export function parseNegotiationData(source: string): NegotiationData {
    let data: Partial<NegotiationData>;
    try {
        data = parseYaml(source) as Partial<NegotiationData>;
    } catch (error: any) {
        throw new Error("Invalid YAML format: " + error.message);
    }

    return new NegotiationData(data);
}
