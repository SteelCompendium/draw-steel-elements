#!/usr/bin/env node
// visual-harness/settings-candidates.mjs — SC-131 decision-pack capture.
//
// Shoots the plugin's settings tab in a REAL Obsidian, once per navigation-shell render
// mode, at identical content, and reports each one's true scroll height. That height
// number is the whole point of the ticket ("the single settings view is absolutely
// massive"), so it is measured, not eyeballed.
//
// Mechanics are the SC-112 Task 8 / SC-121 D-8 pattern that `obsidian-camera.mjs`'s
// "step 3f" already uses: Obsidian opens Settings as a POPOUT WINDOW (its own CDP page
// target, url about:blank, title "Settings - <vault> - …"), so `app.setting.*` and the
// DseSettingTab instance are driven from the MAIN target while all DOM measurement and
// the screenshot happen over a SECOND CDP connection to the popout. The helper block
// below is a deliberate copy of that camera's CDP scaffolding rather than an import —
// obsidian-camera.mjs is a self-executing script with no exports, and this file is
// SC-131 scratch that gets deleted alongside the losing render modes.
//
// This script is NOT part of `npm run obsidian-shots` and adds nothing to the freeze or
// parity baselines: its output goes to --out (outside visual-harness/shots/ by default).
//
// Usage: node visual-harness/settings-candidates.mjs --out=<dir>
// Env:   same knobs as obsidian-camera.mjs (DSE_CAMERA_PORT/DISPLAY/BIN/TMP).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const vaultPath = path.join(repo, 'demo-vault');

const args = Object.fromEntries(
	process.argv
		.slice(2)
		.filter((a) => a.startsWith('--'))
		.map((a) => {
			const [k, v] = a.replace(/^--/, '').split('=');
			return [k, v ?? '1'];
		}),
);

const PORT = Number(process.env.DSE_CAMERA_PORT ?? 9224);
const DISPLAY = process.env.DSE_CAMERA_DISPLAY ?? ':1';
const BIN = process.env.DSE_CAMERA_BIN ?? '/usr/bin/obsidian';
const tmpRoot = process.env.DSE_CAMERA_TMP ?? '/tmp/claude-1000/dse-obsidian-camera';
const udd = path.join(tmpRoot, 'obsidian-sc131-udd');
const VAULT_ID = 'dsesc131settings';
const outDir = args.out ?? path.join(dir, 'sc131-evidence');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// —— CDP scaffolding (copied from obsidian-camera.mjs; see header) ——
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
		captureBeyondViewport: true,
		...(clip ? { clip: { ...clip, scale: 1 } } : {}),
	});
	fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
	return fs.statSync(file).size;
}

function seedUdd() {
	fs.mkdirSync(udd, { recursive: true });
	fs.writeFileSync(
		path.join(udd, 'obsidian.json'),
		JSON.stringify({ vaults: { [VAULT_ID]: { path: vaultPath, ts: Date.now(), open: true } } }),
	);
	fs.writeFileSync(
		path.join(udd, `${VAULT_ID}.json`),
		JSON.stringify({ x: 0, y: 0, width: 1440, height: 1100, isMaximized: false, devTools: false, zoom: 0 }),
	);
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
	child.kill('SIGTERM');
	await Promise.race([child.exited, sleep(5000)]);
	if (child.alive) child.kill('SIGKILL');
}

const hasUpdatedAsar = () =>
	fs.existsSync(udd) && fs.readdirSync(udd).some((f) => /^obsidian-.*\.asar$/.test(f));

async function warmUpUpdate() {
	if (hasUpdatedAsar()) return;
	console.log('no updated app asar in udd — warm-up launch to let Obsidian self-update…');
	const child = spawnObsidian();
	try {
		const t0 = Date.now();
		while (!hasUpdatedAsar()) {
			if (!child.alive) throw new Error('warm-up obsidian exited before update completed');
			if (Date.now() - t0 > 120000) {
				console.log('warm-up: no update after 120s (offline?) — continuing with bundled app');
				return;
			}
			await sleep(500);
		}
	} finally {
		await killChild(child);
	}
}

// —— the SC-131 shots ——
// `after` runs in the POPOUT realm right before measuring/shooting (candidate C's
// search-in-action shot types a real query into the real field and lets the real input
// listener rebuild the body).
const SHOTS = [
	{ out: 'settings-current', mode: 'off', title: 'CURRENT — one scroll page' },
	{ out: 'settings-candidate-a-tabs', mode: 'tabs', title: 'A — tab bar' },
	{ out: 'settings-candidate-b-sections', mode: 'sections', title: 'B — collapsible sections' },
	{
		out: 'settings-candidate-b-expanded',
		mode: 'sections',
		title: 'B — one section expanded',
		after: `(() => {
			const d = document.querySelector('details[data-section-id="typography"]');
			d.open = true;
			d.dispatchEvent(new Event('toggle'));
		})()`,
	},
	{ out: 'settings-candidate-c-search', mode: 'search', title: 'C — tabs + search (empty query)' },
	{
		out: 'settings-candidate-c-typography',
		mode: 'search',
		title: 'C — the Typography tab',
		after: `(() => {
			[...document.querySelectorAll('.dse-settings-nav__tab')]
				.find((t) => t.textContent === 'Typography')
				.click();
		})()`,
	},
	{
		out: 'settings-candidate-c-search-active',
		mode: 'search',
		title: 'C — search in action ("font")',
		after: `(() => {
			const input = document.querySelector('.dse-settings-search__input');
			input.focus();
			input.value = 'font';
			input.dispatchEvent(new Event('input'));
		})()`,
	},
];

const SET_MODE = (mode) => `(() => {
	const tab = window.app.setting.pluginTabs.find((t) => t.id === 'draw-steel-elements');
	if (!tab) throw new Error('no draw-steel-elements plugin tab registered');
	tab.navMode = ${JSON.stringify(mode)};
	tab.display();
	return tab.navMode;
})()`;

// The settings pane's own scroller. Its scrollHeight IS "how tall is this page".
const MEASURE = `(() => {
	const content = document.querySelector('.vertical-tab-content');
	content.scrollTop = 0;
	const r = content.getBoundingClientRect();
	return { x: r.x, y: r.y, width: r.width, scrollHeight: content.scrollHeight, clientHeight: content.clientHeight };
})()`;

async function main() {
	fs.mkdirSync(outDir, { recursive: true });
	if (await jsonList()) throw new Error(`port ${PORT} already serving CDP — aborting`);
	seedUdd();
	await warmUpUpdate();
	seedUdd();
	const child = spawnObsidian();
	let cdp;
	let scdp;
	const results = [];
	try {
		let target = null;
		const t0 = Date.now();
		while (!target) {
			if (Date.now() - t0 > 60000) throw new Error('no obsidian page target within 60s');
			target = ((await jsonList()) ?? []).find((t) => t.type === 'page' && t.url?.startsWith('app://obsidian.md'));
			if (!target) await sleep(300);
		}
		cdp = await Cdp.connect(target.webSocketDebuggerUrl);
		await waitFor(cdp, `!!window.app?.plugins?.plugins?.['draw-steel-elements']`, {
			what: 'the DSE plugin to finish loading',
		});
		await evaluate(
			cdp,
			`window.app.plugins.plugins['draw-steel-elements'].frameworkV2.services.theme.setActive('steel')`,
		);
		await evaluate(cdp, `window.app.changeTheme('obsidian')`); // dark chrome
		await evaluate(cdp, `(() => { window.app.setting.open(); window.app.setting.openTabById('draw-steel-elements'); })()`);

		let settingsTarget = null;
		const t1 = Date.now();
		while (!settingsTarget) {
			if (Date.now() - t1 > 20000) throw new Error('no Settings popout target within 20s');
			settingsTarget = ((await jsonList()) ?? []).find(
				(t) => t.type === 'page' && /^Settings /.test(t.title ?? ''),
			);
			if (!settingsTarget) await sleep(250);
		}
		scdp = await Cdp.connect(settingsTarget.webSocketDebuggerUrl);
		await waitFor(scdp, `!!document.querySelector('.vertical-tab-content .setting-item')`, {
			what: 'the DSE settings tab content in the popout',
		});
		// A wide, tall window so the tab bar lays out the way it would in a maximised
		// settings window rather than wrapping into an artificial number of rows.
		await scdp.call('Emulation.setDeviceMetricsOverride', {
			width: 1200,
			height: 1000,
			deviceScaleFactor: 0,
			mobile: false,
		});
		await sleep(500);

		for (const shot of SHOTS) {
			await evaluate(cdp, SET_MODE(shot.mode));
			await sleep(500);
			if (shot.after) {
				await evaluate(scdp, shot.after);
				await sleep(500);
			}
			await evaluate(scdp, `document.querySelectorAll('.notice').forEach((n) => n.remove())`);
			const m = await evaluate(scdp, MEASURE);
			// Grow the emulated viewport so the whole page is in one frame, then re-measure
			// (a taller viewport can re-wrap the tab bar and change the height slightly).
			const wanted = Math.min(Math.ceil(m.scrollHeight + m.y + 40), 8000);
			await scdp.call('Emulation.setDeviceMetricsOverride', {
				width: 1200,
				height: Math.max(wanted, 700),
				deviceScaleFactor: 0,
				mobile: false,
			});
			await sleep(500);
			const m2 = await evaluate(scdp, MEASURE);
			const file = path.join(outDir, `${shot.out}.png`);
			const bytes = await screenshot(scdp, file, {
				x: m2.x,
				y: m2.y,
				width: m2.width,
				height: Math.ceil(m2.scrollHeight),
			});
			results.push({ ...shot, after: undefined, scrollHeight: Math.round(m2.scrollHeight), bytes, file });
			console.log(
				`  ok ${shot.out}.png — mode=${shot.mode} scrollHeight=${Math.round(m2.scrollHeight)}px (${bytes} bytes)`,
			);
			// Back to the base viewport before the next mode so every measurement starts
			// from the same layout.
			await scdp.call('Emulation.setDeviceMetricsOverride', {
				width: 1200,
				height: 1000,
				deviceScaleFactor: 0,
				mobile: false,
			});
			await sleep(300);
		}
		fs.writeFileSync(path.join(outDir, 'heights.json'), `${JSON.stringify(results, null, 2)}\n`);
	} finally {
		try {
			await scdp?.call('Emulation.clearDeviceMetricsOverride');
		} catch {
			/* popout may already be gone */
		}
		scdp?.close();
		await evaluate(cdp, 'window.app.setting.close()').catch(() => {});
		cdp?.close();
		await killChild(child);
	}
	console.log(`\n${results.length}/${SHOTS.length} captured → ${outDir}`);
	if (results.length !== SHOTS.length) process.exit(1);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
