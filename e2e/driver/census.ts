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

let groupSeq = 0;

/**
 * Every element matching any of `selectors` (and not inside `excludeInside`; `null` excludes nothing, SC-437:
 * the tracker's census covers its own chrome-panel items) that has at least one user-input listener, with its
 * control id (or null), in scope order (each selector's matches in document order).
 *
 * SC-593: a handful of CDP round trips however large the scope is. The old walk asked `DOMDebugger.getEventListeners` about every
 * node in scope, one sequential round trip each (~500 on the tracker, x5 scans in CENSUS-07), so under machine load the latency
 * multiplied into the 45 s test budget. Now `getEventListeners` runs once per top-level in-scope element (the scope minus the
 * elements that sit under another in-scope element) with `depth: -1`: it returns every listener in that subtree, each carrying the
 * `backendNodeId` of the node it sits on. Only the nodes that have an input listener are resolved to remote objects, and ONE
 * `callFunctionOn` on the in-scope array takes them as arguments to drop the ones outside the scope (a subtree can hold excluded
 * nodes), put the rest in scope order and read their attributes. Every remote object lives in one object group, released at the end.
 */
export async function eventfulNodes(selectors: string[], excludeInside: string | null = '[data-dse-chrome-item]'): Promise<EventfulNode[]> {
	const objectGroup = `dse-census-${++groupSeq}`;
	try {
		const expr = `(() => {
			const seen = new Set();
			for (const sel of ${JSON.stringify(selectors)}) for (const el of document.querySelectorAll(sel)) if (!${JSON.stringify(excludeInside)} || !el.closest(${JSON.stringify(excludeInside)})) seen.add(el);
			return Array.from(seen);
		})()`;
		const scope = await cdp<{ result: { objectId: string } }>('Runtime.evaluate', { expression: expr, objectGroup });
		const rootsArr = await cdp<{ result: { objectId: string } }>('Runtime.callFunctionOn', {
			objectId: scope.result.objectId,
			objectGroup,
			functionDeclaration: `function () {
				const inScope = new Set(this);
				return this.filter((el) => { for (let a = el.parentElement; a; a = a.parentElement) if (inScope.has(a)) return false; return true; });
			}`,
		});
		const rootProps = await cdp<{ result: Array<{ name: string; value?: { objectId?: string } }> }>('Runtime.getProperties', { objectId: rootsArr.result.objectId, ownProperties: true });
		const roots = rootProps.result.filter((p) => /^\d+$/.test(p.name) && p.value?.objectId).map((p) => p.value!.objectId!);
		const replies = await Promise.all(roots.map((objectId) => cdp<{ listeners: Array<{ type: string; backendNodeId?: number }> }>('DOMDebugger.getEventListeners', { objectId, depth: -1 })));
		// Per node, the input event types in the order the listeners were reported (the order the per-node walk gave).
		const eventsOf = new Map<number, string[]>();
		for (const { listeners } of replies) {
			for (const l of listeners) {
				if (l.backendNodeId === undefined || !INPUT_EVENTS.has(l.type)) continue;
				const list = eventsOf.get(l.backendNodeId) ?? [];
				if (!list.includes(l.type)) list.push(l.type);
				eventsOf.set(l.backendNodeId, list);
			}
		}
		const backendIds = Array.from(eventsOf.keys());
		const resolved = await Promise.all(backendIds.map((backendNodeId) => cdp<{ object: { objectId: string } }>('DOM.resolveNode', { backendNodeId, objectGroup })));
		const read = await cdp<{ result: { value: Array<{ k: number; at: number; d: Omit<EventfulNode, 'events'> }> } }>('Runtime.callFunctionOn', {
			objectId: scope.result.objectId,
			returnByValue: true,
			arguments: resolved.map((r) => ({ objectId: r.object.objectId })),
			functionDeclaration: `function (...els) {
				const out = [];
				els.forEach((el, k) => {
					const at = this.indexOf(el);
					if (at >= 0) out.push({ k, at, d: { id: el.getAttribute('data-dse-control'), tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 80), text: (el.textContent || '').trim().slice(0, 30) } });
				});
				return out.sort((a, b) => a.at - b.at);
			}`,
		});
		return read.result.value.map((r) => ({ ...r.d, events: eventsOf.get(backendIds[r.k])! }));
	} finally {
		await cdp('Runtime.releaseObjectGroup', { objectGroup });
	}
}

/**
 * Problems: eventful nodes with no id, or an id the manifest does not declare. `inert` (SC-437) names ids the manifest declares with
 * NO interaction (a focus target nothing clicks): a node carrying one that now listens for input is a control nobody declared kinds for.
 */
export function censusFindings(nodes: EventfulNode[], allowed: ReadonlySet<string>, inert: ReadonlySet<string> = new Set()): string[] {
	const problems: string[] = [];
	for (const n of nodes) {
		const where = `<${n.tag} class="${n.cls}"> "${n.text}" listens for ${n.events.join(',')}`;
		if (!n.id) problems.push(`no data-dse-control: ${where}`);
		else if (!allowed.has(n.id)) problems.push(`id "${n.id}" is not in the manifest: ${where}`);
		else if (inert.has(n.id)) problems.push(`id "${n.id}" is declared with no interaction but listens for input: ${where}`);
	}
	return problems;
}
