// Plan 09 Task 3 (D2 §3.5b / OD-6) — MinionStaminaPoolModal on the unified managedModal
// template: the same .dse-sedit scaffold as StaminaEditModal PLUS the optional
// .dse-sedit__minions section (info text + checkbox rows + condition icons). The
// behavior nets are load-bearing and preserved verbatim:
//   - CB-1: the pool-clamp precedence at Apply ((aliveCount) * minionMax, not
//     `len ?? 0 * max`);
//   - CB-2: condition removal persists via the injected callback (never a
//     CodeBlocks.updateCodeBlock(app, data, ctx, "") empty-fence write);
//   - DC-6: condition removal AND damage in one session each persist once.
// New under D2: kit controls (real disabled — CB-8), zero inline colors/widths (SC-5),
// the checked-minion crimson is a `.dse-minion__check:checked ~ *` token rule.
import * as fs from 'fs';
import * as path from 'path';
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
async function setup(
	options: {
		condition?: boolean | { color?: string; effect?: string };
		persist?: boolean;
		pool?: number;
	} = {},
): Promise<Setup> {
	const app = new App();
	const note = '# Encounter\n\n```ds-initiative\n' + squadYaml.trimEnd() + '\n```\n';
	app.vault.setFile('Encounter.md', note);
	const ctx = makeFakeContext(app, 'Encounter.md');
	const data = await parseEncounterData(squadYaml, app as any, DEFAULT_SETTINGS);
	const group = data.enemy_groups[0];
	const minion = group.creatures[0];
	if (options.pool !== undefined) group.minion_stamina_pool = options.pool;
	if (options.condition) {
		const custom = typeof options.condition === 'object' ? options.condition : {};
		minion.instances![0].conditions = [{ key: 'grabbed', color: custom.color, effect: custom.effect }];
	}
	const updateCallback = options.persist
		? (jest.fn(() => { CodeBlocks.updateInitiativeTracker(app as any, data, ctx as any); }) as jest.Mock)
		: jest.fn();
	const modal = new MinionStaminaPoolModal(app as any, group, minion, updateCallback);
	modal.open();
	const content = (modal as any).contentEl as HTMLElement;
	return { app, ctx, data, group, minion, modal, content, updateCallback };
}

/** The kit iconButton carrying the given accessible name. */
function btn(content: HTMLElement, label: string): HTMLButtonElement {
	const el = content.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
	if (!el) throw new Error(`no button [aria-label="${label}"]`);
	return el;
}

/** The footer's primary (accent) action button — dynamic "Deal N damage…" text. */
function actionBtn(content: HTMLElement): HTMLButtonElement {
	const el = content.querySelector<HTMLButtonElement>('.dse-modal__footer .dse-btn--accent');
	if (!el) throw new Error('no footer accent action button');
	return el;
}

function applyDamage(content: HTMLElement, damage: number, minions: number): void {
	const inputs = content.querySelectorAll<HTMLInputElement>('.dse-sedit__apply-input');
	inputs[0].value = String(damage); // damage per minion
	inputs[1].value = String(minions); // number of minions hit
	btn(content, 'Apply Damage').click();
}

afterEach(() => {
	document.body.innerHTML = '';
});

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
		const info = content.querySelector('.dse-sedit__info') as HTMLElement;
		expect(info.textContent).toContain(`will kill ${kills} minion(s)`);
	});

	test('kill flow: checked minion is marked dead and callback fires once', async () => {
		const { content, minion, updateCallback } = await setup();
		applyDamage(content, 4, 1); // exactly one minion's worth
		const checkbox = content.querySelector<HTMLInputElement>('.dse-minion__check')!;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change'));
		actionBtn(content).click();
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
		actionBtn(content).click();
		expect(group.minion_stamina_pool).toBe(17);
	});

	// CB-2 (high, F3 §2.1, FIXED): condition removal used to call
	// CodeBlocks.updateCodeBlock(app, data, ctx, "") directly, rewriting the fence
	// with an EMPTY language and killing the tracker. The modal routes ALL
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
		actionBtn(content).click();
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

describe('D2 §3.5b: the pool modal on the unified template (optional minion section, CB-8, SC-5)', () => {
	test('same .dse-modal scaffold as StaminaEditModal, PLUS the .dse-sedit__minions section with one row per alive minion', async () => {
		const { modal, content } = await setup();
		const containerEl = (modal as any).containerEl as HTMLElement;
		expect(containerEl.classList.contains('dse-modal')).toBe(true);
		expect(((modal as any).titleEl as HTMLElement).textContent).toContain('Minion Stamina Pool');
		const minions = content.querySelector('.dse-sedit__minions') as HTMLElement;
		expect(minions).not.toBeNull();
		expect(minions.querySelectorAll('.dse-minion')).toHaveLength(5); // squad.yaml: 5 alive goblins
		expect(minions.querySelectorAll('input.dse-minion__check[type="checkbox"]')).toHaveLength(5);
	});

	test('CB-8: the apply button is REAL-disabled until the kill selection matches minionsToKill (tooltip explains why)', async () => {
		const { content } = await setup();
		const action = actionBtn(content);
		expect(action.disabled).toBe(true); // no change yet

		applyDamage(content, 4, 1); // 4 damage = 1 kill required
		expect(action.disabled).toBe(true); // kill not yet accounted for
		expect(action.getAttribute('title')).toBe('Select 1 minion(s) to kill');
		expect(action.textContent).toContain('Deal 4 damage, kill 1 minion(s)');

		const checkbox = content.querySelector<HTMLInputElement>('.dse-minion__check')!;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change'));
		expect(action.disabled).toBe(false);
		expect(action.getAttribute('title')).toBeNull();
	});

	test('typed decimals integer-coerce (legacy parseInt semantics): persist() writes an INTEGER pool', async () => {
		const { modal, content, group } = await setup(); // pool 20, minion max 4
		const input = content.querySelector('.dse-stepper__input') as HTMLInputElement;
		input.value = '12.5';
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect((modal as any).pendingStaminaChange).toBe(-8); // trunc(12.5) = 12 → -8

		// 8 damage kills 2 minions — select them so Apply enables, then persist.
		const checks = Array.from(content.querySelectorAll<HTMLInputElement>('.dse-minion__check'));
		for (const check of checks.slice(0, 2)) {
			check.checked = true;
			check.dispatchEvent(new Event('change'));
		}
		actionBtn(content).click();
		expect(group.minion_stamina_pool).toBe(12); // an INTEGER, never 12.5
		expect(Number.isInteger(group.minion_stamina_pool)).toBe(true);
	});

	test('the healing warning ("minions cannot regain stamina") shows via the hidden attribute + .dse-sedit__warn — no inline display toggling', async () => {
		// Pre-damaged pool: healing is only reachable below the pool max (as in legacy,
		// where the increment button was a no-op at the full pool).
		const { content } = await setup({ pool: 16 });
		const warn = content.querySelector('.dse-sedit__warn') as HTMLElement;
		expect(warn.hidden).toBe(true);

		btn(content, 'Decrease Stamina pool').click();
		expect(warn.hidden).toBe(true); // damage: no warning
		btn(content, 'Reset').click();

		btn(content, 'Increase Stamina pool').click();
		expect(warn.hidden).toBe(false); // net heal: warning shows
		expect(warn.getAttribute('title')).toBe('Typically minions are unable to regain stamina');
	});

	test('checkbox availability still follows the clamp/distribution rules (auto-select-all at 0, disable beyond minionsToKill)', async () => {
		const { content } = await setup();
		applyDamage(content, 4, 5); // 20 damage: pool to 0 -> ALL checkboxes auto-selected + locked
		const checks = Array.from(content.querySelectorAll<HTMLInputElement>('.dse-minion__check'));
		expect(checks.every((c) => c.checked && c.disabled)).toBe(true);
		expect(actionBtn(content).disabled).toBe(false); // 5 kills, 5 selected
	});

	test('SC-5: pool bar geometry via --dse-fill/--dse-delta-fill, minion-death ticks via --dse-tick-x — zero inline colors/widths', async () => {
		const { content } = await setup();
		const barEl = content.querySelector('.dse-stamina--modal') as HTMLElement;
		const fill = barEl.querySelector('.dse-stamina__fill') as HTMLElement;
		const delta = barEl.querySelector('.dse-stamina__delta') as HTMLElement;
		expect(parseFloat(fill.style.getPropertyValue('--dse-fill'))).toBeCloseTo(100, 2);
		expect(delta.getAttribute('data-kind')).toBe('none');

		// 4 ticks at each minion boundary of the 5-goblin pool (4/20, 8/20, 12/20, 16/20).
		const ticks = Array.from(barEl.querySelectorAll<HTMLElement>('.dse-stamina__tick'));
		expect(ticks).toHaveLength(4);
		ticks.forEach((t, i) => {
			expect(parseFloat(t.style.getPropertyValue('--dse-tick-x'))).toBeCloseTo((i + 1) * 20, 5);
		});

		applyDamage(content, 3, 1);
		expect(delta.getAttribute('data-kind')).toBe('damage');
		expect(parseFloat(delta.style.getPropertyValue('--dse-delta-fill'))).toBeCloseTo(15, 2); // 3/20
		expect(parseFloat(fill.style.getPropertyValue('--dse-fill'))).toBeCloseTo(85, 2);

		// The only .style writes anywhere in the modal are --dse-* custom properties.
		for (const el of Array.from(content.querySelectorAll<HTMLElement>('[style]'))) {
			for (const decl of el.getAttribute('style')!.split(';')) {
				if (decl.trim() === '') continue;
				expect(decl.trim()).toMatch(/^--dse-/);
			}
		}
	});

	// P09 review fix: the condition icons were the ONE remaining site writing
	// --dse-condition-color / condition-effect-* raw. They now route through the
	// shared Task 8 helpers (applyConditionColor / applyConditionEffect), which adds
	// SD-2 validation — same icon, same element, invalid input now rejected.
	test('a valid condition color/effect still reaches the icon (via the Task 8 helpers)', async () => {
		const { content } = await setup({ condition: { color: 'red', effect: 'glow' } });
		const icon = content.querySelector('.condition-icon') as HTMLElement;
		expect(icon.style.getPropertyValue('--dse-condition-color')).toBe('red');
		expect(icon.classList.contains('condition-effect-glow')).toBe(true);
	});

	test('SD-2: an INVALID condition color is rejected — no property, no inline style at all', async () => {
		const { content } = await setup({ condition: { color: 'expression(alert(1))' } });
		const icon = content.querySelector('.condition-icon') as HTMLElement;
		expect(icon.style.getPropertyValue('--dse-condition-color')).toBe('');
		expect(icon.getAttribute('style') ?? '').toBe('');
	});

	test('a whitespace effect no longer throws (raw classList.add DOMException footgun) and adds no class', async () => {
		// Pre-fix, classList.add(`condition-effect-x y`) threw InvalidCharacterError
		// during onOpen — setup() itself would reject. Post-fix the icon renders clean.
		const { content } = await setup({ condition: { effect: 'x y' } });
		const icon = content.querySelector('.condition-icon') as HTMLElement;
		expect(icon).not.toBeNull();
		expect(Array.from(icon.classList)).toEqual(['condition-icon']);
	});

	test('source hygiene: the modal imports the shared helpers, no raw condition-color/effect writes remain', () => {
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/views/MinionStaminaPoolModal.ts'),
			'utf8',
		);
		const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
		expect(code).toMatch(/applyConditionColor\(/);
		expect(code).toMatch(/applyConditionEffect\(/);
		expect(code).not.toMatch(/setProperty\(\s*['"`]--dse-condition-color/);
		expect(code).not.toMatch(/classList\.add\(\s*`condition-effect-/);
	});

	test('CSS contract: the checked-minion crimson is the `.dse-minion__check:checked ~ *` token rule (--dse-danger), the warn icon is --dse-warn', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		expect(sheet).toMatch(/\.dse-minion__check:checked\s*~\s*\*\s*\{[^}]*var\(--dse-danger\)/);
		expect(sheet).toMatch(/\.dse-sedit__warn\b[^}]*var\(--dse-warn\)/);
		// The crimson literal survives ONLY as the --dse-danger token definition (the
		// :root token block is the one sanctioned home for color literals, D2 §6).
		const declarations = sheet.replace(/\/\*[\s\S]*?\*\//g, ''); // comments aren't rules
		expect(declarations.match(/\bcrimson\b/g)).toHaveLength(1);
		expect(declarations).toMatch(/--dse-danger:\s*crimson/);
	});
});
