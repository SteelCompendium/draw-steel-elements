export interface DSESettings {
	releaseTag?: string; // Optional: if not set, fetch the latest release
	destinationDirectory: string;
}

export const DEFAULT_SETTINGS: DSESettings = {
	releaseTag: '', // Leave empty to fetch the latest release
	destinationDirectory: 'DS Compendium', // Default directory in the vault
};
