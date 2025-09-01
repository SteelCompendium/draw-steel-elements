import {App, MarkdownPostProcessorContext, TFile, stringifyYaml, ItemView} from "obsidian";
import {EncounterData} from "@drawSteelAdmonition/EncounterData";
import {NegotiationData} from "@model/NegotiationData";
import {StaminaBar} from "@model/StaminaBar";
import {Counter} from "@model/Counter";

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
	static async updateCodeBlock(app: App, data: any, ctx: MarkdownPostProcessorContext, language: string): Promise<void> {
		let file: TFile | null = null;

		if (ctx.sourcePath) {
			// For regular Markdown notes
			file = app.vault.getAbstractFileByPath(ctx.sourcePath) as TFile;
			if (!file || !(file instanceof TFile)) {
				console.warn("Unable to find the file to update.");
				return;
			}
			await this.updateMarkdownCodeBlock(app, file, data, ctx, language);
		} else {
			// Attempt to find the canvas file that contains the node with this ctx
			await this.findCanvasNodeAndUpdate(app, ctx, data, language);
		}
	}

	static async findCanvasNodeAndUpdate(app: App, ctx: MarkdownPostProcessorContext, data: any, language: string) {
		const canvasView = app.workspace.getActiveViewOfType(ItemView);
		if (canvasView?.getViewType() !== 'canvas') {
			console.log("Failed to find canvas associated with markdown context.  Change NOT saved.")
			return;
		}
		const canvas = (canvasView as any).canvas;
		const selection: any = Array.from(canvas.selection);

		for (let selectionKey in selection) {
			// console.log(selection[selectionKey].text);
			// console.log(ctx.getSectionInfo(ctx.el).text);
			if (selection[selectionKey].text === ctx.getSectionInfo(ctx.el)?.text) {
				await this.updateCanvasCard(app, canvas, selection[selectionKey], data, language);
				return;
			}
		}

		// No canvas file contains the node
		console.log("Failed to find canvas associated with markdown context.  Change NOT saved.");
		return;
	}

	static async updateCanvasCard(app: App, canvas: any, node: any, data: any, language: string) {
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

	// TODO: Figure out the correct implementation of MarkdownPostProcessorContext
	// to use there as it doesn't have an el property, or otherwise figure out
	// how to ensure ctx.el doesn't complain during a npx tsc -noEmit -skipLibCheck
	static async updateMarkdownCodeBlock(app: App, file: TFile, data: any, ctx: MarkdownPostProcessorContext, language: string): Promise<void> {
		const content = await app.vault.read(file);
		const lines = content.split('\n');

		const section = ctx.getSectionInfo(ctx.el);
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
