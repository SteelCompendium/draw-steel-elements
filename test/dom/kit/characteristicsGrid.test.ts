// D7 Task 1 (spec §2.1/§2.3), rebuilt for SC-152 round 3 — kit/CharacteristicsGrid is
// now the statblock's `.dse-sb__chars` row builder, shared by the statblock, the
// standalone ds-char element and the hero sheet's Characteristics region (Scott,
// 2026-08-22: "they are exactly the same data"). This suite pins the shared core's
// DOM/behavior contract; the per-surface suites (statblock.test.ts,
// characteristics.test.ts, hero tests) pin that each surface renders through it.
import {
	renderCharacteristicsRow,
	formatCharacteristic,
	charsAreSplit,
} from '../../../src/framework/kit/CharacteristicsGrid';

const CHARS = { might: 2, agility: 1, reason: 0, intuition: -1, presence: 3 };

describe('SC-152: kit/CharacteristicsGrid — renderCharacteristicsRow', () => {
	test('merged shape (split: false): ONE .dse-sb__chars of five one-text-node __char cells, signed values', () => {
		const root = document.createElement('div');
		const row = renderCharacteristicsRow(root, CHARS, { split: false });

		expect(root.querySelectorAll('.dse-sb__chars')).toHaveLength(1);
		expect(row.hasClass('dse-sb__chars')).toBe(true);

		const cells = Array.from(row.querySelectorAll('.dse-sb__char'));
		expect(cells).toHaveLength(5);
		// LEGACY-FREEZE contract: one merged text node per cell, no spans — the exact
		// node shape the statblock has always emitted at the merged pref pair.
		for (const cell of cells) {
			expect(cell.children).toHaveLength(0);
		}
		expect(cells.map((c) => c.textContent)).toEqual([
			'Might +2',
			'Agility +1',
			'Reason +0',
			'Intuition -1',
			'Presence +3',
		]);
	});

	test('split shape (split: true): site DOM order box/value/label per cell, boxed letter = label initial', () => {
		const root = document.createElement('div');
		const row = renderCharacteristicsRow(root, CHARS, { split: true });

		const cells = Array.from(row.querySelectorAll('.dse-sb__char'));
		expect(cells).toHaveLength(5);
		for (const cell of cells) {
			expect(Array.from(cell.children).map((el) => el.className)).toEqual([
				'dse-sb__char-box',
				'dse-sb__char-v',
				'dse-sb__char-l',
			]);
		}
		const boxes = Array.from(row.querySelectorAll('.dse-sb__char-box')).map((el) => el.textContent);
		const values = Array.from(row.querySelectorAll('.dse-sb__char-v')).map((el) => el.textContent);
		const labels = Array.from(row.querySelectorAll('.dse-sb__char-l')).map((el) => el.textContent);
		expect(boxes).toEqual(['M', 'A', 'R', 'I', 'P']);
		expect(values).toEqual(['+2', '+1', '+0', '-1', '+3']);
		expect(labels).toEqual(['Might', 'Agility', 'Reason', 'Intuition', 'Presence']);
	});

	test('formatCharacteristic: word/number parity verbatim — signed, N/A for missing', () => {
		expect(formatCharacteristic(2)).toBe('+2');
		expect(formatCharacteristic(0)).toBe('+0');
		expect(formatCharacteristic(-1)).toBe('-1');
		expect(formatCharacteristic(undefined)).toBe('N/A');
		expect(formatCharacteristic(NaN)).toBe('N/A');
	});

	test('SC-5: value_height/name_height opts arrive as --dse-value-scale/--dse-label-scale setProperty geometry, never inline font-size', () => {
		const root = document.createElement('div');
		const row = renderCharacteristicsRow(root, CHARS, {
			split: true,
			valueHeight: 2,
			nameHeight: 1,
		});

		expect(row.style.getPropertyValue('--dse-value-scale')).toBe('2');
		expect(row.style.getPropertyValue('--dse-label-scale')).toBe('1');
		for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
			expect(el.style.fontSize).toBe('');
		}
	});

	test('scale vars are NOT stamped when the caller omits them — the statblock/hero path leaves clean inline style', () => {
		// The pre-rebuild builder stamped String(undefined) — the literal string
		// "undefined" — into both vars on every call. The statblock's row must carry
		// no inline custom properties at all, so its frozen print bytes cannot
		// depend on a stringified absence.
		const root = document.createElement('div');
		const row = renderCharacteristicsRow(root, CHARS, { split: false });
		expect(row.style.getPropertyValue('--dse-value-scale')).toBe('');
		expect(row.style.getPropertyValue('--dse-label-scale')).toBe('');
		expect(row.getAttribute('style')).toBeNull();
	});

	test('onScoreClick is reserved and inert by default; when supplied it fires with the clicked characteristic', () => {
		const root = document.createElement('div');
		renderCharacteristicsRow(root, CHARS, { split: true });
		expect(root.querySelectorAll('.dse-sb__char')).toHaveLength(5);

		const root2 = document.createElement('div');
		const onScoreClick = jest.fn();
		const row2 = renderCharacteristicsRow(root2, CHARS, { split: true, onScoreClick });
		(row2.querySelectorAll('.dse-sb__char')[0] as HTMLElement).dispatchEvent(
			new MouseEvent('click', { bubbles: true }),
		);
		expect(onScoreClick).toHaveBeenCalledWith({ name: 'Might', value: 2 });
	});

	test('charsAreSplit: the one shape resolver — merged only at the exact one/off pair', () => {
		const prefs = (line: string, box: string) => ({
			get: (key: 'sbCharLine' | 'sbCharBox') => (key === 'sbCharLine' ? line : box),
		});
		expect(charsAreSplit(prefs('one', 'off'))).toBe(false);
		expect(charsAreSplit(prefs('two', 'off'))).toBe(true); // the SC-123 default
		expect(charsAreSplit(prefs('one', 'on'))).toBe(true);
		expect(charsAreSplit(prefs('one', 'onword'))).toBe(true);
		expect(charsAreSplit(prefs('two', 'on'))).toBe(true);
	});
});
