// SC-568 test helper: wait until the mock vault has no note read in flight, however many macrotask hops a read takes.
//
// The mock vault's `read` takes a `setTimeout(0)` hop (obsidian-core.ts `macrotask`), and the host chains one or two reads when a card
// is drawn or a pin is rebased (`ReadingModeBlockHost.rebaseCardPin`). A test that waits "until the read is done" with a fixed
// `setTimeout(25)` loses the race on a starved host (the chained second hop is scheduled only after the first has run, and a 25 ms timer
// that is already due fires first); a fixed COUNT of hops is tied to how many hops a read happens to take (it went red at 8 per read and
// passed vacuously at 20). So the helper counts the reads that are IN FLIGHT and waits until none is, for two hops in a row (a read
// that finishes can start the next one in the same task, so one idle hop is not proof), bounded so a read that never finishes fails loudly.
//
// REAL TIMERS ONLY: it waits on real `setTimeout(0)` hops, so under jest fake timers it never advances and hangs to the 30 s test timeout
// (use `pump()` as in `initiative-default-keys.test.ts` there). Where the end state of the wait is observable, assert it after the wait.
//
// Importing this file wraps `FakeVault.prototype.cachedRead` for every test of the importing file (a `beforeEach` / `afterEach` pair,
// registered on the importer's root, like `_hoverPreviewStandIn.ts`).
import { FakeVault } from '../mocks/obsidian-core';

let inFlight = 0;
let spy: jest.SpyInstance | null = null;

beforeEach(() => {
	inFlight = 0;
	const original = FakeVault.prototype.cachedRead;
	spy = jest.spyOn(FakeVault.prototype, 'cachedRead').mockImplementation(function (this: FakeVault, ...args: Parameters<FakeVault['cachedRead']>) {
		inFlight++;
		return original.apply(this, args).finally(() => {
			inFlight--;
		});
	});
});
afterEach(() => {
	spy?.mockRestore();
	spy = null;
});

/** Resolve once no `cachedRead` is in flight for two macrotask hops in a row. Throws after `maxHops` hops (default 1000). */
export async function settleVaultReads(maxHops = 1000): Promise<void> {
	let idle = 0;
	for (let hop = 0; hop < maxHops && idle < 2; hop++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		idle = inFlight === 0 ? idle + 1 : 0;
	}
	if (idle < 2) throw new Error(`settleVaultReads: ${inFlight} vault read(s) still in flight after ${maxHops} hops`);
}
