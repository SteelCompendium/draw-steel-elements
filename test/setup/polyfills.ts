// Obsidian installs an Array.prototype.contains polyfill at runtime;
// src code relies on it (src/model/NegotiationData.ts:47,55).
// Needed in BOTH jest projects — NegotiationData is pure node code.
if (!(Array.prototype as any).contains) {
	Object.defineProperty(Array.prototype, 'contains', {
		value: function <T>(this: T[], target: T): boolean {
			return this.includes(target);
		},
		enumerable: false,
		writable: true,
		configurable: true,
	});
}

// D8 Task 2: jest's jsdom testEnvironment swaps `global` for jsdom's window, which does
// NOT carry Node's TextEncoder/TextDecoder globals (jsdom doesn't implement them) — the
// `unit` project (plain node testEnvironment) already has them natively, so this only
// ever fires under `dom`. test/fakes/fakeObsidian.ts's FakeVault is binary-content-backed
// (Uint8Array via TextEncoder/TextDecoder) and previously only ever ran under `unit`;
// D8 Task 2 is the first `dom` test to use it (sidebarBlockHost.test.ts needs jsdom for
// `document.createElement` alongside fakeObsidian's real vault.on/emit event delivery).
if (typeof (globalThis as any).TextEncoder === 'undefined') {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { TextEncoder, TextDecoder } = require('util');
	(globalThis as any).TextEncoder = TextEncoder;
	(globalThis as any).TextDecoder = TextDecoder;
}

export {};
