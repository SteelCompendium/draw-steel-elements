// SC-408 e2e driver: the expected-failure marker (ledger "Known-bug convention").
// `knownBug('SC-427', title, fn)` PASSES while fn's assertion fails (the bug exists) and FAILS
// the moment fn starts passing, so the marker gets removed with the fix. Counted separately in
// the OBSIDIAN-E2E summary line. fn must encode the CORRECT behaviour.
import { writeBundle } from './artifacts';
import { closeModals } from './cleanup';
import { state } from './state';

export interface KnownBugOptions {
	/** Pin WHAT fails: the failure message must match, or the test fails ("failed differently"). */
	failsWith?: RegExp;
}

export function knownBug(ticket: string, title: string, fn: () => Promise<void>, opts: KnownBugOptions = {}): void {
	// The ticket rides in the title (`[known bug SC-427]`): the reporter and the results
	// tally both read it from there, and it is greppable in spec files.
	it(`${title} [known bug ${ticket}]`, async function () {
		let failure: unknown;
		try {
			await fn();
		} catch (e) {
			failure = e;
		}
		if (failure === undefined) {
			throw new Error(`known bug ${ticket} appears fixed - remove the marker`);
		}
		const msg = failure instanceof Error ? failure.message : String(failure);
		if (opts.failsWith && !opts.failsWith.test(msg)) {
			throw new Error(`known bug ${ticket} failed differently than pinned (${opts.failsWith}): ${msg}`);
		}
		// Evidence for whoever files / fixes the ticket: screenshot + DOM of the failing moment.
		await writeBundle(state.testId, state.testTitle, failure, 'known-bug').catch(() => undefined);
		// The scenario stopped mid-way, so it left its modal open: tidy up so the invariants (and
		// the next test) see a clean page.
		await closeModals();
	});
}
