import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { StatblockConfig } from "../../model/StatblockConfig";

export class HeaderView {
    private plugin: Plugin;
    private data: StatblockConfig;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, data: StatblockConfig, ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.data = data;
        this.ctx = ctx;
    }

    public build(parent: HTMLElement) {
        const headerContainer = parent.createEl("div", { cls: "ds-sb-header" });
        this.titleLine(headerContainer);
        this.infoLine(headerContainer);
    }

    private titleLine(parent: HTMLElement) {
        const firstLine = parent.createEl("div", { cls: "ds-sb-title-line" });

        // Left side: Name
        firstLine.createEl("div", { cls: "ds-sb-header-left", text: this.data.statblock.name ?? "Unnamed Creature" });

        // Right side: Level and Roles
        const level = this.data.statblock.level !== undefined ? `Level ${this.data.statblock.level}` : "Level N/A";
        const roles = this.data.statblock.roles?.join(", ") ?? "No Role";
        const levelRolesText = `${level} ${roles}`;
        firstLine.createEl("div", { cls: "ds-sb-header-right", text: levelRolesText });
    }

    private infoLine(parent: HTMLElement) {
        const secondLine = parent.createEl("div", { cls: "ds-sb-info-line" });

        // Left side: Ancestry
        const ancestryText = this.data.statblock.ancestry?.join(", ") ?? "Unknown Ancestry";
        secondLine.createEl("div", { cls: "ds-sb-header-left", text: ancestryText });

        // Right side: EV
        const evText = this.data.statblock.ev !== undefined ? `EV ${this.data.statblock.ev}` : "EV N/A";
        secondLine.createEl("div", { cls: "ds-sb-header-right", text: evText });
    }
}
