import {DrawSteelAdmonition} from "./drawSteelAdmonition";
import {Modal} from "obsidian";
import {PowerRollAdmonition} from "./powerRollAdmonition";

export enum DrawSteelAdmonitionType {
	PowerRoll = "powerRoll",
}

export namespace DrawSteelAdmonitionType {
	export function create(type: DrawSteelAdmonitionType): DrawSteelAdmonition {
		switch (type) {
			case DrawSteelAdmonitionType.PowerRoll:
				return PowerRollAdmonition.create();
			default:
				throw new Error("Cannot create, invalid Inline Admonition type")
		}
	}

	export function from(type: string): DrawSteelAdmonitionType {
		switch (type) {
			case DrawSteelAdmonitionType.PowerRoll:
				return DrawSteelAdmonitionType.PowerRoll
			default:
				throw new Error("Invalid Inline Admonition type: " + type)
		}
	}

	// for convenience...
	export function createFrom(type: string): DrawSteelAdmonition {
		return create(from(type));
	}

	export function unmarshal(data: any) {
		const type = from(data.type)
		switch (type) {
			case DrawSteelAdmonitionType.PowerRoll:
				return PowerRollAdmonition.unmarshal(data);
			default:
				throw new Error("Cannot Unmarshal, invalid Inline Admonition type: " + type)
		}
	}

	export function tooltip(): string {
		return `
The "type" defines what triggers an Inline Admonition
		
 - Prefix: Triggered if a codeblock starts with the string.
 - Suffix: Triggered if a codeblock ends with the string.
 - Contains: Triggered if a codeblock contains the string anywhere within it.
 `
	}
}

export class TypeTooltipModal extends Modal {
	onOpen() {
		super.onOpen();
		const {contentEl} = this;
		contentEl.createDiv({
			text: DrawSteelAdmonitionType.tooltip(),
			attr: {"style": "white-space: pre-wrap;"}
		});
	}
}
