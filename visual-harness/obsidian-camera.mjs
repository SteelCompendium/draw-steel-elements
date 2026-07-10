#!/usr/bin/env node
// visual-harness/obsidian-camera.mjs — F5 (Plan 12): the real-Obsidian camera.
// Launches a SECOND, fully isolated Obsidian instance (scratch --user-data-dir + CDP port),
// attaches over raw CDP, opens each demo-vault/Harness/<element>.md in reading mode, and
// clip-screenshots the rendered [data-dse-element] once per combo of
//   plugin theme (legacy|steel — frameworkV2.services.theme.setActive, the DSE skin)
// × chrome bg  (dark|light  — app.changeTheme, Obsidian's own moonstone/obsidian theme)
// to visual-harness/shots/<element>--obsidian-<theme>-<bg>.png (11 × 2 × 2 = 44 shots).
// These are two INDEPENDENT axes: the plugin theme re-stamps data-dse-theme on element
// roots; the chrome theme flips body.theme-dark/light. Both are awaited before each shot.
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
// Usage: node visual-harness/obsidian-camera.mjs [--element=<id>] [--theme=<legacy|steel>] [--bg=<dark|light>]
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

const THEMES = ['legacy', 'steel']; // DSE plugin theme (data-dse-theme on element roots)
const BGS = ['dark', 'light']; // Obsidian chrome theme (body.theme-dark / theme-light)
const aliases = JSON.parse(fs.readFileSync(path.join(dir, 'aliases.json'), 'utf8'));

let elements = Object.keys(aliases).sort();
if (args.element) {
	if (!elements.includes(args.element)) {
		console.error(`unknown --element=${args.element}`);
		process.exit(2);
	}
	elements = [args.element];
}
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

// The Harness notes are generated (notes-gen.mjs) and the vault loads the plugin via a
// symlink to this repo's build output — both must exist before launching Obsidian.
for (const id of elements) {
	const note = path.join(vaultPath, 'Harness', `${id}.md`);
	if (!fs.existsSync(note)) {
		throw new Error(`missing ${note} — run \`npm run obsidian-shots\` (it generates the notes first)`);
	}
}
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

		for (const id of elements) {
			// Element roots carry data-dse-element="<def.id>" (stamped by the pipeline);
			// scoping the selector to the id kills any race with the previous note's DOM.
			const elSel = `document.querySelector('.workspace-leaf.mod-active [data-dse-element="${id}"]')`;
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
					{ what: `rendered [data-dse-element="${id}"] in Harness/${id}.md` },
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
	console.log(`\nall ${elements.length * combos.length} shots written to ${shotsDir}`);
}

main().catch((e) => {
	console.error(String(e?.stack ?? e));
	process.exit(1);
});
