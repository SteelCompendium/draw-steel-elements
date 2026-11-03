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
import { EditorView } from '@codemirror/view';
import { registerFrameworkElements } from '../../../src/framework/registerFrameworkElements';
import { ElementPipeline } from '../../../src/framework/pipeline';
import { createElementRegistry } from '../../../src/framework/registry';
import { counterElement } from '../../../src/elements/counter/definition';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import * as FormModal from '../../../src/authoring/FormModal';
import { droppedWriteMessage, resetDroppedWriteNotices } from '../../../src/framework/host/droppedWriteNotice';
import { Notice, makeFakeContext } from '../../mocks/obsidian';
import { makeEnv } from './_adoptionEnv';
import * as anchor from '../../../src/framework/sidebar/anchor';
import { fenceOnElement, newPassMemo } from '../../../src/framework/host/ReadingModeBlockHost';

type Ctx = ReturnType<typeof makeFakeContext>;
type Slot = 'fresh' | { reuse: Ctx };

const counter = (name: string, value: number): string => `\`\`\`ds-counter\nname: ${name}\ncurrent_value: ${value}\nmax_value: 20\nmin_value: 0\n\`\`\``;
const noteOf = (...blocks: string[]): string => `# N\n\n${blocks.join('\n\n')}\n`;

function bodyOf(text: string, index: number): string {
	const blocks = [...text.matchAll(/^```(ds-[\w-]+)\n([\s\S]*?)\n```$/gm)];
	return blocks[index][2];
}

/** SC-481 r4: the quote / callout windows of a note (Reading view hands every block in one the WHOLE quote as its section). */
function windowsOf(text: string): Array<{ lineStart: number; lineEnd: number }> {
	const out: Array<{ lineStart: number; lineEnd: number }> = [];
	let start = -1;
	text.split('\n').forEach((line, i) => {
		if (line.startsWith('>')) {
			if (start < 0) start = i;
		} else if (start >= 0) {
			out.push({ lineStart: start, lineEnd: i - 1 });
			start = -1;
		}
	});
	return out;
}
/** The body a processor is handed for the block in the `index`-th quote window: the lines between its fences, prefix off. */
function quotedBody(text: string, index: number): string {
	const w = windowsOf(text)[index];
	const lines = text.split('\n').slice(w.lineStart, w.lineEnd + 1).map((l) => l.replace(/^> ?/, ''));
	const open = lines.findIndex((l) => /^```ds-/.test(l));
	return lines.slice(open + 1, lines.indexOf('```', open + 1)).join('\n');
}
const quoted = (kind: 'callout' | 'quote', name: string, value: number): string =>
	[...(kind === 'callout' ? ['[!note] Camp'] : []), ...counter(name, value).split('\n')].map((l) => `> ${l}`).join('\n');

const INC = 'button[aria-label^="Increase"]';
/** What a card shows: its name and its value. */
function shown(el: HTMLElement): string {
	const name = el.querySelector('.dse-counter__name')?.textContent ?? '';
	const value = (el.querySelector('.dse-counter__value') as HTMLInputElement | null)?.value ?? '';
	return `${name}=${value}`;
}

async function setup(note: string, viewAdoption = true, windowed: false | 'callout' | 'quote' = false) {
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
			if (i === undefined) return null;
			if (!windowed) return makeFakeContext(app, 'Note.md', i).getSectionInfo(el);
			const text = app.vault.getContent('Note.md')!;
			const w = windowsOf(text)[i];
			return w ? { text, ...w } : null;
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
		const text = app.vault.getContent('Note.md')!;
		if (windowed) {
			// Obsidian draws the block in a div inside the callout / blockquote element the section is made of.
			const wrapper = document.createElement(windowed === 'quote' ? 'blockquote' : 'div');
			if (windowed === 'callout') wrapper.className = 'callout';
			ctx.el.classList.add('block-language-ds-counter');
			wrapper.appendChild(ctx.el);
		}
		await plugin.registeredProcessors.get('ds-counter')!(windowed ? quotedBody(text, index) : bodyOf(text, index), ctx.el, ctx as any);
		return ctx;
	}
	/** First paint of every block of the note. */
	async function paint(count: number): Promise<Ctx[]> {
		const sections: Ctx[] = [];
		for (let i = 0; i < count; i++) {
			const ctx = await build(i);
			container.appendChild(windowed ? ctx.el.parentElement! : ctx.el);
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
		container.replaceChildren(...els.map((el) => (windowed ? el.parentElement! : el)));
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
	return { app, plugin, registry, container, build, paint, rebuild, increase, values, names, ctxAt, at, deps };
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

// SC-481 r4: the same bug for twins inside a blockquote or a callout. Reading view hands the block a section that is the WHOLE
// quote (its first line is not the fence), so the old checks that only judged a section starting at a plain fence never saw it.
describe.each(['callout', 'quote'] as const)('SC-481 r4: twin blocks inside a %s', (kind) => {
	const twins = (): string => noteOf(quoted(kind, 'Twin', 5), quoted(kind, 'Twin', 5));
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		jest.useRealTimers();
		document.body.replaceChildren();
		jest.restoreAllMocks();
	});

	test('the UPPER one clicked: the twin gets its own card (no error card), shows its own value and its click writes its own block', async () => {
		// (The block's div sits inside the callout / blockquote element, as in Obsidian, so the adoption path - the writer moves into the new
		// section and the element it left is redrawn from the twin's block - is the one taken: claims 1.)
		const { registry, paint, rebuild, increase, values } = await setup(twins(), true, kind);
		const [upper, lower] = await paint(2);
		const writerRoot = upper.el.firstElementChild;
		await increase(upper.el);
		expect(values()).toEqual([6, 5]);
		const [top, bottom] = await rebuild(['fresh', { reuse: upper }], [lower]);

		expect(top.firstElementChild).toBe(writerRoot);
		expect(bottom.children).toHaveLength(1);
		expect(bottom.textContent).not.toContain('failed to render'); // r3 MEDIUM-1: the callout's raw lines were parsed as the block
		expect(shown(top)).toBe('Twin=6');
		expect(shown(bottom)).toBe('Twin=5');
		expect(registry.stats.claims).toBe(1);

		await increase(bottom);
		expect(values()).toEqual([6, 6]);
		expect(shown(bottom)).toBe('Twin=6');
	});

	test('view adoption off: each card shows its own block and the lower card writes the lower block', async () => {
		const { paint, rebuild, increase, values } = await setup(twins(), false, kind);
		const [upper, lower] = await paint(2);
		await increase(upper.el);
		const [top, bottom] = await rebuild(['fresh', { reuse: upper }], [lower]);

		expect(bottom.children).toHaveLength(1);
		expect(shown(top)).toBe('Twin=6');
		expect(shown(bottom)).toBe('Twin=5');
		await increase(bottom);
		expect(values()).toEqual([6, 6]);
	});

	test('a write that is not the view\'s own (the edit form\'s Save) on the upper twin: a click on the lower twin does not erase the edit', async () => {
		const { registry, paint, rebuild, increase, values, names } = await setup(twins(), true, kind);
		const [upper, lower] = await paint(2);
		const [entry] = registry.liveEntries();
		await entry.host.replaceSource(bodyOf(noteOf(counter('Edited', 5)), 0));
		expect(names()).toEqual(['Edited', 'Twin']);
		const [top, bottom] = await rebuild(['fresh', { reuse: upper }], [lower]);

		expect(shown(top)).toBe('Edited=5');
		expect(shown(bottom)).toBe('Twin=5');
		await increase(bottom);
		expect(names()).toEqual(['Edited', 'Twin']);
		expect(values()).toEqual([5, 6]);
	});
});

// SC-481 r4 (r3 LOW-1): a view that has written but whose rebuild has not arrived yet still sits on its own line, with the section
// text from BEFORE the write. Another pane's rebuild (a different docId) can run first; it must not take that for a reused element.
describe('SC-481 r4: a writer whose rebuild is still to come is not mistaken for a reused element', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		jest.useRealTimers();
		document.body.replaceChildren();
	});

	test('pane B\'s rebuild runs before pane A\'s: the writer in A keeps its view and is adopted by its own rebuild', async () => {
		const { app, plugin, registry, increase, ctxAt, at } = await setup(noteOf(counter('Solo', 5)));
		const draw = async (docId: string): Promise<Ctx> => {
			const ctx = ctxAt(0);
			(ctx as any).docId = docId;
			await plugin.registeredProcessors.get('ds-counter')!(bodyOf(app.vault.getContent('Note.md')!, 0), ctx.el, ctx as any);
			return ctx;
		};
		const paneA = await draw('doc-A');
		const paneB = await draw('doc-B');
		const writerRoot = paneA.el.firstElementChild;
		const before = app.vault.getContent('Note.md')!;
		await increase(paneA.el);
		// A's renderer has not re-parsed yet: its section still reads the note as it was, at the line the write landed at.
		paneA.getSectionInfo = () => ({ text: before, lineStart: 2, lineEnd: 7 });

		await draw('doc-B'); // pane B's rebuild comes first
		expect(registry.liveEntries().some((e) => e.root === writerRoot)).toBe(true);
		expect(writerRoot!.isConnected || paneA.el.contains(writerRoot)).toBe(true);

		at.delete(paneA.el);
		const rebuiltA = await draw('doc-A'); // then A's own rebuild
		expect(rebuiltA.el.firstElementChild).toBe(writerRoot);
		expect(registry.stats.claims).toBe(1);
		void paneB;
	});
});

// SC-481 r6 (r5 LOW-1): a callout that holds SEVERAL blocks. Which of them an element sits on is told by its place among the callout's blocks in
// the DOM (`quoteOrdinal`); with no ordinal the lookup is ambiguous and nothing is drawn.
describe.each([true, false])('SC-481 r6: two identical callouts holding two blocks each (view adoption %s)', (adoption) => {
	const callout = (x: number, y: number): string =>
		['[!note] Camp', ...counter('X', x).split('\n'), '', ...counter('Y', y).split('\n')].map((l) => (l === '' ? '>' : `> ${l}`)).join('\n');
	const blockBody = (text: string, win: number, blk: number): string => {
		const w = windowsOf(text)[win];
		const lines = text.split('\n').slice(w.lineStart, w.lineEnd + 1).map((l) => l.replace(/^> ?/, ''));
		let open = -1;
		for (let n = 0; n <= blk; n++) open = lines.findIndex((l, i) => i > open && /^```ds-/.test(l));
		return lines.slice(open + 1, lines.indexOf('```', open + 1)).join('\n');
	};
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		jest.useRealTimers();
		document.body.replaceChildren();
	});

	test('X in the upper callout clicked: all four cards are drawn, each shows its own block, and later clicks write the block of the card clicked', async () => {
		const { app, plugin, container, ctxAt, at, increase, values } = await setup(noteOf(callout(5, 3), callout(5, 3)), adoption, 'callout');
		/** One callout section as Obsidian draws it: a `.callout` element with a div per block; the processor runs for each block in turn. */
		const draw = async (win: number): Promise<{ box: HTMLElement; ctxs: Ctx[] }> => {
			const box = document.createElement('div');
			box.className = 'callout';
			const ctxs: Ctx[] = [];
			for (let blk = 0; blk < 2; blk++) {
				const ctx = ctxAt(win);
				ctx.el.classList.add('block-language-ds-counter');
				box.appendChild(ctx.el);
				await plugin.registeredProcessors.get('ds-counter')!(blockBody(app.vault.getContent('Note.md')!, win, blk), ctx.el, ctx as any);
				ctxs.push(ctx);
			}
			return { box, ctxs };
		};
		const upper = await draw(0);
		const lower = await draw(1);
		container.replaceChildren(upper.box, lower.box);
		await increase(upper.ctxs[0].el);
		expect(values()).toEqual([6, 3, 5, 3]);

		// The upper callout's text changed, so it is a new section; the lower callout has the upper's OLD text, so Obsidian hands it the old upper element.
		upper.ctxs.forEach((c) => at.set(c.el, 1));
		lower.ctxs.forEach((c) => at.delete(c.el));
		const fresh = await draw(0);
		container.replaceChildren(fresh.box, upper.box);
		lower.ctxs.forEach((c) => c.addedChildren.forEach((ch) => ch.unload()));

		const cards = [fresh.ctxs[0].el, fresh.ctxs[1].el, upper.ctxs[0].el, upper.ctxs[1].el];
		expect(cards.map((el) => el.children.length)).toEqual([1, 1, 1, 1]);
		expect(cards.map(shown)).toEqual(['X=6', 'Y=3', 'X=5', 'Y=3']);
		expect(cards.map((el) => el.textContent).join()).not.toContain('failed to render');

		await increase(cards[2]);
		expect(values()).toEqual([6, 3, 6, 3]);
		await increase(cards[3]);
		expect(values()).toEqual([6, 3, 6, 4]);
	});
});

// SC-537: the same bug for twin CALLOUTS in Live Preview. Obsidian draws a callout as one editor widget, hands its blocks a context whose
// getSectionInfo is null, and after a write gives the next identical callout the written one's OLD widget without calling a processor,
// so nothing at processor time can see it. The editor can: an update listener (livePreviewReconcile.ts) asks the editor where each widget
// sits now. `lp` below is a small stand-in for that editor: `posAtDOM` follows the slot a widget sits in, like CodeMirror's.
describe('SC-537: twin callouts in Live Preview (the editor-driven pass)', () => {
	const callout = (...blocks: Array<[string, number]>): string =>
		['[!note] Camp', ...blocks.flatMap(([n, v], i) => [...(i ? [''] : []), ...counter(n, v).split('\n')])].map((l) => (l === '' ? '>' : `> ${l}`)).join('\n');
	/** The body a processor is handed for the `blk`-th block of the `win`-th callout of `text`. */
	const calloutBody = (text: string, win: number, blk: number): string => {
		const w = windowsOf(text)[win];
		const lines = text.split('\n').slice(w.lineStart, w.lineEnd + 1).map((l) => l.replace(/^> ?/, ''));
		let open = -1;
		for (let n = 0; n <= blk; n++) open = lines.findIndex((l, i) => i > open && /^```ds-/.test(l));
		return lines.slice(open + 1, lines.indexOf('```', open + 1)).join('\n');
	};
	type Drawn = { widget: HTMLElement; els: HTMLElement[]; unload: () => void };

	async function lp(note: string) {
		const { deps, app, plugin } = makeEnv();
		app.vault.setFile('Note.md', note);
		plugin.load();
		const elements = createElementRegistry();
		elements.register(counterElement);
		const extensions: unknown[] = [];
		jest.spyOn(plugin, 'registerEditorExtension').mockImplementation((ext: unknown) => void extensions.push(ext));
		const registry = registerFrameworkElements(plugin as any, { registry: elements, pipeline: new ElementPipeline(deps) }, { viewAdoption: true });
		const listener = extensions.find((e) => (e as { facet?: unknown }).facet === EditorView.updateListener) as { value: (u: unknown) => void } | undefined;

		// The editor: its text (what the user sees; lags the note on disk between a write and the "set" transaction), the callout each widget sits in.
		let editorText = note;
		const slotOf = new Map<Node, number>();
		const editorDom = document.body.appendChild(document.createElement('div'));
		const headerOffset = (callout: number): number => {
			const lines = editorText.split('\n');
			const line = lines.map((l, i) => (/^> \[!/.test(l) ? i : -1)).filter((i) => i >= 0)[callout];
			return lines.slice(0, line).reduce((off, l) => off + l.length + 1, 0);
		};
		const cm = {
			dom: editorDom,
			posAtDOM: (node: Node): number => {
				const slot = slotOf.get(node);
				if (slot === undefined) throw new Error('not in view');
				return headerOffset(slot);
			},
			state: {
				doc: {
					lineAt: (pos: number) => ({ number: editorText.slice(0, pos).split('\n').length }),
					toString: () => editorText,
				},
				field: () => ({ file: { path: 'Note.md' } }),
			},
		};
		app.workspace.getLeavesOfType = () => [{ view: { file: { path: 'Note.md' }, editor: { cm, getValue: () => editorText } } }] as any;

		let docs = 0;
		/** Obsidian draws the `win`-th callout of the note as a widget holding `blocks` cards, one processor call each. */
		async function draw(win: number, blocks = 1): Promise<Drawn> {
			const widget = document.createElement('div');
			widget.className = 'cm-embed-block cm-callout';
			const inner = widget.appendChild(document.createElement('div'));
			inner.className = 'callout';
			slotOf.set(widget, win);
			editorDom.appendChild(widget);
			const children: Array<{ load(): void; unload(): void }> = [];
			const ctx = {
				docId: `lp-${docs++}`,
				sourcePath: 'Note.md',
				frontmatter: undefined,
				addChild: (child: { load(): void; unload(): void }) => (children.push(child), child.load()),
				getSectionInfo: () => null,
				containerEl: widget,
				el: widget,
			};
			const els: HTMLElement[] = [];
			for (let blk = 0; blk < blocks; blk++) {
				const el = inner.appendChild(document.createElement('div'));
				el.classList.add('block-language-ds-counter');
				await plugin.registeredProcessors.get('ds-counter')!(calloutBody(app.vault.getContent('Note.md')!, win, blk), el, ctx as any);
				els.push(el);
			}
			return { widget, els, unload: () => children.forEach((c) => c.unload()) };
		}
		/** The editor's "set" transaction after a write: its text follows the note. */
		const syncEditor = (): void => void (editorText = app.vault.getContent('Note.md')!);
		/** Obsidian's rebuild after a write to the UPPER callout: the upper one is raw (the cursor is in it), the OLD upper widget is handed to the lower slot, the old lower one is discarded. */
		function reuseUpperAtLower(upper: Drawn, lower: Drawn): void {
			slotOf.set(upper.widget, 1);
			slotOf.delete(lower.widget);
			lower.unload();
			lower.widget.remove();
			syncEditor();
		}
		/** SC-544: Obsidian's rebuild after a write to the UPPER of three callouts: the upper is raw, the OLD middle widget goes to the lower slot, the old lower one is discarded. */
		function shiftMiddleToLower(upper: Drawn, middle: Drawn, lower: Drawn): void {
			slotOf.set(middle.widget, 2);
			slotOf.delete(upper.widget);
			upper.widget.remove();
			slotOf.delete(lower.widget);
			lower.unload();
			lower.widget.remove();
			syncEditor();
		}
		/** One editor update, as CodeMirror calls its listeners; then the redraws it starts finish. */
		async function update(over: { docChanged?: boolean; viewportChanged?: boolean; selectionSet?: boolean; view?: unknown } = {}): Promise<void> {
			if (!listener) throw new Error('no editor update listener was registered');
			listener.value({ docChanged: over.docChanged ?? true, viewportChanged: over.viewportChanged ?? false, selectionSet: over.selectionSet ?? false, view: over.view ?? cm, state: cm.state });
			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		}
		async function increase(el: HTMLElement): Promise<void> {
			(el.querySelector(INC) as HTMLElement).click();
			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		}
		const values = (): number[] => [...app.vault.getContent('Note.md')!.matchAll(/current_value: (\d+)/g)].map((m) => Number(m[1]));
		const names = (): string[] => [...app.vault.getContent('Note.md')!.matchAll(/name: (\w+)/g)].map((m) => m[1]);
		const click = (el: HTMLElement): void => (el.querySelector(INC) as HTMLElement).click();
		return { app, plugin, registry, cm, draw, syncEditor, reuseUpperAtLower, shiftMiddleToLower, update, increase, click, values, names, editorDom };
	}

	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		jest.useRealTimers();
		document.body.replaceChildren();
		jest.restoreAllMocks();
	});

	test('the UPPER callout clicked: the editor update redraws the widget Obsidian handed to the lower slot from the lower block, and its click writes the lower block', async () => {
		const t = await lp(noteOf(quoted('callout', 'Twin', 5), quoted('callout', 'Twin', 5)));
		const upper = await t.draw(0);
		const lower = await t.draw(1);
		const [writer] = t.registry.liveEntries();
		await t.increase(upper.els[0]);
		expect(t.values()).toEqual([6, 5]);
		t.reuseUpperAtLower(upper, lower);
		expect(shown(upper.els[0])).toBe('Twin=6'); // the bug's state: the lower slot shows the writer's value

		await t.update();

		expect(writer.releasedBy).toBe('reused-by-twin');
		expect(upper.els[0].children).toHaveLength(1); // a fresh card in the same element
		expect(shown(upper.els[0])).toBe('Twin=5');
		await t.increase(upper.els[0]);
		expect(t.values()).toEqual([6, 6]); // not [7, 5]
		expect(shown(upper.els[0])).toBe('Twin=6');
	});

	test('a write that is not the view\'s own (the edit form\'s Save) on the upper callout: a click on the lower one does not erase the edit', async () => {
		const t = await lp(noteOf(quoted('callout', 'Twin', 5), quoted('callout', 'Twin', 5)));
		const upper = await t.draw(0);
		const lower = await t.draw(1);
		await t.registry.liveEntries()[0].host.replaceSource(bodyOf(noteOf(counter('Edited', 5)), 0));
		expect(t.names()).toEqual(['Edited', 'Twin']);
		t.reuseUpperAtLower(upper, lower);
		await t.update();

		expect(shown(upper.els[0])).toBe('Twin=5');
		await t.increase(upper.els[0]);
		expect(t.names()).toEqual(['Edited', 'Twin']); // the edit is still there
		expect(t.values()).toEqual([5, 6]);
	});

	test('two blocks per callout: the redraw picks each by its place in the callout, and only the block whose body differs is redrawn', async () => {
		const both = callout(['X', 5], ['Y', 3]);
		const t = await lp(noteOf(both, both));
		const upper = await t.draw(0, 2);
		const lower = await t.draw(1, 2);
		const [writerX, writerY] = t.registry.liveEntries();
		await t.increase(upper.els[0]);
		expect(t.values()).toEqual([6, 3, 5, 3]);
		t.reuseUpperAtLower(upper, lower);
		await t.update();

		expect(writerX.releasedBy).toBe('reused-by-twin');
		expect(writerY.releasedBy).toBeNull(); // Y never changed: its view still matches the lower Y
		expect(upper.els.map(shown)).toEqual(['X=5', 'Y=3']);
		await t.increase(upper.els[0]);
		expect(t.values()).toEqual([6, 3, 6, 3]);
		await t.increase(upper.els[1]);
		expect(t.values()).toEqual([6, 3, 6, 4]);
	});

	test('an element still on the line the view\'s last write landed at is its own block, waiting for the editor to catch up: not redrawn', async () => {
		const t = await lp(noteOf(quoted('callout', 'Twin', 5), quoted('callout', 'Twin', 5)));
		const upper = await t.draw(0);
		await t.draw(1);
		const [writer] = t.registry.liveEntries();
		await t.increase(upper.els[0]); // the editor text is still the old [5, 5], the widget still at the upper slot
		await t.update();

		expect(writer.releasedBy).toBeNull();
		expect(shown(upper.els[0])).toBe('Twin=6');
	});

	test('an update that changed no text, or one from another editor: nothing is redrawn', async () => {
		const t = await lp(noteOf(quoted('callout', 'Twin', 5), quoted('callout', 'Twin', 5)));
		const upper = await t.draw(0);
		const lower = await t.draw(1);
		const [writer] = t.registry.liveEntries();
		await t.increase(upper.els[0]);
		t.reuseUpperAtLower(upper, lower);

		await t.update({ docChanged: false });
		await t.update({ view: { ...t.cm, dom: document.createElement('div') } }); // another pane: the widget is not in its DOM
		expect(writer.releasedBy).toBeNull();
		expect(shown(upper.els[0])).toBe('Twin=6');

		await t.update(); // the editor it is drawn in
		expect(writer.releasedBy).toBe('reused-by-twin');
	});

	test('a plain Live Preview widget is not judged by the editor pass (the processor-time check keeps that case)', async () => {
		const t = await lp(noteOf(counter('Twin', 5), counter('Twin', 7)));
		const widget = t.editorDom.appendChild(document.createElement('div'));
		widget.className = 'cm-embed-block cm-lang-ds-counter';
		const el = widget.appendChild(document.createElement('div'));
		el.classList.add('block-language-ds-counter');
		// A plain widget has a section, and it is the OTHER block's (the element was handed on): the processor-time check would redraw it.
		const ctx = { ...makeFakeContext(t.app, 'Note.md', 1), el: widget, containerEl: widget, getSectionInfo: () => makeFakeContext(t.app, 'Note.md', 1).getSectionInfo(el) };
		await t.plugin.registeredProcessors.get('ds-counter')!(bodyOf(noteOf(counter('Twin', 5)), 0), el, ctx as any);
		const [entry] = t.registry.liveEntries();

		await t.update();

		expect(entry.releasedBy).toBeNull();
		expect(shown(el)).toBe('Twin=5');
	});

	test('a twin callout that was off screen when the write landed: the update that scrolls it into the editor (no text change) redraws it', async () => {
		const t = await lp(noteOf(quoted('callout', 'Twin', 5), quoted('callout', 'Twin', 5)));
		const upper = await t.draw(0);
		const lower = await t.draw(1);
		const [writer] = t.registry.liveEntries();
		await t.increase(upper.els[0]);
		t.reuseUpperAtLower(upper, lower);
		upper.widget.remove(); // the lower slot is outside the drawn area: the widget is not in the editor's DOM yet
		await t.update(); // the "set" transaction
		expect(writer.releasedBy).toBeNull(); // nothing to judge in this editor
		t.editorDom.appendChild(upper.widget); // the user scrolls down: CodeMirror attaches the cached widget in a viewport update

		await t.update({ docChanged: false, viewportChanged: true });

		expect(writer.releasedBy).toBe('reused-by-twin');
		expect(shown(upper.els[0])).toBe('Twin=5');
		await t.increase(upper.els[0]);
		expect(t.values()).toEqual([6, 6]); // not [7, 5]
	});

	test('a twin callout that was raw source (cursor inside) when the write landed: the selection-only update that draws it again redraws it', async () => {
		const t = await lp(noteOf(quoted('callout', 'Twin', 5), quoted('callout', 'Twin', 5)));
		const upper = await t.draw(0);
		const lower = await t.draw(1);
		const [writer] = t.registry.liveEntries();
		await t.increase(upper.els[0]);
		t.reuseUpperAtLower(upper, lower);

		await t.update({ docChanged: false, selectionSet: true });

		expect(writer.releasedBy).toBe('reused-by-twin');
		expect(shown(upper.els[0])).toBe('Twin=5');
		await t.increase(upper.els[0]);
		expect(t.values()).toEqual([6, 6]);
	});

	test('a pass over a callout of six blocks (typing, scrolling) reads the callout\'s block list once, not once per block', async () => {
		const many = callout(...Array.from({ length: 6 }, (_, i): [string, number] => [`B${i}`, 5]));
		const t = await lp(noteOf(many, many));
		const upper = await t.draw(0, 6);
		await t.draw(1, 6);
		const query = jest.spyOn(upper.widget, 'querySelectorAll');

		const pass = t.update();
		const reads = query.mock.calls.filter(([sel]) => /block-language/.test(String(sel))).length;
		await pass;

		expect(reads).toBe(1);
		expect(upper.els.map((el) => el.children.length)).toEqual([1, 1, 1, 1, 1, 1]); // nothing was redrawn
	});

	// SC-547: the pass asks once per block, and each ask used to scan every line of the callout (cost ~ blocks squared).
	test('SC-547: a pass over a callout of 40 same-alias blocks scans the callout\'s lines for fences once, not once per block', async () => {
		const many = callout(...Array.from({ length: 40 }, (_, i): [string, number] => [`B${i % 2}`, 5]));
		const t = await lp(noteOf(many, many));
		const upper = await t.draw(0, 40);
		await t.draw(1, 40);
		const scan = jest.spyOn(anchor, 'listFences');

		await t.update();

		expect(scan.mock.calls.length).toBe(2); // two callout windows x one alias, not 80
		expect(upper.els.map((el) => el.children.length)).toEqual(Array(40).fill(1)); // nothing was redrawn

		await t.update();
		expect(scan.mock.calls.length).toBe(4); // the next pass reads the document again: nothing is kept between passes
	});

	// SC-544: the click on the middle callout comes before the upper's write. Obsidian's rebuild after that write hands the middle's widget
	// (still holding its pending +1) to the lower slot; the middle's edit must already be on disk, placed through its own block.
	test('SC-544: three callouts, the upper then the middle clicked 120 ms apart: both clicks land in the block clicked, and the widget in the lower slot is redrawn from the lower block', async () => {
		const t = await lp(noteOf(quoted('callout', 'Twin', 5), quoted('callout', 'Twin', 5), quoted('callout', 'Twin', 5)));
		const upper = await t.draw(0);
		const middle = await t.draw(1);
		const lower = await t.draw(2);
		t.click(upper.els[0]);
		await jest.advanceTimersByTimeAsync(120);
		t.click(middle.els[0]); // inside the upper's debounce
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS - 120); // the upper's write lands
		t.shiftMiddleToLower(upper, middle, lower);
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS); // the middle's own debounce, had it still been waiting
		expect(t.values()).toEqual([6, 6, 5]); // not [6, 5, 6]

		await t.update();
		expect(shown(middle.els[0])).toBe('Twin=5'); // the widget now in the lower slot shows the lower block
		await t.increase(middle.els[0]);
		expect(t.values()).toEqual([6, 6, 6]);
	});

	test('registerFrameworkElements registers the update listener with the editor', async () => {
		const t = await lp(noteOf(quoted('callout', 'Twin', 5)));
		await expect(t.update()).resolves.toBeUndefined(); // throws when no listener was registered
	});
});

/** Obsidian's rebuild matches each new block to the first unused old element with the same text. */
function planFor(before: number[], after: number[], old: Ctx[]): { plan: Slot[]; discarded: Ctx[] } {
	const used = new Set<number>();
	const plan: Slot[] = after.map((value) => {
		const at = before.findIndex((b, i) => b === value && !used.has(i));
		if (at < 0) return 'fresh';
		used.add(at);
		return { reuse: old[at] };
	});
	return { plan, discarded: old.filter((_, i) => !used.has(i)) };
}
const click = (el: HTMLElement): void => (el.querySelector(INC) as HTMLElement).click();

// SC-544: two quick clicks on identical blocks. The second click comes before the first block's write, and that write's rebuild hands the
// element of the block still waiting (the middle one) to the next twin, so its debounced write was placed through the wrong block.
describe('SC-544: a second click before the first block\'s write', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		jest.useRealTimers();
		document.body.replaceChildren();
		jest.restoreAllMocks();
	});

	const triplet = (): string => noteOf(counter('Twin', 5), counter('Twin', 5), counter('Twin', 5));

	test('Reading view, three plain blocks: + upper, + middle 120 ms later: each click lands in its own block and every card shows its own block', async () => {
		const t = await setup(triplet());
		const old = await t.paint(3);
		click(old[0].el);
		await jest.advanceTimersByTimeAsync(120);
		click(old[1].el); // inside the upper's debounce
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS - 120); // the upper's write lands
		const { plan, discarded } = planFor([5, 5, 5], t.values(), old);
		const els = await t.rebuild(plan, discarded);
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS); // the middle's own debounce, had it still been waiting

		expect(t.values()).toEqual([6, 6, 5]); // not [6, 5, 6]
		expect(els.map((el) => el.children.length)).toEqual([1, 1, 1]);
		expect(els.map(shown)).toEqual(['Twin=6', 'Twin=6', 'Twin=5']);
		await t.increase(els[2]);
		expect(t.values()).toEqual([6, 6, 6]); // the lower card writes the lower block
	});

	test('the block edit form\'s Save on the upper while the middle\'s click is pending: the middle\'s +1 is written in the middle block in the same round', async () => {
		const t = await setup(triplet());
		const cards = await t.paint(3);
		const [upperEntry] = t.registry.liveEntries();
		click(cards[1].el);
		expect(t.registry.pendingWrites()).toHaveLength(1);
		await upperEntry.host.replaceSource(bodyOf(noteOf(counter('Edited', 5)), 0)); // not the view's own write
		await jest.advanceTimersByTimeAsync(0); // microtasks only, well inside the debounce

		expect(t.names()).toEqual(['Edited', 'Twin', 'Twin']);
		expect(t.values()).toEqual([5, 6, 5]);
		expect(t.registry.pendingWrites()).toHaveLength(0);
	});

	test('a nested flush (a sibling\'s own write) does not flush the writer\'s own waiting view; the siblings are written in registry order', async () => {
		const t = await setup(triplet());
		const cards = await t.paint(3);
		const [upper, middle, lower] = t.registry.liveEntries();
		const order: string[] = [];
		for (const [name, entry] of [['upper', upper], ['middle', middle], ['lower', lower]] as const) {
			const view = entry.view as unknown as { flushPendingWrite(): void };
			const flush = view.flushPendingWrite.bind(view);
			jest.spyOn(view, 'flushPendingWrite').mockImplementation(() => (order.push(name), flush()));
		}
		cards.forEach((card) => click(card.el)); // all three have an edit waiting
		expect(t.registry.pendingWrites()).toHaveLength(3);
		await middle.host.replaceSource(bodyOf(noteOf(counter('Edited', 5)), 0)); // the form's Save on the middle: its own view is the writer's
		await jest.advanceTimersByTimeAsync(0); // microtasks only, well inside the debounce

		expect(order).toEqual(['upper', 'lower']); // the writer's own view was not flushed by the upper's nested call, and nothing twice
		expect(t.registry.pendingWrites().map((e) => e.host)).toEqual([middle.host]); // it is still waiting for its own debounce
		expect(t.values()).toEqual([6, 5, 6]);
		expect(t.names()).toEqual(['Twin', 'Edited', 'Twin']); // the form's edit is in the middle block (values alone also read [6,5,6] for a misrouted or dropped form)
	});

	test('the sibling\'s section is read before the writer\'s Vault.process runs', async () => {
		const t = await setup(triplet());
		const [, middle] = await t.paint(3);
		const [upperEntry] = t.registry.liveEntries();
		click(middle.el);
		const order: string[] = [];
		const read = middle.getSectionInfo.bind(middle);
		middle.getSectionInfo = (el) => (order.push('read-middle'), read(el));
		const process = t.app.vault.process.bind(t.app.vault);
		jest.spyOn(t.app.vault, 'process').mockImplementation((...args: Parameters<typeof process>) => (order.push('process'), process(...args)));
		await upperEntry.host.replaceSource(bodyOf(noteOf(counter('Edited', 5)), 0));
		await jest.advanceTimersByTimeAsync(0);

		expect(order.indexOf('read-middle')).toBeGreaterThanOrEqual(0);
		expect(order.indexOf('read-middle')).toBeLessThan(order.indexOf('process'));
	});
});

// SC-547: a pass remembers each callout window's fences; the answer for every block must be the one an uncached ask gives.
describe('SC-547: the pass cache changes no answer', () => {
	// two blocks of each of two aliases, twins among them, and a never-closed last fence
	const WINDOW = [
		'> [!note] Camp',
		'> ```ds-counter', '> name: A', '> ```', '>',
		'> ```ds-counter', '> name: A', '> ```', '>', // identical twin of the first
		'> ```ds-other', '> name: Y', '> ```', '>',
		'> ```ds-other', '> name: Z', '> ```', '>',
		'> ```ds-counter', '> name: B', '> ```', '>',
		'> ```ds-counter', '> name: C', // never closed
	];
	const textOf = (lines: string[]): string => `# N\n\n${lines.join('\n')}`;
	const text = textOf(WINDOW);
	const section = { text, lineStart: 2, lineEnd: 2 + WINDOW.length - 1 };
	const ctx = { sourcePath: 'Note.md', getSectionInfo: () => null } as any;
	/** What a pass hands `fenceOnElement`: one split of each text, however many blocks ask (the remounter's `linesOf`). */
	function splitOnce(): (t: string) => readonly string[] {
		const seen = new Map<string, readonly string[]>();
		return (t) => seen.get(t) ?? (seen.set(t, t.split('\n')), seen.get(t)!);
	}

	/** A callout widget holding one block div per alias in `aliases`, in document order. */
	function drawn(aliases: readonly string[]): Array<[string, HTMLElement]> {
		const widget = document.body.appendChild(document.createElement('div'));
		widget.className = 'cm-embed-block cm-callout';
		const inner = widget.appendChild(document.createElement('div'));
		inner.className = 'callout';
		return aliases.map((alias): [string, HTMLElement] => {
			const el = inner.appendChild(document.createElement('div'));
			el.classList.add(`block-language-${alias}`);
			return [alias, el];
		});
	}
	afterEach(() => document.body.replaceChildren());

	test('twins, two blocks of each of two aliases and an unterminated last fence: every block resolves to the same fence with the memo as without', () => {
		const els = drawn(['ds-counter', 'ds-counter', 'ds-other', 'ds-other', 'ds-counter', 'ds-counter']);
		const linesOf = splitOnce();
		const memo = newPassMemo();
		const plain = els.map(([alias, el]) => fenceOnElement(ctx, el, alias, linesOf, section));
		const cached = els.map(([alias, el]) => fenceOnElement(ctx, el, alias, linesOf, section, memo));
		expect(cached).toEqual(plain);
		// the twins told apart by place, both blocks of the second alias found (not just the first); the never-closed fence is not a block to Obsidian either way (null)
		expect(plain.map((f) => f?.lineStart ?? null)).toEqual([3, 7, 11, 15, 19, null]);
		expect(plain.map((f) => f?.body.split('\n')[0] ?? null)).toEqual(['name: A', 'name: A', 'name: Y', 'name: Z', 'name: B', null]);
		expect(memo.fences.size).toBe(2); // one list per alias, however many blocks asked
	});

	test('one memo, two sections of different text with the same window bounds (a self-embed next to the editor\'s callout): each is read from its own text', () => {
		const OLD = ['> [!note] Camp', '> ```ds-counter', '> name: A', '> ```', '>', '> ```ds-counter', '> name: B', '> ```', '>', '> tail'];
		const NEW = ['> [!note] Camp', '> ```ds-counter', '> name: A', '> ```', '>', '> text', '> ```ds-counter', '> name: B', '> ```', '>'];
		const win = { lineStart: 2, lineEnd: 2 + OLD.length - 1 };
		const old = { text: textOf(OLD), ...win };
		const fresh = { text: textOf(NEW), ...win };
		const [, second] = drawn(['ds-counter', 'ds-counter'])[1];
		const linesOf = splitOnce();
		const memo = newPassMemo();
		const first = fenceOnElement(ctx, second, 'ds-counter', linesOf, old, memo); // the host judged first, by one text
		const viaMemo = fenceOnElement(ctx, second, 'ds-counter', linesOf, fresh, memo); // the next, by another
		expect(viaMemo).toEqual(fenceOnElement(ctx, second, 'ds-counter', linesOf, fresh));
		expect(viaMemo).not.toEqual(first); // the two texts do put the block on different lines
		expect(viaMemo?.body).toBe('name: B');
	});

	test('the memo keys a window by both its bounds: a shorter window from the same first line is not answered from the longer one\'s list', () => {
		const linesOf = splitOnce();
		const [, second] = drawn(['ds-counter', 'ds-counter'])[1];
		const memo = newPassMemo();
		const long = { ...section, lineEnd: 2 + 12 }; // holds both A blocks and both ds-other ones
		const short = { ...section, lineEnd: 2 + 4 }; // holds the first A block only
		expect(fenceOnElement(ctx, second, 'ds-counter', linesOf, long, memo)?.lineStart).toBe(7);
		expect(fenceOnElement(ctx, second, 'ds-counter', linesOf, short, memo)).toEqual(fenceOnElement(ctx, second, 'ds-counter', linesOf, short));
		expect(fenceOnElement(ctx, second, 'ds-counter', linesOf, short, memo)?.lineStart).toBe(3);
	});

	test('each pass gets memory of its own: nothing a pass remembers is shared with the next', () => {
		const a = newPassMemo();
		const b = newPassMemo();
		expect(a.blocks).not.toBe(b.blocks);
		expect(a.fences).not.toBe(b.fences);
		expect(a.windowEnds).not.toBe(b.windowEnds);
	});
});

// SC-552: the block edit form opened on one of several identical blocks. The pencil opens it at once (the clicked card has nothing
// of its own pending), but the upper block's write (a click inside its debounce, or an outside edit) makes Obsidian hand the form's
// element to the block below, and Save then followed the element. The form pins its block when it opens and Save writes through
// the pin; a form whose view Obsidian threw away stays open and then saves strictly.
describe('SC-552: a block edit form (and, wide, a card click) on one of several identical blocks', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => {
		jest.useRealTimers();
		document.body.replaceChildren();
		jest.restoreAllMocks();
	});

	type Form = { save(): Promise<void>; body: HTMLElement; containerEl: HTMLElement; close(): void };
	const twins = (count: number, upper = 5): string => noteOf(...Array.from({ length: count }, (_, i) => counter('Twin', i === 0 ? upper : 5)));

	async function start(count: number) {
		const t = await setup(twins(count));
		await t.deps.prefs.set('authoringControls', true); // the Edit pencil
		return { ...t, old: await t.paint(count) };
	}
	/** Press the real pencil of a card; hands back the real FormModal it opened. */
	function openForm(card: HTMLElement): () => Form {
		let opened: Form | undefined;
		const real = jest.requireActual('../../../src/authoring/FormModal').openFormEditor;
		jest.spyOn(FormModal, 'openFormEditor').mockImplementation((...a: unknown[]) => (opened = real(...a)));
		card.querySelector<HTMLElement>('.dse-btn[aria-label^="Edit "]')!.click();
		return () => opened!;
	}
	function rename(form: Form, to: string): void {
		const box = form.body.querySelector<HTMLTextAreaElement>('textarea.dse-form__raw')!;
		box.value = box.value.replace('Twin', to);
		box.dispatchEvent(new Event('input'));
	}
	const isOpen = (form: Form): boolean => document.body.contains(form.containerEl);
	const childCount = (component: object): number => (component as unknown as { _children: unknown[] })._children.length;

	test.each([3, 4])('%i twins, + on the upper then the pencil of the second block: Save writes the second block, not the one its element is handed to', async (count) => {
		const t = await start(count);
		const same = Array<number>(count).fill(5);
		click(t.old[0].el); // the upper's write waits out its debounce
		const form = openForm(t.old[1].el);
		rename(form(), 'Edited');
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS); // the upper's write lands...
		const { plan, discarded } = planFor(same, t.values(), t.old);
		await t.rebuild(plan, discarded); // ...and Obsidian puts the form's element on the next block down

		await form().save();
		expect(t.names()).toEqual(['Twin', 'Edited', ...Array<string>(count - 2).fill('Twin')]);
		expect(t.values()).toEqual([6, ...Array<number>(count - 1).fill(5)]);
		expect(isOpen(form())).toBe(false);
	});

	test('no click at all: an outside edit of the upper block while the form is open does not move the form\'s Save', async () => {
		const t = await start(3);
		const form = openForm(t.old[1].el);
		rename(form(), 'Edited');
		t.app.vault.setFile('Note.md', twins(3, 7)); // Sync, or a hand edit
		const { plan, discarded } = planFor([5, 5, 5], t.values(), t.old);
		await t.rebuild(plan, discarded);

		await form().save();
		expect(t.names()).toEqual(['Twin', 'Edited', 'Twin']);
		expect(t.values()).toEqual([7, 5, 5]);
	});

	test('an outside edit that also inserts text above the blocks: the form still writes its own block', async () => {
		const t = await start(3);
		const form = openForm(t.old[1].el);
		rename(form(), 'Edited');
		t.app.vault.setFile('Note.md', twins(3, 7).replace('# N\n\n', '# N\n\nINSERTED\n\n'));
		const { plan, discarded } = planFor([5, 5, 5], t.values(), t.old);
		await t.rebuild(plan, discarded);

		await form().save();
		expect(t.names()).toEqual(['Twin', 'Edited', 'Twin']);
		expect(t.app.vault.getContent('Note.md')).toContain('INSERTED');
	});

	/** Two twins: + on the upper, the pencil of the LOWER, the upper's write lands and Obsidian throws the lower's element away. */
	async function lowerFormAfterTheUppersWrite() {
		const t = await start(2);
		const registryChildren = childCount(t.registry);
		click(t.old[0].el);
		const form = openForm(t.old[1].el);
		rename(form(), 'Edited');
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const { plan, discarded } = planFor([5, 5], t.values(), t.old);
		await t.rebuild(plan, discarded);
		return { ...t, form, registryChildren };
	}

	test('two twins: the form on the lower one stays open when Obsidian throws its view away, and Save writes the lower block', async () => {
		const t = await lowerFormAfterTheUppersWrite();
		expect(isOpen(t.form())).toBe(true);

		await t.form().save();
		expect(t.names()).toEqual(['Twin', 'Edited']);
		expect(t.values()).toEqual([6, 5]);
		expect(isOpen(t.form())).toBe(false);
		expect(childCount(t.registry)).toBe(t.registryChildren); // nothing was left on the registry
	});

	test('a form kept open saves strictly: its block is gone, so nothing is written (not into a twin), the Notice is shown and the form stays open', async () => {
		const t = await lowerFormAfterTheUppersWrite();
		const gone = noteOf(counter('Twin', 6)); // the form\'s block was deleted from outside
		t.app.vault.setFile('Note.md', gone);

		await t.form().save();
		expect(t.app.vault.getContent('Note.md')).toBe(gone);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
		expect(isOpen(t.form())).toBe(true);
	});

	// SC-549, wide: the card's own write is pinned by its first click, not only the form's.
	test('+ on the middle block, then an outside edit of the upper inside the debounce: the +1 is written in the middle block', async () => {
		const t = await start(3);
		click(t.old[1].el);
		await jest.advanceTimersByTimeAsync(120);
		t.app.vault.setFile('Note.md', twins(3, 7)); // Sync, or a hand edit of the upper block
		const { plan, discarded } = planFor([5, 5, 5], t.values(), t.old);
		await t.rebuild(plan, discarded); // the middle card's element is now on the lower block
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(t.values()).toEqual([7, 6, 5]); // not [7, 5, 6]
	});

	test('a kept-open form closes when the plugin unloads', async () => {
		const t = await lowerFormAfterTheUppersWrite();
		expect(isOpen(t.form())).toBe(true);
		t.registry.unload();
		expect(isOpen(t.form())).toBe(false);
	});
});
