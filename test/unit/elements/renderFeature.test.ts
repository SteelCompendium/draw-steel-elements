// SC-232 round 8a, W1 (r7 survey b1, b4, b5, b8) — direct unit coverage for
// renderFeature.ts's leftDeckOf: the cardHead left-deck provenance line, ports
// `abilityOrigin` (ability_cards.go:135-145) and `traitSource`/`traitOrigin`
// (trait_cards.go:563-591). Reads ONLY `feature.metadata` (the by-SCC sync's own
// field); every case below mirrors a real synced fence field shape
// (r7-survey/md-dse/), not an invented one.
import { leftDeckOf } from '../../../src/elements/feature/renderFeature';
import { FeatureConfig } from '@model/FeatureConfig';

describe('SC-232 W1: leftDeckOf — the cardHead left-deck provenance line', () => {
	test('no metadata -> undefined (metadata-driven only; every pre-SC-232 fixture renders no left-deck)', () => {
		const config = FeatureConfig.readYaml(`type: feature
feature_type: ability
name: Coverage Strike
`);
		expect(leftDeckOf(config)).toBeUndefined();
	});

	test('trait: metadata.ancestry -> title-cased ("Determination", human — Scott\'s own example)', () => {
		const config = FeatureConfig.readYaml(`type: feature
feature_type: trait
name: Determination
metadata:
  ancestry: human
  type: trait
`);
		expect(leftDeckOf(config)).toBe('Human');
	});

	test('trait: metadata.class takes priority over ancestry (steel-etl traitSource order: class, ancestry, kit)', () => {
		const config = FeatureConfig.readYaml(`type: feature
feature_type: feature
name: Some Feature
metadata:
  class: fury
  ancestry: human
  type: feature
`);
		expect(leftDeckOf(config)).toBe('Fury');
	});

	test('trait: metadata.kit, when class/ancestry are both absent', () => {
		const config = FeatureConfig.readYaml(`type: feature
feature_type: trait
name: Some Kit Trait
metadata:
  kit: panther
  type: trait
`);
		expect(leftDeckOf(config)).toBe('Panther');
	});

	test('trait: feature_source qualifier appends to the source ("Fury Circle")', () => {
		const config = FeatureConfig.readYaml(`type: feature
feature_type: feature
name: Some Circle Feature
metadata:
  class: fury
  feature_source: circle
  type: feature
`);
		expect(leftDeckOf(config)).toBe('Fury Circle');
	});

	test('trait: feature_source "summoner" is EXCLUDED (steel-etl traitSource\'s own exception) — bare class only', () => {
		const config = FeatureConfig.readYaml(`type: feature
feature_type: feature
name: Some Summoner Feature
metadata:
  class: fury
  feature_source: summoner
  type: feature
`);
		expect(leftDeckOf(config)).toBe('Fury');
	});

	test('trait: subclass appends with " · " ("Shadow · Black Ash")', () => {
		const config = FeatureConfig.readYaml(`type: feature
feature_type: feature
name: Some Subclass Feature
metadata:
  class: shadow
  subclass: black-ash
  type: feature
`);
		expect(leftDeckOf(config)).toBe('Shadow · Black Ash');
	});

	test('trait: subclass alone (no source) renders bare, no dangling separator', () => {
		const config = FeatureConfig.readYaml(`type: feature
feature_type: feature
name: Subclass Only
metadata:
  subclass: black-ash
  type: feature
`);
		expect(leftDeckOf(config)).toBe('Black Ash');
	});

	test('ability: metadata.class -> title-cased ("Mark", tactician L1)', () => {
		const config = FeatureConfig.readYaml(`type: feature
feature_type: ability
name: Mark
metadata:
  class: tactician
  type: ability
`);
		expect(leftDeckOf(config)).toBe('Tactician');
	});

	test('ability: metadata.class + subclass -> "Class · Subclass" (steel-etl abilityOrigin)', () => {
		const config = FeatureConfig.readYaml(`type: feature
feature_type: ability
name: Some Ability
metadata:
  class: shadow
  subclass: black-ash
  type: ability
`);
		expect(leftDeckOf(config)).toBe('Shadow · Black Ash');
	});

	test('ability: metadata.kit, when class is absent (the kit-signature by-SCC shape — "Devastating Rush" on the Panther kit, survey b8)', () => {
		const config = FeatureConfig.readYaml(`type: feature
feature_type: ability
name: Devastating Rush
metadata:
  kit: panther
  subtype: signature
  type: ability
`);
		expect(leftDeckOf(config)).toBe('Panther');
	});

	test('ability: class wins over kit when both are present (class is the primary source)', () => {
		const config = FeatureConfig.readYaml(`type: feature
feature_type: ability
name: Some Ability
metadata:
  class: fury
  kit: panther
  type: ability
`);
		expect(leftDeckOf(config)).toBe('Fury');
	});

	test('a multi-hyphen slug title-cases every word ("college-of-black-ash" -> "College Of Black Ash", matching steel-etl titleCase)', () => {
		const config = FeatureConfig.readYaml(`type: feature
feature_type: ability
name: Some Ability
metadata:
  subclass: college-of-black-ash
  type: ability
`);
		expect(leftDeckOf(config)).toBe('College Of Black Ash');
	});
});
