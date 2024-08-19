import {DrawSteelAdmonitionType} from "./drawSteelAdmonitionType";
import {Setting} from "obsidian";
import {v4 as uuidv4} from "uuid";
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

	// TODO - remove
	public cssClasses(): string[] {
		return ["dsa"];
	}

	copySettingsTo(other: DrawSteelAdmonition) {
	}

	public toString = (): string => {
		return "DrawSteelAdmonition(" + this.type + ")"
	}

	static generateSlug(): string {
		return uuidv4();
	}
}
