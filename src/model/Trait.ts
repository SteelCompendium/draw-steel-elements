import { Effect } from "./Effect";


export class Trait {
    name: string;
    type?: string;
    effects: Effect[];

    constructor(data: { name?: string; type?: string; effects?: any; effect?: any; }) {
        this.name = data.name?.trim() ?? '';
        this.type = data.type?.trim();
        this.effects = data.effects ?? [];
    }

    static parseData(data: { name?: string; type?: string; effects?: any; effect?: any; }) {
        const d: any = {};
        d.name = data.name?.trim() ?? '';
        d.type = data.type?.trim();
        if (data.effects) {
            d.effects = Effect.parseAll(data.effects);
        } else if (data.effect) {
            d.effects = Effect.parseAll([data.effect]);
        } else {
            d.effects = [];
        }
        return new Trait(d);
    }
}
