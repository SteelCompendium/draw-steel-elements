// visual-harness/docs-deferred-guard.cjs — SC-407 (fix round 1, LOW-4).
//
// `npm run docs-shots` photographs the shipping product. The Obsidian half runs with the
// `experimental` switch OFF (camera-data-json.cjs `seedExperimental(file, false)`), so a deferred
// element renders its "not available in this release" card there and the mistake is visible.
// The BROWSER half renders through visual-harness/entry.ts, which switches the gate ON
// (`setExperimental(true)`, so the frozen shots and parity gate see every element) — a browser
// entry for a deferred element would therefore be captured as a full element, silently
// publishing an unfinished feature in the docs. This guard refuses such an entry. SC-411: and a
// `kind: 'gif'` entry for a deferred element, from either source (see assertNoDeferredBrowserShots).
//
// The deferred set is read from the registry's own source of truth — every
// `src/elements/<dir>/definition.ts` that declares `deferred: true` — not a hand-copied list, so
// it follows the code when an element is un-deferred (7.1.0) or another is added.
const fs = require('node:fs');
const path = require('node:path');

/** Registered ids of every element whose definition declares `deferred: true`. */
function deferredElementIds(repo) {
	const elementsDir = path.join(repo, 'src', 'elements');
	const ids = [];
	for (const entry of fs.readdirSync(elementsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const file = path.join(elementsDir, entry.name, 'definition.ts');
		if (!fs.existsSync(file)) continue;
		const src = fs.readFileSync(file, 'utf8');
		if (!/^\s*deferred:\s*true\b/m.test(src)) continue;
		const id = /^\s*id:\s*'([^']+)'/m.exec(src);
		if (!id) throw new Error(`${file} declares deferred: true but no \`id: '…'\` was found`);
		ids.push(id[1]);
	}
	if (ids.length === 0) {
		throw new Error(`docs guard found no deferred elements under ${elementsDir} — the scan has rotted`);
	}
	return ids.sort();
}

/** Throws when a docs manifest entry renders a deferred element:
 *   - a browser-source entry (`element:` or any `gallery:` id) — that half renders with the switch ON;
 *   - ANY `kind: 'gif'` entry, from EITHER source (SC-411). A GIF scripts an interaction with the
 *     element, so the entry must name it (`element:` is required — a gif entry without one cannot be
 *     checked and is refused), and the Obsidian half's switch-OFF placeholder card would otherwise be
 *     animated into the docs.
 *  Obsidian-source PNG entries are not checked: that half runs with the switch OFF. */
function assertNoDeferredBrowserShots(shots, repo) {
	const deferred = new Set(deferredElementIds(repo));
	const bad = [];
	for (const shot of shots) {
		if (shot.kind === 'gif') {
			if (typeof shot.element !== 'string' || shot.element === '') bad.push(`${shot.out} -> gif entry without an element (required, so this guard can check it)`);
			else if (deferred.has(shot.element)) bad.push(`${shot.out} -> ${shot.element} (gif, ${shot.source})`);
			continue;
		}
		if (shot.source !== 'browser') continue;
		// `gallery: true` (docs-shots.mjs) mounts EVERY fixture, deferred ones included.
		if (shot.gallery && !Array.isArray(shot.gallery)) bad.push(`${shot.out} -> gallery: ${String(shot.gallery)} (every element)`);
		const ids = [shot.element, ...(Array.isArray(shot.gallery) ? shot.gallery : [])].filter(Boolean);
		for (const id of ids) if (deferred.has(id)) bad.push(`${shot.out} -> ${id}`);
	}
	if (bad.length) {
		throw new Error(
			`docs-manifest.mjs has entr${bad.length === 1 ? 'y' : 'ies'} for deferred (7.0.0-gated) elements, or gif entries that cannot be checked: ${bad.join(', ')}. ` +
				'The browser half renders with the experimental switch ON, so these would publish an unfinished feature. ' +
				'Remove the entry (docs depict the shipping product) or un-defer the element first.',
		);
	}
}

module.exports = { deferredElementIds, assertNoDeferredBrowserShots };
