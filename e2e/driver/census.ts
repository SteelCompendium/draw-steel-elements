// SC-408 coverage check (b): the real-Obsidian census. jsdom's census sees semantic controls; this
// one finds the div-with-a-listener controls jsdom cannot reason about, by asking the browser
// itself (CDP DOMDebugger.getEventListeners) which nodes under a scope have click / pointer / key
// listeners. A node that listens for user input but carries no `data-dse-control` id is a control
// nobody declared.
import { browser } from '@wdio/globals';

/** Event types that make a node a control. (`blur`/`focus` are field plumbing, not controls.) */
const INPUT_EVENTS = new Set(['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'keypress', 'touchstart']);

export interface EventfulNode {
	id: string | null;
	tag: string;
	cls: string;
	text: string;
	events: string[];
}

/** One CDP command through chromedriver's passthrough, typed by the reply shape the caller reads. */
const cdp = <T>(cmd: string, params: Record<string, unknown>): Promise<T> => browser.sendCommandAndGetResult(cmd, params) as Promise<T>;

/**
 * Every element matching any of `selectors` (and not inside `excludeInside`) that has at least
 * one user-input listener, with its control id (or null).
 */
export async function eventfulNodes(selectors: string[], excludeInside = '[data-dse-chrome-item]'): Promise<EventfulNode[]> {
	const expr = `(() => {
		const seen = new Set();
		for (const sel of ${JSON.stringify(selectors)}) for (const el of document.querySelectorAll(sel)) if (!el.closest(${JSON.stringify(excludeInside)})) seen.add(el);
		return Array.from(seen);
	})()`;
	const arr = await cdp<{ result: { objectId: string } }>('Runtime.evaluate', { expression: expr });
	const props = await cdp<{ result: Array<{ name: string; value?: { objectId?: string } }> }>('Runtime.getProperties', { objectId: arr.result.objectId, ownProperties: true });
	const out: EventfulNode[] = [];
	for (const p of props.result) {
		if (!/^\d+$/.test(p.name) || !p.value?.objectId) continue;
		const objectId = p.value.objectId;
		const { listeners } = await cdp<{ listeners: Array<{ type: string }> }>('DOMDebugger.getEventListeners', { objectId });
		const events = Array.from(new Set<string>(listeners.map((l) => l.type))).filter((t) => INPUT_EVENTS.has(t));
		if (!events.length) continue;
		const d = await cdp<{ result: { value: Omit<EventfulNode, 'events'> } }>('Runtime.callFunctionOn', {
			objectId,
			returnByValue: true,
			functionDeclaration: `function () { return { id: this.getAttribute('data-dse-control'), tag: this.tagName.toLowerCase(), cls: String(this.className).slice(0, 80), text: (this.textContent || '').trim().slice(0, 30) }; }`,
		});
		out.push({ ...d.result.value, events });
	}
	return out;
}

/** Problems: eventful nodes with no id, or an id the manifest does not declare. */
export function censusFindings(nodes: EventfulNode[], allowed: ReadonlySet<string>): string[] {
	const problems: string[] = [];
	for (const n of nodes) {
		const where = `<${n.tag} class="${n.cls}"> "${n.text}" listens for ${n.events.join(',')}`;
		if (!n.id) problems.push(`no data-dse-control: ${where}`);
		else if (!allowed.has(n.id)) problems.push(`id "${n.id}" is not in the manifest: ${where}`);
	}
	return problems;
}
