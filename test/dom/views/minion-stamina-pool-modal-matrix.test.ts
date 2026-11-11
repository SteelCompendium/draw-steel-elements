// SC-435 — L1 (jsdom) logic matrix for MinionStaminaPoolModal: the death ladder, the refused heal, the typed pool
// value, the Apply Damage row, the kill boxes (hand ticks, name clicks, auto-check), Reset, Apply and condition
// removal, as tables of (values x states x variants). Controls are addressed by their `data-dse-control` id, the
// same ids the real-Obsidian e2e drives (e2e/manifest/minion-pool-modal.ts).
//
// Expected numbers are spelled out as literals (never recomputed from the modal's own ladder), so a regression in the
// kill arithmetic fails here. Fixture: a squad of 5 goblins with 4 Stamina each (pool max 20, one minion per 4).
// The existing minion-stamina-pool-modal.test.ts keeps each defect's own regression test (SC-195 / 241 / 427 / 429 /
// 430); this file is the combinatorial net around them.
//
// Known-bug convention (SC-408 ledger): a test of the CORRECT behaviour that fails today because of a filed bug is a
// `test.failing` with the ticket in its title; it FAILS once the bug is fixed, so the marker gets removed then.
import { parseEncounterData } from '@drawSteelAdmonition/EncounterData';
import type { Condition, Creature, EnemyGroup } from '@drawSteelAdmonition/EncounterData';
import { MinionStaminaPoolModal } from '@views/MinionStaminaPoolModal';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App } from '../../mocks/obsidian';

// ------------------------------------------------------------------------------------ harness

interface Squad {
	/** Minions in the squad (default 5). */
	amount?: number;
	/** Stamina per minion (default 4). */
	per?: number;
	/** The group's current pool (default: the full pool). */
	pool?: number;
	/** How many minions are already dead (the first N instances). */
	dead?: number;
	/** A captain bonus already folded into the pool (SC-195): per-minion step becomes per + bonus. */
	bonus?: { n: number; poolMax: number };
	/** Conditions per instance index. */
	conditions?: Record<number, Array<string | Condition>>;
}

async function open(spec: Squad = {}) {
	const app = new App();
	const yaml = [
		'heroes:',
		'  - name: "Aragorn"',
		'    max_stamina: 120',
		'enemy_groups:',
		'  - name: "Goblin Squad"',
		'    is_squad: true',
		'    creatures:',
		'      - name: "Goblin"',
		`        max_stamina: ${spec.per ?? 4}`,
		`        amount: ${spec.amount ?? 5}`,
		'        squad_role: minion',
	].join('\n');
	const data = await parseEncounterData(yaml, app as any, DEFAULT_SETTINGS);
	const group: EnemyGroup = data.enemy_groups[0];
	const minion: Creature = group.creatures[0];
	if (spec.pool !== undefined) group.minion_stamina_pool = spec.pool;
	if (spec.bonus) {
		minion.minion_stamina_pool_max = spec.bonus.poolMax;
		minion.captain_bonus_active = true;
		minion.captain_bonus_n = spec.bonus.n;
	}
	minion.instances!.slice(0, spec.dead ?? 0).forEach((inst) => (inst.isDead = true));
	for (const [i, list] of Object.entries(spec.conditions ?? {})) minion.instances![Number(i)].conditions = list as Condition[];
	const persist = jest.fn();
	const modal = new MinionStaminaPoolModal(app as any, group, minion, persist);
	modal.open();
	const content = (modal as any).contentEl as HTMLElement;
	return { app, group, minion, modal, content, persist };
}

type Content = HTMLElement;
const all = <T extends HTMLElement = HTMLElement>(c: Content, id: string): T[] => Array.from(c.querySelectorAll<T>(`[data-dse-control="${id}"]`));
const ctl = <T extends HTMLElement = HTMLElement>(c: Content, id: string, nth = 0): T => {
	const el = all<T>(c, id)[nth];
	if (!el) throw new Error(`no [data-dse-control="${id}"] #${nth}`);
	return el;
};
const poolInput = (c: Content) => ctl<HTMLInputElement>(c, 'pool.stamina.input');
const apply = (c: Content) => ctl<HTMLButtonElement>(c, 'pool.apply');
const info = (c: Content) => c.querySelector<HTMLElement>('.dse-sedit__info')!;
const warn = (c: Content) => c.querySelector<HTMLElement>('.dse-sedit__warn')!;
const click = (c: Content, id: string, nth = 0) => ctl(c, id, nth).click();
/** The condition an icon removes, read off its accessible name ("Remove Grabbed" -> "Grabbed"). */
const conditionName = (icon: HTMLElement): string => (icon.getAttribute('aria-label') ?? '').replace(/^Remove /, '');

/** Type a pool value and commit it with Enter (what a user does), no blur. */
function typePool(c: Content, v: string): void {
	const el = poolInput(c);
	el.value = v;
	el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}
/** Fill the Apply Damage row and press its button. */
function dealDamage(c: Content, damage: string, minions: string): void {
	ctl<HTMLInputElement>(c, 'pool.damage-amount').value = damage;
	ctl<HTMLInputElement>(c, 'pool.minion-count').value = minions;
	click(c, 'pool.apply-damage');
}
/** A hand tick, exactly as a user's click does it (jsdom fires `change` on a real .click()). */
const tick = (c: Content, nth: number) => click(c, 'pool.kill', nth);

/** One short string for the kill boxes: `.` open, `o` ticked, `-` locked open, `x` locked ticked. */
function boxes(c: Content): string {
	return all<HTMLInputElement>(c, 'pool.kill')
		.map((b) => (b.checked ? (b.disabled ? 'x' : 'o') : b.disabled ? '-' : '.'))
		.join('');
}

afterEach(() => {
	document.body.innerHTML = '';
});

// ----------------------------------------------------------------------------- the death ladder

interface Ladder {
	name: string;
	spec: Squad;
	/** The pool value typed + committed. */
	to: string;
	info: string;
	label: string;
	boxes: string;
	applyDisabled: boolean;
}
const SEL = (n: number) => ` \nSelect ${n} minion(s) to kill.`;

describe('the death ladder: a typed pool value -> info line, Apply label, kill boxes, Apply state', () => {
	// Pool max 20, one minion per 4 (floor((20 - pool) / 4) minions are dead at a pool value).
	const rows: Ladder[] = [
		// -- full squad (pool 20, nobody dead)
		{ name: '20 -> 19: under one minion', spec: {}, to: '19', info: '1 damage will kill 0 minion(s).', label: 'Deal 1 damage', boxes: '-----', applyDisabled: false },
		{ name: '20 -> 17: still under one minion', spec: {}, to: '17', info: '3 damage will kill 0 minion(s).', label: 'Deal 3 damage', boxes: '-----', applyDisabled: false },
		{ name: '20 -> 16: exactly one minion', spec: {}, to: '16', info: `4 damage will kill 1 minion(s).${SEL(1)}`, label: 'Deal 4 damage, kill 1 minion(s)', boxes: '.....', applyDisabled: true },
		{ name: '20 -> 15: one minion, one over', spec: {}, to: '15', info: `5 damage will kill 1 minion(s).${SEL(1)}`, label: 'Deal 5 damage, kill 1 minion(s)', boxes: '.....', applyDisabled: true },
		{ name: '20 -> 12: two minions', spec: {}, to: '12', info: `8 damage will kill 2 minion(s).${SEL(2)}`, label: 'Deal 8 damage, kill 2 minion(s)', boxes: '.....', applyDisabled: true },
		{ name: '20 -> 1: four minions, one survives on 1', spec: {}, to: '1', info: `19 damage will kill 4 minion(s).${SEL(4)}`, label: 'Deal 19 damage, kill 4 minion(s)', boxes: '.....', applyDisabled: true },
		{ name: '20 -> 0: the squad dies, every box ticks and locks', spec: {}, to: '0', info: `20 damage will kill 5 minion(s).${SEL(5)}`, label: 'Deal 20 damage, kill 5 minion(s)', boxes: 'xxxxx', applyDisabled: false },
		// -- two dead already (pool 12, three alive)
		{ name: '12 (2 dead) -> 11: no new death', spec: { pool: 12, dead: 2 }, to: '11', info: '1 damage will kill 0 minion(s).', label: 'Deal 1 damage', boxes: '---', applyDisabled: false },
		{ name: '12 (2 dead) -> 8: one more', spec: { pool: 12, dead: 2 }, to: '8', info: `4 damage will kill 1 minion(s).${SEL(1)}`, label: 'Deal 4 damage, kill 1 minion(s)', boxes: '...', applyDisabled: true },
		{ name: '12 (2 dead) -> 3: the ladder says 2 more', spec: { pool: 12, dead: 2 }, to: '3', info: `9 damage will kill 2 minion(s).${SEL(2)}`, label: 'Deal 9 damage, kill 2 minion(s)', boxes: '...', applyDisabled: true },
		{ name: '12 (2 dead) -> 0: all three living die', spec: { pool: 12, dead: 2 }, to: '0', info: `12 damage will kill 3 minion(s).${SEL(3)}`, label: 'Deal 12 damage, kill 3 minion(s)', boxes: 'xxx', applyDisabled: false },
		// -- last minion standing (pool 4, four dead)
		{ name: '4 (4 dead) -> 3: the last minion survives', spec: { pool: 4, dead: 4 }, to: '3', info: '1 damage will kill 0 minion(s).', label: 'Deal 1 damage', boxes: '-', applyDisabled: false },
		{ name: '4 (4 dead) -> 0: the last minion dies', spec: { pool: 4, dead: 4 }, to: '0', info: `4 damage will kill 1 minion(s).${SEL(1)}`, label: 'Deal 4 damage, kill 1 minion(s)', boxes: 'x', applyDisabled: false },
		// -- a pool part way through a bracket (pool 18: the next death is at 16)
		{ name: '18 -> 16 crosses the 16 line once', spec: { pool: 18 }, to: '16', info: `2 damage will kill 1 minion(s).${SEL(1)}`, label: 'Deal 2 damage, kill 1 minion(s)', boxes: '.....', applyDisabled: true },
		{ name: '18 -> 17 does not', spec: { pool: 18 }, to: '17', info: '1 damage will kill 0 minion(s).', label: 'Deal 1 damage', boxes: '-----', applyDisabled: false },
		// -- a captain bonus folded in: pool max 40, one minion per 4 + 4 = 8
		{ name: 'bonus 40 -> 33: under one (8) minion', spec: { pool: 40, bonus: { n: 4, poolMax: 40 } }, to: '33', info: '7 damage will kill 0 minion(s).', label: 'Deal 7 damage', boxes: '-----', applyDisabled: false },
		{ name: 'bonus 40 -> 32: exactly one (8) minion', spec: { pool: 40, bonus: { n: 4, poolMax: 40 } }, to: '32', info: `8 damage will kill 1 minion(s).${SEL(1)}`, label: 'Deal 8 damage, kill 1 minion(s)', boxes: '.....', applyDisabled: true },
		{ name: 'bonus 40 -> 16: three (8) minions', spec: { pool: 40, bonus: { n: 4, poolMax: 40 } }, to: '16', info: `24 damage will kill 3 minion(s).${SEL(3)}`, label: 'Deal 24 damage, kill 3 minion(s)', boxes: '.....', applyDisabled: true },
		// -- another squad shape: 3 ogre-ish minions of 10 (pool max 30)
		{ name: '3 x 10: 30 -> 20 is one minion', spec: { amount: 3, per: 10 }, to: '20', info: `10 damage will kill 1 minion(s).${SEL(1)}`, label: 'Deal 10 damage, kill 1 minion(s)', boxes: '...', applyDisabled: true },
		{ name: '3 x 10: 30 -> 21 is none', spec: { amount: 3, per: 10 }, to: '21', info: '9 damage will kill 0 minion(s).', label: 'Deal 9 damage', boxes: '---', applyDisabled: false },
	];
	test.each(rows)('$name', async (r) => {
		const { content } = await open(r.spec);
		typePool(content, r.to);
		expect(info(content).hidden).toBe(false);
		expect(info(content).textContent).toBe(r.info);
		expect(apply(content).textContent).toBe(r.label);
		expect(boxes(content)).toBe(r.boxes);
		expect(apply(content).disabled).toBe(r.applyDisabled);
		expect(warn(content).hidden).toBe(true); // damage never shows the heal warning
	});
});

// ---------------------------------------------------------------------------------- refused heal

describe('a heal: allowed inside the living minions\' share, refused past a dead minion\'s share', () => {
	interface Heal {
		name: string;
		spec: Squad;
		to: string;
		/** null = allowed. Otherwise the share the refusal names. */
		refusedAt: number | null;
		info: string;
		label: string;
	}
	const rows: Heal[] = [
		{ name: '19 -> 20 (nobody dead) is allowed', spec: { pool: 19 }, to: '20', refusedAt: null, info: 'Heal 1 stamina; dead minions stay dead.', label: 'Heal 1 stamina' },
		{ name: '11 (2 dead) -> 12 reaches the top of its bracket', spec: { pool: 11, dead: 2 }, to: '12', refusedAt: null, info: 'Heal 1 stamina; dead minions stay dead.', label: 'Heal 1 stamina' },
		{ name: '11 (2 dead) -> 13 is past a dead minion\'s share', spec: { pool: 11, dead: 2 }, to: '13', refusedAt: 12, info: "A heal can't raise the pool above the living minions' share (12 stamina).", label: 'Heal 2 stamina' },
		{ name: '12 (2 dead) -> 20 is past it too', spec: { pool: 12, dead: 2 }, to: '20', refusedAt: 12, info: "A heal can't raise the pool above the living minions' share (12 stamina).", label: 'Heal 8 stamina' },
		{ name: '12 (2 dead) -> 13: one over', spec: { pool: 12, dead: 2 }, to: '13', refusedAt: 12, info: "A heal can't raise the pool above the living minions' share (12 stamina).", label: 'Heal 1 stamina' },
		{ name: '8 (3 dead) -> 9: one over the share of 8', spec: { pool: 8, dead: 3 }, to: '9', refusedAt: 8, info: "A heal can't raise the pool above the living minions' share (8 stamina).", label: 'Heal 1 stamina' },
		{ name: '4 (4 dead) -> 8: the last minion has a share of 4', spec: { pool: 4, dead: 4 }, to: '8', refusedAt: 4, info: "A heal can't raise the pool above the living minions' share (4 stamina).", label: 'Heal 4 stamina' },
		{ name: 'bonus 28 (1 dead, steps of 8) -> 32 is the share', spec: { pool: 28, dead: 1, bonus: { n: 4, poolMax: 40 } }, to: '32', refusedAt: null, info: 'Heal 4 stamina; dead minions stay dead.', label: 'Heal 4 stamina' },
		{ name: 'bonus 28 (1 dead, steps of 8) -> 33 is past it', spec: { pool: 28, dead: 1, bonus: { n: 4, poolMax: 40 } }, to: '33', refusedAt: 32, info: "A heal can't raise the pool above the living minions' share (32 stamina).", label: 'Heal 5 stamina' },
	];
	test.each(rows)('$name', async (r) => {
		const { content, group, persist } = await open(r.spec);
		typePool(content, r.to);
		expect(info(content).textContent).toBe(r.info);
		expect(warn(content).hidden).toBe(false); // the "minions cannot regain stamina" icon shows for any heal
		expect(boxes(content)).toBe('-'.repeat(all(content, 'pool.kill').length)); // a heal never asks for a kill
		if (r.refusedAt === null) {
			expect(apply(content).textContent).toBe(r.label);
			expect(apply(content).disabled).toBe(false);
			expect(apply(content).hasAttribute('title')).toBe(false);
			apply(content).click();
			expect(group.minion_stamina_pool).toBe(Number(r.to));
			expect(persist).toHaveBeenCalledTimes(1);
		} else {
			const reason = `Minions can't regain Stamina past a dead minion's share (at most ${r.refusedAt})`;
			expect(apply(content).disabled).toBe(true);
			expect(apply(content).getAttribute('title')).toBe(reason); // the tooltip explains the refusal
			expect(apply(content).getAttribute('aria-label')).toBe(`${r.label} — ${reason}`); // so does the accessible name
			expect(apply(content).querySelector('.dse-btn__text')!.textContent).toBe(r.label); // the visible text stays the action
			apply(content).click(); // a click on a disabled button does nothing
			expect(persist).not.toHaveBeenCalled();
		}
	});

	test('the refusal lifts again when the heal comes back inside the share', async () => {
		const { content } = await open({ pool: 12, dead: 2 });
		typePool(content, '14');
		expect(apply(content).disabled).toBe(true);
		typePool(content, '12'); // back to the current pool: nothing pending
		expect(apply(content).textContent).toBe('No Stamina Change');
		expect(apply(content).hasAttribute('title')).toBe(false);
		expect(info(content).hidden).toBe(true);
		click(content, 'pool.stamina.dec'); // 11: damage again
		expect(apply(content).textContent).toBe('Deal 1 damage');
		expect(apply(content).disabled).toBe(false);
	});
});

// ------------------------------------------------------------------------------ the pool stepper

describe('the pool stepper: bounds, typed values, stepping', () => {
	test.each([
		['7', 7, 'Deal 13 damage, kill 3 minion(s)'],
		['7.9', 7, 'Deal 13 damage, kill 3 minion(s)'], // truncates, never writes a float
		['-3', 0, 'Deal 20 damage, kill 5 minion(s)'], // clamps at the floor of 0
		['99', 20, 'No Stamina Change'], // clamps at the pool max: nothing pending
		['20', 20, 'No Stamina Change'],
		['', 20, 'No Stamina Change'], // an empty draft reverts
	])('typing "%s" commits %i (label "%s")', async (typed, shown, label) => {
		const { content } = await open();
		typePool(content, typed);
		expect(poolInput(content).value).toBe(String(shown));
		expect(apply(content).textContent).toBe(label);
	});

	test('Decrease disabled at 0, Increase disabled at the max, both enabled in between', async () => {
		const { content } = await open({ pool: 20 });
		expect(ctl<HTMLButtonElement>(content, 'pool.stamina.inc').disabled).toBe(true); // at the max
		expect(ctl<HTMLButtonElement>(content, 'pool.stamina.dec').disabled).toBe(false);
		typePool(content, '10');
		expect(ctl<HTMLButtonElement>(content, 'pool.stamina.inc').disabled).toBe(false);
		expect(ctl<HTMLButtonElement>(content, 'pool.stamina.dec').disabled).toBe(false);
		typePool(content, '0');
		expect(ctl<HTMLButtonElement>(content, 'pool.stamina.dec').disabled).toBe(true); // at the floor
		expect(ctl<HTMLButtonElement>(content, 'pool.stamina.inc').disabled).toBe(false);
	});

	test('the stepper shows "/ 20" beside the value and starts on the group\'s pool', async () => {
		const { content } = await open({ pool: 13, dead: 1 });
		expect(poolInput(content).value).toBe('13');
		expect(content.querySelector('.dse-sedit__max')!.textContent).toBe('/ 20');
	});

	test('a step sequence reads back as one net pending change: 20 - 1 - 1 + 1 = 19', async () => {
		const { content, group } = await open();
		click(content, 'pool.stamina.dec');
		click(content, 'pool.stamina.dec');
		click(content, 'pool.stamina.inc');
		expect(poolInput(content).value).toBe('19');
		expect(apply(content).textContent).toBe('Deal 1 damage');
		apply(content).click();
		expect(group.minion_stamina_pool).toBe(19);
	});

	test('a typed draft that equals the current pool leaves Apply disabled', async () => {
		const { content } = await open({ pool: 12, dead: 2 });
		typePool(content, '12');
		expect(apply(content).disabled).toBe(true);
		expect(apply(content).textContent).toBe('No Stamina Change');
	});
});

// --------------------------------------------------------------------------- the Apply Damage row

describe('the Apply Damage row: damage per minion x minions hit', () => {
	interface Hit {
		name: string;
		spec: Squad;
		damage: string;
		minions: string;
		/** The pool the stepper then shows. */
		pool: string;
		/** What the minion-count box reads after the press. */
		count: string;
		/** The Apply label. */
		label: string;
	}
	const rows: Hit[] = [
		{ name: '3 damage x 1 minion', spec: {}, damage: '3', minions: '1', pool: '17', count: '1', label: 'Deal 3 damage' },
		{ name: '2 damage x 3 minions is 6, one kill', spec: {}, damage: '2', minions: '3', pool: '14', count: '3', label: 'Deal 6 damage, kill 1 minion(s)' },
		{ name: '0 minions hit is a no-op and the box says 0', spec: {}, damage: '5', minions: '0', pool: '20', count: '0', label: 'No Stamina Change' },
		{ name: '0 damage is a no-op', spec: {}, damage: '0', minions: '3', pool: '20', count: '3', label: 'No Stamina Change' },
		{ name: 'more minions than live ones caps at 5', spec: {}, damage: '1', minions: '9', pool: '15', count: '5', label: 'Deal 5 damage, kill 1 minion(s)' },
		{ name: 'with 2 dead the cap is 3', spec: { pool: 12, dead: 2 }, damage: '2', minions: '5', pool: '6', count: '3', label: 'Deal 6 damage, kill 1 minion(s)' },
		{ name: 'a negative count is the same as 0', spec: {}, damage: '4', minions: '-2', pool: '20', count: '0', label: 'No Stamina Change' },
		{ name: 'a negative damage is the same as 0', spec: {}, damage: '-4', minions: '2', pool: '20', count: '2', label: 'No Stamina Change' },
		{ name: 'exponent form reads as a number: 1e1 x 1 = 10', spec: {}, damage: '1e1', minions: '1', pool: '10', count: '1', label: 'Deal 10 damage, kill 2 minion(s)' },
		{ name: 'decimals truncate: 2.9 x 2 = 4', spec: {}, damage: '2.9', minions: '2', pool: '16', count: '2', label: 'Deal 4 damage, kill 1 minion(s)' },
		{ name: 'overkill: 99 x 5 empties the pool, kills everyone', spec: {}, damage: '99', minions: '5', pool: '0', count: '5', label: 'Deal 20 damage, kill 5 minion(s)' },
	];
	test.each(rows)('$name', async (r) => {
		const { content } = await open(r.spec);
		dealDamage(content, r.damage, r.minions);
		expect(poolInput(content).value).toBe(r.pool);
		expect(ctl<HTMLInputElement>(content, 'pool.minion-count').value).toBe(r.count);
		expect(apply(content).textContent).toBe(r.label);
	});

	test('two presses add up: 3 x 1 then 2 x 2 is 7 damage', async () => {
		const { content } = await open();
		dealDamage(content, '3', '1');
		dealDamage(content, '2', '2');
		expect(poolInput(content).value).toBe('13');
		expect(apply(content).textContent).toBe('Deal 7 damage, kill 1 minion(s)');
	});

	test('the count box caps at the LIVING minions (its max), and starts at 1 with damage 0', async () => {
		const full = await open();
		expect(ctl<HTMLInputElement>(full.content, 'pool.minion-count').max).toBe('5');
		expect(ctl<HTMLInputElement>(full.content, 'pool.minion-count').value).toBe('1');
		expect(ctl<HTMLInputElement>(full.content, 'pool.damage-amount').value).toBe('0');
		document.body.innerHTML = '';
		const hurt = await open({ pool: 8, dead: 3 });
		expect(ctl<HTMLInputElement>(hurt.content, 'pool.minion-count').max).toBe('2');
	});

	// SC-566: overkill through the Apply Damage row. The pool cannot lose more than it holds, so the label and the
	// info line should state the 20 damage Apply will write, as StaminaEditModal's label does (SC-427 R3-F5).
	test('SC-566: 99 damage x 5 minions on a pool of 20 labels and explains the clamped 20 damage, not 495', async () => {
		const { content } = await open();
		dealDamage(content, '99', '5');
		expect(poolInput(content).value).toBe('0'); // setup: the stepper already shows the clamp
		expect(apply(content).textContent).toBe('Deal 20 damage, kill 5 minion(s)');
		expect(info(content).textContent).toBe(`20 damage will kill 5 minion(s).${SEL(5)}`);
	});

	// SC-566: the same clamp on a squad that already lost minions: the pool holds 6, so 99 x 2 loses 6, not 198.
	test('SC-566: overkill on a hurt squad (pool 6, 2 alive) labels the 6 damage the pool holds', async () => {
		const { content, group } = await open({ pool: 6, dead: 3 });
		dealDamage(content, '99', '2');
		expect(apply(content).textContent).toBe('Deal 6 damage, kill 2 minion(s)');
		expect(info(content).textContent).toBe(`6 damage will kill 2 minion(s).${SEL(2)}`);
		apply(content).click(); // Apply's written result is unchanged
		expect(group.minion_stamina_pool).toBe(0);
	});

	// SC-566 r3 (LOW-1): a hand-edited NEGATIVE pool (no write path produces one) must not flip the sign: the label and
	// info line never show a negative or a heal-shaped amount for damage.
	test('SC-566: a hand-edited pool of -5 labels damage as 0, never a negative or sign-flipped amount', async () => {
		const { content } = await open({ pool: -5 });
		dealDamage(content, '3', '1');
		expect(apply(content).textContent).toBe('Deal 0 damage, kill 5 minion(s)');
		expect(info(content).textContent).toBe(`0 damage will kill 5 minion(s).${SEL(5)}`);
	});

	// SC-566 (heal side, the same label/info builders): a heal cannot be staged past the pool max either, so its label
	// already states the change Apply writes. A typed draft past the max is clamped by the stepper before the label sees it.
	test('SC-566: a heal label and info line state the change Apply writes, also for a typed draft past the max', async () => {
		const { content, group } = await open({ pool: 14, dead: 1 }); // 16 is the top of the living minions' share
		typePool(content, '15');
		expect(apply(content).textContent).toBe('Heal 1 stamina');
		expect(info(content).textContent).toBe('Heal 1 stamina; dead minions stay dead.');
		const el = poolInput(content);
		el.value = '99'; // a half-typed draft, not yet committed
		el.dispatchEvent(new Event('input', { bubbles: true }));
		expect(apply(content).textContent).toBe('Heal 6 stamina'); // 14 -> the max 20, never 85
		expect(info(content).textContent).toContain("(16 stamina)"); // refused past the share: the reason, not a count
		typePool(content, '16');
		expect(apply(content).textContent).toBe('Heal 2 stamina');
		apply(content).click();
		expect(group.minion_stamina_pool).toBe(16);
	});

	test('damage then a typed pool value: the typed value wins (the pending is rebuilt from the stepper)', async () => {
		const { content } = await open();
		dealDamage(content, '3', '1');
		typePool(content, '15');
		expect(apply(content).textContent).toBe('Deal 5 damage, kill 1 minion(s)');
	});

	test('damage after a staged heal nets against it', async () => {
		const { content } = await open({ pool: 12, dead: 2 });
		click(content, 'pool.stamina.inc'); // 13 is past the share: refused, but staged
		expect(apply(content).disabled).toBe(true);
		dealDamage(content, '1', '1'); // -1 on top of +1 = 0
		expect(apply(content).textContent).toBe('No Stamina Change');
		expect(info(content).hidden).toBe(true);
	});
});

// ------------------------------------------------------------------- kill boxes: hands, names, auto

describe('the kill boxes: ticks, name clicks, locks and the auto-check at a 0 pool', () => {
	test('one row per LIVING minion, labelled and named', async () => {
		const { content } = await open({ pool: 12, dead: 2 });
		const rows = all(content, 'pool.kill');
		expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Kill Goblin #3', 'Kill Goblin #4', 'Kill Goblin #5']);
		expect(all(content, 'pool.minion-name').map((n) => n.textContent)).toEqual(['Goblin #3', 'Goblin #4', 'Goblin #5']);
	});

	test('nothing owed: every box is locked open, a click on a locked box or its name does nothing', async () => {
		const { content } = await open();
		expect(boxes(content)).toBe('-----');
		tick(content, 0);
		click(content, 'pool.minion-name', 1);
		expect(boxes(content)).toBe('-----');
	});

	test('2 owed: ticking 1 leaves all open; ticking the 2nd locks the other three; unticking reopens them', async () => {
		const { content } = await open();
		typePool(content, '12');
		expect(boxes(content)).toBe('.....');
		tick(content, 1);
		expect(boxes(content)).toBe('.o...');
		expect(apply(content).disabled).toBe(true); // 1 of 2
		tick(content, 3);
		expect(boxes(content)).toBe('-o-o-');
		expect(apply(content).disabled).toBe(false);
		tick(content, 1); // untick
		expect(boxes(content)).toBe('...o.');
		expect(apply(content).disabled).toBe(true);
	});

	test('a click on a minion\'s NAME toggles its box, same rules as the box', async () => {
		const { content } = await open();
		typePool(content, '16'); // 1 owed
		click(content, 'pool.minion-name', 2);
		expect(boxes(content)).toBe('--o--');
		expect(apply(content).disabled).toBe(false);
		click(content, 'pool.minion-name', 0); // locked: no effect
		expect(boxes(content)).toBe('--o--');
		click(content, 'pool.minion-name', 2); // untick
		expect(boxes(content)).toBe('.....');
	});

	test('a pool at 0 ticks and locks everything; a name click cannot untick a locked box', async () => {
		const { content } = await open();
		typePool(content, '0');
		expect(boxes(content)).toBe('xxxxx');
		click(content, 'pool.minion-name', 0);
		tick(content, 2);
		expect(boxes(content)).toBe('xxxxx');
	});

	test('owed kills drop when the pending change shrinks: surplus ticks clear with the lock', async () => {
		const { content } = await open();
		typePool(content, '12'); // 2 owed
		tick(content, 0);
		tick(content, 1);
		typePool(content, '18'); // 0 owed: the ticks are cleared and everything locks
		expect(boxes(content)).toBe('-----');
		expect(apply(content).textContent).toBe('Deal 2 damage');
		expect(apply(content).disabled).toBe(false);
	});

	test('ticks survive a change that keeps them owed: 2 owed, tick #1, damage 1 more still owes 2', async () => {
		const { content } = await open();
		typePool(content, '12');
		tick(content, 0);
		click(content, 'pool.stamina.dec'); // 11: still floor(9/4) = 2 owed
		expect(boxes(content)).toBe('o....');
	});

	// SC-567 (owner: trim, not reword): the modal never shows more ticks than owed kills. At 0 owed every tick
	// clears; at 1+ owed the surplus ticks are unticked, the LATEST pick first, the user's earlier picks stay.
	describe('SC-567: fewer owed kills than ticks trims the latest picks', () => {
		test('2 owed, tick #1 then #2, drop to 1 owed: #2 is unticked, #1 stays, Apply is enabled with no "Select" tooltip', async () => {
			const { content } = await open();
			typePool(content, '12'); // 2 owed
			tick(content, 0);
			tick(content, 1);
			expect(boxes(content)).toBe('oo---');
			typePool(content, '16'); // 1 owed
			expect(boxes(content)).toBe('o----');
			expect(apply(content).disabled).toBe(false);
			expect(apply(content).textContent).toBe('Deal 4 damage, kill 1 minion(s)');
			expect(apply(content).getAttribute('title')).toBeNull();
			expect(info(content).textContent).toBe(`4 damage will kill 1 minion(s).${SEL(1)}`);
		});

		test('tick order, not row order: #4 then #1, drop to 1 owed: #4 (the first pick) stays, #1 goes', async () => {
			const { content } = await open();
			typePool(content, '12');
			tick(content, 3);
			tick(content, 0);
			expect(boxes(content)).toBe('o--o-');
			typePool(content, '16');
			expect(boxes(content)).toBe('---o-');
			expect(apply(content).disabled).toBe(false);
		});

		test('a name click is a pick too, and a re-tick after an untick is the LATEST pick', async () => {
			const { content } = await open();
			typePool(content, '12');
			tick(content, 0);
			click(content, 'pool.minion-name', 1); // #2 by name
			tick(content, 0); // untick #1
			tick(content, 0); // tick #1 again: now the latest, after #2
			expect(boxes(content)).toBe('oo---');
			typePool(content, '16');
			expect(boxes(content)).toBe('-o---'); // #2 was picked before #1's second tick
		});

		test('3 owed, 3 ticked, drop to 1 owed: only the earliest pick stays', async () => {
			const { content } = await open();
			typePool(content, '8'); // 3 owed
			tick(content, 2);
			tick(content, 0);
			tick(content, 4);
			expect(boxes(content)).toBe('o-o-o');
			typePool(content, '16'); // 1 owed
			expect(boxes(content)).toBe('--o--');
			expect(apply(content).disabled).toBe(false);
		});

		test('the Apply Damage row and the stepper trim the same way as typing', async () => {
			const { content } = await open();
			dealDamage(content, '4', '2'); // -8: pool 12, 2 owed
			tick(content, 0);
			tick(content, 1);
			expect(boxes(content)).toBe('oo---');
			click(content, 'pool.stamina.inc'); // pool 13: 1 owed
			expect(boxes(content)).toBe('o----');
			expect(apply(content).disabled).toBe(false);
		});

		test('draft: while the new pool value is still only typed, Apply already shows the post-commit state', async () => {
			const { content } = await open();
			typePool(content, '12'); // 2 owed
			tick(content, 0);
			tick(content, 1);
			const el = poolInput(content);
			el.value = '16'; // 1 owed once it lands; typed, not committed
			el.dispatchEvent(new Event('input', { bubbles: true }));
			expect(boxes(content)).toBe('oo---'); // the boxes are only re-derived at commit
			const draftState = { disabled: apply(content).disabled, label: apply(content).textContent, title: apply(content).getAttribute('title') };
			expect(draftState).toEqual({ disabled: false, label: 'Deal 4 damage, kill 1 minion(s)', title: null });
			el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); // commit
			expect(boxes(content)).toBe('o----');
			expect({ disabled: apply(content).disabled, label: apply(content).textContent, title: apply(content).getAttribute('title') }).toEqual(draftState);
		});

		test('raising the owed kills again does NOT re-tick a trimmed box', async () => {
			const { content } = await open();
			typePool(content, '12');
			tick(content, 0);
			tick(content, 1);
			typePool(content, '16'); // trims #2
			expect(boxes(content)).toBe('o----');
			typePool(content, '12'); // 2 owed again
			expect(boxes(content)).toBe('o....');
			expect(apply(content).disabled).toBe(true);
			expect(apply(content).getAttribute('title')).toBe('Select 2 minion(s) to kill');
		});

		test('0-pool auto ticks revert first, then the user\'s own ticks are trimmed to the new owed count', async () => {
			const { content } = await open();
			typePool(content, '12'); // 2 owed
			tick(content, 0);
			tick(content, 1);
			typePool(content, '0'); // the squad dies: everything ticks and locks
			expect(boxes(content)).toBe('xxxxx');
			typePool(content, '16'); // 1 owed: the modal's ticks revert, the user's two are trimmed to one
			expect(boxes(content)).toBe('o----');
			expect(apply(content).disabled).toBe(false);
		});

		test('0-pool round trip with fewer user ticks than owed: exactly the user\'s tick comes back', async () => {
			const { content } = await open();
			typePool(content, '12'); // 2 owed
			tick(content, 3);
			typePool(content, '0');
			typePool(content, '12');
			expect(boxes(content)).toBe('...o.');
			expect(apply(content).disabled).toBe(true);
		});

		test('Apply after a trim kills the earlier pick (#1) and writes the pool, not #2', async () => {
			const { content, minion, group, persist } = await open();
			typePool(content, '12');
			tick(content, 0);
			tick(content, 1);
			typePool(content, '16');
			apply(content).click();
			expect(minion.instances!.map((i) => i.isDead ?? false)).toEqual([true, false, false, false, false]);
			expect(group.minion_stamina_pool).toBe(16);
			expect(persist).toHaveBeenCalledTimes(1);
		});

		test('the invariant: neither a disabled Apply nor the info line asks for fewer kills than are already ticked', async () => {
			const { content } = await open();
			typePool(content, '12'); // 2 owed
			tick(content, 0);
			tick(content, 1);
			expect(apply(content).disabled).toBe(false); // setup: 2 owed, 2 ticked
			typePool(content, '16'); // 1 owed
			expect(apply(content).textContent).toBe('Deal 4 damage, kill 1 minion(s)'); // setup: the second commit happened (true under either fix)
			const ticked = all<HTMLInputElement>(content, 'pool.kill').filter((b) => b.checked).length;
			const asked = /^Select (\d+) minion\(s\) to kill$/.exec(apply(content).getAttribute('title') ?? '');
			if (apply(content).disabled && asked) expect(Number(asked[1])).toBeGreaterThan(ticked);
			const told = /Select (\d+) minion\(s\) to kill\./.exec(info(content).textContent ?? '');
			if (told) expect(Number(told[1])).toBeGreaterThanOrEqual(ticked); // the info line says "Select 1" with 2 ticked today
		});

		test('Reset clears the pick order: ticks after a Reset are the first picks of the new session', async () => {
			const { content } = await open();
			typePool(content, '12');
			tick(content, 3);
			click(content, 'pool.reset');
			typePool(content, '12');
			tick(content, 0);
			tick(content, 1);
			typePool(content, '16');
			expect(boxes(content)).toBe('o----');
		});
	});
});

// ----------------------------------------------------------------------------------------- Reset

describe('Reset: back to the opening state from every pending state', () => {
	interface From {
		name: string;
		spec: Squad;
		go: (c: Content) => void;
	}
	const rows: From[] = [
		{ name: 'a stepped damage', spec: {}, go: (c) => click(c, 'pool.stamina.dec') },
		{ name: 'a typed pool value that owes kills (one ticked)', spec: {}, go: (c) => { typePool(c, '12'); tick(c, 0); } },
		{ name: 'an Apply Damage press', spec: {}, go: (c) => dealDamage(c, '3', '2') },
		{ name: 'the squad emptied (every box auto-ticked)', spec: {}, go: (c) => typePool(c, '0') },
		{ name: 'a refused heal', spec: { pool: 12, dead: 2 }, go: (c) => typePool(c, '15') },
		{ name: 'a heal inside the share', spec: { pool: 10, dead: 2 }, go: (c) => click(c, 'pool.stamina.inc') },
	];
	test.each(rows)('$name', async (r) => {
		const { content, modal } = await open(r.spec);
		const opening = poolInput(content).value;
		r.go(content);
		expect(apply(content).textContent).not.toBe('No Stamina Change');
		click(content, 'pool.reset');
		expect(poolInput(content).value).toBe(opening);
		expect(apply(content).textContent).toBe('No Stamina Change');
		expect(apply(content).disabled).toBe(true);
		expect(apply(content).hasAttribute('title')).toBe(false);
		expect(info(content).hidden).toBe(true);
		expect(warn(content).hidden).toBe(true);
		expect(boxes(content)).toBe('-'.repeat(all(content, 'pool.kill').length));
		expect(ctl<HTMLInputElement>(content, 'pool.damage-amount').value).toBe('0');
		expect(ctl<HTMLInputElement>(content, 'pool.minion-count').value).toBe('1');
		expect((modal as any).pendingStaminaChange).toBe(0);
	});

	test('Reset writes nothing and leaves the modal open', async () => {
		const { content, persist } = await open();
		typePool(content, '10');
		click(content, 'pool.reset');
		expect(persist).not.toHaveBeenCalled();
		expect(content.isConnected).toBe(true);
	});
});

// ----------------------------------------------------------------------------------------- Apply

describe('Apply: what it persists, once, then closes', () => {
	test('damage with no kill: the pool drops, nobody dies, one persist, the modal closes', async () => {
		const { content, group, minion, persist } = await open();
		dealDamage(content, '3', '1');
		apply(content).click();
		expect(group.minion_stamina_pool).toBe(17);
		expect(minion.instances!.filter((i) => i.isDead)).toHaveLength(0);
		expect(persist).toHaveBeenCalledTimes(1);
		expect(document.querySelector('.dse-modal')).toBeNull();
	});

	test('a kill: exactly the ticked minions die (#2 and #4), the pool lands on the typed value', async () => {
		const { content, group, minion, persist } = await open();
		typePool(content, '12');
		tick(content, 1);
		tick(content, 3);
		apply(content).click();
		expect(group.minion_stamina_pool).toBe(12);
		expect(minion.instances!.map((i) => !!i.isDead)).toEqual([false, true, false, true, false]);
		expect(persist).toHaveBeenCalledTimes(1);
	});

	test('the whole squad: pool 0, all five dead', async () => {
		const { content, group, minion } = await open();
		typePool(content, '0');
		apply(content).click();
		expect(group.minion_stamina_pool).toBe(0);
		expect(minion.instances!.every((i) => i.isDead)).toBe(true);
	});

	test('with 2 already dead, a kill marks one of the three living; the dead stay dead', async () => {
		const { content, group, minion } = await open({ pool: 12, dead: 2 });
		typePool(content, '8');
		tick(content, 2); // Goblin #5
		apply(content).click();
		expect(group.minion_stamina_pool).toBe(8);
		expect(minion.instances!.map((i) => !!i.isDead)).toEqual([true, true, false, false, true]);
	});

	test('a heal inside the share raises the pool and revives nobody', async () => {
		const { content, group, minion } = await open({ pool: 10, dead: 2 });
		click(content, 'pool.stamina.inc');
		apply(content).click();
		expect(group.minion_stamina_pool).toBe(11);
		expect(minion.instances!.filter((i) => i.isDead)).toHaveLength(2);
	});

	test('a typed draft still in the field when Apply is pressed lands first, once', async () => {
		const { content, group, persist } = await open();
		poolInput(content).value = '18';
		poolInput(content).dispatchEvent(new Event('input', { bubbles: true })); // typed, no Enter, no blur
		expect(apply(content).textContent).toBe('Deal 2 damage');
		apply(content).click();
		expect(group.minion_stamina_pool).toBe(18);
		expect(persist).toHaveBeenCalledTimes(1);
	});

	test('Apply is a no-op while disabled: no kills selected for a damage that owes one', async () => {
		const { content, group, persist } = await open();
		typePool(content, '16');
		apply(content).click();
		expect(group.minion_stamina_pool).toBe(20); // untouched: still the parse default (the full pool)
		expect(persist).not.toHaveBeenCalled();
		expect(content.isConnected).toBe(true);
	});

	test('a captain-bonus squad keeps its max: damage lands against 40, not 20', async () => {
		const { content, group, minion } = await open({ pool: 40, bonus: { n: 4, poolMax: 40 } });
		expect(content.querySelector('.dse-sedit__max')!.textContent).toBe('/ 40');
		typePool(content, '32'); // one (8) minion
		tick(content, 0);
		apply(content).click();
		expect(group.minion_stamina_pool).toBe(32);
		expect(minion.instances![0].isDead).toBe(true);
	});
});

// --------------------------------------------------------------------------- condition removal

describe('condition icons: a click removes that condition and saves at once', () => {
	const grabbed = 'grabbed';
	const bleeding: Condition = { key: 'bleeding', color: 'crimson' };

	test('one icon per known condition, named "Remove <display name>"', async () => {
		const { content } = await open({ conditions: { 1: [grabbed, bleeding], 2: ['dazed'] } });
		const icons = all(content, 'pool.condition');
		expect(icons.map(conditionName)).toEqual(['Grabbed', 'Bleeding', 'Dazed']);
	});

	test('removing the first of two conditions keeps the other, rebuilds the row, persists once', async () => {
		const { content, minion, persist } = await open({ conditions: { 0: [grabbed, bleeding] } });
		click(content, 'pool.condition', 0);
		expect(minion.instances![0].conditions).toEqual([bleeding]);
		expect(all(content, 'pool.condition').map(conditionName)).toEqual(['Bleeding']);
		expect(persist).toHaveBeenCalledTimes(1);
	});

	test('removing the last condition empties the row', async () => {
		const { content, minion, persist } = await open({ conditions: { 3: [bleeding] } });
		click(content, 'pool.condition', 0);
		expect(minion.instances![3].conditions).toEqual([]);
		expect(all(content, 'pool.condition')).toHaveLength(0);
		expect(persist).toHaveBeenCalledTimes(1);
	});

	test('each click saves: two removals, two persists; the pool is untouched and the modal stays open', async () => {
		const { content, group, persist } = await open({ conditions: { 0: [grabbed], 4: ['dazed'] } });
		click(content, 'pool.condition', 0);
		click(content, 'pool.condition', 0); // the second icon is now the first
		expect(persist).toHaveBeenCalledTimes(2);
		expect(group.minion_stamina_pool).toBe(20);
		expect(content.isConnected).toBe(true);
	});

	test('a condition removed before damage: the pending damage survives it, and Apply persists again', async () => {
		const { content, persist } = await open({ conditions: { 0: [grabbed] } });
		dealDamage(content, '3', '1');
		click(content, 'pool.condition', 0);
		expect(apply(content).textContent).toBe('Deal 3 damage');
		expect(poolInput(content).value).toBe('17');
		apply(content).click();
		expect(persist).toHaveBeenCalledTimes(2);
	});

	test('a dead minion has no row, so its conditions have no icon', async () => {
		const { content } = await open({ dead: 1, conditions: { 0: [grabbed], 1: ['dazed'] } });
		expect(all(content, 'pool.condition').map(conditionName)).toEqual(['Dazed']);
	});

	// SC-572 (a11y): the icon is a real <button>. The keyboard half (Tab reaches it, Enter and Space remove it) is
	// the e2e scenario POOL-C04 / POOL-C05 (jsdom does not turn a key into a click on a button); here the DOM facts
	// a screen reader needs, and that a native button is what carries Enter and Space.
	test('SC-572: a condition icon is a native, focusable button named "Remove <condition>"', async () => {
		const { content } = await open({ conditions: { 0: ['grabbed', { key: 'bleeding', color: 'crimson' } as Condition] } });
		const icons = all<HTMLButtonElement>(content, 'pool.condition');
		expect(icons.map((i) => i.tagName)).toEqual(['BUTTON', 'BUTTON']);
		expect(icons.map((i) => i.type)).toEqual(['button', 'button']);
		expect(icons.map((i) => i.getAttribute('aria-label'))).toEqual(['Remove Grabbed', 'Remove Bleeding']);
		expect(icons.map((i) => i.hasAttribute('title'))).toEqual([false, false]); // aria-label is the hover tooltip: no second one
		expect(icons.map((i) => i.disabled || i.getAttribute('tabindex') === '-1')).toEqual([false, false]);
		expect(icons.map((i) => i.classList.contains('condition-icon'))).toEqual([true, true]);
	});

	// SC-572 r3: jsdom does not turn a key into a click on a native button (the real Enter/Space removal is e2e
	// POOL-C04/C05), so what is checked here is the other half: a key that is not Enter or Space does nothing.
	test('SC-572: keys that are not Enter or Space leave the condition alone', async () => {
		const { content, minion, persist } = await open({ conditions: { 0: ['grabbed', 'dazed'] } });
		const icon = ctl(content, 'pool.condition');
		for (const key of ['a', 'Delete', 'Backspace', 'ArrowRight', 'Tab']) {
			icon.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
			icon.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
		}
		expect(minion.instances![0].conditions).toEqual(['grabbed', 'dazed']);
		expect(persist).not.toHaveBeenCalled();
	});

	// SC-572 r3: a keyboard removal rebuilds the row, which destroys the focused button; focus must not fall to <body>
	// (the Conditions modal's MED-3 rule). A keyboard click has `detail === 0`; a pointer click has `detail >= 1`.
	describe('focus after a removal', () => {
		const press = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
		const tap = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));

		test('keyboard: focus lands on the icon that took the removed one\'s slot', async () => {
			const { content } = await open({ conditions: { 0: ['grabbed', bleeding, 'dazed'] } });
			press(ctl(content, 'pool.condition', 1)); // the middle one: the next one shifts into slot 1
			expect(all(content, 'pool.condition').map(conditionName)).toEqual(['Grabbed', 'Dazed']);
			expect(document.activeElement).toBe(ctl(content, 'pool.condition', 1));
		});

		test('keyboard: removing the last icon of the row focuses the one before it', async () => {
			const { content } = await open({ conditions: { 0: ['grabbed', 'dazed'] } });
			press(ctl(content, 'pool.condition', 1));
			expect(document.activeElement).toBe(ctl(content, 'pool.condition', 0));
		});

		test('keyboard: removing the only icon focuses the damage field — not <body>, not a footer button', async () => {
			const { content } = await open({ conditions: { 0: ['grabbed'] } });
			press(ctl(content, 'pool.condition'));
			expect(all(content, 'pool.condition')).toHaveLength(0);
			expect(document.activeElement).toBe(ctl(content, 'pool.damage-amount'));
			expect((document.activeElement as HTMLElement).closest('.dse-sedit__footer')).toBeNull();
		});

		test('pointer: a mouse click moves focus nowhere (unchanged behaviour)', async () => {
			const { content } = await open({ conditions: { 0: ['grabbed', 'dazed'] } });
			const before = document.activeElement; // wherever the modal put focus on open (a click does not focus the button in jsdom)
			tap(ctl(content, 'pool.condition', 0));
			expect(all(content, 'pool.condition')).toHaveLength(1);
			expect(document.activeElement).toBe(before);
			expect((document.activeElement as HTMLElement).matches('.condition-icon')).toBe(false);
		});
	});
});

// ----------------------------------------------------------------------- several squads in one group

describe('a group holding two minion squads: each modal reads and writes ITS squad\'s pool (SC-183 r3)', () => {
	async function twoSquads() {
		const app = new App();
		const yaml = [
			'heroes:', '  - name: "Aragorn"', '    max_stamina: 120',
			'enemy_groups:', '  - name: "Wolves"', '    is_squad: true', '    creatures:',
			'      - name: "Flow"', '        max_stamina: 6', '        amount: 4', '        squad_role: minion', '        minion_stamina_pool: 15',
			'      - name: "Downpour"', '        max_stamina: 6', '        amount: 4', '        squad_role: minion', '        minion_stamina_pool: 24',
		].join('\n');
		const data = await parseEncounterData(yaml, app as any, DEFAULT_SETTINGS);
		const group = data.enemy_groups[0];
		const openFor = (creature: Creature) => {
			const persist = jest.fn();
			const modal = new MinionStaminaPoolModal(app as any, group, creature, persist);
			modal.open();
			return { content: (modal as any).contentEl as HTMLElement, persist };
		};
		return { group, flow: group.creatures[0], downpour: group.creatures[1], openFor };
	}

	test('each modal opens on its own pool (15 and 24), with its own minions\' rows', async () => {
		const { flow, downpour, openFor } = await twoSquads();
		const a = openFor(flow);
		expect(poolInput(a.content).value).toBe('15');
		expect(all(a.content, 'pool.minion-name').map((n) => n.textContent)).toEqual(['Flow #1', 'Flow #2', 'Flow #3', 'Flow #4']);
		document.body.innerHTML = '';
		const b = openFor(downpour);
		expect(poolInput(b.content).value).toBe('24');
		expect(all(b.content, 'pool.minion-name').map((n) => n.textContent)).toEqual(['Downpour #1', 'Downpour #2', 'Downpour #3', 'Downpour #4']);
	});

	test('Apply on the second squad changes only that squad: the first squad\'s pool and the group stay as they were', async () => {
		const { group, flow, downpour, openFor } = await twoSquads();
		const { content, persist } = openFor(downpour);
		typePool(content, '20'); // 4 damage: under a 6-Stamina minion, nobody owed
		apply(content).click();
		expect(downpour.minion_stamina_pool).toBe(20);
		expect(flow.minion_stamina_pool).toBe(15);
		expect(group.minion_stamina_pool).toBeUndefined();
		expect(persist).toHaveBeenCalledTimes(1);
	});
});

// ------------------------------------------------------------------------------------ known bugs

describe('known bugs (test.failing: each FAILS once its ticket is fixed, then drop the marker)', () => {
	// SC-573: a pool at 0 with a minion still alive (reachable: a relieved captain's bonus comes off the pool, clamped at 0).
	test.failing('SC-573: a pool at 0 with living minions leaves Apply reachable so they can be killed', async () => {
		const { content } = await open({ pool: 0 });
		expect(poolInput(content).value).toBe('0'); // setup
		expect(all(content, 'pool.kill')).toHaveLength(5); // setup: five living minions
		expect(apply(content).disabled).toBe(false);
	});

	// SC-574 (a): a condition the registry does not know ("on-fire") is on the minion but not shown here.
	test.failing('SC-574 (a): a custom condition is shown in the modal and a click removes it', async () => {
		const { content, minion, persist } = await open({ conditions: { 0: ['on-fire'] } });
		expect(minion.instances![0].conditions).toHaveLength(1); // setup: the minion carries it
		expect(all(content, 'pool.condition')).toHaveLength(1);
		click(content, 'pool.condition');
		expect(minion.instances![0].conditions).toEqual([]);
		expect(persist).toHaveBeenCalledTimes(1);
	});

	// SC-574 (b): `filter((entry) => entry !== clicked)` compares strings by value.
	test.failing('SC-574 (b): one click on a duplicated string condition removes one copy', async () => {
		const { content, minion } = await open({ conditions: { 0: ['grabbed', 'grabbed', 'dazed'] } });
		expect(all(content, 'pool.condition').map(conditionName)).toEqual(['Grabbed', 'Grabbed', 'Dazed']); // setup
		click(content, 'pool.condition', 0);
		expect(minion.instances![0].conditions).toEqual(['grabbed', 'dazed']);
	});
});
