// Plan 05 T-2: free-text round-trip golden — the harness serializer must be byte-faithful
// to Obsidian's REAL parseYaml/stringifyYaml, which are the `yaml` npm package (v2) at its
// defaults, NOT js-yaml (D1 Task 3 bundle finding, documented in test/mocks/obsidian.ts).
// The two libraries agree byte-for-byte on scalar-only DTOs (stamina-bar's byte-compat
// suite is the guard for that path) but diverge on LONG FREE-TEXT fields: js-yaml emits
// `>-` block-folded scalars while `yaml` emits plain multi-line flow scalars (continuation
// lines indented). Those free-text shapes are exactly what the upcoming persisted-element
// migrations write to disk — Negotiation motivation/pitfall reasons and i5..i0 interest
// sentences, later Counter labels and Initiative notes — so their byte-compat tests are
// only meaningful once the mock folds like Obsidian does. The golden below is the `yaml`
// package's default output (verified against yaml@2.9.0).
import { parseYaml, stringifyYaml } from '../../mocks/obsidian';

// Mirrors test/fixtures/negotiation/frodo.yaml's field shapes: a long single-line
// motivation reason and an i3 interest sentence (both past the default lineWidth of 80,
// so folding kicks in) plus a genuinely multi-line notes field with an internal blank
// line (exercising the literal-block `|-` path, where the libraries happen to agree).
const FREE_TEXT_DTO = {
	name: 'Convincing Frodo to remember the taste of strawberries',
	motivations: [
		{
			name: 'Higher Authority',
			reason:
				'It is the sworn duty of every hobbit of the Shire to carry the burden to the very fires of Mount Doom, no matter the cost to himself or to those he loves most dearly.',
		},
	],
	i3: 'Remembers the taste of unripe strawberries, though the memory is distant and clouded by the weight of the ring pressing on his mind.',
	notes: 'Line one of the note.\nLine two of the note.\n\nA new paragraph after a blank line.',
};

// Checked-in golden: `yaml` v2 defaults. Long single-line strings stay PLAIN scalars
// folded across lines (no `>-` marker); embedded newlines get a `|-` literal block.
// Built from an array so the blank line inside the literal block is visibly exact.
const GOLDEN =
	[
		'name: Convincing Frodo to remember the taste of strawberries',
		'motivations:',
		'  - name: Higher Authority',
		'    reason: It is the sworn duty of every hobbit of the Shire to carry the burden to',
		'      the very fires of Mount Doom, no matter the cost to himself or to those he',
		'      loves most dearly.',
		'i3: Remembers the taste of unripe strawberries, though the memory is distant and',
		'  clouded by the weight of the ring pressing on his mind.',
		'notes: |-',
		'  Line one of the note.',
		'  Line two of the note.',
		'',
		'  A new paragraph after a blank line.',
	].join('\n') + '\n';

describe('yaml harness fidelity: free-text round-trip golden (Plan 05 T-2)', () => {
	test('stringifyYaml emits the Obsidian-faithful golden (stable, `yaml`-pkg folding)', () => {
		expect(stringifyYaml(FREE_TEXT_DTO)).toBe(GOLDEN);
	});

	test('round-trip: parseYaml(stringifyYaml(dto)) deep-equals the original', () => {
		expect(parseYaml(stringifyYaml(FREE_TEXT_DTO))).toEqual(FREE_TEXT_DTO);
	});

	test('the golden itself parses back to the original (folding is lossless on disk)', () => {
		// This is the property persisted elements actually rely on: the exact bytes
		// Obsidian writes into a note re-parse to the same DTO.
		expect(parseYaml(GOLDEN)).toEqual(FREE_TEXT_DTO);
	});
});
