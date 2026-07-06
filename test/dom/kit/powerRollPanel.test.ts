// Plan 08 Task 4 (D2 §2.8) — kit/powerRollPanel + tierBadge: the shared roll grammar.
// One titled "Power Roll + {chars}" panel with the four tier rows (≤11 / 12-16 / 17+ /
// crit), each row = a clip-path badge + the outcome text. Static by default; in
// `selectable` mode every row is a REAL <button role="radio" aria-checked> inside a
// role="radiogroup" — a TRUE radiogroup (a roll resolves to exactly ONE tier; Plan 09
// Task 0 replaced the aria-pressed toggle-button mismatch) with the tabs-style roving
// arrow-key pattern. Markdown renders via the caller-supplied renderMd callback —
// the kit never touches MarkdownRenderer/app (kit⊥elements).
import * as fs from 'fs';
import * as path from 'path';
import { powerRollPanel, tierBadge } from '../../../src/framework/kit/powerRollPanel';
import { Component } from '../../mocks/obsidian';

function fakeOwner(): any {
	return new Component();
}

function keydown(el: HTMLElement, key: string): boolean {
	return el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const FOUR_ROWS = [
	{ tier: 'low', md: '3 + M damage' },
	{ tier: 'mid', md: '6 + M damage' },
	{ tier: 'high', md: '9 + M damage; **bleeding**' },
	{ tier: 'crit', md: 'extra main action' },
] as const;

function mount(over: Record<string, unknown> = {}, owner = fakeOwner()) {
	const parent = document.createElement('div');
	document.body.appendChild(parent); // needed for focus assertions
	const onSelect = jest.fn();
	const handle = powerRollPanel(
		parent,
		{ chars: 'Might or Agility', rows: FOUR_ROWS as any, onSelect, ...over } as any,
		owner,
	);
	const rowEls = Array.from(handle.rootEl.querySelectorAll<HTMLElement>('.dse-pr__row'));
	return { parent, handle, rowEls, onSelect, owner };
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('Plan 08 Task 4: kit/powerRollPanel (D2 §2.8)', () => {
	describe('panel structure — head + the four tier rows', () => {
		test('renders .dse-pr with a "Power Roll + {chars}" head', () => {
			const { handle } = mount();
			expect(handle.rootEl.hasClass('dse-pr')).toBe(true);
			const head = handle.rootEl.querySelector('.dse-pr__head')!;
			expect(head.textContent).toBe('Power Roll + Might or Agility');
		});

		test('without chars the head is plain "Power Roll"', () => {
			const { handle } = mount({ chars: undefined });
			expect(handle.rootEl.querySelector('.dse-pr__head')!.textContent).toBe('Power Roll');
		});

		test('renders one row per opts.rows entry, [data-tier] in order', () => {
			const { rowEls } = mount();
			expect(rowEls).toHaveLength(4);
			expect(rowEls.map((r) => r.getAttribute('data-tier'))).toEqual(['low', 'mid', 'high', 'crit']);
		});

		test('each row carries the tier badge with its clip-path class + the range text', () => {
			const { rowEls } = mount();
			const expected: Array<[string, string]> = [
				['--t1', '≤11'],
				['--t2', '12-16'],
				['--t3', '17+'],
				['--crit', 'crit'],
			];
			rowEls.forEach((row, i) => {
				const [mod, range] = expected[i];
				const badge = row.querySelector<HTMLElement>('.dse-pr__badge')!;
				expect(badge).not.toBeNull();
				expect(badge.hasClass(`dse-pr__badge${mod}`)).toBe(true);
				expect(badge.textContent).toBe(range);
			});
		});

		test('a partial roll (no crit line) renders only its own rows', () => {
			const { rowEls } = mount({ rows: FOUR_ROWS.slice(0, 3) });
			expect(rowEls).toHaveLength(3);
			expect(rowEls.map((r) => r.getAttribute('data-tier'))).toEqual(['low', 'mid', 'high']);
		});
	});

	describe('head option (Plan 09 Task 6a) — string override / false = headless / default', () => {
		test('head: string renders VERBATIM as the head text (plain, no renderMd)', () => {
			const { handle } = mount({ head: '2d10 + 3' });
			expect(handle.rootEl.querySelector('.dse-pr__head')!.textContent).toBe('2d10 + 3');
		});

		test('head: string flows through renderMd like the rows (caller data may be markdown)', () => {
			const renderMd = jest.fn((md: string, el: HTMLElement) => {
				el.createEl('em', { text: md });
			});
			const { handle } = mount({ head: 'Power Roll + **Might**', renderMd });

			const head = handle.rootEl.querySelector<HTMLElement>('.dse-pr__head')!;
			expect(renderMd).toHaveBeenCalledWith('Power Roll + **Might**', head);
			expect(head.querySelector('em')!.textContent).toBe('Power Roll + **Might**');
		});

		test('head: false mounts NO head element at all', () => {
			const { handle } = mount({ head: false });
			expect(handle.rootEl.querySelector('.dse-pr__head')).toBeNull();
			// The rows still render — only the head is omitted.
			expect(handle.rootEl.querySelectorAll('.dse-pr__row')).toHaveLength(4);
		});

		test('head: undefined keeps the default "Power Roll + {chars}" caption (today unchanged)', () => {
			const { handle } = mount({ head: undefined });
			expect(handle.rootEl.querySelector('.dse-pr__head')!.textContent).toBe(
				'Power Roll + Might or Agility',
			);
		});

		test('Handle.headEl: present (and === the DOM head) when a head exists; absent when head: false', () => {
			const withDefault = mount();
			expect(withDefault.handle.headEl).toBe(withDefault.handle.rootEl.querySelector('.dse-pr__head'));

			const withString = mount({ head: 'Verbatim' });
			expect(withString.handle.headEl).toBe(withString.handle.rootEl.querySelector('.dse-pr__head'));

			const headless = mount({ head: false });
			expect(headless.handle.headEl).toBeUndefined();
		});

		test('selectable + head: false — the radiogroup mounts WITHOUT aria-labelledby (graceful, no dangling id ref)', () => {
			const { handle, rowEls } = mount({ head: false, selectable: true });
			const group = handle.rootEl.querySelector<HTMLElement>('[role="radiogroup"]')!;
			expect(group).not.toBeNull();
			expect(group.hasAttribute('aria-labelledby')).toBe(false);
			// Selection semantics are untouched by headlessness.
			expect(rowEls.every((r) => r.getAttribute('role') === 'radio')).toBe(true);
		});

		test('selectable + head: string — aria-labelledby still wires to the (overridden) head', () => {
			const { handle } = mount({ head: 'Custom Roll', selectable: true });
			const group = handle.rootEl.querySelector<HTMLElement>('[role="radiogroup"]')!;
			const head = handle.rootEl.querySelector<HTMLElement>('.dse-pr__head')!;
			expect(head.id).not.toBe('');
			expect(group.getAttribute('aria-labelledby')).toBe(head.id);
		});
	});

	describe('outcome text — renderMd callback (the kit stays app-free)', () => {
		test('without renderMd the md is set as plain text in .dse-pr__text', () => {
			const { rowEls } = mount();
			expect(rowEls[0].querySelector('.dse-pr__text')!.textContent).toBe('3 + M damage');
			expect(rowEls[2].querySelector('.dse-pr__text')!.textContent).toBe(
				'9 + M damage; **bleeding**',
			);
		});

		test('renderMd is invoked once per row with (md, textEl) and owns the rendering', () => {
			const renderMd = jest.fn((md: string, el: HTMLElement) => {
				el.createEl('strong', { text: md.toUpperCase() });
			});
			const { rowEls } = mount({ renderMd });

			expect(renderMd).toHaveBeenCalledTimes(4);
			FOUR_ROWS.forEach((row, i) => {
				const [md, el] = renderMd.mock.calls[i];
				expect(md).toBe(row.md);
				expect(el).toBe(rowEls[i].querySelector('.dse-pr__text'));
			});
			expect(rowEls[0].querySelector('.dse-pr__text strong')!.textContent).toBe('3 + M DAMAGE');
		});

		test('an async renderMd is accepted (fire-and-forget mount)', () => {
			const renderMd = jest.fn(async (md: string, el: HTMLElement) => {
				el.setText(md);
			});
			expect(() => mount({ renderMd })).not.toThrow();
			expect(renderMd).toHaveBeenCalledTimes(4);
		});
	});

	describe('static by default (§2.8 a11y)', () => {
		test('rows are NOT buttons, no radiogroup, no radio role, no aria-checked', () => {
			const { handle, rowEls } = mount();
			for (const row of rowEls) {
				expect(row).not.toBeInstanceOf(HTMLButtonElement);
				expect(row.hasAttribute('role')).toBe(false);
				expect(row.hasAttribute('aria-checked')).toBe(false);
			}
			expect(handle.rootEl.querySelector('[role="radiogroup"]')).toBeNull();
			expect(handle.getSelected()).toBeUndefined();
		});

		test('select() in static mode is a safe no-op', () => {
			const { handle, rowEls } = mount();
			handle.select('mid' as any);
			expect(handle.getSelected()).toBeUndefined();
			expect(rowEls[1].hasAttribute('aria-checked')).toBe(false);
		});
	});

	describe('selectable mode — a TRUE radiogroup of <button role="radio" aria-checked> rows', () => {
		test('rows become <button type="button" role="radio"> inside a radiogroup labelled by the head', () => {
			const { handle, rowEls } = mount({ selectable: true });
			const group = handle.rootEl.querySelector<HTMLElement>('[role="radiogroup"]')!;
			expect(group).not.toBeNull();
			const head = handle.rootEl.querySelector<HTMLElement>('.dse-pr__head')!;
			expect(head.id).not.toBe('');
			expect(group.getAttribute('aria-labelledby')).toBe(head.id);

			for (const row of rowEls) {
				expect(row).toBeInstanceOf(HTMLButtonElement);
				expect(row.getAttribute('type')).toBe('button');
				// A radiogroup's owned elements are radios with aria-checked —
				// never <button aria-pressed> toggles (the ARIA mismatch Task 0 fixed).
				expect(row.getAttribute('role')).toBe('radio');
				expect(group.contains(row)).toBe(true);
				expect(row.hasAttribute('aria-checked')).toBe(true);
				expect(row.hasAttribute('aria-pressed')).toBe(false);
			}
		});

		test('color is never the sole signal: every selectable row still shows its range text', () => {
			const { rowEls } = mount({ selectable: true });
			expect(rowEls[0].textContent).toContain('≤11');
			expect(rowEls[1].textContent).toContain('12-16');
			expect(rowEls[2].textContent).toContain('17+');
			expect(rowEls[3].textContent).toContain('crit');
		});

		test('initial selected → exactly ONE radio aria-checked="true" + roving tabindex 0', () => {
			const { rowEls } = mount({ selectable: true, selected: 'mid' });
			expect(rowEls.map((r) => r.getAttribute('aria-checked'))).toEqual([
				'false',
				'true',
				'false',
				'false',
			]);
			expect(rowEls.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
			expect(rowEls.map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1']);
		});

		test('no initial selection → all unchecked, first row is the single Tab stop', () => {
			const { handle, rowEls } = mount({ selectable: true });
			expect(rowEls.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
			expect(rowEls.map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
			expect(handle.getSelected()).toBeUndefined();
		});

		test('clicking a row selects EXACTLY that tier and fires onSelect once', () => {
			const { handle, rowEls, onSelect } = mount({ selectable: true, selected: 'low' });

			rowEls[2].click();

			expect(onSelect).toHaveBeenCalledTimes(1);
			expect(onSelect).toHaveBeenCalledWith('high');
			expect(handle.getSelected()).toBe('high');
			expect(rowEls.map((r) => r.getAttribute('aria-checked'))).toEqual([
				'false',
				'false',
				'true',
				'false',
			]);
		});

		test('clicking the already-selected row is a no-op (a roll stays resolved)', () => {
			const { rowEls, onSelect } = mount({ selectable: true, selected: 'low' });
			rowEls[0].click();
			expect(onSelect).not.toHaveBeenCalled();
			expect(rowEls[0].getAttribute('aria-checked')).toBe('true');
		});
	});

	describe('selectable keyboard — arrow-key nav (mirrors the tabs roving pattern, §4.4)', () => {
		test('ArrowDown selects the next tier AND focuses it (selection follows focus)', () => {
			const { rowEls, onSelect } = mount({ selectable: true, selected: 'low' });
			rowEls[0].focus();

			keydown(rowEls[0], 'ArrowDown');

			expect(onSelect).toHaveBeenLastCalledWith('mid');
			expect(rowEls[1].getAttribute('aria-checked')).toBe('true');
			expect(document.activeElement).toBe(rowEls[1]);
		});

		test('ArrowRight behaves like ArrowDown; ArrowLeft like ArrowUp', () => {
			const { rowEls, onSelect } = mount({ selectable: true, selected: 'mid' });
			keydown(rowEls[1], 'ArrowRight');
			expect(onSelect).toHaveBeenLastCalledWith('high');
			keydown(rowEls[2], 'ArrowLeft');
			expect(onSelect).toHaveBeenLastCalledWith('mid');
		});

		test('ArrowDown on the LAST row wraps to the first; ArrowUp on the FIRST wraps to the last', () => {
			const { rowEls, onSelect } = mount({ selectable: true, selected: 'crit' });
			keydown(rowEls[3], 'ArrowDown');
			expect(onSelect).toHaveBeenLastCalledWith('low');
			expect(rowEls[0].getAttribute('aria-checked')).toBe('true');

			keydown(rowEls[0], 'ArrowUp');
			expect(onSelect).toHaveBeenLastCalledWith('crit');
			expect(rowEls[3].getAttribute('aria-checked')).toBe('true');
		});

		test('Home selects the first tier; End the last', () => {
			const { rowEls, onSelect } = mount({ selectable: true, selected: 'mid' });
			keydown(rowEls[1], 'End');
			expect(onSelect).toHaveBeenLastCalledWith('crit');
			keydown(rowEls[3], 'Home');
			expect(onSelect).toHaveBeenLastCalledWith('low');
		});

		test('arrow nav works from the UNSELECTED initial state (moves off the focused row)', () => {
			const { rowEls, onSelect } = mount({ selectable: true });
			rowEls[0].focus();
			keydown(rowEls[0], 'ArrowDown');
			expect(onSelect).toHaveBeenLastCalledWith('mid');
			expect(rowEls[1].getAttribute('aria-checked')).toBe('true');
		});

		test('handled keys are preventDefault-ed; other keys pass through untouched', () => {
			const { rowEls, onSelect } = mount({ selectable: true, selected: 'low' });
			expect(keydown(rowEls[0], 'ArrowDown')).toBe(false); // canceled
			expect(keydown(rowEls[1], 'a')).toBe(true); // not canceled
			expect(onSelect).toHaveBeenCalledTimes(1);
		});
	});

	describe('Handle: select(tier) / getSelected — programmatic, in place, silent', () => {
		test('select() updates aria-checked + tabindex without firing onSelect or stealing focus', () => {
			const { handle, rowEls, onSelect } = mount({ selectable: true, selected: 'low' });
			const focusBefore = document.activeElement;

			handle.select('crit' as any);

			expect(handle.getSelected()).toBe('crit');
			expect(rowEls[3].getAttribute('aria-checked')).toBe('true');
			expect(rowEls[3].getAttribute('tabindex')).toBe('0');
			expect(rowEls[0].getAttribute('aria-checked')).toBe('false');
			expect(onSelect).not.toHaveBeenCalled();
			expect(document.activeElement).toBe(focusBefore);
		});

		test('select() with a tier not in rows is a safe no-op', () => {
			const { handle } = mount({ selectable: true, selected: 'low', rows: FOUR_ROWS.slice(0, 3) });
			handle.select('crit' as any);
			expect(handle.getSelected()).toBe('low');
		});
	});

	test('lifecycle: owner.unload() detaches click AND keyboard listeners (F1 §4.5)', () => {
		const owner = fakeOwner();
		const { rowEls, onSelect } = mount({ selectable: true, selected: 'low' }, owner);

		owner.unload();
		rowEls[1].click();
		keydown(rowEls[0], 'ArrowDown');

		expect(onSelect).not.toHaveBeenCalled();
		expect(rowEls[0].getAttribute('aria-checked')).toBe('true'); // unchanged
	});

	describe('tierBadge — standalone (§2.8)', () => {
		test('renders the badge + range text for each tier', () => {
			const parent = document.createElement('div');
			const expected: Array<[string, string, string]> = [
				['low', '--t1', '≤11'],
				['mid', '--t2', '12-16'],
				['high', '--t3', '17+'],
				['crit', '--crit', 'crit'],
			];
			for (const [tier, mod, range] of expected) {
				const badge = tierBadge(parent, tier as any);
				expect(badge.hasClass('dse-pr__badge')).toBe(true);
				expect(badge.hasClass(`dse-pr__badge${mod}`)).toBe(true);
				expect(badge.textContent).toBe(range);
			}
		});
	});
});

describe('Plan 08 Task 4: badge CSS reuses the EXISTING clip-path shapes verbatim (§2.8)', () => {
	const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

	/** First clip-path value after `selector` (the legacy blocks nest it in &:before). */
	function firstClipPathAfter(selector: string): string {
		const idx = sheet.indexOf(selector);
		expect(idx).toBeGreaterThan(-1);
		const m = sheet.slice(idx).match(/clip-path:\s*([^;]+);/);
		expect(m).not.toBeNull();
		return m![1].replace(/\s+/g, ' ').trim();
	}

	test.each([
		['.t1-key-body', '.dse-pr__badge--t1'],
		['.t2-key-body', '.dse-pr__badge--t2'],
		['.t3-key-body', '.dse-pr__badge--t3'],
		['.crit-key-body', '.dse-pr__badge--crit'],
	])('%s polygon === %s polygon', (legacySel, dseSel) => {
		expect(firstClipPathAfter(dseSel)).toBe(firstClipPathAfter(legacySel));
	});

	test('badge fills consume the --dse-tier-* tokens (no color literals)', () => {
		expect(sheet).toMatch(/\.dse-pr__badge--t1[^{]*\{[^}]*var\(--dse-tier-low\)/);
		expect(sheet).toMatch(/\.dse-pr__badge--t2[^{]*\{[^}]*var\(--dse-tier-mid\)/);
		expect(sheet).toMatch(/\.dse-pr__badge--t3[^{]*\{[^}]*var\(--dse-tier-high\)/);
		expect(sheet).toMatch(/\.dse-pr__badge--crit[^{]*\{[^}]*var\(--dse-tier-crit\)/);
	});
});
