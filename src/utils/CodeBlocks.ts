import {App, MarkdownPostProcessorContext, TFile, stringifyYaml, ItemView} from "obsidian";
import {EncounterData} from "@drawSteelAdmonition/EncounterData";
import {NegotiationData} from "@model/NegotiationData";
import {StaminaBar} from "@model/StaminaBar";
import {Counter} from "@model/Counter";

// Obsidian's runtime `MarkdownPostProcessorContext` carries an `el` property (the
// rendered block's container element) that is NOT part of the public `obsidian` type
// declarations — hence the historical `ctx.el` tsc complaint this type replaces. This
// is a type-only alias: it documents the runtime shape already being relied on below,
// it does not change what property is read or how.
type ContextWithEl = MarkdownPostProcessorContext & { el: HTMLElement };

// Obsidian's Canvas internals (canvas view + its selected nodes) are likewise NOT
// part of the public `obsidian` type declarations — same situation as `ContextWithEl`
// above. These are type-only aliases documenting the runtime shape already relied on
// by findCanvasNodeAndUpdate/updateCanvasCard below (a text-node's `.text`, its
// `getData()`/`setData()` pair, and the parent canvas's `.selection`/`.getData()`/
// `.view.requestSave()`); no behavior changes, no new fields read or written.
interface CanvasNode {
	text?: string;
	getData(): Record<string, unknown>;
	setData(data: Record<string, unknown>): void;
}

interface Canvas {
	selection: Iterable<CanvasNode>;
	getData(): unknown;
	view: { requestSave(): void };
}

export class CodeBlocks {
	static async updateInitiativeTracker(app: App, data: EncounterData, ctx: MarkdownPostProcessorContext): Promise<void> {
		return CodeBlocks.updateCodeBlock(app, data, ctx, "ds-initiative");
	}

	static async updateNegotiationTracker(app: App, data: NegotiationData, ctx: MarkdownPostProcessorContext): Promise<void> {
		return CodeBlocks.updateCodeBlock(app, data, ctx, "ds-negotiation-tracker");
	}

	static async updateStatblock(app: App, data: NegotiationData, ctx: MarkdownPostProcessorContext): Promise<void> {
		return CodeBlocks.updateCodeBlock(app, data, ctx, "ds-statblock");
	}

	static async updateStaminaBar(app: App, data: StaminaBar, ctx: MarkdownPostProcessorContext): Promise<void> {
		return CodeBlocks.updateCodeBlock(app, data, ctx, "ds-stamina");
	}

	static async updateCounter(app: App, data: Counter, ctx: MarkdownPostProcessorContext): Promise<void> {
		return CodeBlocks.updateCodeBlock(app, data, ctx, "ds-counter");
	}

	// TODO - can extract language out from ctx
	static async updateCodeBlock(app: App, data: unknown, ctx: MarkdownPostProcessorContext, language: string): Promise<void> {
		let file: TFile | null = null;

		if (ctx.sourcePath) {
			// For regular Markdown notes
			const abstractFile = app.vault.getAbstractFileByPath(ctx.sourcePath);
			if (!(abstractFile instanceof TFile)) {
				console.warn("Unable to find the file to update.");
				return;
			}
			file = abstractFile;
			await this.updateMarkdownCodeBlock(app, file, data, ctx, language);
		} else {
			// Attempt to find the canvas file that contains the node with this ctx
			await this.findCanvasNodeAndUpdate(app, ctx, data, language);
		}
	}

	static async findCanvasNodeAndUpdate(app: App, ctx: MarkdownPostProcessorContext, data: unknown, language: string) {
		const canvasView = app.workspace.getActiveViewOfType(ItemView);
		if (canvasView?.getViewType() !== 'canvas') {
			console.warn("Failed to find canvas associated with markdown context.  Change NOT saved.")
			return;
		}
		const canvas = (canvasView as unknown as { canvas: Canvas }).canvas;
		const selection: CanvasNode[] = Array.from(canvas.selection);

		for (const node of selection) {
			// console.log(node.text);
			// console.log(ctx.getSectionInfo(ctx.el).text);
			if (node.text === ctx.getSectionInfo((ctx as ContextWithEl).el)?.text) {
				await this.updateCanvasCard(app, canvas, node, data, language);
				return;
			}
		}

		// No canvas file contains the node
		console.warn("Failed to find canvas associated with markdown context.  Change NOT saved.");
		return;
	}

	static async updateCanvasCard(app: App, canvas: Canvas, node: CanvasNode, data: unknown, language: string) {
		const newCodeBlockContent = [];
		newCodeBlockContent.push('```' + language);
		newCodeBlockContent.push(stringifyYaml(data).trim());
		newCodeBlockContent.push('```');
		node.setData({
			...node.getData(),
			text: newCodeBlockContent.join('\n')
		});
		canvas.getData()
		canvas.view.requestSave();
		return;
	}

	static async updateMarkdownCodeBlock(app: App, file: TFile, data: unknown, ctx: MarkdownPostProcessorContext, language: string): Promise<void> {
		const content = await app.vault.read(file);
		const lines = content.split('\n');

		const section = ctx.getSectionInfo((ctx as ContextWithEl).el);
		if (!section) return;

		const {lineStart, lineEnd} = section;

		// Reconstruct the code block with the updated data
		const newCodeBlockContent = [];
		newCodeBlockContent.push('```' + language);
		newCodeBlockContent.push(stringifyYaml(data).trim());
		newCodeBlockContent.push('```');

		// Replace the old code block with the new one
		lines.splice(lineStart, lineEnd - lineStart + 1, ...newCodeBlockContent);

		const newContent = lines.join('\n');

		// Write the updated content back to the file
		await app.vault.modify(file, newContent);
	}
}
