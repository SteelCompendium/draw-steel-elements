// SC-408 P2b — L1 (jsdom) logic for the stamina surfaces' ENTRY POINTS that the older
// suites leave uncovered: the ds-hero sheet (unresolved class, Spend Recovery gating,
// Catch Breath at full), the initiative tracker (grid dblclick on the selected instance,
// the DEAD squad-minion detail control) and ds-stamina write coalescing. Row ids
// ([E06], [E12], [E16], [Q14], [R03], [W02]) are the S1 inventory's
// (.superpowers/sdd/sc408/sc408-s1-stamina-inventory.md section 2).
//
// Known-bug convention (SC-408 ledger): a test of the CORRECT behaviour that fails today
// because of a filed bug is a `test.failing` citing the ticket; it fails once the bug is
// fixed so the marker gets removed. (The [R03] Catch Breath markers here were flipped to
// plain tests by SC-428.)
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { heroElement } from '../../../src/elements/hero/definition';
import { initiativeElement } from '../../../src/elements/initiative/definition';
import { staminaBarElement } from '../../../src/elements/stamina-bar/definition';
import { parseYaml } from '../../mocks/obsidian';
import { makeCompendiumDeps, loadMdDseFixture } from './_refHarness';
import { stubService } from './rollTestHelpers';
import { applyBtn, lastModal, lastWrite, makeDeps, makeHost, spendRecoveryBtn, tempInput, typeCommit } from '../_staminaHarness';
import quickStart from '../../fixtures/initiative/quick-start.yaml';

// The hero sheet's "Edit definition" pulls in the form editor; the stamina paths do not.
jest.mock('../../../src/authoring/FormModal', () => ({ openFormEditor: jest.fn() }));

afterEach(() => {
	jest.useRealTimers();
	document.body.innerHTML = '';
});

// ------------------------------------------------------------------ ds-hero host

const FURY = 'scc.v1:mcdm.heroes.v1/class/fury'; // resolves: max Stamina 48, Recoveries 12 / value 16
const NO_SUCH_CLASS = 'scc.v1:mcdm.heroes.v1/class/no-such-class'; // does not resolve: max unavailable

function heroSource(cls: string, current: number, recoveries = 6): string {
	return `name: Torin Stonefist
level: 3
ancestry: scc.v1:mcdm.heroes.v1/ancestry/dwarf
class: ${cls}
kits: [scc.v1:mcdm.heroes.v1/kit/mountain]
characteristics: { might: 2, agility: 2, reason: -1, intuition: 0, presence: 1 }
state:
  stamina: { current: ${current}, temp: 0 }
  recoveries: ${recoveries}
`;
}

function heroDeps(): ElementPipelineDeps {
	const { deps, vault } = makeCompendiumDeps();
	loadMdDseFixture(vault, 'class/fury.md');
	loadMdDseFixture(vault, 'kit/mountain.md');
	loadMdDseFixture(vault, 'ancestry/dwarf.md');
	return { ...deps, roll: stubService([5, 6]) };
}

async function mountHero(source: string) {
	jest.useFakeTimers();
	const host = makeHost('ds-hero');
	await new ElementPipeline(heroDeps()).run(heroElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	const staminaRegion = root.querySelector<HTMLElement>('[data-dse-hero-region="stamina"]')!;
	return { host, root, staminaRegion };
}

/** The hero's persisted play state, parsed back out of the last written block. */
const heroState = (host: { replaceSource: jest.Mock }) => parseYaml(lastWrite(host)!).state as { stamina: { current: number; temp: number }; recoveries: number };

const heroBar = (region: HTMLElement) => region.querySelector<HTMLElement>('.dse-stamina')!;
const heroCatchBreath = (region: HTMLElement) => region.querySelector<HTMLButtonElement>('button:has([data-icon="wind"])')!;

describe('[E06] ds-hero with an unresolved class (max Stamina unavailable)', () => {
	test('the bar still opens the modal, showing "/ 0" as its max', async () => {
		const { staminaRegion } = await mountHero(heroSource(NO_SUCH_CLASS, 31));
		expect(heroBar(staminaRegion).hasClass('dse-stamina--clickable')).toBe(true);
		heroBar(staminaRegion).click();
		const modal = lastModal();
		expect(modal.querySelector('.dse-sedit__max')?.textContent).toContain('0');
		expect(modal.querySelector('button[aria-label="Damage"]')).not.toBeNull();
	});

	test.failing('[E06] Damage 5 then Apply persists current 26, never 0 [known bug SC-425]', async () => {
		const { host, staminaRegion } = await mountHero(heroSource(NO_SUCH_CLASS, 31));
		heroBar(staminaRegion).click();
		const modal = lastModal();
		modal.querySelector<HTMLInputElement>('.dse-sedit__apply-input')!.value = '5';
		modal.querySelector<HTMLButtonElement>('button[aria-label="Damage"]')!.click();
		expect(applyBtn(modal).textContent).toBe('Lose 5 Stamina'); // the label is right today
		applyBtn(modal).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(heroState(host).stamina).toEqual({ current: 26, temp: 0 });
	});

	test.failing('[E06] Full Heal then Apply does not write current 0 [known bug SC-425]', async () => {
		const { host, staminaRegion } = await mountHero(heroSource(NO_SUCH_CLASS, 31));
		heroBar(staminaRegion).click();
		const modal = lastModal();
		modal.querySelector<HTMLButtonElement>('button[aria-label="Full Heal"]')!.click();
		applyBtn(modal).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(heroState(host).stamina.current).not.toBe(0);
	});
});

describe('[Q14] ds-hero: Spend Recovery is rendered only when the sheet tracks a Recoveries pool', () => {
	test('resolved class (pool tracked): the control is in the modal', async () => {
		const { staminaRegion } = await mountHero(heroSource(FURY, 31));
		heroBar(staminaRegion).click();
		expect(spendRecoveryBtn(lastModal())).not.toBeNull();
	});

	test('unresolved class (no pool): the control is NOT rendered, the other quick actions are', async () => {
		const { staminaRegion } = await mountHero(heroSource(NO_SUCH_CLASS, 31));
		heroBar(staminaRegion).click();
		const modal = lastModal();
		expect(spendRecoveryBtn(modal)).toBeNull();
		for (const label of ['Damage', 'Healing', 'Kill', 'Full Heal']) {
			expect(modal.querySelector(`button[aria-label="${label}"]`)).not.toBeNull();
		}
	});
});

describe('[R01][R02][R03] ds-hero Catch Breath across positions (resolved fury, recovery value 16)', () => {
	test.each([
		{ name: 'mid stamina, Recoveries left', cur: 31, rec: 6, enabled: true, after: 47 },
		{ name: 'heal capped at the gap to max (40 -> 48)', cur: 40, rec: 6, enabled: true, after: 48 },
		{ name: 'zero Recoveries', cur: 31, rec: 0, enabled: false, after: 31 },
		{ name: 'dying at 0', cur: 0, rec: 6, enabled: false, after: 0 },
	])('$name (cur $cur, rec $rec) -> enabled: $enabled', async ({ cur, rec, enabled, after }) => {
		const { host, staminaRegion } = await mountHero(heroSource(FURY, cur, rec));
		const cb = heroCatchBreath(staminaRegion);
		expect(cb.disabled).toBe(!enabled);
		cb.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		if (!enabled) {
			expect(host.replaceSource).not.toHaveBeenCalled();
			return;
		}
		expect(heroState(host).stamina).toEqual({ current: after, temp: 0 });
		expect(heroState(host).recoveries).toBe(rec - 1);
	});

	test('[R03] at full Stamina (48/48, 6 Recoveries) the button is disabled, with the reason as its tooltip (SC-428)', async () => {
		const { staminaRegion } = await mountHero(heroSource(FURY, 48));
		expect(heroCatchBreath(staminaRegion).disabled).toBe(true);
		expect(heroCatchBreath(staminaRegion).getAttribute('aria-label')).toBe('Already at maximum Stamina');
	});

	test('[R03] at full Stamina a click writes nothing and spends no Recovery (SC-428)', async () => {
		const { host, staminaRegion } = await mountHero(heroSource(FURY, 48));
		heroCatchBreath(staminaRegion).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

// ------------------------------------------------------------------ initiative host

async function mountInit(source: string) {
	jest.useFakeTimers();
	const host = makeHost('ds-initiative');
	await new ElementPipeline(makeDeps()).run(initiativeElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { host, root };
}

describe('[E12] grid dblclick on the SELECTED instance: the detail row must follow the edit', () => {
	// quick-start: Orc #1 (cell 0-1) is the selected instance shown in the detail row.
	async function editSelected() {
		const { host, root } = await mountInit(quickStart);
		const detailName = root.querySelector('.dse-init__detail .dse-init__name')!.textContent;
		const cell = root.querySelector('.dse-init__cell[data-instance-key="0-1"]') as HTMLElement;
		cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const modal = lastModal();
		typeCommit(modal.querySelector<HTMLInputElement>('.dse-stepper__input')!, '10');
		applyBtn(modal).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		return { host, root, cell, detailName };
	}

	test('what is right today: the edited cell and the persisted note carry 10', async () => {
		const { host, cell, detailName } = await editSelected();
		expect(detailName).toBe('Orc #1');
		expect(cell.querySelector('.dse-init__cell-stamina')!.textContent).toBe('10/40');
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(lastWrite(host)).toMatch(/current_stamina: 10/);
	});

	test('[E12] the detail-row readout shows 10/40', async () => {
		const { root } = await editSelected();
		expect(root.querySelector('.dse-init__detail .dse-init__stamina')!.textContent).toBe('10/40');
	});

	test('[E12] the detail-row bar shows 10', async () => {
		const { root } = await editSelected();
		expect(root.querySelector('.dse-init__detail .dse-init__bar .dse-stamina__ccur')!.textContent).toBe('10');
	});

	test('[E12] the detail-row state chip follows the edit (10/40 is Winded)', async () => {
		const { root } = await editSelected();
		const chip = root.querySelector('.dse-init__detail .dse-init__state')!;
		expect(chip.getAttribute('data-state')).toBe('winded');
		expect(chip.textContent).toBe('Winded');
	});

	test('[E12] Temp Stamina set from the cell reaches the detail-row readout and bar', async () => {
		const { root } = await mountInit(quickStart);
		const cell = root.querySelector('.dse-init__cell[data-instance-key="0-1"]') as HTMLElement;
		cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const modal = lastModal();
		typeCommit(tempInput(modal), '5');
		applyBtn(modal).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(cell.querySelector('.dse-init__cell-stamina')!.textContent).toBe('40(+5)/40');
		expect(root.querySelector('.dse-init__detail .dse-init__stamina')!.textContent).toBe('40(+5)/40');
		expect(root.querySelector('.dse-init__detail .dse-init__bar .dse-stamina__ctemp')!.textContent).toBe('+5');
	});

	test('control: dblclick on a NON-selected instance (0-2) leaves the detail row (Orc #1) alone', async () => {
		const { host, root } = await mountInit(quickStart);
		const before = root.querySelector('.dse-init__detail .dse-init__stamina')!.textContent;
		const cell = root.querySelector('.dse-init__cell[data-instance-key="0-2"]') as HTMLElement;
		cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const modal = lastModal();
		typeCommit(modal.querySelector<HTMLInputElement>('.dse-stepper__input')!, '25');
		applyBtn(modal).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(cell.querySelector('.dse-init__cell-stamina')!.textContent).toBe('25/40');
		expect(root.querySelector('.dse-init__detail .dse-init__stamina')!.textContent).toBe(before);
		expect(root.querySelector('.dse-init__detail .dse-init__bar .dse-stamina__ccur')!.textContent).toBe('40');
		expect(root.querySelector('.dse-init__detail .dse-init__state')!.getAttribute('data-state')).toBe('healthy');
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
	});
});

const SQUAD_WITH_DEAD = `heroes:
  - name: "Aragorn"
    max_stamina: 120
enemy_groups:
  - name: "Goblin Squad"
    is_squad: true
    minion_stamina_pool: 12
    creatures:
      - name: "Goblin"
        max_stamina: 4
        amount: 5
        squad_role: minion
        instances:
          - id: 1
          - id: 2
            isDead: true
          - id: 3
          - id: 4
          - id: 5
malice:
  value: 0
`;

describe('[E16] the DEAD squad-minion detail control opens the squad pool modal', () => {
	test('select the dead minion, click its "DEAD" readout: the pool modal opens (not the single-creature modal)', async () => {
		const { root } = await mountInit(SQUAD_WITH_DEAD);
		(root.querySelector('.dse-init__cell[data-instance-key="0-2"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const detail = root.querySelector('.dse-init__detail .dse-init__stamina') as HTMLElement;
		expect(detail.textContent).toBe('DEAD');
		expect(detail.getAttribute('data-state')).toBe('dead');
		detail.click();
		const modal = lastModal();
		expect(modal.querySelector('.dse-sedit__minions')).not.toBeNull(); // the pool modal's minion section
		expect(modal.querySelector('.dse-stepper__input')).not.toBeNull();
		expect(modal.querySelector('button[aria-label="Apply Damage"]')).not.toBeNull();
		expect(modal.querySelector('button[aria-label="Spend Recovery"]')).toBeNull(); // not StaminaEditModal
	});

	test('read-only (canPersist false): the DEAD readout is inert and no modal opens', async () => {
		jest.useFakeTimers();
		const host = makeHost('ds-initiative', { canPersist: false });
		await new ElementPipeline(makeDeps()).run(initiativeElement, SQUAD_WITH_DEAD, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		(root.querySelector('.dse-init__cell[data-instance-key="0-2"]') as HTMLElement).click();
		const modalsBefore = document.querySelectorAll('.dse-modal').length;
		(root.querySelector('.dse-init__detail .dse-init__stamina') as HTMLElement).click();
		expect(document.querySelectorAll('.dse-modal').length).toBe(modalsBefore);
	});
});

// ------------------------------------------------------------------ ds-stamina host

describe('[W02] ds-stamina: two Applies inside one debounce window coalesce into ONE write carrying the second edit', () => {
	async function mountStam() {
		jest.useFakeTimers();
		const host = makeHost('ds-stam');
		await new ElementPipeline(makeDeps()).run(staminaBarElement, ['max_stamina: 20', 'current_stamina: 15'].join('\n'), host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		return { host, root, bar: root.querySelector('.dse-stamina') as HTMLElement };
	}
	const editTo = (value: string) => {
		const modal = lastModal();
		typeCommit(modal.querySelector<HTMLInputElement>('.dse-stepper__input')!, value);
		applyBtn(modal).click();
	};

	test('15 -> 12 -> 9 inside the window: one write, current_stamina 9', async () => {
		const { host, bar } = await mountStam();
		bar.click();
		editTo('12');
		bar.click();
		editTo('9');
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource.mock.calls.map((c) => (c[0] as string).match(/current_stamina: (-?\d+)/)?.[1])).toEqual(['9']);
	});

	test('two Applies separated by more than the window: two writes, in order', async () => {
		const { host, bar } = await mountStam();
		bar.click();
		editTo('12');
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		bar.click();
		editTo('9');
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource.mock.calls.map((c) => (c[0] as string).match(/current_stamina: (-?\d+)/)?.[1])).toEqual(['12', '9']);
	});
});

// ------------------------------------------------------------------ [F08] max undefined

describe('[F08] a missing max_stamina never reaches the modal (so the modal-level NaN is latent only)', () => {
	// StaminaEditModal would persist NaN for an undefined max, but no shipped host can pass
	// one: each rejects the block before any stamina control exists. These tests pin the
	// guards; if one is ever relaxed, the modal-level NaN becomes reachable.
	test('initiative: a creature with no max_stamina is an error card with no stamina control', async () => {
		const src = ['heroes: []', 'enemy_groups:', '  - name: "G"', '    creatures:', '      - name: "Blob"', '        amount: 1', '        current_stamina: 10'].join('\n');
		const { root } = await mountInit(src);
		expect(root.querySelector('.dse-error-card-message')!.textContent).toBe("Creature 'Blob' in group 'G' is missing or has an invalid 'max_stamina' field.");
		expect(root.querySelector('.dse-init__stamina')).toBeNull();
	});

	test('ds-stamina: a block with no max_stamina fails its schema (no bar, no modal)', async () => {
		const host = makeHost('ds-stam');
		await new ElementPipeline(makeDeps()).run(staminaBarElement, 'current_stamina: 10', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-error-stage')).toBe('schema');
		expect(root.textContent).toContain('max_stamina is required');
		expect(root.querySelector('.dse-stamina')).toBeNull();
	});
});
