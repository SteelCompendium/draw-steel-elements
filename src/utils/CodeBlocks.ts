import { App, MarkdownPostProcessorContext, TFile, stringifyYaml } from "obsidian";

export class CodeBlocks {
	static async updateCodeBlock(app: App, data: any, ctx: MarkdownPostProcessorContext): Promise<void> {
		const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const content = await app.vault.read(file);
		const lines = content.split('\n');

		const section = ctx.getSectionInfo(ctx.el);
		if (!section) return;

		const { lineStart, lineEnd } = section;

		// Reconstruct the code block with the updated data
		const newCodeBlockContent = [];
		newCodeBlockContent.push('```' + "ds-initiative");
		newCodeBlockContent.push(stringifyYaml(data).trim());
		newCodeBlockContent.push('```');

		// Replace the old code block with the new one
		lines.splice(lineStart, lineEnd - lineStart + 1, ...newCodeBlockContent);

		const newContent = lines.join('\n');

		// Write the updated content back to the file
		await app.vault.modify(file, newContent);
	}
}
