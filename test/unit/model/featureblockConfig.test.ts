// SC-141 fix round (M2) — FeatureblockConfig's `feature_type` normalization.
//
// `Featureblock.fromDTO` maps `dto.features` through `Feature.fromDTO`, but the DTO leaves
// those entries as the plain objects YAML produced. `Feature.fromDTO` only tolerates that
// when the entry declares its own `feature_type`; otherwise it calls `dto.isTrait()` — a
// FeatureDTO METHOD a plain object does not have — and throws.
//
// Every authored fixture in this repo sets `feature_type`; steel-etl emits none. So the
// plugin's whole test surface sailed past a throw that hits 100% of real content (measured
// 2026-08-10: 117/117 `type: featureblock` + 35/35 `dynamic-terrain` corpus files).
import { FeatureblockConfig, applyFeatureTypeDefaults } from '@model/FeatureblockConfig';

/** The corpus shape: no `feature_type` anywhere, one ability-ish and one trait-ish entry. */
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

describe('SC-141 (M2): corpus featureblocks parse', () => {
	test('a features[] entry with no `feature_type` no longer throws `dto.isTrait is not a function`', () => {
		const config = FeatureblockConfig.readYaml(CORPUS_SHAPE);
		expect(config.featureblock.features).toHaveLength(2);
		expect(config.featureblock.features.map((f) => f.name))
			.toEqual(['Deactivate', 'Toppling Pillar']);
	});

	test('the derived type is the SDK\'s OWN decision (Feature.isTrait), not a reimplementation', () => {
		// isTrait ⟺ no keywords AND no usage AND no distance AND no target.
		const out = applyFeatureTypeDefaults({
			features: [
				{ name: 'Deactivate', body: 'x' },
				{ name: 'Toppling Pillar', usage: 'Free triggered action', target: 'Each creature' },
			],
		}) as { features: { feature_type: string }[] };
		expect(out.features.map((f) => f.feature_type)).toEqual(['trait', 'ability']);
	});

	test('an entry that already declares `feature_type` is returned UNTOUCHED (same object)', () => {
		// The identity gate matters: when nothing needs defaulting, readYaml hands the SDK the
		// ORIGINAL text, so no parseYaml/stringifyYaml round-trip can perturb quoting or block
		// scalars on the path every frozen shot renders.
		const input = { features: [{ name: 'Amphibious', feature_type: 'trait' }] };
		expect(applyFeatureTypeDefaults(input)).toBe(input);
		expect(FeatureblockConfig.readYaml(AUTHORED_SHAPE).featureblock.features[0].name)
			.toBe('Amphibious');
	});

	test('non-featureblock shapes pass through unchanged', () => {
		const noFeatures = { name: 'x' };
		expect(applyFeatureTypeDefaults(noFeatures)).toBe(noFeatures);
		expect(applyFeatureTypeDefaults(null)).toBeNull();
		expect(applyFeatureTypeDefaults('nope')).toBe('nope');
	});
});
