#!/usr/bin/env node
// visual-harness/declarative-spike.mjs — SC-131 declarative-settings SPIKE capture.
//
// Answers one question with evidence rather than doc-reading: if DseSettingTab returns a
// non-empty getSettingDefinitions(), does the NATIVE settings search in a real Obsidian
// 1.13 find our rows — and specifically, does it find the rows we had to hand-render
// (the six font pickers), or only the ones bound to a native control type?
//
// Same isolated-instance discipline as settings-candidates.mjs: its OWN --user-data-dir
// under /tmp, its OWN CDP port, its OWN vault. Scott's real Obsidian on :1 is never
// touched (and the port check below aborts rather than attach to anything already there).
//
// Usage: node visual-harness/declarative-spike.mjs --out=<dir>
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
const outDir = args.out ?? path.join(dir, 'sc131-declarative');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
			if (Date.now() - t0 > 180000) {
				console.log('warm-up: no update after 180s (offline?) — continuing with bundled app');
				return;
			}
			await sleep(500);
		}
	} finally {
		await killChild(child);
	}
}

// Turn the spike on and re-index. `update()` is the 1.13 "re-read getSettingDefinitions()
// and refresh the search index" call; the ?. keeps this from throwing on an older app,
// where the absence of update() is itself the finding.
const ENABLE = `(() => {
	const tab = window.app.setting.pluginTabs.find((t) => t.id === 'draw-steel-elements');
	if (!tab) throw new Error('no draw-steel-elements plugin tab registered');
	tab.declarativeSpike = true;
	const defs = tab.getSettingDefinitions();
	const hasUpdate = typeof tab.update === 'function';
	if (hasUpdate) tab.update();
	const rows = defs.flatMap((d) => d.items ?? [d]);
	return {
		apiVersion: window.apiVersion ?? null,
		hasUpdate,
		hasGetControlValue: typeof tab.getControlValue === 'function',
		groups: defs.length,
		rows: rows.length,
		controlRows: rows.filter((r) => r.control).length,
		renderRows: rows.filter((r) => r.render).length,
	};
})()`;

// Read a pref straight out of the live PreferenceStore, plus whether the reflected
// attribute actually landed on a mounted element root (i.e. live-apply still works).
const PREF = (key) => `(() => {
	const prefs = window.app.plugins.plugins['draw-steel-elements'].frameworkV2.services.prefs;
	const root = document.querySelector('[data-dse-reduce-motion]');
	return { value: prefs.get(${JSON.stringify(key)}), reflected: root?.getAttribute('data-dse-reduce-motion') ?? null };
})()`;

// Where does the settings window keep its own search field? Probed rather than assumed.
const PROBE = `(() => {
	const inputs = [...document.querySelectorAll('input')].map((el) => ({
		cls: el.className,
		type: el.type,
		placeholder: el.placeholder,
		parent: el.parentElement?.className ?? '',
	}));
	return { inputs, title: document.title };
})()`;

// Focus the settings window's own search field (NOT any field our shell renders), and
// clear whatever is in it. The keystrokes themselves are sent as real CDP input events —
// Obsidian's SearchComponent does not react to a synthetically dispatched 'input'.
const FOCUS_SEARCH = `(() => {
	const el = [...document.querySelectorAll('input[type="search"]')]
		.find((i) => !i.closest('.dse-settings-shell'));
	if (!el) throw new Error('no native settings search input found');
	el.focus();
	el.select();
	return { placeholder: el.placeholder, parent: el.parentElement?.className ?? '' };
})()`;

// What did the native search actually surface? Results render as their own list, so read
// each hit WITH the breadcrumb that says which tab it came from.
const HITS = `(() => {
	const rows = [...document.querySelectorAll('.setting-item')]
		.filter((el) => el.querySelector('.setting-item-name'))
		.map((el) => ({
			name: el.querySelector('.setting-item-name')?.textContent.trim() ?? '',
			crumb: el.querySelector('.setting-item-description, .search-result-file-title, .setting-search-result-tab')?.textContent.trim() ?? '',
		}));
	const tabs = [...document.querySelectorAll('.vertical-tab-nav-item.is-active')].map((t) => t.textContent.trim());
	return {
		count: rows.length,
		activeTab: tabs.join(','),
		resultsRoot: !!document.querySelector('.settings-search-results, .setting-search-results'),
		names: rows.slice(0, 45).map((r) => r.name),
	};
})()`;

const MEASURE = `(() => {
	const content = document.querySelector('.vertical-tab-content, .settings-search-results, .modal-content');
	if (!content) return null;
	const r = content.getBoundingClientRect();
	return { x: r.x, y: r.y, width: r.width, scrollHeight: content.scrollHeight };
})()`;

async function shoot(scdp, file, label) {
	// The isolated instance nags about its out-of-date INSTALLER (the app package itself
	// self-updated fine — see the asar line above); that popover would sit over the shot.
	await evaluate(
		scdp,
		`document.querySelectorAll('.notice, .modal-container').forEach((n) => n.remove())`,
	);
	const m = await evaluate(scdp, MEASURE);
	if (!m) throw new Error(`${label}: nothing to measure`);
	const wanted = Math.min(Math.ceil(m.scrollHeight + m.y + 40), 8000);
	await scdp.call('Emulation.setDeviceMetricsOverride', {
		width: 1200,
		height: Math.max(wanted, 700),
		deviceScaleFactor: 0,
		mobile: false,
	});
	await sleep(600);
	const m2 = (await evaluate(scdp, MEASURE)) ?? m;
	const bytes = await screenshot(scdp, file, {
		x: m2.x,
		y: m2.y,
		width: m2.width,
		height: Math.ceil(m2.scrollHeight),
	});
	await scdp.call('Emulation.setDeviceMetricsOverride', {
		width: 1200,
		height: 1000,
		deviceScaleFactor: 0,
		mobile: false,
	});
	await sleep(300);
	console.log(`  ok ${path.basename(file)} — ${label} (${bytes} bytes)`);
	return bytes;
}

async function main() {
	fs.mkdirSync(outDir, { recursive: true });
	if (await jsonList()) throw new Error(`port ${PORT} already serving CDP — aborting`);
	seedUdd();
	await warmUpUpdate();
	seedUdd();
	const asar = fs.readdirSync(udd).filter((f) => /^obsidian-.*\.asar$/.test(f));
	console.log(`isolated app package: ${asar.join(', ') || '(bundled installer app)'}`);
	const child = spawnObsidian();
	let cdp;
	let scdp;
	const report = { asar };
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
		report.apiVersion = await evaluate(cdp, `window.apiVersion`);
		console.log(`obsidian apiVersion = ${report.apiVersion}`);
		await evaluate(
			cdp,
			`window.app.plugins.plugins['draw-steel-elements'].frameworkV2.services.theme.setActive('steel')`,
		);
		await evaluate(cdp, `window.app.changeTheme('obsidian')`);

		report.enable = await evaluate(cdp, ENABLE);
		console.log('  spike enabled:', JSON.stringify(report.enable));

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
		await waitFor(scdp, `!!document.querySelector('.setting-item')`, {
			what: 'settings content in the popout',
		});
		await scdp.call('Emulation.setDeviceMetricsOverride', {
			width: 1200,
			height: 1000,
			deviceScaleFactor: 0,
			mobile: false,
		});
		await sleep(800);

		report.probe = await evaluate(scdp, PROBE);
		console.log('  inputs in settings window:', JSON.stringify(report.probe.inputs));

		// 1. The tab itself, rendered by Obsidian from our definitions.
		report.tabHits = await evaluate(scdp, HITS);
		await shoot(scdp, path.join(outDir, 'declarative-tab.png'), 'DSE tab rendered from definitions');

		// 1b. Does a NATIVE control actually write through to the PreferenceStore (via the
		// getControlValue/setControlValue overrides) and still fire live-apply? Click the
		// natively-rendered "Reduce motion" toggle in the popout and read the store back
		// from the main window.
		const before = await evaluate(cdp, PREF('reduceMotion'));
		await evaluate(scdp, `(() => {
			const row = [...document.querySelectorAll('.setting-item')]
				.find((el) => el.querySelector('.setting-item-name')?.textContent.trim() === 'Reduce motion');
			if (!row) throw new Error('no natively-rendered "Reduce motion" row');
			const toggle = row.querySelector('.checkbox-container');
			if (!toggle) throw new Error('"Reduce motion" row has no native toggle — it did not bind');
			toggle.click();
			return true;
		})()`);
		await sleep(600);
		const after = await evaluate(cdp, PREF('reduceMotion'));
		report.liveApply = { before, after, wroteThrough: before.value !== after.value };
		console.log('  native control write-through:', JSON.stringify(report.liveApply));
		// Put it back so the search shots show defaults.
		await evaluate(cdp, `window.app.plugins.plugins['draw-steel-elements'].frameworkV2.services.prefs.set('reduceMotion', ${JSON.stringify(before.value)})`);
		await sleep(400);

		// 2/3. The NATIVE search, driven from the settings window's own field.
		for (const query of ['font', 'density']) {
			try {
				const field = await evaluate(scdp, FOCUS_SEARCH);
				// Real keystrokes: select-all + type, so Obsidian's own listeners fire.
				await scdp.call('Input.dispatchKeyEvent', {
					type: 'keyDown',
					key: 'a',
					code: 'KeyA',
					modifiers: 2,
					windowsVirtualKeyCode: 65,
				});
				await scdp.call('Input.dispatchKeyEvent', {
					type: 'keyUp',
					key: 'a',
					code: 'KeyA',
					modifiers: 2,
					windowsVirtualKeyCode: 65,
				});
				await scdp.call('Input.insertText', { text: query });
				await sleep(1200);
				const hits = await evaluate(scdp, HITS);
				report[`search_${query}`] = { field, hits };
				console.log(`  native search "${query}" →`, JSON.stringify(hits));
				await shoot(scdp, path.join(outDir, `declarative-search-${query}.png`), `native search "${query}"`);
			} catch (error) {
				report[`search_${query}`] = { error: String(error.message ?? error) };
				console.log(`  native search "${query}" FAILED: ${error.message}`);
			}
		}
	} finally {
		fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
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
	console.log(`\ndone → ${outDir}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
