#!/usr/bin/env node
// visual-harness/obsidian-camera.mjs — F5 (Plan 12) SPIKE v0: the real-Obsidian camera.
// Launches a SECOND, fully isolated Obsidian instance (scratch --user-data-dir + CDP port),
// attaches over raw CDP, opens demo-vault/Harness/statblock.md in reading mode, and
// clip-screenshots the rendered [data-dse-element] to
// visual-harness/shots/statblock--obsidian-legacy-dark.png. Also proves the dark/light
// theme switch API. Task 4 grows this into the full element × theme sweep.
//
// WHY RAW CDP (not Playwright): playwright's chromium.connectOverCDP() fails against
// Obsidian's Electron with "Browser.setDownloadBehavior: Browser context management is
// not supported" (Electron doesn't implement the browser-target commands Playwright
// needs). Raw CDP over Node's built-in WebSocket (Node >= 22) works: GET /json/list,
// attach to the app://obsidian.md page target, Runtime.evaluate + Page.captureScreenshot.
//
// Usage: node visual-harness/obsidian-camera.mjs --spike [--skip-build]
// Env:   DSE_CAMERA_TMP     scratch root (default /tmp/claude-1000/dse-obsidian-camera)
//        DSE_CAMERA_PORT    CDP port (default 9223)
//        DSE_CAMERA_DISPLAY X display (default :1)
//        DSE_CAMERA_BIN     obsidian binary (default /usr/bin/obsidian)
//
// SAFETY: never touches ~/.config/obsidian; refuses to start if the CDP port is already
// serving (i.e. some other instance owns it); kills ONLY the child it spawned.
import { spawn, execSync } from 'node:child_process';
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
	// -- step 0: build plugin + generate harness notes -----------------------------------
	if (!process.argv.includes('--skip-build')) {
		console.log('building plugin (npm run build-no-check)…');
		execSync('npm run build-no-check', { cwd: repo, stdio: 'inherit' });
	}
	execSync(`node ${JSON.stringify(path.join(dir, 'notes-gen.mjs'))}`, { stdio: 'inherit' });
	fs.mkdirSync(shotsDir, { recursive: true });

	// -- step 1: seed scratch user-data-dir + spawn --------------------------------------
	if (await jsonList()) {
		throw new Error(`port ${PORT} already serving CDP — another instance owns it; aborting`);
	}
	seedUdd();
	await warmUpUpdate();
	const child = spawnObsidian();
	console.log(`spawned obsidian pid=${child.pid} (udd=${udd}, port=${PORT}, display=${DISPLAY})`);

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
			const blocked = path.join(shotsDir, 'SPIKE-BLOCKED.png');
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

		// -- step 3: open Harness/statblock in reading mode --------------------------------
		await evaluate(
			cdp,
			`(async () => {
				await window.app.workspace.openLinkText('Harness/statblock', '', false);
				const leaf = window.app.workspace.getMostRecentLeaf();
				await leaf.setViewState({
					type: 'markdown',
					state: { file: 'Harness/statblock.md', mode: 'preview' },
					active: true,
				});
			})()`,
		);
		const elSel = "document.querySelector('.workspace-leaf.mod-active [data-dse-element]')";
		await waitFor(cdp, `(() => { const el = ${elSel}; return !!el && el.getBoundingClientRect().height > 20; })()`, {
			what: 'rendered [data-dse-element]',
		});
		await sleep(500); // settle: fonts/images/late layout
		// Floating notices ("Indexing vault…", update download prompt) overlay the top-right
		// of the pane — remove them so they can't sit on top of the element being shot.
		const clearNotices = () =>
			evaluate(cdp, "document.querySelectorAll('.notice').forEach((n) => n.remove())");
		await clearNotices();
		const rectExpr = `(() => { const r = ${elSel}.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, vh: window.innerHeight, vw: window.innerWidth }; })()`;
		let rect = await evaluate(cdp, rectExpr);
		// Tall elements overflow the (screen-clamped) window; enlarging the emulated
		// viewport re-lays-out the workspace so the whole element paints on screen.
		let emulated = false;
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
			console.log(`emulated viewport ${rect.vw}x${rect.vh} to fit tall element`);
		}
		const clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
		const out = path.join(shotsDir, 'statblock--obsidian-legacy-dark.png');
		const bytes = await screenshot(cdp, out, clip);
		if (emulated) {
			await cdp.call('Emulation.clearDeviceMetricsOverride');
			await sleep(300);
		}
		console.log(`shot ${out} (${bytes} bytes, clip ${Math.round(clip.width)}x${Math.round(clip.height)})`);

		// -- step 3b: prove the dark/light switch (needed by Task 4), then switch back -----
		const theme = await evaluate(
			cdp,
			`(async () => {
				const isDark = () => document.body.classList.contains('theme-dark');
				const before = isDark() ? 'dark' : 'light';
				const useChangeTheme = typeof window.app.changeTheme === 'function';
				const set = (t) => {
					if (useChangeTheme) window.app.changeTheme(t);
					else { window.app.vault.setConfig('theme', t); window.app.updateTheme(); }
				};
				set('moonstone');
				await new Promise((r) => setTimeout(r, 300));
				const mid = isDark() ? 'dark' : 'light';
				set('obsidian');
				await new Promise((r) => setTimeout(r, 300));
				const after = isDark() ? 'dark' : 'light';
				const mech = useChangeTheme
					? "app.changeTheme('moonstone'|'obsidian')"
					: "app.vault.setConfig('theme',…) + app.updateTheme()";
				return { before, mid, after, mech };
			})()`,
		);
		console.log(`theme switch: ${theme.before} → ${theme.mid} → ${theme.after} via ${theme.mech}`);
		if (!(theme.before === 'dark' && theme.mid === 'light' && theme.after === 'dark')) {
			throw new Error(`theme switch did not behave (${JSON.stringify(theme)})`);
		}

		// -- step 4: quit cleanly -----------------------------------------------------------
		const quitIds = await evaluate(
			cdp,
			"window.app.commands.listCommands().filter((c) => /quit|exit/i.test(c.id)).map((c) => c.id)",
		);
		console.log(`quit-ish commands available: ${JSON.stringify(quitIds)}`);
		// The quit tears down the CDP socket mid-call; fire and tolerate the socket dying.
		if (quitIds?.includes('app:quit')) {
			evaluate(cdp, "window.app.commands.executeCommandById('app:quit')").catch(() => {});
		} else {
			evaluate(cdp, 'window.electron?.remote?.app?.quit()').catch(() => {});
		}
		await Promise.race([child.exited, sleep(10000)]);
		console.log(child.alive ? 'in-app quit did not exit the process' : 'quit cleanly in-app');
	} finally {
		cdp?.close();
		await killChild(child);
	}
}

main().then(
	() => console.log('spike OK'),
	(e) => {
		console.error(String(e?.stack ?? e));
		process.exit(1);
	},
);
