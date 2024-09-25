import {App, MarkdownPostProcessorContext, parseYaml, setIcon, stringifyYaml, TFile} from "obsidian";
import {HpEditModal} from "../utils/HpEditModal";
import {ConditionManager} from "../utils/Conditions";
import {ConditionSelectModal} from "../utils/ConditionSelectModal";
import {DEFAULT_IMAGE_PATH, Images} from "../utils/Images";
import {CodeBlocks} from "../utils/CodeBlocks";

interface Hero {
	name: string;
	max_hp: number;
	current_hp?: number;
	temp_hp?: number;
	image?: string;
	isHero: boolean;
	has_taken_turn?: boolean;
	conditions?: string[];
}

interface CreatureInstance {
	id: number;
	current_hp: number;
	conditions?: string[];
}

interface Creature {
	name: string;
	max_hp: number;
	amount: number;
	instances?: CreatureInstance[];
	image?: string;
	isHero: boolean;
}

interface EnemyGroup {
	name: string;
	creatures: Creature[];
	has_taken_turn?: boolean;
}

export interface EncounterData {
	heroes: Hero[];
	enemy_groups: EnemyGroup[];
}

export class InitiativeProcessor {
	private app: App;
	private conditionManager: ConditionManager;

	constructor(app: App) {
		this.app = app;
		this.conditionManager = new ConditionManager();
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
		const container = el.createEl('div', {cls: "ds-init-container"});
		const data = this.parseYaml(source);
		this.buildUI(container, data, ctx);
	}

	private parseYaml(source: string): EncounterData {
		const data = parseYaml(source) as EncounterData;

		// Initialize heroes
		data.heroes.forEach(hero => {
			hero.isHero = true;
			if (hero.has_taken_turn === undefined) {
				hero.has_taken_turn = false;
			}
			if (hero.conditions === undefined) {
				hero.conditions = [];
			}
		});

		// Initialize enemy groups and creatures
		data.enemy_groups.forEach((group) => {
			if (group.has_taken_turn === undefined) {
				group.has_taken_turn = false;
			}
			group.creatures.forEach((creature) => {
				if (!creature.instances || creature.instances.length !== creature.amount) {
					creature.instances = [];
					for (let i = 0; i < creature.amount; i++) {
						creature.instances.push({
							id: i + 1,
							current_hp: creature.max_hp,
							conditions: []
						});
					}
				}
			});
		});

		return data;
	}

	private buildUI(container: HTMLElement, data: EncounterData, ctx: MarkdownPostProcessorContext): void {
		// Reset Round Button
		const resetButton = container.createEl('button', { text: 'Reset Round', cls: 'reset-round-button' });
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
			const heroContEl = heroesContainer.createEl('div', { cls: 'hero-container' });
			this.buildCharacterRow(heroContEl, hero, data, ctx);
		});

		// Enemies UI
		const enemiesContainer = container.createEl('div', { cls: 'enemies-container' });
		enemiesContainer.createEl('h3', { text: 'Enemy Groups' });

		data.enemy_groups.forEach((group) => {
			const groupContEl = enemiesContainer.createEl('div', { cls: 'enemy-group-container' });
			this.buildEnemyGroupRow(groupContEl, group, data, ctx);
		});
	}

	private buildCharacterRow(
		container: HTMLElement,
		character: Hero,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext
	): void {
		// left icons
		const icon  = container.createEl('div', {cls: 'character-icon'});

		// Turn Indicator
		const turnIndicatorEl = icon.createEl('div', { cls: 'turn-indicator' });
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
		const conditionsEl = infoEl.createEl('div', { cls: 'character-conditions' });
		this.buildConditionIcons(conditionsEl, character, data, ctx);

		// Right: Health Info and Turn Indicator Container
		const rightContainer = rowEl.createEl('div', { cls: 'character-right' });

		// Health Info
		const healthEl = rightContainer.createEl('div', { cls: 'character-health' });
		const hpEl = healthEl.createEl('div', { cls: 'character-hp' });
		this.updateHpDisplay(hpEl, character);

		hpEl.addEventListener('click', () => {
			const modal = new HpEditModal(this.app, character, null, data, ctx, () => {
				this.updateHpDisplay(hpEl, character);
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
		// left icons
		const icon  = container.createEl('div', {cls: 'enemy-group-icon'});

		// Turn Indicator
		const turnIndicatorEl = icon.createEl('div', { cls: 'turn-indicator' });
		this.updateTurnIndicator(turnIndicatorEl, group.has_taken_turn ?? false);

		turnIndicatorEl.addEventListener('click', () => {
			group.has_taken_turn = !(group.has_taken_turn ?? false);
			this.updateTurnIndicator(turnIndicatorEl, group.has_taken_turn);
			CodeBlocks.updateCodeBlock(this.app, data, ctx);
		});

		const groupEl = container.createEl('div', { cls: 'enemy-group' });

		// Group Header with Name and Turn Indicator
		const groupHeader = groupEl.createEl('div', { cls: 'group-header' });
		groupHeader.createEl('h4', { text: group.name });

		// Detailed Creature Row Container
		const detailRowContainer = groupEl.createEl('div', { cls: 'creature-detail-row' });

		// Initialize with the first instance of the first creature
		let selectedInstance: { creature: Creature; instance: CreatureInstance } | null = null;
		for (const creature of group.creatures) {
			if (creature.instances && creature.instances.length > 0) {
				selectedInstance = { creature, instance: creature.instances[0] };
				break;
			}
		}

		if (selectedInstance) {
			this.buildDetailedCreatureRow(detailRowContainer, selectedInstance.creature, selectedInstance.instance, data, ctx);
		}

		// If the enemy group contains a single creature, no need for a grid
		if (group.creatures.length === 1 && group.creatures[0].amount === 1) {
			return
		}

		// Grid of Creature Instances
		const instancesGrid = groupEl.createEl('div', { cls: 'creature-instances-grid' });

		// Create cells for all instances of all creatures in the group
		group.creatures.forEach((creature) => {
			creature.instances?.forEach((instance) => {
				const cellEl = instancesGrid.createEl('div', { cls: 'creature-instance-cell' });

				// Handle selection highlighting
				if (selectedInstance && selectedInstance.instance === instance) {
					cellEl.addClass('selected');
				}

				// Display creature image in the cell
				const imgEl = cellEl.createEl('div', { cls: 'instance-image' });
				const imgSrcRaw = creature.image ?? null;
				Images.resolveImageSource(this.app, imgSrcRaw)
					.then((imgSrc) => {
						imgEl.createEl('img', { attr: { src: imgSrc, alt: creature.name } });
					})
					.catch(() => {
						// Use default image or handle error
						imgEl.createEl('img', { attr: { src: DEFAULT_IMAGE_PATH, alt: creature.name } });
					});

				// Display health status below the image
				const hpEl = cellEl.createEl('div', { cls: 'instance-hp' });
				hpEl.textContent = `${instance.current_hp}/${creature.max_hp}`;

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
				});
				cellEl.addEventListener('dblclick', () => {
					this.editStaminaModal(instance, creature, data, ctx, hpEl, container).open();
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
		const imageEl = container.createEl('div', { cls: 'character-image' });
		const imgSrcRaw = creature.image ?? null;
		Images.resolveImageSource(this.app, imgSrcRaw)
			.then((imgSrc) => {
				imageEl.createEl('img', { attr: { src: imgSrc, alt: creature.name } });
			})
			.catch(() => {
				// Use default image or handle error
				imageEl.createEl('img', { attr: { src: DEFAULT_IMAGE_PATH, alt: creature.name } });
			});

		// Middle: Creature Info
		const infoEl = container.createEl('div', { cls: 'character-info' });

		// Top: Creature Name (include instance ID)
		infoEl.createEl('div', { cls: 'character-name', text: `${creature.name} #${instance.id}` });

		// Bottom: Conditions
		const conditionsEl = infoEl.createEl('div', { cls: 'character-conditions' });
		this.buildConditionIcons(conditionsEl, instance, data, ctx);

		// Right: Health Info
		const healthEl = container.createEl('div', { cls: 'character-health' });
		const hpEl = healthEl.createEl('div', { cls: 'character-hp' });
		hpEl.textContent = `${instance.current_hp}/${creature.max_hp}`;

		// HP Click Handler
		hpEl.addEventListener('click', () => {
			this.editStaminaModal(instance, creature, data, ctx, hpEl, container).open();
		});
	}

	private editStaminaModal(instance: CreatureInstance, creature: Creature, data: EncounterData, ctx: MarkdownPostProcessorContext, hpEl: any, container: HTMLElement) {
		const modal = new HpEditModal(this.app, instance, creature, data, ctx, () => {
			hpEl.textContent = `${instance.current_hp}/${creature.max_hp}`;
			CodeBlocks.updateCodeBlock(this.app, data, ctx);

			// Update the HP in the grid cell as well
			const gridCell = container.parentElement?.querySelector(
				`.creature-instance-cell:nth-child(${instance.id}) .instance-hp`
			);
			if (gridCell) {
				gridCell.textContent = `${instance.current_hp}/${creature.max_hp}`;
			}
		});
		return modal;
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

	private updateHpDisplay(hpEl: HTMLElement, character: Hero | CreatureInstance, creature?: Creature): void {
		console.log(character)
		const currentHp = character.current_hp ?? (this.isHero(character) ? character.max_hp : creature?.max_hp ?? 0);
		const tempHp = this.isHero(character) ? character.temp_hp ?? 0 : 0;
		const maxHp = this.isHero(character) ? character.max_hp : creature?.max_hp ?? 0;

		let displayText = `${currentHp}`;
		if (tempHp > 0) {
			displayText += ` (+${tempHp})`;
		}
		displayText += `/${maxHp}`;

		hpEl.textContent = displayText;

		if (this.isHero(character) && currentHp < 0) {
			hpEl.style.color = 'red';
		} else if (tempHp > 0) {
			hpEl.style.color = 'green';
		} else {
			hpEl.style.color = '';
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
			const condition = this.conditionManager.getConditionByKey(conditionKey);
			if (condition) {
				const iconEl = container.createEl('div', { cls: 'condition-icon' });
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
		const addConditionEl = container.createEl('div', { cls: 'add-condition-icon' });
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
		const modal = new ConditionSelectModal(
			this.app,
			this.conditionManager,
			character,
			data,
			ctx,
			() => {
				// Callback after condition is added, rebuild the condition icons
				container.empty();
				this.buildConditionIcons(container, character, data, ctx);
			}
		);
		modal.open();
	}

	private isHero(character: Hero | CreatureInstance): character is Hero {
		return character.isHero;
	}
}
