// SC-440: the five size sliders (Text size 60-140%, Card size and the three type-role sizes 80-120%, step 5%). Obsidian draws a native range
// input; the real input is the keys on it: ArrowRight is one step up from 100%, Home the minimum, End the maximum. Each is asserted in data.json
// ON DISK, in the slider's shown value and as the inline custom property on the OPEN stamina bar (live). Each slider is left at its maximum; a
// final reload checks they all show it and keep it. (The snapping of out-of-range values is the jsdom matrix's.)
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { closeSettings, diskPrefs, mainVar, openAt, pressOn, prefValue, reloadPlugin, shownValue } from '../../driver/settingsDrive';

const STAMINA = '[data-dse-element="stamina-bar"]';
const TYPO = 'settings.page.typography';

async function slider(id: string, key: string, cssVar: string, min: number, max: number): Promise<void> {
	await dse.openNote('Stamina/basic.md');
	await openAt(TYPO);
	try {
		expect(Number(await shownValue(id))).toBe(1);
		expect(await mainVar(STAMINA, cssVar)).toBe(''); // 100% is "no override"
		await pressOn(id, 'ArrowRight');
		expect(await prefValue(key, 1)).toBe(1.05);
		expect(Number(await shownValue(id))).toBeCloseTo(1.05, 5);
		expect(await mainVar(STAMINA, cssVar)).toBe('1.05');
		await pressOn(id, 'Home');
		expect(await prefValue(key, 1)).toBe(min);
		expect(Number(await shownValue(id))).toBeCloseTo(min, 5);
		expect(await mainVar(STAMINA, cssVar)).toBe(String(min));
		await pressOn(id, 'End');
		expect(await prefValue(key, 1)).toBe(max);
		expect(Number(await shownValue(id))).toBeCloseTo(max, 5);
		expect(await mainVar(STAMINA, cssVar)).toBe(String(max));
	} finally {
		await closeSettings();
	}
}

describe('settings tab: size sliders', () => {
	it('[SET-Z01] Text size: ArrowRight, Home and End move it to 105%, 60% and 140% and the open bar follows', async () => {
		await slider('settings.text-scale', 'textScale', '--dse-text-scale', 0.6, 1.4);
	});
	it('[SET-Z02] Card size: ArrowRight, Home and End move it to 105%, 80% and 120%', async () => {
		await slider('settings.card-scale', 'cardScale', '--dse-card-scale', 0.8, 1.2);
	});
	it('[SET-Z03] Small text size: the same three keys', async () => {
		await slider('settings.small-text-scale', 'smallTextScale', '--dse-fs-small-scale', 0.8, 1.2);
	});
	it('[SET-Z04] Large text size: the same three keys', async () => {
		await slider('settings.large-text-scale', 'largeTextScale', '--dse-fs-large-scale', 0.8, 1.2);
	});
	it('[SET-Z05] Control text size: the same three keys', async () => {
		await slider('settings.control-text-scale', 'controlTextScale', '--dse-fs-control-scale', 0.8, 1.2);
	});

	it('[SET-Z06] after a plugin reload every slider shows its maximum, data.json keeps it and an opened note carries it', async () => {
		await reloadPlugin();
		expect(await diskPrefs()).toEqual({ textScale: 1.4, cardScale: 1.2, smallTextScale: 1.2, largeTextScale: 1.2, controlTextScale: 1.2 });
		await openAt(TYPO);
		try {
			for (const [id, max] of [['settings.text-scale', 1.4], ['settings.card-scale', 1.2], ['settings.small-text-scale', 1.2], ['settings.large-text-scale', 1.2], ['settings.control-text-scale', 1.2]] as const) {
				expect({ id, shown: Number(await shownValue(id)) }).toEqual({ id, shown: max });
			}
		} finally {
			await closeSettings();
		}
		await dse.openNote('Stamina/basic.md');
		expect(await mainVar(STAMINA, '--dse-text-scale')).toBe('1.4');
		expect(await mainVar(STAMINA, '--dse-fs-control-scale')).toBe('1.2');
	});
});
