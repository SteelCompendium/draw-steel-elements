import {setIcon} from "obsidian";

export function labeledIcon(iconName: string, label: string, parent: HTMLElement): void {
    const container = parent.createEl('div', { cls: 'ds-labeled-icon' })
    setIcon(container.createEl('div', { cls: 'icon' }), iconName);
    container.createEl('div', { cls: 'text', text: label });
}

export const toProperCase = (str: string | undefined | null) => {
	if (!str || typeof str !== 'string') {
		return '';
	}
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export const toTitleCase = (str: string) => {
	return toProperCase(str);
}
