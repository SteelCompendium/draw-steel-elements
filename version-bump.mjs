// version-bump.mjs — keeps manifest.json and versions.json in step with package.json.
//
// Run by `npm version` (see package.json's `version` script), which bumps package.json
// first and then invokes this before committing.
//
// RESTORED in SC-131 after going missing: the `version` script referenced it while the
// file did not exist, so the sync never ran, and manifest.json had silently drifted to
// 6.0.1 while package.json said 7.0.0. That drift became load-bearing the moment
// SC-131 raised minAppVersion to 1.13.0 — see below.
//
// WHY versions.json MATTERS. Obsidian reads it to decide which build to offer a client
// that cannot run the latest one: it maps plugin version -> the minimum app version that
// build requires, and an out-of-date client is offered the newest entry it satisfies.
// Without a row for the current version, a pre-1.13 user would be offered the 1.13-only
// build and land on an empty settings tab. Keeping the older rows is the whole point —
// they are what those clients pin to.
import { readFileSync, writeFileSync } from 'node:fs';

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
	throw new Error('npm_package_version is not set — run this through `npm version`, not directly.');
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const { minAppVersion } = manifest;
if (!minAppVersion) throw new Error('manifest.json has no minAppVersion');

manifest.version = targetVersion;
writeFileSync('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

// Append-only: existing rows are how older clients find their last compatible build.
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
versions[targetVersion] = minAppVersion;
writeFileSync('versions.json', `${JSON.stringify(versions, null, '\t')}\n`);

console.log(`version-bump: manifest ${targetVersion}, versions.json ${targetVersion} -> ${minAppVersion}`);
