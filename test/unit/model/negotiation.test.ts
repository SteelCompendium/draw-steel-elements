import { ArgumentPowerRoll, ArgumentResult } from '@model/ArgumentPowerRolls';
import { NegotiationData, parseNegotiationData } from '@model/NegotiationData';
import frodoYaml from '../../fixtures/negotiation/frodo.yaml';

const tiers = (roll: ArgumentPowerRoll): number[][] =>
	[roll.t1, roll.t2, roll.t3, roll.crit].map((t) => [t.interest, t.patience]);

describe('T-7: ArgumentPowerRoll.build outcome matrix', () => {
	// build(usedMotivation, usedPitfall, caughtLying, reusedMotivation, sameArgument)
	test('normal argument', () => {
		expect(tiers(ArgumentPowerRoll.build(false, false, false, false, false))).toEqual([
			[-1, -1], [0, -1], [1, -1], [1, 0],
		]);
	});

	test('used motivation', () => {
		expect(tiers(ArgumentPowerRoll.build(true, false, false, false, false))).toEqual([
			[0, -1], [1, -1], [1, 0], [1, 0],
		]);
	});

	test('pitfall trumps motivation', () => {
		expect(tiers(ArgumentPowerRoll.build(true, true, false, false, false))).toEqual([
			[-1, -1], [-1, -1], [-1, -1], [-1, -1],
		]);
	});

	test('reused motivation flattens to 0 interest / -1 patience', () => {
		expect(tiers(ArgumentPowerRoll.build(true, false, false, true, false))).toEqual([
			[0, -1], [0, -1], [0, -1], [0, -1],
		]);
	});

	test('same argument without motivation is all-negative', () => {
		expect(tiers(ArgumentPowerRoll.build(false, false, false, false, true))).toEqual([
			[-1, -1], [-1, -1], [-1, -1], [-1, -1],
		]);
	});

	test('caught lying: -1 interest only on tiers with interest <= 0 (normal)', () => {
		expect(tiers(ArgumentPowerRoll.build(false, false, true, false, false))).toEqual([
			[-2, -1], [-1, -1], [1, -1], [1, 0],
		]);
	});

	test('caught lying: used motivation only t1 drops', () => {
		expect(tiers(ArgumentPowerRoll.build(true, false, true, false, false))).toEqual([
			[-1, -1], [1, -1], [1, 0], [1, 0],
		]);
	});

	test('caught lying: reused motivation drops all tiers', () => {
		expect(tiers(ArgumentPowerRoll.build(true, false, true, true, false))).toEqual([
			[-1, -1], [-1, -1], [-1, -1], [-1, -1],
		]);
	});
});

describe('T-7: ArgumentResult.toString', () => {
	test('formats interest and patience with signs', () => {
		expect(new ArgumentResult(1, -1).toString()).toBe('+1 Interest, -1 Patience');
		expect(new ArgumentResult(-1, 0).toString()).toBe('-1 Interest');
		expect(new ArgumentResult(0, -1).toString()).toBe('-1 Patience');
	});

	test('zero effect renders "No effect"; other text is appended', () => {
		expect(new ArgumentResult(0, 0).toString()).toBe('No effect');
		expect(new ArgumentResult(0, 0, 'mark the target').toString()).toBe('mark the target');
	});
});

describe('T-7: NegotiationData parsing and defaults', () => {
	test('fixture parses with nested Motivation/Pitfall/CurrentArgument instances', () => {
		const data = parseNegotiationData(frodoYaml);
		expect(data.name).toBe('Convincing Frodo to remember the taste of strawberries');
		expect(data.current_patience).toBe(3);
		expect(data.current_interest).toBe(3);
		expect(data.motivations.map((m) => m.name)).toEqual(['Higher Authority', 'Peace']);
		expect(data.motivations[0].hasBeenAppealedTo).toBe(false);
		expect(data.pitfalls.map((p) => p.name)).toEqual(['Power']);
		expect(data.currentArgument.motivationsUsed).toEqual([]);
		expect(data.i0).toBe("Thinks you're after the ring; becomes hostile");
	});

	test('defaults when fields are omitted: patience 5, interest 2, i5..i0 placeholders', () => {
		const data = parseNegotiationData('name: Quick');
		expect(data.current_patience).toBe(5);
		expect(data.current_interest).toBe(2);
		expect(data.i5).toBe('Interest 5 result');
	});
});

describe('SC-641: Interest left out opens at 2; Reset falls back to the defaults', () => {
	test('an authored Interest of 0 is honoured as written (initial or current)', () => {
		expect(parseNegotiationData('name: A\ninitial_interest: 0').current_interest).toBe(0);
		expect(parseNegotiationData('name: A\ninitial_interest: 3\ncurrent_interest: 0').current_interest).toBe(0);
	});

	test('resetData: initial_* when written, otherwise Interest 2 / Patience 5 (a current-only block loses its current standing)', () => {
		const withInitial = parseNegotiationData('name: A\ninitial_interest: 3\ninitial_patience: 2\ncurrent_interest: 1\ncurrent_patience: 1');
		withInitial.resetData();
		expect([withInitial.current_interest, withInitial.current_patience]).toEqual([3, 2]);
		const currentOnly = parseNegotiationData('name: A\ncurrent_interest: 3\ncurrent_patience: 2');
		currentOnly.resetData();
		expect([currentOnly.current_interest, currentOnly.current_patience]).toEqual([2, 5]);
		const authoredZero = parseNegotiationData('name: A\ninitial_interest: 0');
		authoredZero.current_interest = 4;
		authoredZero.resetData();
		expect(authoredZero.current_interest).toBe(0);
	});
});

describe('T-7: setMotivationUsed / argumentReusesMotivation truth table', () => {
	const fresh = (): NegotiationData => parseNegotiationData(frodoYaml);

	test('marking used sets hasBeenAppealedTo; flags reuse if current argument uses it', () => {
		const data = fresh();
		data.currentArgument.motivationsUsed = ['Peace'];
		data.setMotivationUsed('Peace', true);
		expect(data.motivations[1].hasBeenAppealedTo).toBe(true);
		expect(data.currentArgument.reusedMotivation).toBe(true);
	});

	test('marking used does NOT flag reuse when the argument does not use it', () => {
		const data = fresh();
		data.currentArgument.motivationsUsed = ['Higher Authority'];
		data.setMotivationUsed('Peace', true);
		expect(data.currentArgument.reusedMotivation).toBe(false);
	});

	test('unmarking clears reuse when no other used motivation remains in the argument', () => {
		const data = fresh();
		data.currentArgument.motivationsUsed = ['Peace'];
		data.setMotivationUsed('Peace', true);
		data.setMotivationUsed('Peace', false);
		expect(data.currentArgument.reusedMotivation).toBe(false);
	});

	test('unmarking keeps reuse when another motivation in the argument is still used', () => {
		const data = fresh();
		data.currentArgument.motivationsUsed = ['Peace', 'Higher Authority'];
		data.setMotivationUsed('Peace', true);
		data.setMotivationUsed('Higher Authority', true);
		data.setMotivationUsed('Peace', false);
		expect(data.currentArgument.reusedMotivation).toBe(true);
	});

	test('argumentReusesMotivation reflects hasBeenAppealedTo of used motivations', () => {
		const data = fresh();
		data.currentArgument.motivationsUsed = ['Peace'];
		expect(data.argumentReusesMotivation()).toBe(false);
		data.motivations[1].hasBeenAppealedTo = true; // Peace
		expect(data.argumentReusesMotivation()).toBe(true);
	});

	test('resetData restores patience/interest and clears all flags', () => {
		const data = fresh();
		data.current_patience = 0;
		data.current_interest = 5;
		data.motivations[0].hasBeenAppealedTo = true;
		data.currentArgument.motivationsUsed = ['Peace'];
		data.currentArgument.reusedMotivation = true;
		data.resetData();
		expect(data.current_patience).toBe(3); // initial_patience from fixture
		expect(data.current_interest).toBe(3);
		expect(data.motivations[0].hasBeenAppealedTo).toBe(false);
		expect(data.currentArgument.motivationsUsed).toEqual([]);
		expect(data.currentArgument.reusedMotivation).toBe(false);
	});
});

describe('what the card shows as chosen: argumentUsesMotivation / argumentUsesPitfall / argumentReuseChecked', () => {
	const fresh = (): NegotiationData => parseNegotiationData(frodoYaml);

	test('an entry naming a motivation the block has counts; one naming no motivation does not; the raw list still holds it', () => {
		const data = fresh();
		data.currentArgument.motivationsUsed = ['Ghost'];
		expect(data.argumentUsesMotivation()).toBe(false);
		expect(data.currentArgument.usesMotivation()).toBe(true);
		data.currentArgument.motivationsUsed = ['Ghost', 'Peace'];
		expect(data.argumentUsesMotivation()).toBe(true);
	});

	test('an entry naming a pitfall the block has counts; one naming no pitfall does not; the raw list still holds it', () => {
		const data = fresh();
		data.currentArgument.pitfallsUsed = ['Ghost'];
		expect(data.argumentUsesPitfall()).toBe(false);
		expect(data.currentArgument.usesPitfall()).toBe(true);
		data.currentArgument.pitfallsUsed = [data.pitfalls[0].name];
		expect(data.argumentUsesPitfall()).toBe(true);
	});

	test('the Reuse box is checked only while a spent motivation is appealed to AND the flag is set', () => {
		const data = fresh();
		data.currentArgument.motivationsUsed = ['Peace'];
		data.currentArgument.reusedMotivation = true;
		expect(data.argumentReuseChecked()).toBe(false); // Peace is not spent
		data.motivations[1].hasBeenAppealedTo = true;
		expect(data.argumentReuseChecked()).toBe(true);
		data.currentArgument.reusedMotivation = false;
		expect(data.argumentReuseChecked()).toBe(false);
		data.currentArgument.reusedMotivation = true;
		data.currentArgument.motivationsUsed = ['Ghost'];
		expect(data.argumentReuseChecked()).toBe(false); // the spent motivation is no longer appealed to
	});
});
