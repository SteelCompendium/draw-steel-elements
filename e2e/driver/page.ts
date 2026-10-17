// SC-408 e2e driver: raw CDP evaluation inside the Obsidian page (the lifecycle gate's
// `t.ev`), through wdio's chromedriver passthrough. String expressions only - tsx/esbuild can
// inject helpers (`__name`) into stringified functions, which breaks browser.execute(fn).
import { browser } from '@wdio/globals';

/** Evaluate `expr` in the page (awaiting promises) and return its JSON value. */
export async function ev<T = unknown>(expr: string): Promise<T> {
	const r = (await browser.sendCommandAndGetResult('Runtime.evaluate', {
		expression: expr,
		awaitPromise: true,
		returnByValue: true,
	})) as { result?: { value?: T }; exceptionDetails?: { text?: string; exception?: { description?: string } } };
	if (r.exceptionDetails) {
		throw new Error(`page eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
	}
	return r.result?.value as T;
}

/** Poll `expr` (page-side) until truthy. Event-driven callers should prefer waitUntil on a
 *  concrete state; this is for "the page reached X" checks, never a fixed sleep. */
export async function waitFor(expr: string, what: string, timeoutMs = 15000): Promise<void> {
	await browser.waitUntil(async () => Boolean(await ev(expr)), {
		timeout: timeoutMs,
		interval: 40,
		timeoutMsg: `timed out waiting for ${what}`,
	});
}

/** The DSE plugin's ViewRegistry, as a page-side expression. */
export const REGISTRY = `app.plugins.plugins['draw-steel-elements'].viewRegistry`;
