// SC-690 — "Remove a hero" (the montage's ⋯ menu): `removeMontageHero` takes one hero off the board and, with them, every action logged
// for that hero and the tally those actions added. It deletes from the user's note, so the cases below are mostly about what it must NOT
// touch: another hero's row, an item of `participants:` the board skips, a tally typed with the wrong type that nothing moved, every key
// the montage does not know and the order of all of them.
import { parseYaml } from '../../mocks/obsidian';
import {
	parse, serialize, montageRoster, montageTallies, montageOutcome, montageHeroRemoval, removeMontageHero, addMontageHero,
} from '../../../src/elements/montage/model';
import type { MontageModel } from '../../../src/elements/montage/model';

const parseLikePipeline = (source: string): MontageModel => parse(parseYaml(source), source);
const written = (model: MontageModel): Record<string, any> => parseYaml(serialize(model)) as Record<string, any>;
const names = (m: MontageModel): string[] => montageRoster(m).map((h) => h.name);

/** Kira: success (Nature) and failure; Bram: a success and an assist; Osric: nothing logged and no skills list. The tally is 2 / 1. */
const BOARD = [
	'title: Heist', 'rounds: 3', 'success_limit: 5', 'failure_limit: 3', 'successes: 2', 'failures: 1',
	'participants:',
	'  - name: Kira', '    skills_used: [Nature, Insight]',
	'  - name: Bram', '    skills_used: [Endurance]',
	'  - name: Osric',
	'entries:',
	'  - hero: Kira', '    round: 1', '    result: success', '    skill: Nature',
	'  - hero: Bram', '    round: 1', '    result: success', '    skill: Endurance',
	'  - hero: Kira', '    round: 2', '    result: failure', '    skill: Insight',
	'  - hero: Bram', '    round: 2', '    result: assist',
	'current_round: 3',
].join('\n');

describe('removeMontageHero', () => {
	test('a hero with nothing logged: the roster item goes, the tally and every other hero stay', () => {
		const m = parseLikePipeline(BOARD);
		expect(removeMontageHero(m, 'Osric')).toBe(true);
		expect(names(m)).toEqual(['Kira', 'Bram']);
		expect([m.successes, m.failures]).toEqual([2, 1]);
		expect(m.entries).toHaveLength(4);
	});

	test('a hero with a success and a failure: their actions go and the tally drops by exactly those two; an assist adds nothing, so it takes nothing off', () => {
		const kira = parseLikePipeline(BOARD);
		removeMontageHero(kira, 'Kira'); // a success and a failure
		expect([kira.successes, kira.failures]).toEqual([1, 0]);
		expect(written(kira).entries.map((e: { hero: string }) => e.hero)).toEqual(['Bram', 'Bram']);
		const bram = parseLikePipeline(BOARD);
		removeMontageHero(bram, 'Bram'); // a success and an assist
		expect([bram.successes, bram.failures]).toEqual([1, 1]);
		expect(written(bram).entries.map((e: { hero: string }) => e.hero)).toEqual(['Kira', 'Kira']);
	});

	test('the hero\'s skills go with the hero, and no other hero\'s skills move', () => {
		const m = parseLikePipeline(BOARD);
		removeMontageHero(m, 'Kira');
		expect(written(m).participants).toEqual([{ name: 'Bram', skills_used: ['Endurance'] }, { name: 'Osric' }]);
	});

	test('a name that is not on the board changes nothing and says so', () => {
		const m = parseLikePipeline(BOARD);
		const before = serialize(m);
		expect(removeMontageHero(m, 'Nobody')).toBe(false);
		expect(removeMontageHero(m, 'kira')).toBe(false); // the board matches a name exactly
		expect(serialize(m)).toBe(before);
	});

	test('a montage with no heroes at all has nothing to remove', () => {
		const m = parseLikePipeline('rounds: 2');
		expect(removeMontageHero(m, 'Kira')).toBe(false);
		expect(m.participants).toBeUndefined();
	});

	test('the last hero: the key `participants` goes (like an empty list at parse), and their actions with it', () => {
		const m = parseLikePipeline(['rounds: 2', 'successes: 1', 'failures: 0', 'participants:', '  - name: Kira', 'entries:', '  - hero: Kira', '    round: 1', '    result: success', 'current_round: 1'].join('\n'));
		expect(removeMontageHero(m, 'Kira')).toBe(true);
		expect(montageRoster(m)).toEqual([]);
		const out = written(m);
		expect(Object.keys(out)).toEqual(['rounds', 'successes', 'failures', 'current_round']);
		expect([out.successes, out.failures]).toEqual([0, 0]);
	});

	test('two heroes with one name: removing one keeps the other, their row and their actions, and moves no tally', () => {
		const m = parseLikePipeline(['rounds: 2', 'successes: 1', 'participants:', '  - name: Kira', '  - name: Kira', 'entries:', '  - hero: Kira', '    round: 1', '    result: success', 'current_round: 1'].join('\n'));
		expect(montageHeroRemoval(m, 'Kira')).toEqual({ actions: 0, shared: 1 });
		expect(removeMontageHero(m, 'Kira')).toBe(true);
		expect(names(m)).toEqual(['Kira']);
		expect(m.successes).toBe(1);
		expect(m.entries).toHaveLength(1);
		// the second removal is the last Kira: now the action goes
		expect(montageHeroRemoval(m, 'Kira')).toEqual({ actions: 1, shared: 0 });
		removeMontageHero(m, 'Kira');
		expect(m.successes).toBe(0);
		expect(m.entries).toBeUndefined();
	});

	test('an action the board hides (a second one for the same hero and round) goes too, so a hero added under that name starts clean', () => {
		const m = parseLikePipeline(['rounds: 2', 'successes: 2', 'participants:', '  - name: Kira', 'entries:', '  - hero: Kira', '    round: 1', '    result: success', '  - hero: Kira', '    round: 1', '    result: success', 'current_round: 1'].join('\n'));
		expect(montageHeroRemoval(m, 'Kira').actions).toBe(2);
		removeMontageHero(m, 'Kira');
		expect(m.successes).toBe(0);
		addMontageHero(m, 'Kira');
		expect(m.entries).toBeUndefined();
		expect(written(m)).not.toHaveProperty('entries');
	});

	test('an item of `participants:` the board skips stays exactly as typed, in its place', () => {
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		const m = parseLikePipeline('rounds: 2\nparticipants:\n  - 7\n  - name: Kira\n  - Ash\n  - nmae: Bram\n  - name: Osric\n    player: Sam');
		removeMontageHero(m, 'Kira');
		expect(written(m).participants).toEqual([7, 'Ash', { nmae: 'Bram' }, { name: 'Osric', player: 'Sam' }]);
	});

	test('removing the only hero leaves a skipped item in place, so the list is still written', () => {
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		const m = parseLikePipeline('rounds: 2\nparticipants:\n  - Ash\n  - name: Kira');
		removeMontageHero(m, 'Kira');
		expect(montageRoster(m)).toEqual([]);
		expect(written(m).participants).toEqual(['Ash']);
	});

	test('`participants:` that is not a list has no hero to remove and is written back as typed', () => {
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		const m = parseLikePipeline('rounds: 2\nparticipants: Kira');
		expect(removeMontageHero(m, 'Kira')).toBe(false);
		expect(written(m).participants).toBe('Kira');
	});

	test('a tally typed as text is not re-typed when the hero added nothing to it, and is when they did', () => {
		const text = ['rounds: 3', 'successes: "1"', 'failures: "0"', 'participants:', '  - name: Kira', '  - name: Bram', 'entries:', '  - hero: Kira', '    round: 1', '    result: success', '  - hero: Bram', '    round: 1', '    result: assist', 'current_round: 2'].join('\n');
		const quiet = parseLikePipeline(text);
		removeMontageHero(quiet, 'Bram'); // an assist moves no tally
		expect(serialize(quiet)).toContain('successes: "1"');
		expect(serialize(quiet)).toContain('failures: "0"');
		const moved = parseLikePipeline(text);
		removeMontageHero(moved, 'Kira');
		expect(serialize(moved)).toContain('successes: 0');
		expect(serialize(moved)).toContain('failures: "0"');
	});

	test('a montage that was complete because a limit was reached is live again once that hero\'s success goes', () => {
		const m = parseLikePipeline(['rounds: 3', 'success_limit: 1', 'failure_limit: 3', 'successes: 1', 'failures: 0', 'participants:', '  - name: Kira', '  - name: Bram', 'entries:', '  - hero: Kira', '    round: 1', '    result: success', 'current_round: 1'].join('\n'));
		expect(montageTallies(m).complete).toBe(true);
		expect(montageOutcome(m)).toBe('total');
		removeMontageHero(m, 'Kira');
		expect(montageTallies(m).complete).toBe(false);
		expect(montageOutcome(m)).toBe('pending');
		expect([m.success_limit, m.failure_limit, m.current_round, m.rounds]).toEqual([1, 3, 1, 3]); // nothing but the tally moved
	});

	test('the tally is clamped at zero when the stored total is already behind the actions', () => {
		const m = parseLikePipeline('rounds: 2\nsuccesses: 0\nparticipants:\n  - name: Kira\nentries:\n  - hero: Kira\n    round: 1\n    result: success');
		removeMontageHero(m, 'Kira');
		expect(m.successes).toBe(0);
	});

	test('every other key, and the order of all of them, comes back as typed; only the hero and their actions are gone', () => {
		const text = [
			'title: Heist', 'description: Over the wall.', 'rounds: 3', 'success_limit: 5', 'failure_limit: 3', 'successes: 1', 'failures: 0',
			'participants:', '  - name: Kira', '    player: Sam', '    skills_used: [Nature]', '  - name: Bram', '    player: Ana',
			'entries:', '  - hero: Kira', '    round: 1', '    result: success', '    skill: Nature', '    dc: 12', '  - hero: Bram', '    round: 1', '    result: assist', '    note: Held the rope.',
			'current_round: 2', 'table_notes: keep me',
		].join('\n');
		const m = parseLikePipeline(text);
		removeMontageHero(m, 'Kira');
		const expected = parseLikePipeline(text.replace(/  - name: Kira\n {4}player: Sam\n {4}skills_used: \[Nature\]\n/, '').replace(/ {2}- hero: Kira\n(?: {4}.*\n)+/, '').replace('successes: 1', 'successes: 0'));
		expect(serialize(m)).toBe(serialize(expected));
		expect(Object.keys(written(m))).toEqual(['title', 'description', 'rounds', 'success_limit', 'failure_limit', 'successes', 'failures', 'participants', 'entries', 'current_round', 'table_notes']);
		expect(written(m).entries).toEqual([{ hero: 'Bram', round: 1, result: 'assist', note: 'Held the rope.' }]);
	});

	test('montageHeroRemoval counts the actions that would go: all of them, whatever their result, none for an unknown name', () => {
		const m = parseLikePipeline(BOARD);
		expect(montageHeroRemoval(m, 'Kira')).toEqual({ actions: 2, shared: 0 });
		expect(montageHeroRemoval(m, 'Bram')).toEqual({ actions: 2, shared: 0 });
		expect(montageHeroRemoval(m, 'Osric')).toEqual({ actions: 0, shared: 0 });
		expect(montageHeroRemoval(m, 'Nobody')).toEqual({ actions: 0, shared: 0 });
	});

	test('actions are matched the way the board matches them to a row: exactly, so `kira`, `"Kira "` and `" Kira"` stay and move no tally', () => {
		const m = parseLikePipeline([
			'rounds: 3', 'successes: 3', 'failures: 1', 'participants:', '  - name: Kira', '  - name: Bram', 'entries:',
			'  - hero: Kira', '    round: 1', '    result: success',
			'  - hero: kira', '    round: 2', '    result: success',
			'  - hero: "Kira "', '    round: 3', '    result: failure',
			'  - hero: " Kira"', '    round: 1', '    result: success',
			'  - hero: Bram', '    round: 1', '    result: assist',
			'current_round: 2',
		].join('\n'));
		expect(montageHeroRemoval(m, 'Kira')).toEqual({ actions: 1, shared: 0 });
		removeMontageHero(m, 'Kira');
		expect(m.entries!.map((e) => e.hero)).toEqual(['kira', 'Kira ', ' Kira', 'Bram']);
		expect([m.successes, m.failures]).toEqual([2, 1]); // only Kira's own success came off
	});

	describe('two heroes with one name: the chip pressed decides which one goes (the roster index)', () => {
		const twins = ['rounds: 2', 'participants:', '  - name: Kira', '    skills_used: [Nature]', '  - name: Kira', '    skills_used: [Climb]', '  - name: Bram'].join('\n');

		test('the second Kira (index 1) goes, and the first keeps her skills', () => {
			const m = parseLikePipeline(twins);
			expect(removeMontageHero(m, 'Kira', 1)).toBe(true);
			expect(written(m).participants).toEqual([{ name: 'Kira', skills_used: ['Nature'] }, { name: 'Bram' }]);
		});

		test('the first Kira (index 0) goes, and the second keeps hers', () => {
			const m = parseLikePipeline(twins);
			removeMontageHero(m, 'Kira', 0);
			expect(written(m).participants).toEqual([{ name: 'Kira', skills_used: ['Climb'] }, { name: 'Bram' }]);
		});

		test('the index counts heroes only, not an item the board skips', () => {
			jest.spyOn(console, 'warn').mockImplementation(() => undefined);
			const m = parseLikePipeline('rounds: 2\nparticipants:\n  - 7\n  - name: Kira\n    skills_used: [Nature]\n  - Ash\n  - name: Kira\n    skills_used: [Climb]');
			removeMontageHero(m, 'Kira', 1);
			expect(written(m).participants).toEqual([7, { name: 'Kira', skills_used: ['Nature'] }, 'Ash']);
		});

		test('an index that no longer holds that name (the roster changed under the window) removes nothing', () => {
			const m = parseLikePipeline(twins);
			const before = serialize(m);
			expect(removeMontageHero(m, 'Kira', 2)).toBe(false); // that slot is Bram now
			expect(removeMontageHero(m, 'Bram', 1)).toBe(false); // and Bram is not there
			expect(removeMontageHero(m, 'Kira', 7)).toBe(false);
			expect(serialize(m)).toBe(before);
		});
	});
});
