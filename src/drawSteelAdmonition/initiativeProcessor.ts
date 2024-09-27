import {App, MarkdownPostProcessorContext, setIcon} from "obsidian";
import {StaminaEditModal} from "../views/StaminaEditModal";
import {ConditionManager} from "../utils/Conditions";
import {ConditionSelectModal} from "../views/ConditionSelectModal";
import {DEFAULT_IMAGE_PATH, Images} from "../utils/Images";
import {CodeBlocks} from "../utils/CodeBlocks";
import {Creature, CreatureInstance, EncounterData, EnemyGroup, Hero, parseEncounterData} from "./EncounterData";

export class InitiativeProcessor {
	private app: App;
	private conditionManager: ConditionManager;

	constructor(app: App) {
		this.app = app;
		this.conditionManager = new ConditionManager();
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
		const container = el.createEl('div', {cls: "ds-init-container"});

		try {
			const data = parseEncounterData(source);
			this.buildUI(container, data, ctx);
		} catch (error) {
			// Display error message to the user
			let userMessage = "The Draw Steel Elements plugin loaded the Initiative Tracker properly, but " +
				"failed to process the input config.  Please correct the following error:\n\n"
			userMessage += error.message;
			container.createEl('div', {text: userMessage, cls: 'error-message ds-container'});
		}
	}

	private buildUI(container: HTMLElement, data: EncounterData, ctx: MarkdownPostProcessorContext): void {
		// Reset Round Button
		const resetButton = container.createEl('button', {text: 'Reset Round', cls: 'reset-round-button'});
		resetButton.addEventListener('click', () => {
			// Reset has_taken_turn for heroes
			data.heroes.forEach(hero => {
				hero.has_taken_turn = false;
			});

			// Reset has_taken_turn for enemy groups
			data.enemy_groups.forEach(group => {
				group.has_taken_turn = false;
			});

			// Rebuild the UI
			container.empty();
			this.buildUI(container, data, ctx);

			// Update the codeblock
			CodeBlocks.updateCodeBlock(this.app, data, ctx);
		});

		// Heroes UI
		const heroesContainer = container.createEl('div', {cls: 'heroes-container'});
		heroesContainer.createEl('h3', {text: 'Heroes'});

		data.heroes.forEach((hero) => {
			const heroContEl = heroesContainer.createEl('div', {cls: 'hero-container'});
			this.buildCharacterRow(heroContEl, hero, data, ctx);
		});

		// Enemies UI
		const enemiesContainer = container.createEl('div', {cls: 'enemies-container'});
		const enemyHeader = enemiesContainer.createEl('div', {cls: 'enemies-header'});
		enemyHeader.createEl('h3', {text: 'Enemy Groups'});

		// Villain Power
		const vpContainer = enemyHeader.createEl('div', {cls: 'vp-container'});
		const vpModifiers = vpContainer.createEl('div', {cls: 'vp-modifiers'});
		let vpUp = vpModifiers.createEl('div', {cls: 'vp-modifier'});
		let vpDown = vpModifiers.createEl('div', {cls: 'vp-modifier'});
		vpContainer.createEl('div', {cls: 'vp-text', text: "VP: " + data.villain_power.value});

		setIcon(vpUp, 'chevron-up');
		setIcon(vpDown, 'chevron-down');

		vpUp.addEventListener('click', () => {
			data.villain_power.value += 1;
			vpContainer.setText("VP: " + data.villain_power.value);
			CodeBlocks.updateCodeBlock(this.app, data, ctx);
		});
		vpDown.addEventListener('click', () => {
			data.villain_power.value -= 1;
			vpContainer.setText("VP: " + data.villain_power.value);
			CodeBlocks.updateCodeBlock(this.app, data, ctx);
		});

		data.enemy_groups.forEach((group) => {
			const groupContEl = enemiesContainer.createEl('div', {cls: 'enemy-group-container'});
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
		const icon = container.createEl('div', {cls: 'character-icon'});

		// Turn Indicator
		const turnIndicatorEl = icon.createEl('div', {cls: 'turn-indicator'});
		turnIndicatorEl.title = "Toggle to mark turn taken"
		this.updateTurnIndicator(turnIndicatorEl, character.has_taken_turn ?? false);

		// Add click handler to toggle has_taken_turn
		turnIndicatorEl.addEventListener('click', () => {
			if (this.isHero(character)) {
				character.has_taken_turn = !(character.has_taken_turn ?? false);
				this.updateTurnIndicator(turnIndicatorEl, character.has_taken_turn);
				CodeBlocks.updateCodeBlock(this.app, data, ctx);
			}
		});

		const rowEl = container.createEl('div', {cls: 'character-row'});

		// Character Image
		const imageEl = rowEl.createEl('div', {cls: 'character-image'});
		const imgSrcRaw = character.image ?? null;

		Images.resolveImageSource(this.app, imgSrcRaw).then((imgSrc) => {
			imageEl.createEl('img', {attr: {src: imgSrc, alt: character.name}});
		}).catch(() => {
			// Use default image
			imageEl.createEl('img', {attr: {src: DEFAULT_IMAGE_PATH, alt: character.name}});
		});

		// Middle: Character Info
		const infoEl = rowEl.createEl('div', {cls: 'character-info'});

		// Top: Character Name
		let displayName = character.name;
		infoEl.createEl('div', {cls: 'character-name', text: displayName});

		// Bottom: Conditions
		const conditionsEl = infoEl.createEl('div', {cls: 'character-conditions'});
		this.buildConditionIcons(conditionsEl, character, data, ctx);

		// Right: Health Info and Turn Indicator Container
		const rightContainer = rowEl.createEl('div', {cls: 'character-right'});

		// Health Info
		const healthEl = rightContainer.createEl('div', {cls: 'character-health'});
		const staminaEl = healthEl.createEl('div', {cls: 'character-stamina'});
		this.updateStaminaDisplay(staminaEl, character);

		staminaEl.addEventListener('click', () => {
			const modal = new StaminaEditModal(this.app, character, null, data, ctx, () => {
				this.updateStaminaDisplay(staminaEl, character);
				CodeBlocks.updateCodeBlock(this.app, data, ctx);
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
		const icon = container.createEl('div', {cls: 'enemy-group-icon'});

		// Turn Indicator
		const turnIndicatorEl = icon.createEl('div', {cls: 'turn-indicator'});
		turnIndicatorEl.title = "Toggle to mark turn taken"
		this.updateTurnIndicator(turnIndicatorEl, group.has_taken_turn ?? false);

		turnIndicatorEl.addEventListener('click', () => {
			group.has_taken_turn = !(group.has_taken_turn ?? false);
			this.updateTurnIndicator(turnIndicatorEl, group.has_taken_turn);
			CodeBlocks.updateCodeBlock(this.app, data, ctx);
		});

		const groupEl = container.createEl('div', {cls: 'enemy-group'});

		// Group Header with Name and Turn Indicator
		const groupHeader = groupEl.createEl('div', {cls: 'group-header'});
		groupHeader.createEl('h4', {text: group.name});

		// Detailed Creature Row Container
		const detailRowContainer = groupEl.createEl('div', {cls: 'creature-detail-row'});

		// Determine the selected creature instance
		let selectedInstance: { creature: Creature; instance: CreatureInstance } | null = null;
		if (group.selectedInstanceKey != null) {
			// Try to find the previously selected instance using the unique key
			for (let creatureIndex = 0; creatureIndex < group.creatures.length; creatureIndex++) {
				const creature = group.creatures[creatureIndex];
				if (creature.instances) {
					const instance = creature.instances.find(inst => {
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
			this.buildDetailedCreatureRow(detailRowContainer, selectedInstance.creature, selectedInstance.instance, data, ctx);
		}

		// If the enemy group contains a single creature, no need for a grid
		if (group.creatures.length === 1 && group.creatures[0].amount === 1) {
			return;
		}

		// Grid of Creature Instances
		const instancesGrid = groupEl.createEl('div', {cls: 'creature-instances-grid'});

		// Create cells for all instances of all creatures in the group
		group.creatures.forEach((creature, creatureIndex) => {
			creature.instances?.forEach((instance) => {
				const cellEl = instancesGrid.createEl('div', {cls: 'creature-instance-cell'});

				const instanceKey = `${creatureIndex}-${instance.id}`;

				// Handle selection highlighting
				if (group.selectedInstanceKey === instanceKey) {
					cellEl.addClass('selected');
				}

				// Display creature image in the cell
				const imgEl = cellEl.createEl('div', {cls: 'instance-image'});
				const imgSrcRaw = creature.image ?? null;
				Images.resolveImageSource(this.app, imgSrcRaw)
					.then((imgSrc) => {
						imgEl.createEl('img', {attr: {src: imgSrc, alt: creature.name}});
					})
					.catch(() => {
						// Use default image
						imgEl.createEl('img', {attr: {src: DEFAULT_IMAGE_PATH, alt: creature.name}});
					});

				// Display health status below the image
				const staminaEl = cellEl.createEl('div', {cls: 'instance-stamina'});
				this.updateStaminaDisplay(staminaEl, instance, creature);

				// Add click event to update detailed view
				cellEl.addEventListener('click', () => {
					// Remove 'selected' class from all cells
					instancesGrid.querySelectorAll('.creature-instance-cell').forEach((cell) => {
						cell.removeClass('selected');
					});
					// Add 'selected' class to the clicked cell
					cellEl.addClass('selected');

					// Update the detailed creature row
					detailRowContainer.empty();
					this.buildDetailedCreatureRow(detailRowContainer, creature, instance, data, ctx);

					// Persist the selected instance key
					group.selectedInstanceKey = instanceKey;
					CodeBlocks.updateCodeBlock(this.app, data, ctx);
				});

				// Double-click to edit STAMINA
				cellEl.addEventListener('dblclick', () => {
					this.editStaminaModal(instance, creature, data, ctx, staminaEl, container).open();
				});
			});
		});
	}

	private buildDetailedCreatureRow(
		container: HTMLElement,
		creature: Creature,
		instance: CreatureInstance,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext
	): void {
		container.addClass('character-row');

		// Left: Creature Image
		const imageEl = container.createEl('div', {cls: 'character-image'});
		const imgSrcRaw = creature.image ?? null;
		Images.resolveImageSource(this.app, imgSrcRaw)
			.then((imgSrc) => {
				imageEl.createEl('img', {attr: {src: imgSrc, alt: creature.name}});
			})
			.catch(() => {
				// Use default image
				imageEl.createEl('img', {attr: {src: DEFAULT_IMAGE_PATH, alt: creature.name}});
			});

		// Middle: Creature Info
		const infoEl = container.createEl('div', {cls: 'character-info'});

		// Top: Creature Name (include instance ID)
		infoEl.createEl('div', {cls: 'character-name', text: `${creature.name} #${instance.id}`});

		// Bottom: Conditions
		const conditionsEl = infoEl.createEl('div', {cls: 'character-conditions'});
		this.buildConditionIcons(conditionsEl, instance, data, ctx);

		// Right: Health Info
		const healthEl = container.createEl('div', {cls: 'character-health'});
		const staminaEl = healthEl.createEl('div', {cls: 'character-stamina'});
		this.updateStaminaDisplay(staminaEl, instance, creature);
		staminaEl.addEventListener('click', () => {
			this.editStaminaModal(instance, creature, data, ctx, staminaEl, container).open();
		});
	}

	private editStaminaModal(
		instance: CreatureInstance,
		creature: Creature,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext,
		staminaEl: HTMLElement,
		container: HTMLElement
	) {
		return new StaminaEditModal(this.app, instance, creature, data, ctx, () => {
			this.updateStaminaDisplay(staminaEl, instance, creature);
			CodeBlocks.updateCodeBlock(this.app, data, ctx);

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
			el.addClass('taken-turn');
			setIcon(el, "check")
		} else {
			el.removeClass('taken-turn');
			setIcon(el, "dot")
		}
	}

	private updateStaminaDisplay(staminaEl: HTMLElement, character: Hero | CreatureInstance, creature?: Creature): void {
		const currentStamina = character.current_stamina ?? 0;
		const tempStamina = character.temp_stamina ?? 0;
		const maxStamina = this.isHero(character) ? (character as Hero).max_stamina : creature?.max_stamina ?? 0;

		let displayText = `${currentStamina}`;
		if (tempStamina > 0) {
			displayText += `(+${tempStamina})`;
		}
		displayText += `/${maxStamina}`;

		staminaEl.textContent = displayText;

		if (currentStamina < 0) {
			staminaEl.style.color = 'red';
		} else if (tempStamina > 0) {
			staminaEl.style.color = 'green';
		} else {
			staminaEl.style.color = '';
		}
	}

	private buildConditionIcons(
		container: HTMLElement,
		character: Hero | CreatureInstance,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext
	): void {
		const conditions = character.conditions || [];

		conditions.forEach(conditionKey => {
			const condition = this.conditionManager.getAnyConditionByKey(conditionKey);
			if (condition) {
				const iconEl = container.createEl('div', {cls: 'condition-icon'});
				setIcon(iconEl, condition.iconName);
				iconEl.title = condition.displayName;

				iconEl.addEventListener('click', () => {
					character.conditions = conditions.filter(key => key !== conditionKey);
					container.empty();
					this.buildConditionIcons(container, character, data, ctx);
					CodeBlocks.updateCodeBlock(this.app, data, ctx);
				});
			}
		});

		// Add Condition Button
		const addConditionEl = container.createEl('div', {cls: 'add-condition-icon'});
		setIcon(addConditionEl, 'plus-circle');
		addConditionEl.title = 'Add Condition';
		addConditionEl.addEventListener('click', () => {
			this.openAddConditionModal(character, data, ctx, container);
		});
	}

	private openAddConditionModal(
		character: Hero | CreatureInstance,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext,
		container: HTMLElement
	): void {
		let callback = () => {
			// Callback after condition is added, rebuild the condition icons
			container.empty();
			this.buildConditionIcons(container, character, data, ctx);
		};
		new ConditionSelectModal(this.app, this.conditionManager, character, data, ctx, callback).open();
	}

	private isHero(character: Hero | CreatureInstance): character is Hero {
		return character.isHero;
	}
}
