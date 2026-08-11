#!/usr/bin/env node
// visual-harness/obsidian-camera.mjs — F5 (Plan 12): the real-Obsidian camera.
// Launches a SECOND, fully isolated Obsidian instance (scratch --user-data-dir + CDP port),
// attaches over raw CDP, opens each demo-vault/Harness/<element>.md in reading mode, and
// clip-screenshots the rendered [data-dse-element] once per combo of
//   plugin theme (steel — frameworkV2.services.theme.setActive, the DSE skin; SC-144
//                  retired the second value, so this axis is single-valued now)
// × chrome bg  (dark|light  — app.changeTheme, Obsidian's own moonstone/obsidian theme)
// to visual-harness/shots/<element>--obsidian-<theme>-<bg>.png (elements.length × 1 × 2
// shots — see aliases.json for the current element count) — plus the ground-truth SPECIAL
// captures, each of which drives a surface the theme×bg sweep structurally cannot reach:
//   step 3b  (D6 Task 11)      a by-SCC `ds-scc` card (a kit) rendering its REAL nested
//                              `ds-feature` card through Obsidian's own markdown pipeline
//   step 3c  (D8 Task 3)       the initiative tracker in a real SIDEBAR leaf, via the
//                              plugin's "Send initiative tracker to sidebar" command
//   step 3d  (D7 T10 / D-7)    four elements in a real SIDEBAR leaf via the GENERIC "Send
//                              block to sidebar" command (narrow-width coverage)
//   step 3e  (SC-121 D-5)      the four MODALS — stamina edit, its Spend Recovery state,
//                              the condition picker, the generic form editor
//   step 3f  (SC-121 D-8)      the plugin SETTINGS tab, over a second CDP connection to
//                              Obsidian 1.13's Settings POPOUT window
//   step 3g  (SC-121 D-6)      the CANVAS read-only quarantine (canvas text nodes render
//                              with sourcePath '' -> canPersist false -> data-dse-readonly)
// The sweep's own two axes are INDEPENDENT: the plugin theme re-stamps data-dse-theme on
// element roots; the chrome theme flips body.theme-dark/light. Both are awaited before each
// shot. The specials are steel/dark only — they are existence/behaviour proofs, not visual
// combo sweeps.
//
// WHY RAW CDP (not Playwright): playwright's chromium.connectOverCDP() fails against
// Obsidian's Electron with "Browser.setDownloadBehavior: Browser context management is
// not supported" (Electron doesn't implement the browser-target commands Playwright
// needs). Raw CDP over Node's built-in WebSocket (Node >= 22) works: GET /json/list,
// attach to the app://obsidian.md page target, Runtime.evaluate + Page.captureScreenshot.
//
// Entry point: `npm run obsidian-shots` (regenerates Harness notes + builds the plugin
// first). Running this file directly assumes both are already up to date.
//
// Usage: node visual-harness/obsidian-camera.mjs [--element=<id>] [--theme=<steel>] [--bg=<dark|light>]
//        Bad flag values exit 2 naming them. Per-combo failures write an --ERROR-suffixed
//        window shot, the sweep CONTINUES, and the run exits 1 listing every failure.
// Env:   DSE_CAMERA_TMP     scratch root (default /tmp/claude-1000/dse-obsidian-camera)
//        DSE_CAMERA_PORT    CDP port (default 9223)
//        DSE_CAMERA_DISPLAY X display (default :1)
//        DSE_CAMERA_BIN     obsidian binary (default /usr/bin/obsidian)
//
// SAFETY: never touches ~/.config/obsidian; refuses to start if the CDP port is already
// serving (i.e. some other instance owns it); kills ONLY the child it spawned.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const shotsDir = path.join(dir, 'shots');
const vaultPath = path.join(repo, 'demo-vault');

const PORT = Number(process.env.DSE_CAMERA_PORT ?? 9223);
const DISPLAY = process.env.DSE_CAMERA_DISPLAY ?? ':1';
const BIN = process.env.DSE_CAMERA_BIN ?? '/usr/bin/obsidian';
const tmpRoot = process.env.DSE_CAMERA_TMP ?? '/tmp/claude-1000/dse-obsidian-camera';
const udd = path.join(tmpRoot, 'obsidian-harness-udd');
const VAULT_ID = 'dseharness0001';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -- matrix + flags (F4 shoot.mjs conventions) -------------------------------------------
const args = Object.fromEntries(
	process.argv
		.slice(2)
		.filter((a) => a.startsWith('--'))
		.map((a) => {
			const [k, v] = a.replace(/^--/, '').split('=');
			return [k, v ?? '1'];
		}),
);

const THEMES = ['steel']; // DSE plugin theme (data-dse-theme on element roots) — SC-144: one value
const BGS = ['dark', 'light']; // Obsidian chrome theme (body.theme-dark / theme-light)
const aliases = JSON.parse(fs.readFileSync(path.join(dir, 'aliases.json'), 'utf8'));

// D6 Task 11 — the by-SCC recursion ground-truth capture (see the header comment and
// "step 3b" below). Not an element id (not in aliases.json) — selected via
// --element=by-scc-kit, same as any other --element value, but runs its OWN single
// capture instead of joining the theme×bg combo matrix (it exists to prove recursion
// happened at all, not to sweep every visual combo).
// SC-149: the note's fence is `ds-scc` now (ds-kit is no longer a registered language),
// but the selector stays `kit` — `ds-scc` re-stamps `data-dse-element` to the family it
// resolved so the family's own CSS applies (RefUnwrapView.mountBase, fix round H-1), and a
// kit code resolves to the kit view. The nested-`ds-feature` proof below is unchanged —
// that is the whole point of the capture.
const SPECIAL_NOTE = { id: 'by-scc-kit', elementSel: 'kit' };

// D8 Task 3 — the sidebar-leaf ground-truth capture (see "step 3c" below and the header
// comment). Same convention as SPECIAL_NOTE above: not an element id, selected via
// --element=sidebar-initiative, runs its OWN single capture (steel/dark only — this
// proves the sidebar leaf itself is capturable, not a full theme×bg sweep).
const SIDEBAR_SPECIAL_ID = 'sidebar-initiative';

// D7 Task 10 (plan-18, spec §5) — the sidebar captures driven through the GENERIC "Send
// block to sidebar" command (registration.ts's `send-block-to-sidebar`, an
// editorCheckCallback keyed off the cursor's position inside a `ds-*` fence) rather than a
// dedicated per-element command — most elements have none, deliberately: spec §5's
// "sidebar opt-in is universal ... no new production plumbing," so these captures prove the
// SAME affordance every ds-* block gets.
//
// SC-121 Batch 4 (catalog D-7) generalized this from the single hero capture to a LIST.
// D-7's finding was that sidebar coverage was 2 of ~32 elements — and where it did exist it
// immediately surfaced a real narrow-width defect (the hero Characteristics row collapsing
// into concatenated text). The four here are chosen for what narrow width can break:
//   hero        — the D-7 defect itself, re-verified post-SC-122 (the catalog's open question)
//   statblock   — the densest multi-column grammar in the plugin
//   scc         — a markdown pipe-table (batch-3 review L-5's exact scenario)
//   negotiation — a control-heavy tracker (checkboxes, ladder, steppers) at 300px
// `hero` keeps its original output name (`hero--obsidian-sidebar-steel-dark.png`) so the
// existing baseline shot is not orphaned.
//
// SC-149 fix round (M-1): the pipe-table slot was `perk`, whose Harness note stopped being
// generated when the ten typed display aliases left the public registry — step 3d would
// have hard-failed on a note that no longer exists (and searched for a fence named after
// `aliases['perk']`, now undefined). `scc` inherits the slot and the coverage: its note is
// a by-SCC reference to `kit/panther`, whose real compendium body contains the signature
// ability's markdown pipe table, so the sidebar still gets a table at 300px — through the
// hybrid render path, which is if anything the more interesting case.
//
// `element` is the id the MOUNTED root carries, which is not always the note's element:
// `ds-scc` re-stamps `data-dse-element` to the family it resolved (RefUnwrapView.mountBase,
// H-1), so the scc note's panel is a `kit` root. Defaults to `id`.
const GENERIC_SIDEBAR_IDS = [
	{ id: 'hero' },
	{ id: 'statblock' },
	{ id: 'scc', element: 'kit' },
	{ id: 'negotiation' },
];

// SC-121 Batch 4 (catalog D-5) — the modal captures. NOTHING in either camera had ever
// rendered a modal (the F4 spec's v1 limits explicitly excluded "modals/hover/focus
// scripting"), so the four most-used interactive surfaces in the plugin shipped unaudited —
// including through Batch 1's control-density change, which resizes every kit button inside
// them (batch-1 review I-1). Each entry opens the modal the way a USER does: open the
// note, click the real affordance, wait for the real modal DOM.
//   note      Harness note to open (reading mode unless `mode` says otherwise)
//   trigger   CSS selector to click inside the mounted element (the production affordance)
//   ready     selector that must appear inside the modal before the shot
//   then      optional second click INSIDE the modal (state variants — e.g. Spend Recovery)
//   pref      optional [key, value] pref to set before opening (and restore after)
const MODAL_SHOTS = [
	{
		id: 'modal-stamina',
		note: 'modal-stamina',
		trigger: '[data-dse-element="stamina-bar"] .dse-stamina--clickable',
		ready: '.dse-modal .dse-modal__body',
	},
	{
		id: 'modal-stamina-recovery',
		note: 'modal-stamina',
		trigger: '[data-dse-element="stamina-bar"] .dse-stamina--clickable',
		ready: '.dse-modal .dse-modal__body',
		// The Spend Recovery quick action (StaminaEditModal, SPEND_RECOVERY_LABEL): a
		// PENDING edit, so the shot shows the preview bar's heal delta + the changed
		// Apply state — the state D-5 named separately from the modal's resting state.
		then: '.dse-modal button[aria-label="Spend Recovery"]',
	},
	{
		id: 'modal-conditions',
		note: 'conditions',
		trigger: '[data-dse-element="conditions"] button[aria-label="Add condition"]',
		ready: '.dse-modal .dse-cond-list',
		// Select one row so the shot carries the aria-pressed/selected styling, not just
		// the resting grid (the icon grid is batch-1 review I-1's density worry).
		then: '.dse-cond-list .dse-cond-item button',
	},
	{
		id: 'modal-form',
		note: 'feature',
		// D9's reading-mode edit affordance is default-OFF; the pencil only mounts when
		// `authoringControls` is on, so the capture turns the REAL pref on (and back off
		// afterwards) rather than calling openFormEditor directly — same principle as
		// driving the sidebar through its command instead of openSidebarView.
		pref: ['authoringControls', true],
		trigger: '[data-dse-element="feature"] button[aria-label^="Edit "]',
		ready: '.dse-modal .dse-modal__body',
	},
];

// SC-121 Batch 4 (catalog D-8) — the settings-tab capture. Obsidian 1.13 opens Settings as
// a POPOUT WINDOW (its own CDP page target, url about:blank, title "Settings - <vault> -
// …"), so this one is driven from the main target but screenshotted over a SECOND CDP
// connection (pattern established by SC-112 Task 8; see "step 3f").
const SETTINGS_SPECIAL_ID = 'settings';

// SC-121 Batch 4 (catalog D-6) — the canvas read-only capture. Canvas text nodes render
// with `ctx.sourcePath === ''`, which ReadingModeBlockHost quarantines to canPersist:false,
// which the pipeline stamps as `data-dse-readonly` (the CSS-only "Read-only" badge). That
// whole path is real-Obsidian-only — the browser harness's `--readonly` variants MIMIC it
// via a fabricated host, but nothing had ever rendered an actual canvas.
const CANVAS_SPECIAL_ID = 'canvas';

// SC-102 fix round (task-3 review M-1) — EXTRA fixture notes: a generated Harness note that
// is NOT an element's own example.yaml, but whose mounted element is an ordinary registered
// element, so it can ride the normal theme×bg sweep below instead of needing its own special
// capture. `id` names the note AND the output file; `element` is the data-dse-element value
// to select and wait on. (The by-SCC / sidebar / modal / canvas specials below stay special:
// each proves a MECHANISM, not a fixture.)
const EXTRA_NOTES = [
	// The shape steel-etl actually emits for villain actions — `cost: Villain Action N` +
	// the lone-dash `usage: '-'`, no ability_type (see notes-gen.mjs and
	// test/fixtures/statblock/villain-corpus.yaml). Its output names are new, so it cannot
	// collide with any frozen shot.
	{ id: 'statblock-villain-corpus', element: 'statblock' },
];

let elements = Object.keys(aliases).sort();
let extraNotes = EXTRA_NOTES;
let genericSidebarIds = GENERIC_SIDEBAR_IDS;
let modalShots = MODAL_SHOTS;
let onlySpecial = false;
let onlySidebarSpecial = false;
let onlyGenericSidebar = false;
let onlyModal = false;
let onlySettings = false;
let onlyCanvas = false;
if (args.element) {
	const sidebarMatch = GENERIC_SIDEBAR_IDS.find((e) => args.element === `sidebar-${e.id}`);
	const modalMatch = MODAL_SHOTS.find((m) => m.id === args.element);
	const extraMatch = EXTRA_NOTES.find((n) => n.id === args.element);
	extraNotes = [];
	if (extraMatch) {
		elements = [];
		extraNotes = [extraMatch];
	} else if (args.element === SPECIAL_NOTE.id) {
		elements = [];
		onlySpecial = true;
	} else if (args.element === SIDEBAR_SPECIAL_ID) {
		elements = [];
		onlySidebarSpecial = true;
	} else if (sidebarMatch) {
		elements = [];
		genericSidebarIds = [sidebarMatch];
		onlyGenericSidebar = true;
	} else if (modalMatch) {
		elements = [];
		modalShots = [modalMatch];
		onlyModal = true;
	} else if (args.element === SETTINGS_SPECIAL_ID) {
		elements = [];
		onlySettings = true;
	} else if (args.element === CANVAS_SPECIAL_ID) {
		elements = [];
		onlyCanvas = true;
	} else if (!elements.includes(args.element)) {
		console.error(`unknown --element=${args.element}`);
		process.exit(2);
	} else {
		elements = [args.element];
	}
}
const runSpecial = !args.element || onlySpecial;
const runSidebarSpecial = !args.element || onlySidebarSpecial;
const runGenericSidebar = !args.element || onlyGenericSidebar;
const runModals = !args.element || onlyModal;
const runSettings = !args.element || onlySettings;
const runCanvas = !args.element || onlyCanvas;
let themes = THEMES;
if (args.theme) {
	if (!THEMES.includes(args.theme)) {
		console.error(`unknown --theme=${args.theme} (expected ${THEMES.join('|')})`);
		process.exit(2);
	}
	themes = [args.theme];
}
let bgs = BGS;
if (args.bg) {
	if (!BGS.includes(args.bg)) {
		console.error(`unknown --bg=${args.bg} (expected ${BGS.join('|')})`);
		process.exit(2);
	}
	bgs = [args.bg];
}
const combos = themes.flatMap((theme) => bgs.map((bg) => ({ theme, bg })));

// Every note the theme×bg sweep opens: one per registered element (note name = element id)
// plus the EXTRA_NOTES entries (note name != element id).
const noteTargets = [...elements.map((id) => ({ id, element: id })), ...extraNotes];

// The Harness notes are generated (notes-gen.mjs) and the vault loads the plugin via a
// symlink to this repo's build output — both must exist before launching Obsidian.
for (const { id } of noteTargets) {
	const note = path.join(vaultPath, 'Harness', `${id}.md`);
	if (!fs.existsSync(note)) {
		throw new Error(`missing ${note} — run \`npm run obsidian-shots\` (it generates the notes first)`);
	}
}
if (runSpecial) {
	const note = path.join(vaultPath, 'Harness', `${SPECIAL_NOTE.id}.md`);
	if (!fs.existsSync(note)) {
		throw new Error(`missing ${note} — run \`npm run obsidian-shots\` (it generates the notes first)`);
	}
	const seedRoot = path.join(vaultPath, 'DS Compendium', 'kit', 'panther.md');
	if (!fs.existsSync(seedRoot)) {
		throw new Error(`missing ${seedRoot} — run \`npm run obsidian-shots\` (it seeds the compendium subtree first)`);
	}
}
if (runSidebarSpecial) {
	// Reuses Harness/initiative.md (already required above when the full sweep includes
	// 'initiative') — only needs an explicit check here because --element=sidebar-initiative
	// alone leaves `elements` empty.
	const note = path.join(vaultPath, 'Harness', 'initiative.md');
	if (!fs.existsSync(note)) {
		throw new Error(`missing ${note} — run \`npm run obsidian-shots\` (it generates the notes first)`);
	}
}
// Every remaining capture reuses (or adds) a Harness note; check each explicitly, since a
// narrowed --element leaves `elements` empty and the loop above checks nothing.
const requireNote = (name) => {
	const note = path.join(vaultPath, 'Harness', name);
	if (!fs.existsSync(note)) {
		throw new Error(`missing ${note} — run \`npm run obsidian-shots\` (it generates the notes first)`);
	}
};
if (runGenericSidebar) for (const e of genericSidebarIds) requireNote(`${e.id}.md`);
if (runModals) for (const m of modalShots) requireNote(`${m.note}.md`);
if (runCanvas) requireNote(`${CANVAS_SPECIAL_ID}.canvas`);
if (!fs.existsSync(path.join(repo, 'main.js'))) {
	throw new Error(`missing ${path.join(repo, 'main.js')} — run \`npm run obsidian-shots\` (it builds the plugin first)`);
}

// -- safety: the scratch user-data-dir must never be the real config dir ----------------
const realCfg = path.join(os.homedir(), '.config', 'obsidian');
if (path.resolve(udd) === realCfg || path.resolve(udd).startsWith(realCfg + path.sep)) {
	throw new Error(`refusing to use real Obsidian config dir as scratch: ${udd}`);
}

// -- minimal CDP client over Node's built-in WebSocket -----------------------------------
class Cdp {
	constructor(ws) {
		this.ws = ws;
		this.nextId = 0;
		this.pending = new Map();
		ws.onmessage = (e) => {
			const msg = JSON.parse(e.data);
			const p = this.pending.get(msg.id);
			if (!p) return;
			this.pending.delete(msg.id);
			if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
			else p.resolve(msg.result);
		};
		ws.onclose = () => {
			for (const p of this.pending.values()) p.reject(new Error(`${p.method}: CDP socket closed`));
			this.pending.clear();
		};
	}
	static async connect(url) {
		// Node >= 22 has a native WebSocket client; fall back to the 'ws' package
		// (present transitively via playwright) if the global is ever missing.
		const WS = globalThis.WebSocket ?? (await import('ws')).default;
		const ws = new WS(url);
		await new Promise((resolve, reject) => {
			ws.onopen = resolve;
			ws.onerror = () => reject(new Error(`WebSocket connect failed: ${url}`));
		});
		return new Cdp(ws);
	}
	call(method, params = {}) {
		const id = ++this.nextId;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject, method });
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}
	close() {
		try {
			this.ws.close();
		} catch {
			/* ignore */
		}
	}
}

// Evaluate a JS expression in the page; `expr` may be/return a promise (awaited).
async function evaluate(cdp, expr) {
	const res = await cdp.call('Runtime.evaluate', {
		expression: expr,
		awaitPromise: true,
		returnByValue: true,
	});
	if (res.exceptionDetails) {
		const d = res.exceptionDetails;
		throw new Error(`evaluate threw: ${d.exception?.description ?? d.text}`);
	}
	return res.result?.value;
}

async function waitFor(cdp, expr, { timeout = 30000, poll = 250, what = expr } = {}) {
	const t0 = Date.now();
	for (;;) {
		if (await evaluate(cdp, expr)) return;
		if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for: ${what}`);
		await sleep(poll);
	}
}

async function jsonList() {
	try {
		return await (await fetch(`http://localhost:${PORT}/json/list`)).json();
	} catch {
		return null;
	}
}

async function screenshot(cdp, file, clip) {
	const res = await cdp.call('Page.captureScreenshot', {
		format: 'png',
		...(clip ? { clip: { ...clip, scale: 1 } } : {}),
	});
	fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
	return fs.statSync(file).size;
}

function seedUdd() {
	fs.mkdirSync(udd, { recursive: true });
	// Registering the vault (absolute path, open:true) before first launch skips the
	// vault-picker window entirely.
	fs.writeFileSync(
		path.join(udd, 'obsidian.json'),
		JSON.stringify({ vaults: { [VAULT_ID]: { path: vaultPath, ts: Date.now(), open: true } } }),
	);
	// Window geometry lives in <udd>/<vaultId>.json, NOT the --window-size flag (which
	// Obsidian ignores). Seed it so the workspace window comes up at a deterministic size.
	// (Height still gets clamped to the physical screen by the WM.)
	fs.writeFileSync(
		path.join(udd, `${VAULT_ID}.json`),
		JSON.stringify({ x: 0, y: 0, width: 1440, height: 1100, isMaximized: false, devTools: false, zoom: 0 }),
	);
	// Deterministic layout: drop any leftover workspace.json (untracked; Obsidian rewrites
	// it every run) so the note pane geometry doesn't depend on prior manual sessions.
	fs.rmSync(path.join(vaultPath, '.obsidian', 'workspace.json'), { force: true });
}

function spawnObsidian() {
	const child = spawn(
		BIN,
		[`--user-data-dir=${udd}`, `--remote-debugging-port=${PORT}`, '--window-size=1440,1100'],
		{ env: { ...process.env, DISPLAY }, stdio: 'ignore' },
	);
	child.exited = new Promise((r) => child.once('exit', r));
	child.alive = true;
	child.exited.then(() => (child.alive = false));
	return child;
}

async function killChild(child) {
	if (!child?.alive) return;
	console.log(`killing child pid=${child.pid}`);
	child.kill('SIGTERM');
	await Promise.race([child.exited, sleep(5000)]);
	if (child.alive) child.kill('SIGKILL');
}

const hasUpdatedAsar = () =>
	fs.existsSync(udd) && fs.readdirSync(udd).some((f) => /^obsidian-.*\.asar$/.test(f));

// The system installer is ancient (Electron 106-era shell with a v1.1.x bundled asar);
// Obsidian auto-updates by downloading the latest app asar into the user-data-dir and
// loading it on the NEXT launch. Without this warm-up the camera would shoot with the
// 2023-era app code (window.apiVersion undefined, degraded plugin rendering).
async function warmUpUpdate() {
	if (hasUpdatedAsar()) return;
	console.log('no updated app asar in udd — warm-up launch to let Obsidian self-update…');
	const child = spawnObsidian();
	try {
		const t0 = Date.now();
		while (!hasUpdatedAsar()) {
			if (!child.alive) throw new Error('warm-up obsidian exited before update completed');
			if (Date.now() - t0 > 90000) {
				console.log('warm-up: no update after 90s (offline?) — continuing with bundled app version');
				return;
			}
			await sleep(500);
		}
		console.log(`warm-up: updated asar downloaded after ${Date.now() - t0}ms`);
	} finally {
		await killChild(child);
	}
}

async function main() {
	fs.mkdirSync(shotsDir, { recursive: true });

	// -- step 1: seed scratch user-data-dir + spawn --------------------------------------
	if (await jsonList()) {
		throw new Error(`port ${PORT} already serving CDP — another instance owns it; aborting`);
	}
	seedUdd();
	await warmUpUpdate();
	const child = spawnObsidian();
	console.log(`spawned obsidian pid=${child.pid} (udd=${udd}, port=${PORT}, display=${DISPLAY})`);

	const failures = [];
	let cdp;
	try {
		// -- step 2: poll CDP for the workspace window target (<=30 s), attach ------------
		const t0 = Date.now();
		let target = null;
		while (!target) {
			if (!child.alive) throw new Error('obsidian exited before CDP came up');
			if (Date.now() - t0 > 30000) {
				const targets = (await jsonList()) ?? [];
				throw new Error(
					`no app://obsidian.md page target within 30s (saw: ${targets.map((t) => `${t.type}:${t.url}`).join(', ') || 'none'})`,
				);
			}
			target = ((await jsonList()) ?? []).find(
				(t) => t.type === 'page' && t.url.startsWith('app://obsidian.md'),
			);
			if (!target) await sleep(250);
		}
		cdp = await Cdp.connect(target.webSocketDebuggerUrl);
		await waitFor(cdp, 'window.app?.workspace?.layoutReady === true', { what: 'layoutReady' });
		const info = await evaluate(
			cdp,
			`(() => {
				let v = window.apiVersion;
				try { v = v ?? window.require('obsidian').apiVersion; } catch {}
				return { apiVersion: v ?? 'unknown', vault: window.app.vault.getName(), w: window.innerWidth, h: window.innerHeight };
			})()`,
		);
		console.log(
			`attached: obsidian ${info.apiVersion}, vault "${info.vault}", window ${info.w}x${info.h} (layout ready ${Date.now() - t0}ms after spawn)`,
		);

		// -- step 2b: ensure the DSE plugin is enabled (restricted mode → drive app APIs) --
		let loaded = await evaluate(cdp, "!!window.app.plugins?.plugins?.['draw-steel-elements']");
		if (!loaded) {
			console.log('plugin not loaded (restricted mode?) — enabling via app.plugins APIs…');
			await evaluate(
				cdp,
				`(async () => {
					await window.app.plugins.setEnable(true);
					await window.app.plugins.enablePluginAndSave('draw-steel-elements');
				})()`,
			);
			// close any trust/notice modal left showing (DOM-targeted, no coordinates)
			await evaluate(
				cdp,
				"document.querySelectorAll('.modal-container .modal-close-button').forEach((b) => b.click())",
			);
			loaded = await evaluate(cdp, "!!window.app.plugins?.plugins?.['draw-steel-elements']");
		}
		const hasFramework =
			loaded &&
			(await evaluate(cdp, "!!window.app.plugins.plugins['draw-steel-elements'].frameworkV2"));
		if (!hasFramework) {
			const blocked = path.join(shotsDir, 'CAMERA-BLOCKED.png');
			await screenshot(cdp, blocked);
			const modalText = await evaluate(
				cdp,
				"document.querySelector('.modal-container')?.innerText ?? '(no modal visible)'",
			);
			throw new Error(
				`BLOCKED: plugin not loadable via APIs. Window shot: ${blocked}. Modal: ${modalText}`,
			);
		}
		console.log('plugin loaded, frameworkV2 present');

		// -- step 3: sweep — outer loop elements (one note-open each), inner loop combos ---
		const clearNotices = () =>
			// Floating notices ("Indexing vault…", update download prompt) overlay the
			// top-right of the pane — remove them so they can't sit on top of the shot.
			evaluate(cdp, "document.querySelectorAll('.notice').forEach((n) => n.remove())");

		// The DSE plugin theme: setActive persists the `theme` pref, which re-stamps
		// data-dse-theme on every live element root (reflow, not re-render). This is the
		// exact path main.ts's dse-cycle-theme command uses. Independent of the chrome bg.
		const setPluginTheme = async (elSel, theme) => {
			await evaluate(
				cdp,
				`window.app.plugins.plugins['draw-steel-elements'].frameworkV2.services.theme.setActive('${theme}')`,
			);
			await waitFor(cdp, `${elSel}?.dataset.dseTheme === '${theme}'`, {
				timeout: 10000,
				what: `data-dse-theme="${theme}" on the element root`,
			});
		};

		// The Obsidian chrome dark/light: app.changeTheme flips body.theme-dark/light
		// (spike-proven; fallback path kept for older builds). Never assume a start state —
		// set what the combo needs and wait for the class to reflect it.
		const setChromeBg = async (bg) => {
			const t = bg === 'dark' ? 'obsidian' : 'moonstone';
			await evaluate(
				cdp,
				`(() => {
					if (typeof window.app.changeTheme === 'function') window.app.changeTheme('${t}');
					else { window.app.vault.setConfig('theme', '${t}'); window.app.updateTheme(); }
				})()`,
			);
			await waitFor(cdp, `document.body.classList.contains('theme-${bg}')`, {
				timeout: 10000,
				what: `body.theme-${bg}`,
			});
		};

		const errorShot = async (outName) => {
			// Best-effort full-window shot so a failed combo leaves visual evidence.
			try {
				await screenshot(cdp, path.join(shotsDir, `${outName}--ERROR.png`));
			} catch {
				/* the window may be gone entirely — the failures list still records it */
			}
		};

		// D7 Task 11 fix: DseSidebarView is a MULTI-panel host (D8 spec §1.3/§1.7) —
		// openSidebarView reuses an existing `dse-sidebar` leaf and addPanel APPENDS to it
		// (production behavior, by design: one sidebar can host several blocks at once).
		// Steps 3c (initiative) and 3d (hero) run back-to-back in the SAME Obsidian
		// session and both go through sendToSidebar/openSidebarView, so without this,
		// step 3d's capture inherited step 3c's still-mounted initiative panel: the hero
		// panel DID mount (the `[data-dse-element="hero"]` waitFor genuinely passed), but
		// got appended BELOW the initiative panel inside the same leaf, so the leaf-clip
		// (fixed sidebar height, scrolled to top) captured the initiative panel's content
		// instead of hero's — a silent wrong-screenshot bug (no thrown error; visible only
		// by looking at the image, not the console log). Detaching any existing
		// `dse-sidebar` leaves before EACH ground-truth capture below guarantees
		// openSidebarView opens a brand-new, empty leaf every time, so the leaf-clip
		// always shows exactly the one panel that capture is proving — independent of
		// --element ordering or which specials run in a given invocation.
		const closeDseSidebarLeaves = () =>
			evaluate(cdp, "window.app.workspace.getLeavesOfType('dse-sidebar').forEach((l) => l.detach())");

		// SC-121 Batch 4: the emulate-if-taller-than-the-window / clip / screenshot dance,
		// verbatim from the per-combo sweep above and steps 3b–3d, hoisted so the SIX new
		// captures below don't each re-copy it a fourth time. `rectExpr` is a JS expression
		// returning {x,y,width,height,vh,vw}; everything else is identical to the inline
		// copies (kept as-is so this refactor cannot move any existing shot's bytes).
		const captureClip = async (outName, rectExpr, note = '') => {
			let emulated = false;
			try {
				let rect = await evaluate(cdp, rectExpr);
				if (rect.y + rect.height > rect.vh) {
					await cdp.call('Emulation.setDeviceMetricsOverride', {
						width: rect.vw,
						height: Math.ceil(rect.y + rect.height + 100),
						deviceScaleFactor: 0,
						mobile: false,
					});
					emulated = true;
					await sleep(500);
					await clearNotices();
					rect = await evaluate(cdp, rectExpr);
				}
				const clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
				const bytes = await screenshot(cdp, path.join(shotsDir, `${outName}.png`), clip);
				console.log(
					`  ok ${outName}.png (${bytes} bytes, clip ${Math.round(clip.width)}x${Math.round(clip.height)}${emulated ? ', emulated viewport' : ''})${note ? ' — ' + note : ''}`,
				);
			} finally {
				if (emulated) {
					try {
						await cdp.call('Emulation.clearDeviceMetricsOverride');
						await sleep(300);
					} catch {
						/* socket may already be down; killChild still runs */
					}
				}
			}
		};

		/** Open a Harness note in the given mode and wait for it to be the active file. */
		const openNote = async (name, mode) => {
			await evaluate(
				cdp,
				`(async () => {
					await window.app.workspace.openLinkText('Harness/${name}', '', false);
					const leaf = window.app.workspace.getMostRecentLeaf();
					await leaf.setViewState({
						type: 'markdown',
						state: { file: 'Harness/${name}.md', mode: '${mode}' },
						active: true,
					});
				})()`,
			);
			await waitFor(
				cdp,
				`window.app.workspace.getMostRecentLeaf()?.view?.file?.path === 'Harness/${name}.md'`,
				{ what: `Harness/${name}.md open (${mode} mode)` },
			);
		};

		for (const { id, element } of noteTargets) {
			// Element roots carry data-dse-element="<def.id>" (stamped by the pipeline);
			// scoping the selector to the id kills any race with the previous note's DOM.
			// `id` names the NOTE and the output file, `element` the mounted element — the
			// two differ only for EXTRA_NOTES entries.
			const elSel = `document.querySelector('.workspace-leaf.mod-active [data-dse-element="${element}"]')`;
			let openErr = null;
			try {
				await evaluate(
					cdp,
					`(async () => {
						await window.app.workspace.openLinkText('Harness/${id}', '', false);
						const leaf = window.app.workspace.getMostRecentLeaf();
						await leaf.setViewState({
							type: 'markdown',
							state: { file: 'Harness/${id}.md', mode: 'preview' },
							active: true,
						});
					})()`,
				);
				await waitFor(
					cdp,
					`(() => {
						const leaf = window.app.workspace.getMostRecentLeaf();
						if (leaf?.view?.file?.path !== 'Harness/${id}.md') return false;
						const el = ${elSel};
						if (!el) return false;
						// Laid-out box, not an arbitrary height floor: horizontal-rule is
						// only a few px tall and must still pass this gate.
						const r = el.getBoundingClientRect();
						return r.width > 0 && r.height > 0;
					})()`,
					{ what: `rendered [data-dse-element="${element}"] in Harness/${id}.md` },
				);
				await sleep(500); // settle: fonts/images/late layout
			} catch (e) {
				openErr = e;
			}

			for (const c of combos) {
				const outName = `${id}--obsidian-${c.theme}-${c.bg}`;
				if (openErr) {
					failures.push({ outName, errors: [`note open/render failed: ${String(openErr)}`] });
					await errorShot(outName);
					console.log(`FAIL ${outName} (note open/render)`);
					continue;
				}
				let emulated = false;
				try {
					await setPluginTheme(elSel, c.theme);
					await setChromeBg(c.bg);
					await sleep(300); // settle both restyles before measuring
					await clearNotices();
					// Fresh rect EVERY shot — theme flips can resize the element.
					const rectExpr = `(() => { const r = ${elSel}.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, vh: window.innerHeight, vw: window.innerWidth }; })()`;
					let rect = await evaluate(cdp, rectExpr);
					// Tall elements overflow the (screen-clamped) window; enlarging the
					// emulated viewport re-lays-out the workspace so the whole element paints.
					if (rect.y + rect.height > rect.vh) {
						await cdp.call('Emulation.setDeviceMetricsOverride', {
							width: rect.vw,
							height: Math.ceil(rect.y + rect.height + 100),
							deviceScaleFactor: 0,
							mobile: false,
						});
						emulated = true;
						await sleep(500); // re-layout
						await clearNotices();
						rect = await evaluate(cdp, rectExpr);
					}
					const clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
					const bytes = await screenshot(cdp, path.join(shotsDir, `${outName}.png`), clip);
					console.log(
						`  ok ${outName}.png (${bytes} bytes, clip ${Math.round(clip.width)}x${Math.round(clip.height)}${emulated ? ', emulated viewport' : ''})`,
					);
				} catch (e) {
					failures.push({ outName, errors: [String(e)] });
					await errorShot(outName);
					console.log(`FAIL ${outName}: ${String(e)}`);
				} finally {
					if (emulated) {
						try {
							await cdp.call('Emulation.clearDeviceMetricsOverride');
							await sleep(300);
						} catch {
							/* socket may already be down; killChild still runs */
						}
					}
				}
			}
		}

		// -- step 3b: the D6 Task 11 by-SCC recursion ground-truth capture -----------------
		// A `ds-scc` block whose body is nothing but `scc.v1:mcdm.heroes.v1/kit/panther`
		// (Harness/by-scc-kit.md) resolves against the real compendium file seeded at
		// "DS Compendium/kit/panther.md" (notes-gen.mjs). That file's markdown body embeds
		// its OWN `ds-feature` code block (the kit's signature ability, "Devastating
		// Rush") — CardLayout's hybrid body render hands that real body to Obsidian's
		// MarkdownRenderer.render, which (only in REAL Obsidian — the jsdom/mocked unit
		// tests stub this out) recursively re-runs the registered code-block processors
		// over it, mounting a SECOND, nested [data-dse-element="feature"] card inside the
		// outer kit card. This is the actual proof (Task 9's review note: "real recursion
		// deferred to Task 11 obsidian verification"); the assertion below fails loudly
		// (not just a screenshot to eyeball) if that nesting doesn't happen.
		if (runSpecial) {
			const elSel = `document.querySelector('.workspace-leaf.mod-active [data-dse-element="${SPECIAL_NOTE.elementSel}"]')`;
			const outName = `${SPECIAL_NOTE.id}--obsidian-recursion`;
			let emulated = false;
			try {
				await evaluate(
					cdp,
					`(async () => {
						await window.app.workspace.openLinkText('Harness/${SPECIAL_NOTE.id}', '', false);
						const leaf = window.app.workspace.getMostRecentLeaf();
						await leaf.setViewState({
							type: 'markdown',
							state: { file: 'Harness/${SPECIAL_NOTE.id}.md', mode: 'preview' },
							active: true,
						});
					})()`,
				);
				await waitFor(
					cdp,
					`(() => {
						const leaf = window.app.workspace.getMostRecentLeaf();
						if (leaf?.view?.file?.path !== 'Harness/${SPECIAL_NOTE.id}.md') return false;
						const el = ${elSel};
						if (!el) return false;
						const r = el.getBoundingClientRect();
						return r.width > 0 && r.height > 0;
					})()`,
					{ what: `rendered [data-dse-element="${SPECIAL_NOTE.elementSel}"] in Harness/${SPECIAL_NOTE.id}.md` },
				);
				await sleep(500); // settle: the by-SCC resolve + nested render are both async
				await setPluginTheme(elSel, 'steel');
				await setChromeBg('dark');
				await sleep(300);
				await clearNotices();

				const proof = await evaluate(
					cdp,
					`(() => {
						const root = ${elSel};
						if (!root) return { ok: false, reason: 'root not found' };
						const errorCard = root.querySelector('.dse-error-card');
						if (errorCard) return { ok: false, reason: 'error card: ' + errorCard.textContent };
						const nested = root.querySelector('[data-dse-element="feature"]');
						if (!nested) {
							return { ok: false, reason: 'no nested [data-dse-element="feature"] -- by-SCC recursion did not occur' };
						}
						return { ok: true };
					})()`,
				);
				if (!proof.ok) throw new Error(`by-SCC recursion proof failed: ${proof.reason}`);

				const rectExpr = `(() => { const r = ${elSel}.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, vh: window.innerHeight, vw: window.innerWidth }; })()`;
				let rect = await evaluate(cdp, rectExpr);
				if (rect.y + rect.height > rect.vh) {
					await cdp.call('Emulation.setDeviceMetricsOverride', {
						width: rect.vw,
						height: Math.ceil(rect.y + rect.height + 100),
						deviceScaleFactor: 0,
						mobile: false,
					});
					emulated = true;
					await sleep(500);
					await clearNotices();
					rect = await evaluate(cdp, rectExpr);
				}
				const clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
				const bytes = await screenshot(cdp, path.join(shotsDir, `${outName}.png`), clip);
				console.log(`  ok ${outName}.png (${bytes} bytes) — nested [data-dse-element="feature"] confirmed`);
			} catch (e) {
				failures.push({ outName, errors: [String(e)] });
				await errorShot(outName);
				console.log(`FAIL ${outName}: ${String(e)}`);
			} finally {
				if (emulated) {
					try {
						await cdp.call('Emulation.clearDeviceMetricsOverride');
						await sleep(300);
					} catch {
						/* socket may already be down; killChild still runs */
					}
				}
			}
		}

		// -- step 3c: D8 Task 3 sidebar-leaf ground-truth capture --------------------------
		// Investigated per the D8 Task 3 brief: can the camera drive a SIDEBAR leaf (an
		// ItemView, not a reading-mode markdown leaf)? Yes, with exactly the extra
		// Runtime.evaluate the brief anticipated: invoking the plugin's real "Send
		// initiative tracker to sidebar" command (app.commands.executeCommandById — the
		// SAME affordance a user triggers via the command palette, main.ts D8 Task 3)
		// opens the right-split leaf and mounts the SAME InitiativeView the reading-mode
		// shots above exercise. `.dse-sidebar__panel [data-dse-element="initiative"]`
		// appears deterministically, and the leaf's own `.closest('.workspace-leaf')`
		// bounding rect is a stable, non-degenerate clip region under the headless
		// --user-data-dir (spike-verified: x=1140 y=40 w=300 h=1013 in a 1440x1053
		// window — Obsidian's default right-sidebar width; NOT the geometry concern the
		// brief flagged as a possible blocker). ONE shot (steel/dark only — a ground-truth
		// existence proof, matching step 3b's by-SCC recursion shot's own scope, not a
		// full theme×bg sweep).
		if (runSidebarSpecial) {
			const elSel = `document.querySelector('.dse-sidebar__panel [data-dse-element="initiative"]')`;
			let openErr;
			try {
				// Start from a panel-free sidebar (see closeDseSidebarLeaves' comment above)
				// so this leaf-clip shows ONLY the initiative panel, regardless of what ran
				// before it in this invocation.
				await closeDseSidebarLeaves();
				// source mode (not preview, unlike the rest of this file): the "send to
				// sidebar" command is an editorCheckCallback (main.ts), which resolves its
				// active-file context off the workspace's active EDITOR — spike-verified
				// present under source mode; not re-verified under preview.
				await evaluate(
					cdp,
					`(async () => {
						await window.app.workspace.openLinkText('Harness/initiative', '', false);
						const leaf = window.app.workspace.getMostRecentLeaf();
						await leaf.setViewState({
							type: 'markdown',
							state: { file: 'Harness/initiative.md', mode: 'source' },
							active: true,
						});
					})()`,
				);
				await waitFor(
					cdp,
					`window.app.workspace.getMostRecentLeaf()?.view?.file?.path === 'Harness/initiative.md'`,
					{ what: 'Harness/initiative.md open (source mode, for the editor command)' },
				);

				const exec = await evaluate(
					cdp,
					`(() => {
						try {
							return { ok: window.app.commands.executeCommandById('draw-steel-elements:send-initiative-to-sidebar') };
						} catch (e) {
							return { ok: false, error: String(e) };
						}
					})()`,
				);
				if (!exec.ok) {
					throw new Error(
						`send-initiative-to-sidebar did not run: ${exec.error ?? '(returned false — no active editor context?)'}`,
					);
				}

				await waitFor(cdp, `!!${elSel}`, { what: 'sidebar panel mounted [data-dse-element="initiative"]' });
				await sleep(500); // settle: portrait image resolution + late layout, same as the main sweep

				// Doesn't change between bg iterations below — set once here (unlike the
				// main sweep's per-combo setPluginTheme, which also varies theme).
				await setPluginTheme(elSel, 'steel');
			} catch (e) {
				openErr = e;
			}

			// SC-108 / FOLLOWUPS #37: dark+light sweep — retains the styles-source.css §5
			// `body.theme-light .dse-sidebar ...` override rule (bevel box-shadow vs. the
			// dark-lift shadow), which only the light iteration exercises.
			for (const bg of ['dark', 'light']) {
				const outName = `initiative--obsidian-sidebar-steel-${bg}`;
				if (openErr) {
					failures.push({ outName, errors: [`sidebar open/command failed: ${String(openErr)}`] });
					await errorShot(outName);
					console.log(`FAIL ${outName} (sidebar open/command)`);
					continue;
				}
				let emulated = false;
				try {
					await setChromeBg(bg);
					await sleep(300);
					await clearNotices();

					// Clip to the LEAF, not the element root: unlike a reading-mode element
					// (clipped tightly to [data-dse-element]), the sidebar shot's whole point
					// is showing the panel IN its leaf chrome — the ground truth is "this
					// mounts as a real sidebar leaf," not just "this element renders."
					// Fresh rect EVERY shot — theme flips can resize the element.
					const rectExpr = `(() => {
						const leafEl = ${elSel}.closest('.workspace-leaf');
						const r = leafEl.getBoundingClientRect();
						return { x: r.x, y: r.y, width: r.width, height: r.height, vh: window.innerHeight, vw: window.innerWidth };
					})()`;
					let rect = await evaluate(cdp, rectExpr);
					if (rect.y + rect.height > rect.vh) {
						await cdp.call('Emulation.setDeviceMetricsOverride', {
							width: rect.vw,
							height: Math.ceil(rect.y + rect.height + 100),
							deviceScaleFactor: 0,
							mobile: false,
						});
						emulated = true;
						await sleep(500);
						await clearNotices();
						rect = await evaluate(cdp, rectExpr);
					}
					const clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
					const bytes = await screenshot(cdp, path.join(shotsDir, `${outName}.png`), clip);
					console.log(
						`  ok ${outName}.png (${bytes} bytes, clip ${Math.round(clip.width)}x${Math.round(clip.height)}${emulated ? ', emulated viewport' : ''}) — sidebar leaf confirmed`,
					);
				} catch (e) {
					failures.push({ outName, errors: [String(e)] });
					await errorShot(outName);
					console.log(`FAIL ${outName}: ${String(e)}`);
				} finally {
					if (emulated) {
						try {
							await cdp.call('Emulation.clearDeviceMetricsOverride');
							await sleep(300);
						} catch {
							/* socket may already be down; killChild still runs */
						}
					}
				}
			}
		}

		// -- step 3d: sidebar-leaf captures via the GENERIC "Send block to sidebar" --------
		// Same question step 3c answered for initiative ("can the camera drive a SIDEBAR
		// leaf"), but exercised through the GENERIC command (registration.ts's
		// `send-block-to-sidebar`, an `editorCheckCallback` keyed off the cursor's position
		// inside a `ds-*` fence — `aliasAtLine`) rather than a dedicated per-element one,
		// because most elements have none (spec §5: "sidebar opt-in is universal ... no new
		// production plumbing"). The wrinkle vs step 3c: the generic command requires the
		// cursor to actually sit inside the fence, so it is set explicitly via the live
		// editor, SCANNED for the fence line rather than hardcoded — every Harness note's
		// body is generated from the element's example.yaml and can grow/shrink lines
		// independently of this file.
		//
		// SC-121 Batch 4 (catalog D-7): generalized from the single `hero` capture to
		// GENERIC_SIDEBAR_IDS (see that constant for why these four). `hero`'s output name
		// is unchanged. One shot each (steel/dark), same ground-truth-existence scope as
		// steps 3b/3c; gated the same way (`--element=sidebar-<id>`).
		if (runGenericSidebar) {
			for (const entry of genericSidebarIds) {
				const { id } = entry;
				const element = entry.element ?? id;
				const outName = `${id}--obsidian-sidebar-steel-dark`;
				const elSel = `document.querySelector('.dse-sidebar__panel [data-dse-element="${element}"]')`;
				const alias = aliases[id];
				try {
					// Start from a panel-free sidebar (see closeDseSidebarLeaves' comment
					// above) — without this, the PREVIOUS capture's panel (still mounted in
					// the SAME reused dse-sidebar leaf) sits above this one in the DOM and
					// the leaf-clip silently captures ITS content instead.
					await closeDseSidebarLeaves();
					// source mode: the command is an editorCheckCallback and resolves its
					// context off the workspace's active EDITOR.
					await openNote(id, 'source');

					const exec = await evaluate(
						cdp,
						`(() => {
							try {
								const editor = window.app.workspace.getMostRecentLeaf().view.editor;
								const fence = String.fromCharCode(96, 96, 96) + '${alias}';
								const lines = editor.getValue().split('\\n');
								const fenceLine = lines.findIndex((l) => l.trim() === fence);
								if (fenceLine === -1) {
									return { ok: false, error: 'no ${alias} fence found in Harness/${id}.md' };
								}
								// One line INSIDE the fence (aliasAtLine's scan is exclusive of
								// the cursor's own line — registration.ts).
								editor.setCursor({ line: fenceLine + 1, ch: 0 });
								return { ok: window.app.commands.executeCommandById('draw-steel-elements:send-block-to-sidebar') };
							} catch (e) {
								return { ok: false, error: String(e) };
							}
						})()`,
					);
					if (!exec.ok) {
						throw new Error(
							`send-block-to-sidebar did not run: ${exec.error ?? '(returned false — cursor not inside a ds-* fence?)'}`,
						);
					}

					await waitFor(cdp, `!!${elSel}`, { what: `sidebar panel mounted [data-dse-element="${element}"]` });
					await sleep(500); // settle: late layout, same as step 3c

					await setPluginTheme(elSel, 'steel');
					await setChromeBg('dark');
					await sleep(300);
					await clearNotices();

					// Clip to the LEAF, not the element root — same rationale as step 3c: the
					// ground truth is "this mounts as a real sidebar leaf," not just "this
					// element renders."
					await captureClip(
						outName,
						`(() => {
							const leafEl = ${elSel}.closest('.workspace-leaf');
							const r = leafEl.getBoundingClientRect();
							return { x: r.x, y: r.y, width: r.width, height: r.height, vh: window.innerHeight, vw: window.innerWidth };
						})()`,
						'sidebar leaf confirmed',
					);
				} catch (e) {
					failures.push({ outName, errors: [String(e)] });
					await errorShot(outName);
					console.log(`FAIL ${outName}: ${String(e)}`);
				}
			}
		}

		// -- step 3e: SC-121 Batch 4 (catalog D-5) modal captures --------------------------
		// The gap this closes: no fixture, alias or shot in EITHER camera had ever opened a
		// modal, so the stamina editor, its Spend Recovery state, the condition picker and
		// the generic form editor were four frequently-used interactive surfaces with zero
		// visual gate — and Batch 1's control-density rules resize every kit button inside
		// them (batch-1 review I-1). Driven the way a user drives them: open the note, click
		// the REAL affordance, wait for the REAL modal DOM. Steel/dark only, same
		// ground-truth-existence scope as steps 3b–3d.
		//
		// Modals are NOT in the browser harness: the F4 page vendors only the Obsidian
		// variables styles-source.css reads, not Obsidian's `.modal-container`/`.modal`
		// chrome, so a browser modal shot would pin a box that doesn't exist in the product.
		// Real Obsidian is the only honest vehicle here.
		if (runModals) {
			// Always leave a modal-free window behind: a modal left open would overlay the
			// next capture's clip region (and the settings popout below opens on top of it).
			const dismissModals = async () => {
				await evaluate(
					cdp,
					`document.querySelectorAll('.modal-container .modal-close-button').forEach((b) => b.click())`,
				);
				await evaluate(cdp, `document.querySelectorAll('.modal-container').forEach((c) => c.remove())`);
			};
			const prefsExpr = `window.app.plugins.plugins['draw-steel-elements'].frameworkV2.services.prefs`;
			for (const m of modalShots) {
				const outName = `${m.id}--obsidian-steel-dark`;
				const elSel = `document.querySelector('.workspace-leaf.mod-active [data-dse-element]')`;
				try {
					await dismissModals();
					if (m.pref) {
						await evaluate(cdp, `${prefsExpr}.set('${m.pref[0]}', ${JSON.stringify(m.pref[1])})`);
					}
					await openNote(m.note, 'preview');
					await waitFor(cdp, `!!${elSel}`, { what: `rendered element in Harness/${m.note}.md` });
					// Theme BEFORE opening: DseModal.open() stamps data-dse-theme on the
					// dialog root from the live ThemeService (managedModal.ts), so the modal
					// inherits whatever the note's element is already showing.
					await setPluginTheme(elSel, 'steel');
					await setChromeBg('dark');
					await sleep(300);
					await waitFor(cdp, `!!document.querySelector('.workspace-leaf.mod-active ${m.trigger}')`, {
						what: `modal trigger ${m.trigger}`,
					});
					await evaluate(cdp, `document.querySelector('.workspace-leaf.mod-active ${m.trigger}').click()`);
					await waitFor(cdp, `!!document.querySelector('${m.ready}')`, {
						what: `open modal (${m.ready})`,
					});
					if (m.then) {
						await sleep(300);
						const clicked = await evaluate(
							cdp,
							`(() => { const b = document.querySelector('${m.then}'); if (!b) return false; if (b.disabled) return 'disabled'; b.click(); return true; })()`,
						);
						if (clicked !== true) {
							throw new Error(`follow-up click ${m.then} not available (${clicked})`);
						}
					}
					await sleep(400); // settle: preview-bar geometry / icon paint
					await clearNotices();
					const themed = await evaluate(cdp, `document.querySelector('.dse-modal')?.dataset.dseTheme ?? '(none)'`);
					if (themed !== 'steel') throw new Error(`modal not Steel-themed (data-dse-theme=${themed})`);

					// Clip the DIALOG box (`.dse-modal` is stamped on Obsidian's `.modal`),
					// not the full-window `.modal-container` overlay — the subject is the
					// modal's own layout and control density.
					await captureClip(
						outName,
						`(() => {
							const r = document.querySelector('.dse-modal').getBoundingClientRect();
							return { x: r.x, y: r.y, width: r.width, height: r.height, vh: window.innerHeight, vw: window.innerWidth };
						})()`,
						'modal confirmed',
					);
				} catch (e) {
					failures.push({ outName, errors: [String(e)] });
					await errorShot(outName);
					console.log(`FAIL ${outName}: ${String(e)}`);
				} finally {
					await dismissModals().catch(() => {});
					if (m.pref) {
						// data.json is git-ignored, but leave no pref churn behind.
						await evaluate(cdp, `${prefsExpr}.set('${m.pref[0]}', ${JSON.stringify(!m.pref[1])})`).catch(
							() => {},
						);
					}
				}
			}
		}

		// -- step 3f: SC-121 Batch 4 (catalog D-8) settings-tab capture ---------------------
		// Obsidian 1.13 opens Settings as a POPOUT WINDOW — a separate CDP page target (url
		// about:blank, title "Settings - <vault> - Obsidian …"), not a modal in the main
		// workspace document. So: drive `app.setting.open()` + `openTabById` from the MAIN
		// target, then attach a SECOND CDP connection to the popout and do all DOM work and
		// the screenshot THERE. (Pattern established by SC-112 Task 8, which needed exactly
		// this for the typography evidence; D-8 asked for it to become a standard fixture
		// instead of leftover ad-hoc evidence.) Steel/dark only.
		if (runSettings) {
			const outName = 'settings--obsidian-steel-dark';
			let scdp;
			try {
				await evaluate(
					cdp,
					`window.app.plugins.plugins['draw-steel-elements'].frameworkV2.services.theme.setActive('steel')`,
				);
				await setChromeBg('dark');
				await evaluate(
					cdp,
					`(() => {
						window.app.setting.open();
						window.app.setting.openTabById('draw-steel-elements');
					})()`,
				);
				let settingsTarget = null;
				const ts0 = Date.now();
				while (!settingsTarget) {
					if (Date.now() - ts0 > 15000) throw new Error('no Settings popout target within 15s');
					settingsTarget = ((await jsonList()) ?? []).find(
						(t) => t.type === 'page' && /^Settings /.test(t.title ?? ''),
					);
					if (!settingsTarget) await sleep(250);
				}
				scdp = await Cdp.connect(settingsTarget.webSocketDebuggerUrl);
				await waitFor(scdp, `!!document.querySelector('.vertical-tab-content .setting-item')`, {
					what: 'DSE settings tab content in the popout',
				});
				// Tall emulated viewport so the whole tab lays out without internal
				// scrolling, and the Advanced disclosure open so no control is hidden.
				await scdp.call('Emulation.setDeviceMetricsOverride', {
					width: 1200,
					height: 2400,
					deviceScaleFactor: 0,
					mobile: false,
				});
				await sleep(600);
				await evaluate(
					scdp,
					`(() => {
						document.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''));
						document.querySelectorAll('.notice').forEach((n) => n.remove());
					})()`,
				);
				await sleep(400);
				const rect = await evaluate(
					scdp,
					`(() => {
						const content = document.querySelector('.vertical-tab-content');
						content.scrollTop = 0;
						const r = content.getBoundingClientRect();
						return { x: r.x, y: r.y, width: r.width, height: Math.min(content.scrollHeight, window.innerHeight - r.y) };
					})()`,
				);
				const bytes = await screenshot(scdp, path.join(shotsDir, `${outName}.png`), rect);
				console.log(
					`  ok ${outName}.png (${bytes} bytes, clip ${Math.round(rect.width)}x${Math.round(rect.height)}) — settings popout confirmed`,
				);
			} catch (e) {
				failures.push({ outName, errors: [String(e)] });
				await errorShot(outName);
				console.log(`FAIL ${outName}: ${String(e)}`);
			} finally {
				try {
					await scdp?.call('Emulation.clearDeviceMetricsOverride');
				} catch {
					/* popout may already be gone */
				}
				scdp?.close();
				// Close the popout from the main target so it can't overlay later captures
				// or block the quit below.
				await evaluate(cdp, 'window.app.setting.close()').catch(() => {});
				await sleep(400);
			}
		}

		// -- step 3g: SC-121 Batch 4 (catalog D-6) canvas read-only capture -----------------
		// Canvas text nodes render with `ctx.sourcePath === ''`; ReadingModeBlockHost
		// quarantines that to `canPersist: false` (see its file header), and the pipeline
		// stamps `data-dse-readonly` on the element root — the CSS-only "Read-only" badge,
		// plus every element's own read-only affordances (an inert stamina bar with its
		// tooltip instead of a click-to-edit one, no write footers). D-6's finding was that
		// this entire path had ZERO shots: the browser harness's `--readonly` variants
		// FABRICATE the host (entry.ts's makeHarnessHost passes sourcePath: ''), which
		// proves the affordance renders but not that canvas actually takes that path.
		// Harness/canvas.canvas (notes-gen.mjs) is a generated 2-node canvas whose text
		// nodes are ds-stam / ds-conditions blocks — interactive elements, so read-only is
		// visible rather than a no-op.
		if (runCanvas) {
			const outName = 'canvas--obsidian-readonly-steel-dark';
			const elSel = `document.querySelector('.canvas-node [data-dse-element="stamina-bar"]')`;
			try {
				await evaluate(
					cdp,
					`(async () => {
						await window.app.workspace.openLinkText('Harness/${CANVAS_SPECIAL_ID}.canvas', '', false);
						const leaf = window.app.workspace.getMostRecentLeaf();
						await leaf.setViewState({
							type: 'canvas',
							state: { file: 'Harness/${CANVAS_SPECIAL_ID}.canvas' },
							active: true,
						});
					})()`,
				);
				await waitFor(
					cdp,
					`window.app.workspace.getMostRecentLeaf()?.view?.file?.path === 'Harness/${CANVAS_SPECIAL_ID}.canvas'`,
					{ what: `Harness/${CANVAS_SPECIAL_ID}.canvas open` },
				);
				// Canvas renders nodes lazily by viewport; frame the whole (small) canvas so
				// both nodes mount regardless of the window's size.
				await evaluate(cdp, `window.app.workspace.getMostRecentLeaf().view.canvas?.zoomToFit?.()`).catch(
					() => {},
				);
				await waitFor(cdp, `!!${elSel}`, { what: 'a DSE element rendered inside a canvas node' });
				await sleep(700); // settle: canvas transform + element mount
				await setPluginTheme(elSel, 'steel');
				await setChromeBg('dark');
				await sleep(300);
				await clearNotices();

				// The whole point of the capture — assert the quarantine actually happened,
				// loudly, rather than leaving it to whoever looks at the PNG.
				const proof = await evaluate(
					cdp,
					`(() => {
						const roots = [...document.querySelectorAll('.canvas-node [data-dse-element]')];
						if (!roots.length) return { ok: false, reason: 'no element roots inside canvas nodes' };
						const unquarantined = roots.filter((r) => r.getAttribute('data-dse-readonly') !== 'true');
						if (unquarantined.length) {
							return { ok: false, reason: 'canvas element root(s) NOT read-only: ' + unquarantined.map((r) => r.dataset.dseElement).join(', ') };
						}
						return { ok: true, n: roots.length };
					})()`,
				);
				if (!proof.ok) throw new Error(`canvas read-only proof failed: ${proof.reason}`);

				// Clip the two canvas nodes together (the canvas is generated with them
				// side by side), so the shot shows the read-only badge in its real context.
				await captureClip(
					outName,
					`(() => {
						const nodes = [...document.querySelectorAll('.canvas-node')].filter((n) => n.querySelector('[data-dse-element]'));
						const rs = nodes.map((n) => n.getBoundingClientRect());
						const x = Math.min(...rs.map((r) => r.x)) - 8;
						const y = Math.min(...rs.map((r) => r.y)) - 8;
						const right = Math.max(...rs.map((r) => r.right)) + 8;
						const bottom = Math.max(...rs.map((r) => r.bottom)) + 8;
						return { x, y, width: right - x, height: bottom - y, vh: window.innerHeight, vw: window.innerWidth };
					})()`,
					`${proof.n} canvas node(s), all data-dse-readonly`,
				);
			} catch (e) {
				failures.push({ outName, errors: [String(e)] });
				await errorShot(outName);
				console.log(`FAIL ${outName}: ${String(e)}`);
			}
		}

		// -- step 4: restore persisted defaults, then quit cleanly --------------------------
		// The plugin theme pref (data.json, git-ignored) and the vault's appearance.json
		// (tracked) both persist whatever the sweep last set — put them back to the
		// committed baselines (plugin: steel, chrome: dark) so runs leave no value churn.
		try {
			await evaluate(
				cdp,
				`window.app.plugins.plugins['draw-steel-elements'].frameworkV2.services.theme.setActive('steel')`,
			);
			await setChromeBg('dark');
		} catch (e) {
			console.log(`restore-defaults failed (non-fatal): ${String(e)}`);
		}
		// Let Obsidian FLUSH the restored config before quitting: app.quit() racing the
		// async appearance.json write has truncated the tracked file to 0 bytes once
		// (SC-10 session — the exact fire-and-forget race the Plan-12 review predicted).
		await sleep(750);
		// electron.remote.app.quit() is the working quit on this build (there is NO
		// app:quit command). It tears down the CDP socket mid-call; fire and tolerate.
		evaluate(cdp, 'window.electron?.remote?.app?.quit()').catch(() => {});
		await Promise.race([child.exited, sleep(10000)]);
		console.log(child.alive ? 'in-app quit did not exit the process' : 'quit cleanly in-app');
	} finally {
		cdp?.close();
		await killChild(child);
	}

	if (failures.length) {
		console.error(`\n${failures.length} shot(s) had errors:`);
		for (const f of failures) console.error(`  ${f.outName}: ${f.errors.join(' | ')}`);
		process.exit(1);
	}
	const total =
		noteTargets.length * combos.length +
		(runSpecial ? 1 : 0) +
		(runSidebarSpecial ? 2 : 0) +
		(runGenericSidebar ? genericSidebarIds.length : 0) +
		(runModals ? modalShots.length : 0) +
		(runSettings ? 1 : 0) +
		(runCanvas ? 1 : 0);
	console.log(`\nall ${total} shots written to ${shotsDir}`);
}

main().catch((e) => {
	console.error(String(e?.stack ?? e));
	process.exit(1);
});
