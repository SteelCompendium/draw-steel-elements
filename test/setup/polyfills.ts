// Obsidian installs an Array.prototype.contains polyfill at runtime;
// src code relies on it (src/model/NegotiationData.ts:47,55).
// Needed in BOTH jest projects, AND the browser visual-harness (visual-harness/entry.ts
// imports this file directly) — keep this file free of Node-only APIs (require(), etc.).
// The jsdom-only TextEncoder/TextDecoder polyfill that D8 Task 2 briefly added here moved
// to test/setup/text-encoding-polyfill.ts (dom jest project only) because esbuild's
// platform:'browser' harness build can't resolve `require('util')` even when it's behind a
// runtime-dead guard (D8 harness-fix).
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

export {};
