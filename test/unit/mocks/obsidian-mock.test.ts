import {
	App,
	FakeVault,
	Notice,
	TFile,
	TFolder,
	makeFakeContext,
	parseYaml,
	stringifyYaml,
} from '../../mocks/obsidian';

describe('obsidian mock: yaml', () => {
	test('parseYaml/stringifyYaml round-trip via js-yaml', () => {
		const obj = { name: 'Health', current_value: 10, nested: { list: [1, 2] } };
		expect(parseYaml(stringifyYaml(obj))).toEqual(obj);
	});

	test('parseYaml of a non-mapping returns the scalar (like Obsidian)', () => {
		expect(parseYaml('just a string')).toBe('just a string');
	});
});

describe('obsidian mock: FakeVault', () => {
	test('setFile + getAbstractFileByPath returns a real TFile instance', () => {
		const vault = new FakeVault();
		const created = vault.setFile('Folder/Note.md', '# hi');
		const found = vault.getAbstractFileByPath('Folder/Note.md');
		expect(found).toBe(created);
		expect(found).toBeInstanceOf(TFile);
		expect((found as TFile).basename).toBe('Note');
		expect((found as TFile).extension).toBe('md');
		expect(vault.getAbstractFileByPath('missing.md')).toBeNull();
	});

	test('read returns content; modify records and overwrites', async () => {
		const vault = new FakeVault();
		const file = vault.setFile('Note.md', 'v1');
		await expect(vault.read(file)).resolves.toBe('v1');
		await vault.modify(file, 'v2');
		expect(vault.getContent('Note.md')).toBe('v2');
		expect(vault.modifyCalls).toEqual([{ path: 'Note.md', content: 'v2' }]);
	});

	test('read snapshots content at call time (models the CB-3 race window)', async () => {
		const vault = new FakeVault();
		const file = vault.setFile('Note.md', 'old');
		const pendingRead = vault.read(file); // snapshot taken now
		await vault.modify(file, 'new');
		await expect(pendingRead).resolves.toBe('old');
	});

	test('process is atomic (no yield between read and write)', async () => {
		const vault = new FakeVault();
		const file = vault.setFile('Note.md', '1');
		await Promise.all([
			vault.process(file, (data) => String(Number(data) + 1)),
			vault.process(file, (data) => String(Number(data) + 1)),
		]);
		expect(vault.getContent('Note.md')).toBe('3');
	});

	test('create / createFolder / delete', async () => {
		const vault = new FakeVault();
		const file = await vault.create('New.md', 'x');
		expect(vault.getContent('New.md')).toBe('x');
		const folder = await vault.createFolder('Dir');
		expect(folder).toBeInstanceOf(TFolder);
		expect(vault.getAbstractFileByPath('Dir')).toBe(folder);
		await vault.delete(file);
		expect(vault.getAbstractFileByPath('New.md')).toBeNull();
	});
});

describe('obsidian mock: metadata cache + app', () => {
	test('getFirstLinkpathDest resolves by basename anywhere in the vault', () => {
		const app = new App();
		const file = app.vault.setFile('Folders/Thorn Dragon.md', 'x');
		expect(app.metadataCache.getFirstLinkpathDest('Thorn Dragon', '')).toBe(file);
		expect(app.metadataCache.getFirstLinkpathDest('Nope', '')).toBeNull();
	});
});

describe('obsidian mock: makeFakeContext.getSectionInfo', () => {
	const NOTE = [
		'# Title',
		'',
		'```ds-counter',
		'name: A',
		'```',
		'',
		'~~~ds-counter',
		'name: B',
		'~~~',
		'',
	].join('\n');

	test('locates the Nth ds-* fenced block (``` and ~~~), lines inclusive of fences', () => {
		const app = new App();
		app.vault.setFile('Note.md', NOTE);
		const ctx0 = makeFakeContext(app, 'Note.md', 0);
		expect(ctx0.getSectionInfo(ctx0.el)).toEqual({ text: NOTE, lineStart: 2, lineEnd: 4 });
		const ctx1 = makeFakeContext(app, 'Note.md', 1);
		expect(ctx1.getSectionInfo(ctx1.el)).toEqual({ text: NOTE, lineStart: 6, lineEnd: 8 });
	});

	test('returns null when no matching block exists', () => {
		const app = new App();
		app.vault.setFile('Note.md', '# no blocks');
		const ctx = makeFakeContext(app, 'Note.md');
		expect(ctx.getSectionInfo(ctx.el)).toBeNull();
	});

	test('re-scans current content on every call (models re-render after write)', async () => {
		const app = new App();
		const file = app.vault.setFile('Note.md', '```ds-counter\nname: A\n```');
		const ctx = makeFakeContext(app, 'Note.md');
		await app.vault.modify(file, 'intro line\n\n```ds-counter\nname: A\n```');
		expect(ctx.getSectionInfo(ctx.el)).toMatchObject({ lineStart: 2, lineEnd: 4 });
	});
});

describe('obsidian mock: Notice recorder', () => {
	test('records constructed notices', () => {
		Notice.notices.length = 0;
		new Notice('hello');
		expect(Notice.notices).toEqual(['hello']);
	});
});
