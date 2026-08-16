// SC-147 / SC-148 — the two user-reported insert-command failures, pinned end to end.
//
// Both tickets were filed 2026-08-11 against the SAME entry (`Coat the Blade`, a `type:
// ability` file) and the same root cause: no TYPE_ADAPTER claimed `ability`, so
//   - the fence came from the old `typeToAlias` fallback -> ```ds-rule (SC-148), and
//   - `entity.model()` returned undefined, so the snapshot path fell back to dumping the
//     resolved file's RAW BODY — which itself contains a ```ds-feature fence, producing the
//     double-wrapped block Scott pasted (SC-147).
// SC-141 widened FEATURE_TYPE_RE to `/^(feature|ability|trait)($|\.)/` and SC-149 replaced
// `typeToAlias` with `referenceAliasForType`/`snapshotAliasForType`, which together killed
// both. These tests pin the USER-VISIBLE outcome of each report so neither can come back
// through a different mechanism.
//
// Deliberately end-to-end over the REAL corpus bytes (`test/fixtures/md-dse/.../
// coat-the-blade.md`, copied verbatim from data-unified) rather than a hand-made entry:
// every pre-existing feature fixture was a `type: feature` file, which is exactly how the
// gap stayed invisible until a user hit it.
import { parseYaml } from 'obsidian';
import type { Editor } from 'obsidian';
import { insertFullBlock, insertReferenceBlock } from '@/authoring/compendiumInsert';
import { referenceAliasForType, snapshotAliasForType } from '@/services/typeAdapters';
import { makeCompendiumDeps, loadMdDseFixture } from '../elements/_refHarness';

const CODE = 'mcdm.heroes.v1/feature.ability.shadow.level-1/coat-the-blade';
const FIXTURE = 'feature/ability/shadow/level-1/coat-the-blade.md';

/** The one Editor method both insert paths use; captures what landed in the note. */
function fakeEditor(): Editor & { written: string } {
	const editor = {
		written: '',
		replaceSelection(text: string) {
			(editor as { written: string }).written += text;
		},
	};
	return editor as unknown as Editor & { written: string };
}

function harness() {
	const { index, vault } = makeCompendiumDeps();
	loadMdDseFixture(vault, FIXTURE);
	return index;
}

/** Every ``` fence marker in the text, so "how many blocks is this" is a real assertion. */
function fenceLines(text: string): string[] {
	return text.split('\n').filter((line) => line.trimStart().startsWith('```'));
}

describe('SC-148 — "Insert compendium reference" on an ability', () => {
	it('emits ONE ds-feature fence whose body is the bare code (was: ```ds-rule)', async () => {
		const index = harness();
		const entry = index.getEntry(CODE);
		expect(entry).not.toBeNull();
		// The reported symptom's proximate cause: the type -> fence mapping.
		expect(entry!.type).toBe('ability');
		expect(referenceAliasForType(entry!.type)).toBe('ds-feature');

		const editor = fakeEditor();
		insertReferenceBlock(editor, entry!);

		const fences = fenceLines(editor.written);
		expect(fences).toHaveLength(2); // open + close, i.e. exactly one block
		expect(fences[0]).toBe('```ds-feature');
		expect(editor.written).not.toContain('ds-rule');
		expect(editor.written.trim()).toBe(['```ds-feature', CODE, '```'].join('\n'));
	});

	it('inserts a reference the compendium can actually resolve and render', async () => {
		// SC-148's second half: the ```ds-rule block ALSO error-carded with "(type:
		// ability) predates the required block; re-sync" — the model lookup, not just the
		// fence. Pin that the inserted code resolves to a real typed model, which is what
		// RefUnwrapView needs to mount a card instead of that error.
		const index = harness();
		const entity = await index.getEntity(CODE);
        expect(entity).not.toBeNull();
		expect(entity!.name).toBe('Coat the Blade');
		await expect(entity!.model()).resolves.toBeDefined();
	});
});

describe('SC-147 — "Insert compendium block (snapshot)" on an ability', () => {
	it('emits ONE ds-feature fence, never a fence nested inside a fence', async () => {
		const index = harness();
		const entity = await index.getEntity(CODE);
		expect(snapshotAliasForType(entity!.type)).toBe('ds-feature');

		const editor = fakeEditor();
		await expect(insertFullBlock(editor, entity!)).resolves.toBe(true);

		const fences = fenceLines(editor.written);
		// The regression was FOUR fence lines: ```ds-rule wrapping a whole ```ds-feature
		// block dumped from the file body.
		expect(fences).toHaveLength(2);
		expect(fences[0]).toBe('```ds-feature');
		expect(editor.written).not.toContain('ds-rule');
	});

	it('emits parseable single-level YAML, not the file body', async () => {
		const index = harness();
		const entity = await index.getEntity(CODE);
		const editor = fakeEditor();
		await insertFullBlock(editor, entity!);

		const body = editor.written.replace(/^```ds-feature\n/, '').replace(/\n```\s*$/, '');
		const parsed = parseYaml(body) as Record<string, unknown>;
		expect(parsed.name).toBe('Coat the Blade');
		expect(parsed.type).toBe('feature');
		expect(parsed.feature_type).toBe('ability');
		// The body a user edits must be the MODEL, not the raw file: no frontmatter
		// delimiters, no second fence, no `scc:` transport key at the top level.
		expect(body).not.toContain('---');
		expect(body).not.toContain('```');
		expect(parsed.scc).toBeUndefined();
	});
});
