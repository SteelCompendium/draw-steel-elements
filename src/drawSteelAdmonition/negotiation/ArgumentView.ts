import {App, MarkdownPostProcessorContext, setIcon, setTooltip} from "obsidian";
import {NegotiationData} from "../../model/NegotiationData";
import {CodeBlocks} from "../../utils/CodeBlocks";
import {PowerRollProcessor} from "../powerRollProcessor";
import {PowerRollTiers} from "../../model/powerRoll";
import {ArgumentPowerRoll} from "../../model/ArgumentPowerRolls";
import {labeledIcon} from "../../utils/common";

export class ArgumentView {
    private app: App;
    private data: NegotiationData;
    private ctx: MarkdownPostProcessorContext;

    constructor(app: App, data: NegotiationData, ctx: MarkdownPostProcessorContext) {
        this.app = app;
        this.data = data;
        this.ctx = ctx;
    }

    public build(parent: HTMLElement, root: HTMLElement) {
        this.populateArgumentTab(parent, root);
    }

    private populateArgumentTab(argumentContainer: HTMLElement, root: HTMLElement) {
        const argumentBody = argumentContainer.createEl("div", { cls: "ds-nt-argument-body" });
        const argModifiers = argumentBody.createEl("div", { cls: "ds-nt-argument-modifiers" });

        // Argument modifiers
        this.buildMotivationView(argModifiers);
        // argModifiers.createEl('div', { cls: 'vertical-divider', text: ' ' });
        this.buildPitfallsView(argModifiers);

        this.buildOtherModsView(argumentBody);

        // Power Roll Display
        let argumentPowerRoll = ArgumentPowerRoll.build(
            this.data.currentArgument.usesMotivation(),
            this.data.currentArgument.usesPitfall(),
            this.data.currentArgument.lieUsed,
            this.data.currentArgument.reusedMotivation,
            this.data.currentArgument.sameArgumentUsed);
        this.buildPowerRoll(argumentBody, argumentPowerRoll.toPowerRollTiers());

        // Complete Argument Button
        const footer = argumentContainer.createEl('div', { cls: 'ds-nt-argument-footer'});
        const completeButton = footer.createEl('button', { cls: 'ds-nt-complete-argument-button' });
        labeledIcon("messages-square", "Complete Argument", completeButton);
        completeButton.addEventListener('click', () => this.completeArgument());
    }

    private buildMotivationView(argModifiers: any) {
        const motContainer = argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-motivations"});

        if (this.data.motivations.length > 0) {
            const motHeader = motContainer.createEl("div", {
                cls: "ds-nt-argument-modifier-motivation-header",
                text: "Appeals to Motivation"
            });
            setTooltip(motHeader, "If the Heroes appeal to a Motivation (w/o a Pitfall): Difficulty of the Argument Test is Easy.");

            this.data.motivations.forEach(mot => {
                const motLine = motContainer.createEl("div", {cls: "ds-nt-argument-modifier-motivation-line"});
                const motCB = motLine.createEl("input", {
                    cls: "ds-nt-argument-modifier-motivation-checkbox",
                    type: "checkbox"
                }) as HTMLInputElement;
                const motLabel = motLine.createEl("label", {cls: "ds-nt-argument-modifier-motivation-label", text: mot.name});
                motLabel.setAttribute('data-motivation-name', mot.name);
                motLabel.classList.toggle("ds-nt-arg-motivation-used", mot.hasBeenAppealedTo ?? false);
                if (mot.hasBeenAppealedTo) {
                    setTooltip(motLabel, "This Motivation was used in a previous Argument.");
                } else {
                    setTooltip(motLabel, "");
                }
                motCB.checked = this.data.currentArgument.motivationsUsed.includes(mot.name);
                motCB.addEventListener("change", () => {
                    if (motCB.checked) {
                        if (!this.data.currentArgument.motivationsUsed.includes(mot.name)) {
                            this.data.currentArgument.motivationsUsed.push(mot.name);
                        }
                        if (mot.hasBeenAppealedTo) {
                            this.data.currentArgument.reusedMotivation = true;
                        }
                    } else {
                        const index = this.data.currentArgument.motivationsUsed.indexOf(mot.name);
                        if (index > -1) {
                            this.data.currentArgument.motivationsUsed.splice(index, 1);
                            // Make sure to only update this status if we are deleting a motivation.  When a motivation
                            // is added and it appeals to a previously used motivation, the user MAY deselect the
                            // "reused motivation" button and we want to preserve that state.  We can ONLY set the
                            // "reusedMotivation" value to true (if we know its reused) or false (if motivation is no
                            // long appealed to)
                            this.data.currentArgument.reusedMotivation = this.data.argumentReusesMotivation();
                        }
                    }

                    CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
                });
            });
        }
    }

    private buildPitfallsView(argModifiers: any) {
        const pitContainer = argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-pitfalls"});
        if (this.data.pitfalls.length > 0) {
            const pitHeader = pitContainer.createEl("div", {
                cls: "ds-nt-argument-modifier-pitfall-header",
                text: "Mentions Pitfall"
            });
            pitHeader.title = "If the Heroes mention a Pitfall: Argument fails and the NPC may warn Heroes.";

            this.data.pitfalls.forEach(pit => {
                const pitLine = pitContainer.createEl("div", {cls: "ds-nt-argument-modifier-pitfall-line"});
                const pitCB = pitLine.createEl("input", {
                    cls: "ds-nt-argument-modifier-pitfall-checkbox",
                    type: "checkbox"
                }) as HTMLInputElement;
                pitLine.createEl("label", {cls: "ds-nt-argument-modifier-pitfall-label", text: pit.name});
                pitCB.checked = this.data.currentArgument.pitfallsUsed.includes(pit.name);
                pitCB.addEventListener("change", () => {
                    if (pitCB.checked) {
                        if (!this.data.currentArgument.pitfallsUsed.includes(pit.name)) {
                            this.data.currentArgument.pitfallsUsed.push(pit.name);
                        }
                    } else {
                        const index = this.data.currentArgument.pitfallsUsed.indexOf(pit.name);
                        if (index > -1) {
                            this.data.currentArgument.pitfallsUsed.splice(index, 1);
                        }
                    }
                    CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
                });
            });
        }
    }

    private buildOtherModsView(argModifiers: any) {
        const otherContainer = argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-other"});

        // Reused Motivation
        const reuseMotivationLine = otherContainer.createEl("div", {cls: "ds-nt-argument-modifier-line ds-nt-argument-modifier-reuse-motivation-line"});
        reuseMotivationLine.title = "If the Heroes try to appeal to a Motivation multiple times: Interest remains and Patience decreases by 1.";
        const reuseMotivationLabel = reuseMotivationLine.createEl("label", {cls: "ds-nt-argument-modifier-reuse-motivation-label"});
        const reuseMotivationCheckbox = reuseMotivationLabel.createEl("input", {
            cls: "ds-nt-argument-modifier-reuse-motivation-checkbox",
            type: "checkbox"
        }) as HTMLInputElement;
        reuseMotivationLabel.createEl("span", {
            cls: "ds-nt-argument-modifier-reuse-motivation-text",
            text: "Reuses a Motivation that has already been appealed to"
        });
        reuseMotivationCheckbox.disabled = !this.data.argumentReusesMotivation();
        reuseMotivationCheckbox.checked = !reuseMotivationCheckbox.disabled && this.data.currentArgument.reusedMotivation;
        reuseMotivationCheckbox.addEventListener("change", () => {
            this.data.currentArgument.reusedMotivation = reuseMotivationCheckbox.checked;
            CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
        });

        // Lie used
        const lieLine = otherContainer.createEl("div", {cls: "ds-nt-argument-modifier-line ds-nt-argument-modifier-lie-line"});
        lieLine.title = "If the NPC catches a lie: Arguments that fail to increase Interest will lose an additional Interest.";
        const lieCheckbox = lieLine.createEl("input", {cls: "ds-nt-argument-modifier-lie-checkbox", type: "checkbox"}) as HTMLInputElement;
        lieLine.createEl("label", {cls: "ds-nt-argument-modifier-lie-label", text: "NPC caught a lie and is offended"});
        lieCheckbox.checked = this.data.currentArgument.lieUsed;
        lieCheckbox.addEventListener("change", () => {
            this.data.currentArgument.lieUsed = lieCheckbox.checked;
            CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
        });

        // Same Argument
        const sameArgLine = otherContainer.createEl("div", {cls: "ds-nt-argument-modifier-line ds-nt-argument-modifier-same-arg-line"});
        sameArgLine.title = "If the Heroes try to use the same Argument (w/o Motivation): Test automatically gets tier-1 result.";
        const sameArgLabel = sameArgLine.createEl("label", {cls: "ds-nt-argument-modifier-same-arg-label"});
        const sameArgCheckbox = sameArgLabel.createEl("input", {
            cls: "ds-nt-argument-modifier-same-arg-checkbox",
            type: "checkbox"
        }) as HTMLInputElement;
        sameArgLabel.createEl("span", {cls: "ds-nt-argument-modifier-same-arg-text", text: "Argument has already been made (w/o Motivation)"});
        sameArgCheckbox.disabled = this.data.currentArgument.usesMotivation();
        sameArgCheckbox.checked = this.data.currentArgument.sameArgumentUsed;
        sameArgCheckbox.addEventListener("change", () => {
            this.data.currentArgument.sameArgumentUsed = sameArgCheckbox.checked;
            CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
        });
    }

    private buildPowerRoll(argumentBody: HTMLDivElement, prTiers: PowerRollTiers) {
        const argPowerRoll = argumentBody.createEl("div", {cls: "ds-nt-argument-power-roll"});

        const typeContainer = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-roll-line"});
        typeContainer.createEl("span", {cls: "pr-roll-value", text: "Power Roll + Reason, Intuition, or Presence"});

        const t1Container = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-1-line"});
        PowerRollProcessor.tier1Key(t1Container);
        const t1Value = t1Container.createEl("span", {cls: "pr-tier-value pr-tier-1-value", text: prTiers.t1});

        const t2Container = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-2-line"});
        PowerRollProcessor.tier2Key(t2Container);
        const t2Value = t2Container.createEl("span", {cls: "pr-tier-value pr-tier-2-value", text: prTiers.t2});

        const t3Container = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-3-line"});
        PowerRollProcessor.tier3Key(t3Container);
        const t3Value = t3Container.createEl("span", {cls: "pr-tier-value pr-tier-3-value", text: prTiers.t3});

        const critContainer = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-crit-line"});
        PowerRollProcessor.critKey(critContainer);
        const critValue = critContainer.createEl("span", {cls: "pr-tier-value pr-crit-value", text: prTiers.crit});
        return {t1Value, t2Value, t3Value, critValue};
    }

    private completeArgument() {
        // Update mot.hasBeenAppealedTo for motivations used in the current argument
        this.data.currentArgument.motivationsUsed.forEach(motName => {
            const mot = this.data.motivations.find(m => m.name === motName);
            if (mot) {
                mot.hasBeenAppealedTo = true;
            }
        });

        // Reset currentArgument
        this.data.currentArgument.resetData();
        CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
    }
}
