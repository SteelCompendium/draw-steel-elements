// SC-436 — the combinatorial logic of the ConditionsModal (values x start states x holder kinds x entry forms), as jsdom
// tables. The e2e specs (e2e/specs/conditions-modal/) drive each control once through real input; the cases that only vary
// by value live here. Existing single-behaviour tests stay in conditions-modal.test.ts. Expectations are literals.
import { ConditionsModal } from '@views/ConditionsModal';
import type { Condition, ConditionHolder } from '@drawSteelAdmonition/EncounterData';
import { ConditionManager } from '@utils/Conditions';
import { App } from '../../mocks/obsidian';
import * as obsidianCore from '../../mocks/obsidian-core';
import { attachObsidianKeymap, pressEscape } from '../_obsidianKeymap';

type Entry = string | Condition;
type HostKind = 'hero' | 'creature';

/** A holder shaped like what the initiative tracker hands over: a Hero row or a CreatureInstance row. */
function holderFor(kind: HostKind, conditions: Entry[]): ConditionHolder {
	return kind === 'hero'
		? ({ name: 'Alice Alpha', max_stamina: 30, current_stamina: 21, isHero: true, conditions } as ConditionHolder)
		: ({ id: 2, current_stamina: 40, temp_stamina: 0, conditions } as ConditionHolder);
}

function open(conditions: Entry[], kind: HostKind = 'hero') {
	const onChange = jest.fn();
	const holder = holderFor(kind, conditions);
	const modal = new ConditionsModal(new App() as any, holder, new ConditionManager(), onChange);
	modal.open();
	const container = (modal as any).containerEl as HTMLElement;
	return { modal, holder, onChange, container };
}
type Open = ReturnType<typeof open>;

const qs = <T extends HTMLElement>(root: ParentNode, sel: string): T => {
	const el = root.querySelector<T>(sel);
	if (!el) throw new Error(`no element for ${sel}`);
	return el;
};
const rowNames = (c: HTMLElement): string[] => Array.from(c.querySelectorAll('.dse-condal__name')).map((n) => n.textContent ?? '');
const openEditor = (c: HTMLElement, index: number): void => {
	c.querySelectorAll<HTMLElement>('.dse-condal__row')[index].querySelector<HTMLElement>('button[aria-label^="Customize"]')!.click();
};
const pick = (c: HTMLElement, group: string, label: string): void => qs(c, `[role="group"][aria-label="${group}"] button[aria-label="${label}"]`).click();
const pressedIn = (c: HTMLElement, group: string): string[] =>
	Array.from(c.querySelectorAll(`[role="group"][aria-label="${group}"] [aria-pressed="true"]`)).map((b) => b.getAttribute('aria-label') ?? '');
/** The preset swatches are found by their hex (read from the `title`, "Red (#c0392b)"); their `aria-label` is the colour name alone (SC-582). */
const swatchHex = (el: Element): string => /\((#[0-9a-f]{6})\)/i.exec(el.getAttribute('title') ?? '')?.[1].toLowerCase() ?? '';
const swatch = (c: HTMLElement, hex: string): HTMLElement => {
	const found = Array.from(c.querySelectorAll<HTMLElement>('[data-dse-control="cond.swatch"]')).find((b) => swatchHex(b) === hex);
	if (!found) throw new Error(`no swatch for ${hex}`);
	return found;
};
const pickSwatch = (c: HTMLElement, hex: string): void => swatch(c, hex).click();
const pressedSwatches = (c: HTMLElement): string[] =>
	Array.from(c.querySelectorAll('[data-dse-control="cond.swatch"][aria-pressed="true"]')).map(swatchHex);
const lastEmit = (o: Open): Condition[] => o.onChange.mock.calls[o.onChange.mock.calls.length - 1][0];

function openAdd(c: HTMLElement): HTMLInputElement {
	qs(c, 'button[aria-label="Add condition"]').click();
	return qs<HTMLInputElement>(c, '.dse-condal__input');
}
function typeQuery(input: HTMLInputElement, text: string): void {
	input.value = text;
	input.dispatchEvent(new Event('input'));
}
const mousedown = (el: HTMLElement): void => {
	el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
};
const menuItems = (c: HTMLElement): HTMLElement[] => Array.from(c.querySelectorAll<HTMLElement>('[data-dse-control="cond.option"]'));
/** Type `text` and pick the option whose label starts with `label` (the custom row's reads `Add custom: "..."`). */
function pickOption(c: HTMLElement, text: string, label: string): void {
	const input = c.querySelector<HTMLInputElement>('.dse-condal__input') ?? openAdd(c);
	typeQuery(input, text);
	const item = menuItems(c).find((i) => (i.textContent ?? '').startsWith(label));
	if (!item) throw new Error(`no option "${label}" for "${text}": ${menuItems(c).map((i) => i.textContent).join(' | ')}`);
	mousedown(item);
}

afterEach(() => {
	document.body.innerHTML = '';
});

// ------------------------------------------------------------------------------------------ duration

/** The five start shapes a condition can arrive in (note YAML spells durations three ways) and what each duration pick must leave. */
const DURATION_STARTS: Array<{ name: string; start: Entry; after: Record<string, Condition> }> = [
	{
		name: 'a plain string',
		start: 'bleeding',
		after: { 'Until removed': { key: 'bleeding' }, 'End of Turn': { key: 'bleeding', duration: 'eot' }, 'Save Ends': { key: 'bleeding', duration: 'save-ends' }, 'End of Encounter': { key: 'bleeding', duration: 'eoe' } },
	},
	{
		name: 'an object with a first-class duration',
		start: { key: 'bleeding', duration: 'eot' },
		after: { 'Until removed': { key: 'bleeding' }, 'End of Turn': { key: 'bleeding', duration: 'eot' }, 'Save Ends': { key: 'bleeding', duration: 'save-ends' }, 'End of Encounter': { key: 'bleeding', duration: 'eoe' } },
	},
	{
		name: 'a legacy effect-text duration',
		start: { key: 'bleeding', effect: 'save ends' },
		after: { 'Until removed': { key: 'bleeding' }, 'End of Turn': { key: 'bleeding', duration: 'eot' }, 'Save Ends': { key: 'bleeding', duration: 'save-ends' }, 'End of Encounter': { key: 'bleeding', duration: 'eoe' } },
	},
	{
		name: 'a real effect and a colour (neither is a duration)',
		start: { key: 'bleeding', effect: 'glow', color: '#2874a6' },
		after: {
			'Until removed': { key: 'bleeding', effect: 'glow', color: '#2874a6' },
			'End of Turn': { key: 'bleeding', effect: 'glow', color: '#2874a6', duration: 'eot' },
			'Save Ends': { key: 'bleeding', effect: 'glow', color: '#2874a6', duration: 'save-ends' },
			'End of Encounter': { key: 'bleeding', effect: 'glow', color: '#2874a6', duration: 'eoe' },
		},
	},
	{
		name: 'a first-class duration with a dead legacy effect text riding along',
		start: { key: 'bleeding', duration: 'eot', effect: 'save ends' },
		after: { 'Until removed': { key: 'bleeding' }, 'End of Turn': { key: 'bleeding', duration: 'eot' }, 'Save Ends': { key: 'bleeding', duration: 'save-ends' }, 'End of Encounter': { key: 'bleeding', duration: 'eoe' } },
	},
];
const DURATION_LABELS = ['Until removed', 'End of Turn', 'Save Ends', 'End of Encounter'];
const DURATION_PRESSED: Record<string, string> = { 'Until removed': 'Until removed', 'End of Turn': 'End of Turn', 'Save Ends': 'Save Ends', 'End of Encounter': 'End of Encounter' };

describe('SC-436 matrix: the duration chips (start shape x preset x host)', () => {
	for (const kind of ['hero', 'creature'] as HostKind[]) {
		for (const { name, start, after } of DURATION_STARTS) {
			test.each(DURATION_LABELS)(`${kind}, ${name}: "%s" writes one change with exactly the expected entry and presses only that chip`, (label) => {
				const o = open([start], kind);
				openEditor(o.container, 0);
				pick(o.container, 'Duration', label);
				expect(o.onChange).toHaveBeenCalledTimes(1);
				expect(lastEmit(o)).toEqual([after[label]]);
				expect(o.holder.conditions).toEqual([after[label]]);
				expect(pressedIn(o.container, 'Duration')).toEqual([DURATION_PRESSED[label]]);
			});
		}
	}
});

// ----------------------------------------------------------------------------------------------- effect

const EFFECT_STARTS: Array<{ name: string; start: Entry; duration: string | undefined }> = [
	{ name: 'a plain string', start: 'dazed', duration: undefined },
	{ name: 'nothing but a key', start: { key: 'dazed' }, duration: undefined },
	{ name: 'a first-class duration', start: { key: 'dazed', duration: 'eoe' }, duration: 'eoe' },
	{ name: 'a legacy "save ends" effect text', start: { key: 'dazed', effect: 'save ends' }, duration: 'save-ends' },
	{ name: 'a legacy "EoT" effect text', start: { key: 'dazed', effect: 'EoT' }, duration: 'eot' },
	{ name: 'a first-class duration AND a legacy effect text (the explicit duration wins)', start: { key: 'dazed', duration: 'eoe', effect: 'save ends' }, duration: 'eoe' },
	{ name: 'a real effect already set', start: { key: 'dazed', effect: 'blink' }, duration: undefined },
];
const EFFECTS: Array<[chip: string, effect: string | undefined]> = [
	['static', undefined],
	['blink', 'blink'],
	['glow', 'glow'],
	['glow-pulse', 'glow-pulse'],
	['breathing', 'breathing'],
	['blur-pulse', 'blur-pulse'],
];

describe('SC-436 matrix: the effect chips (start shape x effect x host)', () => {
	for (const kind of ['hero', 'creature'] as HostKind[]) {
		for (const { name, start, duration } of EFFECT_STARTS) {
			test.each(EFFECTS)(`${kind}, ${name}: "%s" writes effect %s and keeps or migrates the duration`, (chip, effect) => {
				const o = open([start], kind);
				openEditor(o.container, 0);
				pick(o.container, 'Effect', chip);
				const expected: Condition = { key: 'dazed' };
				if (duration) expected.duration = duration as Condition['duration'];
				if (effect) expected.effect = effect;
				expect(o.onChange).toHaveBeenCalledTimes(1);
				expect(lastEmit(o)).toEqual([expected]);
				expect(pressedIn(o.container, 'Effect')).toEqual([chip]);
			});
		}
	}
});

// ----------------------------------------------------------------------------------------------- colour

const SWATCHES = ['#c0392b', '#b9770e', '#1e8449', '#2874a6', '#7d3c98'];
const COLOR_STARTS: Array<{ name: string; color: string | undefined; pressed: string[]; custom: boolean }> = [
	{ name: 'no colour', color: undefined, pressed: [], custom: false },
	{ name: 'a preset', color: '#c0392b', pressed: ['#c0392b'], custom: false },
	{ name: 'a preset spelled in upper case', color: '#C0392B', pressed: ['#c0392b'], custom: false },
	{ name: 'a custom hex', color: '#123456', pressed: [], custom: true },
	{ name: 'a CSS colour name', color: 'teal', pressed: [], custom: true },
	{ name: 'a colour that does not parse', color: 'not-a-colour', pressed: [], custom: false },
];
const customSelected = (c: HTMLElement): boolean => qs(c, '.dse-swatch--custom').hasAttribute('data-selected');
const defaultBtn = (c: HTMLElement): HTMLElement => qs(c, '[role="group"][aria-label="Color"] button[aria-label="Default"]');

describe('SC-436 matrix: the colour swatches and the custom colour (start colour x pick)', () => {
	test.each(COLOR_STARTS)('opening the editor on $name presses $pressed and marks the pipette selected: $custom', ({ color, pressed, custom }) => {
		const o = open([{ key: 'prone', color }]);
		openEditor(o.container, 0);
		expect(pressedSwatches(o.container)).toEqual(pressed);
		expect(customSelected(o.container)).toBe(custom);
		expect(o.onChange).not.toHaveBeenCalled();
	});

	for (const { name, color } of COLOR_STARTS) {
		// Re-pressing the swatch that is already selected is its own row below.
		const others = SWATCHES.filter((hex) => color?.toLowerCase() !== hex);
		test.each(others)(`from ${name}: the swatch %s writes it, presses only itself and unmarks the pipette`, (hex) => {
			const o = open([{ key: 'prone', color }]);
			openEditor(o.container, 0);
			pickSwatch(o.container, hex);
			expect(o.onChange).toHaveBeenCalledTimes(1);
			expect(lastEmit(o)).toEqual([{ key: 'prone', color: hex }]);
			expect(pressedSwatches(o.container)).toEqual([hex]);
			expect(customSelected(o.container)).toBe(false);
		});
	}

	test.each([
		['a preset', '#c0392b'],
		['a preset spelled in upper case', '#C0392B'],
	])('from %s: pressing the swatch that is already selected writes that colour again and keeps it pressed (no toggle-to-unset: the Default option clears)', (_n, color) => {
		const o = open([{ key: 'prone', color }]);
		openEditor(o.container, 0);
		pickSwatch(o.container, '#c0392b');
		expect(lastEmit(o)).toEqual([{ key: 'prone', color: '#c0392b' }]);
		expect(pressedSwatches(o.container)).toEqual(['#c0392b']);
	});

	test.each([
		['a custom hex', '#123456', true, []],
		['white (the input\'s own default)', '#ffffff', true, []],
		['a hex equal to a preset', '#2874a6', false, ['#2874a6']],
	] as Array<[string, string, boolean, string[]]>)('the custom colour input picking %s writes it, and the pipette is selected: %s', (_n, hex, custom, pressed) => {
		const o = open(['prone']);
		openEditor(o.container, 0);
		const input = qs<HTMLInputElement>(o.container, '[data-dse-control="cond.color-custom"]');
		input.value = hex;
		input.dispatchEvent(new Event('change'));
		expect(o.onChange).toHaveBeenCalledTimes(1);
		expect(lastEmit(o)).toEqual([{ key: 'prone', color: hex }]);
		expect(customSelected(o.container)).toBe(custom);
		expect(pressedSwatches(o.container)).toEqual(pressed);
	});

	// SC-582: the swatch's accessible name is its colour name; the hex is only in the tooltip (the `title`, "Name (#hex)"), which a
	// screen reader may still read after the name as the description.
	test('SC-582: each preset swatch\'s aria-label is the colour name its title shows', () => {
		const o = open(['prone']);
		openEditor(o.container, 0);
		const swatches = Array.from(o.container.querySelectorAll<HTMLElement>('[data-dse-control="cond.swatch"]'));
		expect(swatches).toHaveLength(5);
		const names = swatches.map((s) => (s.getAttribute('title') ?? '').split(' (')[0]);
		expect(names).toEqual(['Red', 'Amber', 'Green', 'Blue', 'Purple']); // setup: the titles name the colours
		swatches.forEach((s, i) => expect(s.getAttribute('aria-label')).toBe(names[i]));
	});

	// SC-581: the Color group's reset choice, mirroring the Icon group's "Default".
	describe('the Default option', () => {
		test('it is the first control of the Color group: a text button named "Default", tooltip says what it does, own control id', () => {
			const o = open([{ key: 'prone', color: '#c0392b' }]);
			openEditor(o.container, 0);
			const first = qs(o.container, '[role="group"][aria-label="Color"] button');
			expect(first).toBe(defaultBtn(o.container));
			expect(first.getAttribute('type')).toBe('button');
			expect(first.textContent).toBe('Default'); // visible text, so it reads without hue
			expect(first.getAttribute('title')).toBe('Default (no color)');
			expect(first.getAttribute('data-dse-control')).toBe('cond.color-default');
		});

		test.each(COLOR_STARTS)('opening the editor on $name: Default is pressed only when the colour is none or does not parse, and exactly one option is pressed', ({ color, pressed, custom }) => {
			const o = open([{ key: 'prone', color }]);
			openEditor(o.container, 0);
			const isDefault = pressed.length === 0 && !custom;
			expect(defaultBtn(o.container).getAttribute('aria-pressed')).toBe(String(isDefault));
			expect(pressedSwatches(o.container)).toEqual(pressed);
			expect(pressedIn(o.container, 'Color').length + (custom ? 1 : 0)).toBe(1); // the pipette is a <label>: it marks `data-selected`, not `aria-pressed`
			expect(o.onChange).not.toHaveBeenCalled();
		});

		test.each([
			['a preset', '#c0392b'],
			['a preset spelled in upper case', '#C0392B'],
			['a custom hex', '#123456'],
			['a CSS colour name', 'teal'],
		])('pressing it from %s removes the `color` key (not written as empty), presses Default and nothing else, and keeps the other fields', (_n, color) => {
			const o = open([{ key: 'prone', color, duration: 'eot', effect: 'glow' }]);
			openEditor(o.container, 0);
			defaultBtn(o.container).click();
			expect(o.onChange).toHaveBeenCalledTimes(1);
			expect(lastEmit(o)).toEqual([{ key: 'prone', duration: 'eot', effect: 'glow' }]);
			expect('color' in lastEmit(o)[0]).toBe(false);
			expect('color' in (o.holder.conditions![0] as Condition)).toBe(false);
			expect(pressedIn(o.container, 'Color')).toEqual(['Default']);
			expect(customSelected(o.container)).toBe(false);
		});

		test('pressing it leaves focus on the rebuilt Default button', () => {
			const o = open([{ key: 'prone', color: '#123456' }]);
			openEditor(o.container, 0);
			const before = defaultBtn(o.container);
			before.click();
			expect(defaultBtn(o.container)).not.toBe(before);
			expect(document.activeElement).toBe(defaultBtn(o.container));
		});

		test('the row preview loses its colour; setting a swatch again restores it, and Default is then unpressed', () => {
			const o = open([{ key: 'prone', color: '#c0392b' }]);
			const glyph = (): HTMLElement => qs(o.container, '.dse-condal__glyph');
			expect(glyph().style.getPropertyValue('--dse-condition-color')).toBe('#c0392b'); // setup: the preview is coloured
			openEditor(o.container, 0);
			defaultBtn(o.container).click();
			expect(glyph().style.getPropertyValue('--dse-condition-color')).toBe('');
			pickSwatch(o.container, '#2874a6');
			expect(glyph().style.getPropertyValue('--dse-condition-color')).toBe('#2874a6');
			expect(defaultBtn(o.container).getAttribute('aria-pressed')).toBe('false');
			expect(pressedSwatches(o.container)).toEqual(['#2874a6']);
		});

		test('pressing it on a condition that has no colour is a harmless no-op write that leaves it pressed and the key absent', () => {
			const o = open([{ key: 'prone' }]);
			openEditor(o.container, 0);
			defaultBtn(o.container).click();
			expect(lastEmit(o)).toEqual([{ key: 'prone' }]);
			expect(pressedIn(o.container, 'Color')).toEqual(['Default']);
		});

		test('pressing it on a plain-string condition writes an object without a colour', () => {
			const o = open(['prone']);
			openEditor(o.container, 0);
			defaultBtn(o.container).click();
			expect(lastEmit(o)).toEqual([{ key: 'prone' }]);
		});
	});
});

// --------------------------------------------------------------------------------------------------- icon

describe('SC-436 matrix: the icon picker (start icon x pick)', () => {
	const choices = (c: HTMLElement): string[] => Array.from(c.querySelectorAll('[data-dse-control="cond.icon"]')).map((b) => b.getAttribute('aria-label') ?? '');

	test.each([
		['a known condition with no icon', { key: 'bleeding' }, ['Use default condition icon']],
		['a custom condition with no icon', { key: 'hexed' }, ['Use default condition icon']],
		['an icon the catalogue lists', { key: 'hexed', icon: 'skull' }, ['Icon: skull']],
		['an icon outside the suggested set', { key: 'hexed', icon: 'sparkles' }, ['Icon: sparkles']],
	] as Array<[string, Condition, string[]]>)('on %s the pressed choice is %j', (_n, entry, pressed) => {
		const o = open([entry]);
		openEditor(o.container, 0);
		expect(pressedIn(o.container, 'Condition icon')).toEqual(pressed);
		expect(o.onChange).not.toHaveBeenCalled();
	});

	test('a pick writes only `icon`, the default choice removes it, and neither moves the other fields', () => {
		const entry: Condition = { key: 'hexed', duration: 'eoe', color: '#b9770e', effect: 'glow' };
		const o = open([entry], 'creature');
		openEditor(o.container, 0);
		qs(o.container, 'button[aria-label="Icon: skull"]').click();
		expect(lastEmit(o)).toEqual([{ ...entry, icon: 'skull' }]);
		qs(o.container, 'button[aria-label="Use default condition icon"]').click();
		expect(lastEmit(o)).toEqual([entry]);
		expect(o.onChange).toHaveBeenCalledTimes(2);
	});

	test.each([
		['sk', ['Use default condition icon', 'Icon: skull']],
		['SPARK', ['Use default condition icon', 'Icon: sparkles']],
		['  shield ', ['Use default condition icon', 'Icon: shield']],
		['zzzz', ['Use default condition icon']],
	] as Array<[string, string[]]>)('typing "%s" in the search leaves the choices %j and writes nothing', (query, expected) => {
		const o = open([{ key: 'hexed' }]);
		openEditor(o.container, 0);
		typeQuery(qs<HTMLInputElement>(o.container, '[data-dse-control="cond.icon-search"]'), query);
		expect(choices(o.container)).toEqual(expected);
		expect(o.onChange).not.toHaveBeenCalled();
	});
});

// ----------------------------------------------------------------------------------------------- adding

const STANDARD_KEYS = ['Bleeding', 'Dazed', 'Frightened', 'Grabbed', 'Prone', 'Restrained', 'Slowed', 'Taunted', 'Weakened'];
const PSEUDO_NAMES = ['Marked', 'Triggered Action Used', 'Covered', 'Concealed', 'Dead', 'Defending', 'Dying', 'Falling', 'Flanking', 'Hidden', 'High Ground', 'Invisible', 'Sneaking', 'Unconscious', 'Winded'];
const KEY_OF: Record<string, string> = { 'Triggered Action Used': 'used-triggered-action', 'High Ground': 'high-ground' };
const keyOf = (name: string): string => KEY_OF[name] ?? name.toLowerCase();

describe('SC-436 matrix: picking a known condition (every catalogue entry x host x existing entry forms)', () => {
	// The existing conditions arrive in both forms; neither is among the names picked below.
	const EXISTING: Entry[] = [{ key: 'restrained', duration: 'save-ends' }, 'sneaking'];
	const names = [...STANDARD_KEYS, ...PSEUDO_NAMES].filter((n) => !['Restrained', 'Sneaking'].includes(n));

	for (const kind of ['hero', 'creature'] as HostKind[]) {
		test.each(names)(`${kind}: "%s" appends {key} once, normalises the string entry and clones the object, and leaves the rest of the actor alone`, (name) => {
			const o = open(EXISTING.map((e) => (typeof e === 'string' ? e : { ...e })), kind);
			const before = JSON.stringify({ ...o.holder, conditions: undefined });
			pickOption(o.container, name, name);
			expect(o.onChange).toHaveBeenCalledTimes(1);
			expect(lastEmit(o)).toEqual([{ key: 'restrained', duration: 'save-ends' }, { key: 'sneaking' }, { key: keyOf(name) }]);
			expect(o.holder.conditions).toEqual(lastEmit(o));
			expect(JSON.stringify({ ...o.holder, conditions: undefined })).toBe(before);
			expect(rowNames(o.container)).toHaveLength(3);
		});
	}

	test.each(['Restrained', 'Sneaking'])('a condition the actor already has ("%s", in either entry form) is a no-op: no change event, still one row of it', (name) => {
		const o = open([{ key: 'restrained', duration: 'save-ends' }, 'sneaking']);
		pickOption(o.container, name, name);
		expect(o.onChange).not.toHaveBeenCalled();
		expect(rowNames(o.container)).toHaveLength(2);
	});

	test('the emitted array and its entries are fresh copies: editing them cannot reach the window\'s own state', () => {
		const o = open([{ key: 'prone', duration: 'eot' }]);
		pickOption(o.container, 'Dazed', 'Dazed');
		const emitted = lastEmit(o);
		emitted[0].duration = 'eoe';
		emitted.push({ key: 'injected' });
		pickOption(o.container, 'Bleeding', 'Bleeding');
		expect(lastEmit(o)).toEqual([{ key: 'prone', duration: 'eot' }, { key: 'dazed' }, { key: 'bleeding' }]);
	});

	test('the window never mutates the holder\'s own entries before the first change (a string stays a string, an object keeps its identity)', () => {
		const obj: Condition = { key: 'prone' };
		const o = open(['bleeding', obj]);
		expect(o.holder.conditions).toEqual(['bleeding', { key: 'prone' }]);
		openEditor(o.container, 1);
		pick(o.container, 'Duration', 'Save Ends');
		expect(obj).toEqual({ key: 'prone' }); // the clone took the change, not the holder's object
	});
});

// ------------------------------------------------------------------------------------------- custom names

const SLUGS: Array<[text: string, key: string]> = [
	['Fire Aura', 'fire-aura'],
	['Fire Aura!', 'fire-aura'],
	['  spaced   out  ', 'spaced-out'],
	['ALL CAPS', 'all-caps'],
	['snake_case_name', 'snake-case-name'],
	['Ünholy', 'unholy'],
	['Mixed 9 Lives', 'mixed-9-lives'],
	['a'.repeat(80), 'a'.repeat(64)],
	[`${'ab '.repeat(30)}end`, `${'ab-'.repeat(21)}a`],
];

describe('SC-436 matrix: custom conditions (typed text -> key)', () => {
	test.each(SLUGS)('"%s" adds { key: "%s" } through the "Add custom" row, tagged custom, with the fallback glyph', (text, key) => {
		const o = open([]);
		pickOption(o.container, text, 'Add custom:');
		expect(lastEmit(o)).toEqual([{ key }]);
		const row = qs(o.container, '.dse-condal__row');
		expect(row.querySelector('.dse-condal__tag')?.textContent).toBe('custom');
		expect(row.querySelector('.dse-condal__glyph')?.getAttribute('data-icon')).toBe('circle-dashed');
	});

	test.each(['!!!', '---', '???  ...'])('"%s" slugs to nothing: no row, no change event, the dropdown stays open', (text) => {
		const o = open([]);
		const input = openAdd(o.container);
		typeQuery(input, text);
		const custom = menuItems(o.container).find((i) => (i.textContent ?? '').startsWith('Add custom:'));
		expect(custom).toBeDefined();
		mousedown(custom!); // punctuation offers a custom row, and the pick is dropped
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(o.onChange).not.toHaveBeenCalled();
		expect(rowNames(o.container)).toEqual([]);
		expect(o.container.querySelector('.dse-condal__input')).not.toBeNull();
	});

	test('whitespace-only text is the same as an empty query: the whole catalogue, no "Add custom" row', () => {
		const o = open([]);
		typeQuery(openAdd(o.container), '    ');
		expect(menuItems(o.container).length).toBe(STANDARD_KEYS.length + PSEUDO_NAMES.length);
		expect(menuItems(o.container).some((i) => (i.textContent ?? '').startsWith('Add custom:'))).toBe(false);
	});

	test('a custom name that slugs to a key the actor already has is a no-op (Hexed typed twice, two spellings)', () => {
		const o = open([]);
		pickOption(o.container, 'Hexed', 'Add custom:');
		pickOption(o.container, 'HEXED!!', 'Add custom:');
		expect(o.onChange).toHaveBeenCalledTimes(1);
		expect(rowNames(o.container)).toEqual(['Hexed']);
	});

	test('a custom name that slugs to a catalogue key lands on that catalogue condition (no CUSTOM tag)', () => {
		const o = open([]);
		pickOption(o.container, 'Dazed!', 'Add custom:');
		expect(lastEmit(o)).toEqual([{ key: 'dazed' }]);
		expect(o.container.querySelector('.dse-condal__tag')).toBeNull();
	});

	test.each(['hero', 'creature'] as HostKind[])('%s: a custom condition then a duration, colour and effect all land on the same entry, in order, one change each', (kind) => {
		const o = open([], kind);
		pickOption(o.container, 'Fire Aura', 'Add custom:');
		openEditor(o.container, 0);
		pick(o.container, 'Duration', 'Save Ends');
		pickSwatch(o.container, '#b9770e');
		pick(o.container, 'Effect', 'glow-pulse');
		expect(o.onChange).toHaveBeenCalledTimes(4);
		expect(lastEmit(o)).toEqual([{ key: 'fire-aura', duration: 'save-ends', color: '#b9770e', effect: 'glow-pulse' }]);
	});

	// SC-257 (open): a non-Latin custom name slugs to an empty key, and the pick is silently dropped.
	test.failing('SC-257: a custom condition named in a non-Latin script is added (it slugs to nothing today)', () => {
		const o = open([]);
		pickOption(o.container, '火', 'Add custom:');
		expect(o.onChange).toHaveBeenCalledTimes(1);
	});
});

// --------------------------------------------------------------------------------------------- removal

describe('SC-436 matrix: removing a row (rows x open editor x removed row)', () => {
	const NAMES = ['bleeding', 'dazed', 'prone'];
	const focusLabel = (): string | null => document.activeElement?.getAttribute('aria-label') ?? null;
	// [open editor row | null, removed row, remaining names, editor row after | null, focus]
	const CASES: Array<[number | null, number, string[], string | null, string]> = [
		[null, 0, ['Dazed', 'Prone'], null, 'Customize Dazed'],
		[null, 1, ['Bleeding', 'Prone'], null, 'Customize Prone'],
		[null, 2, ['Bleeding', 'Dazed'], null, 'Customize Dazed'],
		[0, 1, ['Bleeding', 'Prone'], 'Bleeding', 'Customize Prone'],
		[2, 0, ['Dazed', 'Prone'], 'Prone', 'Customize Dazed'],
		[1, 0, ['Dazed', 'Prone'], 'Dazed', 'Customize Dazed'],
		[1, 1, ['Bleeding', 'Prone'], null, 'Customize Prone'],
		[2, 2, ['Bleeding', 'Dazed'], null, 'Customize Dazed'],
		[0, 2, ['Bleeding', 'Dazed'], 'Bleeding', 'Customize Dazed'],
	];

	test.each(CASES)('editor on row %s, remove row %s -> rows %j, editor on %s, focus on "%s"', (editor, removed, remaining, editorAfter, focus) => {
		const o = open([...NAMES]);
		if (editor !== null) openEditor(o.container, editor);
		o.container.querySelectorAll<HTMLElement>('[data-dse-control="cond.remove"]')[removed].click();
		expect(rowNames(o.container)).toEqual(remaining);
		expect(o.onChange).toHaveBeenCalledTimes(1);
		expect(lastEmit(o).map((c) => c.key)).toEqual(remaining.map((n) => n.toLowerCase()));
		const openRows = Array.from(o.container.querySelectorAll('.dse-condal__row--open .dse-condal__name')).map((n) => n.textContent);
		expect(openRows).toEqual(editorAfter ? [editorAfter] : []);
		expect(focusLabel()).toBe(focus);
	});

	test('removing the only row empties the list and focuses "+ Add condition"', () => {
		const o = open([{ key: 'prone', duration: 'eot' }], 'creature');
		o.container.querySelector<HTMLElement>('[data-dse-control="cond.remove"]')!.click();
		expect(lastEmit(o)).toEqual([]);
		expect(o.holder.conditions).toEqual([]);
		expect(document.activeElement).toBe(o.container.querySelector('[data-dse-control="cond.add"]'));
	});

	// SC-585: with the Add search open there is no "+ Add condition" button; the search's input takes focus instead.
	describe('removing a row while the Add search is open', () => {
		const removeButtons = (c: HTMLElement): HTMLElement[] => Array.from(c.querySelectorAll<HTMLElement>('[data-dse-control="cond.remove"]'));
		const press = (el: HTMLElement): void => {
			el.focus();
			el.click(); // a keyboard activation: a click, no mousedown
		};

		test('SC-585: the last row: the search stays open and its input, exactly, has focus', () => {
			const o = open(['prone']);
			const input = openAdd(o.container);
			press(removeButtons(o.container)[0]);
			expect(rowNames(o.container)).toEqual([]);
			expect(lastEmit(o)).toEqual([]);
			expect(searchInput(o.container)).toBe(input); // the same input: the search was not rebuilt or closed
			expect(document.activeElement).toBe(input);
			expect(o.container.querySelector('[data-dse-control="cond.add"]')).toBeNull();
		});

		test('SC-585: the typed query survives and the menu still matches it', () => {
			const o = open(['prone']);
			const input = openAdd(o.container);
			typeQuery(input, 'daz');
			press(removeButtons(o.container)[0]);
			expect(input.value).toBe('daz');
			expect(document.activeElement).toBe(input);
			expect(menuItems(o.container).map((m) => m.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Dazed')]));
		});

		test('SC-585: the combobox\'s aria-activedescendant names a live option after the list empties', () => {
			const o = open(['prone']);
			const input = openAdd(o.container);
			press(removeButtons(o.container)[0]);
			const active = input.getAttribute('aria-activedescendant');
			expect(active).toBeTruthy();
			expect(o.container.querySelector(`[id="${active}"]`)).not.toBeNull();
			expect(input.getAttribute('aria-controls')).toBe(o.container.querySelector('.dse-condal__menu')!.id);
		});

		test('SC-585: a non-last row: focus goes to the row that shifted in, as before, and the search stays open', () => {
			const o = open(['bleeding', 'dazed']);
			const input = openAdd(o.container);
			typeQuery(input, 'x');
			press(removeButtons(o.container)[0]);
			expect(rowNames(o.container)).toEqual(['Dazed']);
			expect(document.activeElement?.getAttribute('aria-label')).toBe('Customize Dazed');
			expect(searchInput(o.container)).toBe(input);
			expect(input.value).toBe('x');
		});

		test('SC-585: Escape afterwards closes just the search and lands on "+ Add condition" (a routed key opened it from the removed trash button)', () => {
			const o = open(['prone']);
			attachObsidianKeymap(o.modal as any);
			const trash = removeButtons(o.container)[0];
			trash.focus();
			keydown(trash, 'd'); // SC-580: the search opens over the focused trash button, which is remembered as the Escape target
			expect(searchInput(o.container)!.value).toBe('d');
			press(trash); // Shift+Tab back to it and Enter: removes it
			expect(trash.isConnected).toBe(false);
			expect(document.activeElement).toBe(searchInput(o.container));
			pressEscape(searchInput(o.container)!);
			expect(searchInput(o.container)).toBeNull();
			expect(document.activeElement).toBe(addButton(o.container));
		});

		test('SC-585: Escape after removing the last row with a normally opened search lands on "+ Add condition"', () => {
			const o = open(['prone']);
			openAdd(o.container);
			press(removeButtons(o.container)[0]);
			keydown(searchInput(o.container)!, 'Escape');
			expect(searchInput(o.container)).toBeNull();
			expect(document.activeElement).toBe(addButton(o.container));
		});
	});

	test.each(['hero', 'creature'] as HostKind[])('%s: removing a row that has a duration and colour drops the whole entry and leaves the others\' settings', (kind) => {
		const keep: Condition = { key: 'dazed', duration: 'save-ends', color: '#1e8449', effect: 'blink' };
		const o = open([{ key: 'prone', duration: 'eot' }, keep], kind);
		o.container.querySelectorAll<HTMLElement>('[data-dse-control="cond.remove"]')[0].click();
		expect(lastEmit(o)).toEqual([keep]);
	});
});

// ------------------------------------------------------------------------------- what writes, what does not

describe('SC-436 matrix: which interactions emit a change (every interaction x emits)', () => {
	const NO_WRITE: Array<[string, (o: Open) => void]> = [
		['opening the window', () => undefined],
		['opening a row editor', (o) => openEditor(o.container, 0)],
		['opening then closing a row editor', (o) => { openEditor(o.container, 0); openEditor(o.container, 0); }],
		['moving the editor from one row to another', (o) => { openEditor(o.container, 0); openEditor(o.container, 1); }],
		['opening the Add dropdown', (o) => { openAdd(o.container); }],
		['typing in the dropdown', (o) => typeQuery(openAdd(o.container), 'da')],
		['arrow keys in the dropdown', (o) => {
			const input = openAdd(o.container);
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
		}],
		['Escape in the dropdown', (o) => openAdd(o.container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))],
		['picking a condition the actor already has', (o) => pickOption(o.container, 'Prone', 'Prone')],
		['typing in the icon search', (o) => { openEditor(o.container, 0); typeQuery(qs<HTMLInputElement>(o.container, '[data-dse-control="cond.icon-search"]'), 'sk'); }],
		['Done', (o) => qs(o.container, '[data-dse-control="cond.done"]').click()],
	];
	test.each(NO_WRITE)('%s emits nothing', (_name, act) => {
		const o = open(['prone', { key: 'dazed', duration: 'eot' }]);
		act(o);
		expect(o.onChange).not.toHaveBeenCalled();
		expect(o.holder.conditions).toEqual(['prone', { key: 'dazed', duration: 'eot' }]);
	});

	const WRITES: Array<[string, (o: Open) => void]> = [
		['picking a known condition', (o) => pickOption(o.container, 'Slowed', 'Slowed')],
		['picking a custom condition', (o) => pickOption(o.container, 'Hexed', 'Add custom:')],
		['Enter in the dropdown', (o) => openAdd(o.container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))],
		['the trash button', (o) => qs(o.container, '[data-dse-control="cond.remove"]').click()],
		['a duration chip', (o) => { openEditor(o.container, 0); pick(o.container, 'Duration', 'End of Turn'); }],
		['an effect chip', (o) => { openEditor(o.container, 0); pick(o.container, 'Effect', 'glow'); }],
		['a swatch', (o) => { openEditor(o.container, 0); pickSwatch(o.container, '#1e8449'); }],
		['an icon', (o) => { openEditor(o.container, 0); qs(o.container, 'button[aria-label="Icon: skull"]').click(); }],
		['the default icon choice', (o) => { openEditor(o.container, 0); qs(o.container, 'button[aria-label="Use default condition icon"]').click(); }],
		['the custom colour input', (o) => {
			openEditor(o.container, 0);
			const input = qs<HTMLInputElement>(o.container, '[data-dse-control="cond.color-custom"]');
			input.value = '#010203';
			input.dispatchEvent(new Event('change'));
		}],
	];
	test.each(WRITES)('%s emits exactly one change, with a list that is not the holder\'s own array', (_name, act) => {
		const o = open(['prone', { key: 'dazed', duration: 'eot' }]);
		const original = o.holder.conditions;
		act(o);
		expect(o.onChange).toHaveBeenCalledTimes(1);
		expect(lastEmit(o)).not.toBe(o.holder.conditions);
		expect(o.holder.conditions).not.toBe(original); // the window hands its own list back to the holder
		expect(o.holder.conditions).toEqual(lastEmit(o));
	});
});

// ------------------------------------------------------------------------------ the icon picker's 24-icon cap

describe('SC-436 matrix: the icon picker caps its matches at 24', () => {
	afterEach(() => jest.restoreAllMocks());
	const choices = (c: HTMLElement): string[] => Array.from(c.querySelectorAll('[data-dse-control="cond.icon"]')).map((b) => b.getAttribute('aria-label') ?? '');
	const gridText = (c: HTMLElement): string => qs(c, '.dse-cond-icons__grid').textContent ?? '';
	/** A host offering 30 icons (`lucide-icon-00` .. `lucide-icon-29`), the way Obsidian offers hundreds. */
	const withThirtyIcons = (): void => {
		jest.spyOn(obsidianCore, 'getIconIds').mockReturnValue(Array.from({ length: 30 }, (_, i) => `lucide-icon-${String(i).padStart(2, '0')}`));
	};
	const search = (o: Open, query: string): void => {
		openEditor(o.container, 0);
		typeQuery(qs<HTMLInputElement>(o.container, '[data-dse-control="cond.icon-search"]'), query);
	};

	test('30 matches show the first 24 (after "Use default") and say so', () => {
		withThirtyIcons();
		const o = open([{ key: 'hexed' }]);
		search(o, 'icon');
		const labels = choices(o.container);
		expect(labels).toHaveLength(25);
		expect(labels[1]).toBe('Icon: icon-00');
		expect(labels[24]).toBe('Icon: icon-23');
		expect(gridText(o.container)).toContain('Showing the first 24 matches. Refine your search for more.');
	});

	test('a query matching fewer than 24 shows all of them with no note; broadening it to 30 matches caps it again', () => {
		withThirtyIcons();
		const o = open([{ key: 'hexed' }]);
		search(o, 'icon-0'); // icon-00 .. icon-09
		expect(choices(o.container)).toHaveLength(11);
		expect(gridText(o.container)).not.toContain('Showing the first 24');
		typeQuery(qs<HTMLInputElement>(o.container, '[data-dse-control="cond.icon-search"]'), 'icon-');
		expect(choices(o.container)).toHaveLength(25); // 30 match, capped
	});

	test('narrowing the query below the cap drops the note; a query that matches nothing says so', () => {
		withThirtyIcons();
		const o = open([{ key: 'hexed' }]);
		search(o, 'icon-2');
		expect(choices(o.container)).toHaveLength(11); // icon-20 .. icon-29
		expect(gridText(o.container)).not.toContain('Showing the first 24');
		typeQuery(qs<HTMLInputElement>(o.container, '[data-dse-control="cond.icon-search"]'), 'nothing');
		expect(choices(o.container)).toEqual(['Use default condition icon']);
		expect(gridText(o.container)).toContain('No matching icons.');
	});

	test('a pick among the capped matches writes that icon and leaves the search text and the cap note in place', () => {
		withThirtyIcons();
		const o = open([{ key: 'hexed' }]);
		search(o, 'icon');
		qs(o.container, 'button[aria-label="Icon: icon-05"]').click();
		expect(lastEmit(o)).toEqual([{ key: 'hexed', icon: 'icon-05' }]);
		expect(qs<HTMLInputElement>(o.container, '[data-dse-control="cond.icon-search"]').value).toBe('icon');
		expect(gridText(o.container)).toContain('Showing the first 24 matches');
	});
});

// ------------------------------------------------------------------------------------------ type to search

/** Dispatches a keydown on `el` the way the browser does (bubbling, cancelable) and returns it, so a test can read `defaultPrevented`. */
function keydown(el: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
	const evt = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
	el.dispatchEvent(evt);
	return evt;
}
const addButton = (c: HTMLElement): HTMLElement => qs(c, 'button[aria-label="Add condition"]');
const searchInput = (c: HTMLElement): HTMLInputElement | null => c.querySelector<HTMLInputElement>('.dse-condal__input');

// SC-580: docs/initiative-tracker.md says "Click '+ Add condition' (or just start typing)". The routing rules are jsdom; that Obsidian's
// real keymap delivers the key to the window's listener is the e2e COND-N07 (jsdom has no keymap, and a key sent to a focused button
// is only typed into the input it hands focus to by a real browser).
describe('SC-580: a printable key in the window opens the Add search with that key typed', () => {
	test('a letter on the focused "+ Add condition" opens the search by the click path: letter typed, input focused, dropdown filtered, key swallowed', () => {
		const o = open([]);
		addButton(o.container).focus();
		const evt = keydown(addButton(o.container), 'd');
		const input = searchInput(o.container)!;
		expect(input.value).toBe('d');
		expect(document.activeElement).toBe(input);
		expect(evt.defaultPrevented).toBe(true); // the browser must not type the letter a second time into the input that took focus
		expect(o.container.querySelector('button[aria-label="Add condition"]')).toBeNull();
		expect(menuItems(o.container).map((i) => i.textContent)).toEqual(expect.arrayContaining(['Dazed']));
		expect(menuItems(o.container)[menuItems(o.container).length - 1].textContent).toContain('Add custom: "d"');
		expect(o.onChange).not.toHaveBeenCalled();
	});

	test('typing "daz" fast: the first key opens, the next two are the input\'s own (not routed, not lost, not doubled) and Dazed is offered', () => {
		const o = open([]);
		addButton(o.container).focus();
		keydown(addButton(o.container), 'd');
		const input = searchInput(o.container)!;
		for (const k of ['a', 'z']) {
			expect(keydown(input, k).defaultPrevented).toBe(false); // the browser types these into the focused input
			input.value += k; // ...which is what the browser does
			input.dispatchEvent(new Event('input'));
		}
		expect(input.value).toBe('daz');
		expect(menuItems(o.container).map((i) => i.textContent)).toEqual(['Dazed', 'Add custom: "daz"']);
		mousedown(menuItems(o.container)[0]);
		expect(lastEmit(o)).toEqual([{ key: 'dazed' }]);
	});

	test('Shift is fine: a capital letter opens with the capital, and the filter ignores case', () => {
		const o = open([]);
		keydown(addButton(o.container), 'Z', { shiftKey: true });
		expect(searchInput(o.container)!.value).toBe('Z');
		expect(menuItems(o.container).map((i) => i.textContent)).toEqual(['Dazed', 'Add custom: "Z"']);
	});

	test('a digit and a punctuation key are printable too', () => {
		const o = open([]);
		keydown(addButton(o.container), '-');
		expect(searchInput(o.container)!.value).toBe('-');
	});

	test('from any other control of the window (a row\'s remove button, Done), not just "+ Add condition"', () => {
		const o = open(['prone']);
		const evt = keydown(qs(o.container, '[data-dse-control="cond.remove"]'), 'f');
		expect(searchInput(o.container)!.value).toBe('f');
		expect(evt.defaultPrevented).toBe(true);
		const o2 = open(['prone']);
		keydown(qs(o2.container, '[data-dse-control="cond.done"]'), 'g');
		expect(searchInput(o2.container)!.value).toBe('g');
	});

	test('the search is already open and focus is elsewhere: the key goes to the END of the typed text and focus moves to the input', () => {
		const o = open(['prone']);
		const input = openAdd(o.container);
		typeQuery(input, 'da');
		qs<HTMLElement>(o.container, '[data-dse-control="cond.done"]').focus();
		expect(document.activeElement).not.toBe(input);
		const evt = keydown(document.activeElement!, 'z');
		expect(searchInput(o.container)).toBe(input); // the same input: nothing rebuilt
		expect(input.value).toBe('daz');
		expect(document.activeElement).toBe(input);
		expect(evt.defaultPrevented).toBe(true);
		expect(menuItems(o.container).map((i) => i.textContent)).toEqual(['Dazed', 'Add custom: "daz"']);
	});

	test.each([
		['Space (a focused button\'s own activation)', ' ', {}],
		['Enter', 'Enter', {}],
		['Tab', 'Tab', {}],
		['an arrow', 'ArrowDown', {}],
		['Escape', 'Escape', {}],
		['Backspace', 'Backspace', {}],
		['Ctrl+letter', 'd', { ctrlKey: true }],
		['Meta+letter', 'd', { metaKey: true }],
		['Alt+letter', 'd', { altKey: true }],
		['a key inside an IME composition', 'd', { isComposing: true }],
	])('%s opens nothing and is not swallowed', (_name, key, init) => {
		const o = open([]);
		const btn = addButton(o.container);
		const evt = keydown(btn, key, init);
		expect(searchInput(o.container)).toBeNull();
		expect(evt.defaultPrevented).toBe(false);
		expect(addButton(o.container)).toBe(btn);
	});

	// SC-580 r3: a letter on an editor chip opens the search over the open editor. Escape (nothing picked) puts focus back on the chip.
	describe('Escape on a search a routed key opened returns focus to the control that had it', () => {
		const durationChip = (c: HTMLElement): HTMLElement => qs(c, '[role="group"][aria-label="Duration"] button[aria-label="End of Turn"]');
		const withEditor = () => {
			const o = open(['prone']);
			attachObsidianKeymap(o.modal as any); // Obsidian's Scope runs first, as in the app (SC-431)
			openEditor(o.container, 0);
			return o;
		};

		test('a Duration chip: the letter opens the search, the editor stays open, Escape closes just the search and focuses the same chip', () => {
			const o = withEditor();
			const chip = durationChip(o.container);
			chip.focus();
			keydown(chip, 'd');
			expect(searchInput(o.container)!.value).toBe('d');
			expect(o.container.querySelector('.dse-condal__row--open')).not.toBeNull();
			const onClose = jest.spyOn(o.modal, 'onClose');
			pressEscape(searchInput(o.container)!);
			expect(searchInput(o.container)).toBeNull();
			expect(document.activeElement).toBe(chip);
			expect(durationChip(o.container)).toBe(chip); // not re-rendered
			expect(o.container.querySelector('.dse-condal__row--open')).not.toBeNull();
			expect(onClose).not.toHaveBeenCalled(); // the dropdown first, the window second (SC-431)
			expect(o.onChange).not.toHaveBeenCalled();
		});

		test('the input\'s own Escape handler (no Scope in front of it) does the same', () => {
			const o = open(['prone']);
			openEditor(o.container, 0);
			const chip = durationChip(o.container);
			chip.focus();
			keydown(chip, 'd');
			keydown(searchInput(o.container)!, 'Escape');
			expect(document.activeElement).toBe(chip);
		});

		test('an icon choice in the icon picker', () => {
			const o = withEditor();
			const choice = qs(o.container, '[role="group"][aria-label="Condition icon"] button');
			choice.focus();
			keydown(choice, 'x');
			expect(searchInput(o.container)!.value).toBe('x');
			pressEscape(searchInput(o.container)!);
			expect(document.activeElement).toBe(choice);
		});

		test('a second Escape (search closed) closes the window', () => {
			const o = withEditor();
			durationChip(o.container).focus();
			keydown(durationChip(o.container), 'd');
			pressEscape(searchInput(o.container)!);
			const onClose = jest.spyOn(o.modal, 'onClose');
			pressEscape(document.activeElement as HTMLElement);
			expect(onClose).toHaveBeenCalledTimes(1);
		});

		test('after a pick, Escape is the usual one: focus goes to "+ Add condition"', () => {
			const o = withEditor();
			durationChip(o.container).focus();
			keydown(durationChip(o.container), 'd');
			typeQuery(searchInput(o.container)!, 'daz');
			mousedown(menuItems(o.container)[0]);
			expect(lastEmit(o).map((c) => c.key)).toEqual(['prone', 'dazed']);
			pressEscape(searchInput(o.container)!);
			expect(document.activeElement).toBe(addButton(o.container));
		});

		test('after a pick, Escape is the usual one even when the remembered control is still there (Done is never re-rendered)', () => {
			const o = withEditor();
			const done = qs<HTMLElement>(o.container, '[data-dse-control="cond.done"]');
			done.focus();
			keydown(done, 'd');
			typeQuery(searchInput(o.container)!, 'daz');
			mousedown(menuItems(o.container)[0]);
			expect(lastEmit(o).map((c) => c.key)).toEqual(['prone', 'dazed']);
			expect(done.isConnected).toBe(true);
			pressEscape(searchInput(o.container)!);
			expect(document.activeElement).toBe(addButton(o.container));
		});

		test('only Escape hands focus back: a click away (on the title) closes the search and focus goes to "+ Add condition"', () => {
			const o = withEditor();
			const chip = durationChip(o.container);
			chip.focus();
			keydown(chip, 'd');
			const title = (o.modal as any).titleEl as HTMLElement;
			title.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
			title.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
			expect(searchInput(o.container)).toBeNull();
			expect(document.activeElement).toBe(addButton(o.container));
		});

		test('the control is gone by Escape: focus goes to "+ Add condition"', () => {
			const o = withEditor();
			const chip = durationChip(o.container);
			chip.focus();
			keydown(chip, 'd');
			chip.remove();
			pressEscape(searchInput(o.container)!);
			expect(document.activeElement).toBe(addButton(o.container));
		});

		test('opened from "+ Add condition" itself (its button is replaced), or by a click: "+ Add condition" as today', () => {
			const o = withEditor();
			keydown(addButton(o.container), 'd');
			pressEscape(searchInput(o.container)!);
			expect(document.activeElement).toBe(addButton(o.container));
			const o2 = withEditor();
			openAdd(o2.container); // by click
			const chip = durationChip(o2.container);
			chip.focus();
			keydown(chip, 'd'); // already open: the key is routed in, but the search was not opened by it
			pressEscape(searchInput(o2.container)!);
			expect(document.activeElement).toBe(addButton(o2.container));
		});

		test('a stale return target does not outlive a close: the next search opened by click returns to "+ Add condition"', () => {
			const o = withEditor();
			const chip = durationChip(o.container);
			chip.focus();
			keydown(chip, 'd');
			pressEscape(searchInput(o.container)!);
			expect(document.activeElement).toBe(chip);
			openAdd(o.container);
			pressEscape(searchInput(o.container)!);
			expect(document.activeElement).toBe(addButton(o.container));
		});
	});

	test('a key something else already handled (defaultPrevented before it reaches the window) is left alone', () => {
		const o = open([]);
		const btn = addButton(o.container);
		btn.addEventListener('keydown', (e) => e.preventDefault());
		keydown(btn, 'd');
		expect(searchInput(o.container)).toBeNull();
	});

	test('a text-entry control keeps its keys: the editor\'s icon search input, a select, a textarea, a contenteditable', () => {
		const o = open(['prone']);
		openEditor(o.container, 0);
		const iconSearch = qs<HTMLInputElement>(o.container, '[data-dse-control="cond.icon-search"]');
		expect(keydown(iconSearch, 'k').defaultPrevented).toBe(false);
		const extras = ['select', 'textarea', 'div'].map((tag) => {
			const el = qs(o.container, '.dse-condal__list').appendChild(document.createElement(tag));
			if (tag === 'div') el.setAttribute('contenteditable', 'true');
			return el;
		});
		for (const el of extras) expect(keydown(el, 's').defaultPrevented).toBe(false);
		const inside = extras[2].appendChild(document.createElement('span'));
		expect(keydown(inside, 's').defaultPrevented).toBe(false); // a child of a contenteditable
		expect(searchInput(o.container)).toBeNull();
	});

	test('contenteditable="false" is not text entry: a key from it routes', () => {
		const o = open(['prone']);
		const el = qs(o.container, '.dse-condal__list').appendChild(document.createElement('div'));
		el.setAttribute('contenteditable', 'false');
		keydown(el, 'q');
		expect(searchInput(o.container)!.value).toBe('q');
	});

	test('a key that starts in a modal stacked above this one is not this window\'s (its container is a sibling, not a descendant)', () => {
		const o = open([]);
		const above = document.body.appendChild(document.createElement('div'));
		above.className = 'modal-container';
		const btn = above.appendChild(document.createElement('button'));
		keydown(btn, 'd');
		expect(searchInput(o.container)).toBeNull();
		expect(addButton(o.container)).toBeTruthy();
	});

	test('the listener lives on the window\'s own element and dies with it: after close a key is no longer routed, and nothing is on the document', () => {
		const docAdd = jest.spyOn(document, 'addEventListener');
		const o = open([]);
		expect(docAdd.mock.calls.filter(([type]) => type === 'keydown')).toEqual([]);
		docAdd.mockRestore();
		const btn = addButton(o.container);
		o.modal.close();
		document.body.appendChild(o.container);
		keydown(btn, 'd');
		expect(searchInput(o.container)).toBeNull();
	});
});

// ------------------------------------------------------------------------------------------ known bugs

describe('SC-436 matrix: known bugs (each marker encodes the correct behaviour and fails today)', () => {

	// SC-581: Icon has "Use default", Duration "Until removed", Effect "static"; the Color group has its own "Default" option.
	// Fix-agnostic: passes if ANY single interaction in the Color group (a default/none option, or re-activating the
	// selected swatch) removes `color` from the written condition.
	test('SC-581: some control in the Color group removes a colour that was set', () => {
		const start = (): Open => {
			const o = open([{ key: 'prone', color: '#c0392b' }]);
			openEditor(o.container, 0);
			return o;
		};
		const buttons = (o: Open): HTMLElement[] => Array.from(o.container.querySelectorAll<HTMLElement>('[role="group"][aria-label="Color"] button'));
		expect(buttons(start()).length).toBeGreaterThanOrEqual(5); // setup: the five swatches are there
		let cleared = false;
		for (let i = 0; i < buttons(start()).length; i++) {
			const o = start();
			buttons(o)[i].click();
			if (o.onChange.mock.calls.length && lastEmit(o)[0].color === undefined) cleared = true;
		}
		expect(cleared).toBe(true);
	});

	// SC-585: removeAt used to focus "+ Add condition" when the list empties, but that button does not exist while the Add
	// dropdown is open; it now focuses the dropdown's input instead (the dropdown stays open).
	test('SC-585: keyboard-removing the last condition with the Add dropdown open leaves focus inside the window, not on <body>', () => {
		const o = open(['prone']);
		openAdd(o.container);
		expect(o.container.querySelector('.dse-condal__input')).not.toBeNull(); // setup: the dropdown is open
		const trash = qs<HTMLElement>(o.container, '[data-dse-control="cond.remove"]');
		trash.focus();
		trash.click(); // a keyboard activation sends a click and no mousedown, so the dropdown stays open
		expect(rowNames(o.container)).toEqual([]);
		expect(document.activeElement).not.toBe(document.body);
		expect(o.container.contains(document.activeElement)).toBe(true);
	});

	// SC-586 (a): a CSS-named colour marks the pipette selected, but the colour input is only ever given a #rrggbb value.
	// jsdom has no canvas, so the test stubs a minimal 2D context whose `fillStyle` resolves `teal` to `#008080` (as a real
	// browser does): a lookup-table fix and a canvas-based fix then both flip this marker.
	test.failing('SC-586: for `color: teal` the custom colour input starts at teal\'s hex', () => {
		let fill = '#000000';
		const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
			get fillStyle(): string {
				return fill;
			},
			set fillStyle(v: string) {
				fill = v === 'teal' ? '#008080' : v;
			},
		})) as unknown as HTMLCanvasElement['getContext']);
		try {
			const o = open([{ key: 'prone', color: 'teal' }]);
			openEditor(o.container, 0);
			expect(customSelected(o.container)).toBe(true); // setup: the pipette treats teal as the selected custom colour
			expect(qs<HTMLInputElement>(o.container, '[data-dse-control="cond.color-custom"]').value).toBe('#008080');
		} finally {
			getContext.mockRestore();
		}
	});

	// SC-586 (b): `icon: ""` draws the default glyph but "Use default" is not pressed.
	test.failing('SC-586: for `icon: ""` the "Use default condition icon" choice is the pressed one', () => {
		const o = open([{ key: 'hexed', icon: '' }]);
		expect(qs(o.container, '.dse-condal__glyph').getAttribute('data-icon')).toBe('circle-dashed'); // setup: the row shows the default glyph
		openEditor(o.container, 0);
		expect(pressedIn(o.container, 'Condition icon')).toEqual(['Use default condition icon']);
	});
});
