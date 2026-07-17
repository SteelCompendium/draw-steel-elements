// src/elements/display/index.ts — D6 Task 6 (spec §2): registers ds-kit/ds-condition/
// ds-treasure, the first three displayFamily() instances.
import { displayFamily } from './displayFamily';
import { kitLayout, conditionLayout, treasureLayout } from './layouts';
import type { Kit, Condition, Treasure } from 'steel-compendium-sdk';
import kitExample from './kit/example.yaml';
import conditionExample from './condition/example.yaml';
import treasureExample from './treasure/example.yaml';

export const kitElement = displayFamily<Kit>({
	id: 'kit',
	aliases: ['ds-kit'],
	name: 'Kit',
	type: 'kit',
	layout: kitLayout,
	example: kitExample,
});

export const conditionElement = displayFamily<Condition>({
	id: 'condition',
	aliases: ['ds-condition'],
	name: 'Condition',
	type: 'condition',
	layout: conditionLayout,
	example: conditionExample,
});

export const treasureElement = displayFamily<Treasure>({
	id: 'treasure',
	aliases: ['ds-treasure'],
	name: 'Treasure',
	type: 'treasure',
	layout: treasureLayout,
	example: treasureExample,
});

export const displayElements = [kitElement, conditionElement, treasureElement];
