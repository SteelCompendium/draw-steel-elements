// SC-408 e2e driver: failure artifacts (S2 section 4.5), one bundle per failing test under
// e2e/.out/<run>/<test-id>/. Best-effort throughout: a half-dead session must still leave
// whatever evidence it can, and must never mask the original failure.
import { browser, $ } from '@wdio/globals';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { E2E } from './env';
import { readNote } from './invariants';
import { ev } from './page';
import { eventsSince } from './recorders';
import { readFixture, state } from './state';

type Step = () => unknown;

export async function writeBundle(
	testId: string,
	title: string,
	err: unknown,
	kind: 'failure' | 'known-bug',
): Promise<string> {
	const dir = path.join(E2E.runDir, testId);
	fs.mkdirSync(dir, { recursive: true });
	const errors: string[] = [];
	const step = async (what: string, fn: Step): Promise<void> => {
		try {
			await fn();
		} catch (e) {
			errors.push(`${what}: ${e instanceof Error ? e.message : String(e)}`);
		}
	};
	const put = (name: string, data: string | Buffer): void => fs.writeFileSync(path.join(dir, name), data);

	put(
		'error.txt',
		`${kind}: ${title}\n\n${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
	);

	await step('screenshot', async () => {
		await browser.saveScreenshot(path.join(dir, 'screenshot.png'));
	});
	await step('dse root clip', async () => {
		const root = $('.markdown-reading-view [data-dse-element]');
		if (await root.isExisting()) await root.saveScreenshot(path.join(dir, 'dse-root.png'));
	});
	await step('modal clip', async () => {
		const modal = $('.modal-container .dse-modal');
		if (await modal.isExisting()) await modal.saveScreenshot(path.join(dir, 'modal.png'));
	});
	await step('dom', async () => {
		const html = await ev<{ roots: string[]; modals: string[] }>(`(() => ({
			roots: Array.from(document.querySelectorAll('[data-dse-element]')).filter((r) => !r.parentElement.closest('[data-dse-element]')).map((r) => r.outerHTML),
			modals: Array.from(document.querySelectorAll('.modal-container')).map((m) => m.outerHTML),
		}))()`);
		put('dse-root.html', html.roots.join('\n\n<!-- next root -->\n\n'));
		put('modals.html', html.modals.join('\n\n<!-- next modal -->\n\n'));
	});
	await step('notes before/after + diff', async () => {
		const paths = new Set<string>(state.touched);
		for (const rel of paths) {
			const slug = rel.replace(/[^A-Za-z0-9.]+/g, '_');
			const before = readFixture(rel);
			const after = await readNote(rel);
			put(`note-before.${slug}`, before);
			put(`note-after.${slug}`, after);
			const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dse-e2e-diff-'));
			try {
				fs.writeFileSync(path.join(tmp, 'before'), before);
				fs.writeFileSync(path.join(tmp, 'after'), after);
				const d = spawnSync('diff', ['-u', '--label', `fixture/${rel}`, '--label', `after/${rel}`, path.join(tmp, 'before'), path.join(tmp, 'after')], { encoding: 'utf8' });
				put(`note.${slug}.diff`, d.stdout || '(identical)\n');
			} finally {
				fs.rmSync(tmp, { recursive: true, force: true });
			}
		}
	});
	await step('events since mark', async () => {
		put('events.json', JSON.stringify(await eventsSince(state.mark), null, 2));
	});
	await step('versions', async () => {
		put(
			'versions.json',
			JSON.stringify(
				{
					obsidianApp: browser.getObsidianVersion(),
					obsidianInstaller: browser.getObsidianInstallerVersion(),
					userAgent: await ev('navigator.userAgent'),
					driven: state.drove,
				},
				null,
				2,
			),
		);
	});
	await step('vault copy', async () => {
		// The service deletes its temp vault with the session, so keep a copy of the notes.
		const src = await ev<string>(`app.vault.adapter.basePath`);
		fs.cpSync(src, path.join(dir, 'vault-copy'), {
			recursive: true,
			filter: (p) => !p.includes(`${path.sep}.obsidian${path.sep}plugins`) && !p.endsWith(`${path.sep}workspace.json`),
		});
		put('vault-path.txt', `${src} (copied to ./vault-copy; the original is deleted with the session)\n`);
	});

	if (errors.length) put('artifact-errors.txt', errors.join('\n') + '\n');
	return dir;
}
