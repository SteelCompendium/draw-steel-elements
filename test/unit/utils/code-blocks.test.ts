import { CodeBlocks } from '@utils/CodeBlocks';
import { App, makeFakeContext } from '../../mocks/obsidian';

const NOTE = [
	'# Session notes',
	'',
	'Before text.',
	'',
	'```ds-counter',
	'name: Health',
	'current_value: 10',
	'min_value: 0',
	'```',
	'',
	'After text.',
].join('\n');

describe('T-3: CodeBlocks.updateMarkdownCodeBlock round-trip on the vault fake', () => {
	test('replaces only the target block lines; surrounding note intact', async () => {
		const app = new App();
		app.vault.setFile('Note.md', NOTE);
		const ctx = makeFakeContext(app, 'Note.md');
		await CodeBlocks.updateCodeBlock(
			app as any,
			{ name: 'Health', current_value: 11, min_value: 0 },
			ctx as any,
			'ds-counter',
		);
		const updated = app.vault.getContent('Note.md')!;
		const lines = updated.split('\n');
		expect(lines[0]).toBe('# Session notes');
		expect(lines[2]).toBe('Before text.');
		expect(lines[4]).toBe('```ds-counter');
		expect(updated).toContain('current_value: 11');
		expect(updated).not.toContain('current_value: 10');
		expect(lines[8]).toBe('```');
		expect(lines[10]).toBe('After text.');
		expect(app.vault.modifyCalls).toHaveLength(1);
	});

	test('no-op (no write, no throw) when the block cannot be located', async () => {
		const app = new App();
		app.vault.setFile('Note.md', '# No block here');
		const ctx = makeFakeContext(app, 'Note.md');
		await CodeBlocks.updateCodeBlock(app as any, { a: 1 }, ctx as any, 'ds-counter');
		expect(app.vault.getContent('Note.md')).toBe('# No block here');
		expect(app.vault.modifyCalls).toHaveLength(0);
	});

	test('no-op (console.warn path) when the source file does not exist', async () => {
		const app = new App();
		const ctx = makeFakeContext(app, 'Missing.md');
		await expect(
			CodeBlocks.updateCodeBlock(app as any, { a: 1 }, ctx as any, 'ds-counter'),
		).resolves.toBeUndefined();
		expect(app.vault.modifyCalls).toHaveLength(0);
	});

	// CB-5 (F3 §2.1): every save rewrites the fence language to the canonical
	// form. Correct behavior — preserving the alias the user wrote (OD-2 default)
	// — is encoded here; the fix flips this green (then promote to plain test).
	test.failing('CB-5: preserves the alias fence language the user wrote (ds-it stays ds-it)', async () => {
		const app = new App();
		app.vault.setFile('Note.md', ['```ds-it', 'heroes: []', 'enemy_groups: []', '```'].join('\n'));
		const ctx = makeFakeContext(app, 'Note.md');
		await CodeBlocks.updateCodeBlock(
			app as any,
			{ heroes: [], enemy_groups: [] },
			ctx as any,
			'ds-initiative',
		);
		expect(app.vault.getContent('Note.md')!.split('\n')[0]).toBe('```ds-it');
	});

	// CB-3 (F3 §2.1): vault.read → splice → vault.modify is non-atomic. The
	// vault fake's read() snapshots content then yields a macrotask, so two
	// in-flight updates deterministically interleave and the first write is
	// lost. Fixing CB-3 (Vault.process + per-file queue) flips this green.
	test.failing('CB-3: two concurrent updates to different blocks both survive', async () => {
		const app = new App();
		const note = [
			'```ds-counter',
			'name: A',
			'current_value: 1',
			'```',
			'',
			'```ds-counter',
			'name: B',
			'current_value: 1',
			'```',
		].join('\n');
		app.vault.setFile('Note.md', note);
		const ctxA = makeFakeContext(app, 'Note.md', 0);
		const ctxB = makeFakeContext(app, 'Note.md', 1);
		await Promise.all([
			CodeBlocks.updateCodeBlock(app as any, { name: 'A', current_value: 2 }, ctxA as any, 'ds-counter'),
			CodeBlocks.updateCodeBlock(app as any, { name: 'B', current_value: 2 }, ctxB as any, 'ds-counter'),
		]);
		const updated = app.vault.getContent('Note.md')!;
		expect(updated).toContain('name: A\ncurrent_value: 2');
		expect(updated).toContain('name: B\ncurrent_value: 2');
	});
});
