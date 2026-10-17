// SC-141 / SC-155 — corpus featureblocks parse.
//
// steel-etl's featureblock entries never carry `feature_type` (the schema's `richFeature`
// shape has no such property), while every authored fixture in this repo sets it. So the
// plugin's whole test surface sailed past `TypeError: dto.isTrait is not a function`, a
// throw that hit 100% of real content (measured 2026-08-10: 117/117 `type: featureblock` +
// 35/35 `dynamic-terrain` corpus files). The plugin shipped a shim until SC-155 fixed
// `Feature.fromDTO` upstream (steel-compendium-sdk 3.0.1); these tests now pin that the
// SDK handles the corpus shape on its own.
import { FeatureblockConfig } from '@model/FeatureblockConfig';

/** The corpus shape: no `feature_type` anywhere, one trait-ish and one ability-ish entry. */
const CORPUS_SHAPE = `name: Toppling Pillar Mechanism
features:
    - name: Deactivate
      body: The pillar's linked trigger must be deactivated.
    - name: Toppling Pillar
      distance: 4 x 1 line within 1
      target: Each creature and object in the area
      usage: Free triggered action
      keywords:
        - Area
`;

/** The authored shape this repo's own example.yaml uses — already typed. */
const AUTHORED_SHAPE = `name: Angulotl Traits
features:
    - name: Amphibious
      feature_type: trait
      effects:
        - effect: The angulotl can breathe underwater.
`;

describe('SC-155: corpus featureblocks parse without a plugin shim', () => {
	test('a features[] entry with no `feature_type` does not throw `dto.isTrait is not a function`', () => {
		const config = FeatureblockConfig.readYaml(CORPUS_SHAPE);
		expect(config.featureblock.features).toHaveLength(2);
		expect(config.featureblock.features.map((f) => f.name))
			.toEqual(['Deactivate', 'Toppling Pillar']);
	});

	test('the SDK derives the missing `feature_type` from shape', () => {
		// isTrait ⟺ no keywords AND no usage AND no distance AND no target.
		const config = FeatureblockConfig.readYaml(CORPUS_SHAPE);
		expect(config.featureblock.features.map((f) => f.feature_type))
			.toEqual(['trait', 'ability']);
	});

	test('an entry that already declares `feature_type` keeps it', () => {
		const config = FeatureblockConfig.readYaml(AUTHORED_SHAPE);
		expect(config.featureblock.features[0].name).toBe('Amphibious');
		expect(config.featureblock.features[0].feature_type).toBe('trait');
	});
});
