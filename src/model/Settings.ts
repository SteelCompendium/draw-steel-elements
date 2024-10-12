export interface DSESettings {
	compendiumReleaseTag?: string; // Optional: if not set, fetch the latest release
	compendiumDestinationDirectory: string;
}

export const DEFAULT_SETTINGS: DSESettings = {
	compendiumReleaseTag: '', // Leave empty to fetch the latest release
	compendiumDestinationDirectory: 'DS Compendium', // Default directory in the vault
};
