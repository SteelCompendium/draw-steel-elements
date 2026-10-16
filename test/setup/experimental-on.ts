// SC-406 — the 7.0.0 release gate (src/framework/experimental.ts) defaults to OFF, the shipped
// state. Every suite runs with it ON so no fixture, snapshot or behaviour test moves; a test
// of the OFF state opts out explicitly (`setExperimental(false)` in the test). Re-armed before
// every test because `main.ts onload` — which sets the switch from data.json — is itself
// exercised by some suites, and must not leak its value into the next test.
import { setExperimental } from '../../src/framework/experimental';

setExperimental(true);
beforeEach(() => setExperimental(true));
