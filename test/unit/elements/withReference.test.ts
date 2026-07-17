// D6 Task 3 (spec §1.3) — detectWholeBlockRef: is the block body a whole-block reference,
// or inline YAML data?
import { detectWholeBlockRef } from '@/elements/shared/withReference';
import { parseYaml } from 'obsidian';

/**
 * NOTE (adapted from the brief): a bare, unquoted `@Homebrew/Fireball` body is NOT valid
 * YAML on its own — `@` is a reserved plain-scalar start character (yaml v2, the library
 * Obsidian's real parseYaml wraps; confirmed directly against the `yaml` package). The real
 * pipeline's own `parseYaml(source)` call (pipeline.ts step 2, upstream of any
 * ElementDefinition.parse) would already throw a parse-stage error for that literal body —
 * a pre-existing framework-level gap outside this file's scope. `detectWholeBlockRef` itself
 * doesn't need `data` for the prefixed-form checks (`raw`-only), so this helper tolerates a
 * parseYaml throw and falls back to `data: undefined` to exercise the pure function in
 * isolation, matching what a defensive caller would do.
 */
function detect(raw: string): string | null {
	let data: unknown;
	try {
		data = parseYaml(raw);
	} catch {
		data = undefined;
	}
	return detectWholeBlockRef(data, raw);
}
const CODE = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';

describe('detectWholeBlockRef (spec §1.3)', () => {
	test('prefixed scc.v1: / scc: forms are refs, returned verbatim', () => {
		expect(detect(`scc.v1:${CODE}`)).toBe(`scc.v1:${CODE}`);
		expect(detect(`scc:${CODE}`)).toBe(`scc:${CODE}`);
	});
	test('@path and [[wikilink]] are refs (legacy forms preserved)', () => {
		expect(detect('@Homebrew/Fireball')).toBe('@Homebrew/Fireball');
		expect(detect('[[Thorn Dragon]]')).toBe('[[Thorn Dragon]]');
	});
	test('a bare scalar slug is a ref (bare-code sugar)', () => {
		expect(detect('goblin-stinker')).toBe('goblin-stinker');
		expect(detect('panther')).toBe('panther');
	});
	test('a full source/type/item scalar (contains /) is a ref', () => {
		expect(detect(CODE)).toBe(CODE);
	});
	test('inline YAML mapping is NOT a ref (returns null)', () => {
		expect(detect('name: Custom\ncontent: hi')).toBeNull();
	});
	test('empty / whitespace body is not a ref', () => {
		expect(detect('')).toBeNull();
		expect(detect('   ')).toBeNull();
	});
});
