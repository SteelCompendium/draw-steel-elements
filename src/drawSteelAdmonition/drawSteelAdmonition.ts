import {DrawSteelAdmonitionType} from "./drawSteelAdmonitionType";
import {Setting} from "obsidian";
import {SyntaxNodeRef} from "@lezer/common";
import {Decoration} from "@codemirror/view";
import {RangeSetBuilder} from "@codemirror/state";

export abstract class DrawSteelAdmonition {
	type: DrawSteelAdmonitionType;

	protected constructor() {
	}

	public abstract process(codeElement: HTMLElement): void;

	public abstract applyTo(node: SyntaxNodeRef, content: string, builder: RangeSetBuilder<Decoration>): void;

	abstract buildSettings(contentEl: HTMLElement, updateSampleFunction: () => void): Array<Setting>;

	copySettingsTo(other: DrawSteelAdmonition) {
	}

	public toString = (): string => {
		return "DrawSteelAdmonition(" + this.type + ")"
	}
}
