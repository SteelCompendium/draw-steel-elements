import { createReferenceService } from '../../../src/framework/seams/refs';
import type { ReferenceService, RefProvider, ResolvedRef } from '../../../src/framework/seams/refs';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App } from '../../mocks/obsidian';

const GOBLIN_NOTE = ['# Goblin', '', '```ds-sb', 'name: Goblin', 'stamina: "20"', '```'].join('\n');

function makeService(): { app: App; service: ReferenceService } {
	const app = new App();
	const service = createReferenceService(app as any, DEFAULT_SETTINGS);
	return { app, service };
}

// F1 §3.7: ReferenceService generalizes ReferenceResolver into a provider chain.
// Built-ins: at-path (@path) and wikilink ([[...]]) port the legacy 5-step findFile
// fallback + first-ds-block extraction. The "scc" slot is reserved for F2.
describe('T-3 (Plan 02): ReferenceService (F1 §3.7)', () => {
	describe('built-in providers resolve to the first ds-block payload', () => {
		test('@path resolves via the at-path provider', async () => {
			const { app, service } = makeService();
			app.vault.setFile('Goblin.md', GOBLIN_NOTE);
			await expect(service.resolve('@Goblin', 'Notes/Source.md')).resolves.toEqual({
				data: { name: 'Goblin', stamina: '20' },
				file: app.vault.getAbstractFileByPath('Goblin.md'),
			});
		});

		test('[[wikilink]] resolves via the wikilink provider', async () => {
			const { app, service } = makeService();
			app.vault.setFile('Goblin.md', GOBLIN_NOTE);
			await expect(service.resolve('[[Goblin]]', 'Notes/Source.md')).resolves.toEqual({
				data: { name: 'Goblin', stamina: '20' },
				file: app.vault.getAbstractFileByPath('Goblin.md'),
			});
		});

		test('at-path honors the legacy 5-step findFile fallback (compendium dir)', async () => {
			const { app, service } = makeService();
			app.vault.setFile('DS Compendium/Bestiary/Goblin.md', GOBLIN_NOTE);
			const resolved = await service.resolve('@Bestiary/Goblin', 'Notes/Source.md');
			expect(resolved.data).toEqual({ name: 'Goblin', stamina: '20' });
		});

		test('wikilink honors metadata-cache lookup by bare name anywhere in the vault', async () => {
			const { app, service } = makeService();
			app.vault.setFile('Deep/Folders/Thorn Dragon.md', GOBLIN_NOTE);
			const resolved = await service.resolve('[[Thorn Dragon]]', 'Notes/Source.md');
			expect(resolved.data).toMatchObject({ name: 'Goblin' });
		});

		test('extracts the FIRST ds-* block only', async () => {
			const { app, service } = makeService();
			const note = ['```ds-sb', 'name: First', '```', '', '```ds-sb', 'name: Second', '```'].join('\n');
			app.vault.setFile('Two.md', note);
			const resolved = await service.resolve('@Two', 'Notes/Source.md');
			expect(resolved.data).toEqual({ name: 'First' });
		});

		test('missing file rejects naming the searched locations', async () => {
			const { service } = makeService();
			await expect(service.resolve('@Nope', 'Notes/Source.md')).rejects.toThrow(
				'Reference file (Nope) not found in root, DS Compendium, or when searching the cache',
			);
		});

		test('file without a ds-* block rejects with the contract message', async () => {
			const { app, service } = makeService();
			app.vault.setFile('Empty.md', '# nothing here');
			await expect(service.resolve('@Empty', 'Notes/Source.md')).rejects.toThrow(
				'No Draw Steel Elements code block (ds-*) found in Empty.md',
			);
		});
	});

	describe('register(provider): override order', () => {
		test('a registered provider wins over the built-in at-path provider for the same raw shape', async () => {
			const { app, service } = makeService();
			app.vault.setFile('Goblin.md', GOBLIN_NOTE);

			const custom: RefProvider = {
				kind: 'at-path',
				canResolve: (raw) => raw.startsWith('@'),
				resolve: async () => ({ data: { name: 'Custom Override' } }),
			};
			service.register(custom);

			await expect(service.resolve('@Goblin', 'Notes/Source.md')).resolves.toEqual({
				data: { name: 'Custom Override' },
			});
		});

		test('unregister restores built-in behavior', async () => {
			const { app, service } = makeService();
			app.vault.setFile('Goblin.md', GOBLIN_NOTE);

			const custom: RefProvider = {
				kind: 'at-path',
				canResolve: (raw) => raw.startsWith('@'),
				resolve: async () => ({ data: { name: 'Custom Override' } }),
			};
			const unregister = service.register(custom);
			unregister();

			const resolved = await service.resolve('@Goblin', 'Notes/Source.md');
			expect(resolved.data).toEqual({ name: 'Goblin', stamina: '20' });
		});

		test('a later-registered provider wins over an earlier-registered one', async () => {
			const { service } = makeService();

			const first: RefProvider = {
				kind: 'custom',
				canResolve: (raw) => raw.startsWith('#'),
				resolve: async () => ({ data: 'first' }),
			};
			const second: RefProvider = {
				kind: 'custom',
				canResolve: (raw) => raw.startsWith('#'),
				resolve: async () => ({ data: 'second' }),
			};
			service.register(first);
			service.register(second);

			const resolved = await service.resolve('#anything', 'Notes/Source.md');
			expect(resolved.data).toBe('second');
		});

		test('a registered custom provider can serve an entirely new ref kind', async () => {
			const { service } = makeService();
			const custom: RefProvider = {
				kind: 'http',
				canResolve: (raw) => raw.startsWith('http://') || raw.startsWith('https://'),
				resolve: async (req) => ({ data: { url: req.raw } }),
			};
			service.register(custom);

			const resolved = await service.resolve('https://example.com/goblin', 'Notes/Source.md');
			expect(resolved.data).toEqual({ url: 'https://example.com/goblin' });
		});
	});

	describe('scc slot is reserved (F2 fills it later)', () => {
		test('bare "scc:" ref with no registered provider yields the standard unresolved error', async () => {
			const { service } = makeService();
			await expect(service.resolve('scc:mcdm.heroes.v1/class/shadow', 'Notes/Source.md')).rejects.toThrow();
		});

		test('"scc.v1:" ref with no registered provider yields the standard unresolved error', async () => {
			const { service } = makeService();
			await expect(service.resolve('scc.v1:mcdm.heroes.v1/class/shadow', 'Notes/Source.md')).rejects.toThrow();
		});

		test('registering a real scc provider satisfies scc: refs (override order applies to reserved slot too)', async () => {
			const { service } = makeService();
			const sccProvider: RefProvider = {
				kind: 'scc',
				canResolve: (raw) => /^scc(\.v\d+)?:/.test(raw),
				resolve: async (req) => {
					const bare = req.raw.replace(/^scc(\.v\d+)?:/, '');
					const result: ResolvedRef = { data: { id: bare }, scc: bare };
					return result;
				},
			};
			service.register(sccProvider);

			const resolved = await service.resolve('scc.v1:mcdm.heroes.v1/class/shadow', 'Notes/Source.md');
			expect(resolved.scc).toBe('mcdm.heroes.v1/class/shadow');
			expect(resolved.data).toEqual({ id: 'mcdm.heroes.v1/class/shadow' });
		});
	});

	describe('resolveDeep', () => {
		test('walks nested arrays and objects, replacing resolvable strings with resolved data', async () => {
			const { app, service } = makeService();
			app.vault.setFile('Goblin.md', GOBLIN_NOTE);
			app.vault.setFile('Orc.md', ['```ds-sb', 'name: Orc', '```'].join('\n'));

			const input = {
				title: 'Encounter',
				count: 3,
				creatures: ['@Goblin', '[[Orc]]', 'not-a-reference'],
				nested: { boss: '@Goblin', flags: [true, null] },
			};

			await expect(service.resolveDeep(input, 'Notes/Source.md')).resolves.toEqual({
				title: 'Encounter',
				count: 3,
				creatures: [{ name: 'Goblin', stamina: '20' }, { name: 'Orc' }, 'not-a-reference'],
				nested: { boss: { name: 'Goblin', stamina: '20' }, flags: [true, null] },
			});
		});

		test('non-string primitives pass through untouched', async () => {
			const { service } = makeService();
			await expect(service.resolveDeep(42, 'Notes/Source.md')).resolves.toBe(42);
			await expect(service.resolveDeep(null, 'Notes/Source.md')).resolves.toBeNull();
			await expect(service.resolveDeep(true, 'Notes/Source.md')).resolves.toBe(true);
		});

		test('an scc-shaped string inside nested data rejects the whole walk (unresolvable, not silently dropped)', async () => {
			const { service } = makeService();
			await expect(
				service.resolveDeep({ ref: 'scc:mcdm.heroes.v1/class/shadow' }, 'Notes/Source.md'),
			).rejects.toThrow();
		});
	});
});
