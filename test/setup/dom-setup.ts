// Installs Obsidian's HTMLElement prototype extensions and DOM-building globals
// under jsdom. The `obsidian` package's type declarations already declare these
// shapes globally; this file supplies the runtime.

type DomElementInfo = {
	cls?: string | string[];
	text?: string;
	attr?: Record<string, string | number | boolean | null>;
	title?: string;
	value?: string;
	type?: string;
	placeholder?: string;
	href?: string;
};

function applyInfo(el: HTMLElement, info?: DomElementInfo | string): void {
	if (typeof info === 'string') {
		el.className = info;
		return;
	}
	if (!info) return;
	if (info.cls) el.className = Array.isArray(info.cls) ? info.cls.join(' ') : info.cls;
	if (info.text != null) el.textContent = info.text;
	if (info.attr) {
		for (const [key, value] of Object.entries(info.attr)) {
			if (value != null) el.setAttribute(key, String(value));
		}
	}
	if (info.title != null) el.title = info.title;
	if (info.type != null) (el as HTMLInputElement).type = info.type;
	if (info.value != null) (el as HTMLInputElement).value = info.value;
	if (info.placeholder != null) (el as HTMLInputElement).placeholder = info.placeholder;
	if (info.href != null) (el as HTMLAnchorElement).href = info.href;
}

const proto = HTMLElement.prototype as any;

proto.createEl = function (
	tag: string,
	info?: DomElementInfo | string,
	callback?: (el: HTMLElement) => void,
): HTMLElement {
	const el = this.ownerDocument.createElement(tag);
	applyInfo(el, info);
	this.appendChild(el);
	callback?.(el);
	return el;
};
proto.createDiv = function (info?: DomElementInfo | string, callback?: (el: HTMLElement) => void) {
	return this.createEl('div', info, callback);
};
proto.createSpan = function (info?: DomElementInfo | string, callback?: (el: HTMLElement) => void) {
	return this.createEl('span', info, callback);
};
proto.empty = function () {
	while (this.firstChild) this.removeChild(this.firstChild);
};
proto.setText = function (text: string) {
	this.textContent = text;
};
proto.appendText = function (text: string) {
	this.appendChild(this.ownerDocument.createTextNode(text));
};
proto.addClass = function (...classes: string[]) {
	this.classList.add(...classes);
};
proto.removeClass = function (...classes: string[]) {
	this.classList.remove(...classes);
};
proto.toggleClass = function (classes: string | string[], value: boolean) {
	const list = Array.isArray(classes) ? classes : [classes];
	for (const cls of list) this.classList.toggle(cls, value);
};
proto.hasClass = function (cls: string): boolean {
	return this.classList.contains(cls);
};

// Obsidian also provides bare globals (used by e.g. src/elements/counter/view.ts).
(globalThis as any).createEl = (
	tag: string,
	info?: DomElementInfo | string,
	callback?: (el: HTMLElement) => void,
): HTMLElement => {
	const el = document.createElement(tag);
	applyInfo(el, info);
	callback?.(el);
	return el;
};
(globalThis as any).createDiv = (info?: DomElementInfo | string, callback?: (el: HTMLElement) => void) =>
	(globalThis as any).createEl('div', info, callback);
(globalThis as any).createSpan = (info?: DomElementInfo | string, callback?: (el: HTMLElement) => void) =>
	(globalThis as any).createEl('span', info, callback);

// CSS.supports shim — jsdom ships no CSS global, but applyConditionColor (OD-8/SD-2,
// src/elements/conditionColor.ts) validates user color input through
// CSS.supports('color', v). Delegate to jsdom's cssstyle parser: setProperty keeps
// valid values and silently drops invalid ones, which is exactly the accept/reject
// signal the real CSS.supports gives (verified: 'red'/'#ff0000'/'rgb(…)' accepted;
// 'not a color', '; }', 'expression(…)', 'url(javascript:…)' rejected).
if (typeof (globalThis as any).CSS === 'undefined') {
	const probe = document.createElement('div').style;
	(globalThis as any).CSS = {
		supports: (property: string, value: string): boolean => {
			probe.setProperty(property, '');
			probe.setProperty(property, value);
			return probe.getPropertyValue(property) !== '';
		},
	};
}

export {};
