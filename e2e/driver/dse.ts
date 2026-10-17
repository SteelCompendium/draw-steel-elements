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
import { recordDrive, state } from './state';
import './session';

export { knownBug } from './knownBug';

type El = ChainablePromiseElement;

/**
 * How a spec names a control. A bare string is a stable `data-dse-control` id (P2 stamps these
 * on the kit factories; ids never depend on copy). Until a control carries one, name it by
 * CSS or by accessible name. Switching a call site from `{ name: 'Damage' }` to
 * `'sedit.damage'` is the whole migration.
 */
export type ControlRef = string | { css: string } | { name: string };

export interface Scope {
	/** The scope's root element (block root, or the modal's dialog). */
	readonly root: El;
	/** A control inside this scope. Coverage is recorded when it is driven (click/type/press). */
	control(ref: ControlRef): El;
}

const READING = '.workspace-leaf.mod-active .markdown-reading-view';
const controlLabels = new WeakMap<object, string>();

export function selectorOf(ref: ControlRef): string {
	if (typeof ref === 'string') return `[data-dse-control="${ref}"]`;
	if ('css' in ref) return ref.css;
	return `[aria-label="${ref.name}"]`;
}
const labelOfRef = (ref: ControlRef): string =>
	typeof ref === 'string' ? ref : 'css' in ref ? `css:${ref.css}` : `name:${ref.name}`;

function scopeOf(root: El): Scope {
	return {
		root,
		control(ref) {
			const el = root.$(selectorOf(ref));
			controlLabels.set(el as object, labelOfRef(ref));
			return el;
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

/** The n-th (0-based) block of `lang` in the visible Reading view. */
function block(lang: string, n = 0): Scope {
	return scopeOf($$(`${READING} [data-dse-element="${elementIdOf(lang)}"]`)[n] as unknown as El);
}

/** The single open DSE modal of `kind`. Fails if none opens, or if more than one is open. */
async function modal(kind: keyof typeof MODAL_KINDS | string): Promise<Scope> {
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
	return scopeOf(root as unknown as El);
}

/** Resolve a control reference outside any scope (page-wide). */
function control(ref: ControlRef): El {
	const el = $(selectorOf(ref));
	controlLabels.set(el as object, labelOfRef(ref));
	return el as unknown as El;
}

// ------------------------------------------------------------------------------ input

const labelOf = (el: El): string => controlLabels.get(el as object) ?? `selector:${String((el as unknown as { selector: unknown }).selector)}`;

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
	recordDrive(labelOf(el), enabled ? 'click' : 'click-disabled');
	if (opts.cdp) return cdpClick(el, opts);
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

/**
 * Real key events into a field: pointer-click to focus it (as a user would), select-all when
 * `replace`, else caret to the end, then type. Does NOT blur - focus stays in the field, which
 * is exactly the state S1's B7 / the blur-commit scenarios need.
 */
async function type(el: El, text: string, opts: { replace?: boolean } = {}): Promise<void> {
	await el.waitForDisplayed({ timeout: 8000 });
	await beforeAction(el);
	recordDrive(labelOf(el), 'type');
	await el.click();
	await browser.keys(opts.replace ? ['Control', 'a'] : ['End']);
	await browser.keys(text.split(''));
}

/** A key or chord ("Escape", "Enter", "Control+a") to whatever has focus. `target` is only
 *  the coverage label: which control the keystroke was aimed at. */
async function press(key: string, target?: El): Promise<void> {
	if (target) await beforeAction(target);
	recordDrive(target ? labelOf(target) : '(page)', `press:${key}`);
	await browser.keys(key.includes('+') && key.length > 1 ? key.split('+') : key);
}

// -------------------------------------------------------------------------- write checks

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
	control,
	click,
	type,
	press,
	waitForWrite,
	expectNoWrite,
	expectNoteBlock,
	closeModals,
};
