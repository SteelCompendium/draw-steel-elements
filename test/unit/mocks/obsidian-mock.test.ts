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
	test('parseYaml/stringifyYaml round-trip via the yaml package (Obsidian-faithful)', () => {
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

	// SC-456: the fake used to match only `^[`~]{3,}ds-[\w-]+\s*$`, so any write-test note with an info string,
	// a space before the type or a quote prefix had no block at all.
	test('recognises the product fence forms: info string, space before the type, quote prefix, 4-backtick run, CRLF', () => {
		const note = [
			'```ds-counter extra words', 'a: 1', '```', '',
			'``` ds-counter', 'a: 2', '```', '',
			'> [!note]', '> ~~~ds-counter  x', '> a: 3', '> ~~~', '',
			'````ds-counter', '```', 'a: 4', '```', '````', '',
			'```ds-counter\r', 'a: 5\r', '```\r',
		].join('\n');
		const app = new App();
		app.vault.setFile('Note.md', note);
		const at = (n: number) => {
			const ctx = makeFakeContext(app, 'Note.md', n);
			return ctx.getSectionInfo(ctx.el);
		};
		expect([0, 1, 2, 3, 4].map((n) => [at(n)?.lineStart, at(n)?.lineEnd])).toEqual([[0, 2], [4, 6], [9, 11], [13, 17], [19, 21]]);
		expect(at(0)?.text).toBe(note); // the whole note, info string and all
		expect(at(5)).toBeNull();
	});

	test('a quoted fence ends with its quote (the later quoted ``` closes nothing); a ds line inside a ```md fence is body (SC-456)', () => {
		const app = new App();
		const note = ['> [!note]', '> ```ds-counter', '> a: 1', '', '```ds-counter', 'b: 1', '```', '', '> ```', '', '```md', '```ds-counter', 'c: 1', '```'].join('\n');
		app.vault.setFile('Note.md', note);
		const at = (n: number) => {
			const ctx = makeFakeContext(app, 'Note.md', n);
			return ctx.getSectionInfo(ctx.el);
		};
		expect(at(0)).toMatchObject({ lineStart: 4, lineEnd: 6 });
		expect(at(1)).toBeNull();
	});

	test('ignores a non-ds fence and an unclosed ds fence', () => {
		const app = new App();
		app.vault.setFile('Note.md', '```js\nx\n```\n```ds-counter\na: 1');
		const ctx = makeFakeContext(app, 'Note.md');
		expect(ctx.getSectionInfo(ctx.el)).toBeNull();
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
