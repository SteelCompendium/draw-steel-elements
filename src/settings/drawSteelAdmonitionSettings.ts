import {DrawSteelAdmonition} from "../drawSteelAdmonition/drawSteelAdmonition";
import {DrawSteelAdmonitionType} from "../drawSteelAdmonition/drawSteelAdmonitionType";

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
		for (const identifier in settings.drawSteelAdmonitions) {
			const dsa = settings.drawSteelAdmonitions[identifier];
			const typedDSA = DrawSteelAdmonitionType.unmarshal(dsa);
			dsas.set(typedDSA.type, typedDSA);
		}
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
