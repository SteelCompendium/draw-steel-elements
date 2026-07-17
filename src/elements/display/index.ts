// src/elements/display/index.ts — D6 Task 6 (spec §2): registers ds-kit/ds-condition/
// ds-treasure, the first three displayFamily() instances. Task 7 adds the remaining seven
// (ds-ancestry/ds-culture/ds-career/ds-class/ds-title/ds-perk/ds-complication) — same
// factory, no new machinery.
import { displayFamily, genericCard } from './displayFamily';
import type { ElementDefinition } from '@/framework/registry';
import {
	kitLayout,
	conditionLayout,
	treasureLayout,
	ancestryLayout,
	cultureLayout,
	careerLayout,
	classLayout,
	titleLayout,
	perkLayout,
	complicationLayout,
} from './layouts';
import type { Kit, Condition, Treasure, Ancestry, Culture, Career, Class, Title, Perk, Complication } from 'steel-compendium-sdk';
import kitExample from './kit/example.yaml';
import conditionExample from './condition/example.yaml';
import treasureExample from './treasure/example.yaml';
import ancestryExample from './ancestry/example.yaml';
import cultureExample from './culture/example.yaml';
import careerExample from './career/example.yaml';
import classExample from './class/example.yaml';
import titleExample from './title/example.yaml';
import perkExample from './perk/example.yaml';
import complicationExample from './complication/example.yaml';
import ruleExample from './rule/example.yaml';

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

export const ancestryElement = displayFamily<Ancestry>({
	id: 'ancestry',
	aliases: ['ds-ancestry'],
	name: 'Ancestry',
	type: 'ancestry',
	layout: ancestryLayout,
	example: ancestryExample,
});

export const cultureElement = displayFamily<Culture>({
	id: 'culture',
	aliases: ['ds-culture'],
	name: 'Culture',
	type: 'culture',
	layout: cultureLayout,
	example: cultureExample,
});

export const careerElement = displayFamily<Career>({
	id: 'career',
	aliases: ['ds-career'],
	name: 'Career',
	type: 'career',
	layout: careerLayout,
	example: careerExample,
});

export const classElement = displayFamily<Class>({
	id: 'class',
	aliases: ['ds-class'],
	name: 'Class',
	type: 'class',
	layout: classLayout,
	example: classExample,
});

export const titleElement = displayFamily<Title>({
	id: 'title',
	aliases: ['ds-title'],
	name: 'Title',
	type: 'title',
	layout: titleLayout,
	example: titleExample,
});

export const perkElement = displayFamily<Perk>({
	id: 'perk',
	aliases: ['ds-perk'],
	name: 'Perk',
	type: 'perk',
	layout: perkLayout,
	example: perkExample,
});

export const complicationElement = displayFamily<Complication>({
	id: 'complication',
	aliases: ['ds-complication'],
	name: 'Complication',
	type: 'complication',
	layout: complicationLayout,
	example: complicationExample,
});

// D6 Task 8 (spec §3): the model-less sibling — genericCard(), not displayFamily(). No SDK
// model exists for `rule.*`; the by-SCC path is covered by TYPE_ADAPTERS' matching
// GenericNote adapter (typeAdapters.ts) instead of a `type` lookup here.
export const ruleElement = genericCard({
	id: 'rule',
	aliases: ['ds-rule'],
	name: 'Rule',
	sccType: /^rule($|\.)/,
	example: ruleExample,
});

// D6 Task 8 review note: explicitly widened to `ElementDefinition<any>[]` — an implicit
// array-literal type inferred a union of all eleven `ElementDefinition<RefOrInline<X>>`
// element types, which `main.ts`'s `for (const el of displayElements) registry.register(el)`
// then failed to type-check (`register<M>`'s generic inference can't collapse an invariant
// union like `ElementDefinition<Kit> | ElementDefinition<GenericNote> | …` back down to a
// single `M`). This array's whole purpose is "a bag of heterogeneous definitions, registered
// generically" — `any` here is the correct, deliberate escape hatch for that, not a lint dodge.
export const displayElements: ElementDefinition<any>[] = [
	kitElement,
	conditionElement,
	treasureElement,
	ancestryElement,
	cultureElement,
	careerElement,
	classElement,
	titleElement,
	perkElement,
	complicationElement,
	ruleElement,
];
