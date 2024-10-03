import { App, MarkdownPostProcessorContext } from "obsidian";
import { StatblockData } from "../../model/StatblockData";

export class HeaderView {
    private app: App;
    private data: StatblockData;
    private ctx: MarkdownPostProcessorContext;

    constructor(app: App, data: StatblockData, ctx: MarkdownPostProcessorContext) {
        this.app = app;
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
        const nameEl = firstLine.createEl("div", { cls: "ds-sb-header-left", text: this.data.name ?? "Unnamed Creature" });

        // Right side: Level and Roles
        const level = this.data.level !== undefined ? `LEVEL ${this.data.level}` : "LEVEL N/A";
        const roles = this.data.roles?.join(", ") ?? "No Role";
        const levelRolesText = `${level} ${roles}`;
        const levelRolesEl = firstLine.createEl("div", { cls: "ds-sb-header-right", text: levelRolesText });
    }

    private infoLine(parent: HTMLElement) {
        const secondLine = parent.createEl("div", { cls: "ds-sb-info-line" });

        // Left side: Ancestry
        const ancestryText = this.data.ancestry?.join(", ") ?? "Unknown Ancestry";
        const ancestryEl = secondLine.createEl("div", { cls: "ds-sb-header-left", text: ancestryText });

        // Right side: EV
        const evText = this.data.ev !== undefined ? `EV ${this.data.ev}` : "EV N/A";
        const evEl = secondLine.createEl("div", { cls: "ds-sb-header-right", text: evText });
    }
}
