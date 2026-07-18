// D7 Task 1 (spec §2.1/§2.3) — kit/CharacteristicsGrid: the `.dse-statgrid` builder
// lifted from characteristics/view.ts's onMount. This test pins the shared core's own
// DOM/behavior contract (the characteristics element test suite,
// test/dom/elements/characteristics.test.ts, pins that the ELEMENT still produces the
// exact same DOM through this core — unmodified by this task).
import { renderCharacteristicsGrid } from '../../../src/framework/kit/CharacteristicsGrid';

describe('D7 Task 1: kit/CharacteristicsGrid — renderCharacteristicsGrid', () => {
	test('renders ONE .dse-statgrid of five __cell (value over label) with signed scores', () => {
		const root = document.createElement('div');
		const grid = renderCharacteristicsGrid(root, {
			might: 2,
			agility: 1,
			reason: 0,
			intuition: -1,
			presence: 3,
		});

		expect(root.querySelectorAll('.dse-statgrid')).toHaveLength(1);
		expect(grid.hasClass('dse-statgrid')).toBe(true);

		const cells = grid.querySelectorAll('.dse-statgrid__cell');
		expect(cells).toHaveLength(5);
		for (const cell of Array.from(cells)) {
			const children = Array.from(cell.children).map((el) => el.className);
			expect(children).toEqual(['dse-statgrid__value', 'dse-statgrid__label']);
		}

		const values = Array.from(grid.querySelectorAll('.dse-statgrid__value')).map((el) => el.textContent);
		const labels = Array.from(grid.querySelectorAll('.dse-statgrid__label')).map((el) => el.textContent);
		expect(values).toEqual(['2', '1', '0', '-1', '3']);
		expect(labels).toEqual(['Might', 'Agility', 'Reason', 'Intuition', 'Presence']);
	});

	test('SC-5: value_height/name_height opts arrive as --dse-value-scale/--dse-label-scale setProperty geometry, never inline font-size', () => {
		const root = document.createElement('div');
		const grid = renderCharacteristicsGrid(
			root,
			{ might: 4, agility: 0, reason: 0, intuition: 0, presence: 0 },
			{ valueHeight: 2, nameHeight: 1 },
		);

		expect(grid.style.getPropertyValue('--dse-value-scale')).toBe('2');
		expect(grid.style.getPropertyValue('--dse-label-scale')).toBe('1');
		for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
			expect(el.style.fontSize).toBe('');
		}
	});

	test('onScoreClick is reserved and inert by default — omitting opts changes nothing about the DOM', () => {
		const root = document.createElement('div');
		renderCharacteristicsGrid(root, { might: 1, agility: 1, reason: 1, intuition: 1, presence: 1 });
		expect(root.querySelectorAll('.dse-statgrid__cell')).toHaveLength(5);
	});

	test('onScoreClick, when supplied, fires with the clicked characteristic', () => {
		const root = document.createElement('div');
		const onScoreClick = jest.fn();
		const grid = renderCharacteristicsGrid(
			root,
			{ might: 2, agility: 1, reason: 0, intuition: -1, presence: 3 },
			{ onScoreClick },
		);

		(grid.querySelectorAll('.dse-statgrid__cell')[0] as HTMLElement).dispatchEvent(
			new MouseEvent('click', { bubbles: true }),
		);
		expect(onScoreClick).toHaveBeenCalledWith({ name: 'Might', value: 2 });
	});
});
