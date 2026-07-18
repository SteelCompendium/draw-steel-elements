// D8 harness-fix: split out of polyfills.ts, which the browser visual-harness bundles
// (visual-harness/entry.ts imports '../test/setup/polyfills' directly — see that file's
// header comment). This file is jsdom-`dom`-project-only and Node-`require('util')`-based,
// so it must NOT be reachable from the browser bundle; esbuild's platform:'browser' build
// fails to resolve `util` even though the runtime guard below would never fire in a real
// browser (esbuild can't prove the branch dead at bundle time).
//
// jest's jsdom testEnvironment swaps `global` for jsdom's window, which does NOT carry
// Node's TextEncoder/TextDecoder globals (jsdom doesn't implement them) — the `unit`
// project (plain node testEnvironment) already has them natively, so this only ever fires
// under `dom`. test/fakes/fakeObsidian.ts's FakeVault is binary-content-backed (Uint8Array
// via TextEncoder/TextDecoder) and previously only ever ran under `unit`; D8 Task 2 was the
// first `dom` test to use it (sidebarBlockHost.test.ts needs jsdom for
// `document.createElement` alongside fakeObsidian's real vault.on/emit event delivery).
if (typeof (globalThis as any).TextEncoder === 'undefined') {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { TextEncoder, TextDecoder } = require('util');
	(globalThis as any).TextEncoder = TextEncoder;
	(globalThis as any).TextDecoder = TextDecoder;
}

export {};
