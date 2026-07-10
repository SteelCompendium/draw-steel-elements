// visual-harness/shim/obsidian.ts — the F4 harness's browser-grade `obsidian` module.
// esbuild (visual-harness/esbuild.mjs) aliases the bare `obsidian` specifier here for the
// harness bundle ONLY. Re-exports the jest-free mock core and shadows the visual-fidelity
// pieces: real Lucide SVG icons, real markdown rendering (marked), a visible Notice toast,
// and jest-free network stubs. Under jest, `obsidian` maps to test/mocks/obsidian.ts —
// this file is only typechecked there, never executed.
export * from '../../test/mocks/obsidian-core';
import type { Component } from '../../test/mocks/obsidian-core';
import { icons, createElement as lucideCreateElement } from 'lucide';
import { marked } from 'marked';

function pascal(iconId: string): string {
	return iconId
		.split('-')
		.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
		.join('');
}

/** Real Lucide SVGs (Obsidian's icon set). Falls back to the core's data-icon stamp. */
export function setIcon(el: HTMLElement, iconId: string): void {
	const node = (icons as Record<string, unknown>)[pascal(iconId)];
	while (el.firstChild) el.removeChild(el.firstChild);
	if (node) {
		const svg = lucideCreateElement(node as never);
		svg.setAttribute('width', '16');
		svg.setAttribute('height', '16');
		el.appendChild(svg);
	}
	el.setAttribute('data-icon', iconId); // parity with the test mock, useful for debugging
}

export class MarkdownRenderer {
	static async render(
		_app: unknown,
		markdown: string,
		el: HTMLElement,
		_sourcePath: string,
		_component: Component,
	): Promise<void> {
		const html = await marked.parse(markdown);
		const tpl = el.ownerDocument.createElement('template');
		tpl.innerHTML = html;
		el.append(tpl.content);
	}
}

export class Notice {
	noticeEl: HTMLElement;
	constructor(message: string | DocumentFragment, _timeout?: number) {
		this.noticeEl = document.createElement('div');
		this.noticeEl.className = 'dse-harness-notice';
		if (typeof message === 'string') this.noticeEl.textContent = message;
		else this.noticeEl.append(message);
		document.body.appendChild(this.noticeEl);
	}
	hide(): void {
		this.noticeEl.remove();
	}
}

export const request = async (_params: unknown): Promise<string> => '';
export const requestUrl = async (
	_params: unknown,
): Promise<{ status: number; text: string; json: unknown; arrayBuffer: ArrayBuffer }> => ({
	status: 200,
	text: '',
	json: {},
	arrayBuffer: new ArrayBuffer(0),
});
