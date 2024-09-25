export interface Condition {
	key: string;
	displayName: string;
	iconName: string;
}

export class ConditionManager {
	private conditions: Condition[] = [
		{key: 'bleeding', displayName: 'Bleeding', iconName: 'droplet'},
		{key: 'dazed', displayName: 'Dazed', iconName: 'waves'},
		{key: 'frightened', displayName: 'Frightened', iconName: 'navigation-off'},
		{key: 'grabbed', displayName: 'Grabbed', iconName: 'hand'},
		{key: 'prone', displayName: 'Prone', iconName: 'bed'},
		{key: 'restrained', displayName: 'Restrained', iconName: 'lock'},
		{key: 'slowed', displayName: 'Slowed', iconName: 'snail'},
		{key: 'weakened', displayName: 'Weakened', iconName: 'trending-down'},

		{key: 'marked', displayName: 'Marked', iconName: 'locate-fixed'},
	];

	public getConditions(): Condition[] {
		return this.conditions;
	}

	public getConditionByKey(key: string): Condition | undefined {
		return this.conditions.find(c => c.key === key);
	}
}

