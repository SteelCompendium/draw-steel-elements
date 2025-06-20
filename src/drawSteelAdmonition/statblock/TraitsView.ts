import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { StatblockConfig } from "../../model/StatblockConfig";
import { MundaneEffect, PowerRollEffect, Trait } from "steel-compendium-sdk";
import { PowerRollEffectView } from "../ability/PowerRollEffectView";
import { MundaneEffectView } from "../ability/MundaneEffectView";

export class TraitsView {
    private plugin: Plugin;
    private data: StatblockConfig;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, data: StatblockConfig, ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.data = data;
        this.ctx = ctx;
    }

    public build(container: HTMLElement) {
        if (!this.data.statblock.traits || this.data.statblock.traits.length === 0) {
            return;
        }

        const traitsContainer = container.createEl("div", { cls: "ds-sb-traits" });

        this.data.statblock.traits.forEach((trait: Trait) => {
            const traitEl = traitsContainer.createEl("div", { cls: "ds-sb-trait" });

            // Title Line: "name (type)"
            const titleText = trait.type ? `${trait.name} (${trait.type})` : trait.name;
            traitEl.createEl("div", { cls: "ds-sb-trait-title", text: titleText });

            // Effect Line
            // trait.effects.effects.forEach((effect: Effect) => {
            //     if (effect instanceof PowerRollEffect) {
            //         traitEl.createEl("div", { cls: "ds-sb-trait-effect", text: `${effect.name ?? ""}: ${effect.}` });
            //     });

            const effectsContainer = traitEl.createEl("div", { cls: "ds-effects-container" });
            if (trait.effects.effects) {
                for (const effect of trait.effects.effects) {
                    if (effect instanceof PowerRollEffect) {
                        new PowerRollEffectView(this.plugin, effect, this.ctx).build(effectsContainer);
                    } else if (effect instanceof MundaneEffect) {
                        new MundaneEffectView(this.plugin, effect, this.ctx).build(effectsContainer);
                    } else {
                        console.error("Unknown effect type: " + effect.constructor.name);
                    }
                }
            }
        });
    }
}
