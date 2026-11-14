import {parseYaml} from "obsidian";

/**
 * SC-637 — a key the negotiation does not read (a Director's own `note_to_self:` at the top of the block, a `gm_note:` on
 * a motivation or a pitfall) must survive a write. "Known" is every key the negotiation READS: each is read under exactly
 * one name (there is no legacy spelling or alias), and a key it reads and then leaves out because the value is empty
 * (`name: ''`) is still known, so it is never carried a second time.
 *
 * WHERE the unknown pairs live: in a module-private WeakMap keyed by the instance, NOT as own properties. NegotiationData,
 * Motivation and Pitfall are classes with methods and fields, so a hand-written key named like one (`ending`, `offerFor`,
 * `resetData`, `current_patience`, `toJSON`, `constructor`, `__proto__`) would shadow a method, overwrite a field or
 * reach the prototype if it were copied onto the instance. In the map no YAML key can do any of that: the pairs are only
 * ever read back by `unknownKeysOf` and written into the DTO `serialize` builds. It also keeps every instance
 * (`toEqual`, `{...model}`, the legacy-writer oracle in the tests) exactly the shape it had. Never add a non-schema own
 * property to these classes expecting it to stay out of the note: `serialize` writes every own key.
 *
 * `serialize` writes the pairs after the known keys, in their original relative order, at the top level and inside each
 * motivation and pitfall. A key that looks like an integer (`2024:`) is written FIRST (JavaScript's own object key order)
 * and comes back quoted; a unit test pins it. The value is carried as it parsed (a nested map or list included); its
 * formatting is whatever `stringifyYaml` does today (SC-599's question, not this one).
 */
const TOP_KNOWN_KEYS: ReadonlySet<string> = new Set([
    'name', 'initial_patience', 'current_patience', 'initial_interest', 'current_interest', 'motivations', 'pitfalls',
    'currentArgument', 'i5', 'i4', 'i3', 'i2', 'i1', 'i0', '_dse_anchor',
]);
const MOTIVATION_KNOWN_KEYS: ReadonlySet<string> = new Set(['name', 'reason', 'hasBeenAppealedTo']);
const PITFALL_KNOWN_KEYS: ReadonlySet<string> = new Set(['name', 'reason']);

const unknownKeys = new WeakMap<object, ReadonlyArray<readonly [string, unknown]>>();

/** Remembers the own enumerable string keys of `source` that are not in `known`, in their original order. A value that
 *  is not a mapping (a string or a list would otherwise yield its indices) has none. */
function recordUnknownKeys(owner: object, source: unknown, known: ReadonlySet<string>): void {
    if (source === null || typeof source !== 'object' || Array.isArray(source)) return;
    const pairs = Object.entries(source).filter(([key]) => !known.has(key));
    if (pairs.length > 0) unknownKeys.set(owner, pairs);
}

/** The `[key, value]` pairs the source carried that the negotiation does not read, in their original order (SC-637). */
export function unknownKeysOf(owner: object): ReadonlyArray<readonly [string, unknown]> {
    return unknownKeys.get(owner) ?? [];
}

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
    /** FOLLOWUPS #26 (D8 spec §1.5) — sidebar block anchor passthrough. Round-trips
     *  untouched (assigned LAST in the constructor so it serializes last); ignored by
     *  every piece of game logic in this element. `undefined` when the block never
     *  declared `_dse_anchor:` — never coerced, so a block without one round-trips
     *  through serialize() without the key materializing. */
    _dse_anchor?: string;

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
        // FOLLOWUPS #26: assigned LAST so it serializes last when present; passed
        // straight through, never coerced/defaulted (see the field comment above).
        this._dse_anchor = data._dse_anchor;
        recordUnknownKeys(this, data, TOP_KNOWN_KEYS); // SC-637
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

    /**
     * SC-379 — the book's three stop conditions, derived from the live standing (a method:
     * prototype methods are never own keys, so nothing here can reach serialize()).
     * Precedence: Interest 5 is a deal, Interest 0 is hostile, otherwise spent Patience is a
     * final offer. `null` while the negotiation is live.
     */
    ending(): 'deal' | 'hostile' | 'final' | null {
        // Number() so a quoted "5" in hand-edited YAML ends it like a 5; junk (NaN) ends nothing.
        const interest = Number(this.current_interest);
        const patience = Number(this.current_patience);
        if (interest >= 5) return 'deal';
        if (interest <= 0) return 'hostile';
        if (patience <= 0) return 'final';
        return null;
    }

    /**
     * SC-379 — Interest and Patience live on a 0..5 scale; Complete Argument clamps to it.
     * Hand-edited YAML can carry a quoted number ("3") or junk, so the input is coerced with
     * Number() first and the result is always finite (junk -> 0), never NaN.
     */
    static clampStanding(n: number): number {
        const v = Number(n);
        return Number.isNaN(v) ? 0 : Math.max(0, Math.min(5, v));
    }

    /**
     * SC-379 — `current` moved by `delta` and kept on the scale. A quoted number ("3" + 1) is
     * 4, not "31". A current value that is not a number at all is left exactly as authored
     * (never NaN, never invented): Complete cannot make sense of it, so it does not touch it.
     */
    static advanceStanding<T>(current: T, delta: number): T | number {
        return Number.isFinite(Number(current)) ? NegotiationData.clampStanding(Number(current) + delta) : current;
    }

    /** SC-379 — the authored outcome text for Interest `n` (clamped + rounded onto 0..5). */
    offerFor(n: number): string {
        const offers = [this.i0, this.i1, this.i2, this.i3, this.i4, this.i5];
        return offers[Math.round(NegotiationData.clampStanding(n))];
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
        recordUnknownKeys(this, data, MOTIVATION_KNOWN_KEYS); // SC-637
    }
}

export class Pitfall {
    name: string;
    reason: string;

    constructor(data: Partial<Pitfall>) {
        this.name = data.name?.trim() ?? '';
        this.reason = data.reason?.trim() ?? '';
        recordUnknownKeys(this, data, PITFALL_KNOWN_KEYS); // SC-637
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
    } catch (error: unknown) {
        throw new Error("Invalid YAML format: " + (error instanceof Error ? error.message : String(error)));
    }

    return new NegotiationData(data);
}
