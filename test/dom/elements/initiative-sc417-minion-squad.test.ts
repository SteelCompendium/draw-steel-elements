// SC-417 — probe: does the 6.0.2 minion-squad bug Scott reported ("killing a minion drops
// the entire group to 4 hp. when healing the group, the UI breaks") exist in 7.0.0?
//
// 6.0.2's two mechanisms (dse `main` @ e38d4de):
//   1. MinionStaminaPoolModal's Apply clamp `instances.filter(alive).length ?? 0 * max`
//      parsed as `aliveCount ?? (0 * max)` — the pool was clamped to the ALIVE MINION COUNT
//      (4 orcs alive -> pool 4). 7.0.0's clamp is `minionPoolMaxOf` (CB-1/C1).
//   2. The grid-cell dblclick persist callback ran `container.empty(); buildUI(container)`
//      with `container` = the ENEMY GROUP's row, so the whole tracker (heroes, enemy
//      groups, reset bar) was re-rendered INSIDE the group card. 7.0.0 routes that path
//      through the framework's whole-view update().
// Every test here drives the REAL view + the REAL pool modal through the pipeline and
// asserts the squad invariants after each step:
//   - the shared pool lands exactly where the modal said (no clamp to the alive count);
//   - every living minion's readout is `<pool>/<max> (<per>)`, every dead one `DEAD`;
//   - dead count == floor((max - pool) / per) — the pool and the death ticks agree;
//   - the tracker is rendered exactly once (no nested copy).
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, parseYaml } from '../../mocks/obsidian';
import { initiativeElement } from '../../../src/elements/initiative/definition';

// Scott's 6.0.2 screenshot, as a fixture: "Mordor Forces", a squad of 4 Orc minions at
// 40 Stamina each (pool 160) plus a 150-Stamina captain.
const MORDOR = `heroes:
  - name: "Frodo Baggins"
    max_stamina: 80
  - name: "Samwise Gamgee"
    max_stamina: 90
enemy_groups:
  - name: "Mordor Forces"
    is_squad: true
    creatures:
      - name: "Orc"
        max_stamina: 40
        amount: 4
        squad_role: minion
      - name: "Orc Captain"
        max_stamina: 150
        amount: 1
        squad_role: captain
`;
const PER = 40;
const MAX = 160;

function makeHost() {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	document.body.appendChild(containerEl);
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Encounter.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-initiative', lineStart: 0, lineEnd: 30 }),
		replaceSource,
		blockKey: () => 'Encounter.md::ds-initiative::0',
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

function makeDeps(): ElementPipelineDeps {
	const app = new App();
	app.vault.setFile('Media/token_1.png', '');
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme: createThemeService(prefs, plugin as any),
		prefs,
		refs: createReferenceService(app as any, DEFAULT_SETTINGS),
		validation: createValidationService(),
		session: createSessionStore(),
		roll: createRollService(prefs),
	};
}

async function renderInit(source: string) {
	const host = makeHost();
	await new ElementPipeline(makeDeps()).run(initiativeElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { host, root };
}

/** The last write's parsed squad state (what the note would hold). */
function written(host: ReturnType<typeof makeHost>) {
	const calls = host.replaceSource.mock.calls;
	const data = parseYaml(calls[calls.length - 1][0]) as any;
	const group = data.enemy_groups[0];
	return {
		pool: group.minion_stamina_pool as number,
		dead: (group.creatures[0].instances as any[]).filter((i) => i.isDead).map((i) => i.id as number),
	};
}

const modalEl = (): HTMLElement => {
	const m = document.body.querySelector('.modal-container:last-of-type, .modal:last-of-type');
	return (m ?? document.body.lastElementChild) as HTMLElement;
};
const cell = (root: HTMLElement, id: number) =>
	root.querySelector(`.dse-init__cell[data-instance-key="0-${id}"]`) as HTMLElement;
const cellText = (root: HTMLElement, id: number) =>
	cell(root, id).querySelector('.dse-init__cell-stamina')!.textContent;
const detailText = (root: HTMLElement) =>
	root.querySelector('.dse-init__detail .dse-init__stamina')!.textContent;
const actionBtn = (m: HTMLElement) => m.querySelector('.dse-modal__footer .dse-btn--accent') as HTMLButtonElement;
const info = (m: HTMLElement) => m.querySelector('.dse-sedit__info')!.textContent;
const checks = (m: HTMLElement) => Array.from(m.querySelectorAll<HTMLInputElement>('.dse-minion__check'));

function openFromGrid(root: HTMLElement, id: number): HTMLElement {
	cell(root, id).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
	return modalEl();
}
function openFromDetail(root: HTMLElement): HTMLElement {
	(root.querySelector('.dse-init__detail .dse-init__stamina') as HTMLElement).click();
	return modalEl();
}
function applyDamage(m: HTMLElement, damage: number, minions: number): void {
	const inputs = m.querySelectorAll<HTMLInputElement>('.dse-sedit__apply-input');
	inputs[0].value = String(damage);
	inputs[1].value = String(minions);
	(m.querySelector('button[aria-label="Apply Damage"]') as HTMLElement).click();
}
function typePool(m: HTMLElement, value: number): void {
	const input = m.querySelector('.dse-stepper__input') as HTMLInputElement;
	input.value = String(value);
	input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
}
function check(m: HTMLElement, n: number): void {
	for (const c of checks(m).filter((c) => !c.checked).slice(0, n)) {
		c.checked = true;
		c.dispatchEvent(new Event('change'));
	}
}

/** The squad invariants, against the rendered GRID (every minion cell). */
function expectGridConsistent(root: HTMLElement, pool: number, deadIds: number[]): void {
	for (let id = 1; id <= 4; id++) {
		expect([id, cellText(root, id)]).toEqual([id, deadIds.includes(id) ? 'DEAD' : `${pool}/${MAX} (${PER})`]);
	}
	// the captain is untouched by anything done to the pool
	expect(root.querySelector('.dse-init__cell[data-instance-key="1-1"] .dse-init__cell-stamina')!.textContent).toBe('150/150');
	// one tracker, not a tracker nested in a group card (6.0.2 mechanism 2)
	expect(root.querySelectorAll('.dse-init__group--heroes')).toHaveLength(1);
	expect(root.querySelectorAll('.dse-init__group--enemies')).toHaveLength(1);
	expect(root.querySelectorAll('.dse-init__cell')).toHaveLength(5);
}

afterEach(() => {
	jest.useRealTimers();
	document.body.innerHTML = '';
});

describe('SC-417 A — the kill path (grid dblclick -> pool modal -> whole-view rebuild)', () => {
	test('kill one, then a second: pool drops by exactly one share each, readouts agree, never clamped to the alive count', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(MORDOR);
		expectGridConsistent(root, 160, []);

		let m = openFromGrid(root, 1);
		applyDamage(m, 40, 1);
		expect(info(m)).toContain('will kill 1 minion(s)');
		check(m, 1);
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(written(host)).toEqual({ pool: 120, dead: [1] }); // 6.0.2 wrote pool: 4
		expectGridConsistent(root, 120, [1]);

		m = openFromGrid(root, 2);
		applyDamage(m, 40, 1);
		expect(info(m)).toContain('will kill 1 minion(s)');
		check(m, 1); // first unchecked living row = Orc #2
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(written(host)).toEqual({ pool: 80, dead: [1, 2] }); // 6.0.2 wrote pool: 3
		expectGridConsistent(root, 80, [1, 2]);
		expect(host.replaceSource).toHaveBeenCalledTimes(2);
	});

	test('stepper across a minion boundary: typing 75 (85 damage from 160) demands exactly 2 kills, and lands there', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(MORDOR);
		const m = openFromGrid(root, 1);
		typePool(m, 75);
		expect(info(m)).toContain('85 damage will kill 2 minion(s)');
		check(m, 1);
		expect(actionBtn(m).disabled).toBe(true); // 1 of 2 selected
		check(m, 1);
		expect(actionBtn(m).disabled).toBe(false);
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(written(host)).toEqual({ pool: 75, dead: [1, 2] });
		expectGridConsistent(root, 75, [1, 2]);
	});

	test('stepper Decrease button: one step under a full share boundary asks for one kill', async () => {
		const { root } = await renderInit(MORDOR);
		const m = openFromGrid(root, 1);
		typePool(m, 121);
		expect(info(m)).toContain('will kill 0 minion(s)');
		(m.querySelector('button[aria-label="Decrease Stamina pool"]') as HTMLElement).click();
		expect(info(m)).toContain('40 damage will kill 1 minion(s)');
	});

	test('pool to exactly 0 auto-selects every living minion and Apply kills them all', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(MORDOR);
		const m = openFromGrid(root, 1);
		applyDamage(m, 40, 4);
		expect(checks(m).every((c) => c.checked && c.disabled)).toBe(true);
		expect(actionBtn(m).disabled).toBe(false);
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(written(host)).toEqual({ pool: 0, dead: [1, 2, 3, 4] });
		expectGridConsistent(root, 0, [1, 2, 3, 4]);
	});
});

describe('SC-417 B — the heal path (grid dblclick -> pool modal -> whole-view rebuild)', () => {
	test('heal within the current death bracket: allowed, warned, rebuilt once, the dead stay dead', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(MORDOR);
		let m = openFromGrid(root, 1);
		applyDamage(m, 50, 1); // 160 -> 110, 1 kill
		check(m, 1);
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expectGridConsistent(root, 110, [1]);

		m = openFromGrid(root, 2);
		(m.querySelector('button[aria-label="Increase Stamina pool"]') as HTMLElement).click();
		typePool(m, 120);
		expect((m.querySelector('.dse-sedit__warn') as HTMLElement).hidden).toBe(false);
		expect(actionBtn(m).textContent).toContain('Heal 10 stamina');
		expect(actionBtn(m).disabled).toBe(false);
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(written(host)).toEqual({ pool: 120, dead: [1] });
		expectGridConsistent(root, 120, [1]);
	});

	test('heal across a dead minion\'s bracket is refused: the pool can never exceed the living minions\' share', async () => {
		// Rules: "minions can't regain Stamina" (Draw Steel Monsters, "Using Minions"). A heal
		// that would lift the pool past the bracket a dead minion already fell in would leave
		// pool > alive x per, so the kill ladder (dead == floor((max - pool) / per)) would stop
		// matching the instances. The modal keeps Apply disabled for it. (The info line it
		// shows meanwhile — "-1 damage will kill -1 minion(s)" — is SC-417 LOW-1, unpinned.)
		jest.useFakeTimers();
		const { root, host } = await renderInit(MORDOR);
		let m = openFromGrid(root, 1);
		applyDamage(m, 40, 1);
		check(m, 1);
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		m = openFromGrid(root, 2);
		typePool(m, 121);
		expect(actionBtn(m).textContent).toContain('Heal 1 stamina');
		expect((m.querySelector('.dse-sedit__warn') as HTMLElement).hidden).toBe(false);
		expect(actionBtn(m).disabled).toBe(true);
		actionBtn(m).click(); // a disabled button's click is inert
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(written(host)).toEqual({ pool: 120, dead: [1] });
	});

	// LOW-1 — a refused heal used to read "-1 damage will kill -1 minion(s)" with a disabled
	// Apply and no reason. It now says what the rule is, and the button carries the reason.
	test('LOW-1: a refused heal explains itself (no negative numbers) and the disabled Apply carries the reason', async () => {
		jest.useFakeTimers();
		const { root } = await renderInit(MORDOR);
		let m = openFromGrid(root, 1);
		applyDamage(m, 40, 1);
		check(m, 1);
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		m = openFromGrid(root, 2);
		typePool(m, 121); // 1 dead: the living three are worth 120
		expect(actionBtn(m).disabled).toBe(true);
		expect(info(m)).not.toMatch(/-\d/);
		expect(info(m)).toContain("can't raise the pool above the living minions' share (120 stamina)");
		expect(actionBtn(m).getAttribute('title')).toContain("can't regain Stamina past a dead minion's share");
		expect(actionBtn(m).getAttribute('title')).toContain('120');
	});

	test('LOW-1: a heal that stays inside the living share says the dead stay dead (no negative numbers, no kill talk)', async () => {
		jest.useFakeTimers();
		const { root } = await renderInit(MORDOR);
		let m = openFromGrid(root, 1);
		applyDamage(m, 50, 1); // 160 -> 110, 1 dead
		check(m, 1);
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		m = openFromGrid(root, 2);
		typePool(m, 120);
		expect(actionBtn(m).disabled).toBe(false);
		expect(info(m)).not.toMatch(/-\d|kill/);
		expect(info(m)).toContain('Heal 10 stamina');
		expect(info(m)).toContain('dead minions stay dead');
		expect(actionBtn(m).hasAttribute('title')).toBe(false);
	});
});

describe('SC-417 defects found on develop (round 2 fixes: HIGH-1, MEDIUM-1, LOW-1)', () => {
	// HIGH-1 — the DETAIL-ROW path (single click on the open minion's stamina readout or its
	// bar) mutates the shared pool + isDead, then rebuilds ONLY the detail row
	// (view.ts buildDetailedCreatureRow's MinionStaminaPoolModal persist callback). Every
	// other minion's grid cell keeps the OLD pool number and the killed minion's cell never
	// says DEAD. Real Obsidian keeps it that way: SC-340 view adoption reuses the root
	// after the write instead of re-rendering (sc417-obsidian-1b-after-detail-kill.png).
	// The same "pool vs per-member tiles disagree" class as Scott's 6.0.2 screenshot.
	test('HIGH-1: a kill from the detail row repaints the whole squad (grid cells follow the pool)', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(MORDOR);
		const m = openFromDetail(root);
		applyDamage(m, 40, 1);
		check(m, 1);
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(written(host)).toEqual({ pool: 120, dead: [1] });
		expect(detailText(root)).toBe('DEAD');
		expectGridConsistent(root, 120, [1]); // today: every cell still reads 160/160 (40)
	});

	test('HIGH-1: a heal from the detail row repaints the whole squad (grid cells follow the pool)', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(MORDOR);
		let m = openFromGrid(root, 1);
		applyDamage(m, 10, 1);
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		m = openFromDetail(root);
		typePool(m, 160);
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(written(host)).toEqual({ pool: 160, dead: [] });
		expectGridConsistent(root, 160, []); // today: every cell still reads 150/160 (40)
	});

	// MEDIUM-1 — overkill by at least one minion's share through the Apply-damage row:
	// poolNumbers() computes the kill ladder from the UNCLAMPED newStamina, so it demands
	// more kills than there are living minions; every living checkbox is auto-checked and
	// locked, the count can never match, and Apply is disabled for good.
	test('MEDIUM-1: an area attack that overkills the whole squad can be applied (all living minions die, pool 0)', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(MORDOR);
		const m = openFromGrid(root, 1);
		applyDamage(m, 50, 4); // 200 damage vs a 160 pool
		expect(checks(m).every((c) => c.checked && c.disabled)).toBe(true);
		expect(info(m)).toContain('will kill 4 minion(s)'); // today: "kill 5"
		expect(actionBtn(m).disabled).toBe(false); // today: disabled, "Select 5 minion(s) to kill"
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(written(host)).toEqual({ pool: 0, dead: [1, 2, 3, 4] });
		expectGridConsistent(root, 0, [1, 2, 3, 4]);
	});

	test('MEDIUM-1: overkilling the last living minion by a full share can be applied', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(MORDOR);
		let m = openFromGrid(root, 1);
		applyDamage(m, 40, 3);
		check(m, 3);
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		m = openFromGrid(root, 4);
		applyDamage(m, 80, 1); // 80 vs the last 40
		expect(actionBtn(m).disabled).toBe(false); // today: "kill 2 minion(s)" with one alive
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(written(host)).toEqual({ pool: 0, dead: [1, 2, 3, 4] });
	});

	// A block DAMAGED by 6.0.2's clamp bug, opened in 7.0.0: Scott's own screenshot state
	// (pool 2 of 160, two of four orcs dead). The ladder (floor((160 - 2) / 40) = 3) already
	// disagrees with the 2 recorded deaths, so driving the pool to 0 asks for 1 kill while
	// both living orcs are auto-checked — Apply is disabled and the squad can never be
	// finished. A pool at 0 must kill every living minion, whatever the history.
	test('MEDIUM-1: a 6.0.2-damaged block (pool 2/160, 2 of 4 dead) can still be finished off', async () => {
		jest.useFakeTimers();
		const damaged = MORDOR.replace(
			'        squad_role: minion\n',
			'        squad_role: minion\n        instances:\n          - id: 1\n          - id: 2\n            isDead: true\n          - id: 3\n            isDead: true\n          - id: 4\n',
		).replace('    is_squad: true\n', '    is_squad: true\n    minion_stamina_pool: 2\n');
		const { root, host } = await renderInit(damaged);
		expectGridConsistent(root, 2, [2, 3]);
		const m = openFromGrid(root, 1);
		applyDamage(m, 2, 1);
		expect(checks(m).every((c) => c.checked && c.disabled)).toBe(true);
		expect(actionBtn(m).disabled).toBe(false); // today: "kill 1 minion(s)" with 2 auto-checked
		actionBtn(m).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(written(host)).toEqual({ pool: 0, dead: [1, 2, 3, 4] });
	});
});
