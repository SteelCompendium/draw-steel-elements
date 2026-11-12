import { ConditionManager, conditionKeysEqual } from '@utils/Conditions';

// SC-197: taunted is one of the nine real Draw Steel rules conditions, but was filed
// under pseudoConditions from the start. These assert against the actual rules-defined
// set BY NAME (not a snapshot/count) so a future misfile of any of these nine trips a
// real failure instead of silently changing a number.
const RULES_CONDITIONS = [
	'bleeding',
	'dazed',
	'frightened',
	'grabbed',
	'prone',
	'restrained',
	'slowed',
	'taunted',
	'weakened',
] as const;

describe('SC-197: ConditionManager.getConditions() carries all nine rules conditions', () => {
	test('getConditions() contains exactly the nine Draw Steel rules conditions, by key', () => {
		const mgr = new ConditionManager();
		const keys = mgr.getConditions().map((c) => c.key);
		expect(new Set(keys)).toEqual(new Set(RULES_CONDITIONS));
		expect(keys).toHaveLength(RULES_CONDITIONS.length);
	});

	test.each(RULES_CONDITIONS)('%s is a real condition, not a pseudo condition', (key) => {
		const mgr = new ConditionManager();
		expect(mgr.getConditionByKey(key)).toBeDefined();
		expect(mgr.getPseudoConditionByKey(key)).toBeUndefined();
	});

	test('taunted specifically: real, not pseudo (the SC-197 regression)', () => {
		const mgr = new ConditionManager();
		expect(mgr.getConditionByKey('taunted')).toEqual({
			key: 'taunted',
			displayName: 'Taunted',
			iconName: 'mouse-pointer-click',
		});
		expect(mgr.getPseudoConditionByKey('taunted')).toBeUndefined();
	});

	test('getAnyConditionByKey still resolves taunted (consumer-facing lookup unaffected)', () => {
		const mgr = new ConditionManager();
		expect(mgr.getAnyConditionByKey('taunted')?.displayName).toBe('Taunted');
	});

	test('the two lists are disjoint — no key appears in both', () => {
		const mgr = new ConditionManager();
		const realKeys = new Set(mgr.getConditions().map((c) => c.key));
		const pseudoKeys = mgr.getPseudoConditions().map((c) => c.key);
		for (const key of pseudoKeys) {
			expect(realKeys.has(key)).toBe(false);
		}
	});
});

// SC-583: condition keys match regardless of case, through one helper.
describe('SC-583: conditionKeysEqual', () => {
	test('equal ignoring case, unequal otherwise', () => {
		expect(conditionKeysEqual('dazed', 'dazed')).toBe(true);
		expect(conditionKeysEqual('Dazed', 'dazed')).toBe(true);
		expect(conditionKeysEqual('DAZED', 'dAzEd')).toBe(true);
		expect(conditionKeysEqual('dazed', 'bleeding')).toBe(false);
		expect(conditionKeysEqual('high-ground', 'High Ground')).toBe(false); // case only: no slugging, no trimming
	});
});

describe('SC-583: ConditionManager lookups ignore key case', () => {
	test('a standard condition is found under any casing and returns its registry entry (canonical key kept)', () => {
		const mgr = new ConditionManager();
		expect(mgr.getConditionByKey('Dazed')).toBe(mgr.getConditionByKey('dazed'));
		expect(mgr.getConditionByKey('DAZED')?.key).toBe('dazed');
		expect(mgr.getAnyConditionByKey('Taunted')?.displayName).toBe('Taunted');
	});

	test('a pseudo condition is found under any casing', () => {
		const mgr = new ConditionManager();
		expect(mgr.getPseudoConditionByKey('High-Ground')?.key).toBe('high-ground');
		expect(mgr.getAnyConditionByKey('Winded')?.iconName).toBe('wind');
	});

	test('a casing of a standard key does not leak across the two lists, and an unknown key is still unknown', () => {
		const mgr = new ConditionManager();
		expect(mgr.getPseudoConditionByKey('Dazed')).toBeUndefined();
		expect(mgr.getConditionByKey('Marked')).toBeUndefined();
		expect(mgr.getAnyConditionByKey('Hexed')).toBeUndefined();
	});
});
