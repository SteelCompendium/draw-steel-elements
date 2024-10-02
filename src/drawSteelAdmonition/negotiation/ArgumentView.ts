import { App, MarkdownPostProcessorContext, setIcon, setTooltip } from "obsidian";
import { NegotiationData } from "../../model/NegotiationData";
import { CodeBlocks } from "../../utils/CodeBlocks";
import { PowerRollProcessor } from "../powerRollProcessor";
import { ArgumentPowerRoll } from "../../model/ArgumentPowerRolls";
import { ArgumentResult } from "../../model/ArgumentResult";
import { labeledIcon } from "../../utils/common";

export class ArgumentView {
    private app: App;
    private data: NegotiationData;
    private ctx: MarkdownPostProcessorContext;

    private selectedPowerRollTier: ArgumentResult = null; // To track selected power roll tier

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
        this.buildPitfallsView(argModifiers);

        this.buildOtherModsView(argumentBody);

        // Power Roll Display
        const argumentPowerRoll = ArgumentPowerRoll.build(
            this.data.currentArgument.usesMotivation(),
            this.data.currentArgument.usesPitfall(),
            this.data.currentArgument.lieUsed,
            this.data.currentArgument.reusedMotivation,
            this.data.currentArgument.sameArgumentUsed
        );
        this.buildPowerRoll(argumentBody, argumentPowerRoll);

        // Complete Argument Button
        const footer = argumentContainer.createEl('div', { cls: 'ds-nt-argument-footer' });
        const completeButton = footer.createEl('button', { cls: 'ds-nt-complete-argument-button' });
        labeledIcon("messages-square", "Complete Argument", completeButton);
        completeButton.addEventListener('click', () => this.completeArgument());
    }

    private buildMotivationView(argModifiers: any) {
        const motContainer = argModifiers.createEl("div", { cls: "ds-nt-argument-modifier-motivations" });

        if (this.data.motivations.length > 0) {
            const motHeader = motContainer.createEl("div", {
                cls: "ds-nt-argument-modifier-motivation-header",
                text: "Appeals to Motivation"
            });
            setTooltip(motHeader, "If the Heroes appeal to a Motivation (w/o a Pitfall): Difficulty of the Argument Test is Easy.");

            this.data.motivations.forEach(mot => {
                const motLine = motContainer.createEl("div", { cls: "ds-nt-argument-modifier-motivation-line" });

                // Create label and wrap checkbox and text within it
                const motLabel = motLine.createEl("label", { cls: "ds-nt-argument-modifier-motivation-label" });
                motLabel.classList.toggle("ds-nt-arg-motivation-used", mot.hasBeenAppealedTo ?? false);

                if (mot.hasBeenAppealedTo) {
                    setTooltip(motLabel, "This Motivation was used in a previous Argument.");
                } else {
                    setTooltip(motLabel, "");
                }

                const motCB = motLabel.createEl("input", {
                    cls: "ds-nt-argument-modifier-motivation-checkbox",
                    type: "checkbox"
                }) as HTMLInputElement;

                motCB.checked = this.data.currentArgument.motivationsUsed.includes(mot.name);

                // Add the text inside the label
                motLabel.createSpan({ text: mot.name });

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
        const pitContainer = argModifiers.createEl("div", { cls: "ds-nt-argument-modifier-pitfalls" });
        if (this.data.pitfalls.length > 0) {
            const pitHeader = pitContainer.createEl("div", {
                cls: "ds-nt-argument-modifier-pitfall-header",
                text: "Mentions Pitfall"
            });
            pitHeader.title = "If the Heroes mention a Pitfall: Argument fails and the NPC may warn Heroes.";

            this.data.pitfalls.forEach(pit => {
                const pitLine = pitContainer.createEl("div", { cls: "ds-nt-argument-modifier-pitfall-line" });

                // Create label and wrap checkbox and text within it
                const pitLabel = pitLine.createEl("label", { cls: "ds-nt-argument-modifier-pitfall-label" });

                const pitCB = pitLabel.createEl("input", {
                    cls: "ds-nt-argument-modifier-pitfall-checkbox",
                    type: "checkbox"
                }) as HTMLInputElement;

                pitCB.checked = this.data.currentArgument.pitfallsUsed.includes(pit.name);

                // Add the text inside the label
                pitLabel.createSpan({ text: pit.name });

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
        const otherContainer = argModifiers.createEl("div", { cls: "ds-nt-argument-modifier-other" });

        // Reused Motivation
        const reuseMotivationLine = otherContainer.createEl("div", { cls: "ds-nt-argument-modifier-line ds-nt-argument-modifier-reuse-motivation-line" });
        reuseMotivationLine.title = "If the Heroes try to appeal to a Motivation multiple times: Interest remains and Patience decreases by 1.";

        // Create label and wrap checkbox and text within it
        const reuseMotivationLabel = reuseMotivationLine.createEl("label", { cls: "ds-nt-argument-modifier-reuse-motivation-label" });

        const reuseMotivationCheckbox = reuseMotivationLabel.createEl("input", {
            cls: "ds-nt-argument-modifier-reuse-motivation-checkbox",
            type: "checkbox"
        }) as HTMLInputElement;

        reuseMotivationCheckbox.disabled = !this.data.argumentReusesMotivation();
        reuseMotivationCheckbox.checked = !reuseMotivationCheckbox.disabled && this.data.currentArgument.reusedMotivation;

        reuseMotivationLabel.createSpan({
            cls: "ds-nt-argument-modifier-reuse-motivation-text",
            text: "Reuses a Motivation that has already been appealed to"
        });

        reuseMotivationCheckbox.addEventListener("change", () => {
            this.data.currentArgument.reusedMotivation = reuseMotivationCheckbox.checked;
            CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
        });

        // Lie used
        const lieLine = otherContainer.createEl("div", { cls: "ds-nt-argument-modifier-line ds-nt-argument-modifier-lie-line" });
        lieLine.title = "If the NPC catches a lie: Arguments that fail to increase Interest will lose an additional Interest.";

        // Create label and wrap checkbox and text within it
        const lieLabel = lieLine.createEl("label", { cls: "ds-nt-argument-modifier-lie-label" });

        const lieCheckbox = lieLabel.createEl("input", {
            cls: "ds-nt-argument-modifier-lie-checkbox",
            type: "checkbox"
        }) as HTMLInputElement;

        lieCheckbox.checked = this.data.currentArgument.lieUsed;

        lieLabel.createSpan({ text: "NPC caught a lie and is offended" });

        lieCheckbox.addEventListener("change", () => {
            this.data.currentArgument.lieUsed = lieCheckbox.checked;
            CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
        });

        // Same Argument
        const sameArgLine = otherContainer.createEl("div", { cls: "ds-nt-argument-modifier-line ds-nt-argument-modifier-same-arg-line" });
        sameArgLine.title = "If the Heroes try to use the same Argument (w/o Motivation): Test automatically gets tier-1 result.";

        // Create label and wrap checkbox and text within it
        const sameArgLabel = sameArgLine.createEl("label", { cls: "ds-nt-argument-modifier-same-arg-label" });

        const sameArgCheckbox = sameArgLabel.createEl("input", {
            cls: "ds-nt-argument-modifier-same-arg-checkbox",
            type: "checkbox"
        }) as HTMLInputElement;

        sameArgCheckbox.disabled = this.data.currentArgument.usesMotivation();
        sameArgCheckbox.checked = this.data.currentArgument.sameArgumentUsed;

        sameArgLabel.createSpan({
            cls: "ds-nt-argument-modifier-same-arg-text",
            text: "Argument has already been made (w/o Motivation)"
        });

        sameArgCheckbox.addEventListener("change", () => {
            this.data.currentArgument.sameArgumentUsed = sameArgCheckbox.checked;
            CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
        });
    }

    private buildPowerRoll(argumentBody: HTMLDivElement, argumentPowerRoll: ArgumentPowerRoll) {
        const argPowerRoll = argumentBody.createEl("div", { cls: "ds-nt-argument-power-roll" });

        const typeContainer = argPowerRoll.createEl("div", { cls: "pr-detail-line pr-roll-line" });
        typeContainer.createEl("span", { cls: "pr-roll-value", text: "Power Roll + Reason, Intuition, or Presence" });

        const t1Container = argPowerRoll.createEl("div", { cls: "pr-detail-line pr-tier-line pr-tier-1-line" });
        PowerRollProcessor.tier1Key(t1Container);
        t1Container.createEl("span", { cls: "pr-tier-value pr-tier-1-value", text: argumentPowerRoll.t1.toString() });

        const t2Container = argPowerRoll.createEl("div", { cls: "pr-detail-line pr-tier-line pr-tier-2-line" });
        PowerRollProcessor.tier2Key(t2Container);
        t2Container.createEl("span", { cls: "pr-tier-value pr-tier-2-value", text: argumentPowerRoll.t2.toString() });

        const t3Container = argPowerRoll.createEl("div", { cls: "pr-detail-line pr-tier-line pr-tier-3-line" });
        PowerRollProcessor.tier3Key(t3Container);
        t3Container.createEl("span", { cls: "pr-tier-value pr-tier-3-value", text: argumentPowerRoll.t3.toString() });

        const critContainer = argPowerRoll.createEl("div", { cls: "pr-detail-line pr-tier-line pr-crit-line" });
        PowerRollProcessor.critKey(critContainer);
        critContainer.createEl("span", { cls: "pr-tier-value pr-crit-value", text: argumentPowerRoll.crit.toString() });

        // Array of containers and their corresponding results
        const containers = [
            { container: t1Container, result: argumentPowerRoll.t1 },
            { container: t2Container, result: argumentPowerRoll.t2 },
            { container: t3Container, result: argumentPowerRoll.t3 },
            { container: critContainer, result: argumentPowerRoll.crit }
        ];

        // Add event listeners
        containers.forEach(item => {
            item.container.addEventListener('click', () => {
                this.selectedPowerRollTier = item.result;

                // Update classes to reflect active state
                containers.forEach(c => {
                    if (c.container === item.container) {
                        c.container.classList.add('active');
                    } else {
                        c.container.classList.remove('active');
                    }
                });
            });
        });
    }

    private completeArgument() {
        // Update mot.hasBeenAppealedTo for motivations used in the current argument
        this.data.currentArgument.motivationsUsed.forEach(motName => {
            const mot = this.data.motivations.find(m => m.name === motName);
            if (mot) {
                mot.hasBeenAppealedTo = true;
            }
        });

        // Update current_interest and current_patience based on selected tier
        if (this.selectedPowerRollTier) {
            this.data.current_interest += this.selectedPowerRollTier.interest;
            this.data.current_patience += this.selectedPowerRollTier.patience;
        }

        // Reset
        this.data.currentArgument.resetData();

        CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
    }
}
