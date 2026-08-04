// SC-121 Batch 4 (batch-3 review L-5) — the markdown-table scroll wrapper.
//
// C-6 (Batch 3) ported the site's bare-table styling including `overflow: hidden` for the
// radius, but not the site's `.md-typeset__table` scroll CONTAINER. Measured in the visual
// harness at 300px (Obsidian's default sidebar-leaf width), the perk's 5-column "Familiar
// Statblock" table laid out 467px wide inside a 254px card body and overflowed it with no
// scroll affordance. `wrapMarkdownTables` (src/framework/mdTableWrap.ts) inserts the
// container; ElementView.renderMarkdown calls it, so every element that embeds markdown
// gets it from the ONE render seam.
//
// Two levels here: the helper's own contract (unit), and the wiring through the real
// ElementView.renderMarkdown (integration) — the latter is what actually regressed-proofs
// the fix, since the helper existing but not being called is the failure mode that matters.
import { wrapMarkdownTables, MD_TABLE_WRAP_CLASS } from '@/framework/mdTableWrap';
import { ElementView } from '@/framework/view';
import type { RenderContext } from '@/framework/context';
import { MarkdownRenderer } from '../../mocks/obsidian';

function el(html: string): HTMLElement {
	const root = document.createElement('div');
	root.innerHTML = html;
	return root;
}

describe('wrapMarkdownTables', () => {
	it('wraps a bare markdown table in a .dse-md-table scroll container', () => {
		const root = el('<p>before</p><table><tbody><tr><td>a</td></tr></tbody></table>');
		wrapMarkdownTables(root);

		const wrap = root.querySelector(`.${MD_TABLE_WRAP_CLASS}`);
		expect(wrap).not.toBeNull();
		expect(wrap!.children).toHaveLength(1);
		expect(wrap!.firstElementChild!.tagName).toBe('TABLE');
		// Position preserved: the wrapper takes the table's place in document order.
		expect(root.children[0].tagName).toBe('P');
		expect(root.children[1]).toBe(wrap);
	});

	it('leaves the table element itself untouched (semantics, not display:block)', () => {
		const root = el('<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table>');
		wrapMarkdownTables(root);

		const table = root.querySelector('table')!;
		expect(table.tagName).toBe('TABLE');
		expect(table.getAttribute('class')).toBeNull();
		expect(table.querySelector('thead th')!.textContent).toBe('h');
	});

	it('is idempotent — a second pass does not nest a second wrapper', () => {
		const root = el('<table><tbody><tr><td>a</td></tr></tbody></table>');
		wrapMarkdownTables(root);
		wrapMarkdownTables(root);
		wrapMarkdownTables(root);

		expect(root.querySelectorAll(`.${MD_TABLE_WRAP_CLASS}`)).toHaveLength(1);
	});

	it('wraps every table under the subtree, not just the first', () => {
		const root = el('<table><tbody><tr><td>a</td></tr></tbody></table><div><table><tbody><tr><td>b</td></tr></tbody></table></div>');
		wrapMarkdownTables(root);
		expect(root.querySelectorAll(`.${MD_TABLE_WRAP_CLASS}`)).toHaveLength(2);
	});

	it('never touches a CLASSED table (plugin-built .dse-enc__table, other plugins, Obsidian)', () => {
		const root = el('<table class="dse-enc__table"><tbody><tr><td>a</td></tr></tbody></table>');
		wrapMarkdownTables(root);
		expect(root.querySelector(`.${MD_TABLE_WRAP_CLASS}`)).toBeNull();
		expect(root.firstElementChild!.tagName).toBe('TABLE');
	});
});

describe('ElementView.renderMarkdown wires the wrapper (the seam that matters)', () => {
	// The jest MarkdownRenderer mock appends the raw markdown as text (F3 §4.2), so it
	// never produces a real <table>. Scoped spy — same convention as
	// framework/scc-anchor-render.test.ts — stands in for Obsidian's markdown pipeline
	// turning a pipe-table into real table DOM.
	let spy: jest.SpyInstance;
	beforeEach(() => {
		spy = jest.spyOn(MarkdownRenderer, 'render').mockImplementation(async (_app, _md, target) => {
			(target as HTMLElement).innerHTML = '<table><tbody><tr><td>Familiar</td></tr></tbody></table>';
		});
	});
	afterEach(() => spy.mockRestore());

	it('a table rendered through the seam comes back wrapped', async () => {
		class Probe extends ElementView<unknown> {
			async run(target: HTMLElement): Promise<void> {
				await this.renderMarkdown('| a |\n| - |\n| b |', target);
			}
			protected onMount(): void {}
		}
		const cx = { app: {}, host: { sourcePath: 'x.md' } } as unknown as RenderContext;
		const view = new Probe(cx);
		const target = document.createElement('div');
		await view.run(target);

		const wrap = target.querySelector(`.${MD_TABLE_WRAP_CLASS}`);
		expect(wrap).not.toBeNull();
		expect(wrap!.firstElementChild!.tagName).toBe('TABLE');
	});
});
