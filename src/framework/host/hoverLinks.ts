// SC-594: which link a hover preview was opened for.
//
// A hover preview (`.popover.hover-popover`) draws a heading's or a block's part of a note, and the card in it is given a section that does
// not say where it sits in the note (a heading's BODY without the heading line; a block's own lines): the only thing that names the place is
// the link the preview was opened for. Obsidian announces every hover with the workspace event `hover-link` ({ linktext, sourcePath,
// hoverParent }; named in the public docs, its payload is untyped), and the popover it opens is `hoverParent.hoverPopover`. The log below
// keeps the last events; `hoverLinkOf` hands a card the link of ITS popover, bound once (see there). No event, no link: the caller refuses.
import type { App, Plugin } from 'obsidian';
import { normalizeHeadingName } from './headingNames';

export type HoverLink = { linktext: string; sourcePath: string };

type HoverLinkEvent = { linktext?: unknown; sourcePath?: unknown; hoverParent?: { hoverPopover?: { hoverEl?: unknown } | null } | null };

/** The log is bounded: the last 16 events are far more than the hovers that can be open at once. */
const LOG_SIZE = 16;

type HoverLinkLog = {
	events: HoverLinkEvent[];
	/** popover element -> the link bound to it at its first lookup (null: it had none then, and keeps none). */
	bound: WeakMap<Element, HoverLink | null>;
};

/** Per app (an app has one plugin of ours; a test makes a fresh app per test and so gets a fresh log). */
const logs = new WeakMap<object, HoverLinkLog>();

function logOf(app: object): HoverLinkLog {
	let log = logs.get(app);
	if (!log) logs.set(app, (log = { events: [], bound: new WeakMap() }));
	return log;
}

/**
 * The plugin's `onload` side: record every `hover-link` event the workspace fires (removed with the plugin by `registerEvent`).
 * SC-594: a preview that is already open now was opened by an event this log never saw, so it is bound to NO link (a later event of its parent
 * would otherwise be taken for the event that opened it). Turning the plugin off and on closes such a preview in Obsidian 1.15.1; this makes
 * that true by construction.
 */
export function registerHoverLinks(plugin: Plugin): void {
	const app: App = plugin.app;
	const log = logOf(app);
	const docs = new Set<Document>();
	if (typeof document !== 'undefined') docs.add(document);
	const active = (globalThis as { activeDocument?: Document }).activeDocument;
	if (active) docs.add(active);
	for (const doc of docs) doc.querySelectorAll('.hover-popover').forEach((open) => log.bound.set(open, null));
	plugin.registerEvent(app.workspace.on('hover-link' as never, ((ev: HoverLinkEvent) => noteHoverLink(app, ev)) as never));
}

/**
 * One `hover-link` event. An event without a link text is ignored.
 * SC-594: before it is recorded, every popover that is open now and not yet bound is bound to the newest event recorded so far that names it:
 * that is the event that opened it, because nothing newer exists. (Measured in Obsidian 1.15.1: a card is drawn into its popover while it is
 * still detached, so a card cannot ask which popover it is in until a click; a pass-over of another link on the same parent can come first.)
 */
export function noteHoverLink(app: object, ev: HoverLinkEvent | null | undefined): void {
	if (!ev || typeof ev.linktext !== 'string') return;
	const log = logOf(app);
	for (let i = log.events.length - 1; i >= 0; i--) {
		const popover = log.events[i].hoverParent?.hoverPopover?.hoverEl;
		if (typeof popover === 'object' && popover !== null && !log.bound.has(popover as Element)) log.bound.set(popover as Element, linkOfEvent(log.events[i]));
	}
	log.events.push(ev);
	if (log.events.length > LOG_SIZE) log.events.shift();
}

const linkOfEvent = (ev: HoverLinkEvent): HoverLink => ({ linktext: ev.linktext as string, sourcePath: typeof ev.sourcePath === 'string' ? ev.sourcePath : '' });

/**
 * The link of the hover preview the element `el` is drawn in, or null (not in a hover preview; no event names that preview).
 * SC-594: the event matches by the popover's element (`hoverParent.hoverPopover.hoverEl` IS `el`'s `.hover-popover`; identity, not `contains`:
 * a nested or a sibling popover is another element). The link is bound to the popover ONCE, at the first lookup for that element or at the next
 * event (`noteHoverLink`), whichever comes first, and every later lookup in that popover (a redraw of its card, a second +) gets the same link:
 * while preview X is open the pointer can pass over another link Y on the same parent whose preview never opens, and Y's event would otherwise
 * become "the newest event of X's parent" and name Y's place for X's card (two headings whose bodies are the same counter: X's + would be written
 * at Y; measured in Obsidian 1.15.1, the click wrote the other counter). The bound link is also checked against the preview's own DOM (`popoverShows`).
 */
export function hoverLinkOf(app: object, el: Element): HoverLink | null {
	const popover = el.closest('.hover-popover');
	if (!popover) return null;
	const log = logOf(app);
	let link: HoverLink | null;
	if (log.bound.has(popover)) link = log.bound.get(popover) ?? null;
	else {
		link = null;
		for (let i = log.events.length - 1; i >= 0 && link === null; i--) if (log.events[i].hoverParent?.hoverPopover?.hoverEl === popover) link = linkOfEvent(log.events[i]);
		log.bound.set(popover, link);
	}
	// the preview must show what the bound link names (`popoverShows`): a link another event bound here is refused
	return link !== null && popoverShows(popover, link.linktext) ? link : null;
}

/**
 * SC-594: whether the hover preview `popover` shows what `linktext` names, read from the preview's own DOM (measured, Obsidian 1.15.1, Reading view and
 * Live Preview): a heading link draws `.markdown-embed[data-type=heading]` whose first heading carries `data-heading` = the heading's name, a block link
 * `data-type=block`, a link to a whole note neither. A link bound to the wrong preview (another link's event named this popover) fails this and the
 * card's write is refused.
 */
export function popoverShows(popover: Element, linktext: string): boolean {
	const type = popover.querySelector('.markdown-embed')?.getAttribute('data-type') ?? null;
	const hash = linktext.indexOf('#');
	if (hash < 0) return type !== 'heading' && type !== 'block';
	const subpath = linktext.slice(hash);
	if (subpath.startsWith('#^')) return type === 'block';
	if (type !== 'heading') return false;
	const shown = popover.querySelector('.markdown-embed [data-heading]')?.getAttribute('data-heading');
	return typeof shown === 'string' && normalizeHeadingName(shown) === normalizeHeadingName(subpath.split('#').pop() ?? '');
}
