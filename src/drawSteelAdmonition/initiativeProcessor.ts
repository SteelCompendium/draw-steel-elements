import {App, MarkdownPostProcessorContext, TFile, parseYaml, stringifyYaml} from "obsidian";
import {HpEditModal} from "../utils/HpEditModal";

interface Hero {
	name: string;
	max_hp: number;
	current_hp?: number;    // Can be negative down to -50% of max_hp
	temp_hp?: number;       // Temporary HP (heroes only)
	image?: string;
	isHero: boolean;
}

interface CreatureInstance {
	id: number;             // Unique identifier within the group
	current_hp: number;     // Current HP of the individual creature
	conditions?: string[];  // Conditions affecting the creature (optional)
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
}

interface EncounterData {
	heroes: Hero[];
	enemy_groups: EnemyGroup[];
}

const DEFAULT_IMAGE_PATH = 'token_1.png';
const lang = "ds-initiative"

export class InitiativeProcessor {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
		const container = el.createEl('div', {cls: "ds-init-container"});
		const data = this.parseYaml(source);
		this.buildUI(container, data, ctx);
	}

	private parseYaml(source: string): EncounterData {
		const data = parseYaml(source) as EncounterData;

		// set all heroes
		data.heroes.forEach((h) => h.isHero = true);

		// Initialize instances for creatures
		data.enemy_groups.forEach((group) => {
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
		// Heroes UI
		const heroesContainer = container.createEl('div', {cls: 'heroes-container'});
		heroesContainer.createEl('h2', {text: 'Heroes'});

		data.heroes.forEach((hero) => {
			this.buildCharacterRow(heroesContainer, hero, data, ctx);
		});

		// Enemies UI
		const enemiesContainer = container.createEl('div', { cls: 'enemies-container' });
		enemiesContainer.createEl('h2', { text: 'Enemies' });

		data.enemy_groups.forEach((group) => {
			const groupEl = enemiesContainer.createEl('div', { cls: 'enemy-group' });
			groupEl.createEl('h3', { text: group.name });

			// Call the new method
			this.buildEnemyGroupRow(groupEl, group, data, ctx, lang);
		});
	}

	private buildCharacterRow(
		container: HTMLElement,
		character: Hero,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext
	): void {
		const rowEl = container.createEl('div', {cls: 'character-row'});

		// Left: Character Image
		const imageEl = rowEl.createEl('div', {cls: 'character-image'});
		const imgSrcRaw = character.image ?? null;

		this.resolveImageSource(imgSrcRaw).then((imgSrc) => {
			imageEl.createEl('img', {attr: {src: imgSrc, alt: character.name}});
		}).catch(() => {
			// Use default image
			imageEl.createEl('img', {attr: {src: 'path/to/default-image.png', alt: character.name}});
		});

		// Middle: Character Info
		const infoEl = rowEl.createEl('div', {cls: 'character-info'});

		// Top: Character Name
		let displayName = character.name;
		infoEl.createEl('div', {cls: 'character-name', text: displayName});

		// Bottom: Condition Icons (Placeholder)
		infoEl.createEl('div', {cls: 'character-conditions'});

		// Right: Health Info
		const healthEl = rowEl.createEl('div', {cls: 'character-health'});
		const hpEl = healthEl.createEl('div', {
			cls: 'character-hp',
		});
		this.updateHpDisplay(hpEl, character);

		hpEl.addEventListener('click', () => {
			const modal = new HpEditModal(this.app, character, null, data, ctx, () => {
				this.updateHpDisplay(hpEl, character);
				this.updateCodeBlock(data, ctx);
			});
			modal.open();
		});
	}

	private buildEnemyGroupRow(
		container: HTMLElement,
		group: EnemyGroup,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext,
		lang: string
	): void {
		// Detailed Creature Row Container
		const detailRowContainer = container.createEl('div', { cls: 'creature-detail-row' });

		// Initialize with the first instance of the first creature
		let selectedInstance: { creature: Creature; instance: CreatureInstance } | null = null;
		for (const creature of group.creatures) {
			if (creature.instances && creature.instances.length > 0) {
				selectedInstance = { creature, instance: creature.instances[0] };
				break;
			}
		}

		if (selectedInstance) {
			this.buildDetailedCreatureRow(
				detailRowContainer,
				selectedInstance.creature,
				selectedInstance.instance,
				data,
				ctx,
				lang
			);
		}

		// If the enemy group contains a single creature, no need for a grid
		if (group.creatures.length === 1 && group.creatures[0].amount === 1) {
			return
		}

		// Grid of Creature Instances
		const instancesGrid = container.createEl('div', { cls: 'creature-instances-grid' });

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
				this.resolveImageSource(imgSrcRaw)
					.then((imgSrc) => {
						imgEl.createEl('img', { attr: { src: imgSrc, alt: creature.name } });
					})
					.catch(() => {
						// Use default image or handle error
						imgEl.createEl('img', { attr: { src: 'path/to/default-image.png', alt: creature.name } });
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
					this.buildDetailedCreatureRow(
						detailRowContainer,
						creature,
						instance,
						data,
						ctx,
						lang
					);
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
		lang: string
	): void {
		container.addClass('character-row');

		// Left: Creature Image
		const imageEl = container.createEl('div', { cls: 'character-image' });
		const imgSrcRaw = creature.image ?? null;
		this.resolveImageSource(imgSrcRaw)
			.then((imgSrc) => {
				imageEl.createEl('img', { attr: { src: imgSrc, alt: creature.name } });
			})
			.catch(() => {
				// Use default image or handle error
				imageEl.createEl('img', { attr: { src: 'path/to/default-image.png', alt: creature.name } });
			});

		// Middle: Creature Info
		const infoEl = container.createEl('div', { cls: 'character-info' });

		// Top: Creature Name (include instance ID)
		infoEl.createEl('div', { cls: 'character-name', text: `${creature.name} #${instance.id}` });

		// Bottom: Condition Icons (Placeholder)
		infoEl.createEl('div', { cls: 'character-conditions' });
		// TODO: Implement condition icons

		// Right: Health Info
		const healthEl = container.createEl('div', { cls: 'character-health' });
		const hpEl = healthEl.createEl('div', { cls: 'character-hp' });
		hpEl.textContent = `${instance.current_hp}/${creature.max_hp}`;

		// HP Click Handler
		hpEl.addEventListener('click', () => {
			const modal = new HpEditModal(this.app, instance, creature, data, ctx, () => {
				hpEl.textContent = `${instance.current_hp}/${creature.max_hp}`;
				this.updateCodeBlock(data, ctx, lang);

				// Update the HP in the grid cell as well
				const gridCell = container.parentElement?.querySelector(
					`.creature-instance-cell:nth-child(${instance.id}) .instance-hp`
				);
				if (gridCell) {
					gridCell.textContent = `${instance.current_hp}/${creature.max_hp}`;
				}
			});
			modal.open();
		});
	}

	// TODO - move this to utils
	private async resolveImageSource(imgSrcRaw: string): Promise<string> {
		// Check if it's an Obsidian link
		const obsidianLinkMatch = imgSrcRaw.match(/!\[\[(.+?)\]\]/);
		if (obsidianLinkMatch) {
			const fileName = obsidianLinkMatch[1];
			const file = this.app.metadataCache.getFirstLinkpathDest(fileName, '');
			if (file instanceof TFile) {
				return this.app.vault.getResourcePath(file);
			} else {
				throw new Error('Image file not found in vault.');
			}
		}

		// Check if it's a URL
		if (imgSrcRaw.match(/^https?:\/\//)) {
			return imgSrcRaw;
		}

		// Assume it's a vault path
		const file = this.app.vault.getAbstractFileByPath(imgSrcRaw);
		if (file instanceof TFile) {
			return this.app.vault.getResourcePath(file);
		} else {
			throw new Error('Image file not found in vault.');
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

		// Optional: Color code the HP display
		if (this.isHero(character) && currentHp < 0) {
			hpEl.style.color = 'red';
		} else if (tempHp > 0) {
			hpEl.style.color = 'green';
		} else {
			hpEl.style.color = '';
		}
	}

	private isHero(character: Hero | CreatureInstance): character is Hero {
		return character.isHero;
	}

	// TODO - move this to utils
	private async updateCodeBlock(data: EncounterData, ctx: MarkdownPostProcessorContext): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		const section = ctx.getSectionInfo(ctx.el);
		if (!section) return;

		const {lineStart, lineEnd} = section;

		// Reconstruct the code block with the updated data
		const newCodeBlockContent = [];
		newCodeBlockContent.push('```' + "ds-initiative");
		newCodeBlockContent.push(stringifyYaml(data).trim());
		newCodeBlockContent.push('```');

		// Replace the old code block with the new one
		lines.splice(lineStart, lineEnd - lineStart + 1, ...newCodeBlockContent);

		const newContent = lines.join('\n');

		// Write the updated content back to the file
		await this.app.vault.modify(file, newContent);
	}
}
