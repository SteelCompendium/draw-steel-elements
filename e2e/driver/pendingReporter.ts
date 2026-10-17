// SC-408 (review R1, M-2): a wdio reporter that turns a PENDING test (mocha `this.skip()` at
// runtime, or a spec the pre-scan missed) into a failed result line. Mocha runs no afterEach for a
// pending test, so without this a skip silently shrinks the run's denominator.
import WDIOReporter from '@wdio/reporter';
import type { TestStats } from '@wdio/reporter';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { E2E } from './env';
import { testIdOf } from './state';

export class PendingReporter extends WDIOReporter {
	onTestSkip(test: TestStats): void {
		const dir = path.join(E2E.runDir, 'results');
		fs.mkdirSync(dir, { recursive: true });
		fs.appendFileSync(
			path.join(dir, `pending-${process.pid}.jsonl`),
			JSON.stringify({
				id: testIdOf(test.title),
				title: test.title,
				state: 'failed',
				knownBug: null,
				durationMs: 0,
				error: 'the test was skipped (pending): a skipped test is a failure, never a smaller denominator',
			}) + '\n',
		);
	}
}
