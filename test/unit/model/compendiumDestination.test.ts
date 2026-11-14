// SC-643 — the Destination folder resolver. An empty field used to be handed to the sync
// engine as-is, which made the VAULT ROOT the compendium folder. Pure table tests: no
// Obsidian mock involved on purpose (the resolver must not lean on `normalizePath`, whose
// real and mocked behaviour differ for './' and which never trims or treats '.' as the root).
import {
	classifyDestinationPath, compendiumFolderPath, isVaultRootFolder, isVaultRootPath,
	resolveCompendiumDestination,
} from '@model/CompendiumDestination';

const DEFAULT_FOLDER = 'DS Compendium';

describe('SC-643 resolveCompendiumDestination — D1: blank is the default folder', () => {
	test.each(['', '   ', '\t \n'])('%j resolves to the default folder', (raw) => {
		expect(resolveCompendiumDestination(raw)).toEqual({ kind: 'folder', path: DEFAULT_FOLDER });
	});

	test('a missing setting (undefined / null) is blank too', () => {
		expect(resolveCompendiumDestination(undefined)).toEqual({ kind: 'folder', path: DEFAULT_FOLDER });
		expect(resolveCompendiumDestination(null)).toEqual({ kind: 'folder', path: DEFAULT_FOLDER });
	});
});

describe('SC-643 resolveCompendiumDestination — D2: anything that normalizes to the vault root is refused', () => {
	test.each(['/', '.', './', '//', ' / ', '\\', '/./', './.', 'a/..', 'a/b/../..', ' . '])(
		'%j is refused as the vault root', (raw) => {
			expect(resolveCompendiumDestination(raw)).toEqual({ kind: 'refused', reason: 'root' });
			expect(compendiumFolderPath(raw)).toBeNull();
		});

	test.each(['..', '../x', 'a/../..', '/../'])('%j is refused as outside the vault', (raw) => {
		expect(resolveCompendiumDestination(raw)).toEqual({ kind: 'refused', reason: 'outside-vault' });
		expect(compendiumFolderPath(raw)).toBeNull();
	});
});

describe('SC-643 resolveCompendiumDestination — real folders normalize, never alter the meaning', () => {
	test.each([
		['DS Compendium', 'DS Compendium'],
		['DS Compendium/', 'DS Compendium'],
		[' My Compendium ', 'My Compendium'],
		['a/b/', 'a/b'],
		['/a/b', 'a/b'],
		['./a//b', 'a/b'],
		['a\\b', 'a/b'],
		['a/./b', 'a/b'],
		['a/x/../b', 'a/b'],
	])('%j resolves to %j', (raw, expected) => {
		expect(resolveCompendiumDestination(raw)).toEqual({ kind: 'folder', path: expected });
		expect(compendiumFolderPath(raw)).toBe(expected);
	});
});

describe('SC-643 classifyDestinationPath / isVaultRootPath — the services\' view (no default substitution)', () => {
	test("an empty RESOLVED path is the vault root: the services never substitute the default", () => {
		expect(classifyDestinationPath('')).toEqual({ kind: 'refused', reason: 'root' });
		expect(isVaultRootPath('')).toBe(true);
		expect(isVaultRootPath('/')).toBe(true);
		expect(isVaultRootPath('.')).toBe(true);
		expect(isVaultRootPath('..')).toBe(true);
	});

	test('a real folder path is not the vault root', () => {
		expect(isVaultRootPath('DS Compendium')).toBe(false);
		expect(isVaultRootPath('a/b')).toBe(false);
	});

	test("isVaultRootFolder: by path, or by Obsidian's own isRoot()", () => {
		expect(isVaultRootFolder({ path: '/' })).toBe(true);
		expect(isVaultRootFolder({ path: '' })).toBe(true);
		expect(isVaultRootFolder({ path: 'DS Compendium' })).toBe(false);
		expect(isVaultRootFolder({ path: 'DS Compendium', isRoot: () => false })).toBe(false);
		expect(isVaultRootFolder({ path: 'weird', isRoot: () => true })).toBe(true);
	});
});
