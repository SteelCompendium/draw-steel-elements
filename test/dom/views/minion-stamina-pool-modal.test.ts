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

// `persist: true` mirrors production: the caller-injected persist callback
// writes the block back via CodeBlocks.updateInitiativeTracker (the modal itself
// never touches CodeBlocks — needed for the CB-2/DC-6 scenarios).
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
	const modal = new MinionStaminaPoolModal(app as any, group, minion, updateCallback);
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

	// CB-1 (crit, F3 §2.1, FIXED): MinionStaminaPoolModal — the pool max is now
	// `(aliveCount) * minionMaxStamina` (was `len ?? 0 * max`, which parsed as
	// `len ?? (0 * max)` and clamped the pool to the alive-minion COUNT). Pool
	// 20 − 3 damage saves 17, not Math.min(5, 17) = 5.
	test('CB-1: applying 3 damage to a full 20-point pool saves 17, not the minion count', async () => {
		const { content, group } = await setup();
		applyDamage(content, 3, 1);
		(content.querySelector('.action-button') as HTMLElement).click();
		expect(group.minion_stamina_pool).toBe(17);
	});

	// CB-2 (high, F3 §2.1, FIXED): condition removal used to call
	// CodeBlocks.updateCodeBlock(app, data, ctx, "") directly, rewriting the fence
	// with an EMPTY language and killing the tracker. The modal now routes ALL
	// persistence through the injected persist callback (which writes via
	// updateInitiativeTracker), so the fence keeps its real language.
	test('CB-2: removing a condition persists via the callback and keeps the ds-initiative fence', async () => {
		const { app, content, minion, updateCallback } = await setup({ condition: true, persist: true });
		(content.querySelector('.condition-icon') as HTMLElement).click();
		await flushAsync();
		// The removal mutated the shared data and fired persist exactly once…
		expect(minion.instances![0].conditions).toEqual([]);
		expect(updateCallback).toHaveBeenCalledTimes(1);
		// …and the write it produced left the fenced block intact.
		expect(app.vault.modifyCalls.length).toBeGreaterThan(0);
		const updated = app.vault.getContent('Encounter.md')!;
		expect(updated).toContain('```ds-initiative');
		expect(updated).not.toContain('```\n```'); // no language-less fence left behind
		// The minion's condition is gone from the persisted enemy section (the hero
		// Aragorn's own untouched `grabbed` legitimately remains above it).
		expect(updated.slice(updated.indexOf('enemy_groups:'))).not.toContain('grabbed');
	});

	// DC-6 (F3 §2.8, FIXED): the old TODO documented "saving condition changes
	// prevents damage from saving". With CB-1 + CB-2 fixed and both paths routed
	// through the same injected persist callback, condition removal AND damage in
	// one modal session each persist exactly once.
	test('DC-6: condition removal AND damage in one modal session both persist', async () => {
		const { app, content, updateCallback } = await setup({ condition: true, persist: true });
		(content.querySelector('.condition-icon') as HTMLElement).click();
		await flushAsync();
		applyDamage(content, 3, 1);
		(content.querySelector('.action-button') as HTMLElement).click();
		await flushAsync();
		expect(updateCallback).toHaveBeenCalledTimes(2); // once per action, no more
		const updated = app.vault.getContent('Encounter.md')!;
		expect(updated).toContain('```ds-initiative'); // fence survived (CB-2)
		expect(updated).toContain('minion_stamina_pool: 17'); // damage saved correctly (CB-1)
		// Condition removal saved: the minion's condition is gone from the persisted
		// enemy section (the hero's own untouched `grabbed` legitimately remains).
		expect(updated.slice(updated.indexOf('enemy_groups:'))).not.toContain('grabbed');
	});
});
