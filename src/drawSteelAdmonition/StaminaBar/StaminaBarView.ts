import {Component, MarkdownPostProcessorContext, MarkdownRenderer, Plugin} from "obsidian";
import {StaminaBar} from "../../model/StaminaBar";
import {StaminaEditModal} from "../../views/StaminaEditModal";
import {CodeBlocks} from "../../utils/CodeBlocks";

export class StaminaBarView {
	private plugin: Plugin;
	private data: StaminaBar;
	private ctx: MarkdownPostProcessorContext;

	constructor(plugin: Plugin, data: StaminaBar, ctx: MarkdownPostProcessorContext) {
		this.plugin = plugin;
		this.data = data;
		this.ctx = ctx;
	}

	public build(parent: HTMLElement) {
		const container = parent.createEl("div", {cls: "ds-stamina-bar-container"});

		const staminaBarContainer = container.createEl('div', {cls: 'stamina-bar-container'});
		if (this.data.height) {
			staminaBarContainer.style.height = this.data.height + "em"
		}
		const staminaBarOverlay = staminaBarContainer.createEl('div', {cls: 'stamina-bar-overlay', text: "Dying"});
		const staminaBar = staminaBarContainer.createEl('div', {cls: 'stamina-bar'});
		const staminaBarFillLeft = staminaBar.createEl('div', {cls: 'stamina-bar-fill-left'});
		const staminaBarFillRight = staminaBar.createEl('div', {cls: 'stamina-bar-fill-right'});

		// Update the STAMINA bar display
		this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight);

		container.addEventListener("click", () => {
			const modal = new StaminaEditModal(this.plugin.app, this.data, true, "", () => {
				console.log(this.data);
				this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight);
				CodeBlocks.updateStaminaBar(this.plugin.app, this.data, this.ctx);
			});
			modal.open();
		});
	}

	// This will parse a string and render it as markdown
	private renderMD(ctx: MarkdownPostProcessorContext, markdown: string, el: HTMLElement) {
		el.addClass("staminaBar-inline-p");
		MarkdownRenderer.render(this.plugin.app, markdown, el, ctx.sourcePath, this.plugin as Component);
	}

	private updateStaminaBar(staminaBarFillLeft: HTMLElement, staminaBarFillRight: HTMLElement) {
		const dyingLength = Math.ceil(-0.5 * this.data.max_stamina) * -1;
		const barLength = this.data.max_stamina + dyingLength;
		staminaBarFillLeft.style.width = `${((this.data.current_stamina + dyingLength) / barLength) * 100}%`;
		staminaBarFillLeft.style.backgroundColor = 'limegreen';
		staminaBarFillRight.style.width = `0%`;
		staminaBarFillRight.style.backgroundColor = 'deepskyblue';
	}
}
