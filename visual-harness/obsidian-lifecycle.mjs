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
// G-S8 (scrollTop pin across a tracker's own write: view adoption on, and, SC-459, adoption off).
// SC-377 appends 3 click-shield scenarios + a title scenario + two click-away scenarios — 25 total: G-S9a (initiative
// Amount/Label), G-S9b (ds-counter's editable stepper input), G-S9c (ds-party's award input),
// G-S9d (the inline encounter title), G-S9e (click away from an in-card input saves), G-S9f (click away onto another element / pane saves). Each drives a REAL
// mouse press (CDP Input.dispatchMouseEvent, never .focus()) in BOTH Reading view and Live
// Preview and asserts the click focuses the field, typed text lands, and the block is NOT
// opened for source editing (editor cursor never jumps into the fence).
// SC-453 appends G-S10 (26 total): an all-CRLF note on disk, a Reading view write and a sidebar
// pin + sidebar write, each asserted at the BYTE level (all-CRLF, edit landed, text outside the
// block identical), plus a pin that an editor insert never leaves the note mixed-ending.
// SC-455 appends G-S11 (27 total): a counter inside a `> [!note]` callout and inside a nested `> > ` callout,
// pinned to the sidebar from the editor (the anchor is stamped INSIDE the quote with its prefix) and then
// clicked in the sidebar panel — bytes on disk: edit landed, `> ` on every block line, everything else identical.
// (Reading view and Live Preview writes through a callout are in the e2e suite: e2e/specs/callout/.)
// SC-460 appends G-S12 (28 total): a LONE CARRIAGE RETURN above a block (LF note, CRLF note, two blocks with one between
// them). Obsidian counts it as a line break, so section line numbers are off against split('\n'); a Reading view click
// and a Live Preview click, and a sidebar pin from the close fence of the second block, must still land in the right
// block and leave every other byte (the lone CRs included) untouched. A CR-only note (only lone CRs as breaks) stays CR-only.
// SC-326 appends G-S13: two 20-round montage blocks in one note, one scrolled MID-way and one to its far
// end, keep their horizontal scroll across quick-trio taps and End round — the rebuild every write triggers AND the
// later adoption move both reset a scroll container's offset (measured before the fix: 884 -> 0).
// SC-470 appends G-S15 (G-S13 is SC-326's; G-S14 is SC-457's): the scroll pin for EVERY Reading view of the note — a second pane during a DSE write
// from the first, and a write that is not ours (in-app vault.process, and a write on disk picked up by the file watcher).
// SC-457 appends G-S14: a fence with whitespace between the backticks and the language (```` ``` ds-counter ````,
// several spaces, a tab) is a DSE block in Obsidian; after the note changed around it (Reading view, the section snapshot is
// gone when the write flushes) the write must be found again by body and land, with the info string (leading space included)
// and every other byte untouched - LF, CRLF and lone-CR notes, and a spaced block next to an unspaced twin.
// SC-477 appends G-S28 and widens G-S6u: an unterminated fence at EOF keeps the note's trailing newline(s) whether the write lands
// in place (G-S28, stay on the note) or by body after navigate-away (G-S6u) - LF, two blank lines and CRLF notes.
// SC-478 appends G-S18 (G-S16 is reserved for SC-471): a LIVE PREVIEW pane keeps its reading position when the
// DSE block it is reading is redrawn — another pane's DSE write, an external write (in-app and on disk), and the pane's own write.
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

const counterLines = (value = 10, name = 'Health') => [`name: ${name}`, `current_value: ${value}`, 'max_value: 20', 'min_value: 0'];

const FIXTURES = {
	'Lifecycle/twins.md': `# twins\n\nTOP\n\n${COUNTER(5, 'Twin')}\n\nMID\n\n${COUNTER(5, 'Twin')}\n\nBOTTOM\n`,
	'Lifecycle/counter.md': `# counter\n\nABOVE\n\n${COUNTER(10)}\n\nBELOW\n`,
	'Lifecycle/other.md': '# other\n\nJust another note.\n',
	'Lifecycle/unterminated.md': `# unterminated\n\nABOVE\n\n${UNTERMINATED_COUNTER(10)}\n`,
	// SC-477: the same note with a longer tail (two blank lines) and as a CRLF note - G-S6u (navigate away) and
	// G-S28 (stay on the note) both prove the tail survives the write byte for byte.
	'Lifecycle/unterminated-lf3.md': `# unterminated\n\nABOVE\n\n${UNTERMINATED_COUNTER(10)}\n\n\n`,
	'Lifecycle/unterminated-crlf.md': `# unterminated\n\nABOVE\n\n${UNTERMINATED_COUNTER(10)}\n`.replace(/\n/g, '\r\n'),
};
const UNTERMINATED_NOTES = ['Lifecycle/unterminated.md', 'Lifecycle/unterminated-lf3.md', 'Lifecycle/unterminated-crlf.md'];

/**
 * SC-477: click + on an unterminated-fence note and check the write kept the note's tail. `leave` = navigate away
 * before the flush (the durable path, G-S6u); otherwise stay on the note (the in-place path, G-S28). The note must end
 * with the close fence followed by exactly the bytes that ended the fixture (its trailing newline(s), CRLF included).
 */
async function unterminatedTailCase(t, rel, leave) {
	await t.open(rel);
	await t.reset(rel);
	const m = await t.mark();
	await t.clickIncrease(0);
	if (leave) {
		await t.sleep(30);
		await t.open('Lifecycle/other.md');
	}
	await t.sleep(1500);
	const text = t.read(rel);
	const tail = FIXTURES[rel].match(/\s*$/)[0];
	t.expect(t.counterValues(rel)[0] === 11, `${rel}: expected 11, got ${t.counterValues(rel)[0]}`);
	t.expect(t.integrity(rel).ok, `${rel}: note integrity: ${JSON.stringify(t.integrity(rel))}`);
	t.expect(text.trimEnd().endsWith('```'), `${rel}: fence was not closed`);
	t.expect(text.endsWith('```' + tail), `${rel}: trailing newline(s) not kept: want the note to end ${JSON.stringify('```' + tail)}, got ${JSON.stringify(text.slice(-24))}`);
	t.expect((await t.noticesSince(m)).length === 0, `${rel}: unexpected Notice`);
	t.expect((await t.errorsSince(m)).length === 0, `${rel}: errors: ${JSON.stringify(await t.errorsSince(m))}`);
}

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
	// SC-377 R1F2: a tracker AND another element in one note (click-away across elements).
	'Lifecycle/multi.md': `# multi\n\nABOVE\n\n${fence('ds-initiative', [
		'heroes:', ...HERO('Alice Alpha'), 'enemy_groups: []', 'malice:', '  value: 1',
	])}\n\nMIDDLE\n\n${COUNTER(10, 'Health')}\n\nBELOW\n`,
	'Lifecycle/B.md': `# B\n\nB-TOP\n\n${INIT('Embed Eve')}\n\nB-BOTTOM\n`,
	'Lifecycle/A.md': '# A\n\nA-TOP\n\n![[B]]\n\nA-BOTTOM\n',
	'Lifecycle/tall.md': `# tall\n\n${Array.from({ length: 30 }, (_, i) => `PRE filler ${i}.`).join('\n\n')}\n\n${fence('ds-initiative', ['heroes:', ...Array.from({ length: 25 }, (_, i) => HERO(`Hero ${String(i + 1).padStart(2, '0')}`)).flat(), 'enemy_groups: []', 'malice:', '  value: 1'])}\n\n${Array.from({ length: 30 }, (_, i) => `POST filler ${i}.`).join('\n\n')}\n`,
	'Lifecycle/party.md': `# party\n\n${fence('ds-party', ['members:', '  - name: Kira', '    level: 3', '    hero_ref: "```ds-counter\\nname: Nested\\ncurrent_value: 1\\nmax_value: 5\\nmin_value: 0\\n```"', 'party:', '  hero_tokens: 2'])}\n`,
	'Lifecycle/hoverhost.md': '# hover host\n\nSee [[counter]] here.\n',
	// SC-453: an all-CRLF note (written to disk as CRLF bytes) with one counter between ABOVE and BELOW.
	'Lifecycle/crlf.md': `# crlf\n\nABOVE\n\n${COUNTER(10)}\n\nBELOW\n`.replace(/\n/g, '\r\n'),
	// SC-460: a lone CR above (and below) the block - the note is LF, CRLF, or has two blocks with one between them.
	'Lifecycle/straycr-lf.md': `# stray\n\nA\rB\n\n${COUNTER(10)}\n\nBELOW\rX\n`,
	'Lifecycle/straycr-crlf.md': `# stray\n\nA\rB\n\n${COUNTER(10)}\n\nBELOW\rX\n`.replace(/\n/g, '\r\n'),
	'Lifecycle/straycr-cronly.md': `# stray\n\nA\n\n${COUNTER(10)}\n\nBELOW\n`.replace(/\n/g, '\r'), // SC-460 review MEDIUM-1: ONLY lone CRs
	'Lifecycle/straycr-twins.md': `# stray\n\nA\rB\n\n${COUNTER(10, 'One')}\n\nMID\rDLE\n\n${COUNTER(10, 'Two')}\n\nEND\n`,
	// SC-455: a counter inside a callout (text above and below it) and inside a callout nested in a callout.
	'Lifecycle/callout.md': `# callout\n\nABOVE\n\n${['[!note] Camp', 'text above', ...COUNTER(10).split('\n'), 'text below'].map((l) => `> ${l}`).join('\n')}\n\nBELOW\n`,
	'Lifecycle/nested.md': `# nested\n\nABOVE\n\n> [!note] Outer\n> outer text\n${['[!tip] Inner', ...COUNTER(10).split('\n'), 'inner below'].map((l) => `> > ${l}`).join('\n')}\n> outer below\n\nBELOW\n`,
	// SC-326: TWO 20-round montage blocks in one note (wider than any pane, even at fine pointer). A: three
	// heroes, current round 10 (live sockets in the MIDDLE of the board). B: two heroes, current round 20 (live
	// sockets at the far right). Distinct titles, so the blocks are not identical twins.
	'Lifecycle/montage.md': `# montage\n\nABOVE\n\n${fence('ds-montage', ['title: March A', 'rounds: 20', 'success_limit: 40', 'failure_limit: 30', 'participants:', '  - name: Kira', '  - name: Bram', '  - name: Osric', 'current_round: 10'])}\n\nMIDDLE\n\n${fence('ds-montage', ['title: March B', 'rounds: 20', 'success_limit: 12', 'failure_limit: 6', 'participants:', '  - name: Yenna', '  - name: Talin', 'current_round: 20'])}\n\nBELOW\n`,
	// SC-457: whitespace between the backticks and the language. Obsidian renders every one of these as the block.
	'Lifecycle/spaced-one.md': `# spaced\n\nTOP\n\n${fence(' ds-counter', counterLines(10))}\n\nBELOW\n`,
	'Lifecycle/spaced-three.md': `# spaced\n\nTOP\n\n${fence('   ds-counter', counterLines(10))}\n\nBELOW\n`,
	'Lifecycle/spaced-tab.md': `# spaced\n\nTOP\n\n${fence('\tds-counter', counterLines(10))}\n\nBELOW\n`,
	'Lifecycle/spaced-extra.md': `# spaced\n\nTOP\n\n${fence(' ds-counter  extra', counterLines(10))}\n\nBELOW\n`,
	'Lifecycle/spaced-crlf.md': `# spaced\n\nTOP\n\n${fence(' ds-counter', counterLines(10))}\n\nBELOW\n`.replace(/\n/g, '\r\n'),
	'Lifecycle/spaced-straycr.md': `# spaced\n\nA\rB\n\nTOP\n\n${fence(' ds-counter', counterLines(10))}\n\nBELOW\rX\n`,
	// a spaced block and an unspaced one with the SAME body: a write for one must never land in the other.
	'Lifecycle/spaced-twins.md': `# twins\n\nTOP\n\n${fence(' ds-counter', counterLines(5, 'Twin'))}\n\nMID\n\n${fence('ds-counter', counterLines(5, 'Twin'))}\n\nBOTTOM\n`,
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
    // review round 2 (Trust selector): keyed on that class first -- but a future Obsidian
    // build could rename/drop it, so a /trust the author/i TEXT fallback still runs below
    // for whatever didn't match by class. Final review fix: that fallback explicitly skips
    // any container holding a DSE modal ('.dse-modal'/'.dse-condal-modal') -- without this,
    // a real DSE modal that happens to show note/statblock content containing "trust the
    // author" would match the text test and get its own header button clicked (dismissed)
    // by this trust-dialog dismisser, not by anything the test itself did.
    const byClass = modal.querySelector('.mod-trust-folder .modal-header-button');
    if (byClass) { byClass.click(); return; }
    if (modal.querySelector('.dse-modal, .dse-condal-modal')) return;
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
		/** SC-377: a REAL mouse click (CDP Input.dispatchMouseEvent: move, press, release at the
		 *  element's centre) — never `.focus()`, which bypasses the very default action
		 *  (focus-on-mousedown) the click shield used to cancel. `elExpr` evaluates to the element. */
		async realClick(elExpr) {
			const pt = await t.ev(`(() => { const el = ${elExpr}; if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
			t.expect(pt && pt.w > 0 && pt.h > 0, `no visible element to click: ${elExpr}`);
			await sleep(150); // scrollIntoView settles
			const at = await t.ev(`(() => { const r = (${elExpr}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
			const base = { x: at.x, y: at.y, button: 'left', clickCount: 1 };
			await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
			await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', buttons: 1, ...base });
			await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', buttons: 0, ...base });
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

// SC-377 R1F: the two display modes every click-shield scenario must hold in.
const LC_LEAF = 'app.workspace.getMostRecentLeaf()';
const LC_MODES = [
	['Reading view', { mode: 'preview' }, (leaf) => `((${leaf}).view.containerEl.querySelector('.markdown-reading-view'))`],
	['Live Preview', { mode: 'source', source: false }, (leaf) => `((${leaf}).view.containerEl.querySelector('.markdown-source-view'))`],
];
/** Open `rel` fresh in the given mode (Live Preview: cursor parked on line 0, above every fence). */
async function enterMode(t, rel, [label, state, scopeOf], rootSel) {
	await t.open(rel);
	await t.reset(rel);
	await t.ev(`(async () => { await (${LC_LEAF}).setViewState({ type: 'markdown', state: { file: ${JSON.stringify(rel)}, ...${JSON.stringify(state)} }, active: true }); })()`);
	await t.sleep(1500);
	const scope = scopeOf(LC_LEAF);
	const rootEl = `Array.from(${scope}.querySelectorAll('${rootSel}')).find((x) => x.isConnected)`;
	await t.waitFor(`!!(${rootEl})`, `${label}: ${rootSel} rendered`);
	if (state.mode === 'source') await t.ev(`(${LC_LEAF}).view.editor.setCursor({ line: 0, ch: 0 })`);
	return { scope, rootEl };
}
/** Window-capture recorder of each press's FINAL defaultPrevented (read after dispatch, since the root's
 *  own capture handler runs after a window-level one). */
const installPressRecorder = (t) =>
	t.ev(`(() => { if (!window.__lcPress) { window.__lcPress = []; for (const ty of ['pointerdown', 'mousedown']) window.addEventListener(ty, (e) => setTimeout(() => window.__lcPress.push({ ty, prevented: e.defaultPrevented }), 0), true); } window.__lcPress.length = 0; return true; })()`);
const activeDesc = (t) => t.ev(`(() => { const a = document.activeElement; return a ? a.tagName + '.' + String(a.className).slice(0, 50) : null; })()`);
/** The first leaf element with visible text that is not a control - "a non-editable part of the card". */
const plainTextExpr = (rootEl) =>
	`(() => { const root = ${rootEl}; const bad = 'button,input,textarea,select,.dse-chrome,.dse-chrome-summary,[contenteditable]'; return Array.from(root.querySelectorAll('h1,h2,h3,h4,div,span,label')).find((el) => { const m = el.closest(bad); return !(m && root.contains(m)) && !el.querySelector('*') && el.textContent.trim() && el.getBoundingClientRect().width > 0; }); })()`;

// SC-377 click-shield scenario body, shared by G-S9a/b/c. For each mode (Reading view, then
// Live Preview) and each input: a REAL click must make the input document.activeElement, typed
// text must land in it, and the block must not have been opened for source editing — the
// editor cursor (parked on line 0, above every fixture's fence) must not have moved, and the
// same root (not a rebuilt one) must still hold the focused input.
async function clickShieldScenario(t, { rel, root, inputs }) {
	const modes = [
		['Reading view', { mode: 'preview' }, (leaf) => `((${leaf}).view.containerEl.querySelector('.markdown-reading-view'))`],
		['Live Preview', { mode: 'source', source: false }, (leaf) => `((${leaf}).view.containerEl.querySelector('.markdown-source-view'))`],
	];
	const leaf = 'app.workspace.getMostRecentLeaf()';
	const notes = [];
	for (const [label, state, scopeOf] of modes) {
		await t.open(rel);
		await t.reset(rel);
		await t.ev(`(async () => { await (${leaf}).setViewState({ type: 'markdown', state: { file: ${JSON.stringify(rel)}, ...${JSON.stringify(state)} }, active: true }); })()`);
		await t.sleep(1500);
		const scope = scopeOf(leaf);
		const rootEl = `Array.from(${scope}.querySelectorAll('${root}')).find((x) => x.isConnected)`;
		await t.waitFor(`!!(${rootEl})`, `${label}: ${root} rendered`);
		if (state.mode === 'source') {
			await t.ev(`(${leaf}).view.editor.setCursor({ line: 0, ch: 0 })`);
		}
		const m = await t.mark();
		await t.ev(`(${rootEl}).__lcTag = 's9'`);
		// Review MEDIUM-1: a press on a NON-editable part of the card is still prevented in BOTH
		// modes (in Live Preview an unbounded editable test climbed to CodeMirror's contenteditable
		// and prevented nothing): no native text selection, and focus does not move into the widget.
		{
			await installPressRecorder(t);
			const aeBefore = await activeDesc(t);
			await t.realClick(plainTextExpr(rootEl));
			await t.sleep(250);
			const presses = await t.ev('window.__lcPress.slice()');
			t.expect(presses.length > 0 && presses.every((p) => p.prevented), `${label}: a press on non-editable card text was not default-prevented: ${JSON.stringify(presses)}`);
			t.expect((await activeDesc(t)) === aeBefore, `${label}: a click on card text moved focus ${aeBefore} -> ${await activeDesc(t)}`);
			t.expect((await t.ev('String(getSelection())')) === '', `${label}: a click on card text started a native text selection`);
		}
		for (const input of inputs) {
			const inputEl = `(${rootEl}).querySelector('${input.sel}')`;
			await t.waitFor(`!!(${inputEl})`, `${label}: ${input.sel} rendered`);
			await t.realClick(inputEl);
			await t.sleep(250);
			const focused = await t.ev(`(() => { const i = ${inputEl}; const ae = document.activeElement; return { active: ae === i, activeTag: ae ? ae.tagName + '.' + String(ae.className).slice(0, 60) : null }; })()`);
			t.expect(focused.active, `${label}: a real click on ${input.sel} did not focus it (activeElement ${focused.activeTag})`);
			await t.cdp.call('Input.insertText', { text: input.typed });
			await t.sleep(250);
			const value = await t.ev(`${inputEl}.value`);
			const good = typeof input.expectValue === 'function' ? input.expectValue(value) : value === input.expectValue;
			t.expect(good, `${label}: typed "${input.typed}" into ${input.sel} but it holds "${value}"`);
			t.expect(await t.ev(`document.activeElement === ${inputEl}`), `${label}: focus left ${input.sel} after typing`);
		}
		if (state.mode === 'source') {
			const cur = await t.ev(`(${leaf}).view.editor.getCursor().line`);
			t.expect(cur === 0, `${label}: the click moved the editor cursor to line ${cur} — the block was opened for source editing`);
		}
		t.expect(await t.ev(`(${leaf}).view.getMode() === ${JSON.stringify(state.mode)}`), `${label}: the view changed mode`);
		t.expect(await t.ev(`Array.from(${scope}.querySelectorAll('${root}')).some((x) => x.isConnected && x.__lcTag === 's9')`), `${label}: the block was rebuilt`);
		t.expect((await t.errorsSince(m)).length === 0, `${label}: page errors ${JSON.stringify(await t.errorsSince(m))}`);
		notes.push(label);
	}
	await t.reset(rel);
	await t.open(rel);
	return `real click focused ${inputs.map((i) => i.sel.split('.').pop()).join(' + ')} and typed text landed in ${notes.join(' + ')}; no source edit opened`;
}

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
			for (const rel of UNTERMINATED_NOTES) await unterminatedTailCase(t, rel, true);
			t.expect(t.read('Lifecycle/other.md') === FIXTURES['Lifecycle/other.md'], 'other.md was written');
			return 'current_value=11 after navigate-away, fence closed, trailing newline(s) kept (LF, two blank lines, CRLF)';
		},
	},
	{
		// SC-477 (review r1, HIGH-1): the same unterminated fence written IN PLACE - click, stay on the note. Obsidian
		// 1.14.4 reports the section's lineEnd as the note's LAST line, blank tail included, so the write used to replace
		// the tail and drop the note's final newline(s). Must read exactly like G-S6u: the close fence, then the tail.
		id: 'G-S28',
		async run(t) {
			for (const rel of UNTERMINATED_NOTES) await unterminatedTailCase(t, rel, false);
			return 'current_value=11 in place, fence closed, trailing newline(s) kept (LF, two blank lines, CRLF)';
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
				await t.ev(`${t.root(TRACKER, writer)}.querySelector('.dse-init__round-advance').click()`);
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
			// fenced YAML itself: field order and quoting — by design, not a miss; since SC-482 it no
			// longer ADDS defaulted fields like value_height/name_height that the block never
			// declared) must be byte-for-byte the fixture's.
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
		// Spec G-S8 (SC-198 scroll pin), made discriminating by SC-459: a tall scrolled tracker
		// keeps scrollTop across its own write, in two phases.
		// Phase 1, view adoption ON (the default): SC-340 adopts the writer's view, the tracker
		// DOM is kept and the sizer never collapses, so scrollTop holds with or without the pin
		// (SC-459 r1, Obsidian 1.14.4: pin disabled -> held 8/8). Kept as the default-path check.
		// Phase 2, view adoption OFF (the SC-340 §6.6 kill switch, flipped at runtime: claim()
		// reads `enabled` on every call): the write's rebuild draws the tracker FRESH, which is
		// the path SC-198's clamp lives on. Measured (SC-459 r1, 1.14.4): unpinned, scrollTop
		// 2779 -> 2001 with the sizer's inline min-height 5501px -> 2446px; pinned, held. The
		// phase asserts the rebuild really happened (a tracker is rendered and its root was
		// replaced, sizer inline min-height fell below the scroll position — otherwise the
		// scenario proves nothing), that `data-dse-scroll-pin` was on the scroller at that
		// moment, that scrollTop never moved, and (sampling runs until the pin is released plus 10
		// frames, cap 5 s) that the sizer's inline min-height was back at or above the scroll
		// position when the pin came off, so the release cannot clamp unseen. Phase 1 also
		// asserts the tracker was ADOPTED, so a change that stops adoption is visible.
		id: 'G-S8',
		async run(t) {
			const rel = 'Lifecycle/tall.md';
			const scroller = `app.workspace.getMostRecentLeaf().view.containerEl.querySelector('.markdown-preview-view')`;
			const writeOnce = async () => {
				await t.open(rel);
				await t.reset(rel);
				await t.ev(`(() => { const s = ${scroller}; const r = ${t.root(TRACKER)}; s.scrollTop = r.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop + 1500; })()`);
				await t.sleep(900);
				await t.tag(TRACKER, 'gs8');
				// A MutationObserver sees every inline min-height Obsidian writes on the sizer; a
				// rAF sample alone catches the collapse in ~1 frame. The inline value is read even
				// while pinned (the pin outranks it via !important, it does not stop the write).
				// Sampling runs until the pin is released plus 10 frames. The cap counts from the pin's FIRST
				// sighting (TTL 2500 ms + 2000 ms slack, hard cap 12 s), not from the click: under CPU load
				// the rebuild and so the release come late, and a click-relative cap flaked at 6x throttle
				// (SC-459 r5). A pin that never appears gives up at 5 s.
				// `mhAtRelease >= st0` is deliberately weaker than the real no-clamp bound (about st0 +
				// clientHeight): it is enough because a clamp at the release lands in the 10 post-release
				// frames, which feed stMin, so the scrollTop assertions fail on it anyway.
				const m = await t.ev(`new Promise((resolve) => { const s = ${scroller}; const st0 = s.scrollTop; const sr = s.getBoundingClientRect(); const b = Array.from(${t.root(TRACKER)}.querySelectorAll('button.dse-init__portrait-toggle')).find((x) => { const r = x.getBoundingClientRect(); return r.top > sr.top + 100 && r.bottom < sr.bottom - 100; }); const samples = []; let stMin = st0; let mhMin = Infinity; let pinAtCollapse = null; let pinFrames = 0; let pinSeen = false; let pinOnAt = 0; let released = false; let goneFrames = 0; let mhAtRelease = null; const sizerMh = () => { const z = s.querySelector('.markdown-preview-sizer'); return z ? parseFloat(z.style.minHeight) : NaN; }; const onScroll = () => { stMin = Math.min(stMin, s.scrollTop); }; s.addEventListener('scroll', onScroll); const mo = new MutationObserver(() => { const z = s.querySelector('.markdown-preview-sizer'); const mh = z ? parseFloat(z.style.minHeight) : NaN; if (!Number.isNaN(mh) && mh < mhMin) { mhMin = mh; if (mh < st0 && pinAtCollapse === null) pinAtCollapse = s.hasAttribute('data-dse-scroll-pin'); } }); mo.observe(s, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true }); const t0 = performance.now(); const tick = () => { samples.push(s.scrollTop); if (s.hasAttribute('data-dse-scroll-pin')) { pinFrames++; if (!pinSeen) pinOnAt = performance.now() - t0; pinSeen = true; released = false; goneFrames = 0; } else if (pinSeen) { if (!released) { released = true; mhAtRelease = sizerMh(); } goneFrames++; } if (goneFrames < 10 && performance.now() - t0 < (pinSeen ? Math.min(pinOnAt + 4500, 12000) : 5000)) requestAnimationFrame(tick); else { mo.disconnect(); s.removeEventListener('scroll', onScroll); resolve({ st0, frames: samples.length, stMin: Math.min(stMin, ...samples), stMax: Math.max(...samples), mhMin, pinAtCollapse, pinFrames, released, mhAtRelease, ms: Math.round(performance.now() - t0) }); } }; requestAnimationFrame(tick); b.click(); })`);
				// INFO-4: "not the same root" alone is also true when no tracker renders at all.
				m.present = await t.ev(`!!(${t.root(TRACKER)})`);
				m.rebuilt = m.present && !(await t.sameRoot(TRACKER, 'gs8'));
				t.expect(/has_taken_turn: true/.test(t.read(rel)), 'write did not land');
				await t.reset(rel);
				return m;
			};
			const on = await writeOnce();
			t.expect(on.present, 'adoption on: no tracker is rendered after the write');
			t.expect(!on.rebuilt, 'adoption on: the tracker was rebuilt, not adopted (SC-340 adoption missed) — this phase no longer checks the default path');
			t.expect(on.stMin === on.st0 && on.stMax === on.st0, `adoption on: scrollTop moved: start ${on.st0} min ${on.stMin} max ${on.stMax}`);
			t.expect(!on.released || on.mhAtRelease >= on.st0, `adoption on: the sizer's inline min-height was ${on.mhAtRelease}px when the pin was released, below scrollTop ${on.st0}`);
			const prevEnabled = await t.ev(`${t.reg}.enabled`);
			let off;
			try {
				await t.ev(`${t.reg}.enabled = false`);
				off = await writeOnce();
			} finally {
				await t.ev(`${t.reg}.enabled = ${JSON.stringify(prevEnabled)}`);
			}
			t.expect(off.present, 'adoption off: no tracker is rendered after the write');
			t.expect(off.rebuilt, 'adoption off: the write did not rebuild the tracker — the phase cannot reach the SC-198 clamp');
			t.expect(off.mhMin < off.st0, `adoption off: the rebuild never collapsed the sizer below the scroll position (inline min-height min ${off.mhMin}px, scrollTop ${off.st0}) — nothing to pin against; re-measure SC-198 (SC-459)`);
			t.expect(off.pinAtCollapse === true, `adoption off: data-dse-scroll-pin was not on the scroller when the sizer collapsed to ${off.mhMin}px (pin frames ${off.pinFrames}, scrollTop min ${off.stMin} of start ${off.st0})`);
			t.expect(off.stMin === off.st0 && off.stMax === off.st0, `adoption off: scrollTop moved: start ${off.st0} min ${off.stMin} max ${off.stMax} (sizer inline min-height fell to ${off.mhMin}px, pin present ${off.pinAtCollapse})`);
			t.expect(off.released, `adoption off: the pin was never seen released within ${off.ms}ms (pin frames ${off.pinFrames}) — the release cannot be checked`);
			t.expect(off.mhAtRelease >= off.st0, `adoption off: the sizer's inline min-height was ${off.mhAtRelease}px when the pin was released, below scrollTop ${off.st0} — the release would clamp`);
			return `adoption on: scrollTop held at ${on.st0} over ${on.frames} frames; adoption off: tracker rebuilt, sizer min-height fell to ${off.mhMin}px under the pin and was ${off.mhAtRelease}px at its release, scrollTop held at ${off.st0} over ${off.frames} frames (${off.ms}ms)`;
		},
	},
	{
		// SC-377: the click shield used to preventDefault() every capture-phase mousedown in a
		// block, so the browser never focused an in-card <input> on a click (jsdom has no
		// focus-on-mousedown default, and the scenarios above all call .focus()). Real mouse
		// clicks, Reading view AND Live Preview, on initiative's Amount and Label fields.
		id: 'G-S9a',
		async run(t) {
			return clickShieldScenario(t, {
				rel: 'Lifecycle/ogres.md',
				root: '[data-dse-element="initiative"]',
				inputs: [
					{ sel: 'input.dse-init__malice-quickadd-amount', typed: '7', expectValue: '7' },
					{ sel: 'input.dse-init__malice-quickadd-label', typed: 'Feytouched', expectValue: 'Feytouched' },
				],
			});
		},
	},
	{
		id: 'G-S9b',
		async run(t) {
			return clickShieldScenario(t, {
				rel: 'Lifecycle/counter.md',
				root: '[data-dse-element="counter"]',
				// The editable stepper input shows the current value ("10") and the click places the
				// caret where it landed, so the digit lands somewhere inside it: assert one more
				// character that includes the typed one, not a position.
				inputs: [{ sel: 'input.dse-stepper__input', typed: '5', expectValue: (v) => v.length === 3 && v.includes('5') }],
			});
		},
	},
	{
		// SC-377 (owner ruling O6): the encounter title edits inline. A REAL click on the title
		// text swaps in the input (the shield stops mousedown from reaching Obsidian), typed text
		// lands, Enter commits and the write puts `name:` FIRST in the note without touching the
		// rest of the block; clearing the field removes it again. Reading view AND Live Preview
		// (R1F INFO-3); in Live Preview the editor cursor must stay on line 0 throughout.
		id: 'G-S9d',
		async run(t) {
			const rel = 'Lifecycle/ogres.md';
			for (const mode of LC_MODES) {
				const label = mode[0];
				const { rootEl } = await enterMode(t, rel, mode, '[data-dse-element="initiative"]');
				await t.ev(`(${rootEl}).__lcTag = 's9d'`);
				const text = `(${rootEl}).querySelector('.dse-init__title-text')`;
				const input = `(${rootEl}).querySelector('textarea.dse-init__title-input')`;
				await t.realClick(text);
				await t.sleep(250);
				t.expect(await t.ev(`document.activeElement === (${input})`), `${label}: a real click on the title did not open a focused input`);
				await t.cdp.call('Input.insertText', { text: 'Ford of Bruinen' });
				await t.sleep(150);
				// R2F: a real click ON the open editor (now a <textarea>) is the browser's to handle - the shield
				// must leave it focused and open, and the draft intact.
				await t.realClick(input);
				await t.sleep(200);
				t.expect(await t.ev(`document.activeElement === (${input}) && (${input}).value === 'Ford of Bruinen'`), `${label}: a real click on the open title editor closed it, blurred it or lost the draft`);
				await t.key('Enter', 'Enter', 13);
				await t.sleep(1500);
				t.expect(await t.ev(`!(${input})`), `${label}: Enter did not leave edit mode`);
				t.expect(/^```ds-initiative\nname: Ford of Bruinen\nheroes:/m.test(t.read(rel)), `${label}: name was not written first: ${t.read(rel).slice(0, 160)}`);
				t.expect(t.integrity(rel).ok, `${label}: note integrity`);
				if (mode[1].mode === 'preview') t.expect(await t.ev(`(${rootEl}).__lcTag === 's9d'`), `${label}: the tracker was rebuilt by the rename`);
				// Clear it again: click, select-all, delete, Enter.
				await t.realClick(text);
				await t.sleep(250);
				t.expect(await t.ev(`document.activeElement === (${input})`), `${label}: the second click did not open the input`);
				// Select-all + delete through the editing command (a bare CDP Backspace keyDown does not
				// edit a text field without a `commands` hint), then commit with a real Enter.
				await t.ev(`(() => { const i = ${input}; i.select(); return document.execCommand('delete'); })()`);
				await t.key('Enter', 'Enter', 13);
				await t.sleep(1500);
				t.expect(/^```ds-initiative\nheroes:/m.test(t.read(rel)), `${label}: clearing the title did not remove the top-level name: ${t.read(rel).slice(0, 160)}`);
				if (mode[1].mode === 'source') t.expect((await t.ev(`(${LC_LEAF}).view.editor.getCursor().line`)) === 0, `${label}: editing the title moved the editor cursor`);
			}
			await t.reset(rel);
			return 'real click opened a focused input, text landed, Enter wrote name: first; clearing removed it; Reading view + Live Preview, cursor stayed on line 0';
		},
	},
	{
		// SC-377 R1F LOW-1: "click away saves". The shield prevents a press on non-editable card
		// content, which also stopped focus leaving an in-card input, so its blur-commit never ran.
		// A REAL click on plain card text must now blur the focused in-card input, in both modes:
		// the title commits and persists, a half-typed ds-counter value commits, Amount keeps its
		// draft but loses focus, ds-party's award input loses focus.
		id: 'G-S9e',
		async run(t) {
			const clickAway = async (rootEl) => {
				await t.realClick(plainTextExpr(rootEl));
				await t.sleep(250);
			};
			for (const mode of LC_MODES) {
				const label = mode[0];
				const isLP = mode[1].mode === 'source';
				// the title commits and persists on a click elsewhere in the same card
				let { rootEl } = await enterMode(t, 'Lifecycle/ogres.md', mode, '[data-dse-element="initiative"]');
				await t.realClick(`(${rootEl}).querySelector('.dse-init__title-text')`);
				await t.sleep(250);
				await t.cdp.call('Input.insertText', { text: 'Away Title' });
				await clickAway(rootEl);
				await t.sleep(1500);
				t.expect(await t.ev(`!(${rootEl}).querySelector('textarea.dse-init__title-input')`), `${label}: clicking elsewhere in the card left the title input open`);
				t.expect(/^```ds-initiative\nname: Away Title\nheroes:/m.test(t.read('Lifecycle/ogres.md')), `${label}: the title was not saved on click-away: ${t.read('Lifecycle/ogres.md').slice(0, 120)}`);
				// Amount: focus is released, the draft stays
				await t.realClick(`(${rootEl}).querySelector('input.dse-init__malice-quickadd-amount')`);
				await t.sleep(200);
				await t.cdp.call('Input.insertText', { text: '6' });
				await clickAway(rootEl);
				const amt = await t.ev(`(() => { const i = (${rootEl}).querySelector('input.dse-init__malice-quickadd-amount'); return { focused: document.activeElement === i, value: i.value }; })()`);
				t.expect(!amt.focused && amt.value === '6', `${label}: Amount after click-away ${JSON.stringify(amt)}`);
				// ds-counter: a half-typed value commits on click-away
				({ rootEl } = await enterMode(t, 'Lifecycle/counter.md', mode, '[data-dse-element="counter"]'));
				await t.realClick(`(${rootEl}).querySelector('input.dse-stepper__input')`);
				await t.sleep(200);
				await t.ev(`(${rootEl}).querySelector('input.dse-stepper__input').select()`);
				await t.cdp.call('Input.insertText', { text: '7' });
				t.expect(t.counterValues('Lifecycle/counter.md')[0] === 10, `${label}: the counter committed before the click-away`);
				await clickAway(rootEl);
				await t.sleep(1500);
				t.expect(t.counterValues('Lifecycle/counter.md')[0] === 7, `${label}: the half-typed counter value was not committed on click-away (current_value=${t.counterValues('Lifecycle/counter.md')[0]})`);
				// ds-party award input: focus is released
				({ rootEl } = await enterMode(t, 'Lifecycle/party.md', mode, '[data-dse-element="party"]'));
				await t.realClick(`(${rootEl}).querySelector('input.dse-party__award-input')`);
				await t.sleep(200);
				t.expect(await t.ev(`document.activeElement === (${rootEl}).querySelector('input.dse-party__award-input')`), `${label}: the award input did not focus`);
				await clickAway(rootEl);
				t.expect(await t.ev(`document.activeElement !== (${rootEl}).querySelector('input.dse-party__award-input')`), `${label}: the award input kept focus after a click elsewhere in the card`);
				if (isLP) t.expect((await t.ev(`(${LC_LEAF}).view.editor.getCursor().line`)) === 0, `${label}: the click-away moved the editor cursor`);
			}
			for (const rel of ['Lifecycle/ogres.md', 'Lifecycle/counter.md', 'Lifecycle/party.md']) await t.reset(rel);
			return 'click on plain card text blurred the focused in-card input in Reading view + Live Preview: title and half-typed counter value saved, Amount/award lost focus';
		},
	},
	{
		// SC-377 R1F2 (NEW-LOW-B): "click away saves" across ELEMENT boundaries. Each DSE root has its own
		// shield; a press on root B used to look only at focus inside root B, so a title being edited in
		// tracker A stayed open and unsaved when the user clicked another element's card, or the same
		// tracker in a second pane. Real clicks, Reading view + Live Preview for the cross-element case,
		// Reading view for the second pane.
		id: 'G-S9f',
		async run(t) {
			const rel = 'Lifecycle/multi.md';
			for (const mode of LC_MODES) {
				const label = mode[0];
				const { scope, rootEl } = await enterMode(t, rel, mode, '[data-dse-element="initiative"]');
				const counterRoot = `Array.from(${scope}.querySelectorAll('[data-dse-element="counter"]')).find((x) => x.isConnected)`;
				await t.waitFor(`!!(${counterRoot})`, `${label}: counter rendered`);
				await t.realClick(`(${rootEl}).querySelector('.dse-init__title-text')`);
				await t.sleep(250);
				await t.cdp.call('Input.insertText', { text: 'Across Elements' });
				await t.realClick(plainTextExpr(counterRoot)); // a DIFFERENT element's card
				await t.sleep(1500);
				t.expect(await t.ev(`!(${rootEl}).querySelector('textarea.dse-init__title-input')`), `${label}: a click on another element's card left the title input open`);
				t.expect(/^```ds-initiative\nname: Across Elements\nheroes:/m.test(t.read(rel)), `${label}: the title was not saved on a click in another element: ${t.read(rel).slice(0, 120)}`);
				if (mode[1].mode === 'source') t.expect((await t.ev(`(${LC_LEAF}).view.editor.getCursor().line`)) === 0, `${label}: the click moved the editor cursor`);
			}
			// the same tracker in a second pane (Reading view)
			await t.open(rel);
			await t.reset(rel);
			await t.ev(`(window.__lcP1 = ${LC_LEAF}, true)`);
			await t.ev(`(async () => { const leaf = app.workspace.getLeaf('split', 'vertical'); window.__lcP2 = leaf; await leaf.setViewState({ type: 'markdown', state: { file: ${JSON.stringify(rel)}, mode: 'preview' }, active: true }); })()`);
			await t.sleep(1500);
			const inPane = (leaf, sel) => `Array.from((${leaf}).view.containerEl.querySelectorAll('.markdown-reading-view ${sel}')).find((x) => x.isConnected)`;
			const p1 = inPane('window.__lcP1', '[data-dse-element="initiative"]');
			const p2 = inPane('window.__lcP2', '[data-dse-element="initiative"]');
			await t.waitFor(`!!(${p1}) && !!(${p2})`, 'both panes render the tracker');
			await t.realClick(`(${p1}).querySelector('.dse-init__title-text')`);
			await t.sleep(250);
			await t.cdp.call('Input.insertText', { text: 'Two Panes' });
			await t.realClick(plainTextExpr(p2)); // the same tracker, other pane
			await t.sleep(1500);
			t.expect(/^```ds-initiative\nname: Two Panes\nheroes:/m.test(t.read(rel)), `a click on the same tracker in another pane did not save the title: ${t.read(rel).slice(0, 120)}`);
			await t.ev(`(window.__lcP2.detach(), true)`);
			await t.sleep(500);
			await t.reset(rel);
			return 'a title being edited saved on a real click on another element\'s card (Reading view + Live Preview) and on the same tracker in a second pane';
		},
	},
	{
		id: 'G-S9c',
		async run(t) {
			return clickShieldScenario(t, {
				rel: 'Lifecycle/party.md',
				root: '[data-dse-element="party"]',
				inputs: [{ sel: 'input.dse-party__award-input', typed: '4', expectValue: (v) => v.length === 2 && v.includes('4') }],
			});
		},
	},
	{
		// SC-453: a CRLF note. The sidebar host used to miss its block (the anchor scan never matched a
		// fence line ending in \r), so no sidebar write landed; and a write that did land (reading mode)
		// left the note mixed-ending. Real bytes on disk: the note is written as CRLF, a Reading-view
		// click and then a sidebar-pinned click each write, and after each the file must be ALL-CRLF
		// (no bare LF, no bare CR), the edit landed, and the text above/below the block byte-identical.
		id: 'G-S10',
		async run(t) {
			const rel = 'Lifecycle/crlf.md';
			const PREFIX = '# crlf\r\n\r\nABOVE\r\n\r\n```ds-counter\r\n';
			const SUFFIX = '\r\n```\r\n\r\nBELOW\r\n';
			const allCrlf = (s) => !/\r(?!\n)|(?<!\r)\n/.test(s);
			const waitDisk = async (pred, what) => {
				const t0 = Date.now();
				while (!pred(t.read(rel))) {
					if (Date.now() - t0 > 15000) throw new Error(`timed out waiting for ${what}; disk is ${JSON.stringify(t.read(rel))}`);
					await sleep(100);
				}
			};
			const check = (label, text, value) => {
				t.expect(allCrlf(text), `${label}: the note is not all-CRLF: ${JSON.stringify(text)}`);
				t.expect(text.startsWith(PREFIX) && text.endsWith(SUFFIX), `${label}: text outside the block changed: ${JSON.stringify(text)}`);
				t.expect(text.includes(`current_value: ${value}`), `${label}: the edit did not land (want current_value: ${value}): ${JSON.stringify(text)}`);
			};
			t.expect(t.read(rel) === FIXTURES[rel] && allCrlf(t.read(rel)), 'the fixture is not on disk as all-CRLF');

			// 1. Reading view: a click on Increase writes through ReadingModeBlockHost.
			await t.open(rel);
			await t.reset(rel);
			await t.waitFor(`!!(${t.root('[data-dse-element="counter"]')})`, 'the counter rendered in Reading view');
			await t.clickIncrease(0);
			await waitDisk((s) => s.includes('current_value: 11'), 'the Reading view write');
			check('Reading view', t.read(rel), 11);

			// 2. Sidebar: pin the block (stamps a _dse_anchor), then click Increase INSIDE the sidebar panel.
			await t.reset(rel);
			await t.ev(`(async () => { await (${LC_LEAF}).setViewState({ type: 'markdown', state: { file: ${JSON.stringify(rel)}, mode: 'source', source: false }, active: true }); })()`);
			await t.sleep(1500);
			await t.ev(`(${LC_LEAF}).view.editor.setCursor({ line: 5, ch: 0 })`);
			// SC-383: generateAnchorId can mint hex ids YAML reads as numbers (927e10, 012345), which loses the
			// anchor on the first write (~3% of runs). Pin Math.random to one that cannot ('abcdef') while pinning
			// (harmless once SC-360 fixes the generator; the assertions below do not depend on this value).
			await t.ev(`(() => { window.__lcRandom = Math.random; Math.random = () => 0xabcdef / 0x1000000; return true; })()`);
			try {
				t.expect(await t.ev(`app.commands.executeCommandById('draw-steel-elements:send-block-to-sidebar')`), 'the send-block-to-sidebar command did not run');
				await waitDisk((s) => s.includes('_dse_anchor:'), 'the anchor stamp');
			} finally {
				await t.ev(`(() => { if (window.__lcRandom) Math.random = window.__lcRandom; delete window.__lcRandom; return true; })()`);
			}
			// Whatever id generateAnchorId minted (it does not matter which: SC-383 / SC-360 own that), the id on
			// disk must be the one the panel holds, and YAML must read it as a STRING.
			const stamped = /_dse_anchor: ([^\r\n]+)\r\n/.exec(t.read(rel))?.[1];
			t.expect(!!stamped, `no _dse_anchor line stamped: ${JSON.stringify(t.read(rel))}`);
			const held = await t.ev(`app.workspace.getLeavesOfType('dse-sidebar')[0].view.getState().panels.map((p) => p.anchorId)`);
			t.expect(held.length === 1 && held[0] === stamped, `the panel holds ${JSON.stringify(held)} but disk has anchor ${JSON.stringify(stamped)}`);
			// `yaml` (eemeli v2) is what Obsidian's parseYaml is (test/mocks/obsidian-core.ts); the page cannot require('obsidian').
			const { parse: parseYaml } = await import('yaml');
			t.expect(typeof parseYaml(`k: ${stamped}`).k === 'string', `YAML reads the stamped id ${JSON.stringify(stamped)} as a non-string`);
			t.expect(allCrlf(t.read(rel)), `pinning stamped an LF line into the CRLF note: ${JSON.stringify(t.read(rel))}`);
			const panelCounter = `Array.from(app.workspace.getLeavesOfType('dse-sidebar')[0].view.containerEl.querySelectorAll('[data-dse-element="counter"]')).find((x) => x.isConnected)`;
			await t.waitFor(`!!(${panelCounter})`, 'the counter mounted in the sidebar panel');
			await t.ev(`(${panelCounter}).querySelector('button[aria-label^="Increase"]').click()`);
			await waitDisk((s) => s.includes('current_value: 11'), 'the sidebar write');
			const sidebarText = t.read(rel);
			t.expect(/_dse_anchor: [A-Za-z0-9_-]+\r\n```/.test(sidebarText), `the anchor did not survive the sidebar write: ${JSON.stringify(sidebarText)}`);
			t.expect(allCrlf(sidebarText) && sidebarText.startsWith(PREFIX) && sidebarText.endsWith('\r\n```\r\n\r\nBELOW\r\n'), `Sidebar: not all-CRLF or text outside the block changed: ${JSON.stringify(sidebarText)}`);
			t.expect(await t.ev(`!document.querySelector('[data-dse-sidebar-unavailable]')`), 'the sidebar panel degraded to the not-found card');

			// 3. Editor inserts (authoring scaffolds, compendium inserts) go through CodeMirror, whose document
			// is LF-normalised: Obsidian itself saves the WHOLE file back as LF after ANY editor edit (measured
			// on 1.14.4 with a one-character edit too). Nothing DSE-side applies, but the note must never end up
			// MIXED, so that stays pinned here: all-LF or all-CRLF, with the inserted text present.
			await t.ev(`(async () => { for (const l of app.workspace.getLeavesOfType('dse-sidebar')) l.detach(); })()`);
			await t.reset(rel);
			await t.ev(`(async () => { await (${LC_LEAF}).setViewState({ type: 'markdown', state: { file: ${JSON.stringify(rel)}, mode: 'source', source: false }, active: true }); })()`);
			await t.sleep(1500);
			await t.ev(`(${LC_LEAF}).view.editor.replaceRange('INSERT1\\nINSERT2\\n', { line: 2, ch: 0 })`);
			await waitDisk((s) => s.includes('INSERT2'), 'the editor insert to be saved');
			const inserted = t.read(rel);
			t.expect(allCrlf(inserted) || !inserted.includes('\r'), `an editor insert left the note mixed-ending: ${JSON.stringify(inserted)}`);

			await t.reset(rel);
			return 'CRLF note stayed all-CRLF on disk across a Reading view write and a sidebar pin + sidebar write (edits landed, text outside the block byte-identical); an editor insert never leaves it mixed';
		},
	},
	{
		// SC-455: a block inside a callout / blockquote, pinned to the sidebar and written from there. The
		// anchor stamp must land INSIDE the quote with the block's own prefix, and the sidebar write must keep
		// `> ` (or `> > `) on every line it writes. Real bytes on disk after each step: the edit landed, every
		// line between the fences carries the prefix, both fence lines and everything outside the block are
		// byte-identical to the fixture (apart from the one stamped anchor line).
		id: 'G-S11',
		async run(t) {
			const noted = [];
			for (const [rel, prefix] of [['Lifecycle/callout.md', '> '], ['Lifecycle/nested.md', '> > ']]) {
				const fixtureLines = FIXTURES[rel].split('\n');
				const open = fixtureLines.findIndex((l) => l === `${prefix}\`\`\`ds-counter`);
				const close = fixtureLines.findIndex((l, i) => i > open && l === `${prefix}\`\`\``);
				const outside = (text) => {
					const lines = text.split('\n');
					const end = lines.length - (fixtureLines.length - close);
					return { head: lines.slice(0, open + 1), tail: lines.slice(end), body: lines.slice(open + 1, end) };
				};
				const fx = outside(FIXTURES[rel]);
				const waitDisk = async (pred, what) => {
					const t0 = Date.now();
					while (!pred(t.read(rel))) {
						if (Date.now() - t0 > 15000) throw new Error(`${rel}: timed out waiting for ${what}; disk is ${JSON.stringify(t.read(rel))}`);
						await sleep(100);
					}
				};
				const checkShape = (label, text) => {
					const now = outside(text);
					t.expect(JSON.stringify(now.head) === JSON.stringify(fx.head) && JSON.stringify(now.tail) === JSON.stringify(fx.tail), `${rel} ${label}: text outside the block (or a fence line) changed: ${JSON.stringify(text)}`);
					t.expect(now.body.length > 0 && now.body.every((l) => l.startsWith(prefix.trimEnd())), `${rel} ${label}: a block line lost its prefix: ${JSON.stringify(now.body)}`);
					return now;
				};
				t.expect(t.read(rel) === FIXTURES[rel], `${rel}: the fixture is not on disk`);

				// 1. Pin from the editor: the cursor on a line of the quoted fence.
				await t.reset(rel);
				await t.ev(`(async () => { await (${LC_LEAF}).setViewState({ type: 'markdown', state: { file: ${JSON.stringify(rel)}, mode: 'source', source: false }, active: true }); })()`);
				await t.sleep(1500);
				await t.ev(`(${LC_LEAF}).view.editor.setCursor({ line: ${open + 2}, ch: 0 })`);
				await t.ev(`(() => { window.__lcRandom = Math.random; Math.random = () => 0xabcdef / 0x1000000; return true; })()`); // SC-383, as G-S10
				try {
					t.expect(await t.ev(`app.commands.executeCommandById('draw-steel-elements:send-block-to-sidebar')`), `${rel}: the send-block-to-sidebar command did not run (not available inside the callout?)`);
					await waitDisk((s) => s.includes('_dse_anchor:'), 'the anchor stamp');
				} finally {
					await t.ev(`(() => { if (window.__lcRandom) Math.random = window.__lcRandom; delete window.__lcRandom; return true; })()`);
				}
				const stamped = t.read(rel);
				const id = /_dse_anchor: ([A-Za-z0-9_-]+)\n/.exec(stamped)?.[1];
				t.expect(!!id, `${rel}: no _dse_anchor stamped: ${JSON.stringify(stamped)}`);
				const expectedStamp = [...fixtureLines.slice(0, close), `${prefix}_dse_anchor: ${id}`, ...fixtureLines.slice(close)].join('\n');
				t.expect(stamped === expectedStamp, `${rel}: the stamp is not exactly one prefixed anchor line inside the block:\n got  ${JSON.stringify(stamped)}\n want ${JSON.stringify(expectedStamp)}`);
				const held = await t.ev(`app.workspace.getLeavesOfType('dse-sidebar')[0].view.getState().panels.map((p) => p.anchorId)`);
				t.expect(held.length === 1 && held[0] === id, `${rel}: the panel holds ${JSON.stringify(held)} but disk has anchor ${JSON.stringify(id)}`);

				// 2. Click Increase INSIDE the sidebar panel: the write goes through SidebarBlockHost.
				const panelCounter = `Array.from(app.workspace.getLeavesOfType('dse-sidebar')[0].view.containerEl.querySelectorAll('[data-dse-element="counter"]')).find((x) => x.isConnected)`;
				await t.waitFor(`!!(${panelCounter})`, `${rel}: the counter mounted in the sidebar panel`);
				await t.ev(`(${panelCounter}).querySelector('button[aria-label^="Increase"]').click()`);
				await waitDisk((s) => s.includes('current_value: 11'), 'the sidebar write');
				const written = t.read(rel);
				const now = checkShape('sidebar write', written);
				t.expect(now.body.includes(`${prefix}current_value: 11`) && now.body.includes(`${prefix}_dse_anchor: ${id}`), `${rel}: the edit or the anchor is missing / not prefixed: ${JSON.stringify(now.body)}`);
				t.expect(await t.ev(`!document.querySelector('[data-dse-sidebar-unavailable]')`), `${rel}: the sidebar panel degraded to the not-found card`);

				await t.ev(`(async () => { for (const l of app.workspace.getLeavesOfType('dse-sidebar')) l.detach(); })()`);
				await t.reset(rel);
				noted.push(rel.split('/')[1]);
			}
			return `a counter in ${noted.join(' and ')}: pinned from the editor (anchor stamped inside the quote with its prefix) and written from the sidebar, prefix on every block line, text outside the block byte-identical`;
		},
	},
	{
		// SC-460: a lone CR above the block. Obsidian numbers lines with CR, CRLF and LF each as one break (measured),
		// the plugin used to index the note with split('\n'): every Reading view click below a lone CR was dropped (a
		// Notice since SC-455, never saved) and a pin from the cursor could pick the wrong block. Real clicks, real
		// bytes: the edit landed in the right block, the lone CRs and every other byte are unchanged, the block keeps
		// the note's ending.
		id: 'G-S12',
		async run(t) {
			const outside = (text) => text.replace(/```ds-counter[\s\S]*?[\r\n]```/g, '@@');
			const blocks = (text) => text.match(/```ds-counter[\s\S]*?[\r\n]```/g) ?? [];
			const loneCrs = (text) => (text.match(/\r(?!\n)/g) ?? []).length;
			const waitDisk = async (rel, pred, what) => {
				const t0 = Date.now();
				while (!pred(t.read(rel))) {
					if (Date.now() - t0 > 15000) throw new Error(`${rel}: timed out waiting for ${what}; disk is ${JSON.stringify(t.read(rel))}`);
					await sleep(100);
				}
			};
			/** `which` = index of the block that must hold current_value 11, every other block still 10. */
			const check = (rel, label, text, which) => {
				const fx = FIXTURES[rel];
				t.expect(outside(text) === outside(fx), `${rel} ${label}: text outside the blocks changed:\n got  ${JSON.stringify(outside(text))}\n want ${JSON.stringify(outside(fx))}`);
				const crOnly = !fx.includes('\n'); // a CR-only note: the block's own line count may change, so only the LF-free rule below applies
				if (!crOnly) t.expect(loneCrs(text) === loneCrs(fx), `${rel} ${label}: the lone CR count changed (${loneCrs(fx)} -> ${loneCrs(text)})`);
				else t.expect(!text.includes('\n'), `${rel} ${label}: a CR-only note picked up an LF: ${JSON.stringify(text)}`);
				const now = blocks(text);
				const was = blocks(fx);
				t.expect(now.length === was.length, `${rel} ${label}: block count changed`);
				now.forEach((b, i) => {
					if (i === which) {
						t.expect(/current_value: 11/.test(b), `${rel} ${label}: block #${i} did not get the edit: ${JSON.stringify(b)}`);
						const crlf = fx.includes('\r\n');
						const stray = crOnly ? b.match(/\n/) : crlf ? b.replace(/\r\n/g, '').match(/[\r\n]/) : b.match(/[\r]/);
						t.expect(!stray, `${rel} ${label}: the rewritten block mixes line endings: ${JSON.stringify(b)}`);
					} else {
						t.expect(b === was[i], `${rel} ${label}: block #${i} was touched: ${JSON.stringify(b)}`);
					}
				});
			};
			const readingClick = async (rel, idx) => {
				await t.open(rel);
				await t.reset(rel);
				const roots = `Array.from(${t.readingScope(LC_LEAF)}.querySelectorAll('[data-dse-element="counter"]')).filter((x) => x.isConnected)`;
				await t.waitFor(`${roots}.length >= ${idx + 1}`, `${rel}: counter #${idx} rendered in Reading view`);
				const m = await t.mark();
				await t.realClick(`(${roots})[${idx}].querySelector('button[aria-label^="Increase"]')`);
				await waitDisk(rel, (s) => s.includes('current_value: 11'), 'the Reading view write');
				t.expect((await t.noticesSince(m)).length === 0, `${rel}: a Notice appeared: ${JSON.stringify(await t.noticesSince(m))}`);
			};

			// 1. Reading view, a lone CR above and below: LF note, CRLF note, and the SECOND of two blocks.
			for (const [rel, idx] of [['Lifecycle/straycr-lf.md', 0], ['Lifecycle/straycr-crlf.md', 0], ['Lifecycle/straycr-cronly.md', 0], ['Lifecycle/straycr-twins.md', 1]]) {
				t.expect(t.read(rel) === FIXTURES[rel], `${rel}: the fixture is not on disk byte for byte`);
				await readingClick(rel, idx);
				check(rel, 'Reading view', t.read(rel), idx);
				await t.reset(rel);
			}

			// 2. Live Preview, same notes (LP hands the host an LF-normalised copy of the note).
			for (const rel of ['Lifecycle/straycr-lf.md', 'Lifecycle/straycr-crlf.md', 'Lifecycle/straycr-cronly.md']) {
				const { rootEl } = await enterMode(t, rel, LC_MODES[1], '[data-dse-element="counter"]');
				const m = await t.mark();
				await t.realClick(`(${rootEl}).querySelector('button[aria-label^="Increase"]')`);
				await waitDisk(rel, (s) => s.includes('current_value: 11'), 'the Live Preview write');
				check(rel, 'Live Preview', t.read(rel), 0);
				t.expect((await t.noticesSince(m)).length === 0, `${rel}: a Notice appeared in Live Preview`);
				await t.reset(rel);
			}

			// 3. Sidebar: pin the SECOND block from the editor cursor on its close fence, then click in the panel.
			const rel = 'Lifecycle/straycr-twins.md';
			await t.reset(rel);
			await t.ev(`(async () => { await (${LC_LEAF}).setViewState({ type: 'markdown', state: { file: ${JSON.stringify(rel)}, mode: 'source', source: false }, active: true }); })()`);
			await t.sleep(1500);
			const closeLine = await t.ev(`(() => { const ed = (${LC_LEAF}).view.editor; const r = []; for (let i = 0; i < ed.lineCount(); i++) if (ed.getLine(i) === '\`\`\`') r.push(i); return r[1]; })()`);
			await t.ev(`(${LC_LEAF}).view.editor.setCursor({ line: ${closeLine}, ch: 0 })`);
			const m = await t.mark();
			await t.ev(`(() => { window.__lcRandom = Math.random; Math.random = () => 0xabcdef / 0x1000000; return true; })()`); // SC-383, as G-S10
			try {
				t.expect(await t.ev(`app.commands.executeCommandById('draw-steel-elements:send-block-to-sidebar')`), 'the send-block-to-sidebar command did not run');
				await waitDisk(rel, (s) => s.includes('_dse_anchor:'), 'the anchor stamp');
			} finally {
				await t.ev(`(() => { if (window.__lcRandom) Math.random = window.__lcRandom; delete window.__lcRandom; return true; })()`);
			}
			const stamped = t.read(rel);
			const [first, second] = blocks(stamped);
			t.expect(!first.includes('_dse_anchor') && second.includes('_dse_anchor'), `the anchor went into the wrong block: ${JSON.stringify(stamped)}`);
			t.expect(outside(stamped) === outside(FIXTURES[rel]) && loneCrs(stamped) === loneCrs(FIXTURES[rel]), `the stamp changed text outside the blocks: ${JSON.stringify(stamped)}`);
			t.expect((await t.noticesSince(m)).length === 0, `pinning showed a Notice (a wrong-block "multiple blocks" one?): ${JSON.stringify(await t.noticesSince(m))}`);
			const panelCounter = `Array.from(app.workspace.getLeavesOfType('dse-sidebar')[0].view.containerEl.querySelectorAll('[data-dse-element="counter"]')).find((x) => x.isConnected)`;
			await t.waitFor(`!!(${panelCounter})`, 'the counter mounted in the sidebar panel');
			await t.ev(`(${panelCounter}).querySelector('button[aria-label^="Increase"]').click()`);
			await waitDisk(rel, (s) => s.includes('current_value: 11'), 'the sidebar write');
			const sidebarText = t.read(rel);
			t.expect(outside(sidebarText) === outside(FIXTURES[rel]) && loneCrs(sidebarText) === loneCrs(FIXTURES[rel]), `the sidebar write changed text outside the blocks: ${JSON.stringify(sidebarText)}`);
			const [b1, b2] = blocks(sidebarText);
			t.expect(b1 === blocks(FIXTURES[rel])[0] && /current_value: 11/.test(b2) && b2.includes('_dse_anchor'), `the sidebar write is wrong: ${JSON.stringify(sidebarText)}`);
			t.expect(await t.ev(`!document.querySelector('[data-dse-sidebar-unavailable]')`), 'the sidebar panel degraded to the not-found card');
			await t.ev(`(async () => { for (const l of app.workspace.getLeavesOfType('dse-sidebar')) l.detach(); })()`);
			await t.reset(rel);
			// 4. A CR-only note (its ONLY breaks are lone CRs) stays CR-only through a sidebar pin (the anchor stamp) and a panel write.
			{
				const rel = 'Lifecycle/straycr-cronly.md';
				await t.reset(rel);
				await t.ev(`(async () => { await (${LC_LEAF}).setViewState({ type: 'markdown', state: { file: ${JSON.stringify(rel)}, mode: 'source', source: false }, active: true }); })()`);
				await t.sleep(1500);
				await t.ev(`(${LC_LEAF}).view.editor.setCursor({ line: 6, ch: 0 })`); // inside the block (lines: '# stray', '', 'A', '', fence = 4, name = 5, current_value = 6)
				await t.ev(`(() => { window.__lcRandom = Math.random; Math.random = () => 0xabcdef / 0x1000000; return true; })()`); // SC-383, as G-S10
				try {
					t.expect(await t.ev(`app.commands.executeCommandById('draw-steel-elements:send-block-to-sidebar')`), 'the send-block-to-sidebar command did not run');
					await waitDisk(rel, (s) => s.includes('_dse_anchor:'), 'the anchor stamp');
				} finally {
					await t.ev(`(() => { if (window.__lcRandom) Math.random = window.__lcRandom; delete window.__lcRandom; return true; })()`);
				}
				const stamped = t.read(rel);
				t.expect(!stamped.includes('\n') && outside(stamped) === outside(FIXTURES[rel]), `the stamp left the CR-only note mixed or changed text outside the block: ${JSON.stringify(stamped)}`);
				const panel = `Array.from(app.workspace.getLeavesOfType('dse-sidebar')[0].view.containerEl.querySelectorAll('[data-dse-element="counter"]')).find((x) => x.isConnected)`;
				await t.waitFor(`!!(${panel})`, 'the CR-only counter mounted in the sidebar panel');
				await t.ev(`(${panel}).querySelector('button[aria-label^="Increase"]').click()`);
				await waitDisk(rel, (s) => s.includes('current_value: 11'), 'the CR-only sidebar write');
				const written = t.read(rel);
				t.expect(!written.includes('\n') && outside(written) === outside(FIXTURES[rel]) && /_dse_anchor: [A-Za-z0-9_-]+/.test(written), `the sidebar write changed a CR-only note's endings or outside text: ${JSON.stringify(written)}`);
				await t.ev(`(async () => { for (const l of app.workspace.getLeavesOfType('dse-sidebar')) l.detach(); })()`);
				await t.reset(rel);
			}
			return 'a lone CR above (and below) a block: Reading view clicks (LF note, CRLF note, 2nd of two blocks) and Live Preview clicks land in the right block, a sidebar pin from the 2nd block\'s close fence stamps it and its panel writes it, and a CR-only note stays CR-only (Reading view, Live Preview, sidebar); the lone CRs and every byte outside the blocks are unchanged';
		},
	},
	{
		// SC-326 r2/r3: the montage board scrolls sideways (SC-326 r1), and every write rebuilds the whole
		// element AND later has the host adopt its root into the re-drawn section — each throws a scroll
		// container's offset away — so a write from a far column must NOT snap the board back to round 1.
		// Reading view, real Obsidian, TWO 20-round blocks in one note: A scrolled MID-way (strictly between
		// 0 and its max), B at its far end. Each action is `.click()`ed and `scrollLeft` of BOTH boards is
		// sampled on every frame for 2.5 s (the 400 ms persist debounce, the write, the host re-draw and
		// adoption); both must hold their start offset on every frame — a write in one block must not move
		// the other either. Actions: three quick-trio taps and an End round in A (mid-scroll), then a
		// quick-trio tap and End round in B (far end).
		id: 'G-S13',
		async run(t) {
			const rel = 'Lifecycle/montage.md';
			await t.open(rel);
			await t.reset(rel);
			const ROOT = (i) => `(Array.from(${t.readingScope(LC_LEAF)}.querySelectorAll('[data-dse-element="montage"]')).filter((r) => r.isConnected)[${i}])`;
			const BOARD = (i) => `(${ROOT(i)})?.querySelector('.dse-mt__board')`;
			await t.waitFor(`!!(${BOARD(0)}) && !!(${BOARD(1)})`, 'both montage boards');
			for (const i of [0, 1]) {
				const geo = await t.ev(`(() => { const b = ${BOARD(i)}; return { ox: getComputedStyle(b).overflowX, sw: b.scrollWidth, cw: b.clientWidth }; })()`);
				t.expect(geo.sw > geo.cw + 100 && (geo.ox === 'auto' || geo.ox === 'scroll'), `block ${'AB'[i]}: the 20-round board does not scroll sideways: ${JSON.stringify(geo)}`);
			}
			// A strictly mid-way (round 10's column, 150px in from the frame's left edge), B at its far end.
			await t.ev(`(() => { const a = ${BOARD(0)}; const c = a.querySelector('.dse-mt__cell[data-round="10"]'); a.scrollLeft = c.offsetLeft - 150; const b = ${BOARD(1)}; b.scrollLeft = b.scrollWidth; })()`);
			await t.sleep(300);
			const starts = await t.ev(`(() => { const a = ${BOARD(0)}; const b = ${BOARD(1)}; return { a: Math.round(a.scrollLeft), aMax: a.scrollWidth - a.clientWidth, b: Math.round(b.scrollLeft), bMax: b.scrollWidth - b.clientWidth }; })()`);
			t.expect(starts.a > 100 && starts.a < starts.aMax - 100, `block A is not strictly mid-scroll: ${JSON.stringify(starts)}`);
			t.expect(starts.b > 100 && Math.abs(starts.b - starts.bMax) <= 1, `block B is not at its far end: ${JSON.stringify(starts)}`);
			const act = async (label, clickExpr) => {
				const r = await t.ev(`new Promise((resolve) => { const startA = ${BOARD(0)}.scrollLeft; const startB = ${BOARD(1)}.scrollLeft; const out = []; const t0 = performance.now(); const tick = () => { const a = ${BOARD(0)}; const b = ${BOARD(1)}; out.push([a ? Math.round(a.scrollLeft) : null, b ? Math.round(b.scrollLeft) : null]); if (performance.now() - t0 < 2500) requestAnimationFrame(tick); else resolve({ out, startA: Math.round(startA), startB: Math.round(startB) }); }; const el = ${clickExpr}; if (!el) { resolve({ error: 'no control to click' }); return; } el.click(); requestAnimationFrame(tick); })`);
				t.expect(!r.error, `${label}: ${r.error}`);
				for (const [k, name, start] of [[0, 'A', r.startA], [1, 'B', r.startB]]) {
					const bad = r.out.filter((f) => f[k] === null || Math.abs(f[k] - start) > 1);
					t.expect(bad.length === 0, `${label}: block ${name}'s scrollLeft moved after the write — start ${start}, ${bad.length}/${r.out.length} frames off (e.g. ${JSON.stringify(bad[0])})`);
				}
				return `${label}: A held ${r.startA}, B held ${r.startB} over ${r.out.length} frames`;
			};
			const waitDisk = async (re, what) => {
				const t0 = Date.now();
				while (!re.test(t.read(rel)) && Date.now() - t0 < 10000) await t.sleep(100);
				t.expect(re.test(t.read(rel)), `${what} did not land: ${t.read(rel)}`);
			};
			const notes = [];
			for (const hero of ['Kira', 'Bram', 'Osric']) {
				notes.push(await act(`A quick-trio tap (${hero}, round 10)`, `(${ROOT(0)}).querySelector('.dse-mt__cell[data-hero="${hero}"][data-round="10"] .dse-mt__quick[data-kind="success"]')`));
				await waitDisk(new RegExp(`hero: ${hero}\\n\\s*round: 10\\n\\s*result: success`), `${hero}'s round-10 write`);
			}
			notes.push(await act('A End round', `Array.from((${ROOT(0)}).querySelectorAll('button')).find((b) => /^End round/.test(b.textContent.trim()))`));
			notes.push(await act('B quick-trio tap (Yenna, round 20, far end)', `(${ROOT(1)}).querySelector('.dse-mt__cell[data-hero="Yenna"][data-round="20"] .dse-mt__quick[data-kind="success"]')`));
			await waitDisk(/hero: Yenna\n\s*round: 20\n\s*result: success/, "Yenna's round-20 write");
			notes.push(await act('B End round', `Array.from((${ROOT(1)}).querySelectorAll('button')).find((b) => /^End round/.test(b.textContent.trim()))`));
			t.expect(t.integrity(rel).ok, 'note integrity');
			await t.reset(rel);
			return notes.join('; ');
		},
	},
	{
		// SC-470: the SC-198 pin for every Reading view of the note, not only the writer's (SC-459 F1).
		// (a) the note in two panes, a DSE write from pane A: pane B is redrawn fresh (adoption is
		// writer-only, G-S4) and used to clamp 2779 -> 2001. (b) a write that is not ours, with the
		// note open: `vault.process` from outside the plugin, and a write to the file on disk picked
		// up by Obsidian's file watcher (the Sync / git path) — both used to clamp the same way.
		// Per phase, on the OBSERVED pane (B in (a), the only pane in (b)) and with G-S8's recorder:
		// the write landed; anti-vacuity — the tracker was redrawn and the sizer's inline min-height
		// fell below the scroll position; `data-dse-scroll-pin` was on that scroller at the collapse;
		// scrollTop never moved; and the sizer was back at or above the scroll position at the release.
		id: 'G-S15',
		async run(t) {
			const rel = 'Lifecycle/tall.md';
			const A = 'window.__gs15A';
			const B = 'window.__gs15B';
			const scrollerOf = (leaf) => `(${leaf}).view.containerEl.querySelector('.markdown-reading-view .markdown-preview-view')`;
			const park = async (leaves) => {
				for (let i = 0; i < 3; i++) {
					for (const leaf of leaves) await t.ev(`(() => { const s = ${scrollerOf(leaf)}; const r = ${t.root(TRACKER, leaf)}; s.scrollTop = r.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop + 1500; })()`);
					await t.sleep(450);
				}
			};
			// Starts G-S8's recorder on `leaf`'s scroller (resolves on window.__gs15rec), returns at once.
			const record = (leaf) => t.ev(`(() => { window.__gs15rec = new Promise((resolve) => { const s = ${scrollerOf(leaf)}; const st0 = s.scrollTop; const samples = []; let stMin = st0; let mhMin = Infinity; let pinAtCollapse = null; let pinFrames = 0; let pinSeen = false; let pinOnAt = 0; let released = false; let goneFrames = 0; let mhAtRelease = null; const sizerMh = () => { const z = s.querySelector('.markdown-preview-sizer'); return z ? parseFloat(z.style.minHeight) : NaN; }; const onScroll = () => { stMin = Math.min(stMin, s.scrollTop); }; s.addEventListener('scroll', onScroll); const mo = new MutationObserver(() => { const mh = sizerMh(); if (!Number.isNaN(mh) && mh < mhMin) { mhMin = mh; if (mh < st0 && pinAtCollapse === null) pinAtCollapse = s.hasAttribute('data-dse-scroll-pin'); } }); mo.observe(s, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true }); const t0 = performance.now(); const tick = () => { samples.push(s.scrollTop); if (s.hasAttribute('data-dse-scroll-pin')) { pinFrames++; if (!pinSeen) pinOnAt = performance.now() - t0; pinSeen = true; released = false; goneFrames = 0; } else if (pinSeen) { if (!released) { released = true; mhAtRelease = sizerMh(); } goneFrames++; } if (goneFrames < 10 && performance.now() - t0 < (pinSeen ? Math.min(pinOnAt + 4500, 12000) : 5000)) requestAnimationFrame(tick); else { mo.disconnect(); s.removeEventListener('scroll', onScroll); resolve({ st0, frames: samples.length, stMin: Math.min(stMin, ...samples), stMax: Math.max(...samples), mhMin, pinAtCollapse, pinFrames, released, mhAtRelease, ms: Math.round(performance.now() - t0) }); } }; requestAnimationFrame(tick); }); return true; })()`);
			const check = async (phase, leaf, m, landed) => {
				t.expect(landed, `${phase}: the write did not land`);
				t.expect(await t.ev(`!!(${t.root(TRACKER, leaf)})`), `${phase}: no tracker is rendered after the write`);
				t.expect(!(await t.sameRoot(TRACKER, 'gs15', leaf)), `${phase}: the observed tracker was not redrawn — the phase cannot reach the SC-198 clamp`);
				t.expect(m.mhMin < m.st0, `${phase}: the redraw never collapsed the sizer below the scroll position (inline min-height min ${m.mhMin}px, scrollTop ${m.st0}) — nothing to pin against; re-measure (SC-459, SC-470)`);
				t.expect(m.pinAtCollapse === true, `${phase}: data-dse-scroll-pin was not on the scroller when the sizer collapsed to ${m.mhMin}px (pin frames ${m.pinFrames}, scrollTop min ${m.stMin} of start ${m.st0})`);
				t.expect(m.stMin === m.st0 && m.stMax === m.st0, `${phase}: scrollTop moved: start ${m.st0} min ${m.stMin} max ${m.stMax} (sizer inline min-height fell to ${m.mhMin}px, pin present ${m.pinAtCollapse})`);
				t.expect(m.released, `${phase}: the pin was never seen released within ${m.ms}ms (pin frames ${m.pinFrames}) — the release cannot be checked`);
				t.expect(m.mhAtRelease >= m.st0, `${phase}: the sizer's inline min-height was ${m.mhAtRelease}px when the pin was released, below scrollTop ${m.st0} — the release would clamp`);
				return `${phase}: sizer fell to ${m.mhMin}px under the pin, ${m.mhAtRelease}px at release, scrollTop held at ${m.st0} over ${m.frames} frames`;
			};
			// Every phase runs even after one fails, so a FAIL names every phase that clamped.
			const out = [];
			const fails = [];
			const phase = async (fn) => {
				try {
					out.push(await fn());
				} catch (e) {
					fails.push(e instanceof Error ? e.message : String(e));
				}
			};
			// (a) two panes, the DSE write from pane A; observe pane B.
			await phase(async () => {
				await t.open(rel);
				await t.reset(rel);
				try {
					await t.ev(`(async () => { window.__gs15A = app.workspace.getMostRecentLeaf(); const b = app.workspace.getLeaf('split', 'vertical'); window.__gs15B = b; await b.setViewState({ type: 'markdown', state: { file: ${JSON.stringify(rel)}, mode: 'preview' }, active: false }); app.workspace.setActiveLeaf(window.__gs15A, { focus: true }); })()`);
					await t.sleep(1500);
					await park([A, B]);
					await t.tag(TRACKER, 'gs15', B);
					const a0 = await t.ev(`${scrollerOf(A)}.scrollTop`);
					await record(B);
					const clicked = await t.ev(`(() => { const s = ${scrollerOf(A)}; const sr = s.getBoundingClientRect(); const b = Array.from(${t.root(TRACKER, A)}.querySelectorAll('button.dse-init__portrait-toggle')).find((x) => { const r = x.getBoundingClientRect(); return r.top > sr.top + 100 && r.bottom < sr.bottom - 100; }); if (!b) return false; b.click(); return true; })()`);
					t.expect(clicked, '(a) second pane: no visible portrait toggle in pane A');
					const mB = await t.ev('window.__gs15rec');
					const a1 = await t.ev(`${scrollerOf(A)}.scrollTop`);
					t.expect(a1 === a0, `(a) second pane: the writer pane A moved: ${a0} -> ${a1}`);
					return await check('(a) second pane', B, mB, /has_taken_turn: true/.test(t.read(rel)));
				} finally {
					await t.ev(`(() => { if (window.__gs15B) window.__gs15B.detach(); window.__gs15B = null; return true; })()`);
				}
			});
			// (b) a write that is not ours, the note open in one pane: in-app, then on disk (file watcher).
			for (const [name, write] of [
				['(b) external vault.process', () => t.edit(rel, `c.replace('  value: 1', '  value: 2')`)],
				['(b) external write on disk', async () => fs.writeFileSync(path.join(vault, rel), FIXTURES[rel].replace('  value: 1', '  value: 2'))],
			]) {
				await phase(async () => {
					await t.open(rel);
					await t.reset(rel);
					await t.ev(`(() => { window.__gs15A = app.workspace.getMostRecentLeaf(); return true; })()`);
					await park([A]);
					await t.tag(TRACKER, 'gs15', A);
					await record(A);
					await write();
					const m = await t.ev('window.__gs15rec');
					return await check(name, A, m, t.read(rel).includes('  value: 2'));
				});
			}
			await t.reset(rel);
			t.expect(fails.length === 0, fails.join(' | '));
			return out.join('; ');
		},
	},
	{
		// SC-457: a fence with whitespace before the language (` ``` ds-counter `). Obsidian renders it as the block, but
		// the host read its language as '', so once the note changed around the block (Reading view: rendered, 8 blocks of
		// text inserted above, a click, navigate away 30 ms later - the section is gone when the write flushes) the write
		// was looked up by body under the language '' and never found: dropped, with a "not saved" Notice. It must land,
		// and everything but the block's body must be exactly the original plus the shift (the opening line with its leading
		// whitespace, line endings, text above and below, a lone CR included, a twin block untouched).
		id: 'G-S14',
		async run(t) {
			const cases = [
				['Lifecycle/spaced-one.md', 0, 'one space'],
				['Lifecycle/spaced-three.md', 0, 'three spaces'],
				['Lifecycle/spaced-tab.md', 0, 'a tab'],
				['Lifecycle/spaced-extra.md', 0, 'a space and extra info'],
				['Lifecycle/spaced-crlf.md', 0, 'one space, CRLF note'],
				['Lifecycle/spaced-straycr.md', 0, 'one space, lone CR above'],
				['Lifecycle/spaced-twins.md', 0, 'spaced twin of an unspaced block'],
				['Lifecycle/spaced-twins.md', 1, 'unspaced twin of a spaced block'],
			];
			// A note with each block's body masked: the opening fence line and the close fence stay, bodies are returned apart.
			const shape = (text) => {
				const bodies = [];
				const outside = text.replace(/(```[^\r\n]*)((?:\r\n|\n)[\s\S]*?)((?:\r\n|\n)```)/g, (all, open, body, close) => (bodies.push(body), `${open}@@${close}`));
				return { outside, bodies };
			};
			for (const [rel, idx, label] of cases) {
				const fx = FIXTURES[rel];
				const eol = fx.includes('\r\n') ? '\r\n' : '\n';
				const shift = 'TOP' + Array.from({ length: 8 }, (_, i) => `${eol}${eol}shift ${i}`).join('');
				const shifted = fx.replace('TOP', shift); // the original plus the lines inserted above the block
				const was = shape(shifted);
				t.expect(t.read(rel) === fx, `${rel}: the fixture is not on disk byte for byte`);
				await t.open(rel);
				await t.reset(rel);
				await t.waitFor(`${t.readingScope(LC_LEAF)}.querySelectorAll('[data-dse-element="counter"]').length === ${rel.endsWith('twins.md') ? 2 : 1}`, `${rel}: the counter(s) rendered in Reading view`);
				await t.edit(rel, `c.replace('TOP', ${JSON.stringify(shift)})`);
				await t.sleep(1200);
				const m = await t.mark();
				await t.clickIncrease(idx);
				await t.sleep(30);
				await t.open('Lifecycle/other.md');
				await t.sleep(1500);
				const got = t.read(rel);
				const now = shape(got);
				// Everything but the block bodies - the opening fence lines (the leading whitespace included), the close fences,
				// the shift, the text above and below, a lone CR - is exactly the original; the element rewrites its own body.
				t.expect(now.outside === was.outside, `${rel} (${label}): text outside the block bodies changed:\n got  ${JSON.stringify(now.outside)}\n want ${JSON.stringify(was.outside)}`);
				t.expect(now.bodies.length === was.bodies.length, `${rel} (${label}): block count changed: ${JSON.stringify(got)}`);
				now.bodies.forEach((b, i) => {
					if (i === idx) {
						const before = Number(/current_value: (\d+)/.exec(was.bodies[i])[1]);
						t.expect(b.includes(`current_value: ${before + 1}`), `${rel} (${label}): block #${i} did not get the edit: ${JSON.stringify(b)}`);
						t.expect(!(eol === '\r\n' ? b.replace(/\r\n/g, '') : b).match(eol === '\r\n' ? /[\r\n]/ : /\r/), `${rel} (${label}): the rewritten block mixes line endings: ${JSON.stringify(b)}`);
					} else {
						t.expect(b === was.bodies[i], `${rel} (${label}): block #${i} was touched: ${JSON.stringify(b)}`);
					}
				});
				t.expect((await t.noticesSince(m)).length === 0, `${rel} (${label}): a Notice appeared: ${JSON.stringify(await t.noticesSince(m))}`);
				t.expect((await t.errorsSince(m)).length === 0, `${rel} (${label}): page errors ${JSON.stringify(await t.errorsSince(m))}`);
				t.expect(t.read('Lifecycle/other.md') === FIXTURES['Lifecycle/other.md'], 'other.md was written');
				await t.reset(rel);
			}
			return `a fence with whitespace before the language (${cases.map((c) => c[2]).join('; ')}): after the note changed around the block, a click then navigate-away still writes it, no Notice; the opening line, line endings and every byte outside the block bodies are unchanged`;
		},
	},
	{
		// SC-478: a Live Preview pane keeps its reading position when the DSE block it is reading is redrawn by a
		// write. Live Preview scrolls a CodeMirror `.cm-scroller`, not the Reading view's sizer (G-S8/G-S15): the
		// redrawn block's new Obsidian widget has a constant 50px height estimate, so CodeMirror's height map and
		// viewport land far below the block and the browser may clamp scrollTop — on stock 1.14.4 the pane parked
		// inside a tall tracker showed lines ~100 further down (3020 -> 2556 on this note). Phases: (a) the note in
		// Reading pane A and Live Preview pane B, a DSE write from A, B observed; (b1) an in-app `vault.process` from
		// outside the plugin and (b2) a write on disk picked up by the file watcher, one Live Preview pane; (c) the
		// Live Preview pane's OWN DSE write; (d) a second pane whose `setViewData` is held back (the late `set`
		// transaction of a pane behind a busy main thread, SC-472; held back until the wheel landed) and a REAL wheel on it in that gap: the restore must
		// land where the user scrolled to; (e) one outside write that inserts a paragraph right at the fence AND changes
		// the tracker. Per phase, on the observed pane: the write landed; anti-vacuity — the tracker was redrawn (a
		// fresh root); scrollTop never moved in any frame and the top visible line + offset is unchanged (phase (e):
		// two lines further down, the offset within the inserted paragraph's height — CodeMirror maps its own snapshot
		// anchor before the insertion; phase (d): measured after the wheel); the redrawn tracker is drawn again at its
		// old height; `data-dse-lp-hold` (the hold that keeps the redrawn block at its old height until our view
		// mounts) was seen on it and released; the observed pane's selection did not move. Every phase runs even
		// after one fails.
		id: 'G-S18',
		async run(t) {
			const rel = 'Lifecycle/tall.md';
			const LP = { mode: 'source', source: false };
			const src = (leaf) => `(${leaf}).view.containerEl.querySelector('.markdown-source-view')`;
			const scrollerOf = (leaf) => `${src(leaf)}.querySelector('.cm-scroller')`;
			const lpRoot = (leaf) => `Array.from(${src(leaf)}.querySelectorAll('${TRACKER}')).find((x) => x.isConnected)`;
			const rdScroller = (leaf) => `(${leaf}).view.containerEl.querySelector('.markdown-reading-view .markdown-preview-view')`;
			// The top visible line and the offset into it, from CodeMirror's height map (read only at rest).
			const topLine = (leaf) => `(() => { const cm = (${leaf}).view.editor.cm; const y = cm.scrollDOM.getBoundingClientRect().top - cm.documentTop; const b = cm.lineBlockAtHeight(Math.max(0, y)); return { line: cm.state.doc.lineAt(b.from).number, off: Math.round(y - b.top) }; })()`;
			const widgetH = (leaf) => `(() => { const r = ${lpRoot(leaf)}; const w = r && r.closest('.cm-embed-block'); return w ? Math.round(w.getBoundingClientRect().height) : null; })()`;
			const park = async (leaf) => {
				// CodeMirror draws only the viewport (+ a margin): step down until the tracker is drawn, then park in it.
				for (let i = 0; i < 12 && !(await t.ev(`!!(${lpRoot(leaf)})`)); i++) {
					await t.ev(`(() => { ${scrollerOf(leaf)}.scrollTop += 600; return true; })()`);
					await t.sleep(250);
				}
				for (let i = 0; i < 4; i++) {
					await t.ev(`(() => { const s = ${scrollerOf(leaf)}; const r = ${lpRoot(leaf)}; s.scrollTop = r.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop + 1500; })()`);
					await t.sleep(450);
				}
				await t.ev(`(() => { window.__gs18tag = ${lpRoot(leaf)}; return true; })()`);
				return t.ev(`({ tl: ${topLine(leaf)}, wh: ${widgetH(leaf)}, sel: (${leaf}).view.editor.cm.state.selection.main.head })`);
			};
			// Per-frame scrollTop of the observed scroller + a MutationObserver for the hold attribute (any change record counts: a hold set and
			// released inside one task is gone by the time a callback could look for it); resolves on
			// window.__gs18rec once the hold was released + 10 frames (cap: first sighting + 4500 ms, 12 s; 5 s with no hold).
			const record = (leaf) => t.ev(`(() => { window.__gs18rec = new Promise((resolve) => { const s = ${scrollerOf(leaf)}; const st0 = s.scrollTop; const samples = []; let stMin = st0; let held = 0; let holdSeen = false; let holdPx = null; let holdOnAt = 0; let released = false; let goneFrames = 0; const onScroll = () => { stMin = Math.min(stMin, s.scrollTop); }; s.addEventListener('scroll', onScroll); const count = () => s.querySelectorAll('[data-dse-lp-hold]').length; const mo = new MutationObserver((recs) => { for (const r of recs) { if (r.type !== 'attributes') continue; if (!holdSeen) { holdSeen = true; holdOnAt = performance.now() - t0; } if (r.oldValue !== null) holdPx = Number(r.oldValue); else if (holdPx === null) holdPx = Number(r.target.getAttribute('data-dse-lp-hold')); } }); mo.observe(s, { attributes: true, attributeOldValue: true, attributeFilter: ['data-dse-lp-hold'], subtree: true }); const t0 = performance.now(); const tick = () => { samples.push(s.scrollTop); const n = count(); if (n) { held++; released = false; goneFrames = 0; } else if (holdSeen) { released = true; goneFrames++; } if (goneFrames < 10 && performance.now() - t0 < (holdSeen ? Math.min(holdOnAt + 4500, 12000) : 5000)) requestAnimationFrame(tick); else { mo.disconnect(); s.removeEventListener('scroll', onScroll); resolve({ st0, frames: samples.length, stMin: Math.min(stMin, ...samples), stMax: Math.max(...samples), holdSeen, holdPx, heldFrames: held, released, ms: Math.round(performance.now() - t0) }); } }; requestAnimationFrame(tick); }); return true; })()`);
			// `shift`: the top line may sit `lines` further down and up to `drift` px higher into its block (phase (e) only).
			const check = async (phase, leaf, before, m, landed, shift = { lines: 0, drift: 0 }) => {
				t.expect(landed, `${phase}: the write did not land`);
				await t.sleep(600); // let the redrawn view settle before reading the top line
				// anti-vacuity: the tracker the pane was reading was replaced (its root left the document)
				t.expect(await t.ev(`!!window.__gs18tag && !window.__gs18tag.isConnected`), `${phase}: the observed tracker was not redrawn — the phase cannot reach the Live Preview jump`);
				const after = await t.ev(`({ tl: ${topLine(leaf)}, wh: ${widgetH(leaf)}, sel: (${leaf}).view.editor.cm.state.selection.main.head })`);
				const pos = `scrollTop start ${m.st0} min ${m.stMin} max ${m.stMax}; top line ${before.tl.line}+${before.tl.off} -> ${after.tl.line}+${after.tl.off}; tracker drawn ${after.wh}px (was ${before.wh}px); hold seen ${m.holdSeen}`;
				t.expect(m.stMin === m.st0 && m.stMax === m.st0 && after.tl.line === before.tl.line + shift.lines && after.tl.off <= before.tl.off && after.tl.off >= before.tl.off - shift.drift, `${phase}: the pane lost its place: ${pos}`);
				t.expect(after.wh !== null && Math.abs(after.wh - before.wh) <= 2, `${phase}: the redrawn tracker is ${after.wh === null ? 'not drawn' : after.wh + 'px'}, was ${before.wh}px`);
				t.expect(m.holdSeen, `${phase}: data-dse-lp-hold was never set on the redrawn tracker (${pos})`);
				t.expect(m.released, `${phase}: the hold was never seen released within ${m.ms}ms (held frames ${m.heldFrames})`);
				t.expect(after.sel === before.sel, `${phase}: the selection moved ${before.sel} -> ${after.sel}`);
				return `${phase}: scrollTop held at ${m.st0} over ${m.frames} frames, top line ${after.tl.line}+${after.tl.off}, tracker ${after.wh}px, held ${m.holdPx}px for ${m.heldFrames} frames`;
			};
			const out = [];
			const fails = [];
			const phase = async (fn) => {
				try {
					out.push(await fn());
				} catch (e) {
					fails.push(e instanceof Error ? e.message : String(e));
				}
			};
			const openLP = async () => {
				await t.open(rel);
				await t.reset(rel);
				await t.ev(`(async () => { window.__gs18A = app.workspace.getMostRecentLeaf(); await window.__gs18A.setViewState({ type: 'markdown', state: Object.assign({ file: ${JSON.stringify(rel)} }, ${JSON.stringify(LP)}), active: true }); window.__gs18A.view.editor.setCursor({ line: 0, ch: 0 }); return true; })()`);
				await t.sleep(1500);
			};
			const A = 'window.__gs18A';
			const B = 'window.__gs18B';
			// (a) Reading pane A writes; Live Preview pane B observed.
			await phase(async () => {
				await t.open(rel);
				await t.reset(rel);
				try {
					await t.ev(`(async () => { window.__gs18A = app.workspace.getMostRecentLeaf(); const b = app.workspace.getLeaf('split', 'vertical'); window.__gs18B = b; await b.setViewState({ type: 'markdown', state: Object.assign({ file: ${JSON.stringify(rel)} }, ${JSON.stringify(LP)}), active: false }); b.view.editor.setCursor({ line: 0, ch: 0 }); app.workspace.setActiveLeaf(window.__gs18A, { focus: true }); return true; })()`);
					await t.sleep(1500);
					await t.ev(`(() => { const s = ${rdScroller(A)}; const r = Array.from(s.querySelectorAll('${TRACKER}')).find((x) => x.isConnected); s.scrollTop = r.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop + 1500; return true; })()`);
					const before = await park(B);
					await record(B);
					const clicked = await t.ev(`(() => { const s = ${rdScroller(A)}; const sr = s.getBoundingClientRect(); const b = Array.from(s.querySelectorAll('button.dse-init__portrait-toggle')).find((x) => { const r = x.getBoundingClientRect(); return r.top > sr.top + 100 && r.bottom < sr.bottom - 100; }); if (!b) return false; b.click(); return true; })()`);
					t.expect(clicked, '(a) Reading pane A: no visible portrait toggle');
					const m = await t.ev('window.__gs18rec');
					return await check('(a) another pane', B, before, m, /has_taken_turn: true/.test(t.read(rel)));
				} finally {
					await t.ev(`(() => { if (window.__gs18B) window.__gs18B.detach(); window.__gs18B = null; return true; })()`);
				}
			});
			// (b) a write that is not ours, the note open in one Live Preview pane: in-app, then on disk (file watcher).
			for (const [name, write] of [
				['(b1) external vault.process', () => t.edit(rel, `c.replace('  value: 1', '  value: 2')`)],
				['(b2) external write on disk', async () => fs.writeFileSync(path.join(vault, rel), FIXTURES[rel].replace('  value: 1', '  value: 2'))],
			]) {
				await phase(async () => {
					await openLP();
					const before = await park(A);
					await record(A);
					await write();
					const m = await t.ev('window.__gs18rec');
					return await check(name, A, before, m, t.read(rel).includes('  value: 2'));
				});
			}
			// (c) the Live Preview pane's own DSE write.
			await phase(async () => {
				await openLP();
				const before = await park(A);
				await record(A);
				const clicked = await t.ev(`(() => { const s = ${scrollerOf(A)}; const sr = s.getBoundingClientRect(); const b = Array.from(s.querySelectorAll('button.dse-init__portrait-toggle')).find((x) => { const r = x.getBoundingClientRect(); return r.top > sr.top + 100 && r.bottom < sr.bottom - 100; }); if (!b) return false; b.click(); return true; })()`);
				t.expect(clicked, '(c) Live Preview pane: no visible portrait toggle');
				const m = await t.ev('window.__gs18rec');
				return await check('(c) own write', A, before, m, /has_taken_turn: true/.test(t.read(rel)));
			});
			// (d) a late `set` transaction: pane B's setViewData is held back (forced, not timing luck), and a real wheel
			// on B lands in that gap, after `modify` captured B and before B's transaction. B must end where the wheel left it.
			await phase(async () => {
				await t.open(rel);
				await t.reset(rel);
				try {
					await t.ev(`(async () => { window.__gs18A = app.workspace.getMostRecentLeaf(); const b = app.workspace.getLeaf('split', 'vertical'); window.__gs18B = b; await b.setViewState({ type: 'markdown', state: Object.assign({ file: ${JSON.stringify(rel)} }, ${JSON.stringify(LP)}), active: false }); b.view.editor.setCursor({ line: 0, ch: 0 }); app.workspace.setActiveLeaf(window.__gs18A, { focus: true }); return true; })()`);
					await t.sleep(1500);
					await t.ev(`(() => { const s = ${rdScroller(A)}; const r = Array.from(s.querySelectorAll('${TRACKER}')).find((x) => x.isConnected); s.scrollTop = r.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop + 1500; return true; })()`);
					await park(B);
					const parkedSt = await t.ev(`${scrollerOf(B)}.scrollTop`);
					await t.ev(`(() => { window.__gs18go = null; const v = (${B}).view; const o = v.setViewData; v.setViewData = function (d, c) { v.setViewData = o; window.__gs18go = () => o.call(v, d, c); }; return true; })()`);
					const clicked = await t.ev(`(() => { const s = ${rdScroller(A)}; const sr = s.getBoundingClientRect(); const b = Array.from(s.querySelectorAll('button.dse-init__portrait-toggle')).find((x) => { const r = x.getBoundingClientRect(); return r.top > sr.top + 100 && r.bottom < sr.bottom - 100; }); if (!b) return false; b.click(); return true; })()`);
					t.expect(clicked, '(d) Reading pane A: no visible portrait toggle');
					// B's transaction is held back until released below, so the gap is as long as the wheel needs (the main thread is busy
					// with A's remount, so a timed gap would race the wheel). `modify` precedes `setViewData`: the capture is taken by now.
					await t.waitFor('typeof window.__gs18go === "function"', '(d) pane B reached setViewData');
					// the user wheels pane B up by 400px inside the gap
					const at = await t.ev(`(() => { const r = ${scrollerOf(B)}.getBoundingClientRect(); return { x: Math.round(r.left + r.width * 0.8), y: Math.round(r.top + r.height / 2) }; })()`);
					await t.cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
					await t.cdp.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: -400 });
					await t.waitFor(`${scrollerOf(B)}.scrollTop < ${parkedSt - 100}`, '(d) the wheel reached pane B');
					await t.sleep(250);
					const before = await t.ev(`({ tl: ${topLine(B)}, wh: ${widgetH(B)}, sel: (${B}).view.editor.cm.state.selection.main.head, st: ${scrollerOf(B)}.scrollTop })`);
					t.expect(before.st < parkedSt - 100, `(d) the wheel did not move pane B: scrollTop ${parkedSt} -> ${before.st} (the phase cannot reach the late-transaction path)`);
					await record(B);
					await t.ev('(() => { window.__gs18go(); return true; })()'); // B's late `set` transaction
					const m = await t.ev('window.__gs18rec');
					return await check('(d) wheel before a late set', B, before, m, /has_taken_turn: true/.test(t.read(rel)));
				} finally {
					await t.ev(`(() => { if (window.__gs18go) window.__gs18go(); window.__gs18go = null; if (window.__gs18B) window.__gs18B.detach(); window.__gs18B = null; return true; })()`);
				}
			});
			// (e) one outside write that inserts a paragraph right at the fence's first line AND changes the tracker: the
			// diff is one replacement that starts at the old fence start, so the redrawn widget starts after the insertion.
			await phase(async () => {
				await openLP();
				const before = await park(A);
				await record(A);
				await t.edit(rel, `c.replace('\`\`\`ds-initiative\\n', 'INSERTED LINE.\\n\\n\`\`\`ds-initiative\\n').replace('  value: 1', '  value: 2')`);
				const m = await t.ev('window.__gs18rec');
				return await check('(e) insert above the fence + change', A, before, m, t.read(rel).includes('INSERTED LINE.') && t.read(rel).includes('  value: 2'), { lines: 2, drift: 60 });
			});
			await t.reset(rel);
			await t.open(rel); // back to Reading for the next scenario
			t.expect(fails.length === 0, fails.join(' | '));
			return out.join('; ');
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
		// SC-406: the 7.0.0 release gate defaults OFF (no sidebar, no pin/unpin items). The
		// sidebar scenarios below need them, so the scratch vault's data.json turns it ON.
		fs.writeFileSync(path.join(pdir, 'data.json'), JSON.stringify({ experimental: true }));
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
