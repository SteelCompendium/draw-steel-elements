#!/usr/bin/env node
// visual-harness/obsidian-lifecycle.mjs — SC-343 (spec SC-340 §10.2, Scott's ruling 4):
// the headless real-Obsidian gate for the block WRITE LIFECYCLE — what jest cannot see,
// because only real Obsidian re-draws a section after a write and unloads the old one.
//
// Launches an isolated Obsidian (own Xvfb display :160–:199, own CDP port, own
// --user-data-dir, SCRATCH copy of demo-vault with the FIXTURES below), attaches over raw
// CDP (Node >= 22 built-in WebSocket, falling back to the 'ws' package — see
// obsidian-camera.mjs for why not Playwright), runs SCENARIOS in order, prints one ok/FAIL
// line per scenario and a final done line.
// Exit 0 = every scenario ok; 1 = a scenario failed; 2 = the environment is unusable.
//
// SC-343 scenarios: identical twin blocks (section path and durable path), the flush after
// navigate-away (SC-336) and after leaf close, and the Notice on a dropped write.
// SC-340 appends its view-adoption scenarios to FIXTURES/SCENARIOS.
//
// Usage: npm run obsidian-lifecycle   (builds the plugin first)
//        node visual-harness/obsidian-lifecycle.mjs [--only=G-S7a,G-S6a]
// Env:   XVFB_BIN, DSE_LIFECYCLE_BIN (default /usr/bin/obsidian), DSE_LIFECYCLE_PORT (9262),
//        DSE_LIFECYCLE_BUNDLE (dir holding main.js/styles.css/manifest.json; default: this repo)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const BIN = process.env.DSE_LIFECYCLE_BIN ?? '/usr/bin/obsidian';
const PORT = Number(process.env.DSE_LIFECYCLE_PORT ?? 9262);
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dse-obsidian-lifecycle-'));
const vault = path.join(work, 'vault');
const udd = path.join(work, 'udd');
const shotsDir = path.join(work, 'shots');
const VAULT_ID = 'dselifecycle0001';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const envFail = (msg) => {
	console.log(`OBSIDIAN-LIFECYCLE environment: ${msg}`);
	process.exit(2);
};

// ------------------------------------------------------------------------- fixtures
const fence = (lang, lines) => ['```' + lang, ...lines, '```'].join('\n');
const COUNTER = (value = 10, name = 'Health') =>
	fence('ds-counter', [`name: ${name}`, `current_value: ${value}`, 'max_value: 20', 'min_value: 0']);

const FIXTURES = {
	'Lifecycle/twins.md': `# twins\n\nTOP\n\n${COUNTER(5, 'Twin')}\n\nMID\n\n${COUNTER(5, 'Twin')}\n\nBOTTOM\n`,
	'Lifecycle/counter.md': `# counter\n\nABOVE\n\n${COUNTER(10)}\n\nBELOW\n`,
	'Lifecycle/other.md': '# other\n\nJust another note.\n',
};

// ------------------------------------------------------------------ note integrity
/** Every fence closed, the block count unchanged, no stray text outside fences. */
function scanOutside(text) {
	let inFence = false;
	let opens = 0;
	const outside = [];
	for (const line of text.split('\n')) {
		if (/^```/.test(line)) {
			if (!inFence) {
				inFence = true;
				opens++;
			} else if (line.trim() === '```') inFence = false;
			continue;
		}
		if (!inFence && line.trim()) outside.push(line);
	}
	return { inFence, opens, outside };
}

// --------------------------------------------------------------------- Xvfb / CDP
/** Xvfb, in preference order: explicit env, PATH, this repo's devbox profile (as docs-shots.mjs). */
function resolveXvfb() {
	if (process.env.XVFB_BIN && fs.existsSync(process.env.XVFB_BIN)) return process.env.XVFB_BIN;
	const onPath = spawnSync('which', ['Xvfb'], { encoding: 'utf8' });
	if (onPath.status === 0 && onPath.stdout.trim()) return onPath.stdout.trim();
	const devboxBin = path.join(repo, '.devbox', 'nix', 'profile', 'default', 'bin', 'Xvfb');
	if (fs.existsSync(devboxBin)) return devboxBin;
	const install = spawnSync('devbox', ['install'], { cwd: repo, stdio: 'inherit' });
	if (install.status === 0 && fs.existsSync(devboxBin)) return devboxBin;
	return null;
}
async function startXvfb() {
	const bin = resolveXvfb();
	if (!bin) envFail('Xvfb not found (set XVFB_BIN or run `devbox install` in draw-steel-elements)');
	let num = -1;
	for (let n = 160; n < 200; n++) {
		if (!fs.existsSync(`/tmp/.X11-unix/X${n}`) && !fs.existsSync(`/tmp/.X${n}-lock`)) {
			num = n;
			break;
		}
	}
	if (num < 0) envFail('no free X display in :160–:199');
	const child = spawn(bin, [`:${num}`, '-screen', '0', '1600x1200x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
	child.on('error', () => {});
	for (let i = 0; i < 40; i++) {
		if (fs.existsSync(`/tmp/.X11-unix/X${num}`)) return { child, display: `:${num}` };
		await sleep(250);
	}
	envFail(`Xvfb did not start on :${num}`);
}
class Cdp {
	constructor(ws) {
		this.ws = ws;
		this.id = 0;
		this.pending = new Map();
		ws.onmessage = (e) => {
			const m = JSON.parse(e.data);
			if (m.id === undefined) return;
			const p = this.pending.get(m.id);
			if (!p) return;
			this.pending.delete(m.id);
			if (m.error) p.reject(new Error(`${p.method}: ${m.error.message}`));
			else p.resolve(m.result);
		};
	}
	static async connect(url) {
		// Node >= 22 has a native WebSocket client; fall back to the 'ws' package (as
		// obsidian-camera.mjs does) on earlier runtimes.
		const WS = globalThis.WebSocket ?? (await import('ws')).default;
		const ws = new WS(url);
		await new Promise((res, rej) => {
			ws.onopen = res;
			ws.onerror = () => rej(new Error('CDP websocket failed'));
		});
		return new Cdp(ws);
	}
	call(method, params = {}) {
		const id = ++this.id;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject, method });
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}
}

// ----------------------------------------------------------------- page helpers
const PAGE_HELPERS = `(() => {
  if (window.__lc) return true;
  const lc = window.__lc = { mods: [], notices: [], errs: [], n: 0 };
  app.vault.on('modify', (f) => lc.mods.push({ n: ++lc.n, path: f.path }));
  const seenNotices = new WeakSet();
  new MutationObserver((records) => {
    for (const r of records) for (const node of r.addedNodes) {
      if (node.nodeType !== 1) continue;
      const els = node.classList.contains('notice') ? [node] : Array.from(node.querySelectorAll('.notice'));
      for (const el of els) {
        if (seenNotices.has(el)) continue; // Obsidian can re-parent a notice element while stacking
        seenNotices.add(el);
        const text = el.textContent;
        // Host chrome (e.g. Obsidian's own "Update Available" banner) can fire on this
        // machine's install independently of anything under test; only DSE's own Notices
        // are within this gate's scope.
        if (text.startsWith('Draw Steel Elements:')) lc.notices.push({ n: ++lc.n, text });
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('error', (e) => lc.errs.push({ n: ++lc.n, text: String(e.message) }));
  window.addEventListener('unhandledrejection', (e) => lc.errs.push({ n: ++lc.n, text: 'rejection: ' + String(e.reason && (e.reason.stack || e.reason)) }));
  const origError = console.error.bind(console);
  console.error = (...a) => { lc.errs.push({ n: ++lc.n, text: 'console.error: ' + a.map((x) => (x && x.stack) || String(x)).join(' ') }); origError(...a); };
  return true;
})()`;

function makeHarness(cdp) {
	const t = {
		cdp,
		sleep,
		async ev(expr) {
			const r = await cdp.call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
			if (r.exceptionDetails) throw new Error(`page eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
			return r.result?.value;
		},
		async waitFor(expr, what, timeoutMs = 15000) {
			const t0 = Date.now();
			for (;;) {
				if (await t.ev(expr)) return;
				if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${what}`);
				await sleep(80);
			}
		},
		async open(rel, leafExpr = 'app.workspace.getMostRecentLeaf()') {
			await t.ev(`(async () => { const leaf = ${leafExpr}; await leaf.setViewState({ type: 'markdown', state: { file: ${JSON.stringify(rel)}, mode: 'preview' }, active: true }); })()`);
			await t.waitFor(`(${leafExpr})?.view?.file?.path === ${JSON.stringify(rel)}`, `open ${rel}`);
			await sleep(700);
		},
		async reset(rel) {
			await t.ev(`(async () => { await app.vault.modify(app.vault.getAbstractFileByPath(${JSON.stringify(rel)}), ${JSON.stringify(FIXTURES[rel])}); })()`);
			await sleep(1000);
		},
		read: (rel) => fs.readFileSync(path.join(vault, rel), 'utf8'),
		async edit(rel, fnBodyExpr) {
			await t.ev(`(async () => { await app.vault.process(app.vault.getAbstractFileByPath(${JSON.stringify(rel)}), (c) => ${fnBodyExpr}); })()`);
		},
		integrity(rel) {
			const now = scanOutside(t.read(rel));
			const orig = scanOutside(FIXTURES[rel]);
			const allowed = new Set(orig.outside);
			const stray = now.outside.filter((l) => !allowed.has(l) && !/^shift \d+$/.test(l));
			return { ok: !now.inFence && now.opens === orig.opens && stray.length === 0, blocks: now.opens, stray: stray.slice(0, 3) };
		},
		counterValues: (rel) => (t.read(rel).match(/current_value: (\d+)/g) ?? []).map((s) => Number(s.split(': ')[1])),
		mark: () => t.ev('window.__lc.n'),
		modsSince: async (mark, rel) => t.ev(`__lc.mods.filter((m) => m.n > ${mark} && (${JSON.stringify(rel ?? null)} === null || m.path === ${JSON.stringify(rel ?? null)})).length`),
		notices: () => t.ev('__lc.notices.map((x) => x.text)'),
		noticesSince: (mark) => t.ev(`__lc.notices.filter((x) => x.n > ${mark}).map((x) => x.text)`),
		errorsSince: (mark) => t.ev(`__lc.errs.filter((x) => x.n > ${mark}).map((x) => x.text)`),
		expect(cond, message) {
			if (!cond) throw new Error(message);
		},
		async shot(name) {
			const r = await cdp.call('Page.captureScreenshot', { format: 'png' });
			fs.mkdirSync(shotsDir, { recursive: true });
			const f = path.join(shotsDir, `${name}.png`);
			fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
			return f;
		},
		/** Click `Increase …` on the index-th counter root of the given leaf. */
		async clickIncrease(index, leafExpr = 'app.workspace.getMostRecentLeaf()') {
			const ok = await t.ev(`(() => { const roots = Array.from((${leafExpr}).view.containerEl.querySelectorAll('[data-dse-element="counter"]')).filter((r) => r.isConnected); const b = roots[${index}]?.querySelector('button[aria-label^="Increase"]'); if (!b) return false; b.click(); return true; })()`);
			t.expect(ok, `no Increase button on counter #${index}`);
		},
	};
	return t;
}

// ------------------------------------------------------------------------ scenarios
const NOTICE_TEXT = (note) =>
	`Draw Steel Elements: a change to a block in ${note} was not saved — the block changed on disk first.`;

const SCENARIOS = [
	{
		// SC-343: identical twins, 4 lines inserted above — the SECTION path writes the right twin.
		id: 'G-S7a',
		async run(t) {
			const rel = 'Lifecycle/twins.md';
			await t.open(rel);
			await t.reset(rel);
			await t.edit(rel, `c.replace('TOP', 'TOP\\n\\nshift 1\\n\\nshift 2')`);
			await t.sleep(1200);
			const m = await t.mark();
			await t.clickIncrease(1);
			await t.sleep(1500);
			const values = t.counterValues(rel);
			t.expect(JSON.stringify(values) === '[5,6]', `expected [5,6], got ${JSON.stringify(values)}`);
			t.expect(t.integrity(rel).ok, `note integrity: ${JSON.stringify(t.integrity(rel))}`);
			t.expect((await t.noticesSince(m)).length === 0, 'unexpected Notice');
			return `values=[5,6], writes=${await t.modsSince(m, rel)}`;
		},
	},
	{
		// SC-343: twins identical, +16 lines above, click the lower twin, navigate away 30 ms later:
		// the flush runs with the section gone and must pick the lower twin by position.
		id: 'G-S7b',
		async run(t) {
			const rel = 'Lifecycle/twins.md';
			await t.open(rel);
			await t.reset(rel);
			const add = Array.from({ length: 8 }, (_, i) => `\\n\\nshift ${i}`).join('');
			await t.edit(rel, `c.replace('TOP', 'TOP${add}')`);
			await t.sleep(1200);
			const m = await t.mark();
			await t.clickIncrease(1);
			await t.sleep(30);
			await t.open('Lifecycle/other.md');
			await t.sleep(1500);
			const values = t.counterValues(rel);
			t.expect(JSON.stringify(values) === '[5,6]', `expected [5,6] (lower twin), got ${JSON.stringify(values)}`);
			t.expect(t.integrity(rel).ok, 'note integrity');
			t.expect(t.read('Lifecycle/other.md') === FIXTURES['Lifecycle/other.md'], 'other.md was written');
			t.expect((await t.noticesSince(m)).length === 0, 'unexpected Notice');
			return 'values=[5,6] via durable locate';
		},
	},
	{
		// SC-336: a click, then navigate away in the same leaf 30 ms later — the edit lands.
		id: 'G-S6a',
		async run(t) {
			const rel = 'Lifecycle/counter.md';
			await t.open(rel);
			await t.reset(rel);
			const m = await t.mark();
			await t.clickIncrease(0);
			await t.sleep(30);
			await t.open('Lifecycle/other.md');
			await t.sleep(1500);
			t.expect(t.counterValues(rel)[0] === 11, `expected 11, got ${t.counterValues(rel)[0]}`);
			t.expect(t.integrity(rel).ok, 'note integrity');
			t.expect(t.read('Lifecycle/other.md') === FIXTURES['Lifecycle/other.md'], 'other.md was written');
			t.expect((await t.errorsSince(m)).length === 0, `errors: ${JSON.stringify(await t.errorsSince(m))}`);
			return 'current_value=11 after navigate-away';
		},
	},
	{
		// A click, then the leaf is closed 30 ms later — the edit lands.
		id: 'G-S6b',
		async run(t) {
			const rel = 'Lifecycle/counter.md';
			await t.open(rel);
			await t.reset(rel);
			await t.ev(`(async () => { const leaf = app.workspace.getLeaf('split', 'vertical'); window.__lcLeaf = leaf; await leaf.setViewState({ type: 'markdown', state: { file: '${rel}', mode: 'preview' }, active: true }); })()`);
			await t.sleep(1200);
			const m = await t.mark();
			await t.clickIncrease(0, 'window.__lcLeaf');
			await t.sleep(30);
			await t.ev('window.__lcLeaf.detach()');
			await t.sleep(1500);
			t.expect(t.counterValues(rel)[0] === 11, `expected 11, got ${t.counterValues(rel)[0]}`);
			t.expect(t.integrity(rel).ok, 'note integrity');
			t.expect((await t.errorsSince(m)).length === 0, 'errors');
			return 'current_value=11 after leaf close';
		},
	},
	{
		// SC-343 §8: a click, then an external edit of the same block inside the 400 ms delay.
		// The external edit wins, our write is dropped, and exactly ONE Notice says so — a
		// second miss on the same note inside 5 s adds no second Notice.
		id: 'G-S5n',
		async run(t) {
			const rel = 'Lifecycle/counter.md';
			await t.open(rel);
			await t.reset(rel);
			const m = await t.mark();
			await t.clickIncrease(0);
			await t.sleep(100);
			await t.edit(rel, `c.replace('name: Health', 'name: Vigor')`);
			await t.sleep(1500);
			const text = t.read(rel);
			t.expect(text.includes('name: Vigor') && t.counterValues(rel)[0] === 10, `external edit must win: ${text}`);
			let notices = await t.noticesSince(m);
			t.expect(notices.length === 1 && notices[0] === NOTICE_TEXT('counter'), `expected one Notice, got ${JSON.stringify(notices)}`);
			await t.clickIncrease(0);
			await t.sleep(100);
			await t.edit(rel, `c.replace('name: Vigor', 'name: Grit')`);
			await t.sleep(1500);
			notices = await t.noticesSince(m);
			t.expect(notices.length === 1, `rate limit: expected 1 Notice in 5 s, got ${notices.length}`);
			t.expect(t.integrity(rel).ok, 'note integrity');
			return 'external edit kept; 1 Notice for 2 dropped writes';
		},
	},
];

// ---------------------------------------------------------------------------- main
async function main() {
	// DSE_LIFECYCLE_BUNDLE: take the built plugin from another dir (used to prove the gate
	// discriminates against an older build). Default: this repo's own fresh build.
	const bundleDir = process.env.DSE_LIFECYCLE_BUNDLE ?? repo;
	for (const f of ['main.js', 'styles.css', 'manifest.json']) {
		if (!fs.existsSync(path.join(bundleDir, f))) envFail(`missing built ${f} in ${bundleDir} — run \`npm run obsidian-lifecycle\` (it builds first)`);
	}
	if (!fs.existsSync(BIN)) envFail(`no Obsidian binary at ${BIN}`);
	try {
		await fetch(`http://localhost:${PORT}/json/version`);
		envFail(`port ${PORT} already serves CDP — another instance owns it`);
	} catch {
		/* free — expected */
	}
	const cfg = path.join(os.homedir(), '.config', 'obsidian');
	const asars = fs.existsSync(cfg) ? fs.readdirSync(cfg).filter((f) => /^obsidian-.*\.asar$/.test(f)).sort() : [];
	if (!asars.length) envFail('no obsidian-*.asar in ~/.config/obsidian — open Obsidian once so it self-updates');

	// scratch vault = demo-vault copy (no plugins, no workspace) + fixtures + the fresh build
	spawnSync('bash', ['-c', `mkdir -p "${vault}" && cd "${path.join(repo, 'demo-vault')}" && tar --exclude=./.obsidian/plugins --exclude=./.obsidian/workspace.json -cf - . | tar -xf - -C "${vault}"`], { stdio: 'inherit' });
	const pdir = path.join(vault, '.obsidian', 'plugins', 'draw-steel-elements');
	fs.mkdirSync(pdir, { recursive: true });
	for (const f of ['main.js', 'styles.css', 'manifest.json']) fs.copyFileSync(path.join(bundleDir, f), path.join(pdir, f));
	fs.writeFileSync(path.join(vault, '.obsidian', 'community-plugins.json'), JSON.stringify(['draw-steel-elements']));
	for (const [rel, text] of Object.entries(FIXTURES)) {
		fs.mkdirSync(path.dirname(path.join(vault, rel)), { recursive: true });
		fs.writeFileSync(path.join(vault, rel), text);
	}
	fs.mkdirSync(udd, { recursive: true });
	fs.writeFileSync(path.join(udd, 'obsidian.json'), JSON.stringify({ vaults: { [VAULT_ID]: { path: vault, ts: Date.now(), open: true } } }));
	fs.writeFileSync(path.join(udd, `${VAULT_ID}.json`), JSON.stringify({ x: 0, y: 0, width: 1440, height: 1100, isMaximized: false, devTools: false, zoom: 0 }));
	fs.copyFileSync(path.join(cfg, asars.at(-1)), path.join(udd, asars.at(-1)));

	const x = await startXvfb();
	const child = spawn(BIN, [`--user-data-dir=${udd}`, `--remote-debugging-port=${PORT}`, '--window-size=1440,1100'], {
		env: { ...process.env, DISPLAY: x.display },
		stdio: 'ignore',
	});
	let alive = true;
	child.once('exit', () => (alive = false));
	let ok = 0;
	let failed = 0;
	const selected = SCENARIOS.filter((s) => !ONLY.length || ONLY.includes(s.id));
	try {
		let target;
		const t0 = Date.now();
		while (!target) {
			if (!alive) envFail('Obsidian exited during start-up');
			if (Date.now() - t0 > 45000) envFail('no CDP page target after 45 s');
			try {
				target = (await (await fetch(`http://localhost:${PORT}/json/list`)).json()).find((p) => p.type === 'page' && p.url.startsWith('app://obsidian.md'));
			} catch {
				/* not up yet */
			}
			if (!target) await sleep(300);
		}
		const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
		const t = makeHarness(cdp);
		await t.waitFor('window.app?.workspace?.layoutReady === true', 'layoutReady', 45000);
		if (!(await t.ev("!!app.plugins?.plugins?.['draw-steel-elements']"))) {
			await t.ev(`(async () => { await app.plugins.setEnable(true); await app.plugins.enablePluginAndSave('draw-steel-elements'); })()`);
		}
		await t.waitFor("!!app.plugins.plugins['draw-steel-elements']", 'plugin loaded', 20000);
		await sleep(800);
		for (let i = 0; i < 3; i++) {
			await t.ev("document.querySelectorAll('.modal-container .modal-close-button').forEach((b) => b.click())");
			await sleep(200);
		}
		await t.ev(PAGE_HELPERS);
		const version = await t.ev('require("electron").ipcRenderer.sendSync("version")');
		console.log(`OBSIDIAN-LIFECYCLE start: obsidian ${version}, display ${x.display}, port ${PORT}, ${selected.length} scenario(s)`);
		for (const s of selected) {
			try {
				const summary = await s.run(t);
				ok++;
				console.log(`OBSIDIAN-LIFECYCLE ${s.id} ok (${summary})`);
			} catch (e) {
				failed++;
				let shotPath = '';
				try {
					shotPath = ` [shot ${await t.shot(`${s.id}-FAIL`)}]`;
				} catch {
					/* best effort */
				}
				console.log(`OBSIDIAN-LIFECYCLE ${s.id} FAIL: ${e instanceof Error ? e.message : String(e)}${shotPath}`);
			}
		}
	} finally {
		child.kill('SIGTERM');
		await sleep(1500);
		if (alive) child.kill('SIGKILL');
		x.child.kill('SIGTERM');
	}
	console.log(`OBSIDIAN-LIFECYCLE done: ${ok}/${selected.length} ok, ${failed} failed`);
	process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => {
	console.log(`OBSIDIAN-LIFECYCLE environment: ${e instanceof Error ? e.stack : String(e)}`);
	process.exit(2);
});
