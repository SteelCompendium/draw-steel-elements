// SC-408 e2e driver: the ONLY module specs import (plus knownBug). Every action is real input -
// wdio element.click() / browser.keys() -> chromedriver -> CDP Input.* - never a synthetic
// el.click(), because the bug classes this layer exists for (SC-377's click shield, B7's
// blur-swallowed click) are invisible to synthetic events.
//
//   import { dse, knownBug } from '../../driver/dse';
//
// Importing this module registers the per-test machinery (see session.ts): recorder marks,
// the post-test invariants, failure artifacts and result tallying.
import { $, $$, browser, expect } from '@wdio/globals';
import * as yaml from 'js-yaml';
import type { ChainablePromiseElement } from 'webdriverio';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { closeEverything, closeModals, waitWriteIdle } from './cleanup';
import { E2E } from './env';
import { ev, REGISTRY, waitFor } from './page';
import { eventsSince, mark } from './recorders';
import { fencesOf } from './invariants';
import { readFixture, recordDrive, state } from './state';
import './session';

export { knownBug } from './knownBug';

type El = ChainablePromiseElement;

/**
 * How a spec names a control. A bare string is a stable `data-dse-control` id (stamped on the
 * kit factories; ids never depend on copy or classes) - the form every driven control uses,
 * because the exercised-set gate keys on ids. `{ css }` / `{ name }` remain for READING
 * incidental nodes (a label's text, a status badge); driving one is flagged by the gate.
 */
export type ControlRef = string | { css: string } | { name: string };

export interface ControlOptions {
	/** The n-th (0-based) match, for ids stamped on repeated nodes (`recov.marker`). */
	nth?: number;
}

export interface Scope {
	/** The scope's root element (block root, or the modal's dialog). */
	readonly root: El;
	/** A control inside this scope. Coverage is recorded when it is driven (click/type/press). */
	control(ref: ControlRef, opts?: ControlOptions): El;
}

/**
 * Obsidian's own chrome has no `data-dse-control`; the manifest still names these host controls
 * by id and the driver resolves them from Obsidian's selectors. (`.modal-header-button` is the
 * 1.14 close X, `.modal-close-button` the older one.) The backdrop is a sibling of the dialog,
 * so host ids always resolve page-wide.
 */
const HOST_CONTROLS: Record<string, string> = {
	'modal.close': '.modal-container .modal-close-button, .modal-container .modal-header-button',
	'modal.backdrop': '.modal-container .modal-bg',
};

const READING = '.workspace-leaf.mod-active .markdown-reading-view';
const controlLabels = new WeakMap<object, string>();

export function selectorOf(ref: ControlRef): string {
	if (typeof ref === 'string') return HOST_CONTROLS[ref] ?? `[data-dse-control="${ref}"]`;
	if ('css' in ref) return ref.css;
	return `[aria-label="${ref.name}"]`;
}
const labelOfRef = (ref: ControlRef): string =>
	typeof ref === 'string' ? ref : 'css' in ref ? `css:${ref.css}` : `name:${ref.name}`;

function pick(from: { $(sel: string): El; $$(sel: string): unknown }, ref: ControlRef, opts?: ControlOptions): El {
	const sel = selectorOf(ref);
	const el = opts?.nth !== undefined ? ((from.$$(sel) as El[])[opts.nth]) : from.$(sel);
	controlLabels.set(el, labelOfRef(ref));
	return el;
}

function scopeOf(root: El): Scope {
	return {
		root,
		control(ref, opts) {
			// Host ids (Obsidian's own X / backdrop) live outside the dialog element.
			if (typeof ref === 'string' && HOST_CONTROLS[ref]) return pick({ $: (sel) => $(sel), $$: (sel) => $$(sel) }, ref, opts);
			return pick(root, ref, opts);
		},
	};
}

/** `ds-stamina-bar` / `stamina-bar` / `ds-stamina` all name the same element. */
const ELEMENT_ALIASES: Record<string, string> = { stam: 'stamina-bar', stamina: 'stamina-bar' };
function elementIdOf(lang: string): string {
	const bare = lang.replace(/^ds-/, '');
	return ELEMENT_ALIASES[bare] ?? bare;
}

/** What each modal kind must contain, so `modal('stamina-edit')` cannot match some other modal. */
const MODAL_KINDS: Record<string, string> = {
	'stamina-edit': '.dse-sedit__row',
};

// ------------------------------------------------------------------------- note + blocks

/** Every file of the shipped fixture vault outside `.obsidian`, as { vault path: text }. */
function fixtureFiles(): Record<string, string> {
	const out: Record<string, string> = {};
	const walk = (dir: string): void => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, e.name);
			if (e.isDirectory()) {
				if (e.name !== '.obsidian') walk(full);
			} else out[path.relative(E2E.fixtureVault, full).split(path.sep).join('/')] = fs.readFileSync(full, 'utf8');
		}
	};
	walk(E2E.fixtureVault);
	return out;
}

/**
 * Put every vault note back to fixture state, through Obsidian's own vault API (so its caches
 * and views see ordinary `modify` events): rewrite changed notes, recreate missing ones, delete
 * strays. Deliberately not wdio-obsidian-service's resetVault, which needs Node >= 20.12.
 */
async function resetFixtures(): Promise<void> {
	await ev(`(async () => {
		const fixtures = ${JSON.stringify(fixtureFiles())};
		for (const [rel, text] of Object.entries(fixtures)) {
			const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
			if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
			const f = app.vault.getAbstractFileByPath(rel);
			if (!f) await app.vault.create(rel, text);
			else if ((await app.vault.read(f)) !== text) await app.vault.modify(f, text);
		}
		for (const f of app.vault.getFiles()) if (!(f.path in fixtures)) await app.vault.delete(f);
	})()`);
}

/**
 * Reset the vault to fixture state, close anything a previous test left behind, open `rel` in
 * Reading view and wait until its DSE blocks are mounted and the plugin is write-idle. Marks
 * the recorders just before the open, so errors while rendering the note are caught too.
 */
async function openNote(rel: string): Promise<void> {
	await closeEverything();
	await resetFixtures();
	state.touched.add(rel);
	state.currentNote = rel;
	state.mark = await mark();
	await ev(`(async () => {
		const leaf = app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: 'markdown', state: { file: ${JSON.stringify(rel)}, mode: 'preview' }, active: true });
		app.workspace.setActiveLeaf(leaf, { focus: true });
	})()`);
	await waitFor(
		`(() => {
			const view = app.workspace.getMostRecentLeaf()?.view;
			if (!view || view.file?.path !== ${JSON.stringify(rel)} || !view.containerEl) return false;
			const roots = Array.from(view.containerEl.querySelectorAll('.markdown-reading-view [data-dse-element]')).filter((r) => r.isConnected && !r.parentElement.closest('[data-dse-element]'));
			const mine = ${REGISTRY}.liveEntries().filter((e) => e.host.sourcePath === ${JSON.stringify(rel)} && e.root.isConnected);
			return roots.length > 0 && mine.length >= roots.length;
		})()`,
		`${rel} to render its blocks in Reading view`,
	);
	await waitWriteIdle();
}

/** `block()` is how a test names the block it edits: record that fence of the open note as the target. */
function declareTarget(elementId: string, n: number): void {
	const rel = state.currentNote;
	if (!rel) return;
	let seen = -1;
	fencesOf(readFixture(rel)).forEach((f, i) => {
		if (elementIdOf(f.lang) !== elementId) return;
		seen++;
		if (seen === n) {
			if (!state.targets.has(rel)) state.targets.set(rel, new Set());
			state.targets.get(rel)!.add(i);
		}
	});
}

/** The n-th (0-based) block of `lang` in the visible Reading view. */
function block(lang: string, n = 0): Scope {
	declareTarget(elementIdOf(lang), n);
	return scopeOf($$(`${READING} [data-dse-element="${elementIdOf(lang)}"]`)[n]);
}

/** The single open DSE modal of `kind`. Fails if none opens, or if more than one is open. */
async function modal(kind: keyof typeof MODAL_KINDS  ): Promise<Scope> {
	const must = MODAL_KINDS[kind];
	if (!must) throw new Error(`unknown modal kind "${kind}" (known: ${Object.keys(MODAL_KINDS).join(', ')})`);
	const css = '.modal-container .dse-modal';
	await browser.waitUntil(async () => (await $$(css).length) > 0, {
		timeout: 8000,
		interval: 40,
		timeoutMsg: `no ${kind} modal opened`,
	});
	const count = await $$(css).length;
	if (count !== 1) throw new Error(`expected exactly one open .dse-modal, found ${count}`);
	const root = $(css);
	if (!(await root.$(must).isExisting())) throw new Error(`the open .dse-modal is not a "${kind}" modal (no ${must})`);
	return scopeOf(root);
}

/** The newest Notice (toast) on screen, as a scope: an older one still fading out can never be
 *  the match. Click controls inside it with `{ stable: true }` - toasts slide in. */
function toast(): Scope {
	return scopeOf($('.notice-container .notice:last-child'));
}

/** Resolve a control reference outside any scope (page-wide). */
function control(ref: ControlRef, opts?: ControlOptions): El {
	return pick({ $: (sel) => $(sel), $$: (sel) => $$(sel) }, ref, opts);
}

// ------------------------------------------------------------------------------ input

const labelOf = (el: El): string => controlLabels.get(el) ?? `selector:${String((el as unknown as { selector: unknown }).selector)}`;

/** --slow=<ms>: outline the target and hold so a human watching a headed run can follow. */
async function beforeAction(el: El): Promise<void> {
	if (!E2E.slowMs) return;
	try {
		const e = await el;
		await browser.execute('arguments[0].style.outline = "2px solid #ff3d9a"; arguments[0].style.outlineOffset = "2px";', e);
		await browser.pause(E2E.slowMs);
		await browser.execute('arguments[0].style.outline = ""; arguments[0].style.outlineOffset = "";', e);
	} catch {
		/* cosmetic only */
	}
}

/** Where on the element a click lands: its centre (default, which is usually a label span),
 *  or `inset` px in from its left edge at mid-height - the control's OWN surface (its padding),
 *  which is where a disabled button's own events (and S1's B7) live. */
export interface ClickOptions {
	cdp?: boolean;
	inset?: number;
	/** Wait until the element's rect has stopped moving (toasts slide in) before pressing. */
	stable?: boolean;
}

/** Wait until `el`'s bounding rect is identical on three consecutive reads (about 100 ms). */
async function waitStable(el: El): Promise<void> {
	const e = await el;
	let last = '';
	let same = 0;
	await browser.waitUntil(
		async () => {
			const now: string = await browser.execute<string, [typeof e]>(
				'const r = arguments[0].getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 10)).join(",");',
				e,
			);
			same = now === last ? same + 1 : 0;
			last = now;
			return same >= 2;
		},
		{ timeout: 3000, interval: 50, timeoutMsg: 'the control never stopped moving' },
	);
}

/** Click through the CDP mouse path (pseudo-elements, odd hit areas). */
async function cdpClick(el: El, opts: ClickOptions): Promise<void> {
	const e = await el;
	const loc = await e.getLocation();
	const size = await e.getSize();
	const x = opts.inset !== undefined ? loc.x + opts.inset : loc.x + size.width / 2;
	const y = loc.y + size.height / 2;
	const base = { x, y, button: 'left', clickCount: 1 };
	await browser.sendCommandAndGetResult('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
	await browser.sendCommandAndGetResult('Input.dispatchMouseEvent', { type: 'mousePressed', buttons: 1, ...base });
	await browser.sendCommandAndGetResult('Input.dispatchMouseEvent', { type: 'mouseReleased', buttons: 0, ...base });
}

/**
 * Real pointer click (wdio element.click: scroll into view, hit-test, press/release).
 * "element click intercepted" is a genuine finding (something covers the control) and is
 * never papered over; only a non-interactable-geometry error falls back to the CDP path.
 * `{ cdp: true }` forces the CDP path; `{ inset }` clicks the control's own edge, not its label.
 */
async function click(el: El, opts: ClickOptions = {}): Promise<void> {
	await el.waitForDisplayed({ timeout: 8000 });
	const enabled = await el.isEnabled();
	await beforeAction(el);
	if (opts.stable) await waitStable(el);
	if (opts.cdp) await cdpClick(el, opts);
	else {
		try {
			if (opts.inset !== undefined) {
				const size = await el.getSize();
				await el.click({ x: Math.round(opts.inset - size.width / 2), y: 0 });
			} else await el.click();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (/intercepted/i.test(msg) || !/not interactable|out of bounds/i.test(msg)) throw e;
			await cdpClick(el, opts);
		}
	}
	// Recorded only once the click really happened: a click that throws drives nothing.
	recordDrive(labelOf(el), enabled ? 'click' : 'click-disabled');
}

/**
 * Real key events into a field: pointer-click to focus it (as a user would), select-all when
 * `replace`, else caret to the end, then type. Does NOT blur - focus stays in the field, which
 * is exactly the state S1's B7 / the blur-commit scenarios need.
 */
async function type(el: El, text: string, opts: { replace?: boolean } = {}): Promise<void> {
	await el.waitForDisplayed({ timeout: 8000 });
	await beforeAction(el);
	await el.click();
	await browser.keys(opts.replace ? ['Control', 'a'] : ['End']);
	await browser.keys(text.split(''));
	recordDrive(labelOf(el), 'type');
}

/** Real double-click (two press/release pairs, so the browser fires `dblclick`). */
async function dblclick(el: El): Promise<void> {
	await el.waitForDisplayed({ timeout: 8000 });
	await beforeAction(el);
	await el.doubleClick();
	recordDrive(labelOf(el), 'dblclick');
}

/**
 * Move focus off `el` the way a user does: a real click on neutral modal chrome (the title).
 * This is the "click away" half of the blur-commit scenarios (S1 S03/S14). Recorded as kind
 * `blur` on the control being left.
 */
async function blur(el: El): Promise<void> {
	// "Blur" of a control that was never focused would record a pair nothing exercised.
	if (!(await hasFocusWithin(el))) throw new Error(`blur(${labelOf(el)}): the control does not have focus, so there is nothing to blur`);
	const away = $('.modal-container .dse-modal__title');
	await away.waitForDisplayed({ timeout: 8000 });
	await away.click();
	recordDrive(labelOf(el), 'blur');
}

/** Is `document.activeElement` the element or inside it? */
async function hasFocusWithin(el: El): Promise<boolean> {
	return Boolean(await browser.execute('return arguments[0].contains(document.activeElement);', await el));
}

/**
 * Move keyboard focus onto `el` with real Tab presses (at most `max`), the way a keyboard user
 * gets there. Fails if it is not reached. Records no coverage (it drives no control).
 */
async function tabTo(el: El, max = 10): Promise<void> {
	const target = await el;
	for (let i = 0; i < max; i++) {
		const hit = await browser.execute('return document.activeElement === arguments[0];', target);
		if (hit) return;
		await browser.keys('Tab');
	}
	if (!(await browser.execute('return document.activeElement === arguments[0];', target))) {
		throw new Error(`Tab did not reach the control within ${max} presses`);
	}
}

/**
 * A host control the key is "aimed at" without it holding focus: Obsidian's own X / backdrop
 * (`modal.close`), which Escape reaches through the modal's Scope while focus is in a field.
 * Explicit, so a DSE control id can never be credited for a key that went somewhere else.
 */
export interface AimedAt {
	readonly aimedAt: string;
}
const AIMED = new WeakSet<object>(); // brand: `in` on a wdio element proxy is not trustworthy
const aimedAt = (hostId: keyof typeof HOST_CONTROLS  ): AimedAt => {
	if (!HOST_CONTROLS[hostId]) throw new Error(`aimedAt("${hostId}"): only host ids (${Object.keys(HOST_CONTROLS).join(', ')}) can be aimed at without focus`);
	const pseudo: AimedAt = { aimedAt: hostId };
	AIMED.add(pseudo);
	return pseudo;
};

/**
 * A key or chord ("Escape", "Enter", "Control+a") to whatever has focus. `target` is the control
 * the keystroke is for: a DSE control must actually hold focus (the press is refused otherwise,
 * so `press:Enter` on a control is only ever credited when that control was the key's recipient);
 * a host control needs an explicit `dse.aimedAt('modal.close')`. No target = the page.
 */
async function press(key: string, target?: El | AimedAt): Promise<void> {
	let label = '(page)';
	if (target && AIMED.has(target)) label = (target as AimedAt).aimedAt;
	else if (target) {
		const el = target as El;
		label = labelOf(el);
		if (HOST_CONTROLS[label]) throw new Error(`press(${key}, ${label}): host controls never hold focus; use dse.aimedAt('${label}')`);
		if (!(await hasFocusWithin(el))) throw new Error(`press(${key}, ${label}): the control does not have focus (focus is on ${await focusedControl()})`);
		await beforeAction(el);
	}
	await browser.keys(key.includes('+') && key.length > 1 ? key.split('+') : key);
	recordDrive(label, `press:${key}`);
}

// -------------------------------------------------------------------------- write checks

/** Wait until the plugin is write-idle (no debounced or in-flight persist). */
const settle = (): Promise<void> => waitWriteIdle();

/** Page-side escape hatch for assertions the helpers do not cover (focus, hit-testing, counts). */
const page = <T = unknown>(expr: string): Promise<T> => ev<T>(expr);

/** The `data-dse-control` id of the focused element (or of its nearest ancestor that has one). */
const focusedControl = (): Promise<string | null> =>
	ev<string | null>(`document.activeElement?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null`);

/**
 * Edit a note from OUTSIDE the plugin (another process / sync tool / the user in another pane):
 * a plain vault.process, no DSE write path involved. `fnBody` is a page-side expression of `c`
 * (the note text), e.g. `c.replace('current_stamina: 15', 'current_stamina: 3')`.
 */
async function externalEdit(rel: string, fnBody: string): Promise<void> {
	state.exempt.add(rel); // the test edits this note itself, so its fences may legitimately differ
	await ev(`(async () => { await app.vault.process(app.vault.getAbstractFileByPath(${JSON.stringify(rel)}), (c) => ${fnBody}); })()`);
}

/** Current text of a note (through the vault). */
const noteText = (rel: string): Promise<string> =>
	ev<string>(`app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(rel)}))`);

/**
 * Put DSE preference overrides in force (`{}` = the shipped defaults). Prefs are read from
 * data.json at plugin load, so this writes them there and reloads the plugin. Pair it with an
 * `after(() => dse.setPrefs({}))` in the spec so a failure cannot leak the override; reopen
 * notes (`openNote`) after calling it.
 */
async function setPrefs(prefs: Record<string, unknown>): Promise<void> {
	await closeEverything();
	await ev(`(async () => {
		const id = 'draw-steel-elements';
		const p = app.plugins.plugins[id];
		await p.saveData(${JSON.stringify(Object.keys(prefs).length ? { prefs } : {})});
		await app.plugins.disablePlugin(id);
		await app.plugins.enablePlugin(id);
		while (!(app.plugins.plugins[id] && app.plugins.plugins[id].viewRegistry)) await new Promise((r) => setTimeout(r, 25));
		return true;
	})()`);
}

const modsFor = (rel: string, since: number): Promise<number> =>
	ev<number>(`__dse.mods.filter((m) => m.n > ${since} && m.path === ${JSON.stringify(rel)}).length`);

/**
 * Run `action`, resolve when the note's vault `modify` fires (no sleeps), then wait for the
 * plugin to go write-idle and return how many writes landed - so "exactly one write" is a
 * real assertion, not a guess.
 */
async function waitForWrite(rel: string, action: () => Promise<unknown>): Promise<{ count: number }> {
	const m = await mark();
	await action();
	await browser.waitUntil(async () => (await modsFor(rel, m)) >= 1, {
		timeout: 8000,
		interval: 40,
		timeoutMsg: `no write to ${rel} after the action`,
	});
	await waitWriteIdle();
	return { count: await modsFor(rel, m) };
}

/** Run `action`, wait until the plugin is write-idle (debounce settled, nothing in flight),
 *  then fail if the note was written at all. */
async function expectNoWrite(rel: string, action: () => Promise<unknown>): Promise<void> {
	const m = await mark();
	await action();
	await waitWriteIdle();
	const n = await modsFor(rel, m);
	if (n !== 0) {
		const ev0 = await eventsSince(m);
		throw new Error(`expected no write to ${rel}, saw ${n} (${JSON.stringify(ev0.mods)})`);
	}
}

// ----------------------------------------------------------------------- note assertions

/** Read the note through the vault, take the n-th fence of `lang`, parse it as YAML. */
async function readBlock(rel: string, lang: string, n: number): Promise<unknown> {
	const text = await ev<string>(`app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(rel)}))`);
	const lines = text.split('\n');
	let seen = -1;
	for (let i = 0; i < lines.length; i++) {
		const m = /^```(\S+)\s*$/.exec(lines[i]);
		if (!m || m[1] !== lang) continue;
		seen++;
		const body: string[] = [];
		let j = i + 1;
		for (; j < lines.length && lines[j].trim() !== '```'; j++) body.push(lines[j]);
		if (seen === n) return yaml.load(body.join('\n'));
		i = j;
	}
	throw new Error(`${rel} has no ${n + 1}-th \`\`\`${lang} block`);
}

function expectNoteBlock(rel: string, lang: string, n = 0) {
	return {
		/** Deep-subset match of the parsed block (jest toMatchObject semantics). */
		async toMatchObject(expected: Record<string, unknown>): Promise<void> {
			expect(await readBlock(rel, lang, n)).toMatchObject(expected);
		},
		/** Exact deep equality of the parsed block. */
		async toEqual(expected: unknown): Promise<void> {
			expect(await readBlock(rel, lang, n)).toEqual(expected);
		},
		/** The parsed block, for assertions the helpers above do not cover. */
		value: () => readBlock(rel, lang, n),
	};
}

export const dse = {
	openNote,
	block,
	modal,
	toast,
	control,
	click,
	type,
	dblclick,
	blur,
	press,
	aimedAt,
	tabTo,
	settle,
	page,
	waitFor,
	focusedControl,
	externalEdit,
	noteText,
	setPrefs,
	waitForWrite,
	expectNoWrite,
	expectNoteBlock,
	closeModals,
};
