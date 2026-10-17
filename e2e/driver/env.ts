// SC-408 e2e driver: the run-wide settings run.mjs hands every worker through the environment.
// Workers are separate processes (one per spec file), so env vars are the only channel.
import * as path from 'node:path';

const e = process.env;

export const E2E = {
	/** Unique per `npm run e2e` invocation; also tags every child process (see run.mjs reap). */
	runId: e.DSE_E2E_RUN_ID ?? 'adhoc',
	/** e2e/.out/<run>/ - failure bundles, results, coverage land under here. */
	runDir: e.DSE_E2E_RUN_DIR ?? path.resolve(__dirname, '..', '.out', 'adhoc'),
	/** The shipped fixture vault (real .md notes), the source of truth for "fixture state". */
	fixtureVault: e.DSE_E2E_FIXTURE_VAULT ?? path.resolve(__dirname, '..', 'vaults', 'shipped'),
	headed: e.DSE_E2E_HEADED === '1',
	/** --slow=<ms>: pause + outline the target before each action (headed runs only). */
	slowMs: Number(e.DSE_E2E_SLOW ?? 0) || 0,
};
