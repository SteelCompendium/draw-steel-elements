// visual-harness/obsidian-host-pin.mjs — SC-205.
//
// `shoot.mjs` carries OBSIDIAN_HOST_BUTTON_CSS: a hand-maintained MODEL of the rules
// Obsidian's own app.css aims at an ordinary desktop plugin button. Every conclusion the
// host-leak gate draws is only as true as that model, and the model has been wrong twice:
//   * SC-189 rounds 3-4 transcribed two of the six rules and missed `height`.
//   * SC-203 re-read it out of a live Obsidian by walking `document.styleSheets` and
//     concluded `button:hover` "no longer exists" — it does; it lives inside
//     `@media (hover: hover)`, which that walk did not descend into. SC-205 measured
//     app.css 1.13.7 still shipping it.
// A THIRD copy of the same model lives in styles-source.css's re-grounding preamble and had
// rotted the same way; `assertHostCopyPinnedToObsidian` now pins that listing too.
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
 * The Obsidian version OBSIDIAN_HOST_BUTTON_CSS was extracted from. The pin will not compare
 * against anything OLDER than this (SC-205 round 3 / MEDIUM-4): a stale asar's reaching set
 * genuinely differs, so comparing against one produces a DRIFT failure whose remedy — "fix
 * the copy, re-extract" — would replace the pinned model with an older one for everyone.
 * That is the exact rot this module exists to prevent, arrived at from the other direction.
 * Bump it in the same commit that re-extracts the copy.
 */
export const PINNED_OBSIDIAN = '1.13.7';

const parseVersion = (v) => {
	const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
	return m ? [+m[1], +m[2], +m[3]] : null;
};

/** -1 / 0 / +1, or null if either side is not an x.y.z version. */
export function compareVersions(a, b) {
	const pa = parseVersion(a);
	const pb = parseVersion(b);
	if (!pa || !pb) return null;
	for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
	return 0;
}

/**
 * Where the app.css that is actually RUNNING lives. Obsidian self-updates by dropping a
 * versioned `obsidian-<x.y.z>.asar` into its config dir and preferring the newest one over
 * the (frequently years-older) asar the system package installed — SC-203's copy went stale
 * for exactly this reason. So the config dir wins, newest version first.
 *
 * `/opt/Obsidian/resources/obsidian.asar` is reported but flagged `usable: false`: it carries
 * no version in its name, so the caller cannot prove it is not older than PINNED_OBSIDIAN,
 * and on this machine it is in fact a Mar-2023 build whose button rules really are different.
 * An unusable find is a loud SKIP at the call site, never a drift failure (SC-205 R3).
 *
 * @returns {{ path: string, version: string, usable: boolean, why?: string } | null}
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
		const version = `${newest[1]}.${newest[2]}.${newest[3]}`;
		const cmp = compareVersions(version, PINNED_OBSIDIAN);
		return {
			path: path.join(configDir, newest[0]),
			version,
			usable: cmp !== null && cmp >= 0,
			why:
				cmp !== null && cmp < 0
					? `the newest Obsidian installed here is ${version}, OLDER than the ${PINNED_OBSIDIAN} the host copy was extracted from`
					: undefined,
		};
	}
	const installed = '/opt/Obsidian/resources/obsidian.asar';
	if (fs.existsSync(installed))
		return {
			path: installed,
			version: '(unversioned installer asar)',
			usable: false,
			why:
				`the only Obsidian here is the installer asar at ${installed}, whose filename carries no ` +
				`version — it cannot be shown to be at least ${PINNED_OBSIDIAN}, and an installer copy is ` +
				`routinely years older than the self-updated one Obsidian actually runs`,
		};
	return null;
}

/**
 * Pull one file out of an asar archive by its archive-relative name.
 * Layout: `uint32 4 | uint32 headerPickleSize | uint32 headerPayloadSize | uint32 jsonLen |
 * json | pad | data`, and every file's `offset` is relative to `8 + headerPickleSize`.
 * @returns {string | null} the file's utf8 contents, or null if the archive has no such entry
 */
export function readAsarFile(asarPath, name) {
	// SC-205 R3 / LOW-4: everything here is guarded, because Obsidian self-updates by dropping
	// a new asar into the very directory this module scans — so a run that starts mid-download
	// meets a truncated file. Unguarded, the JSON.parse threw, `npm run shots` reported
	// `FAIL sweep (exception)`, and that ALSO skipped the button sweep and the print-twin
	// parity check. A bad asar must degrade to the loud SKIP path, never kill the battery.
	let fd;
	try {
		fd = fs.openSync(asarPath, 'r');
		const head = Buffer.alloc(16);
		if (fs.readSync(fd, head, 0, 16, 0) < 16) return null;
		const headerPickleSize = head.readUInt32LE(4);
		const jsonLen = head.readUInt32LE(12);
		if (!jsonLen || jsonLen > fs.fstatSync(fd).size) return null;
		const json = Buffer.alloc(jsonLen);
		if (fs.readSync(fd, json, 0, jsonLen, 16) < jsonLen) return null;
		const index = JSON.parse(json.toString('utf8'));
		const entry = index?.files?.[name];
		if (!entry || typeof entry.size !== 'number') return null;
		const out = Buffer.alloc(entry.size);
		if (fs.readSync(fd, out, 0, entry.size, 8 + headerPickleSize + Number(entry.offset)) < entry.size) return null;
		return out.toString('utf8');
	} catch {
		return null;
	} finally {
		if (fd !== undefined) fs.closeSync(fd);
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
 * Split one selector into its ANCESTOR SCOPE and its SUBJECT compound — the compound the
 * rule actually styles. `.is-phone .modal .setting-item-control button:not(.clickable-icon)`
 * → scope `.is-phone .modal .setting-item-control`, subject `button:not(.clickable-icon)`.
 * Combinators inside `(...)` or `[...]` are not combinators, hence the depth counter.
 */
export function splitSubject(sel) {
	const s = sel.trim();
	let depth = 0;
	let cut = 0;
	for (let i = 0; i < s.length; i += 1) {
		const c = s[i];
		if (c === '(' || c === '[') depth += 1;
		else if (c === ')' || c === ']') depth -= 1;
		else if (depth === 0 && (c === ' ' || c === '>' || c === '+' || c === '~')) cut = i + 1;
	}
	return { scope: s.slice(0, cut).trim().replace(/\s+/g, ' '), subject: s.slice(cut).trim() };
}

/**
 * Is this compound a plain plugin `<button>` — an element whose only qualification is being
 * a button, possibly in some STATE? `button.mod-cta`,
 * `button:not(.clickable-icon).mobile-tap` and `button.mod-loading::after` are not (they
 * demand a class the plugin never sets, or paint a pseudo-element); `button`,
 * `button:not(.clickable-icon)`, `button:hover`, `button:focus-visible` and
 * `button[disabled]` are. A `:not(.x)` is stripped rather than rejected precisely because a
 * plugin button satisfies it.
 */
export function subjectIsPlainButton(subject) {
	const s = subject.trim();
	if (!/^button\b/.test(s)) return false;
	if (s.includes('::')) return false;
	const bare = s
		.replace(/:not\([^()]*\)/g, '')
		.replace(/\[[^\]]*\]/g, '')
		.replace(/:[a-z-]+(\([^()]*\))?/g, '');
	return bare === 'button';
}

/**
 * THE PIN'S BOUNDARY, stated once and enforced (SC-205 R3 / MEDIUM-3).
 *
 * Round 1 selected rules with `/^button\b/` — the selector had to BEGIN with `button` — and
 * described the result as "the whole reaching set". It was not: 1.13.7's app.css has 26
 * rules whose SUBJECT is a plain button, and that filter saw only the 6 with no ancestor
 * scope. The filter was structurally the same shape as the bug the pin exists to prevent —
 * a future `.markdown-rendered button { … }` or `.view-content button { … }` reaches every
 * plugin button in every note, and a prefix filter would never have mentioned it.
 *
 * So the pin now selects on the SUBJECT compound and subtracts THIS list. Every entry is an
 * ancestor scope that cannot contain an in-note plugin element on desktop. A rule whose
 * subject is a plain button and whose scope matches nothing here is NOT quietly dropped: it
 * must be modelled in OBSIDIAN_HOST_BUTTON_CSS or the pin fails loudly. That is the whole
 * value — a new ancestor scope is loud instead of invisible.
 *
 * SCOPE BOUND (ticket-owner ruling 6, SC-205 R3): this gate measures the IN-NOTE gallery.
 * Modelling the modal / prompt / settings-tab surfaces is SC-202's general problem and is
 * deliberately NOT attempted here — which is why `.setting-item-control` scopes appear
 * below as exclusions rather than as coverage.
 */
export const EXCLUDED_ANCESTOR_SCOPES = [
	{
		pattern: /^(\.dialog\b|\.messageBar\b|#editorUndoBar\b)/,
		why: "Obsidian's bundled pdf.js viewer chrome — never inside a rendered note",
	},
	{
		pattern: /(^|\s)(\.is-phone|\.is-tablet|body\.emulate-mobile|\.mobile-[\w-]+)(\s|$)/,
		why: 'mobile/tablet scopes; the plugin gallery and the modelled tokens are desktop-only (see the token block in shoot.mjs)',
	},
	{
		pattern: /^(\.graph-color-button-container|\.publish-changes-info|\.slides-container|\.canvas-empty-embed-action-list)\b/,
		why: 'core-UI surfaces (graph view, Publish, slides, the empty-canvas placeholder) that never contain a rendered note',
	},
	{
		pattern: /^(\.open-vault-options|\.quick-start-container)\b/,
		why: 'the vault chooser / first-run screens — no vault is open, so no plugin element exists',
	},
	{
		pattern: /^\.bases-toolbar-menu-form\b/,
		why: "the core Bases toolbar's own form chrome, not note content",
	},
];

/** The excluded-scope entry that covers this scope, or null if nothing does. */
export function exclusionFor(scope) {
	if (!scope) return null;
	return EXCLUDED_ANCESTOR_SCOPES.find((e) => e.pattern.test(scope)) ?? null;
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
 * Every rule in a sheet whose subject is a plain plugin button, split into the set the pin
 * COMPARES and the set it deliberately EXCLUDES. A rule counts as reaching when at least one
 * of its selectors has a plain-button subject and an ancestor scope no exclusion covers; the
 * excluded list is returned too, so the gate can print the size of its own boundary instead
 * of implying there isn't one.
 *
 * A rule mixing a reaching selector with an excluded one lands in `reaching` — a new shape
 * worth a human look, and it will show up as drift rather than vanish.
 *
 * @returns {{ reaching: {ctx,sel,decls}[], excluded: {ctx,sel,scope,why}[] }}
 */
export function partitionButtonRules(css) {
	const reaching = [];
	const excluded = [];
	for (const r of iterRules(css)) {
		const ctx = r.ctx.replace(/\s+/g, ' ').trim();
		let reaches = false;
		let excuse = null;
		for (const one of r.sel.split(',')) {
			const { scope, subject } = splitSubject(one);
			if (!subjectIsPlainButton(subject)) continue;
			const ex = exclusionFor(scope);
			if (ex) excuse = excuse ?? { scope, why: ex.why };
			else reaches = true;
		}
		if (reaches) reaching.push({ ctx, sel: normalizeSelector(r.sel), decls: normalizeDecls(r.body) });
		else if (excuse) excluded.push({ ctx, sel: normalizeSelector(r.sel), scope: excuse.scope, why: excuse.why });
	}
	return { reaching, excluded };
}

/**
 * The rules a sheet aims at a plain plugin button, in source order, normalized for
 * comparison.
 * @returns {{ ctx: string, sel: string, decls: string }[]}
 */
export function extractReachingButtonRules(css) {
	return partitionButtonRules(css).reaching;
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
