#!/usr/bin/env node
// SC-184 — ad-hoc evidence camera for the sidebar fix round. NOT part of `npm run
// obsidian-shots`/`docs-shots` and not wired into package.json: a one-off script, run by
// hand, that reuses obsidian-camera.mjs's exact spawn/attach/enable-plugin boilerplate
// (same CDP-over-WebSocket approach, same reasons — see that file's header) to capture five
// scenarios the regular ground-truth sweep doesn't cover:
//   (a) the sidebar's empty state (item 9)
//   (b) 2+ panels stacked, showing headers + separation (item 3)
//   (c) the chrome menu open on a rendered block in a note, showing "Pin to sidebar" (item 2)
//   (d) the chrome menu open on a sidebar-mounted panel, showing "Unpin from sidebar" (item 1)
//   (e) the "note not found" degrade card with its dismiss button (item 7)
// Output goes to visual-harness/shots/ under `sc184-evidence-*.png` names — NOT part of the
// frozen/tracked shot set (new names, never referenced by check-freeze.sh or any manifest),
// so this cannot move any gate. Delete the files after Scott reviews them if you want the
// dir clean; nothing else depends on their presence.
//
// Usage: node visual-harness/sc184-evidence.mjs  (assumes `npm run obsidian-shots` has been
// run at least once in this checkout, so demo-vault/Harness/*.md already exist).
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
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
	const res = await cdp.call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
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
	const res = await cdp.call('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
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
	const child = spawn(BIN, [`--user-data-dir=${udd}`, `--remote-debugging-port=${PORT}`, '--window-size=1440,1100'], {
		env: { ...process.env, DISPLAY },
		stdio: 'ignore',
	});
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

const clearNotices = (cdp) => evaluate(cdp, "document.querySelectorAll('.notice').forEach((n) => n.remove())");
const closeDseSidebarLeaves = (cdp) =>
	evaluate(cdp, "window.app.workspace.getLeavesOfType('dse-sidebar').forEach((l) => l.detach())");

/** Clip to a rect expression, emulating a taller viewport if the rect overflows the window
 *  (verbatim technique from obsidian-camera.mjs's captureClip). */
async function captureClip(cdp, outName, rectExpr, note = '') {
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
			await clearNotices(cdp);
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
				/* socket may already be down */
			}
		}
	}
}

/**
 * Discovered live (2026-08-29): `Page.captureScreenshot` with an explicit `clip` region
 * silently drops the synthetic `:hover` state `revealChrome` establishes — a full-window
 * (unclipped) screenshot taken at the exact same instant shows the chrome panel; the
 * `clip`-parameterized call of the SAME state does not (verified: unclipped shot has the
 * panel painted with `chromeOpacity` read back as "1" immediately before either call).
 * Likely a CDP/Electron quirk in how a clipped capture re-derives its region internally.
 * Workaround: take the FULL WINDOW screenshot (no clip) and crop it afterward with PIL —
 * decoupled from whatever CDP does internally for a clipped capture. Python3 + Pillow are
 * present on this workstation (already relied on for ad-hoc image work elsewhere in this
 * session); this script is a one-off evidence generator, not part of any gated pipeline,
 * so shelling out here carries none of the portability weight a real harness script would.
 */
async function captureHoverClip(cdp, outName, rectExpr, note = '') {
	const rect = await evaluate(cdp, rectExpr);
	const dpr = await evaluate(cdp, 'window.devicePixelRatio');
	const fullPath = path.join(shotsDir, `${outName}--full-tmp.png`);
	await screenshot(cdp, fullPath);
	const outPath = path.join(shotsDir, `${outName}.png`);
	const box = [rect.x * dpr, rect.y * dpr, (rect.x + rect.width) * dpr, (rect.y + rect.height) * dpr];
	execFileSync('python3', [
		'-c',
		'from PIL import Image; import sys; ' +
			'img = Image.open(sys.argv[1]); ' +
			'img.crop(tuple(float(a) for a in sys.argv[3:7])).save(sys.argv[2])',
		fullPath,
		outPath,
		...box.map(String),
	]);
	fs.rmSync(fullPath);
	const bytes = fs.statSync(outPath).size;
	console.log(
		`  ok ${outName}.png (${bytes} bytes, clip ${Math.round(rect.width)}x${Math.round(rect.height)}, cropped post-capture)${note ? ' — ' + note : ''}`,
	);
}

const LEAF_RECT = (elSel) => `(() => {
	const leafEl = ${elSel}.closest('.workspace-leaf');
	const r = leafEl.getBoundingClientRect();
	return { x: r.x, y: r.y, width: r.width, height: r.height, vh: window.innerHeight, vw: window.innerWidth };
})()`;

/** The chrome panel is `position: absolute; bottom: calc(100% + border-top)` — it renders
 *  ABOVE the element's own top edge (styles-source.css, "Element chrome"), so a plain
 *  EL_RECT clip crops it off entirely once revealed. Pads the top by `padTop` px (clamped
 *  at 0) to include it. */
const EL_RECT_PADDED = (elSel, padTop = 56) => `(() => {
	const r = ${elSel}.getBoundingClientRect();
	const pad = Math.min(${padTop}, r.y);
	return { x: r.x, y: r.y - pad, width: r.width, height: r.height + pad, vh: window.innerHeight, vw: window.innerWidth };
})()`;

/** Reveals the standard chrome menu with a REAL synthesized pointer hover — CDP
 *  `Input.dispatchMouseEvent`, the same primitive Playwright's own `.hover()` uses under
 *  the hood (the browser harness's `chrome-hover-*` fixtures already prove this technique
 *  against this exact CSS: `[data-dse-chrome]:hover .dse-chrome` reveal rule,
 *  styles-source.css "Element chrome (SC-169)"). Moves the pointer to the CENTER of
 *  `scopeSel` (the element root carrying `[data-dse-chrome]`) — hovering anywhere inside
 *  it reveals the panel, matching how a real user discovers it. */
async function revealChrome(cdp, scopeSel) {
	const center = await evaluate(
		cdp,
		`(() => {
			const el = document.querySelector('${scopeSel}');
			if (!el) return null;
			const r = el.getBoundingClientRect();
			return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
		})()`,
	);
	if (!center) throw new Error(`revealChrome: no element for ${scopeSel}`);
	await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x, y: center.y });
	await sleep(200); // CSS transition/opacity settle
}

async function main() {
	fs.mkdirSync(shotsDir, { recursive: true });
	if (await jsonList()) throw new Error(`port ${PORT} already serving CDP — another instance owns it; aborting`);
	seedUdd();
	const child = spawnObsidian();
	console.log(`spawned obsidian pid=${child.pid} (udd=${udd}, port=${PORT}, display=${DISPLAY})`);

	let cdp;
	try {
		const t0 = Date.now();
		let target = null;
		while (!target) {
			if (!child.alive) throw new Error('obsidian exited before CDP came up');
			if (Date.now() - t0 > 30000) throw new Error('no app://obsidian.md page target within 30s');
			target = ((await jsonList()) ?? []).find((t) => t.type === 'page' && t.url.startsWith('app://obsidian.md'));
			if (!target) await sleep(250);
		}
		cdp = await Cdp.connect(target.webSocketDebuggerUrl);
		await waitFor(cdp, 'window.app?.workspace?.layoutReady === true', { what: 'layoutReady' });

		let loaded = await evaluate(cdp, "!!window.app.plugins?.plugins?.['draw-steel-elements']");
		if (!loaded) {
			await evaluate(
				cdp,
				`(async () => {
					await window.app.plugins.setEnable(true);
					await window.app.plugins.enablePluginAndSave('draw-steel-elements');
				})()`,
			);
			await evaluate(cdp, "document.querySelectorAll('.modal-container .modal-close-button').forEach((b) => b.click())");
		}
		const hasFramework = await evaluate(cdp, "!!window.app.plugins.plugins['draw-steel-elements']?.frameworkV2");
		if (!hasFramework) throw new Error('BLOCKED: plugin not loadable via APIs');
		console.log('plugin loaded, frameworkV2 present');

		await evaluate(cdp, "window.app.changeTheme('obsidian')"); // dark chrome, matches the rest of the evidence set
		await waitFor(cdp, "document.body.classList.contains('theme-dark')", { what: 'theme-dark' });
		await evaluate(
			cdp,
			"window.app.plugins.plugins['draw-steel-elements'].frameworkV2.services.theme.setActive('steel')",
		);

		// ---------------------------------------------------------------- (a) empty state
		await closeDseSidebarLeaves(cdp);
		await evaluate(cdp, "window.app.commands.executeCommandById('draw-steel-elements:open-dse-sidebar')");
		await waitFor(cdp, "!!document.querySelector('.dse-sidebar__empty')", { what: 'empty state rendered' });
		await sleep(300);
		await clearNotices(cdp);
		await captureClip(
			cdp,
			'sc184-evidence-empty-state',
			LEAF_RECT("document.querySelector('.dse-sidebar__empty')"),
			'empty sidebar leaf, first open',
		);

		// ---------------------------------------------------- (b) 2+ panels, headers + sep
		// Two SMALL elements (counter, surges) — both fit on-screen at once at leaf width, so
		// the screenshot actually shows both headers + the separator between them, unlike a
		// tall tracker that would push the second panel below the fold.
		await closeDseSidebarLeaves(cdp);
		const pinViaGenericCommand = async (id, alias, element) => {
			await evaluate(
				cdp,
				`(async () => {
					await window.app.workspace.openLinkText('Harness/${id}', '', false);
					const leaf = window.app.workspace.getMostRecentLeaf();
					await leaf.setViewState({ type: 'markdown', state: { file: 'Harness/${id}.md', mode: 'source' }, active: true });
				})()`,
			);
			await waitFor(cdp, `window.app.workspace.getMostRecentLeaf()?.view?.file?.path === 'Harness/${id}.md'`, {
				what: `Harness/${id}.md open`,
			});
			const exec = await evaluate(
				cdp,
				`(() => {
					try {
						const editor = window.app.workspace.getMostRecentLeaf().view.editor;
						const fence = String.fromCharCode(96,96,96) + '${alias}';
						const lines = editor.getValue().split('\\n');
						const fenceLine = lines.findIndex((l) => l.trim() === fence);
						if (fenceLine === -1) return { ok: false, error: 'no ${alias} fence found' };
						editor.setCursor({ line: fenceLine + 1, ch: 0 });
						return { ok: window.app.commands.executeCommandById('draw-steel-elements:send-block-to-sidebar') };
					} catch (e) { return { ok: false, error: String(e) }; }
				})()`,
			);
			if (!exec.ok) throw new Error(`send-block-to-sidebar (${id}) failed: ${exec.error}`);
			await waitFor(cdp, `!!document.querySelector('.dse-sidebar__panel [data-dse-element="${element}"]')`, {
				what: `${element} panel mounted`,
			});
		};
		await pinViaGenericCommand('counter', 'ds-ct', 'counter');
		await pinViaGenericCommand('surges', 'ds-surges', 'surges');
		await sleep(500);
		await clearNotices(cdp);
		await captureClip(
			cdp,
			'sc184-evidence-multi-panel',
			LEAF_RECT(`document.querySelector('.dse-sidebar__panel [data-dse-element="counter"]')`),
			'2 panels stacked: counter + surges, headers + separator visible',
		);

		// ------------------------------------------- (d) chrome menu "Unpin" in the sidebar
		// Reveal the SECOND panel's (surges) chrome — proves the menu on a non-first panel
		// too, not just whichever one happened to mount first. Uses captureHoverClip (see its
		// doc): a CDP clipped capture drops this synthetic hover state; an unclipped shot,
		// cropped afterward, does not.
		await revealChrome(cdp, '.dse-sidebar__panel [data-dse-element="surges"]');
		await sleep(200);
		await captureHoverClip(
			cdp,
			'sc184-evidence-chrome-unpin',
			LEAF_RECT(`document.querySelector('.dse-sidebar__panel [data-dse-element="counter"]')`),
			'chrome menu open on the sidebar-mounted surges panel — "Unpin from sidebar"',
		);

		// -------------------------------------------------- (e) note-not-found + dismiss
		// Directly construct a panel for a note that was never created — the fastest,
		// least-invasive way to reach the degrade path deterministically (equivalent to
		// pinning a note and then deleting it, without the extra vault-delete choreography).
		await closeDseSidebarLeaves(cdp);
		await evaluate(
			cdp,
			`(async () => {
				const services = window.app.plugins.plugins['draw-steel-elements'];
				const leaf = window.app.workspace.getRightLeaf(false);
				await leaf.setViewState({ type: 'dse-sidebar', active: true });
				await window.app.workspace.revealLeaf(leaf);
				leaf.view.addPanel({ filePath: 'Harness/does-not-exist.md', alias: 'ds-initiative', anchorId: null });
			})()`,
		);
		await waitFor(cdp, `!!document.querySelector('.dse-sidebar__panel[data-dse-sidebar-unavailable]')`, {
			what: 'note-not-found degrade card rendered',
		});
		await sleep(300);
		await clearNotices(cdp);
		await captureClip(
			cdp,
			'sc184-evidence-note-not-found',
			LEAF_RECT(`document.querySelector('.dse-sidebar__panel[data-dse-sidebar-unavailable]')`),
			'"Note not found" degrade card with its header + dismiss button',
		);

		// --------------------------------------------- (c) "Pin to sidebar" in a note
		// A small element (counter, same one used for (b)) so the whole card + open chrome
		// menu fits in one screenshot with no viewport emulation needed.
		await closeDseSidebarLeaves(cdp);
		await evaluate(
			cdp,
			`(async () => {
				await window.app.workspace.openLinkText('Harness/counter', '', false);
				const leaf = window.app.workspace.getMostRecentLeaf();
				await leaf.setViewState({ type: 'markdown', state: { file: 'Harness/counter.md', mode: 'preview' }, active: true });
			})()`,
		);
		const elSel = `document.querySelector('.workspace-leaf.mod-active [data-dse-element="counter"]')`;
		await waitFor(cdp, `!!${elSel}`, { what: 'counter rendered in reading mode' });
		await sleep(500);
		await revealChrome(cdp, `.workspace-leaf.mod-active [data-dse-element="counter"]`);
		await sleep(200);
		await captureHoverClip(cdp, 'sc184-evidence-chrome-pin', EL_RECT_PADDED(elSel), 'chrome menu open in reading mode — "Pin to sidebar"');

		console.log('done');
	} finally {
		if (cdp) cdp.close();
		await killChild(child);
	}
}

main().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
