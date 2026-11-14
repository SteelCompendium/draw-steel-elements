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
 * motivation, pitfall and `currentArgument` (the argument's own keys end when the argument does: `CurrentArgument.resetData`).
 * A key that looks like an integer (`2024:`) is written FIRST (JavaScript's own object key order) and comes back quoted; a unit test pins it. The value is carried as it parsed (a nested map or list included); its
 * formatting is whatever `stringifyYaml` does today (SC-599's question, not this one).
 */
const TOP_KNOWN_KEYS: ReadonlySet<string> = new Set([
    'name', 'initial_patience', 'current_patience', 'initial_interest', 'current_interest', 'motivations', 'pitfalls',
    'currentArgument', 'i5', 'i4', 'i3', 'i2', 'i1', 'i0', '_dse_anchor',
]);
const MOTIVATION_KNOWN_KEYS: ReadonlySet<string> = new Set(['name', 'reason', 'hasBeenAppealedTo']);
const PITFALL_KNOWN_KEYS: ReadonlySet<string> = new Set(['name', 'reason']);
const ARGUMENT_KNOWN_KEYS: ReadonlySet<string> = new Set(['motivationsUsed', 'pitfallsUsed', 'lieUsed', 'sameArgumentUsed', 'reusedMotivation']);

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

/**
 * SC-638 — hand-typed values of the wrong type.
 *
 * READ (R1): a number or boolean where the negotiation expects text (`name: 2024`, a motivation's `reason: 42`,
 * `motivationsUsed: [5]`) is read as its text, so every comparison and every `.trim()` works on text. A map or a list there,
 * or a list / map of the wrong shape anywhere below, is not a value the negotiation can read: it throws a plain
 * `Invalid data: …` message (the form encounter / party / conditions use), the pipeline draws it as the error card, and a
 * card with no controls writes nothing, so the typed block is never replaced. `null` / absent keep their old meaning.
 *
 * WRITE (R2): the value the user typed is remembered beside the instance (a module-private WeakMap, the same reason as the
 * unknown keys above: no own property, so `serialize` cannot write it as a key) and `restoreTypedText` puts it back when the
 * text is still what was read, so `name: 2024` stays `name: 2024`. Matching a motivation by name compares the text, so
 * `motivationsUsed: [5]` matches a motivation named 5. A used list is remembered BY POSITION (`usedSnapshot`: the entries as read, the
 * typed ones with their value), so `[5, "5"]` keeps its number and its quoted text apart; a write after a chip added or removed an
 * entry matches the list to what was read per text (see `restoreUsed`).
 */
type TypedScalar = number | boolean;
const typedText = new WeakMap<object, Map<string, Map<string, TypedScalar>>>();

function rememberTyped(owner: object, slot: string, raw: TypedScalar): void {
    let slots = typedText.get(owner);
    if (!slots) typedText.set(owner, (slots = new Map<string, Map<string, TypedScalar>>()));
    let texts = slots.get(slot);
    if (!texts) slots.set(slot, (texts = new Map<string, TypedScalar>()));
    texts.set(String(raw), raw);
}

interface UsedEntry {
    readonly text: unknown;
    readonly raw?: TypedScalar;
}
const usedSnapshot = new WeakMap<object, Map<string, readonly UsedEntry[]>>();

/** `raw` as one entry of a used list: a number / boolean is its text, a map or list is not text; the entry as read is kept by position. */
function readUsedEntries(owner: object, slot: string, list: unknown[], where: string): unknown[] {
    const snapshot: UsedEntry[] = [];
    const texts = list.map((entry, index) => {
        if (typeof entry === 'number' || typeof entry === 'boolean') {
            snapshot.push({ text: String(entry), raw: entry });
            return String(entry);
        }
        if (typeof entry === 'object' && entry !== null) throw new Error(`Invalid data: '${where}' item ${index + 1} must be text.`);
        snapshot.push({ text: entry });
        return entry;
    });
    let slots = usedSnapshot.get(owner);
    if (!slots) usedSnapshot.set(owner, (slots = new Map<string, readonly UsedEntry[]>()));
    slots.set(slot, snapshot);
    return texts;
}

/**
 * `list` (the entries now) with the value the user typed put back on each entry that is the one read from that position. Matched PER TEXT, not
 * with one cursor over the list (a chip press removes the first equal entry and adds at the END, so a cursor would skip every untouched typed
 * entry in between): a text that is `c` times in the list and `n` times in the snapshot takes the LAST `c` snapshot entries of that text, in
 * order, when `c <= n` (a removal takes the first equal one, `indexOf`, so the later one stays), and its first `n` occurrences take the snapshot
 * entries when `c > n` (the rest were added since and are plain text).
 */
function restoreUsed(owner: object, slot: string, list: unknown[]): unknown[] {
    const snapshot = usedSnapshot.get(owner)?.get(slot);
    if (!snapshot || !snapshot.some((entry) => entry.raw !== undefined)) return list;
    const out = list.slice();
    const seen = new Map<unknown, number[]>();
    list.forEach((entry, index) => seen.set(entry, [...(seen.get(entry) ?? []), index]));
    for (const [text, indexes] of seen) {
        const entries = snapshot.filter((entry) => entry.text === text);
        const taken = indexes.length <= entries.length ? entries.slice(entries.length - indexes.length) : entries;
        taken.forEach((entry, i) => {
            if (entry.raw !== undefined) out[indexes[i]] = entry.raw;
        });
    }
    return out;
}

/** `raw` as the negotiation reads a text field: a number / boolean becomes its text (remembered on `owner` under `slot`);
 *  a map or list throws `Invalid data: <where> must be text.`; null, undefined and text pass through unchanged. */
function readText(owner: object, slot: string, raw: unknown, where: string): unknown {
    if (typeof raw === 'number' || typeof raw === 'boolean') {
        rememberTyped(owner, slot, raw);
        return String(raw);
    }
    if (typeof raw === 'object' && raw !== null) throw new Error(`Invalid data: ${where} must be text.`);
    return raw;
}

const isMap = (value: unknown): boolean => typeof value === 'object' && value !== null && !Array.isArray(value);

/** `raw` (null / undefined -> none) as a list, or `Invalid data: '<key>' field must be a list.` */
function readList(raw: unknown, key: string): unknown[] {
    if (raw === null || raw === undefined) return [];
    if (!Array.isArray(raw)) throw new Error(`Invalid data: '${key}' field must be a list.`);
    return raw;
}

/** The items of a motivations / pitfalls list: each must be a map (`- Legacy`, a blank `-`, a number and a nested list are not). */
function readItems(raw: unknown, key: string): unknown[] {
    const items = readList(raw, key);
    items.forEach((item, index) => {
        if (!isMap(item)) throw new Error(`Invalid data: '${key}' item ${index + 1} must be an object.`);
    });
    return items;
}

/** The text of one item's field, as `readText` (the message names the list, the item's position and the field). */
function readItemText(owner: object, list: string, index: number, field: string, raw: unknown): unknown {
    return readText(owner, field, raw, `'${list}' item ${index + 1} '${field}'`);
}

/** The typed value the user wrote for `text` in `slot` of `owner`, else `text` itself. */
export function typedValueOf(owner: object, slot: string, text: string): unknown {
    return typedText.get(owner)?.get(slot)?.get(text) ?? text;
}

/** In `out` (a fresh copy of `owner`'s data), puts back the value the user typed for each of `slots` that is still the
 *  text read from it: a text slot directly, a list of text entry by entry. Anything the negotiation changed is untouched. */
export function restoreTypedText(out: Record<string, unknown>, owner: object, slots: readonly string[]): Record<string, unknown> {
    if (!typedText.has(owner) && !usedSnapshot.has(owner)) return out;
    for (const slot of slots) {
        const value = out[slot];
        if (typeof value === 'string') out[slot] = typedValueOf(owner, slot, value);
        else if (Array.isArray(value)) out[slot] = restoreUsed(owner, slot, value as unknown[]);
    }
    return out;
}

/** The text slots of each class, in the order they are read (what `restoreTypedText` walks on a write). */
export const TOP_TEXT_SLOTS: readonly string[] = ['name', 'i5', 'i4', 'i3', 'i2', 'i1', 'i0'];
export const ITEM_TEXT_SLOTS: readonly string[] = ['name', 'reason'];
export const ARGUMENT_TEXT_SLOTS: readonly string[] = ['motivationsUsed', 'pitfallsUsed'];

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
        // SC-638: shape is checked first (a wrong one throws before anything is built), then each text field is read as text.
        // The block itself must be a map of keys: `hello`, a list and `42` are not. An EMPTY block (null / undefined) is still refused, as
        // before (negotiation has never accepted one, SC-493: the form refuses to save it for that reason), but with a plain message.
        const input: unknown = data;
        if (input === null || input === undefined) throw new Error('Invalid data: the block is empty.');
        if (!isMap(input)) throw new Error('Invalid data: the block must be a map of keys.');
        const motivations = readItems(data.motivations, 'motivations');
        const pitfalls = readItems(data.pitfalls, 'pitfalls');
        const argument: unknown = data.currentArgument;
        if (argument !== null && argument !== undefined && !isMap(argument)) {
            throw new Error("Invalid data: 'currentArgument' field must be an object.");
        }
        this.name = readText(this, 'name', data.name, "'name'") as string | undefined;
        this.initial_patience = data.initial_patience;
        this.current_patience = data.current_patience ?? data.initial_patience ?? NegotiationData.default_patience;
        this.initial_interest = data.initial_interest;
        this.current_interest = data.current_interest ?? data.initial_interest ?? NegotiationData.default_interest;
        this.motivations = motivations.map((mot, index) => new Motivation(mot as Partial<Motivation>, index));
        this.pitfalls = pitfalls.map((pit, index) => new Pitfall(pit as Partial<Pitfall>, index));
        this.currentArgument = argument ? new CurrentArgument(argument) : new CurrentArgument({});
        this.i5 = (readText(this, 'i5', data.i5, "'i5'") as string | undefined) ?? "Interest 5 result";
        this.i4 = (readText(this, 'i4', data.i4, "'i4'") as string | undefined) ?? "Interest 4 result";
        this.i3 = (readText(this, 'i3', data.i3, "'i3'") as string | undefined) ?? "Interest 3 result";
        this.i2 = (readText(this, 'i2', data.i2, "'i2'") as string | undefined) ?? "Interest 2 result";
        this.i1 = (readText(this, 'i1', data.i1, "'i1'") as string | undefined) ?? "Interest 1 result";
        this.i0 = (readText(this, 'i0', data.i0, "'i0'") as string | undefined) ?? "Interest 0 result";
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
        // SC-638 (R4): each standing is read exactly as the seal is drawn (`standingOf`: clamp, round, junk -> 0), so the
        // ending and the seal can never disagree: 0.4 is seal 0 and hostile, 4.5 is seal 5 and a deal, "banana" Patience is 0.
        const interest = NegotiationData.standingOf(this.current_interest);
        const patience = NegotiationData.standingOf(this.current_patience);
        if (interest >= 5) return 'deal';
        if (interest <= 0) return 'hostile';
        if (patience <= 0) return 'final';
        return null;
    }

    /**
     * SC-638 (R4) — the ONE reading of a standing: the whole number 0..5 the seal is drawn on (`clampStanding`, then
     * `Math.round`; a quoted number is its number, junk is 0). The seals, the band's "Interest n", `offerFor` and `ending()`
     * all read through here.
     */
    static standingOf(n: unknown): number {
        return Math.round(NegotiationData.clampStanding(n as number));
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
        return offers[NegotiationData.standingOf(n)];
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
        this.motivationsUsed = CurrentArgument.readUsed(this, 'motivationsUsed', data.motivationsUsed);
        this.pitfallsUsed = CurrentArgument.readUsed(this, 'pitfallsUsed', data.pitfallsUsed);
        this.lieUsed = data.lieUsed ?? false;
        this.sameArgumentUsed = data.sameArgumentUsed ?? false;
        this.reusedMotivation = data.reusedMotivation ?? false;
        recordUnknownKeys(this, data, ARGUMENT_KNOWN_KEYS); // SC-637
    }

    /** SC-638: a `motivationsUsed` / `pitfallsUsed` list as text entries (a number is its text, a map or list is not text). */
    private static readUsed(owner: CurrentArgument, key: string, raw: unknown): string[] {
        return readUsedEntries(owner, key, readList(raw, `currentArgument.${key}`), `currentArgument.${key}`) as string[];
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
        // SC-637: a Director's own keys inside `currentArgument:` belong to THIS argument. Complete Argument and Reset
        // end it through here, so they end with it; every write that keeps the argument (a chip, a modifier) keeps them.
        unknownKeys.delete(this);
        usedSnapshot.delete(this); // SC-638: the typed entries of the argument that just ended go with it
    }
}

export class Motivation {
    name: string;
    reason: string;
    hasBeenAppealedTo: boolean;

    constructor(data: Partial<Motivation>, index = 0) {
        this.name = (readItemText(this, 'motivations', index, 'name', data.name) as string | undefined)?.trim() ?? '';
        this.reason = (readItemText(this, 'motivations', index, 'reason', data.reason) as string | undefined)?.trim() ?? '';
        this.hasBeenAppealedTo = data.hasBeenAppealedTo ?? false;
        recordUnknownKeys(this, data, MOTIVATION_KNOWN_KEYS); // SC-637
    }
}

export class Pitfall {
    name: string;
    reason: string;

    constructor(data: Partial<Pitfall>, index = 0) {
        this.name = (readItemText(this, 'pitfalls', index, 'name', data.name) as string | undefined)?.trim() ?? '';
        this.reason = (readItemText(this, 'pitfalls', index, 'reason', data.reason) as string | undefined)?.trim() ?? '';
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
