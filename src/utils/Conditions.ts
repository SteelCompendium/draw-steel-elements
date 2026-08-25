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
		// SC-197: taunted is one of the nine real Draw Steel rules conditions (Core Rules
		// p.28-ish "Conditions" list) — it belongs here, alphabetically before weakened,
		// not under pseudoConditions below. It was misfiled from the start; see
		// pseudoConditions' header comment for what actually distinguishes the two lists.
		{ key: 'taunted', displayName: 'Taunted', iconName: 'mouse-pointer-click' },
		{ key: 'weakened', displayName: 'Weakened', iconName: 'trending-down' },
	];

	// "Pseudo" conditions are everything the plugin renders through the same
	// condition-chip/icon UI that is NOT one of the game's rules-defined conditions:
	// combat states (marked, defending, flanking, high-ground, covered, concealed,
	// hidden, sneaking, invisible), stamina-derived states (dying, dead, unconscious,
	// winded, falling), and UI bookkeeping (used-triggered-action). None of these are
	// listed in the Core Rules' "Conditions" section, and none of them end via a saving
	// throw the way a real condition does — they're tracked here purely because the
	// same chip/icon affordance is the natural place to surface them on an actor.
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
