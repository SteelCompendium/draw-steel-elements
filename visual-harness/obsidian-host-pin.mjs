// visual-harness/obsidian-host-pin.mjs — SC-205.
//
// `shoot.mjs` carries OBSIDIAN_HOST_BUTTON_CSS: a hand-maintained MODEL of the rules
// Obsidian's own app.css aims at an ordinary desktop plugin button. Every conclusion the
// host-leak gate draws is only as true as that model, and the model has been wrong twice:
//   * SC-189 rounds 3-4 transcribed two of the five rules and missed `height`.
//   * SC-203 re-read it out of a live Obsidian by walking `document.styleSheets` and
//     concluded `button:hover` "no longer exists" — it does; it lives inside
//     `@media (hover: hover)`, which that walk did not descend into. SC-205 measured
//     app.css 1.13.7 still shipping it.
//
// A model nothing checks rots silently, and a rotted model makes the gate report a
// leak-free plugin. So this module reads the app.css out of the Obsidian that is actually
// installed and hands `shoot.mjs` two things to compare against its copy: the button-
// REACHING rules (text) and the token VALUES those rules read (resolved in a browser by
// the caller). Drift is a loud gate failure naming what differs; no Obsidian on the
// machine is a loud SKIP, never a silent pass.
//
// It reads the asar directly rather than shelling out to `npx asar` so the gate has no
// network/toolchain dependency: the asar format is an 8-byte pickle header, a JSON index,
// then the file bytes uncompressed.

import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Where the app.css that is actually RUNNING lives. Obsidian self-updates by dropping a
 * versioned `obsidian-<x.y.z>.asar` into its config dir and preferring the newest one over
 * the (frequently years-older) asar the system package installed — SC-203's copy went stale
 * for exactly this reason. So the config dir wins, newest version first, and
 * `/opt/Obsidian/resources/obsidian.asar` is only the fallback.
 * @returns {{ path: string, version: string } | null}
 */
export function findObsidianAsar() {
	const configDir = path.join(os.homedir(), '.config', 'obsidian');
	let entries = [];
	try {
		entries = fs.readdirSync(configDir);
	} catch {
		entries = [];
	}
	const versioned = entries
		.map((f) => /^obsidian-(\d+)\.(\d+)\.(\d+)\.asar$/.exec(f))
		.filter(Boolean)
		.sort((a, b) => +a[1] - +b[1] || +a[2] - +b[2] || +a[3] - +b[3]);
	if (versioned.length) {
		const newest = versioned[versioned.length - 1];
		return { path: path.join(configDir, newest[0]), version: `${newest[1]}.${newest[2]}.${newest[3]}` };
	}
	const installed = '/opt/Obsidian/resources/obsidian.asar';
	if (fs.existsSync(installed)) return { path: installed, version: '(installer asar — version not encoded in the filename)' };
	return null;
}

/**
 * Pull one file out of an asar archive by its archive-relative name.
 * Layout: `uint32 4 | uint32 headerPickleSize | uint32 headerPayloadSize | uint32 jsonLen |
 * json | pad | data`, and every file's `offset` is relative to `8 + headerPickleSize`.
 * @returns {string | null} the file's utf8 contents, or null if the archive has no such entry
 */
export function readAsarFile(asarPath, name) {
	const fd = fs.openSync(asarPath, 'r');
	try {
		const head = Buffer.alloc(16);
		fs.readSync(fd, head, 0, 16, 0);
		const headerPickleSize = head.readUInt32LE(4);
		const jsonLen = head.readUInt32LE(12);
		const json = Buffer.alloc(jsonLen);
		fs.readSync(fd, json, 0, jsonLen, 16);
		const index = JSON.parse(json.toString('utf8'));
		const entry = index?.files?.[name];
		if (!entry || typeof entry.size !== 'number') return null;
		const out = Buffer.alloc(entry.size);
		fs.readSync(fd, out, 0, entry.size, 8 + headerPickleSize + Number(entry.offset));
		return out.toString('utf8');
	} finally {
		fs.closeSync(fd);
	}
}

/**
 * Every style rule in a sheet, with its at-rule context. Comments are stripped first (the
 * one shortcut here: a comment-close sequence inside a string literal would end a comment
 * early — app.css has none, and a wrong parse surfaces as a loud drift report, never as a
 * silent pass).
 * @returns {{ ctx: string, sel: string, body: string }[]}
 */
export function iterRules(css) {
	const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const out = [];
	const walk = (from, to, ctx) => {
		let i = from;
		let prelude = '';
		while (i < to) {
			const ch = src[i];
			if (ch === '{') {
				i += 1;
				const bodyStart = i;
				let depth = 1;
				while (i < to && depth > 0) {
					if (src[i] === '{') depth += 1;
					else if (src[i] === '}') depth -= 1;
					i += 1;
				}
				const bodyEnd = depth === 0 ? i - 1 : i;
				const sel = prelude.trim();
				prelude = '';
				if (sel.startsWith('@')) walk(bodyStart, bodyEnd, ctx ? `${ctx} ${sel}` : sel);
				else out.push({ ctx, sel, body: src.slice(bodyStart, bodyEnd) });
			} else if (ch === '}') {
				prelude = '';
				i += 1;
			} else if (ch === ';' && prelude.trim().startsWith('@')) {
				prelude = '';
				i += 1;
			} else {
				prelude += ch;
				i += 1;
			}
		}
	};
	walk(0, src.length, '');
	return out;
}

/**
 * Does this ONE selector reach a plain plugin `<button>` — i.e. an element whose only
 * qualification is being a button, possibly in some STATE? `button.mod-cta`,
 * `button:not(.clickable-icon).mobile-tap` and `button.mod-loading::after` do not (they
 * demand a class the plugin never sets, or paint a pseudo-element); `button`,
 * `button:not(.clickable-icon)`, `button:hover`, `button:focus-visible` and
 * `button[disabled]` do. A `:not(.x)` is stripped rather than rejected precisely because a
 * plugin button satisfies it.
 */
export function reachesPlainButton(sel) {
	const s = sel.trim();
	if (!/^button\b/.test(s)) return false;
	if (s.includes('::')) return false;
	const bare = s
		.replace(/:not\([^()]*\)/g, '')
		.replace(/\[[^\]]*\]/g, '')
		.replace(/:[a-z-]+(\([^()]*\))?/g, '');
	return bare === 'button';
}

/** Whitespace/quote-normalized selector list, so formatting alone can never read as drift. */
export function normalizeSelector(sel) {
	return sel
		.split(',')
		.map((s) => s.trim().replace(/\s+/g, ' ').replace(/'/g, '"'))
		.filter(Boolean)
		.join(', ');
}

/** Declarations in source ORDER (order decides the cascade within a rule), normalized. */
export function normalizeDecls(body) {
	return body
		.split(';')
		.map((d) => d.trim())
		.filter(Boolean)
		.map((d) => d.replace(/\s+/g, ' ').replace(/\s*:\s*/, ': ').replace(/\s*,\s*/g, ', '))
		.join('; ');
}

/**
 * The rules a sheet aims at a plain plugin button, in source order, normalized for
 * comparison. Rules whose every selector reaches a plain button are kept whole; a rule
 * mixing reaching and non-reaching selectors would be a new shape worth a human look, so it
 * is kept too (and will show up as drift).
 * @returns {{ ctx: string, sel: string, decls: string }[]}
 */
export function extractReachingButtonRules(css) {
	return iterRules(css)
		.filter((r) => r.sel.split(',').some((s) => reachesPlainButton(s)))
		.map((r) => ({ ctx: r.ctx.replace(/\s+/g, ' ').trim(), sel: normalizeSelector(r.sel), decls: normalizeDecls(r.body) }));
}

/**
 * The custom properties the modelled rules read. `shoot.mjs` resolves these in a real
 * browser under BOTH sheets and compares — resolving var() chains by hand is how a
 * hand-curated token snapshot goes stale (SC-203 left `--interactive-hover` at a dark value
 * Obsidian had already moved).
 */
export const PINNED_TOKENS = [
	'--input-shadow',
	'--input-shadow-hover',
	'--interactive-normal',
	'--interactive-hover',
	'--text-normal',
	'--background-modifier-border-focus',
	'--font-ui-small',
	'--button-radius',
	'--button-corner-shape',
	'--input-height',
	'--input-font-weight',
	'--size-4-1',
	'--size-4-3',
	'--cursor',
];

/** Token values are compared on VALUE, not formatting: `.15` == `0.15`, `#ABC` == `#abc`. */
export function normalizeTokenValue(v) {
	return String(v)
		.trim()
		.replace(/\s+/g, ' ')
		.replace(/\s*,\s*/g, ',')
		.replace(/(^|[\s,(])\.(\d)/g, '$10.$2')
		.toLowerCase();
}
