// Plan 08 Task 2 (D2 §2.5) — kit/tooltip: a THIN wrapper over Obsidian's setTooltip.
// No custom tooltip DOM (native handles positioning, delay, keyboard focus, and popout
// windows); the kit call is just a consistent funnel so `title=`/`el.title` disappears.
// Where the tooltip would be a control's only name, callers must also pass aria-label —
// iconButton enforces that by REQUIRING `label` (see iconButton.test.ts).
import { tooltip } from '../../../src/framework/kit/tooltip';
import * as obsidian from '../../mocks/obsidian';

afterEach(() => {
	jest.restoreAllMocks();
});

describe('Plan 08 Task 2: kit/tooltip (D2 §2.5)', () => {
	test('delegates to Obsidian setTooltip with the element and text', () => {
		const spy = jest.spyOn(obsidian, 'setTooltip');
		const el = document.createElement('button');

		tooltip(el, 'Copy the SCC link');

		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith(el, 'Copy the SCC link', undefined);
		// The mock's observable effect — proves the call-through wasn't swallowed.
		expect(el.getAttribute('data-tooltip')).toBe('Copy the SCC link');
	});

	test('passes placement through as Obsidian TooltipOptions', () => {
		const spy = jest.spyOn(obsidian, 'setTooltip');
		const el = document.createElement('span');

		tooltip(el, 'Winded at or below half Stamina', { placement: 'top' });

		expect(spy).toHaveBeenCalledWith(el, 'Winded at or below half Stamina', { placement: 'top' });
	});

	test('creates NO custom tooltip DOM (native only)', () => {
		const before = document.body.childElementCount;
		const el = document.createElement('button');
		document.body.appendChild(el);

		tooltip(el, 'hello');

		expect(el.childElementCount).toBe(0);
		expect(document.body.childElementCount).toBe(before + 1); // only the button we added
		el.remove();
	});
});
