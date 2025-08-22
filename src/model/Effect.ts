import {MarkdownPostProcessorContext, Plugin} from "obsidian";
import {PowerRollEffectView} from "@drawSteelAdmonition/ability/PowerRollEffectView";
import {MundaneEffectView} from "@drawSteelAdmonition/ability/MundaneEffectView";

export abstract class Effect {
	static parseAll(data: any): Effect[] {
		if (!data) {
			return [];
		}
		if (!Array.isArray(data)) {
			throw new Error("Expected effects to be an array");
		}
		let effects = [];
		for (let entry of data) {
			if (entry.roll) {
				effects.push(new PowerRollEffect(entry));
			} else if (entry.name && entry.effect) {
				effects.push(MundaneEffect.parse(entry));
			} else if (typeof entry === "string") {
				effects.push(MundaneEffect.nameless(entry));
			} else {
				effects.push(MundaneEffect.parseKeyValue(entry));
			}
		}
		return effects;
	}

	abstract effectType(): string;

	abstract asView(parent: HTMLElement, plugin: Plugin, ctx: MarkdownPostProcessorContext);
}

export class PowerRollEffect extends Effect {
	roll?: string;
	t1?: string;
	t2?: string;
	t3?: string;
	crit?: string;

	constructor(data: any) {
		super();
		this.roll = data.roll;
		this.t1 = data.t1 ?? data["tier 1"] ?? data["11 or lower"];
		this.t2 = data.t2 ?? data["tier 2"] ?? data["12-16"];
		this.t3 = data.t3 ?? data["tier 3"] ?? data["17+"];
		this.crit = data.critical ?? data.crit ?? data["nat 19-20"];
	}

	effectType() {
		return "PowerRollEffect";
	}

	asView(parent: HTMLElement, plugin: Plugin, ctx: MarkdownPostProcessorContext) {
		new PowerRollEffectView(plugin, this, ctx).build(parent);
	}
}

export class MundaneEffect extends Effect {
	name?: string;
	cost?: string;
	effect?: string;

	static parseKeyValue(data: any) {
		const key: string = Object.keys(data)[0];
		const effect: string = Object.values(data)[0];
		return new MundaneEffect(key, undefined, effect);
	}

	static parse(data: any) {
		return new MundaneEffect(data.name, data.cost, data.effect);
	}

	static nameless(effect: string) {
		return new MundaneEffect(undefined, undefined, effect);
	}

	constructor(name?: string, cost?: string, effect?: string) {
		super();
		this.name = name;
		this.cost = cost ? "" + cost : cost;
		this.effect = effect;
	}

	effectType() {
		return "MundaneEffect";
	}

	asView(parent: HTMLElement, plugin: Plugin, ctx: MarkdownPostProcessorContext) {
		new MundaneEffectView(plugin, this, ctx).build(parent);
	}
}
