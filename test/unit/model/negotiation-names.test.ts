// SC-640 — same-named and nameless motivations / pitfalls, at the model: one rule for "same name" (trimmed, case-insensitive), a chosen-list
// entry found whatever its spelling, one group (one chip) per distinct name, a Spent flag per ENTRY, Complete spending every entry of a name.
import {
	addUsed, groupByName, isUsed, labelOf, nameKey, NegotiationData, parseNegotiationData, removeUsed, sameName, sharedNameNotice,
} from '@model/NegotiationData';

const HEAD = 'name: x\ninitial_interest: 3\ninitial_patience: 3\n';
const parse = (body: string): NegotiationData => parseNegotiationData(HEAD + body);
const TWO_PEACE = 'motivations:\n  - name: Peace\n    reason: a\n  - name: Peace\n    reason: b\n';

describe('SC-640: one rule for "same name"', () => {
	test('nameKey and sameName are trimmed and case-insensitive; a blank name is a key; what is not text never matches', () => {
		expect(nameKey('  Higher Authority ')).toBe('higher authority');
		expect(nameKey('')).toBe('');
		expect(nameKey('   ')).toBe('');
		expect(nameKey(null)).toBeUndefined();
		expect(nameKey(5)).toBeUndefined();
		expect(sameName(' power ', 'Power')).toBe(true);
		expect(sameName('Power', 'Peace')).toBe(false);
		expect(sameName('', '  ')).toBe(true);
		expect(sameName(null, null)).toBe(false);
	});

	test('isUsed finds an entry whatever its spelling; addUsed writes the entry\'s spelling once; removeUsed takes every match off', () => {
		const list = [' higher authority '];
		expect(isUsed(list, 'Higher Authority')).toBe(true);
		addUsed(list, 'Higher Authority');
		expect(list).toEqual([' higher authority ']); // already there
		addUsed(list, 'Peace');
		expect(list).toEqual([' higher authority ', 'Peace']);
		removeUsed(list, 'HIGHER AUTHORITY');
		expect(list).toEqual(['Peace']);
		const twice = ['5', 'Power', ' power', '5'];
		removeUsed(twice, 'POWER');
		expect(twice).toEqual(['5', '5']); // every match goes, so one press clears the chip; other names stay
		expect(isUsed([null], 'Peace')).toBe(false);
	});

	test('groupByName keeps the order each name first appears and the spelling of the first', () => {
		const m = parse('motivations:\n  - name: Power\n  - name: Peace\n  - name: " power "\n  - name: PEACE\n  - name: POWER\n');
		const groups = groupByName(m.motivations);
		expect(groups.map((g) => [g.name, g.members.length])).toEqual([['Power', 3], ['Peace', 2]]);
		expect(groups[0].members.map((x) => x.name)).toEqual(['Power', 'power', 'POWER']); // names are trimmed at read
	});

	test('labelOf names a nameless entry for display and leaves a name alone', () => {
		expect(labelOf('', 'Motivation')).toBe('Unnamed Motivation');
		expect(labelOf('', 'Pitfall')).toBe('Unnamed Pitfall');
		expect(labelOf('Peace', 'Motivation')).toBe('Peace');
		expect(parse('motivations:\n  - reason: r\n').motivations[0].name).toBe(''); // the model keeps it nameless
	});

	test('sharedNameNotice: none for one entry; twice, three times, N times; nameless', () => {
		const notice = (body: string, kind: 'Motivation' | 'Pitfall' = 'Motivation', chip = 'this chip'): Array<string | null> => {
			const m = parse(body);
			return groupByName(kind === 'Motivation' ? m.motivations : m.pitfalls).map((g) => sharedNameNotice(g, kind, chip));
		};
		const names = (n: number, name: string, key = 'motivations'): string => `${key}:\n` + `  - name: ${name}\n`.repeat(n);
		expect(notice(names(1, 'Peace'))).toEqual([null]);
		expect(notice(names(2, 'Higher Authority'))).toEqual(['Higher Authority is listed twice; this chip stands for both.']);
		expect(notice(names(3, 'Peace'))).toEqual(['Peace is listed three times; this chip stands for all three.']);
		expect(notice(names(5, 'Peace'))).toEqual(['Peace is listed 5 times; this chip stands for all 5.']);
		expect(notice(names(2, 'Power', 'pitfalls'), 'Pitfall', 'the Argument chip')).toEqual(['Power is listed twice; the Argument chip stands for both.']);
		expect(notice('motivations:\n  - reason: a\n  - reason: b\n')).toEqual(['2 Motivations have no name; this chip stands for both of them.']);
		expect(notice('pitfalls:\n  - reason: a\n  - reason: b\n  - name: " "\n', 'Pitfall')).toEqual(['3 Pitfalls have no name; this chip stands for all of them.']);
	});
});

describe('SC-640: the model reads what the card shows under that rule', () => {
	test('setMotivationUsed(entry) flips THAT entry only; a name flips every entry of it', () => {
		const m = parse(TWO_PEACE);
		m.setMotivationUsed(m.motivations[1], true);
		expect(m.motivations.map((x) => x.hasBeenAppealedTo)).toEqual([false, true]);
		m.setMotivationUsed(m.motivations[1], false);
		expect(m.motivations.map((x) => x.hasBeenAppealedTo)).toEqual([false, false]);
		m.setMotivationUsed('PEACE', true);
		expect(m.motivations.map((x) => x.hasBeenAppealedTo)).toEqual([true, true]);
	});

	test('a name is spent when ANY entry of it is; unspending one entry keeps the Reuse flag while the other is still spent', () => {
		const m = parse(TWO_PEACE + 'currentArgument:\n  motivationsUsed: [peace]\n');
		m.setMotivationUsed(m.motivations[0], true);
		m.setMotivationUsed(m.motivations[1], true);
		expect(m.isMotivationSpent('Peace')).toBe(true);
		expect(m.currentArgument.reusedMotivation).toBe(true);
		m.setMotivationUsed(m.motivations[0], false);
		expect(m.isMotivationSpent('Peace')).toBe(true);
		expect(m.argumentReusesMotivation()).toBe(true);
		expect(m.currentArgument.reusedMotivation).toBe(true);
		m.setMotivationUsed(m.motivations[1], false);
		expect(m.isMotivationSpent('Peace')).toBe(false);
		expect(m.currentArgument.reusedMotivation).toBe(false);
	});

	test('a chosen entry in another casing / with spaces is what the card shows as chosen, for the roll, the Same Argument box and Reuse', () => {
		const m = parse('motivations:\n  - name: Higher Authority\n    hasBeenAppealedTo: true\npitfalls:\n  - name: Power\ncurrentArgument:\n  motivationsUsed: [" higher authority "]\n  pitfallsUsed: [POWER]\n  reusedMotivation: true\n');
		expect(m.argumentUsesMotivation()).toBe(true);
		expect(m.argumentUsesPitfall()).toBe(true);
		expect(m.argumentReusesMotivation()).toBe(true);
		expect(m.argumentReuseChecked()).toBe(true);
	});

	test('a chosen entry naming nothing the block has still counts for nothing (SC-649)', () => {
		const m = parse('motivations:\n  - name: Peace\npitfalls:\n  - name: Power\ncurrentArgument:\n  motivationsUsed: [Ghost]\n  pitfallsUsed: [Ghost]\n');
		expect(m.argumentUsesMotivation()).toBe(false);
		expect(m.argumentUsesPitfall()).toBe(false);
	});

	test('a nameless entry matches the empty-string chosen entry, and not a named one', () => {
		const m = parse('motivations:\n  - name: Peace\n  - reason: r\ncurrentArgument:\n  motivationsUsed: [""]\n');
		expect(m.argumentUsesMotivation()).toBe(true);
		m.spendChosenMotivations();
		expect(m.motivations.map((x) => x.hasBeenAppealedTo)).toEqual([false, true]);
	});

	test('spendChosenMotivations spends every entry of every chosen name, whatever the spelling', () => {
		const m = parse(TWO_PEACE + '  - name: Legacy\n  - name: Power\n  - name: power\ncurrentArgument:\n  motivationsUsed: [PEACE, " power"]\n');
		m.spendChosenMotivations();
		expect(m.motivations.map((x) => [x.name, x.hasBeenAppealedTo])).toEqual([
			['Peace', true], ['Peace', true], ['Legacy', false], ['Power', true], ['power', true],
		]);
	});
});
