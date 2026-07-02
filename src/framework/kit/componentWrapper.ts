// D1 Task 2 (Plan 03) / F1 §6 step "Skills" — kit/componentWrapper: vanilla DOM port of
// Common/ComponentWrapper.vue + Common/ComponentHideIndicator.vue + the collapsed-state
// rail from VerticalRule.vue. First occupant of framework/kit/ alongside collapsible.ts
// (OD-D1-2: "seed kit/ now"). Reused by Skills today; Stamina Bar reuses it in D1 step 3
// (D1 spec §3 CSS table) — keep it small + reusable, D2 extends.
//
// Honors the preserved `collapsible` / `collapse_default` YAML contract (F1 §1.4) via the
// ALREADY-RESOLVED booleans the caller passes in (@model/ComponentWrapper bakes in the
// collapsible:true / collapse_default:false defaults today — this widget does not
// re-implement that defaulting).
//
// Session-agnostic by design: the widget holds no SessionStore/Obsidian-service dependency
// of its own — the calling ElementView owns reading the initial `collapsed` value from
// SessionStore and persisting it back via `onToggle` (mirrors collapsible.ts's split).
// `owner` only lifecycle-binds the click listener (F1 §4.5).
//
// Per-cycle content teardown (Plan 05 Task 1 kit hardening): renderContent runs at mount
// AND on every re-expand, but bodyEl.empty() only clears DOM — it never released
// registerDomEvent/register handles bound to the long-lived view, so every collapse↔expand
// cycle stacked one more set of live registrations (survey §5). The content body therefore
// gets its own child Component (`contentOwner`), created fresh each expanded renderBody
// pass via owner.addChild and unloaded via owner.removeChild before the next pass —
// content-internal registrations live exactly one expand cycle. The wrapper's own
// eye-toggle listeners stay on `owner` (view-lifetime), unchanged.
import { Component, setIcon } from 'obsidian';

export interface ComponentWrapperOptions {
	/** Shown in the collapsed-state rail next to the vertical rule (Vue: componentName prop). */
	componentName: string;
	/** Whether the eye-toggle indicator renders at all (Vue: collapsible_modified). */
	collapsible: boolean;
	/** Initial collapsed state (Vue: state.collapsed, seeded from collapse_default_modified). */
	collapsed: boolean;
	/** Builds the wrapped content into the given container. Invoked once now if expanded,
	 *  and again on every expand (Vue only ever mounted the expanded branch via v-if).
	 *  Content-internal listeners MUST bind to `contentOwner` — a fresh child Component per
	 *  render cycle, unloaded on the next collapse/re-expand — never to the long-lived view
	 *  (which would accumulate one registration set per cycle). */
	renderContent: (contentEl: HTMLElement, contentOwner: Component) => void;
	/** Called with the NEW collapsed state whenever the eye indicator is toggled. */
	onToggle: (collapsed: boolean) => void;
}

export interface ComponentWrapperHandle {
	readonly wrapperEl: HTMLElement;
	isCollapsed(): boolean;
}

/** DOM port of VerticalRule.vue's default (non-inverted) rendering — purely decorative,
 *  shown only in the collapsed-state rail (ComponentWrapper.vue never passes `inverted`). */
function mountVerticalRule(parent: HTMLElement): void {
	const container = parent.createDiv({ cls: 'ds-kit-v-rule-container' });
	const wrapper = container.createDiv({ cls: 'ds-kit-v-rule-wrapper' });
	wrapper.createDiv({ cls: 'ds-kit-v-rule-line ds-kit-v-rule-line-top' });
	wrapper.createDiv({ cls: 'ds-kit-v-rule-line-center' });
	wrapper.createDiv({ cls: 'ds-kit-v-rule-line ds-kit-v-rule-line-bottom' });
}

/**
 * Mounts the collapsible chrome ComponentWrapper.vue provided to every wrapped element.
 * Structure mirrors the Vue template 1:1: an optional eye-toggle indicator, then either
 * the rendered content (expanded) or a vertical-rule + component-name rail (collapsed).
 */
export function mountComponentWrapper(
	parent: HTMLElement,
	owner: Component,
	options: ComponentWrapperOptions,
): ComponentWrapperHandle {
	const wrapperEl = parent.createDiv({ cls: 'ds-kit-component-wrapper' });
	let collapsed = options.collapsed;
	let bodyEl!: HTMLElement;
	/** The current render cycle's content Component — see the file header. Null while
	 *  collapsed (no content is mounted, so nothing to lifecycle-bind). */
	let contentOwner: Component | null = null;

	const applyIcon = (eyeIndicator: HTMLElement): void => setIcon(eyeIndicator, collapsed ? 'eye-off' : 'eye');

	const renderBody = (): void => {
		if (contentOwner) {
			// Unloads the child, releasing every registerDomEvent/register handle the
			// previous cycle's renderContent bound to it.
			owner.removeChild(contentOwner);
			contentOwner = null;
		}
		bodyEl.empty();
		if (collapsed) {
			const collapsedWrapper = bodyEl.createDiv({ cls: 'ds-kit-collapsed-wrapper' });
			mountVerticalRule(collapsedWrapper);
			collapsedWrapper.createEl('strong', { text: options.componentName });
		} else {
			const contentEl = bodyEl.createDiv();
			contentOwner = owner.addChild(new Component());
			options.renderContent(contentEl, contentOwner);
		}
	};

	if (options.collapsible) {
		const eyeContainer = wrapperEl.createSpan({ cls: 'ds-kit-eye-container' });
		const eyeIndicator = eyeContainer.createSpan({ cls: 'ds-kit-eye-indicator' });
		applyIcon(eyeIndicator);

		const handleClick = (event: Event): void => {
			event.preventDefault();
			event.stopPropagation();
			collapsed = !collapsed;
			applyIcon(eyeIndicator);
			renderBody();
			options.onToggle(collapsed);
		};
		// Vue: @mousedown.stop @click.capture.stop.prevent
		owner.registerDomEvent(eyeIndicator, 'mousedown', (event: Event) => event.stopPropagation());
		owner.registerDomEvent(eyeIndicator, 'click', handleClick, { capture: true });
	}

	bodyEl = wrapperEl.createDiv({ cls: 'ds-kit-component-wrapper-body' });
	renderBody();

	return {
		wrapperEl,
		isCollapsed: () => collapsed,
	};
}
