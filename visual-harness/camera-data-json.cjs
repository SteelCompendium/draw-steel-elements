// visual-harness/camera-data-json.cjs — SC-406 (fix round 1, MEDIUM-3).
//
// The real-Obsidian camera (obsidian-camera.mjs) photographs every element and the sidebar, so
// the plugin's undocumented `experimental` switch (framework/experimental.ts, default OFF) has
// to be ON in the plugin's data.json for the length of a run. That file is NOT scratch: the
// demo vault's plugin dir is a symlink to the repo root, so `<repo>/data.json` is the live
// plugin data of the vault a human reviews in. This module turns the switch on for the run
// and puts the file back exactly as it found it — original BYTES, or deleted when there was
// none — and never overwrites a file it cannot parse.
//
// Restoration is idempotent and synchronous, so the camera can call it from `finally`, from a
// SIGINT/SIGTERM handler and from the process `exit` event alike. Obsidian must already be
// gone when it runs (the camera restores after killing it), or Obsidian could rewrite the file
// on its way out.
const fs = require('node:fs');

/**
 * Turn `experimental: true` on in `file` (merged into whatever JSON object is there; created
 * when absent). Returns `{ restore() }`. THROWS — before writing anything — when the file
 * exists but is not a JSON object: the user's settings are not ours to overwrite.
 */
function seedExperimental(file) {
	let original = null; // Buffer of the original bytes, or null when the file did not exist
	try {
		original = fs.readFileSync(file);
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}
	let saved = {};
	if (original !== null) {
		let parsed;
		try {
			parsed = JSON.parse(original.toString('utf8'));
		} catch (error) {
			throw new Error(`${file} exists but is not valid JSON (${error.message}); refusing to overwrite it`);
		}
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error(`${file} exists but is not a JSON object; refusing to overwrite it`);
		}
		saved = parsed;
	}
	if (saved.experimental !== true) {
		fs.writeFileSync(file, JSON.stringify({ ...saved, experimental: true }));
	}
	let restored = false;
	return {
		restore() {
			if (restored) return;
			restored = true;
			if (original === null) fs.rmSync(file, { force: true });
			else fs.writeFileSync(file, original);
		},
	};
}

module.exports = { seedExperimental };
