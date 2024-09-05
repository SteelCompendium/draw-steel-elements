import {DrawSteelAdmonition} from "../drawSteelAdmonition/drawSteelAdmonition";
import {DrawSteelAdmonitionType} from "../drawSteelAdmonition/drawSteelAdmonitionType";
import {PowerRollAdmonition} from "../drawSteelAdmonition/powerRollAdmonition";
import {HorizontalRuleAdmonition} from "../drawSteelAdmonition/horizontalRuleAdmonition";
import {NegotiationTrackerAdmonition} from "../drawSteelAdmonition/negotiationTrackerAdmonition";

export interface DrawSteelAdmonitionSettings {
	version: number;
	drawSteelAdmonitions: Map<string, DrawSteelAdmonition>;
}

export namespace DrawSteelAdmonitionSettingsIO {
	export function marshal(settings: DrawSteelAdmonitionSettings) {
		const settingData = Object.assign({}, DEFAULT_SETTINGS, settings);
		settingData.drawSteelAdmonitions = Object.fromEntries(settings.drawSteelAdmonitions.entries());
		return settingData;
	}

	export function unmarshalAndMigrate(data: any): [DrawSteelAdmonitionSettings, boolean] {
		let settings: DrawSteelAdmonitionSettings = Object.assign({}, DEFAULT_SETTINGS, data);

		const [newSettings, dataMigrated] = migrateData(settings);
		settings = newSettings;

		const dsas = new Map<string, DrawSteelAdmonition>();
		dsas.set(DrawSteelAdmonitionType.PowerRoll, PowerRollAdmonition.create());
		dsas.set(DrawSteelAdmonitionType.HorizontalRule, HorizontalRuleAdmonition.create());
		dsas.set(DrawSteelAdmonitionType.NegotiationTracker, NegotiationTrackerAdmonition.create());
		settings.drawSteelAdmonitions = dsas;
		return [settings, dataMigrated];
	}

	export function migrateData(settings: DrawSteelAdmonitionSettings): [any, boolean] {
		let dataMigrated = false;
		return [settings, dataMigrated];
	}
}

export const DEFAULT_SETTINGS: DrawSteelAdmonitionSettings = {
	version: 0,
	drawSteelAdmonitions: new Map<string, DrawSteelAdmonition>()
}
