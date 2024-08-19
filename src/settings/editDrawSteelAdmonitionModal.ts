// Model to edit a single Inline Admonition's settings
import {App, Modal, Setting} from "obsidian";
import {DrawSteelAdmonition} from "../drawSteelAdmonition/drawSteelAdmonition";
import {PowerRollAdmonition} from "../drawSteelAdmonition/powerRollAdmonition";
import {DrawSteelAdmonitionType, TypeTooltipModal} from "../drawSteelAdmonition/drawSteelAdmonitionType";

export class EditDrawSteelAdmonitionModal extends Modal {
	result: DrawSteelAdmonition;
	onSubmit: (result: DrawSteelAdmonition) => void;
	sample: HTMLElement;
	private typeSettings: Array<Setting> = new Array<Setting>();

	static edit(app: App, toEdit: DrawSteelAdmonition, onSubmit: (result: DrawSteelAdmonition) => void) {
		return new EditDrawSteelAdmonitionModal(app, toEdit, onSubmit);
	}

	static new(app: App, onSubmit: (result: DrawSteelAdmonition) => void) {
		return new EditDrawSteelAdmonitionModal(app, PowerRollAdmonition.create(), onSubmit);
	}

	constructor(app: App, toEdit: DrawSteelAdmonition, onSubmit: (result: DrawSteelAdmonition) => void) {
		super(app);
		this.result = toEdit ? toEdit : PowerRollAdmonition.create();
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const {contentEl} = this;

		contentEl.createEl("br");

		const submitSetting = new Setting(contentEl)
			.addButton((btn) => btn
				.setButtonText("Submit")
				.setCta()
				.onClick(() => {
					this.close();
					this.onSubmit(this.result);
				}))

		this.sample = submitSetting.nameEl.createEl("code", {
			text: this.result.sampleText(),
			cls: "dsa dsa-sample dsa-sample-editor dsa-" + this.result.slug,
			attr: {"style": this.result.simpleStyle()}
		});

		new Setting(contentEl)
			.setName("Background color")
			.setDesc("Color of the background of the inline admonition")
			.addColorPicker(cp => cp
				.setValue(this.result.backgroundColor)
				.onChange(val => {
					this.result.backgroundColor = val;
					this.updateSample();
				})
			);
		new Setting(contentEl)
			.setName("Background opacity (0% - 100%)")
			.setDesc("Percentage of opacity to apply to the background color. 0% is fully transparent.")
			.addSlider(s => s
				.setLimits(0, 100, 1)
				.setValue(this.result.bgColorOpacityPercent)
				.onChange(val => {
					this.result.bgColorOpacityPercent = val;
					this.updateSample();
				}));
		new Setting(contentEl)
			.setName("Text color")
			.setDesc("Color of the text of the inline admonition")
			.addColorPicker(cp => cp
				.setValue(this.result.color)
				.onChange(val => {
					this.result.color = val;
					this.updateSample();
				})
			);
		new Setting(contentEl)
			.setName("Text color opacity (0% - 100%)")
			.setDesc("Percentage of opacity to apply to the text color. 0% is fully transparent.")
			.addSlider(s => s
				.setLimits(0, 100, 1)
				.setValue(this.result.colorOpacityPercent)
				.onChange(val => {
					this.result.colorOpacityPercent = val;
					this.updateSample();
				}));
		new Setting(contentEl)
			.setName("Type")
			.setDesc("The way the Inline Admonition is triggered")
			.setTooltip(DrawSteelAdmonitionType.tooltip())
			.addDropdown(dc => dc
				.addOption(DrawSteelAdmonitionType.PowerRoll, DrawSteelAdmonitionType.PowerRoll)
				.setValue(this.result.type)
				.onChange(value => {
					this.clearTypeSettings();
					const old = this.result;
					this.result = DrawSteelAdmonitionType.createFrom(value);
					old.copySettingsTo(this.result)
					this.appendTypeSettings(contentEl);
				}))
			.addButton(btn => btn
				.setIcon("help-circle")
				.onClick(() => {
					new TypeTooltipModal(this.app).open()
				})
			);

		this.appendTypeSettings(contentEl);
	}

	private updateSample() {
		this.sample.setText(this.result.sampleText());
		// TODO - I think this should be extracted out somewhere?
		this.sample.setAttr("style", this.result.simpleStyle() + `margin: 0.5em;`);
	}

	private clearTypeSettings() {
		this.typeSettings.forEach(value => value.settingEl.remove());
	}

	private appendTypeSettings(contentEl: HTMLElement) {
		this.typeSettings = this.result.buildSettings(contentEl, () => this.updateSample());
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}
