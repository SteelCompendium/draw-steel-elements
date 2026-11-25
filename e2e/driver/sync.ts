// SC-441 e2e driver: the compendium sync, "Existing compendium folder found" and the pre-7.0.0 migration window, in real Obsidian.
//
// New file on purpose (SC-682 shares driver/*): it builds on dse.ts / state.ts / cleanup.ts / page.ts / settingsDrive.ts without editing them.
// This surface MOVES and TRASHES vault files, so the first thing every scenario does (`startSyncTest`) is prove where it runs:
//   1. O2, `assertDisposableVault()`: the open vault is the runner's temporary copy (wdio-obsidian-service's `getVaultPath()` and the page's own
//      `adapter.basePath` agree, and lie under this run's TMPDIR), never the shipped fixture vault, the repository or a `demo-vault`. Throws.
//   2. O3, `setTrash()`: Obsidian's "Deleted files" option is put on the vault's own `.trash` (`'local'`) or, in the named "Permanently delete"
//      scenarios only, `'none'`, and READ BACK; anything else (`'system'` is Obsidian's default and would put files in the machine's trash)
//      throws before a single file is trashed. The write goes to the disposable copy's `.obsidian/app.json`, never to a tracked file.
//   3. the TRASH CANARY, once per spec session: a throwaway file is trashed through the same `app.fileManager.trashFile` the plugin uses and
//      must turn up under `<vault>/.trash/` on disk. If it does not, no trash scenario runs.
//   4. the network guard / fixture release, `resetSyncTree()` and the pristine-tree assertion (see below).
import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { E2E } from './env';
import { ev, waitFor } from './page';

const PLUGIN = `app.plugins.plugins['draw-steel-elements']`;
const REPO = path.resolve(__dirname, '..', '..');

export type TrashMode = 'local' | 'none';

const real = (p: string): string => fs.realpathSync(p);
const inside = (child: string, parent: string): boolean => child === parent || child.startsWith(parent + path.sep);

/** The vault copy's absolute path on disk, after the O2 checks. Throws unless this is the runner's disposable copy. */
export async function assertDisposableVault(): Promise<string> {
	const fromService = obsidianPage.getVaultPath();
	const fromPage = await ev<string>(`app.vault.adapter.basePath`);
	if (!fromService || !fromPage) throw new Error('O2: could not read the open vault\'s path (service: ' + fromService + ', page: ' + fromPage + ')');
	const base = real(fromPage);
	if (real(fromService) !== base) throw new Error(`O2: the service says the vault is ${fromService} but the page says ${fromPage}`);
	const tmp = real(process.env.TMPDIR ?? os.tmpdir());
	if (!inside(base, tmp)) throw new Error(`O2: the open vault ${base} is not under this run's temp dir ${tmp}`);
	const fixture = real(E2E.fixtureVault);
	if (inside(base, fixture) || inside(fixture, base)) throw new Error(`O2: the open vault ${base} is (or contains) the tracked fixture vault ${fixture}`);
	if (inside(base, REPO) || inside(REPO, base)) throw new Error(`O2: the open vault ${base} overlaps the repository ${REPO}`);
	if (base.split(path.sep).includes('demo-vault') || base === real(os.homedir())) throw new Error(`O2: the open vault ${base} looks like a real vault`);
	if (!fs.existsSync(path.join(base, '.obsidian', 'plugins', 'draw-steel-elements'))) throw new Error(`O2: ${base} holds no staged draw-steel-elements plugin: not the e2e copy`);
	return base;
}

/** Put Obsidian's "Deleted files" option on the vault's `.trash` (or "Permanently delete") and read it back. Never `'system'`. */
export async function setTrash(mode: TrashMode): Promise<void> {
	await ev(`(() => { app.vault.setConfig('trashOption', ${JSON.stringify(mode)}); return true; })()`);
	const now = await ev<unknown>(`app.vault.getConfig('trashOption')`);
	if (now !== mode) throw new Error(`O3: Obsidian's "Deleted files" option reads ${JSON.stringify(now)} after setting ${JSON.stringify(mode)}; no trash scenario may run`);
}

let canaryDone = false;
/** The result of this session's canary (for the report), or null before it ran. */
export let canaryResult: string | null = null;

/** Trash a throwaway file the way the plugin does and prove on disk that it landed in the vault's own `.trash`. Once per session. */
export async function trashCanary(base: string): Promise<void> {
	if (canaryDone) return;
	await setTrash('local');
	const name = `sc441-canary-${crypto.randomBytes(4).toString('hex')}.md`;
	await ev(`(async () => { await app.vault.create(${JSON.stringify(name)}, 'trash canary: safe to delete'); return true; })()`);
	await ev(`(async () => { const f = app.vault.getAbstractFileByPath(${JSON.stringify(name)}); await app.fileManager.trashFile(f); return true; })()`);
	const trashed = path.join(base, '.trash', name);
	await browser.waitUntil(async () => fs.existsSync(trashed), { timeout: 5000, interval: 50, timeoutMsg: `the trash canary: ${name} is not under ${path.join(base, '.trash')} after trashFile` });
	if (fs.existsSync(path.join(base, name))) throw new Error('the trash canary: the file is still in the vault after trashFile');
	canaryDone = true;
	canaryResult = `canary ${name} trashed to ${trashed} (trashOption ${await ev<string>('app.vault.getConfig("trashOption")')})`;
	void waitFor; // (imported for the scenarios below)
}
