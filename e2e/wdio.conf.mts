// SC-408 e2e: the wdio config. Do not run this directly - `npm run e2e` (run.mjs) owns the
// display, the Obsidian binary choice, sharding and the summary line, and hands everything
// here through DSE_E2E_* environment variables.
import * as path from 'node:path';

const env = process.env;
const need = (name: string): string => {
	const v = env[name];
	if (!v) throw new Error(`${name} is not set - run the suite through \`npm run e2e\` (e2e/run.mjs)`);
	return v;
};

const shards = Math.max(1, Number(env.DSE_E2E_SHARDS ?? 1));
const appVersion = need('DSE_E2E_APP_VERSION');
const installerVersion = need('DSE_E2E_INSTALLER_VERSION');

export const config: WebdriverIO.Config = {
	runner: 'local',
	framework: 'mocha',
	specs: JSON.parse(need('DSE_E2E_SPECS')) as string[],
	maxInstances: shards,
	// run.mjs owns the display. wdio's autoXvfb only kicks in when DISPLAY is unset, and agent
	// shells export DISPLAY=:1 (a real screen) - so it is off, and DISPLAY is always explicit.
	autoXvfb: false,
	capabilities: [
		{
			browserName: 'obsidian',
			browserVersion: appVersion,
			'wdio:obsidianOptions': {
				installerVersion,
				...(env.DSE_E2E_BINARY ? { binaryPath: env.DSE_E2E_BINARY } : {}),
				...(env.DSE_E2E_APP_PATH ? { appPath: env.DSE_E2E_APP_PATH } : {}),
				plugins: [need('DSE_E2E_PLUGIN_DIR')],
				vault: need('DSE_E2E_FIXTURE_VAULT'),
			},
		},
	],
	services: ['obsidian'],
	reporters: ['spec'],
	cacheDir: path.resolve(need('DSE_E2E_CACHE')),
	// No auto-retries anywhere: a flake is a bug in the test or the product (S2 section 4.8).
	specFileRetries: 0,
	mochaOpts: {
		ui: 'bdd',
		timeout: 45_000,
		...(env.DSE_E2E_GREP ? { grep: env.DSE_E2E_GREP } : {}),
	},
	logLevel: 'warn',
};
