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
// SC-343 scenarios (6): identical twin blocks (section path and durable path), the flush
// after navigate-away (SC-336) and after leaf close, an unterminated fence at EOF located
// again by body (G-S6u), and the Notice on a dropped write.
// SC-340 (Task 8) appends 13 view-adoption scenarios to FIXTURES/SCENARIOS — 19 total:
// G-S1 (ConditionsModal open across 5 writes + pool modal), G-S2 (stamina modal survives
// selection write), G-S3 (fast typing + a half-typed editable-stepper draft survive the
// adoption blur), G-S4 (pane+embed / two panes — writer-only adoption, leaked copy refused),
// G-S5 (external edit / revert rebuilds fresh), G-S6c (Reading<->Live Preview/Source with a
// pending write), G-S6d (previewMode.rerender), G-S6e (plugin disable/enable), G-S6f (embed
// leaf detach), G-S6g (hover popovers ARE writable in Obsidian 1.14.2), G-S6h (nested
// read-only ds-counter survives its parent's adoption), G-S6i (fast navigation, no leaks),
// G-S8 (scrollTop pin across a tracker's own write).
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

// SC-343 fix round 1 (Important-2/Minor-6): whichever of Xvfb/Obsidian has been spawned SO
// FAR, tracked here the moment spawn() returns — not only once start-up is confirmed — so
// cleanup() can always reach them, from an envFail thrown mid-startup, an unexpected crash,
// or a SIGINT/SIGTERM. `EnvFailure` carries an environment problem through the single
// try/finally in main() (which runs cleanup() unconditionally) instead of calling
// process.exit() directly, which would skip that finally and orphan whatever was running.
let liveXvfb = null;
let liveObsidian = null;
class EnvFailure extends Error {}
const envFail = (msg) => {
	console.log(`OBSIDIAN-LIFECYCLE environment: ${msg}`);
	throw new EnvFailure(msg);
};

/** Best-effort SIGTERM, then SIGKILL if still alive after `killWaitMs`. Safe to call on an
 *  already-exited child (Node reports that via exitCode/signalCode, not a throw). */
async function killProc(child, killWaitMs = 1500) {
	if (!child) return;
	const dead = () => child.exitCode !== null || child.signalCode !== null;
	if (dead()) return;
	try {
		child.kill('SIGTERM');
	} catch {
		/* already gone */
	}
	await sleep(killWaitMs);
	if (!dead()) {
		try {
			child.kill('SIGKILL');
		} catch {
			/* already gone */
		}
	}
}

/** The one cleanup path every exit route funnels through: envFail (via the finally in
 *  main()), an unexpected exception, and SIGINT/SIGTERM all call this, so Xvfb/Obsidian
 *  never outlive a run regardless of where it stopped. */
async function cleanup() {
	await killProc(liveObsidian);
	await killProc(liveXvfb, 500);
}

let shuttingDownOnSignal = false;
async function onSignal(sig) {
	if (shuttingDownOnSignal) return;
	shuttingDownOnSignal = true;
	console.log(`OBSIDIAN-LIFECYCLE environment: received ${sig}, cleaning up`);
	await cleanup();
	process.exit(2);
}
process.once('SIGINT', () => {
	onSignal('SIGINT');
});
process.once('SIGTERM', () => {
	onSignal('SIGTERM');
});

// ------------------------------------------------------------------------- fixtures
const fence = (lang, lines) => ['```' + lang, ...lines, '```'].join('\n');
const COUNTER = (value = 10, name = 'Health') =>
	fence('ds-counter', [`name: ${name}`, `current_value: ${value}`, 'max_value: 20', 'min_value: 0']);

// SC-343 final review (Important-1, gate scenario G-S6u): an unterminated fence — no
// closing ``` at all — whose last block runs to EOF, followed by a trailing newline.
const UNTERMINATED_COUNTER = (value = 10, name = 'Health') =>
	['```ds-counter', `name: ${name}`, `current_value: ${value}`, 'max_value: 20', 'min_value: 0'].join('\n');

const FIXTURES = {
	'Lifecycle/twins.md': `# twins\n\nTOP\n\n${COUNTER(5, 'Twin')}\n\nMID\n\n${COUNTER(5, 'Twin')}\n\nBOTTOM\n`,
	'Lifecycle/counter.md': `# counter\n\nABOVE\n\n${COUNTER(10)}\n\nBELOW\n`,
	'Lifecycle/other.md': '# other\n\nJust another note.\n',
	'Lifecycle/unterminated.md': `# unterminated\n\nABOVE\n\n${UNTERMINATED_COUNTER(10)}\n`,
};

// SC-340 (Task 8) fixtures: the adoption scenarios (G-S1..G-S8) below.
const HERO = (name) => [`  - name: "${name}"`, '    max_stamina: 30'];
const INIT = (name) => fence('ds-initiative', ['heroes:', ...HERO(name), 'enemy_groups: []', 'malice:', '  value: 1']);
Object.assign(FIXTURES, {
	'Lifecycle/tracker.md': `# tracker\n\nABOVE\n\n${fence('ds-initiative', [
		'heroes:', ...HERO('Alice Alpha'), ...HERO('Bob Beta'),
		'enemy_groups:', '  - name: "Goblin Squad"', '    is_squad: true', '    creatures:',
		'      - name: "Goblin"', '        max_stamina: 4', '        amount: 3', '        squad_role: minion',
		'        instances:', '          - id: 1', '            conditions: [bleeding, dazed, slowed]',
		'          - id: 2', '            conditions: [frightened, grabbed]', '          - id: 3', '            conditions: []',
		'      - name: "Goblin Captain"', '        max_stamina: 40', '        amount: 1', '        squad_role: captain',
		'malice:', '  value: 3',
	])}\n\nBELOW\n`,
	'Lifecycle/ogres.md': `# ogres\n\nABOVE\n\n${fence('ds-initiative', [
		'heroes:', ...HERO('Alice Alpha'), 'enemy_groups:', '  - name: "Ogres"', '    creatures:',
		'      - name: "Ogre"', '        max_stamina: 60', '        amount: 3', 'malice:', '  value: 3',
	])}\n\nBELOW\n`,
	'Lifecycle/B.md': `# B\n\nB-TOP\n\n${INIT('Embed Eve')}\n\nB-BOTTOM\n`,
	'Lifecycle/A.md': '# A\n\nA-TOP\n\n![[B]]\n\nA-BOTTOM\n',
	'Lifecycle/tall.md': `# tall\n\n${Array.from({ length: 30 }, (_, i) => `PRE filler ${i}.`).join('\n\n')}\n\n${fence('ds-initiative', ['heroes:', ...Array.from({ length: 25 }, (_, i) => HERO(`Hero ${String(i + 1).padStart(2, '0')}`)).flat(), 'enemy_groups: []', 'malice:', '  value: 1'])}\n\n${Array.from({ length: 30 }, (_, i) => `POST filler ${i}.`).join('\n\n')}\n`,
	'Lifecycle/party.md': `# party\n\n${fence('ds-party', ['members:', '  - name: Kira', '    level: 3', '    hero_ref: "```ds-counter\\nname: Nested\\ncurrent_value: 1\\nmax_value: 5\\nmin_value: 0\\n```"', 'party:', '  hero_tokens: 2'])}\n`,
	'Lifecycle/hoverhost.md': '# hover host\n\nSee [[counter]] here.\n',
});

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
	liveXvfb = child; // tracked now, not only once the display is confirmed (Important-2)
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
		this.closed = false;
		// SC-343 fix round 1 (Important-1): if the socket goes down (Obsidian crashes,
		// the CDP connection drops), every pending call must settle instead of hanging
		// forever — t.waitFor() retries on falsy results, not on a promise that never
		// resolves, so a silently-stuck cdp.call() wedges the whole scenario loop and the
		// finally that tears down Xvfb/Obsidian never runs.
		const onDown = () => {
			if (this.closed) return;
			this.closed = true;
			for (const p of this.pending.values()) {
				clearTimeout(p.timer);
				p.reject(new Error('CDP socket closed'));
			}
			this.pending.clear();
		};
		ws.onmessage = (e) => {
			const m = JSON.parse(e.data);
			if (m.id === undefined) return;
			const p = this.pending.get(m.id);
			if (!p) return;
			this.pending.delete(m.id);
			clearTimeout(p.timer);
			if (m.error) p.reject(new Error(`${p.method}: ${m.error.message}`));
			else p.resolve(m.result);
		};
		ws.onclose = onDown;
		ws.onerror = onDown;
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
	call(method, params = {}, timeoutMs = 30000) {
		if (this.closed) return Promise.reject(new Error('CDP socket closed'));
		const id = ++this.id;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`${method}: timed out after ${timeoutMs} ms`));
			}, timeoutMs);
			this.pending.set(id, { resolve, reject, method, timer });
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
  // Known Obsidian HOST CHROME, excluded rather than allowlisting DSE's own prefix — a
  // prefix allowlist would also hide every other plugin-authored Notice (undoNotice's
  // "Recoveries: …" / "Caught breath: …", "Copied …", "Montage progress …", …), which a
  // future scenario asserting noticesSince(m).length === 0 needs to see.
  const hostChromeDenylist = [/^Update Available/];
  new MutationObserver((records) => {
    for (const r of records) for (const node of r.addedNodes) {
      if (node.nodeType !== 1) continue;
      const els = node.classList.contains('notice') ? [node] : Array.from(node.querySelectorAll('.notice'));
      for (const el of els) {
        if (seenNotices.has(el)) continue; // Obsidian can re-parent a notice element while stacking
        seenNotices.add(el);
        const text = el.textContent;
        if (!hostChromeDenylist.some((re) => re.test(text))) lc.notices.push({ n: ++lc.n, text });
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('error', (e) => lc.errs.push({ n: ++lc.n, text: String(e.message) }));
  window.addEventListener('unhandledrejection', (e) => lc.errs.push({ n: ++lc.n, text: 'rejection: ' + String(e.reason && (e.reason.stack || e.reason)) }));
  const origError = console.error.bind(console);
  console.error = (...a) => { lc.errs.push({ n: ++lc.n, text: 'console.error: ' + a.map((x) => (x && x.stack) || String(x)).join(' ') }); origError(...a); };
  return true;
})()`;

/**
 * SC-340 Task 8 review (I-1, follow-up): Obsidian's first-run "Do you trust the author of
 * this vault?" dialog is observed appearing at essentially ANY point across a whole run —
 * not once at start-up (probed extensively: cleanly dismissed at start-up, then open again
 * before the 9th scenario; dismissed there too, then open again mid-keystroke inside a
 * scenario; dismissed there, then open again ~90 ms into a different scenario's
 * timing-critical window). No fixed-length POLL, wherever placed, can bound that: it always
 * either wastes time when the dialog isn't coming, or has a gap when it is. A single
 * event-driven `MutationObserver`, installed once as early as possible and left running for
 * the WHOLE session, has no such gap — it dismisses the dialog the instant it is inserted,
 * before it can ever steal a keystroke or focus. This is the ONE centralized mechanism the
 * review asked for; every scattered per-scenario poll this task tried first is gone.
 *
 * Clicks the dialog's own header "X" (`.modal-header-button` inside its `.mod-trust-folder`
 * `.modal` — this dialog is NOT a standard Modal and has no `.modal-close-button`, confirmed
 * by dumping its real `outerHTML`) — safe here (unlike a per-scenario dismissal at a point
 * that asserts modal ABSENCE, e.g. G-S6i's orphaned-modal count, which this never touches)
 * because it is keyed on that class, never on text content a DSE modal could coincidentally
 * also show (Task 8 review round 2, "Trust selector"). Clicking the dialog's OTHER button,
 * "Trust author and enable plugins" (matched by text, since it carries no distinguishing
 * class), was tried first and measurably WORSE: it reproducibly starved `G-S5n`'s
 * dropped-write Notice — plausibly because that action is Obsidian's real "leave Restricted
 * Mode" trigger and may disturb plugin-scoped state the header "X" does not touch.
 */
const AUTO_DISMISS_TRUST_DIALOG = `(() => {
  if (window.__lcTrustObserver) return true;
  const dismiss = (modal) => {
    // Probed (Task 8 review I-1 follow-up, real DOM dump): this dialog is NOT a standard
    // Modal (no .modal-close-button) -- it is mod-confirmation, with an INNER .modal
    // carrying .mod-trust-folder, whose own header "X" is .modal-header-button. Task 8
    // review round 2 (Trust selector): key on that class, not text -- a DSE modal that
    // happens to show note content containing "trust the author" would otherwise match
    // the old /trust the author/i text test. Text match kept only as a fallback, for a
    // future Obsidian build that renames/drops the class.
    const byClass = modal.querySelector('.mod-trust-folder .modal-header-button');
    if (byClass) { byClass.click(); return; }
    if (/trust the author/i.test(modal.textContent)) modal.querySelector('.modal-header-button')?.click();
  };
  window.__lcTrustObserver = new MutationObserver(() => {
    // Re-scan every mutation batch, not only when a .modal-container node itself is freshly
    // added: Obsidian inserts an EMPTY container first and populates it (including its close
    // button) in a LATER batch -- a dismiss keyed only off the container's own insertion can
    // fire before the button exists. Cheap: at most a handful of open modals ever exist.
    document.querySelectorAll('.modal-container').forEach(dismiss);
  });
  window.__lcTrustObserver.observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll('.modal-container').forEach(dismiss); // one already open at install time
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
		/** SC-340 Task 8 review (Minor-2): the leaf's `containerEl` can carry a HIDDEN Live
		 *  Preview/source editor sibling alongside the visible Reading pane (§6.4/G-S6c) —
		 *  scoped helpers below query the VISIBLE `.markdown-reading-view` specifically
		 *  (falling back to the whole `containerEl` when no reading view is mounted at all,
		 *  e.g. a leaf that has never left Source mode) so a stray hidden widget can never be
		 *  the "first connected match" a click/tag/root picks. */
		readingScope: (leafExpr) => `((${leafExpr}).view.containerEl.querySelector('.markdown-reading-view') ?? (${leafExpr}).view.containerEl)`,
		/** Click `Increase …` on the index-th counter root of the given leaf's reading view. */
		async clickIncrease(index, leafExpr = 'app.workspace.getMostRecentLeaf()') {
			const ok = await t.ev(`(() => { const roots = Array.from(${t.readingScope(leafExpr)}.querySelectorAll('[data-dse-element="counter"]')).filter((r) => r.isConnected); const b = roots[${index}]?.querySelector('button[aria-label^="Increase"]'); if (!b) return false; b.click(); return true; })()`);
			t.expect(ok, `no Increase button on counter #${index}`);
		},
		// SC-340 (Task 8) helpers: the ViewRegistry itself, and tag/sameRoot for proving a
		// given root (not a fresh rebuild) survived a write.
		reg: `app.plugins.plugins['draw-steel-elements'].viewRegistry`,
		/** Live registry entries, optionally for one note: { path, docId, connected, loaded, el }. */
		async entries(rel) {
			return t.ev(`${t.reg}.liveEntries().filter((e) => ${JSON.stringify(rel ?? null)} === null || e.host.sourcePath === ${JSON.stringify(rel ?? null)}).map((e) => ({ path: e.host.sourcePath, docId: e.host.docId, connected: e.root.isConnected, loaded: !!e.view._loaded, el: e.root.getAttribute('data-dse-element') }))`);
		},
		/** Top-level DSE roots actually in the document. */
		rendered: () => t.ev(`Array.from(document.querySelectorAll('[data-dse-element]')).filter((r) => !r.parentElement.closest('[data-dse-element]')).length`),
		stats: () => t.ev(`Object.assign({}, ${t.reg}.stats)`),
		/** Tag the first connected root of `sel` in the given leaf's reading view; later `sameRoot` checks it. */
		async tag(sel, tagName, leafExpr = 'app.workspace.getMostRecentLeaf()') {
			const ok = await t.ev(`(() => { const r = Array.from(${t.readingScope(leafExpr)}.querySelectorAll('${sel}')).find((x) => x.isConnected); if (!r) return false; r.__lcTag = '${tagName}'; return true; })()`);
			t.expect(ok, `no ${sel} to tag`);
		},
		sameRoot: (sel, tagName, leafExpr = 'app.workspace.getMostRecentLeaf()') =>
			t.ev(`Array.from(${t.readingScope(leafExpr)}.querySelectorAll('${sel}')).some((x) => x.isConnected && x.__lcTag === '${tagName}')`),
		root: (sel, leafExpr = 'app.workspace.getMostRecentLeaf()') =>
			`Array.from(${t.readingScope(leafExpr)}.querySelectorAll('${sel}')).find((x) => x.isConnected)`,
		/** ConditionsModal: pick the first menu condition not already on the list. */
		async pickCondition() {
			if (!(await t.ev(`!!document.querySelector('.dse-condal-modal .dse-condal__menu-item')`))) {
				await t.ev(`document.querySelector('.dse-condal-modal .dse-condal__add').click()`);
				await t.waitFor(`!!document.querySelector('.dse-condal-modal .dse-condal__menu-item')`, 'condition menu');
			}
			return t.ev(`(() => { const have = new Set(Array.from(document.querySelectorAll('.dse-condal-modal .dse-condal__row .dse-condal__name')).map((n) => n.textContent)); const it = Array.from(document.querySelectorAll('.dse-condal-modal .dse-condal__menu-item')).find((i) => !have.has(i.querySelector('.dse-condal__menu-name')?.textContent)); const name = it.querySelector('.dse-condal__menu-name')?.textContent; it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return name; })()`);
		},
		async key(k, code, vk) {
			await t.cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
			await t.cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
		},
	};
	return t;
}

// ------------------------------------------------------------------------ scenarios
const NOTICE_TEXT = (note) =>
	`Draw Steel Elements: a change to a block in ${note} was not saved — the block changed on disk first.`;

// SC-340 (Task 8) scenario helpers.
const TRACKER = '[data-dse-element="initiative"]';
const conditionsModalOpen = (t) => t.ev(`!!document.querySelector('.dse-condal-modal')`);

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
			t.expect((await t.noticesSince(m)).length === 0, 'unexpected Notice');
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
			t.expect((await t.noticesSince(m)).length === 0, 'unexpected Notice');
			t.expect((await t.errorsSince(m)).length === 0, 'errors');
			return 'current_value=11 after leaf close';
		},
	},
	{
		// SC-343 final review (Important-1): an unterminated fence at EOF, located again by
		// BODY on the durable path (navigate-away 30 ms later) — must still land and close
		// the fence, never a false "not saved" Notice (base build: locateByBody couldn't see
		// an unterminated fence at all, so this scenario FAILs there).
		id: 'G-S6u',
		async run(t) {
			const rel = 'Lifecycle/unterminated.md';
			await t.open(rel);
			await t.reset(rel);
			const m = await t.mark();
			await t.clickIncrease(0);
			await t.sleep(30);
			await t.open('Lifecycle/other.md');
			await t.sleep(1500);
			t.expect(t.counterValues(rel)[0] === 11, `expected 11, got ${t.counterValues(rel)[0]}`);
			t.expect(t.integrity(rel).ok, `note integrity: ${JSON.stringify(t.integrity(rel))}`);
			t.expect(t.read(rel).trimEnd().endsWith('```'), 'fence was not closed');
			t.expect(t.read('Lifecycle/other.md') === FIXTURES['Lifecycle/other.md'], 'other.md was written');
			t.expect((await t.noticesSince(m)).length === 0, 'unexpected Notice');
			t.expect((await t.errorsSince(m)).length === 0, `errors: ${JSON.stringify(await t.errorsSince(m))}`);
			return 'current_value=11 after navigate-away, fence closed';
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
	{
		// Spec G-S1 (SC-331): the ConditionsModal stays open across 5 live writes; row follows.
		id: 'G-S1',
		async run(t) {
			const rel = 'Lifecycle/tracker.md';
			await t.open(rel);
			await t.reset(rel);
			await t.tag(TRACKER, 's1');
			const m = await t.mark();
			await t.ev(`${t.root(TRACKER)}.querySelectorAll('.dse-cond--add')[0].click()`);
			await t.waitFor(`!!document.querySelector('.dse-condal-modal')`, 'conditions modal');
			const steps = [];
			const probe = async (label, expectIcons) => {
				await t.sleep(900);
				const open = await conditionsModalOpen(t);
				const same = await t.sameRoot(TRACKER, 's1');
				const icons = await t.ev(`${t.root(TRACKER)}.querySelectorAll('.dse-init__conditions')[0].querySelectorAll('.dse-cond:not(.dse-cond--add)').length`);
				t.expect(open && same && icons === expectIcons, `${label}: modalOpen=${open} sameRoot=${same} icons=${icons} (want ${expectIcons})`);
				steps.push(label);
			};
			for (let i = 1; i <= 3; i++) {
				await t.pickCondition();
				await probe(`add#${i}`, i);
			}
			await t.ev(`document.querySelectorAll('.dse-condal-modal .dse-condal__row')[0].querySelector('.dse-condal__act:not(.dse-condal__act--delete)').click()`);
			await t.waitFor(`!!document.querySelector('.dse-condal-modal .dse-condal__editor')`, 'customize editor');
			await t.ev(`document.querySelector('.dse-condal-modal .dse-cond-icons__choice[aria-label="Icon: skull"]').click()`);
			await probe('icon=skull', 3);
			await t.ev(`document.querySelectorAll('.dse-condal-modal .dse-condal__row')[2].querySelector('.dse-condal__act--delete').click()`);
			await probe('delete#3', 2);
			const writes = await t.modsSince(m, rel);
			t.expect(writes === 5, `expected 5 writes, got ${writes}`);
			await t.ev(`document.querySelector('.dse-condal-modal .dse-modal__footer button').click()`);
			await t.sleep(600);
			t.expect(!(await conditionsModalOpen(t)), 'Done did not close the modal');
			t.expect(t.integrity(rel).ok, 'note integrity');
			// Done, then open the next combatant's modal 30..600 ms later (SC-331 MED-1)
			for (const gap of [30, 150, 300, 420, 600]) {
				await t.reset(rel);
				await t.ev(`${t.root(TRACKER)}.querySelectorAll('.dse-cond--add')[0].click()`);
				await t.waitFor(`!!document.querySelector('.dse-condal-modal')`, 'modal');
				await t.pickCondition();
				await t.sleep(150);
				await t.ev(`document.querySelector('.dse-condal-modal .dse-modal__footer button').click()`);
				await t.sleep(gap);
				await t.ev(`${t.root(TRACKER)}.querySelectorAll('.dse-cond--add')[1].click()`);
				await t.sleep(1300);
				t.expect(await conditionsModalOpen(t), `second modal closed at gap ${gap} ms`);
				await t.key('Escape', 'Escape', 27);
				await t.sleep(400);
			}
			// pool modal condition removal, grid and detail call sites
			for (const site of ['grid', 'detail']) {
				await t.reset(rel);
				await t.tag(TRACKER, `pool-${site}`);
				if (site === 'grid') await t.ev(`${t.root(TRACKER)}.querySelector('.dse-init__group--enemies .dse-init__cell').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
				else await t.ev(`${t.root(TRACKER)}.querySelector('.dse-init__group--enemies .dse-init__detail .dse-init__stamina').click()`);
				await t.waitFor(`!!document.querySelector('.modal-container .dse-sedit__minions')`, 'pool modal');
				for (let i = 0; i < 2; i++) {
					await t.ev(`document.querySelector('.modal-container .dse-minion__conditions .condition-icon').click()`);
					await t.sleep(1100);
					t.expect(await t.ev(`!!document.querySelector('.modal-container .dse-sedit__minions')`), `pool modal (${site}) closed after removal ${i + 1}`);
				}
				t.expect(await t.sameRoot(TRACKER, `pool-${site}`), `pool (${site}): tracker root replaced`);
				await t.key('Escape', 'Escape', 27);
				await t.sleep(500);
			}
			// SC-340 Task 8 addendum §3: no wrong-instance adoption anywhere above.
			const stats1 = await t.stats();
			t.expect(stats1.collisions === 0 && stats1.ambiguous === 0, `collisions=${stats1.collisions} ambiguous=${stats1.ambiguous}`);
			await t.reset(rel);
			return `modal open across 5 writes; Done→reopen 5/5; pool 2 sites × 2 removals; collisions=0 ambiguous=0`;
		},
	},
	{
		// Spec G-S2 (SC-339): select a creature, open its stamina modal 150/380 ms later.
		id: 'G-S2',
		async run(t) {
			const rel = 'Lifecycle/ogres.md';
			await t.open(rel);
			for (const gap of [150, 380]) {
				await t.reset(rel);
				await t.ev(`${t.root(TRACKER)}.querySelectorAll('.dse-init__group--enemies .dse-init__cell')[1].click()`);
				await t.sleep(gap);
				await t.ev(`${t.root(TRACKER)}.querySelector('.dse-init__group--enemies .dse-init__detail .dse-init__stamina').click()`);
				await t.sleep(1500);
				t.expect(await t.ev(`!!document.querySelector('.modal-container .dse-modal')`), `stamina modal closed (gap ${gap})`);
				t.expect(/selectedInstanceKey: 0-2/.test(t.read(rel)), `selection write did not land (gap ${gap})`);
				await t.key('Escape', 'Escape', 27);
				await t.sleep(400);
			}
			const stats2 = await t.stats();
			t.expect(stats2.collisions === 0 && stats2.ambiguous === 0, `collisions=${stats2.collisions} ambiguous=${stats2.ambiguous}`);
			await t.reset(rel);
			return 'stamina modal survives the selection write at 150 and 380 ms; collisions=0 ambiguous=0';
		},
	},
	{
		// Spec G-S3: type fast into the Malice label while an earlier click's write lands;
		// phase 2 (Task 8 addendum §3, Task 6 fix): a half-typed EDITABLE stepper draft is
		// not committed by the adoption blur, and a real blur (Tab) afterwards commits it.
		id: 'G-S3',
		async run(t) {
			const rel = 'Lifecycle/ogres.md';
			await t.open(rel);
			await t.reset(rel);
			await t.tag(TRACKER, 's3');
			const text = 'abcdefghijklmnopqrstuvwxyz0123456789';
			await t.ev(`${t.root(TRACKER)}.querySelector('button.dse-init__portrait-toggle').click()`);
			await t.sleep(250);
			await t.ev(`${t.root(TRACKER)}.querySelector('input.dse-init__malice-quickadd-label').focus()`);
			for (const ch of text) {
				await t.cdp.call('Input.insertText', { text: ch });
				await t.sleep(6);
			}
			await t.sleep(400);
			// SC-340 Task 8 addendum §3: if this fails because Obsidian's re-render leaves
			// activeElement on something other than the input/body/null, report the observed
			// activeElement (tag/class) rather than changing adoptView's rule.
			const st = await t.ev(
				`(() => { const i = ${t.root(TRACKER)}.querySelector('input.dse-init__malice-quickadd-label'); const ae = document.activeElement; return { value: i.value, active: ae === i, caret: i.selectionStart, activeTag: ae ? ae.tagName : null, activeClass: ae ? ae.className : null }; })()`,
			);
			t.expect(await t.sameRoot(TRACKER, 's3'), 'tracker root replaced (not adopted)');
			t.expect(st.value === text, `typed text lost: "${st.value}"`);
			t.expect(st.active && st.caret === text.length, `focus/caret lost: ${JSON.stringify(st)}`);
			t.expect(/has_taken_turn: true/.test(t.read(rel)), 'the earlier click did not write');
			const stats3a = await t.stats();
			t.expect(stats3a.collisions === 0 && stats3a.ambiguous === 0, `collisions=${stats3a.collisions} ambiguous=${stats3a.ambiguous}`);
			await t.reset(rel);

			// Phase 2: click the counter's own Increase (schedules a write, 400 ms debounce),
			// then within ~100 ms select the stepper input's shown value and start a NEW
			// half-typed draft. The click's write must land and adopt the view — the draft
			// must NOT commit during that adoption blur, but a later real blur (Tab) must.
			const rel2 = 'Lifecycle/counter.md';
			const COUNTER_SEL = '[data-dse-element="counter"]';
			await t.open(rel2);
			await t.reset(rel2);
			await t.tag(COUNTER_SEL, 's3b');
			const m2 = await t.mark();
			await t.clickIncrease(0);
			await t.sleep(90);
			await t.ev(`(() => { const i = ${t.root(COUNTER_SEL)}.querySelector('input.dse-stepper__input'); i.focus(); i.select(); })()`);
			// "14" — within [min_value 0, max_value 20], so the assertions below isolate
			// "was the draft committed" from clamping (a literal "42" would clamp to 20).
			await t.cdp.call('Input.insertText', { text: '1' });
			await t.sleep(20);
			await t.cdp.call('Input.insertText', { text: '4' });
			await t.sleep(1500);
			t.expect(await t.sameRoot(COUNTER_SEL, 's3b'), 'counter root replaced (not adopted)');
			const writes2 = await t.modsSince(m2, rel2);
			t.expect(writes2 === 1, `expected exactly 1 write before the Tab blur, got ${writes2}`);
			t.expect(t.counterValues(rel2)[0] === 11, `the half-typed draft committed during the adoption: current_value=${t.counterValues(rel2)[0]}`);
			const st2 = await t.ev(`(() => { const i = ${t.root(COUNTER_SEL)}.querySelector('input.dse-stepper__input'); return { value: i.value, active: document.activeElement === i }; })()`);
			t.expect(st2.active, `focus lost after adoption: ${JSON.stringify(st2)}`);
			t.expect(st2.value === '14', `typed draft lost: "${st2.value}"`);
			await t.key('Tab', 'Tab', 9);
			await t.sleep(700);
			t.expect(t.counterValues(rel2)[0] === 14, `Tab blur did not commit the typed draft: current_value=${t.counterValues(rel2)[0]}`);
			t.expect(t.integrity(rel2).ok, 'note integrity');
			await t.reset(rel2);
			return `0/${text.length} keystrokes lost; focus/caret kept; half-typed stepper draft not committed by adoption, committed by Tab; collisions=0 ambiguous=0`;
		},
	},
	{
		// Spec G-S4: pane + embed, then two panes — writer-only adoption; leaked copy refused.
		id: 'G-S4',
		async run(t) {
			const B = 'Lifecycle/B.md';
			await t.open('Lifecycle/A.md');
			await t.reset(B);
			await t.ev(`(async () => { const leaf = app.workspace.getLeaf('split', 'vertical'); window.__lcB = leaf; await leaf.setViewState({ type: 'markdown', state: { file: '${B}', mode: 'preview' }, active: true }); })()`);
			await t.sleep(1500);
			const leaked = (await t.entries(B)).filter((e) => !e.connected).length;
			const leafA = `app.workspace.getLeavesOfType('markdown').find((l) => l.view.file?.path === 'Lifecycle/A.md')`;
			const leafB = 'window.__lcB';
			for (const [writer, other] of [[leafB, leafA], [leafA, leafB], [leafB, leafA], [leafA, leafB]]) {
				await t.tag(TRACKER, 'w', writer);
				await t.tag(TRACKER, 'o', other);
				const m = await t.mark();
				await t.ev(`${t.root(TRACKER, writer)}.querySelector('button[aria-label="Advance round"]').click()`);
				await t.sleep(2500);
				t.expect(await t.sameRoot(TRACKER, 'w', writer), 'writer lost its view');
				t.expect(!(await t.sameRoot(TRACKER, 'o', other)), 'the other instance kept a stale view');
				t.expect((await t.modsSince(m, B)) === 1, 'not exactly one write');
				const round = (t.read(B).match(/round: (\d+)/) ?? [null, '1'])[1];
				const shown = await t.ev(`Array.from(document.querySelectorAll('${TRACKER} .dse-init__round-value')).filter((x) => x.isConnected).map((x) => x.textContent)`);
				t.expect(shown.every((s) => s === `Round ${round}`), `instances disagree: ${JSON.stringify(shown)} vs round ${round}`);
			}
			t.expect((await t.entries(B)).filter((e) => !e.connected).length === leaked, 'a leaked copy was adopted');
			// a leaked copy (if Obsidian left one) writing its stale model is refused, note unchanged
			if (leaked > 0) {
				const before = t.read(B);
				await t.ev(`(() => { const e = ${t.reg}.liveEntries().find((x) => x.host.sourcePath === '${B}' && !x.root.isConnected); e.view.advanceRound(); })()`);
				await t.sleep(1500);
				t.expect(t.read(B) === before, 'the leaked copy overwrote the note');
			}
			t.expect(t.integrity(B).ok, 'note integrity');
			const stats4 = await t.stats();
			t.expect(stats4.collisions === 0 && stats4.ambiguous === 0, `collisions=${stats4.collisions} ambiguous=${stats4.ambiguous}`);
			await t.ev(`${leafB}.detach()`);
			await t.open(B);
			await t.reset(B);
			return `4 alternating writes: writer-only adoption, 1 write each; leaked copies=${leaked}, never claimed; collisions=0 ambiguous=0`;
		},
	},
	{
		// Spec G-S5: external edit and undo-like revert -> fresh view, old released.
		id: 'G-S5',
		async run(t) {
			const rel = 'Lifecycle/counter.md';
			await t.open(rel);
			await t.reset(rel);
			await t.tag('[data-dse-element="counter"]', 'c1');
			await t.edit(rel, `c.replace('current_value: 10', 'current_value: 12')`);
			await t.sleep(1500);
			t.expect(!(await t.sameRoot('[data-dse-element="counter"]', 'c1')), 'external edit was adopted');
			t.expect((await t.entries(rel)).length === 1, 'old view not released');
			const before = t.read(rel);
			await t.tag('[data-dse-element="counter"]', 'c2');
			await t.clickIncrease(0);
			await t.sleep(1500);
			t.expect(await t.sameRoot('[data-dse-element="counter"]', 'c2'), 'own write was not adopted');
			await t.ev(`(async () => { await app.vault.modify(app.vault.getAbstractFileByPath('${rel}'), ${JSON.stringify(before)}); })()`);
			await t.sleep(1500);
			t.expect(!(await t.sameRoot('[data-dse-element="counter"]', 'c2')), 'revert was adopted');
			t.expect((await t.entries(rel)).length === 1, 'old view not released after revert');
			await t.reset(rel);
			return 'external edit and revert rebuilt fresh; 1 live view';
		},
	},
	{
		// G-S6c: Reading -> Source -> Reading, with a pending write. Task 8 addendum §3: run
		// the toggle to BOTH Live Preview (source:false) and raw Source (source:true), on the
		// SAME leaf — the realistic shape of "Reading -> Source -> Reading" (SC-343's own
		// `G-S6b` covers the leaf-close twin case).
		//
		// Measured (this task, real Obsidian 1.14.2): switching mode WITHOUT leaving the leaf
		// does not unload our render child at all — Obsidian keeps the Reading pane's DOM
		// mounted (hidden) so mode-switching stays instant, and Live Preview separately
		// renders the block again as its own widget for an unfocused line (same code-block
		// processor) — a second live-and-connected registry entry that legitimately coexists
		// with the Reading one; confirmed harmless (neither is a claim/adoption —
		// `stats.claims` never moves).
		//
		// SC-340 Task 8 review (Minor-1): a prior revision of this scenario blamed its
		// failures on "Obsidian's own leaf-level view cache" and worked around them with a
		// fresh split leaf per variant. The real cause: `clickIncrease` picked the FIRST
		// connected `[data-dse-element="counter"]` in the leaf's `containerEl`, which is the
		// Live Preview widget's HIDDEN copy when one exists (it renders first in DOM order)
		// — that copy is never rebuilt by `t.reset()` (Live Preview only re-renders widgets
		// in its own viewport window), so a click on it wrote a STALE model whose write
		// SC-343's guard correctly dropped. Not a leak, not a leaf-cache artifact — a test
		// helper picking the wrong (correctly hidden) instance. Minor-2 scopes
		// clickIncrease/tag/sameRoot/root to the VISIBLE `.markdown-reading-view`
		// specifically, which fixes this at the root and restores the realistic same-leaf
		// round trip below.
		id: 'G-S6c',
		async run(t) {
			const rel = 'Lifecycle/counter.md';
			await t.open(rel);
			for (const [label, sourceFlag] of [['Live Preview', false], ['raw Source', true]]) {
				await t.reset(rel);
				const m = await t.mark();
				const claimsBefore = (await t.stats()).claims;
				await t.clickIncrease(0);
				await t.sleep(30);
				await t.ev(`(async () => { await app.workspace.getMostRecentLeaf().setViewState({ type: 'markdown', state: { file: '${rel}', mode: 'source', source: ${sourceFlag} } }); })()`);
				await t.sleep(1500);
				t.expect(t.counterValues(rel)[0] === 11, `pending write lost on Reading->${label}`);
				const writes = await t.modsSince(m, rel);
				t.expect(writes === 1, `expected 1 write in ${label}, got ${writes}`);
				// The discriminating signal that nothing was WRONGLY adopted into the
				// editor's own render of the block: `stats.claims` never moves — a claim
				// would mean the hidden Reading-mode root, not a fresh view, got adopted.
				const claimsAfter = (await t.stats()).claims;
				t.expect(claimsAfter === claimsBefore, `a claim happened during the ${label} toggle (${claimsBefore} -> ${claimsAfter})`);
				await t.ev(`(async () => { await app.workspace.getMostRecentLeaf().setViewState({ type: 'markdown', state: { file: '${rel}', mode: 'preview' } }); })()`);
				await t.sleep(1500);
				t.expect(t.counterValues(rel)[0] === 11, `value regressed after returning to Reading (${label})`);
				// Task 8 addendum §3's original intent, restored (Minor-1): after returning
				// to Reading, exactly ONE connected entry whose root sits in the VISIBLE
				// reading view — a same-leaf Live Preview widget entry (if any) may coexist
				// but must never be counted as a second Reading-mode instance.
				const readingEntries = await t.ev(
					`${t.reg}.liveEntries().filter((e) => e.host.sourcePath === '${rel}' && e.root.isConnected && e.root.closest('.markdown-reading-view')).length`,
				);
				t.expect(readingEntries === 1, `${label}: expected 1 connected reading-view entry, got ${readingEntries}`);
			}
			await t.reset(rel);
			// A Live Preview excursion's own widget entry stays alive (hidden) once back in
			// Reading — harmless (asserted above), but it must not leak into the NEXT
			// scenario's `entries(rel)` count: navigate away to force it (and the Reading
			// entry) to unload before returning.
			await t.open('Lifecycle/other.md');
			await t.sleep(1000);
			t.expect((await t.entries(rel)).length === 0, 'registry still holds a view for counter.md after navigating away');
			await t.open(rel);
			return 'write landed once per toggle, survived the round-trip; no adoption into the editor; 1 reading-view entry after each round-trip';
		},
	},
	{
		// G-S6d: previewMode.rerender(true) -> fresh views, old ones released.
		id: 'G-S6d',
		async run(t) {
			const rel = 'Lifecycle/counter.md';
			await t.open(rel);
			await t.tag('[data-dse-element="counter"]', 'rr');
			await t.ev(`app.workspace.getMostRecentLeaf().view.previewMode.rerender(true)`);
			await t.sleep(1500);
			t.expect(!(await t.sameRoot('[data-dse-element="counter"]', 'rr')), 'rerender adopted');
			t.expect((await t.entries(rel)).length === 1, 'old view not released');
			return 'fresh view, 1 live';
		},
	},
	{
		// G-S6e: plugin disable with a pending write, then enable.
		id: 'G-S6e',
		async run(t) {
			const rel = 'Lifecycle/counter.md';
			await t.open(rel);
			await t.reset(rel);
			await t.clickIncrease(0);
			await t.sleep(30);
			await t.ev(`(async () => { await app.plugins.disablePlugin('draw-steel-elements'); })()`);
			await t.sleep(1500);
			t.expect(t.counterValues(rel)[0] === 11, 'pending write lost on plugin disable');
			await t.ev(`(async () => { await app.plugins.enablePlugin('draw-steel-elements'); })()`);
			await t.sleep(2500);
			await t.ev(PAGE_HELPERS);
			const live = (await t.entries()).filter((e) => e.connected).length;
			const rendered = await t.rendered();
			t.expect(live === rendered, `after re-enable: live views ${live} != rendered ${rendered}`);
			await t.reset(rel);
			return `write landed; re-enable live=${live}=rendered`;
		},
	},
	{
		// G-S6f: pending write in an embed, then the embedding leaf is detached.
		id: 'G-S6f',
		async run(t) {
			const B = 'Lifecycle/B.md';
			await t.reset(B);
			await t.ev(`(async () => { const leaf = app.workspace.getLeaf('split', 'vertical'); window.__lcA = leaf; await leaf.setViewState({ type: 'markdown', state: { file: 'Lifecycle/A.md', mode: 'preview' }, active: true }); })()`);
			await t.sleep(1800);
			await t.ev(`${t.root(TRACKER, 'window.__lcA')}.querySelector('button.dse-init__portrait-toggle').click()`);
			await t.sleep(30);
			await t.ev('window.__lcA.detach()');
			await t.sleep(1500);
			t.expect(/has_taken_turn: true/.test(t.read(B)), 'embed write lost on leaf detach');
			t.expect(t.integrity(B).ok, 'note integrity');
			await t.reset(B);
			return 'write landed in B';
		},
	},
	{
		// G-S6g (rewritten by the SC-340 Task 8 addendum §2): hover popovers ARE writable in
		// Obsidian 1.14.2 (measured on base and head alike) — a click in the popover writes
		// the right note/block, and no connected registry entry survives its removal.
		id: 'G-S6g',
		async run(t) {
			const rel = 'Lifecycle/counter.md';
			await t.reset(rel);
			await t.open('Lifecycle/hoverhost.md');
			const m = await t.mark();
			await t.ev(`(() => { const a = app.workspace.getMostRecentLeaf().view.containerEl.querySelector('a.internal-link'); app.workspace.trigger('hover-link', { event: new MouseEvent('mouseover', { clientX: 400, clientY: 300 }), source: 'preview', hoverParent: app.workspace.getMostRecentLeaf().view, targetEl: a, linktext: 'counter', sourcePath: 'Lifecycle/hoverhost.md' }); })()`);
			await t.waitFor(`!!document.querySelector('.hover-popover [data-dse-element="counter"]')`, 'hover popover counter', 8000);
			// SC-340 Task 8 review (I-2): tag the popover's OWN root (not the leaf's — the
			// popover isn't inside containerEl) so it can be identified by reference after the
			// popover closes, since it won't match `.hover-popover …` anymore by then.
			await t.ev(`(() => { const r = document.querySelector('.hover-popover [data-dse-element="counter"]'); r.__lcTag = true; window.__lcHoverRoot = r; })()`);
			const ro = await t.ev(`document.querySelector('.hover-popover [data-dse-element="counter"]').getAttribute('data-dse-readonly')`);
			t.expect(ro !== 'true', `hover counter is read-only (data-dse-readonly=${ro})`);
			await t.ev(`document.querySelector('.hover-popover [data-dse-element="counter"] button[aria-label^="Increase"]').click()`);
			await t.sleep(1500);
			t.expect(t.counterValues(rel)[0] === 11, `hover click did not write the right block: current_value=${t.counterValues(rel)[0]}`);
			// SC-340 Task 8 review (I-2): the addendum's "the rest of the note byte-identical"
			// checked precisely — everything OUTSIDE the fence (the write re-serializes the
			// fenced YAML itself: field order, defaulted fields like value_height/name_height —
			// by design, not a miss) must be byte-for-byte the fixture's.
			t.expect(
				JSON.stringify(scanOutside(t.read(rel)).outside) === JSON.stringify(scanOutside(FIXTURES[rel]).outside),
				'text outside the fence changed',
			);
			t.expect(t.integrity(rel).ok, 'note integrity');
			t.expect((await t.noticesSince(m)).length === 0, 'unexpected Notice');
			t.expect((await t.errorsSince(m)).length === 0, `errors: ${JSON.stringify(await t.errorsSince(m))}`);
			// SC-340 Task 8 review (New-2): the release check below only proves something once
			// there IS something tagged and live to release — if the popover's own write had
			// instead produced a FRESH view (a miss, not an adoption), the tagged root would
			// already be the released OLD one and a new, untagged view could leak unseen past
			// the isConnected/liveEntries checks after hide(). Assert the tagged root is still
			// the live, connected registered entry BEFORE closing it.
			t.expect(
				await t.ev(`${t.reg}.liveEntries().some((e) => e.root.__lcTag === true && e.root.isConnected)`),
				'popover write was not adopted (tagged root not live before close)',
			);
			// SC-340 Task 8 review (I-2): close through Obsidian's own popover API, not by
			// deleting the DOM out from under a still-registered, still-"connected" view — a
			// removed-but-never-unloaded view can't fail the assertions below either way.
			await t.ev(`(() => { const hp = app.workspace.getMostRecentLeaf().view.hoverPopover; if (hp?.hide) hp.hide(); else hp?.unload(); })()`);
			await t.sleep(500);
			const popoverDisconnected = await t.ev(`!window.__lcHoverRoot.isConnected`);
			t.expect(popoverDisconnected, 'popover root still connected after hoverPopover close');
			const stillRegistered = await t.ev(`${t.reg}.liveEntries().some((e) => e.root.__lcTag === true)`);
			t.expect(!stillRegistered, 'popover view still registered after hoverPopover close');
			await t.reset(rel);
			return 'hover popover counter is writable; click wrote the right block; text outside the fence unchanged; view released on close';
		},
	},
	{
		// G-S6h: a nested ds-counter (party hero_ref) survives the party's adoption, read-only.
		id: 'G-S6h',
		async run(t) {
			const rel = 'Lifecycle/party.md';
			await t.open(rel);
			await t.reset(rel);
			const nested = '[data-dse-element="party"] [data-dse-element="counter"]';
			t.expect(await t.ev(`!!${t.root(nested)}`), 'nested counter did not render');
			await t.tag('[data-dse-element="party"]', 'party');
			await t.tag(nested, 'nested');
			await t.ev(`${t.root('[data-dse-element="party"]')}.querySelector('button[aria-label="Increase Hero tokens"]').click()`);
			await t.sleep(1500);
			t.expect(/hero_tokens: 3/.test(t.read(rel)), 'party write did not land');
			t.expect(await t.sameRoot('[data-dse-element="party"]', 'party'), 'party not adopted');
			t.expect(await t.sameRoot(nested, 'nested'), 'nested counter was torn down by the adoption');
			t.expect((await t.ev(`${t.root(nested)}.getAttribute('data-dse-readonly')`)) === 'true', 'nested counter writable');
			await t.reset(rel);
			return 'nested card kept and read-only';
		},
	},
	{
		// G-S6i: fast navigation across several fixture notes (Task 8 addendum §3), then
		// other.md alone -> no connected live view remains; report the registry accounting.
		id: 'G-S6i',
		async run(t) {
			for (const rel of ['Lifecycle/tracker.md', 'Lifecycle/party.md', 'Lifecycle/counter.md', 'Lifecycle/twins.md']) {
				await t.ev(`(async () => { await app.workspace.getMostRecentLeaf().setViewState({ type: 'markdown', state: { file: ${JSON.stringify(rel)}, mode: 'preview' }, active: true }); })()`);
				await t.sleep(150);
			}
			await t.open('Lifecycle/other.md');
			await t.sleep(1000);
			const connected = (await t.entries()).filter((e) => e.connected).length;
			const rendered = await t.rendered();
			t.expect(connected === rendered, `live connected views ${connected} != rendered ${rendered}`);
			// SC-340 Task 8 review (I-1): count DSE's OWN modal classes, not every
			// `.modal-container` — an unrelated host-chrome dialog (Obsidian's first-run trust
			// dialog is auto-dismissed on sight for the whole run — see
			// AUTO_DISMISS_TRUST_DIALOG) must never be dismissed HERE by this check, since a
			// blind dismissal at this specific point could silently launder a real orphaned
			// DSE modal past it.
			t.expect((await t.ev('document.querySelectorAll(".modal-container .dse-modal, .dse-condal-modal").length')) === 0, 'orphaned DSE modal');
			const all = await t.entries();
			const disconnected = all.filter((e) => !e.connected);
			// Lifecycle/B.md is an embed of an already-leaked-copy-prone note (out of scope:
			// "fixing Obsidian's leaked embed copies" per the constraints) — any OTHER
			// disconnected, unreleased entry is worth flagging for the report, not failing on.
			const nonEmbedLeaks = disconnected.filter((e) => e.path !== 'Lifecycle/B.md');
			if (nonEmbedLeaks.length) console.log(`OBSIDIAN-LIFECYCLE G-S6i note: unreleased non-embed disconnected entries: ${JSON.stringify(nonEmbedLeaks)}`);
			return `live=${connected}=rendered; registry=${all.length} (disconnected=${disconnected.length}, non-embed=${nonEmbedLeaks.length}); 0 modals`;
		},
	},
	{
		// Spec G-S8: tall scrolled tracker keeps scrollTop across its own write (pin on).
		id: 'G-S8',
		async run(t) {
			const rel = 'Lifecycle/tall.md';
			await t.open(rel);
			await t.reset(rel);
			await t.ev(`(() => { const s = app.workspace.getMostRecentLeaf().view.containerEl.querySelector('.markdown-preview-view'); const r = ${t.root(TRACKER)}; s.scrollTop = r.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop + 1500; })()`);
			await t.sleep(900);
			const samples = await t.ev(`new Promise((resolve) => { const s = app.workspace.getMostRecentLeaf().view.containerEl.querySelector('.markdown-preview-view'); const sr = s.getBoundingClientRect(); const b = Array.from(${t.root(TRACKER)}.querySelectorAll('button.dse-init__portrait-toggle')).find((x) => { const r = x.getBoundingClientRect(); return r.top > sr.top + 100 && r.bottom < sr.bottom - 100; }); const out = []; const t0 = performance.now(); const tick = () => { out.push(s.scrollTop); if (performance.now() - t0 < 2200) requestAnimationFrame(tick); else resolve(out); }; requestAnimationFrame(tick); b.click(); })`);
			const min = Math.min(...samples);
			const max = Math.max(...samples);
			t.expect(min === samples[0] && max === samples[0], `scrollTop moved: start ${samples[0]} min ${min} max ${max}`);
			t.expect(/has_taken_turn: true/.test(t.read(rel)), 'write did not land');
			await t.reset(rel);
			return `scrollTop held at ${samples[0]} over ${samples.length} frames`;
		},
	},
];

// ---------------------------------------------------------------------------- main
async function main() {
	// DSE_LIFECYCLE_BUNDLE: take the built plugin from another dir (used to prove the gate
	// discriminates against an older build). Default: this repo's own fresh build.
	const bundleDir = process.env.DSE_LIFECYCLE_BUNDLE ?? repo;
	let ok = 0;
	let failed = 0;
	const selected = SCENARIOS.filter((s) => !ONLY.length || ONLY.includes(s.id));
	// SC-343 fix round 1 (Important-2): ONE try/finally for the whole run. envFail now
	// THROWS (it used to call process.exit(2) directly, which skips every finally — the
	// reason envFail calls past this point used to leave Xvfb/Obsidian running) so it, and
	// any genuinely unexpected error, both unwind through here: cleanup() always runs, and
	// the scratch temp dir is resolved (kept only when a FAIL screenshot justifies it).
	try {
		// SC-343 fix round 2 (promoted — a false green in a mandatory gate): `--only` naming
		// nothing that exists (a typo'd id) used to run zero scenarios and print a cheerful
		// `done: 0/0 ok, 0 failed`, exit 0 — indistinguishable from a real 0-scenario success.
		// That is a usage error, not a passing run. Checked INSIDE the try (not before it) so
		// the same finally deletes the `work` dir mkdtempSync already created at module load,
		// instead of leaving an empty scratch dir behind.
		// SC-343 final review: this must fire whenever ANY named id is unknown, not only when
		// EVERY named id is — `--only=G-S7a,G-S5N` (one valid id plus a typo) used to silently
		// skip the typo and exit 0 on `done: 1/1 ok`, hiding a usage error behind a real pass.
		if (ONLY.length) {
			const validIds = new Set(SCENARIOS.map((s) => s.id));
			const unknown = ONLY.filter((id) => !validIds.has(id));
			if (unknown.length) envFail(`--only names unknown scenario id(s): ${unknown.join(', ')}`);
		}
		for (const f of ['main.js', 'styles.css', 'manifest.json']) {
			if (!fs.existsSync(path.join(bundleDir, f))) envFail(`missing built ${f} in ${bundleDir} — run \`npm run obsidian-lifecycle\` (it builds first)`);
		}
		if (!fs.existsSync(BIN)) envFail(`no Obsidian binary at ${BIN}`);
		// Checked outside any try/catch that could swallow envFail's throw: a bare `catch
		// {}` right after `envFail(...)` would otherwise treat "port busy" as "port free".
		let portBusy = false;
		try {
			await fetch(`http://localhost:${PORT}/json/version`);
			portBusy = true;
		} catch {
			/* free — expected: nothing answers */
		}
		if (portBusy) envFail(`port ${PORT} already serves CDP — another instance owns it`);
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
		liveObsidian = child; // tracked now, not only if start-up completes (Important-2)
		let alive = true;
		child.once('exit', () => (alive = false));

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
		// Installed as early as CDP allows (document.body exists once the page shell has
		// loaded, well before layoutReady) so the observer is live for the dialog's very
		// first possible appearance, with no polling gap — see AUTO_DISMISS_TRUST_DIALOG.
		await t.waitFor('!!document.body', 'document.body', 20000);
		await t.ev(AUTO_DISMISS_TRUST_DIALOG);
		await t.waitFor('window.app?.workspace?.layoutReady === true', 'layoutReady', 45000);
		if (!(await t.ev("!!app.plugins?.plugins?.['draw-steel-elements']"))) {
			await t.ev(`(async () => { await app.plugins.setEnable(true); await app.plugins.enablePluginAndSave('draw-steel-elements'); })()`);
		}
		await t.waitFor("!!app.plugins.plugins['draw-steel-elements']", 'plugin loaded', 20000);
		await sleep(800);
		await t.ev(PAGE_HELPERS);
		const version = await t.ev('require("electron").ipcRenderer.sendSync("version")');
		console.log(`OBSIDIAN-LIFECYCLE start: obsidian ${version}, display ${x.display}, port ${PORT}, ${selected.length} scenario(s)`);
		for (const s of selected) {
			try {
				const summary = await s.run(t);
				ok++;
				console.log(`OBSIDIAN-LIFECYCLE ${s.id} ok (${summary})`);
			} catch (e) {
				// SC-343 fix round 2 (Minor-6): a SIGINT/SIGTERM kills Obsidian, which closes
				// the CDP socket and fails whatever scenario is mid-run — that's the signal
				// doing its job, not a real scenario FAIL. Stop counting/logging and let the
				// shared finally + the exit-code check below report this as an interrupted
				// run (exit 2), not a batch of fake FAILs.
				if (shuttingDownOnSignal) break;
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
		await cleanup();
		// SC-343 fix round 1 (promoted Minor-5), narrowed in fix round 2 (New Minor): the
		// scratch temp dir (vault + udd + the copied asar, ~30 MB/run) is only worth keeping
		// when a FAIL screenshot actually landed in shotsDir — `failed > 0` alone over-kept:
		// t.shot() fails quietly (best-effort) when the CDP socket is already down, e.g. on
		// the same SIGINT/SIGTERM that produced the "failure" in the first place.
		if (fs.existsSync(shotsDir)) {
			console.log(`OBSIDIAN-LIFECYCLE temp dir kept (has FAIL screenshot(s)): ${work}`);
		} else {
			try {
				fs.rmSync(work, { recursive: true, force: true });
			} catch {
				/* best effort */
			}
		}
	}
	console.log(`OBSIDIAN-LIFECYCLE done: ${ok}/${selected.length} ok, ${failed} failed`);
	// SC-343 fix round 2 (Minor-6): a SIGINT/SIGTERM already decided this run is exit 2
	// (onSignal will call process.exit(2) itself once its own cleanup() finishes) — report
	// the same code here rather than racing to exit 1 first off a `failed` count that's
	// low only because the loop broke out early, not because those scenarios passed.
	process.exit(shuttingDownOnSignal ? 2 : failed === 0 ? 0 : 1);
}
main().catch((e) => {
	// envFail already printed its own "environment: …" line before throwing; only log here
	// for a genuinely unexpected error (anything NOT an EnvFailure), same as before.
	if (!(e instanceof EnvFailure)) {
		console.log(`OBSIDIAN-LIFECYCLE environment: ${e instanceof Error ? e.stack : String(e)}`);
	}
	process.exit(2);
});
