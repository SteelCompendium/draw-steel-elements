// F2 Task 1 (§2.1 B1) — SDK 3.x removed Statblock.roles: string[] /
// Statblock.ancestry: string[] in favor of role: string, organization: string,
// keywords: string[]. statblockHeaderParts() (src/elements/statblock/view.ts) is the
// pure, unit-testable extraction of the header-derivation the view's cardHead fill
// and role tint both consume — see StatblockElementView.onMount.
import * as fs from 'fs';
import * as path from 'path';
import { StatblockConfig } from '@model/StatblockConfig';
import { statblockHeaderParts } from '@/elements/statblock/view';

const fixture = fs.readFileSync(
	path.join(__dirname, '../../fixtures/statblock/goblin-stinker.yaml'),
	'utf8',
);

describe('SDK 3.x statblock fields (F2 §2.1 B1)', () => {
	test('golden fixture parses with role/organization/keywords', () => {
		const config = StatblockConfig.readYaml(fixture);
		expect(config.statblock.name).toBe('Goblin Stinker');
		expect(config.statblock.level).toBe(1);
		expect(config.statblock.role).toBe('Controller');
		expect(config.statblock.organization).toBe('Horde');
		expect(config.statblock.keywords).toEqual(['Goblin', 'Humanoid']);
		expect(config.statblock.ev).toBe('3');
		expect(config.statblock.features).toHaveLength(3);
	});

	test("header parts render the 'Horde Controller' style line", () => {
		const config = StatblockConfig.readYaml(fixture);
		const parts = statblockHeaderParts(config.statblock);
		expect(parts.name).toBe('Goblin Stinker');
		expect(parts.rightEyebrow).toBe('Level 1');
		expect(parts.rightPrimary).toBe('Horde Controller');
		expect(parts.leftEyebrow).toBe('Goblin, Humanoid');
		expect(parts.rightDeck).toBe('EV 3');
		expect(parts.role).toBe('Controller');
	});

	test('header parts degrade gracefully when fields are absent', () => {
		const parts = statblockHeaderParts(
			StatblockConfig.readYaml('name: Nameless Thing').statblock,
		);
		expect(parts.name).toBe('Nameless Thing');
		expect(parts.rightEyebrow).toBe('Level N/A');
		expect(parts.rightPrimary).toBe('No Role');
		expect(parts.leftEyebrow).toBe('');
		expect(parts.rightDeck).toBe('EV N/A');
		expect(parts.role).toBeUndefined();
	});
});
