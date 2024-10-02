import {setIcon} from "obsidian";

export function labeledIcon(iconName: string, label: string, parent: HTMLElement): void {
    const container = parent.createEl('div', { cls: 'ds-labeled-icon' })
    setIcon(container.createEl('div', { cls: 'icon' }), iconName);
    container.createEl('div', { cls: 'text', text: label });
}
