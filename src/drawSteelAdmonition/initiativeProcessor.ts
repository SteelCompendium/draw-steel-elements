import {App, MarkdownPostProcessorContext, parseYaml} from "obsidian";
import {CodeBlocks} from "../utils/CodeBlocks";

interface Hero {
	name: string;
	max_hp: number;
	current_hp?: number;
}

interface Creature {
	name: string;
	amount: number;
	max_hp: number;
	current_hp?: number;
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

		// Parse the source (assumed to be YAML)
		const data = this.parseYaml(source);

		// Build the UI using the data
		this.buildUI(container, data, ctx);
	}

	private parseYaml(source: string): EncounterData {
		const data = parseYaml(source) as EncounterData;
		// You might want to add validation here to ensure data integrity
		return data;
	}

	private buildUI(container: HTMLElement, data: EncounterData, ctx: MarkdownPostProcessorContext): void {
		// Heroes UI
		const heroesContainer = container.createEl('div', { cls: 'heroes-container' });
		heroesContainer.createEl('h2', { text: 'Heroes' });

		data.heroes.forEach((hero) => {
			const heroEl = heroesContainer.createEl('div', { cls: 'hero' });
			heroEl.createEl('span', { text: `${hero.name} (HP: ${hero.current_hp ?? hero.max_hp}/${hero.max_hp})` });

			const damageButton = heroEl.createEl('button', { text: 'Take Damage' });
			damageButton.addEventListener('click', async () => {
				hero.current_hp = (hero.current_hp ?? hero.max_hp) - 5;
				if (hero.current_hp < 0) hero.current_hp = 0;

				heroEl.querySelector('span')!.textContent = `${hero.name} (HP: ${hero.current_hp}/${hero.max_hp})`;

				await CodeBlocks.updateCodeBlock(this.app, data, ctx);
			});
		});

		// Enemies UI
		const enemiesContainer = container.createEl('div', { cls: 'enemies-container' });
		enemiesContainer.createEl('h2', { text: 'Enemies' });

		data.enemy_groups.forEach((group) => {
			const groupEl = enemiesContainer.createEl('div', { cls: 'enemy-group' });
			groupEl.createEl('h3', { text: group.name });

			group.creatures.forEach((creature) => {
				const creatureEl = groupEl.createEl('div', { cls: 'creature' });
				creatureEl.createEl('span', { text: `${creature.name} x${creature.amount} (HP: ${creature.current_hp ?? creature.max_hp}/${creature.max_hp})` });

				const damageButton = creatureEl.createEl('button', { text: 'Take Damage' });
				damageButton.addEventListener('click', async () => {
					creature.current_hp = (creature.current_hp ?? creature.max_hp) - 5;
					if (creature.current_hp < 0) creature.current_hp = 0;

					creatureEl.querySelector('span')!.textContent = `${creature.name} x${creature.amount} (HP: ${creature.current_hp}/${creature.max_hp})`;

					await CodeBlocks.updateCodeBlock(this.app, data, ctx);
				});
			});
		});
	}

}
