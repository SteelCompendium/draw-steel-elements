// SC-440: the six font pickers, each a curated dropdown + a free-text "Custom..." field + a "List installed fonts" button. Per picker, real input:
// ArrowDown on the select picks the first curated font, End jumps to "Custom..." (which reveals the free-text field and writes nothing), typing a
// family and clicking away stores it, and the "List installed fonts" button (a user-activation affordance) appends the machine's families.
// Each step is asserted in data.json ON DISK, in the shown control and as the inline custom property `--dse-font-<slot>` on the OPEN stamina bar.
// "List installed fonts" fetches ONCE per plugin lifetime (every font row shares it, and the button disappears afterwards), so each picker after the
// first starts from a plugin reload, which doubles as the check that the previous pickers' values survived it.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { closeSettings, ctl, diskPrefs, mainVar, openAt, pressOn, prefValue, shownValue, typeThenBlur, ensureState } from '../../driver/settingsDrive';

const STAMINA = '[data-dse-element="stamina-bar"]';
const TYPO = 'settings.page.typography';
const ADV = 'settings.advanced.typography';
const FAMILY = (n: number): string => `Family ${n}`;
const KEYS = ['fontTitle', 'fontBody', 'fontControls', 'fontCardBody', 'fontLabel', 'fontMono'];

async function picker(n: number, id: string, links: string[], key: string, cssVar: string, curated: string): Promise<void> {
	// Each picker starts from a freshly loaded plugin (the "List installed fonts" fetch happens once per plugin lifetime), on a data.json that holds
	// the pickers before it: seeded here, which reloads, so this scenario also runs alone and doubles as the check that those values load.
	const previous = Object.fromEntries(KEYS.slice(0, n - 1).map((k, i) => [k, FAMILY(i + 1)]));
	await dse.setPrefs(previous);
	expect(await diskPrefs()).toEqual(previous);
	await dse.openNote('Stamina/basic.md');
	await openAt(...links);
	try {
		const custom = `${id}.custom`;
		expect(await shownValue(id)).toBe('');
		await pressOn(id, 'ArrowDown');
		expect(await prefValue(key, '')).toBe(curated);
		expect(await shownValue(id)).toBe(curated);
		expect(await mainVar(STAMINA, cssVar)).toContain(`"${curated}"`);
		await pressOn(id, 'End');
		expect(await shownValue(id)).toBe('__custom__');
		expect(await dse.page<boolean>(`document.querySelector('[data-dse-control="${custom}"]').classList.contains('dse-hidden')`)).toBe(false);
		expect(await prefValue(key, '')).toBe(curated); // Custom... by itself writes nothing
		await typeThenBlur(custom, FAMILY(n));
		expect(await prefValue(key, '')).toBe(FAMILY(n));
		expect(await shownValue(custom)).toBe(FAMILY(n));
		expect(await mainVar(STAMINA, cssVar)).toContain(`"${FAMILY(n)}"`);
		// List installed fonts: the families join the dropdown, and the button goes (on every font row) for the rest of this plugin session.
		const options = (): Promise<number> => dse.page<number>(`document.querySelector('[data-dse-control="${id}"]').options.length`);
		const before = await options();
		await dse.click(ctl(`${id}.list`));
		await dse.waitFor(`document.querySelectorAll('[data-dse-control$=".list"]').length === 0`, 'the List installed fonts buttons to go');
		expect(await options()).toBeGreaterThan(before);
		expect(await shownValue(id)).toBe('__custom__'); // the typed family is not an installed one
		expect(await prefValue(key, '')).toBe(FAMILY(n));
	} finally {
		await closeSettings();
	}
}

describe('settings tab: font pickers', () => {
	it('[SET-F01] Title font: curated pick, Custom... field, typed family, List installed fonts', async () => {
		await picker(1, 'settings.font-title', [TYPO], 'fontTitle', '--dse-font-title', 'Source Serif 4');
	});
	it('[SET-F02] Body font: the same four steps', async () => {
		await picker(2, 'settings.font-body', [TYPO], 'fontBody', '--dse-font-body', 'Source Serif 4');
	});
	it('[SET-F03] Controls font: the same four steps', async () => {
		await picker(3, 'settings.font-controls', [TYPO], 'fontControls', '--dse-font-controls', 'Source Serif 4');
	});
	it('[SET-F04] Card body font (Advanced): the same four steps', async () => {
		await picker(4, 'settings.font-card-body', [TYPO, ADV], 'fontCardBody', '--dse-font-card-body', 'Source Serif 4');
	});
	it('[SET-F05] Label font (Advanced): the same four steps', async () => {
		await picker(5, 'settings.font-label', [TYPO, ADV], 'fontLabel', '--dse-font-label', 'Source Serif 4');
	});
	it('[SET-F06] Monospace font (Advanced): the same four steps (its curated list is monospaced families)', async () => {
		await picker(6, 'settings.font-mono', [TYPO, ADV], 'fontMono', '--dse-font-mono', 'JetBrains Mono');
	});

	it('[SET-F07] after a plugin reload on the six typed families every picker reopens on "Custom..." with its typed family, data.json keeps all six, and an opened note carries them', async () => {
		const all = Object.fromEntries(KEYS.map((k, i) => [k, FAMILY(i + 1)]));
		await ensureState({ prefs: all }); // reloads on the file the six scenarios above wrote (seeded only when this one runs alone)
		expect(await diskPrefs()).toEqual(all);
		for (const [links, ids] of [
			[[TYPO], [['settings.font-title', 1], ['settings.font-body', 2], ['settings.font-controls', 3]]],
			[[TYPO, ADV], [['settings.font-card-body', 4], ['settings.font-label', 5], ['settings.font-mono', 6]]],
		] as Array<[string[], Array<[string, number]>]>) {
			await openAt(...links);
			try {
				for (const [id, n] of ids) {
					expect({ id, shown: await shownValue(id) }).toEqual({ id, shown: '__custom__' });
					expect({ id, custom: await shownValue(`${id}.custom`) }).toEqual({ id, custom: FAMILY(n) });
				}
			} finally {
				await closeSettings();
			}
		}
		await dse.openNote('Stamina/basic.md');
		expect(await mainVar(STAMINA, '--dse-font-title')).toContain('"Family 1"');
		expect(await mainVar(STAMINA, '--dse-font-mono')).toContain('"Family 6"');
	});
});
