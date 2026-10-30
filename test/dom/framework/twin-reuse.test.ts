// SC-481 -- identical twin blocks. After a write to one of two (or three) blocks with the same text,
// Obsidian reuses the OLD rendered element of the written block for the next identical block below it and
// calls no code-block processor for it. That element still holds the writer's live view, so the twin showed the
// writer's value, its next click wrote the writer's block, and (after adoption moved the root out) the twin card
// was empty.
//
// `Reader` is a small stand-in for Obsidian's Reading view: it knows which block each live element sits on
// (`getSectionInfo` follows the element, like the real renderer) and applies a rebuild the way parseFinish does -
// the new section list is decided first (`reuse` keeps an old element at a new position, `fresh` gets the
// processor, a discarded element has no section any more), then the processors run, then the old render children
// of the discarded sections unload.
import { registerFrameworkElements } from '../../../src/framework/registerFrameworkElements';
import { ElementPipeline } from '../../../src/framework/pipeline';
import { createElementRegistry } from '../../../src/framework/registry';
import { counterElement } from '../../../src/elements/counter/definition';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { makeFakeContext } from '../../mocks/obsidian';
import { makeEnv } from './_adoptionEnv';

type Ctx = ReturnType<typeof makeFakeContext>;
type Slot = 'fresh' | { reuse: Ctx };

const counter = (name: string, value: number): string => `\`\`\`ds-counter\nname: ${name}\ncurrent_value: ${value}\nmax_value: 20\nmin_value: 0\n\`\`\``;
const noteOf = (...blocks: string[]): string => `# N\n\n${blocks.join('\n\n')}\n`;

function bodyOf(text: string, index: number): string {
	const blocks = [...text.matchAll(/^```(ds-[\w-]+)\n([\s\S]*?)\n```$/gm)];
	return blocks[index][2];
}

const INC = 'button[aria-label^="Increase"]';
/** What a card shows: its name and its value. */
function shown(el: HTMLElement): string {
	const name = el.querySelector('.dse-counter__name')?.textContent ?? '';
	const value = (el.querySelector('.dse-counter__value') as HTMLInputElement | null)?.value ?? '';
	return `${name}=${value}`;
}

async function setup(note: string, viewAdoption = true) {
	const { deps, app, plugin } = makeEnv();
	app.vault.setFile('Note.md', note);
	plugin.load();
	const elements = createElementRegistry();
	elements.register(counterElement);
	const registry = registerFrameworkElements(plugin as any, { registry: elements, pipeline: new ElementPipeline(deps) }, { viewAdoption });
	const container = document.body.createDiv();
	const at = new Map<HTMLElement, number>(); // element -> the block index it sits on now

	function ctxAt(index: number): Ctx {
		const ctx = makeFakeContext(app, 'Note.md', index);
		ctx.getSectionInfo = (el) => {
			const i = at.get(el);
			return i === undefined ? null : makeFakeContext(app, 'Note.md', i).getSectionInfo(el);
		};
		const addChild = ctx.addChild.bind(ctx);
		ctx.addChild = (child) => {
			addChild(child);
			child.load(); // the section is on screen, so a child added to it loads at once
		};
		at.set(ctx.el, index);
		return ctx;
	}
	async function build(index: number): Promise<Ctx> {
		const ctx = ctxAt(index);
		await plugin.registeredProcessors.get('ds-counter')!(bodyOf(app.vault.getContent('Note.md')!, index), ctx.el, ctx as any);
		return ctx;
	}
	/** First paint of every block of the note. */
	async function paint(count: number): Promise<Ctx[]> {
		const sections: Ctx[] = [];
		for (let i = 0; i < count; i++) {
			const ctx = await build(i);
			container.appendChild(ctx.el);
			sections.push(ctx);
		}
		return sections;
	}
	/** Obsidian's rebuild after a write: `plan[i]` says how block i is drawn now. Returns the new sections in order. */
	async function rebuild(plan: Slot[], discarded: Ctx[]): Promise<HTMLElement[]> {
		plan.forEach((slot, i) => slot !== 'fresh' && at.set(slot.reuse.el, i));
		discarded.forEach((ctx) => at.delete(ctx.el));
		const els: HTMLElement[] = [];
		for (let i = 0; i < plan.length; i++) {
			const slot = plan[i];
			els.push(slot === 'fresh' ? (await build(i)).el : slot.reuse.el);
		}
		container.replaceChildren(...els);
		discarded.forEach((ctx) => ctx.addedChildren.forEach((c) => c.unload()));
		return els;
	}
	/** Click the Increase button of a card and let the write (and its debounce) land. */
	async function increase(el: HTMLElement): Promise<void> {
		(el.querySelector(INC) as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
	}
	const values = (): number[] => [...app.vault.getContent('Note.md')!.matchAll(/current_value: (\d+)/g)].map((m) => Number(m[1]));
	const names = (): string[] => [...app.vault.getContent('Note.md')!.matchAll(/name: (\w+)/g)].map((m) => m[1]);
	return { app, plugin, registry, container, build, paint, rebuild, increase, values, names, ctxAt };
}

describe('SC-481: identical twin blocks keep their own card, value and block', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		jest.useRealTimers();
		document.body.replaceChildren();
		jest.restoreAllMocks();
	});

	test('two twins, the UPPER one clicked: each card shows its own block, none is empty, and the lower card writes the lower block', async () => {
		const { registry, paint, rebuild, increase, values } = await setup(noteOf(counter('Twin', 5), counter('Twin', 5)));
		const [upper, lower] = await paint(2);
		const writerRoot = upper.el.firstElementChild;
		await increase(upper.el);
		expect(values()).toEqual([6, 5]);

		// Obsidian: block 0 is new text (processor), block 1 has the old text, so it reuses the OLD UPPER element.
		const [top, bottom] = await rebuild(['fresh', { reuse: upper }], [lower]);

		expect(top.children).toHaveLength(1);
		expect(bottom.children).toHaveLength(1); // not empty: the vanish
		expect(shown(top)).toBe('Twin=6');
		expect(shown(bottom)).toBe('Twin=5'); // not the writer's 6
		expect(top.firstElementChild).toBe(writerRoot); // the writer's view followed its own block (adoption)
		expect(registry.stats.claims).toBe(1);
		expect(registry.stats.collisions).toBe(0);

		await increase(bottom);
		expect(values()).toEqual([6, 6]); // the lower card wrote the lower block, not [7, 5]
		expect(shown(bottom)).toBe('Twin=6');
	});

	test('two twins with view adoption off: each card shows its own block and the lower card writes the lower block', async () => {
		const { registry, paint, rebuild, increase, values } = await setup(noteOf(counter('Twin', 5), counter('Twin', 5)), false);
		const [upper, lower] = await paint(2);
		await increase(upper.el);
		const [top, bottom] = await rebuild(['fresh', { reuse: upper }], [lower]);

		expect(registry.stats.claims).toBe(0);
		expect(top.children).toHaveLength(1);
		expect(bottom.children).toHaveLength(1);
		expect(shown(top)).toBe('Twin=6');
		expect(shown(bottom)).toBe('Twin=5');

		await increase(bottom);
		expect(values()).toEqual([6, 6]);
	});

	test('three twins, the UPPER one clicked: three cards, each with its own value, and a click on the lower card writes the lower block', async () => {
		const { paint, rebuild, increase, values } = await setup(noteOf(counter('Twin', 5), counter('Twin', 5), counter('Twin', 5)));
		const [upper, middle, lower] = await paint(3);
		await increase(upper.el);
		expect(values()).toEqual([6, 5, 5]);
		// [A', A, A]: block 1 reuses the old upper element, block 2 the old middle one, the old lower one is discarded.
		const first = await rebuild(['fresh', { reuse: upper }, { reuse: middle }], [lower]);
		expect(first.map((el) => el.children.length)).toEqual([1, 1, 1]);
		expect(first.map(shown)).toEqual(['Twin=6', 'Twin=5', 'Twin=5']);

		await increase(first[2]); // the lower card writes the lower block
		expect(values()).toEqual([6, 5, 6]);
		expect(shown(first[2])).toBe('Twin=6');
	});

	test('three twins, the MIDDLE one clicked: the lower card is the old middle element, redrawn from the lower block', async () => {
		const { registry, paint, rebuild, increase, values } = await setup(noteOf(counter('Twin', 5), counter('Twin', 5), counter('Twin', 5)));
		const [upper, middle, lower] = await paint(3);
		await increase(middle.el);
		expect(values()).toEqual([5, 6, 5]);
		// [A, A', A]: block 0 keeps the old upper element, block 1 is new, block 2 reuses the OLD MIDDLE element.
		const els = await rebuild([{ reuse: upper }, 'fresh', { reuse: middle }], [lower]);

		expect(els.map((el) => el.children.length)).toEqual([1, 1, 1]);
		expect(els.map(shown)).toEqual(['Twin=5', 'Twin=6', 'Twin=5']);
		expect(registry.stats.collisions).toBe(0);

		await increase(els[2]);
		expect(values()).toEqual([5, 6, 6]); // not [5, 7, 5]
	});

	test('a write that is not the view\'s own (the block edit form\'s Save) does not leave the old view in the twin: the edit survives a click on the twin', async () => {
		const { registry, paint, rebuild, increase, values, names } = await setup(noteOf(counter('Twin', 5), counter('Twin', 5)));
		const [upper, lower] = await paint(2);
		const [entry] = registry.liveEntries();
		expect(entry.root).toBe(upper.el.firstElementChild);
		// The form's Save writes through the host without a claim ticket.
		await entry.host.replaceSource(bodyOf(noteOf(counter('Edited', 5)), 0));
		expect(names()).toEqual(['Edited', 'Twin']);

		const [top, bottom] = await rebuild(['fresh', { reuse: upper }], [lower]);
		expect(shown(top)).toBe('Edited=5');
		expect(shown(bottom)).toBe('Twin=5');
		expect(bottom.children).toHaveLength(1);

		await increase(bottom);
		expect(names()).toEqual(['Edited', 'Twin']); // the edit is still there
		expect(values()).toEqual([5, 6]);
	});

	test('the claim guard compares the line the write landed at: a twin whose element was reused does not look like a second copy of the writer', async () => {
		const { registry, paint, rebuild, increase } = await setup(noteOf(counter('Twin', 5), counter('Twin', 5)));
		const [upper, lower] = await paint(2);
		await increase(upper.el);
		// Obsidian reuses the writer's old element at the twin's place (line 13) before the processor runs; the discarded
		// lower block's host has no section, so its remembered line is also 13. Reading the writer's line from that element
		// said "two views of one block" and refused the adoption.
		await rebuild(['fresh', { reuse: upper }], [lower]);
		expect(registry.stats.collisions).toBe(0);
		expect(registry.stats.claims).toBe(1);
	});

	test('blocks with different text are not touched: the lower card keeps its root, the writer is adopted, nothing is drawn twice', async () => {
		const { registry, paint, rebuild, increase, values } = await setup(noteOf(counter('Upper', 5), counter('Lower', 5)));
		const runs = jest.spyOn(ElementPipeline.prototype, 'run');
		const [upper, lower] = await paint(2);
		const lowerRoot = lower.el.firstElementChild;
		const writerRoot = upper.el.firstElementChild;
		expect(runs).toHaveBeenCalledTimes(2);
		await increase(upper.el);
		// The unchanged lower section keeps its element (same text); the old upper section is discarded.
		const [top, bottom] = await rebuild(['fresh', { reuse: lower }], [upper]);

		expect(top.firstElementChild).toBe(writerRoot);
		expect(bottom.firstElementChild).toBe(lowerRoot);
		expect(runs).toHaveBeenCalledTimes(2); // no extra render for either card
		expect(registry.stats.releases).toBe(0);
		await increase(bottom);
		expect(values()).toEqual([6, 6]);
	});

	test('a block in a callout (a section window that starts at the callout, not the fence) is left alone', async () => {
		const block = '> ```ds-counter\n> name: Twin\n> current_value: 5\n> max_value: 20\n> min_value: 0\n> ```';
		const { app, plugin, registry, container, ctxAt } = await setup(`# N\n\n> [!note]\n${block}\n>\n${block}\n`);
		const body = 'name: Twin\ncurrent_value: 5\nmax_value: 20\nmin_value: 0';
		// Reading view hands a callout's blocks the WHOLE callout as their section.
		const calloutWindow = (): { text: string; lineStart: number; lineEnd: number } => {
			const text = app.vault.getContent('Note.md')!;
			return { text, lineStart: 2, lineEnd: text.split('\n').length - 2 };
		};
		const draw = async (): Promise<Ctx> => {
			const ctx = ctxAt(0);
			ctx.getSectionInfo = calloutWindow;
			await plugin.registeredProcessors.get('ds-counter')!(body, ctx.el, ctx as any);
			container.appendChild(ctx.el);
			return ctx;
		};
		const first = await draw();
		const second = await draw();
		const roots = [first.el.firstElementChild, second.el.firstElementChild];
		// The note changes under the callout; the next processor call must not mistake either card for a reused element.
		app.vault.setFile('Note.md', app.vault.getContent('Note.md')!.replace('current_value: 5', 'current_value: 6'));
		await draw();

		expect(registry.stats.releases).toBe(0);
		expect([first.el.firstElementChild, second.el.firstElementChild]).toEqual(roots);
		expect(first.el.children).toHaveLength(1);
		expect(second.el.children).toHaveLength(1);
	});
});
