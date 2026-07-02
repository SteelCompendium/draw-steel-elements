import { StatblockConfig } from '@model/StatblockConfig';
import { FeatureConfig } from '@model/FeatureConfig';
import { FeatureblockConfig } from '@model/FeatureblockConfig';
import statblockYaml from '../../fixtures/statblock/human-bandit-chief.yaml';
import featureYaml from '../../fixtures/feature/magma-titan.yaml';
import featureblockYaml from '../../fixtures/featureblock/angulotl-malice.yaml';

// Golden inputs are the documented examples (docs/statblock.md, docs/Features.md,
// docs/featureblock.md) — real user inputs. Snapshots pin steel-compendium-sdk
// 2.1.5's parse output; the SDK 3.x upgrade (F2) must review these diffs.
// If a spot-check below fails because 2.1.5 exposes a different property name,
// inspect the written snapshot and correct the property access — the snapshot
// is the contract, the spot-check is a convenience.
describe('T-9: SDK boundary fixtures', () => {
	test('StatblockConfig.readYaml parses the documented statblock', () => {
		const config = StatblockConfig.readYaml(statblockYaml);
		expect(config.statblock.name).toBe('Human Bandit Chief');
		expect(config.statblock).toMatchSnapshot();
	});

	test('FeatureConfig.readYaml parses the documented feature', () => {
		const config = FeatureConfig.readYaml(featureYaml);
		expect(config.feature.name).toBe('Magma Titan');
		expect(config.indent).toBeUndefined();
		expect(config.feature).toMatchSnapshot();
	});

	test('FeatureblockConfig.readYaml parses the documented featureblock', () => {
		const config = FeatureblockConfig.readYaml(featureblockYaml);
		expect(config.featureblock.name).toBe('Angulotl Malice');
		expect(config.featureblock).toMatchSnapshot();
	});
});
