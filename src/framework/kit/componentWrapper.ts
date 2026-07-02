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
import type { Component } from 'obsidian';
import { setIcon } from 'obsidian';

export interface ComponentWrapperOptions {
	/** Shown in the collapsed-state rail next to the vertical rule (Vue: componentName prop). */
	componentName: string;
	/** Whether the eye-toggle indicator renders at all (Vue: collapsible_modified). */
	collapsible: boolean;
	/** Initial collapsed state (Vue: state.collapsed, seeded from collapse_default_modified). */
	collapsed: boolean;
	/** Builds the wrapped content into the given container. Invoked once now if expanded,
	 *  and again on every expand (Vue only ever mounted the expanded branch via v-if). */
	renderContent: (contentEl: HTMLElement) => void;
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

	const applyIcon = (eyeIndicator: HTMLElement): void => setIcon(eyeIndicator, collapsed ? 'eye-off' : 'eye');

	const renderBody = (): void => {
		bodyEl.empty();
		if (collapsed) {
			const collapsedWrapper = bodyEl.createDiv({ cls: 'ds-kit-collapsed-wrapper' });
			mountVerticalRule(collapsedWrapper);
			collapsedWrapper.createEl('strong', { text: options.componentName });
		} else {
			const contentEl = bodyEl.createDiv();
			options.renderContent(contentEl);
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
