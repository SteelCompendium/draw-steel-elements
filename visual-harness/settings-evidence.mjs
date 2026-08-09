#!/usr/bin/env node
// visual-harness/settings-evidence.mjs — SC-131 settings evidence capture.
//
// Shoots the settings tab in a REAL Obsidian 1.13 now that it is rendered from
// `getSettingDefinitions()` rather than a hand-built shell: the D-pages index, a section
// page with its live preview, the nested Advanced page, a setting changed WHILE the
// preview is on screen, and the native settings search finding our rows.
//
// Isolated-instance discipline (inherited from the SC-121 D-8 / SC-112 Task 8 camera
// pattern): its OWN --user-data-dir under /tmp, its OWN CDP port, its OWN vault. A real
// Obsidian running on the same display is never touched, and the port check in main()
// aborts rather than attach to anything already listening there.
//
// Obsidian opens Settings as a POPOUT WINDOW (its own CDP page target, title
// "Settings - <vault> - …"), so `app.setting.*` and the DseSettingTab instance are driven
// from the MAIN target while all DOM work and the screenshots happen over a SECOND CDP
// connection to the popout.
//
// Not part of `npm run obsidian-shots`; adds nothing to the freeze or parity baselines.
//
// Usage: node visual-harness/settings-evidence.mjs --out=<dir> [--probe] [--theme=light]
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
const OBSIDIAN_THEME = args.theme === 'light' ? 'moonstone' : 'obsidian';
const suffix = args.theme === 'light' ? '-light' : '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (value) => JSON.stringify(value);

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

// —— expressions evaluated inside Obsidian ——

/** The definition tree the tab produces, straight from the live plugin. */
const REPORT = `(() => {
	const tab = window.app.setting.pluginTabs.find((t) => t.id === 'draw-steel-elements');
	if (!tab) throw new Error('no draw-steel-elements plugin tab registered');
	const defs = tab.getSettingDefinitions();
	const rowsOf = (items) => (items || []).flatMap((i) =>
		i && (i.type === 'group' || i.type === 'page') ? rowsOf(i.items) : [i]);
	const rows = rowsOf(defs).filter(Boolean);
	return {
		pages: defs.filter((d) => d.type === 'page').map((d) => d.name),
		rows: rows.length,
		named: rows.filter((r) => r.name).length,
		controlRows: rows.filter((r) => r.control).length,
		renderRows: rows.filter((r) => r.name && r.render).length,
		actionRows: rows.filter((r) => r.action).length,
		hasDisplay: Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(tab), 'display'),
	};
})()`;

/** The rendered structure of a page — so the layout CSS is written against obsidian's
 *  real DOM rather than a guess at it. */
const PROBE_DOM = `(() => {
	const skeleton = (el, depth) => {
		if (!el || depth > 3) return null;
		return {
			tag: el.tagName.toLowerCase(),
			cls: el.className,
			children: [...el.children].slice(0, 5).map((c) => skeleton(c, depth + 1)).filter(Boolean),
		};
	};
	const page = document.querySelector('.dse-settings-page');
	const scroller = document.querySelector('.vertical-tab-content');
	return {
		found: !!page,
		parentCls: page && page.parentElement ? page.parentElement.className : null,
		scrollerCls: scroller ? scroller.className : null,
		sameNode: !!page && !!scroller && page.parentElement === scroller,
		tree: skeleton(page, 0),
	};
})()`;

/** Click the navigable entry for a page by its visible name. */
const OPEN_PAGE = (name) => `(() => {
	const want = ${q(name)};
	const entry = [...document.querySelectorAll('.setting-item')]
		.find((el) => {
			const n = el.querySelector('.setting-item-name');
			return n && n.textContent.trim() === want;
		});
	if (!entry) throw new Error('no page entry named ' + want);
	const target = entry.querySelector('.setting-item-control button, [role="button"]') || entry;
	target.click();
	return true;
})()`;

/** The settings window's back affordance. */
const BACK = `(() => {
	const back = document.querySelector('.setting-back-button, .modal-setting-back-button, [aria-label="Back"]');
	if (back) { back.click(); return true; }
	return false;
})()`;

/** Is the preview on screen right now, and what is it rendering? */
const PREVIEW_STATE = `(() => {
	const row = document.querySelector('.dse-settings-preview-row');
	const stat = document.querySelector('.dse-settings-preview [data-dse-element="statblock"]');
	const scroller = document.querySelector('.vertical-tab-content');
	const r = row ? row.getBoundingClientRect() : null;
	const s = scroller ? scroller.getBoundingClientRect() : null;
	return {
		hasPreviewRow: !!row,
		hasStatblock: !!stat,
		previewDensity: stat ? stat.getAttribute('data-dse-density') : null,
		position: row ? getComputedStyle(row).position : null,
		// "visible while toggling": the preview's box overlaps the visible scroll viewport.
		onScreen: !!(r && s && r.bottom > s.top && r.top < s.bottom),
		scrollHeight: scroller ? scroller.scrollHeight : null,
		clientHeight: scroller ? scroller.clientHeight : null,
	};
})()`;

/** Drive a native dropdown the way a user does. */
const SET_DROPDOWN = (name, value) => `(() => {
	const want = ${q(name)};
	const row = [...document.querySelectorAll('.setting-item')]
		.find((el) => {
			const n = el.querySelector('.setting-item-name');
			return n && n.textContent.trim() === want;
		});
	if (!row) throw new Error('no row named ' + want);
	const select = row.querySelector('select');
	if (!select) throw new Error('row "' + want + '" has no native dropdown');
	select.value = ${q(value)};
	select.dispatchEvent(new Event('change', { bubbles: true }));
	return select.value;
})()`;

/** Focus the settings window's OWN search field (never one our plugin renders). */
const FOCUS_SEARCH = `(() => {
	const el = [...document.querySelectorAll('input[type="search"]')][0];
	if (!el) throw new Error('no native settings search input found');
	el.focus();
	el.select();
	return { placeholder: el.placeholder };
})()`;

/** Row names on screen, split by pane: the settings SIDEBAR (where global search puts
 *  its results) and the main content pane. */
const HITS = `(() => {
	const text = (root, sel) => [...root.querySelectorAll(sel)]
		.map((n) => n.textContent.trim()).filter(Boolean);
	const nav = document.querySelector('.vertical-tab-header, .settings-sidebar, .modal-sidebar');
	return {
		content: text(document.querySelector('.vertical-tab-content') || document, '.setting-item-name'),
		sidebar: nav ? text(nav, '.vertical-tab-nav-item, .setting-search-result, .tree-item-inner') : [],
	};
})()`;

const MEASURE = `(() => {
	const content = document.querySelector('.vertical-tab-content')
		|| document.querySelector('.modal-content');
	if (!content) return null;
	const r = content.getBoundingClientRect();
	return { x: r.x, y: r.y, width: r.width, scrollHeight: content.scrollHeight };
})()`;

/** Shoot the whole settings window (sidebar included — the page nav IS the evidence). */
async function shoot(scdp, file, label, { full = false } = {}) {
	// The isolated instance nags about its out-of-date INSTALLER (the app package itself
	// self-updated fine); that popover would sit over the shot.
	await evaluate(scdp, `document.querySelectorAll('.notice, .modal-container').forEach((n) => n.remove())`);
	if (full) {
		const m = await evaluate(scdp, MEASURE);
		const wanted = Math.min(Math.ceil((m?.scrollHeight ?? 700) + (m?.y ?? 0) + 40), 8000);
		await scdp.call('Emulation.setDeviceMetricsOverride', {
			width: 1200, height: Math.max(wanted, 700), deviceScaleFactor: 0, mobile: false,
		});
		await sleep(600);
	}
	const res = await scdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
	fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
	if (full) {
		await scdp.call('Emulation.setDeviceMetricsOverride', {
			width: 1200, height: 1000, deviceScaleFactor: 0, mobile: false,
		});
		await sleep(300);
	}
	const bytes = fs.statSync(file).size;
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
	const report = { asar, theme: OBSIDIAN_THEME };
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
		await evaluate(cdp, `window.app.changeTheme(${q(OBSIDIAN_THEME)})`);

		report.definitions = await evaluate(cdp, REPORT);
		console.log('  definitions:', JSON.stringify(report.definitions));

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
		await waitFor(scdp, `!!document.querySelector('.setting-item')`, { what: 'settings content' });
		await scdp.call('Emulation.setDeviceMetricsOverride', {
			width: 1200, height: 1000, deviceScaleFactor: 0, mobile: false,
		});
		await sleep(900);

		// 1. The D-pages index: nine navigable entries where a 6850px scroll page was.
		report.index = await evaluate(scdp, HITS);
		console.log('  index:', JSON.stringify(report.index.content.slice(0, 12)));
		await shoot(scdp, path.join(outDir, `impl-pages-index${suffix}.png`), 'D-pages index');

		// 2. Section pages, each with its live preview on screen.
		for (const page of ['Typography', 'Statblock display']) {
			await evaluate(scdp, OPEN_PAGE(page));
			await sleep(1400);
			if (args.probe) {
				report.dom = await evaluate(scdp, PROBE_DOM);
				console.log('  page DOM:', JSON.stringify(report.dom, null, 1));
			}
			const key = `page_${page.replace(/ /g, '_')}`;
			report[key] = await evaluate(scdp, PREVIEW_STATE);
			console.log(`  ${page}:`, JSON.stringify(report[key]));
			const slug = page.toLowerCase().replace(/ /g, '-');
			await shoot(scdp, path.join(outDir, `impl-page-${slug}${suffix}.png`), `${page} page`);
			await evaluate(scdp, BACK);
			await sleep(800);
		}

		// 3. The nested Advanced page (the SC-112 disclosure's replacement).
		await evaluate(scdp, OPEN_PAGE('Typography'));
		await sleep(1000);
		await evaluate(scdp, OPEN_PAGE('Advanced'));
		await sleep(1000);
		report.advanced = await evaluate(scdp, HITS);
		console.log('  advanced:', JSON.stringify(report.advanced.content));
		await shoot(scdp, path.join(outDir, `impl-page-advanced${suffix}.png`), 'nested Advanced page');
		await evaluate(scdp, BACK);
		await sleep(600);
		await evaluate(scdp, BACK);
		await sleep(600);

		// 4. Change a setting WITH the preview on screen — the requirement this
		//    layout exists to satisfy — and prove the preview reflowed.
		await evaluate(scdp, OPEN_PAGE('Statblock display'));
		await sleep(1400);
		const before = await evaluate(scdp, PREVIEW_STATE);
		await evaluate(scdp, SET_DROPDOWN('Density', 'compact'));
		await sleep(1000);
		const after = await evaluate(scdp, PREVIEW_STATE);
		report.liveApply = {
			before: before.previewDensity,
			after: after.previewDensity,
			previewOnScreen: after.onScreen,
		};
		console.log('  live apply with preview on screen:', JSON.stringify(report.liveApply));
		await shoot(scdp, path.join(outDir, `impl-live-apply-compact${suffix}.png`), 'density changed, preview visible');
		await evaluate(scdp, SET_DROPDOWN('Density', 'comfortable'));
		await sleep(700);
		await evaluate(scdp, BACK);
		await sleep(600);

		// 5. The native settings search, against the shipped implementation.
		for (const query of ['font', 'density']) {
			try {
				await evaluate(scdp, FOCUS_SEARCH);
				await scdp.call('Input.dispatchKeyEvent', {
					type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65,
				});
				await scdp.call('Input.dispatchKeyEvent', {
					type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65,
				});
				await scdp.call('Input.insertText', { text: query });
				await sleep(1300);
				const hits = await evaluate(scdp, HITS);
				report[`search_${query}`] = hits;
				console.log(`  native search "${query}" → sidebar:`, JSON.stringify(hits.sidebar.slice(0, 16)));
				await shoot(scdp, path.join(outDir, `impl-search-${query}${suffix}.png`), `native search "${query}"`);
			} catch (error) {
				report[`search_${query}`] = { error: String(error.message ?? error) };
				console.log(`  native search "${query}" FAILED: ${error.message}`);
			}
		}
	} finally {
		fs.writeFileSync(path.join(outDir, `report${suffix}.json`), `${JSON.stringify(report, null, 2)}\n`);
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
