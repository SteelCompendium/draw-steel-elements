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

export {};
