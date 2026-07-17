// F2 Task 1 (§2.1 B1) — SDK 3.x removed Statblock.roles: string[] /
// Statblock.ancestry: string[] in favor of role: string, organization: string,
// keywords: string[]. statblockHeaderParts() (src/elements/statblock/view.ts) is the
// pure, unit-testable extraction of the header-derivation the view's cardHead fill
// and role tint both consume — see StatblockElementView.onMount.
import * as fs from 'fs';
import * as path from 'path';
import { StatblockConfig } from '@model/StatblockConfig';
import { statblockHeaderParts } from '@/elements/statblock/view';
import { roleOf } from '@/elements/roleTint';

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

	// Review fix (task-1-review.md Critical finding): every real Leader-organization
	// statblock (30/30) and Solo-organization statblock (22/22) in production carries
	// role: "" — the site's own precedent (steel-etl statblock_page.go's
	// buildStatblockIsland: roleKey := role; if roleKey == "" { roleKey = org }) falls
	// back to organization so these ~52 boss/solo creatures still tint. `role` here
	// feeds applyRoleTint directly, so it must carry the same fallback.
	describe('role tint falls back to organization when role is empty (real Leader/Solo shape)', () => {
		test('organization: Leader, role: "" resolves the tint source to "Leader"', () => {
			const parts = statblockHeaderParts(
				StatblockConfig.readYaml('name: Boss\norganization: Leader\nrole: ""').statblock,
			);
			expect(parts.role).toBe('Leader');
			expect(roleOf(parts.role)).toBe('leader');
		});

		test('organization: Solo, role: "" resolves the tint source to "Solo"', () => {
			const parts = statblockHeaderParts(
				StatblockConfig.readYaml('name: Big Bad\norganization: Solo\nrole: ""').statblock,
			);
			expect(parts.role).toBe('Solo');
			expect(roleOf(parts.role)).toBe('solo');
		});

		test('a non-empty role still wins over organization (no fallback needed)', () => {
			const parts = statblockHeaderParts(
				StatblockConfig.readYaml(
					'name: Goblin Stinker\norganization: Horde\nrole: Controller',
				).statblock,
			);
			expect(parts.role).toBe('Controller');
			expect(roleOf(parts.role)).toBe('controller');
		});
	});
});
