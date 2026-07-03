// T-10b: CounterView — the smallest interactive element, same template shape as the
// T-10a harness (initiative-render.test.ts, deleted with the legacy InitiativeProcessor
// in Plan 06 Task 5): parse a golden fixture → render into an extended jsdom div →
// assert structure → simulate one interaction → assert exactly one vault write.
import { CounterView } from '@drawSteelAdmonition/Counter/CounterView';
import { Counter } from '@model/Counter';
import { App, Plugin, makeFakeContext, flushAsync } from '../../mocks/obsidian';
import counterYaml from '../../fixtures/counter/health.yaml';

function renderCounter(yaml: string = counterYaml) {
	const app = new App();
	app.vault.setFile('Note.md', '```ds-counter\n' + yaml.trimEnd() + '\n```\n');
	const ctx = makeFakeContext(app, 'Note.md');
	const plugin = new Plugin(app) as any;
	const data = Counter.parseYaml(yaml);
	const view = new CounterView(plugin, data, ctx as any);
	const parent = document.createElement('div');
	view.build(parent);
	return { app, data, parent };
}

const value = (parent: HTMLElement) => parent.querySelector('.ds-counter-value')!.textContent;
const buttons = (parent: HTMLElement) => parent.querySelectorAll<HTMLButtonElement>('.ds-counter-button');

describe('T-10b: CounterView render and interaction', () => {
	test('renders name and current value from the fixture', () => {
		const { parent } = renderCounter();
		expect(value(parent)).toBe('10');
		expect(parent.querySelector('.ds-counter-name')!.textContent).toBe('Health');
	});

	test('increment updates the display, the model, and writes the block once', async () => {
		const { app, data, parent } = renderCounter();
		buttons(parent)[0].click(); // [0]=increment (chevron-up), [1]=decrement
		await flushAsync();
		expect(data.current_value).toBe(11);
		expect(value(parent)).toBe('11');
		expect(app.vault.modifyCalls).toHaveLength(1);
		expect(app.vault.getContent('Note.md')).toContain('current_value: 11');
	});

	test('decrement respects min_value: at 0 the button is disabled and value holds', async () => {
		const { data, parent } = renderCounter('name: Health\ncurrent_value: 0\nmin_value: 0');
		expect(buttons(parent)[1].hasAttribute('disabled')).toBe(true);
		buttons(parent)[1].click();
		await flushAsync();
		expect(data.current_value).toBe(0);
		expect(value(parent)).toBe('0');
	});

	test('increment respects max_value: at max the button is disabled and value holds', async () => {
		const { data, parent } = renderCounter('name: Health\ncurrent_value: 20\nmax_value: 20');
		expect(buttons(parent)[0].hasAttribute('disabled')).toBe(true);
		buttons(parent)[0].click();
		await flushAsync();
		expect(data.current_value).toBe(20);
		expect(value(parent)).toBe('20');
	});
});
