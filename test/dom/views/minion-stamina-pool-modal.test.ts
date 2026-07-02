import { parseEncounterData, EncounterData, EnemyGroup, Creature } from '@drawSteelAdmonition/EncounterData';
import { MinionStaminaPoolModal } from '@views/MinionStaminaPoolModal';
import { CodeBlocks } from '@utils/CodeBlocks';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, makeFakeContext, flushAsync, FakeContext } from '../../mocks/obsidian';
import squadYaml from '../../fixtures/initiative/squad.yaml';

interface Setup {
	app: App;
	ctx: FakeContext;
	data: EncounterData;
	group: EnemyGroup;
	minion: Creature;
	modal: MinionStaminaPoolModal;
	content: HTMLElement;
	updateCallback: jest.Mock;
}

// `persist: true` mirrors production: the initiative tracker's update callback
// writes the block back via CodeBlocks (needed for the CB-2/DC-6 scenarios).
async function setup(options: { condition?: boolean; persist?: boolean } = {}): Promise<Setup> {
	const app = new App();
	const note = '# Encounter\n\n```ds-initiative\n' + squadYaml.trimEnd() + '\n```\n';
	app.vault.setFile('Encounter.md', note);
	const ctx = makeFakeContext(app, 'Encounter.md');
	const data = await parseEncounterData(squadYaml, app as any, DEFAULT_SETTINGS);
	const group = data.enemy_groups[0];
	const minion = group.creatures[0];
	if (options.condition) {
		minion.instances![0].conditions = [{ key: 'grabbed', color: undefined, effect: undefined }];
	}
	const updateCallback = options.persist
		? (jest.fn(() => { CodeBlocks.updateInitiativeTracker(app as any, data, ctx as any); }) as jest.Mock)
		: jest.fn();
	const modal = new MinionStaminaPoolModal(app as any, group, minion, data, ctx as any, updateCallback);
	modal.open();
	const content = (modal as any).contentEl as HTMLElement;
	return { app, ctx, data, group, minion, modal, content, updateCallback };
}

function applyDamage(content: HTMLElement, damage: number, minions: number): void {
	const inputs = content.querySelectorAll<HTMLInputElement>('.apply-input');
	inputs[0].value = String(damage); // damage per minion
	inputs[1].value = String(minions); // number of minions hit
	(content.querySelector('.apply-btn') as HTMLElement).click();
}

describe('T-4: minion pool — minionsToKill math (via the modal info text)', () => {
	// pool 20, minion max 4: kills = floor(totalDamage / 4) while pool starts full
	test.each([
		[3, 1, 0], // 3 total damage → 0 kills
		[4, 1, 1], // 4 → 1
		[4, 2, 2], // 8 → 2
		[11, 1, 2], // 11 → 2
		[4, 5, 5], // 20 → 5 (pool empty)
	])('%i damage to %i minion(s) reports %i to kill', async (damage, minions, kills) => {
		const { content } = await setup();
		applyDamage(content, damage, minions);
		const info = content.querySelector('.info-text') as HTMLElement;
		expect(info.textContent).toContain(`will kill ${kills} minion(s)`);
	});

	test('kill flow: checked minion is marked dead and callback fires once', async () => {
		const { content, minion, updateCallback } = await setup();
		applyDamage(content, 4, 1); // exactly one minion's worth
		const checkbox = content.querySelector<HTMLInputElement>('.minion-checkbox')!;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change'));
		(content.querySelector('.action-button') as HTMLElement).click();
		expect(minion.instances![0].isDead).toBe(true);
		expect(updateCallback).toHaveBeenCalledTimes(1);
	});

	// CB-1 (crit, F3 §2.1): MinionStaminaPoolModal.ts:226 —
	// `len ?? 0 * max` parses as `len ?? (0 * max)`, so the pool is clamped to
	// the ALIVE-MINION COUNT on apply. Correct math (pool 20 − 3 = 17) is
	// encoded; today it saves Math.min(5, 17) = 5. Parenthesizing flips this
	// green (then promote to plain test).
	test.failing('CB-1: applying 3 damage to a full 20-point pool saves 17, not the minion count', async () => {
		const { content, group } = await setup();
		applyDamage(content, 3, 1);
		(content.querySelector('.action-button') as HTMLElement).click();
		expect(group.minion_stamina_pool).toBe(17);
	});

	// CB-2 (high, F3 §2.1): MinionStaminaPoolModal.ts:447 — condition removal
	// calls CodeBlocks.updateCodeBlock(app, data, ctx, "") and rewrites the
	// fence with an EMPTY language, killing the tracker. Correct behavior
	// (fence keeps a real language) is encoded.
	test.failing('CB-2: removing a condition keeps the ds-initiative fence language', async () => {
		const { app, content } = await setup({ condition: true });
		(content.querySelector('.condition-icon') as HTMLElement).click();
		await flushAsync();
		expect(app.vault.modifyCalls.length).toBeGreaterThan(0);
		expect(app.vault.getContent('Encounter.md')!).toContain('```ds-initiative');
	});

	// DC-6 (F3 §2.8): the commented-out TODO documents "saving condition changes
	// prevents damage from saving". Only green when CB-1 + CB-2 + the write
	// interaction are all fixed.
	test.failing('DC-6: condition removal AND damage in one modal session both persist', async () => {
		const { app, content } = await setup({ condition: true, persist: true });
		(content.querySelector('.condition-icon') as HTMLElement).click();
		await flushAsync();
		applyDamage(content, 3, 1);
		(content.querySelector('.action-button') as HTMLElement).click();
		await flushAsync();
		const updated = app.vault.getContent('Encounter.md')!;
		expect(updated).toContain('```ds-initiative'); // fence survived (CB-2)
		expect(updated).toContain('minion_stamina_pool: 17'); // damage saved correctly (CB-1)
		expect(updated).not.toContain('grabbed'); // condition removal saved
	});
});
