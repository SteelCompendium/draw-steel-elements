export interface ConditionConfig {
	key: string;
	displayName: string;
	iconName: string;
}

export class ConditionManager {
	private conditions: ConditionConfig[] = [
		{ key: 'bleeding', displayName: 'Bleeding', iconName: 'droplet' },
		{ key: 'dazed', displayName: 'Dazed', iconName: 'waves' },
		{ key: 'frightened', displayName: 'Frightened', iconName: 'ghost' },
		{ key: 'grabbed', displayName: 'Grabbed', iconName: 'hand' },
		{ key: 'prone', displayName: 'Prone', iconName: 'bed' },
		{ key: 'restrained', displayName: 'Restrained', iconName: 'navigation-off' },
		{ key: 'slowed', displayName: 'Slowed', iconName: 'snail' },
		{ key: 'weakened', displayName: 'Weakened', iconName: 'trending-down' },
	];

	private pseudoConditions: ConditionConfig[] = [
		{ key: 'marked', displayName: 'Marked', iconName: 'locate-fixed' },
		{ key: 'used-triggered-action', displayName: 'Triggered Action Used', iconName: 'repeat' },
		{ key: 'covered', displayName: 'Covered', iconName: 'trees' },
		{ key: 'concealed', displayName: 'Concealed', iconName: 'cloud-fog' },
		{ key: 'dead', displayName: 'Dead', iconName: 'skull' },
		{ key: 'defending', displayName: 'Defending', iconName: 'shield' },
		{ key: 'dying', displayName: 'Dying', iconName: 'heart-crack' },
		{ key: 'falling', displayName: 'Falling', iconName: 'arrow-big-down-dash' },
		{ key: 'flanking', displayName: 'Flanking', iconName: 'minimize-2' },
		{ key: 'hidden', displayName: 'Hidden', iconName: 'locate-off' },
		{ key: 'high-ground', displayName: 'High Ground', iconName: 'layers' },
		{ key: 'invisible', displayName: 'Invisible', iconName: 'eye-off' },
		{ key: 'sneaking', displayName: 'Sneaking', iconName: 'more-horizontal' },
		{ key: 'unconscious', displayName: 'Unconscious', iconName: 'zap-off' },
		{ key: 'winded', displayName: 'Winded', iconName: 'wind' },
		{ key: 'taunted', displayName: 'Taunted', iconName: 'mouse-pointer-click' },
	];

	public getAnyConditionByKey(key: string): ConditionConfig | undefined {
		return this.getConditionByKey(key) || this.getPseudoConditionByKey(key);
	}

	public getConditions(): ConditionConfig[] {
		return this.conditions;
	}

	public getConditionByKey(key: string): ConditionConfig | undefined {
		return this.conditions.find(c => c.key === key);
	}

	public getPseudoConditions(): ConditionConfig[] {
		return this.pseudoConditions;
	}

	public getPseudoConditionByKey(key: string): ConditionConfig | undefined {
		return this.pseudoConditions.find(c => c.key === key);
	}
}
