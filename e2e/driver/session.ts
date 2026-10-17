// SC-408 e2e driver: the root mocha hooks every spec file gets by importing the driver.
//   before      once per Obsidian session: recorders, trust-dialog guard, CDP focus emulation
//   beforeEach  fresh per-test state; wraps the test body so the invariants run INSIDE the
//               test (a violation fails that test, rather than failing an afterEach hook,
//               which would make mocha skip every remaining test in the suite)
//   afterEach   failure bundle + one result line per test (run.mjs tallies them)
import { browser } from '@wdio/globals';
import { E2E } from './env';
import { writeBundle } from './artifacts';
import { invariantProblems } from './invariants';
import { ev, waitFor } from './page';
import { enableFocusEmulation, installRecorders, mark, setWindowSize } from './recorders';
import { appendRunLine, resetTestState, state, testIdOf } from './state';

before(async function () {
	this.timeout(120_000);
	await waitFor(`!!(window.app && app.plugins && app.plugins.plugins && app.plugins.plugins['draw-steel-elements'])`, 'the DSE plugin to load', 60_000);
	await enableFocusEmulation();
	await installRecorders();
	// Shipped specs run the real 7.0.0 product: the experimental gate must be OFF.
	const experimental = await ev<boolean>(`app.plugins.plugins['draw-steel-elements'].settings?.experimental === true`);
	if (experimental) throw new Error('the experimental gate is ON in a shipped-spec session (data.json must not set it)');
	await setWindowSize(1440, 1100);
	const chrome = await ev<string>(`navigator.userAgent.match(/Chrome\\/([\\d.]+)/)?.[1] ?? '?'`);
	const viewport = await ev<string>(`window.innerWidth + 'x' + window.innerHeight`);
	console.log(
		`OBSIDIAN-E2E session: obsidian app ${browser.getObsidianVersion()}, installer ${browser.getObsidianInstallerVersion()}, chrome ${chrome}, viewport ${viewport}, ${E2E.headed ? 'headed' : 'headless'}, pid ${process.pid}`,
	);
});

beforeEach(async function () {
	const test = this.currentTest;
	if (!test) return;
	resetTestState(test.title);
	state.mark = await mark();
	const body = test.fn;
	if (typeof body === 'function' && body.length === 0) {
		// Mocha reads `test.fn` when the body runs, i.e. after this hook returns.
		test.fn = async function (this: Mocha.Context) {
			try {
				await (body as (this: Mocha.Context) => unknown).call(this);
				const problems = await invariantProblems();
				if (problems.length) throw new Error(`invariant violation(s):\n - ${problems.join('\n - ')}`);
			} catch (e) {
				state.error = e; // mocha 10 does not keep the error on the test object
				throw e;
			}
		} as Mocha.Func;
	}
});

afterEach(async function () {
	const test = this.currentTest;
	if (!test) return;
	const known = /\[known bug ([^\]]+)\]/.exec(test.title)?.[1] ?? null;
	// state 'passed' is the only good outcome. 'failed' = the body or an invariant threw;
	// undefined = a beforeEach hook failed (the body never ran), mocha skips the rest of the suite.
	const failed = test.state !== 'passed';
	const reason = test.timedOut
		? new Error(`timed out after ${test.timeout()} ms`)
		: (state.error ?? new Error('the test did not run to completion (a beforeEach hook failed?)'));
	if (failed) {
		try {
			await writeBundle(testIdOf(test.title), test.title, reason, 'failure');
		} catch {
			/* never mask the failure with an artifact error */
		}
	}
	appendRunLine('results', {
		id: testIdOf(test.title),
		title: test.title,
		state: failed ? 'failed' : 'passed',
		knownBug: known,
		durationMs: test.duration ?? null,
		error: failed ? String(reason instanceof Error ? reason.message : reason).slice(0, 2000) : null,
	});
});
