import {App, Notice, request, requestUrl, RequestUrlParam} from "obsidian";
import JSZip from "jszip";
import * as console from "console";

export class CompendiumDownloader {
	private app: App;
	private readonly githubOwner: string;
	private readonly githubRepo: string;
	private readonly githubToken: string | undefined;

	constructor(app: App, githubOwner: string, githubRepo: string, githubToken: string | undefined) {
		this.app = app;
		this.githubOwner = githubOwner;
		this.githubRepo = githubRepo;
		this.githubToken = githubToken;
	}

	public async downloadAndExtractRelease(releaseTag: string | undefined, destinationDirectory: string) {
		try {
			let releaseApiUrl = `https://api.github.com/repos/${this.githubOwner}/${this.githubRepo}/releases`;

			if (releaseTag) {
				// Fetch a specific release
				releaseApiUrl += `/tags/${releaseTag}`;
			} else {
				// Fetch the latest release
				releaseApiUrl += '/latest';
			}

			const headers: Record<string, string> = {
				Accept: 'application/vnd.github.v3+json',
			};

			if (this.githubToken) {
				headers.Authorization = `token ${this.githubToken}`;
			}

			// Fetch release data using Obsidian's request API
			const releaseResponse = await request({
				url: releaseApiUrl,
				method: 'GET',
				headers,
			});

			const releaseData = JSON.parse(releaseResponse);

			// Find the zip asset (assuming it's named 'repo.zip')
			const asset = releaseData.assets.find((a: any) => a.name === 'repo.zip');
			if (!asset) {
				throw new Error('DSE Release asset "repo.zip" not found.');
			}

			// Download the zip asset using Obsidian's request API
			const assetRequestParams: RequestUrlParam = {
				url: asset.url,
				method: 'GET',
				headers: {
					Accept: 'application/octet-stream',
					...(this.githubToken && {Authorization: `token ${this.githubToken}`}),
				},
				contentType: 'application/octet-stream',
				// Set 'arraybuffer' as the response type
				responseType: 'arraybuffer',
			};

			new Notice('Draw Steel Elements: Downloading compendium...');
			const assetResponse = await requestUrl(assetRequestParams);

			// Check if the response is successful
			if (assetResponse.status !== 200) {
				console.error('DSE Compendium asset download failed:', assetResponse);
				throw new Error(`Failed to download DSE Compendium asset. HTTP status code: ${assetResponse.status}`);
			}

			// Get the ArrayBuffer from the response
			const buffer = new Uint8Array(assetResponse.arrayBuffer);

			// Verify buffer size
			if (!buffer || buffer.byteLength === 0) {
				throw new Error('Downloaded asset is empty.');
			}

			// Delete the existing compendium
			const dir = this.app.vault.getAbstractFileByPath(destinationDirectory);
			if (dir) {
				await this.app.vault.delete(dir, true);
			}

			// Load the zip file using JSZip
			new Notice('Draw Steel Elements: Extracting compendium...');
			const zip = await JSZip.loadAsync(buffer);

			// Extract and save files to the vault
			await this.extractAndSaveZip(zip, destinationDirectory);

			new Notice('Draw Steel Elements: Compendium downloaded and extracted successfully.');
		} catch (error) {
			console.error('Error downloading DSE Compendium release:', error);
			new Notice(`Error: ${error.message}`);
		}
	}

	private async extractAndSaveZip(zip: JSZip, destinationDirectory: string) {
		const vault = this.app.vault;
		const files = Object.entries(zip.files);
		const batchSize = 20; // Adjust this number based on performance

		for (let i = 0; i < files.length; i += batchSize) {
			console.log("Extracting batch " + i + "(+20) of " + files.length);
			const batch = files.slice(i, i + batchSize);

			await Promise.all(batch.map(async ([relativePath, zipEntry]) => {
				if (zipEntry.dir) {
					// Directories are handled implicitly in Obsidian
					return;
				} else {
					// Read file content and write to vault
					const fileData = await zipEntry.async('uint8array');
					const filePath = `${destinationDirectory}/${relativePath}`;

					// Ensure the directory exists
					const pathParts = filePath.split('/').slice(0, -1);
					let currentPath = '';
					for (const part of pathParts) {
						currentPath = currentPath ? `${currentPath}/${part}` : part;
						if (!vault.getAbstractFileByPath(currentPath)) {
							await vault.createFolder(currentPath);
						}
					}

					// Write the file to the vault
					await vault.createBinary(filePath, fileData);
				}
			}));

			// Yield control back to the UI thread
			await new Promise(resolve => setTimeout(resolve, 0));
		}
	}
}
