export type CompendiumVariant = 'unlinked' | 'linked';

export interface DSESettings {
	compendiumReleaseTag?: string; // Optional: if not set, fetch the latest release
	compendiumDestinationDirectory: string;
	compendiumVariant: CompendiumVariant;
	defaultImagePath: string;
}

export const DEFAULT_SETTINGS: DSESettings = {
	compendiumReleaseTag: '', // Leave empty to fetch the latest release
	compendiumDestinationDirectory: 'DS Compendium', // Default directory in the vault
	compendiumVariant: 'unlinked',
	defaultImagePath: 'Media/token_1.png',
};

export const COMPENDIUM_REPOS: Record<CompendiumVariant, string> = {
	unlinked: 'data-md-dse',
	linked: 'data-md-dse-linked',
};
