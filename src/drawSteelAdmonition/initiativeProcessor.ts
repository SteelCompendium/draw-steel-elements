import { App, MarkdownPostProcessorContext, TFile, parseYaml, stringifyYaml } from "obsidian";
import {HpEditModal} from "../utils/HpEditModal";

interface Hero {
	name: string;
	max_hp: number;
	current_hp?: number;    // Can be negative down to -50% of max_hp
	temp_hp?: number;       // Temporary HP (heroes only)
	image?: string;
}

interface Creature {
	name: string;
	amount: number;
	max_hp: number;
	current_hp?: number;    // For creatures, current_hp cannot go below 0
	image?: string;
}

interface EnemyGroup {
	name: string;
	creatures: Creature[];
}

interface EncounterData {
	heroes: Hero[];
	enemy_groups: EnemyGroup[];
}

export class InitiativeProcessor {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
		const container = el.createEl('div', { cls: "ds-init-container" });
		const data = this.parseYaml(source);
		this.buildUI(container, data, ctx);
	}

	private parseYaml(source: string): EncounterData {
		const data = parseYaml(source) as EncounterData;
		return data;
	}

	private buildUI(container: HTMLElement, data: EncounterData, ctx: MarkdownPostProcessorContext): void {
		// Heroes UI
		const heroesContainer = container.createEl('div', { cls: 'heroes-container' });
		heroesContainer.createEl('h2', { text: 'Heroes' });

		data.heroes.forEach((hero) => {
			this.buildCharacterRow(heroesContainer, hero, data, ctx);
		});

		// Enemies UI
		const enemiesContainer = container.createEl('div', { cls: 'enemies-container' });
		enemiesContainer.createEl('h2', { text: 'Enemies' });

		data.enemy_groups.forEach((group) => {
			const groupEl = enemiesContainer.createEl('div', { cls: 'enemy-group' });
			groupEl.createEl('h3', { text: group.name });

			group.creatures.forEach((creature) => {
				this.buildCharacterRow(groupEl, creature, data, ctx);
			});
		});
	}

	private buildCharacterRow(
		container: HTMLElement,
		character: Hero | Creature,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext
	): void {
		const rowEl = container.createEl('div', { cls: 'character-row' });

		// ... (other parts of the method remain the same)

		// Right: Health Info
		const healthEl = rowEl.createEl('div', { cls: 'character-health' });
		const hpEl = healthEl.createEl('div', {
			cls: 'character-hp',
		});
		this.updateHpDisplay(hpEl, character);

		hpEl.addEventListener('click', () => {
			const modal = new HpEditModal(this.app, character, data, ctx, () => {
				this.updateHpDisplay(hpEl, character);
				this.updateCodeBlock(data, ctx);
			});
			modal.open();
		});
	}

	private updateHpDisplay(hpEl: HTMLElement, character: Hero | Creature): void {
		const currentHp = character.current_hp ?? character.max_hp;
		const tempHp = this.isHero(character) ? character.temp_hp ?? 0 : 0;
		const maxHp = character.max_hp;

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

	private isHero(character: Hero | Creature): character is Hero {
		return 'temp_hp' in character;
	}

	private async updateCodeBlock(data: EncounterData, ctx: MarkdownPostProcessorContext): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		const section = ctx.getSectionInfo(ctx.el);
		if (!section) return;

		const { lineStart, lineEnd } = section;

		// Reconstruct the code block with the updated data
		const newCodeBlockContent = [];
		newCodeBlockContent.push('```' + ctx.lang);
		newCodeBlockContent.push(stringifyYaml(data).trim());
		newCodeBlockContent.push('```');

		// Replace the old code block with the new one
		lines.splice(lineStart, lineEnd - lineStart + 1, ...newCodeBlockContent);

		const newContent = lines.join('\n');

		// Write the updated content back to the file
		await this.app.vault.modify(file, newContent);
	}
}
