import {App, TFile} from "obsidian";

export const DEFAULT_IMAGE_PATH = 'Media/token_1.png';

export class Images {
	static async resolveImageSource(app: App, imgSrcRaw: string): Promise<string> {
		// Check if it's an Obsidian link
		const obsidianLinkMatch = imgSrcRaw.match(/!\[\[(.+?)\]\]/);
		if (obsidianLinkMatch) {
			const fileName = obsidianLinkMatch[1];
			const file = app.metadataCache.getFirstLinkpathDest(fileName, '');
			if (file instanceof TFile) {
				return app.vault.getResourcePath(file);
			} else {
				throw new Error('Image file not found in vault.');
			}
		}

		// Check if it's a URL
		if (imgSrcRaw.match(/^https?:\/\//)) {
			return imgSrcRaw;
		}

		// Assume it's a vault path
		const file = app.vault.getAbstractFileByPath(imgSrcRaw);
		if (file instanceof TFile) {
			return app.vault.getResourcePath(file);
		} else {
			throw new Error('Image file not found in vault.');
		}
	}
}
