// Plan 14 Task 1 (D5 §2.5/§8.4) — the lenient, pure roll-expression parser.
import { parseRollExpression } from '../../../src/framework/roll/parse';

test('"Power Roll + Reason" → power-roll + reason keyword', () => {
	expect(parseRollExpression('Power Roll + Reason')).toEqual({
		mode: 'power-roll', characteristic: 'reason', raw: 'Power Roll + Reason',
	});
});

test('"2d10 + 5" → power-roll, flatBonus 5, explicit dice', () => {
	expect(parseRollExpression('2d10 + 5')).toEqual({
		mode: 'power-roll', flatBonus: 5, dice: { count: 2, sides: 10 }, raw: '2d10 + 5',
	});
});

test('"Might test" → test mode + might', () => {
	expect(parseRollExpression('Might test')).toEqual({
		mode: 'test', characteristic: 'might', raw: 'Might test',
	});
});

test('"1d6 + 3" → dice {1,6} + flatBonus 3', () => {
	expect(parseRollExpression('1d6 + 3')).toEqual({
		mode: 'power-roll', flatBonus: 3, dice: { count: 1, sides: 6 }, raw: '1d6 + 3',
	});
});

test('characteristic keyword wins over a trailing "+ N" (never both)', () => {
	// "Power Roll + Might" must NOT read "+ might" as a number, and a real ability
	// like "Power Roll + Might or Agility" still yields the FIRST keyword.
	expect(parseRollExpression('Power Roll + Might or Agility')).toEqual({
		mode: 'power-roll', characteristic: 'might', raw: 'Power Roll + Might or Agility',
	});
});

test('case-insensitive keywords', () => {
	expect(parseRollExpression('power roll + INTUITION').characteristic).toBe('intuition');
});

test('garbage → { mode: "power-roll", raw } and never throws', () => {
	expect(parseRollExpression('¯\\_(ツ)_/¯')).toEqual({ mode: 'power-roll', raw: '¯\\_(ツ)_/¯' });
	expect(parseRollExpression('')).toEqual({ mode: 'power-roll', raw: '' });
});
