import { ReferenceResolver } from '@utils/ReferenceResolver';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App } from '../../mocks/obsidian';

const GOBLIN_NOTE = ['# Goblin', '', '```ds-sb', 'name: Goblin', 'stamina: "20"', '```'].join('\n');
const DECOY_NOTE = ['# Decoy', '', '```ds-sb', 'name: Decoy', 'stamina: "99"', '```'].join('\n');

function makeResolver() {
	const app = new App();
	const resolver = new ReferenceResolver(app as any, DEFAULT_SETTINGS);
	return { app, resolver };
}

describe('T-8: ReferenceResolver.findFile 5-step fallback chain (via resolvePath)', () => {
	test('step 1: exact path from vault root', async () => {
		const { app, resolver } = makeResolver();
		// Add decoy file FIRST (same basename, different folder) to force step 5 to find it
		// if step 1 doesn't fire. Then add the target file to ensure steps 1/2 find it.
		app.vault.setFile('Decoy/Goblin.md', DECOY_NOTE);
		app.vault.setFile('Goblin.md', GOBLIN_NOTE);
		await expect(resolver.resolvePath('Goblin.md')).resolves.toEqual({ name: 'Goblin', stamina: '20' });
	});

	test('step 2: root path with .md appended', async () => {
		const { app, resolver } = makeResolver();
		// Add decoy file FIRST (same basename, different folder) to force step 5 to find it
		// if step 2 doesn't fire. Then add the target file to ensure steps 1/2 find it.
		app.vault.setFile('Decoy/Goblin.md', DECOY_NOTE);
		app.vault.setFile('Goblin.md', GOBLIN_NOTE);
		await expect(resolver.resolvePath('Goblin')).resolves.toEqual({ name: 'Goblin', stamina: '20' });
	});

	test('step 3: path under the compendium directory', async () => {
		const { app, resolver } = makeResolver();
		app.vault.setFile('DS Compendium/Bestiary/Goblin.md', GOBLIN_NOTE);
		await expect(resolver.resolvePath('Bestiary/Goblin.md')).resolves.toMatchObject({ name: 'Goblin' });
	});

	test('step 4: compendium path with .md appended', async () => {
		const { app, resolver } = makeResolver();
		app.vault.setFile('DS Compendium/Bestiary/Goblin.md', GOBLIN_NOTE);
		await expect(resolver.resolvePath('Bestiary/Goblin')).resolves.toMatchObject({ name: 'Goblin' });
	});

	test('step 5: metadata-cache lookup by bare name anywhere in the vault', async () => {
		const { app, resolver } = makeResolver();
		app.vault.setFile('Deep/Folders/Thorn Dragon.md', GOBLIN_NOTE);
		await expect(resolver.resolvePath('Thorn Dragon')).resolves.toMatchObject({ name: 'Goblin' });
	});

	test('not found: error names all searched locations', async () => {
		const { resolver } = makeResolver();
		await expect(resolver.resolvePath('Nope')).rejects.toThrow(
			'Reference file (Nope) not found in root, DS Compendium, or when searching the cache',
		);
	});
});

describe('T-8: first-ds-block extraction', () => {
	test('extracts the FIRST ds-* block only', async () => {
		const { app, resolver } = makeResolver();
		const note = ['```ds-sb', 'name: First', '```', '', '```ds-sb', 'name: Second', '```'].join('\n');
		app.vault.setFile('Two.md', note);
		await expect(resolver.resolvePath('Two')).resolves.toEqual({ name: 'First' });
	});

	test('~~~ fences are matched too', async () => {
		const { app, resolver } = makeResolver();
		app.vault.setFile('Tilde.md', ['~~~ds-sb', 'name: Orc', '~~~'].join('\n'));
		await expect(resolver.resolvePath('Tilde')).resolves.toEqual({ name: 'Orc' });
	});

	test('file without any ds-* block throws the contract message', async () => {
		const { app, resolver } = makeResolver();
		app.vault.setFile('Empty.md', '# nothing here');
		await expect(resolver.resolvePath('Empty')).rejects.toThrow(
			'No Draw Steel Elements code block (ds-*) found in Empty.md',
		);
	});
});

describe('T-8: resolveReferences reference syntaxes', () => {
	test('strips @ prefix and [[ ]] wrapping; plain strings resolve as paths', async () => {
		const { app, resolver } = makeResolver();
		app.vault.setFile('Goblin.md', GOBLIN_NOTE);
		await expect(resolver.resolveReferences('@Goblin')).resolves.toMatchObject({ name: 'Goblin' });
		await expect(resolver.resolveReferences('[[Goblin]]')).resolves.toMatchObject({ name: 'Goblin' });
		await expect(resolver.resolveReferences('Goblin')).resolves.toMatchObject({ name: 'Goblin' });
	});

	test('non-string data passes through untouched', async () => {
		const { resolver } = makeResolver();
		await expect(resolver.resolveReferences(42)).resolves.toBe(42);
		await expect(resolver.resolveReferences(null)).resolves.toBeNull();
	});
});
