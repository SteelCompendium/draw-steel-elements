export interface Condition {
	key: string;
	displayName: string;
	iconName: string;
}

export class ConditionManager {
	private conditions: Condition[] = [
		{key: 'bleeding', displayName: 'Bleeding', iconName: 'droplet'},
		{key: 'dazed', displayName: 'Dazed', iconName: 'waves'},
		{key: 'frightened', displayName: 'Frightened', iconName: 'ghost'},
		{key: 'grabbed', displayName: 'Grabbed', iconName: 'hand'},
		{key: 'prone', displayName: 'Prone', iconName: 'bed'},
		{key: 'restrained', displayName: 'Restrained', iconName: 'navigation-off'},
		{key: 'slowed', displayName: 'Slowed', iconName: 'snail'},
		{key: 'weakened', displayName: 'Weakened', iconName: 'trending-down'},
	];

	private pseudoConditions: Condition[] = [
		{key: 'marked', displayName: 'Marked', iconName: 'locate-fixed'},
		{key: 'used-triggered-action', displayName: 'Triggered Action Used', iconName: 'repeat'},
	];

	public getAnyConditionByKey(key: string): Condition | undefined {
		return this.getConditionByKey(key) || this.getPseudoConditionByKey(key);
	}

	public getConditions(): Condition[] {
		return this.conditions;
	}

	public getConditionByKey(key: string): Condition | undefined {
		return this.conditions.find(c => c.key === key);
	}

	public getPseudoConditions(): Condition[] {
		return this.pseudoConditions;
	}

	public getPseudoConditionByKey(key: string): Condition | undefined {
		return this.pseudoConditions.find(c => c.key === key);
	}
}

