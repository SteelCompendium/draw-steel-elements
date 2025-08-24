import { App, MarkdownPostProcessorContext, setIcon } from "obsidian";
import { StaminaEditModal } from "@views/StaminaEditModal";
import { ConditionManager } from "@utils/Conditions";
import { AddConditionsModal } from "@views/ConditionSelectModal";
import { DEFAULT_IMAGE_PATH, Images } from "@utils/Images";
import { CodeBlocks } from "@utils/CodeBlocks";
import {
	Condition,
	Creature,
	CreatureInstance,
	EncounterData,
	EnemyGroup,
	Hero,
	parseEncounterData,
	resetEncounter,
} from "./EncounterData";
import { ResetEncounterModal } from "@views/ResetEncounterModal";
import {MinionStaminaPoolModal} from "@views/MinionStaminaPoolModal";
import {StaminaBar} from "@model/StaminaBar";

export class InitiativeProcessor {
	private app: App;
	readonly handler = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => this.postProcess(source, el, ctx);
	private conditionManager: ConditionManager;

	constructor(app: App) {
		this.app = app;
		this.conditionManager = new ConditionManager();
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
		const container = el.createEl("div", { cls: "ds-init-container" });

		try {
			const data = parseEncounterData(source);
			this.buildUI(container, data, ctx);
		} catch (error) {
			// Display error message to the user
			let userMessage =
				"The Draw Steel Elements plugin loaded the Initiative Tracker properly, but " +
				"failed to process the input config.  Please correct the following error:\n\n";
			userMessage += error.message;
			container.createEl("div", { text: userMessage, cls: "error-message ds-container" });
		}
	}

	private buildUI(container: HTMLElement, data: EncounterData, ctx: MarkdownPostProcessorContext): void {
		const topActionBar = container.createEl("div", { cls: "top-action-bar" });

		// Reset Round Button
		const resetRoundButton = topActionBar.createEl("button", {
			text: "Reset Round",
			cls: "reset-round-button",
		});
		resetRoundButton.addEventListener("click", () => {
			// Reset has_taken_turn for heroes
			data.heroes.forEach((hero) => {
				hero.has_taken_turn = false;
			});

			// Reset has_taken_turn for enemy groups
			data.enemy_groups.forEach((group) => {
				group.has_taken_turn = false;
			});

			// Rebuild the UI
			container.empty();
			this.buildUI(container, data, ctx);

			// Update the codeblock
			CodeBlocks.updateInitiativeTracker(this.app, data, ctx);
		});

		// Reset Encounter Button
		const resetEncounterButton = topActionBar.createEl("button", {
			text: "Reset Encounter State",
			cls: "reset-encounter-button",
		});
		resetEncounterButton.addEventListener("click", () => {
			new ResetEncounterModal(this.app, () => {
				resetEncounter(data);
				CodeBlocks.updateInitiativeTracker(this.app, data, ctx);
			}).open();
		});

		// Heroes UI
		const heroesContainer = container.createEl("div", { cls: "heroes-container" });
		heroesContainer.createEl("h3", { text: "Heroes" });

		data.heroes.forEach((hero) => {
			const heroContEl = heroesContainer.createEl("div", { cls: "hero-container" });
			this.buildCharacterRow(heroContEl, hero, data, ctx);
		});

		// Enemies UI
		const enemiesContainer = container.createEl("div", { cls: "enemies-container" });
		const enemyHeader = enemiesContainer.createEl("div", { cls: "enemies-header" });
		enemyHeader.createEl("h3", { text: "Enemy Groups" });

		// Villain Power
		const maliceContainer = enemyHeader.createEl("div", { cls: "malice-container" });
		const maliceModifiers = maliceContainer.createEl("div", { cls: "malice-modifiers" });
		let maliceUp = maliceModifiers.createEl("div", { cls: "malice-modifier" });
		let maliceDown = maliceModifiers.createEl("div", { cls: "malice-modifier" });
		maliceContainer.createEl("div", { cls: "malice-text", text: "Malice: " + data.malice.value });

		setIcon(maliceUp, "chevron-up");
		setIcon(maliceDown, "chevron-down");

		maliceUp.addEventListener("click", () => {
			data.malice.value += 1;
			maliceContainer.setText("Malice: " + data.malice.value);
			CodeBlocks.updateInitiativeTracker(this.app, data, ctx);
		});
		maliceDown.addEventListener("click", () => {
			data.malice.value -= 1;
			maliceContainer.setText("Malice: " + data.malice.value);
			CodeBlocks.updateInitiativeTracker(this.app, data, ctx);
		});

		data.enemy_groups.forEach((group) => {
			const groupContEl = enemiesContainer.createEl("div", { cls: "enemy-group-container" });
			this.buildEnemyGroupRow(groupContEl, group, data, ctx);
		});
	}

	private buildCharacterRow(
		container: HTMLElement,
		character: Hero,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext
	): void {
		// Left icons
		const icon = container.createEl("div", { cls: "character-icon" });

		// Turn Indicator
		const turnIndicatorEl = icon.createEl("div", { cls: "turn-indicator" });
		turnIndicatorEl.title = "Toggle to mark turn taken";
		this.updateTurnIndicator(turnIndicatorEl, character.has_taken_turn ?? false);

		// Add click handler to toggle has_taken_turn
		turnIndicatorEl.addEventListener("click", () => {
			if (this.isHero(character)) {
				character.has_taken_turn = !(character.has_taken_turn ?? false);
				this.updateTurnIndicator(turnIndicatorEl, character.has_taken_turn);
				CodeBlocks.updateInitiativeTracker(this.app, data, ctx);
			}
		});

		const rowEl = container.createEl("div", { cls: "character-row" });

		// Character Image
		const imageEl = rowEl.createEl("div", { cls: "character-image" });
		const imgSrcRaw = character.image ?? null;

		Images.resolveImageSource(this.app, imgSrcRaw ?? "")
			.then((imgSrc) => {
				imageEl.createEl("img", { attr: { src: imgSrc, alt: character.name } });
			})
			.catch(() => {
				// Use default image
				imageEl.createEl("img", { attr: { src: DEFAULT_IMAGE_PATH, alt: character.name } });
			});

		// Middle: Character Info
		const infoEl = rowEl.createEl("div", { cls: "character-info" });

		// Top: Character Name
		let displayName = character.name;
		infoEl.createEl("div", { cls: "character-name", text: displayName });

		// Bottom: Conditions
		const conditionsEl = infoEl.createEl("div", { cls: "character-conditions" });
		this.buildConditionIcons(conditionsEl, character, data, ctx);

		// Right: Health Info and Turn Indicator Container
		const rightContainer = rowEl.createEl("div", { cls: "character-right" });

		// Health Info
		const healthEl = rightContainer.createEl("div", { cls: "character-health" });
		const staminaEl = healthEl.createEl("div", { cls: "character-stamina" });
		this.updateStaminaDisplay(staminaEl, character);

		staminaEl.addEventListener("click", () => {
			let staminaBar = StaminaBar.fromHero(character);
			const modal = new StaminaEditModal(this.app, staminaBar, true, character.name, () => {
				staminaBar.updateHero(character);
				this.updateStaminaDisplay(staminaEl, character);
				CodeBlocks.updateInitiativeTracker(this.app, data, ctx);
			});
			modal.open();
		});
	}

	private buildEnemyGroupRow(
		container: HTMLElement,
		group: EnemyGroup,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext
	): void {
		// Left icons
		const icon = container.createEl("div", { cls: "enemy-group-icon" });

		// Turn Indicator
		const turnIndicatorEl = icon.createEl("div", { cls: "turn-indicator" });
		turnIndicatorEl.title = "Toggle to mark turn taken";
		this.updateTurnIndicator(turnIndicatorEl, group.has_taken_turn ?? false);

		turnIndicatorEl.addEventListener("click", () => {
			group.has_taken_turn = !(group.has_taken_turn ?? false);
			this.updateTurnIndicator(turnIndicatorEl, group.has_taken_turn);
			CodeBlocks.updateInitiativeTracker(this.app, data, ctx);
		});

		const groupEl = container.createEl("div", { cls: "enemy-group" });

		// Group Header with Name and Turn Indicator
		const groupHeader = groupEl.createEl("div", { cls: "group-header" });
		groupHeader.createEl("h4", { text: group.name });

		// Detailed Creature Row Container
		const detailRowContainer = groupEl.createEl("div", { cls: "creature-detail-row" });

		// Determine the selected creature instance
		let selectedInstance: { creature: Creature; instance: CreatureInstance } | null = null;
		if (group.selectedInstanceKey != null) {
			// Try to find the previously selected instance using the unique key
			for (let creatureIndex = 0; creatureIndex < group.creatures.length; creatureIndex++) {
				const creature = group.creatures[creatureIndex];
				if (creature.instances) {
					const instance = creature.instances.find((inst) => {
						const instanceKey = `${creatureIndex}-${inst.id}`;
						return instanceKey === group.selectedInstanceKey;
					});
					if (instance) {
						selectedInstance = { creature, instance };
						break;
					}
				}
			}
		}
		if (!selectedInstance) {
			// If no selected instance, default to the first instance
			for (const creature of group.creatures) {
				if (creature.instances && creature.instances.length > 0) {
					selectedInstance = { creature, instance: creature.instances[0] };
					break;
				}
			}
		}

		if (selectedInstance) {
			this.buildDetailedCreatureRow(
				detailRowContainer,
				selectedInstance.creature,
				selectedInstance.instance,
				data,
				ctx,
				group
			);
		}

		// If the enemy group contains a single creature, no need for a grid
		if (group.creatures.length === 1 && group.creatures[0].amount === 1) {
			return;
		}

		// Grid of Creature Instances
		const instancesGrid = groupEl.createEl("div", { cls: "creature-instances-grid" });

		// Create cells for all instances of all creatures in the group
		group.creatures.forEach((creature, creatureIndex) => {
			creature.instances?.forEach((instance) => {
				const cellEl = instancesGrid.createEl("div", { cls: "creature-instance-cell" });

				const instanceKey = `${creatureIndex}-${instance.id}`;

				// Handle selection highlighting
				if (group.selectedInstanceKey === instanceKey) {
					cellEl.addClass("selected");
				}

				// Display creature image in the cell
				const imgEl = cellEl.createEl("div", { cls: "instance-image" });
				const imgSrcRaw = creature.image ?? null;
				Images.resolveImageSource(this.app, imgSrcRaw ?? "")
					.then((imgSrc) => {
						imgEl.createEl("img", { attr: { src: imgSrc, alt: creature.name } });
					})
					.catch(() => {
						// Use default image
						imgEl.createEl("img", { attr: { src: DEFAULT_IMAGE_PATH, alt: creature.name } });
					});

				// Display health status below the image
				const staminaEl = cellEl.createEl("div", { cls: "instance-stamina" });
				this.updateStaminaDisplay(staminaEl, instance, creature, group);

				// Add click event to update detailed view
				cellEl.addEventListener("click", () => {
					// Remove 'selected' class from all cells
					instancesGrid.querySelectorAll(".creature-instance-cell").forEach((cell) => {
						cell.removeClass("selected");
					});
					// Add 'selected' class to the clicked cell
					cellEl.addClass("selected");

					// Update the detailed creature row
					detailRowContainer.empty();
					this.buildDetailedCreatureRow(detailRowContainer, creature, instance, data, ctx, group);

					// Persist the selected instance key
					group.selectedInstanceKey = instanceKey;
					CodeBlocks.updateInitiativeTracker(this.app, data, ctx);
				});

				// Double-click to edit STAMINA
				cellEl.addEventListener("dblclick", () => {
					if (group.is_squad && creature.squad_role === "minion") {
						const modal = new MinionStaminaPoolModal(this.app, group, creature, data, ctx, () => {
							container.empty();
							this.buildUI(container, data, ctx);
							CodeBlocks.updateInitiativeTracker(this.app, data, ctx);
						});
						modal.open();
					} else {
						this.editCreatureStaminaModal(instance, creature, data, ctx, staminaEl, container).open();
					}
				});
			});
		});
	}

	private buildDetailedCreatureRow(
		container: HTMLElement,
		creature: Creature,
		instance: CreatureInstance,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext,
		group: EnemyGroup
	): void {
		container.addClass("character-row");

		// Left: Creature Image
		const imageEl = container.createEl("div", { cls: "character-image" });
		const imgSrcRaw = creature.image ?? null;
		Images.resolveImageSource(this.app, imgSrcRaw ?? "")
			.then((imgSrc) => {
				imageEl.createEl("img", { attr: { src: imgSrc, alt: creature.name } });
			})
			.catch(() => {
				// Use default image
				imageEl.createEl("img", { attr: { src: DEFAULT_IMAGE_PATH, alt: creature.name } });
			});

		// Middle: Creature Info
		const infoEl = container.createEl("div", { cls: "character-info" });

		// Top: Creature Name (include instance ID)
		infoEl.createEl("div", { cls: "character-name", text: `${creature.name} #${instance.id}` });

		// Bottom: Conditions
		const conditionsEl = infoEl.createEl("div", { cls: "character-conditions" });
		this.buildConditionIcons(conditionsEl, instance, data, ctx);

		// Right: Health Info
		const healthEl = container.createEl("div", { cls: "character-health" });
		const staminaEl = healthEl.createEl("div", { cls: "character-stamina" });

		if (group.is_squad && creature.squad_role === "minion") {
			// For minions in a squad, display the pool health
			this.updateStaminaDisplay(staminaEl, instance, creature, group);
			// Add event listener to edit the minion pool stamina
			staminaEl.addEventListener("click", () => {
				const modal = new MinionStaminaPoolModal(this.app, group, creature, data, ctx, () => {
					container.empty();
					this.buildDetailedCreatureRow(container, creature, instance, data, ctx, group);
					CodeBlocks.updateInitiativeTracker(this.app, data, ctx);
				});
				modal.open();
			});
		} else {
			// For normal creatures and captains
			this.updateStaminaDisplay(staminaEl, instance, creature, group);
			staminaEl.addEventListener("click", () => {
				this.editCreatureStaminaModal(instance, creature, data, ctx, staminaEl, container).open();
			});
		}
	}

	private editCreatureStaminaModal(
		instance: CreatureInstance,
		creature: Creature,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext,
		staminaEl: HTMLElement,
		container: HTMLElement
	) {
		const staminaBar = StaminaBar.fromCreature(instance, creature);
		return new StaminaEditModal(this.app, staminaBar, false, creature.name, () => {
			staminaBar.updateCreature(instance);
			this.updateStaminaDisplay(staminaEl, instance, creature);
			CodeBlocks.updateInitiativeTracker(this.app, data, ctx);

			// Update the STAMINA in the grid cell as well
			const gridCell = container.parentElement?.querySelector(
				`.creature-instance-cell:nth-child(${instance.id}) .instance-stamina`
			);
			if (gridCell) {
				this.updateStaminaDisplay(gridCell as HTMLElement, instance, creature);
			}
		});
	}

	private updateTurnIndicator(el: HTMLElement, hasTakenTurn: boolean): void {
		el.empty();
		if (hasTakenTurn) {
			el.addClass("taken-turn");
			setIcon(el, "check");
		} else {
			el.removeClass("taken-turn");
			setIcon(el, "dot");
		}
	}

	private updateStaminaDisplay(
		staminaEl: HTMLElement,
		character: Hero | CreatureInstance,
		creature?: Creature,
		group?: EnemyGroup
	): void {
		if (group?.is_squad && creature?.squad_role === "minion") {
			// For minions in squads, display the minion stamina pool or DEAD
			if ((character as CreatureInstance).isDead) {
				staminaEl.textContent = `DEAD`;
				staminaEl.style.color = 'crimson';
			} else {
				const currentStamina = group.minion_stamina_pool ?? 0;
				staminaEl.textContent = `${currentStamina}/${creature.max_stamina * creature.amount} (${creature.max_stamina})`;
				staminaEl.style.color = 'var(--text-normal)';
			}
		} else {
			const currentStamina = character.current_stamina ?? 0;
			const tempStamina = character.temp_stamina ?? 0;
			const maxStamina = this.isHero(character)
				? (character as Hero).max_stamina
				: creature?.max_stamina ?? 0;

			let displayText = `${currentStamina}`;
			if (tempStamina > 0) {
				displayText += `(+${tempStamina})`;
			}
			displayText += `/${maxStamina}`;

			staminaEl.textContent = displayText;

			if (currentStamina < 0) {
				staminaEl.style.color = "red";
			} else if (tempStamina > 0) {
				staminaEl.style.color = "green";
			} else {
				staminaEl.style.color = "";
			}
		}
	}

	private buildConditionIcons(
		container: HTMLElement,
		character: Hero | CreatureInstance,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext
	): void {
		const conditions = character.conditions || [];

		conditions.forEach((conditionEntry) => {
			let conditionKey: string;
			let conditionData: Condition | null = null;
			if (typeof conditionEntry === "string") {
				conditionKey = conditionEntry;
			} else if (typeof conditionEntry === "object" && conditionEntry.key) {
				conditionKey = conditionEntry.key;
				conditionData = conditionEntry;
			} else {
				return;
			}

			const condition = this.conditionManager.getAnyConditionByKey(conditionKey);
			if (condition) {
				const iconEl = container.createEl("div", { cls: "condition-icon" });
				setIcon(iconEl, condition.iconName);
				iconEl.title = condition.displayName;

				// Apply color and effect customizations
				if (conditionData) {
					if (conditionData.color) {
						iconEl.style.color = conditionData.color;
					}
					if (conditionData.effect) {
						iconEl.classList.add(`condition-effect-${conditionData.effect}`);
					}
				}

				iconEl.addEventListener("click", () => {
					character.conditions = conditions.filter((entry) => entry !== conditionEntry);
					container.empty();
					this.buildConditionIcons(container, character, data, ctx);
					CodeBlocks.updateInitiativeTracker(this.app, data, ctx);
				});
			}
		});

		const addConditionEl = container.createEl("div", { cls: "add-condition-icon" });
		setIcon(addConditionEl, "plus-circle");
		addConditionEl.title = "Add Condition";
		addConditionEl.addEventListener("click", () => {
			const addConditionsModal = new AddConditionsModal(
				this.app,
				character,
				this.conditionManager,
				(newConditions) => {
					character.conditions = (character.conditions || []).concat(newConditions);
					container.empty();
					this.buildConditionIcons(container, character, data, ctx);
					CodeBlocks.updateInitiativeTracker(this.app, data, ctx);
				}
			);
			addConditionsModal.open();
		});
	}

	private isHero(character: Hero | CreatureInstance): character is Hero {
		return "isHero" in character ? character.isHero : false;
	}
}
