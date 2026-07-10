// test/mocks/obsidian.ts — jest-facing obsidian mock (moduleNameMapper ^obsidian$ points
// here). Re-exports the jest-free core (also consumed by visual-harness/shim/obsidian.ts)
// and adds the jest.fn-wrapped network functions. Split for F4 (Plan 11 Task 1).
export * from './obsidian-core';

// Local wrappers for setIcon/setTooltip so jest.spyOn can reconfigure them
import * as obsidianCore from './obsidian-core';
export function setIcon(el: HTMLElement, iconId: string): void {
	return obsidianCore.setIcon(el, iconId);
}
export function setTooltip(el: HTMLElement, tooltip: string, _options?: any): void {
	return obsidianCore.setTooltip(el, tooltip, _options);
}

export const request = jest.fn(async (_params: any): Promise<string> => '');
export const requestUrl = jest.fn(async (_params: any): Promise<any> => ({
	status: 200,
	text: '',
	json: {},
	arrayBuffer: new ArrayBuffer(0),
}));
