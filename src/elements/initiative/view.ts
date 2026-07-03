// Plan 06 Task 4 — InitiativeView: the Initiative Tracker on Framework v2. Ports the
// legacy InitiativeProcessor's nine build/update methods (initiativeProcessor.ts:58-532)
// into an ElementView, mirroring negotiation/view.ts (per-mount cycleOwner, async
// reset-rebuild) and stamina-bar/view.ts (single view-lifetime modal closer, read-only
// degrade). The legacy processor is NOT deleted and this element is NOT registered yet —
// Task 5 flips registration; until then the legacy processor keeps serving users.
//
// What the framework replaced from the legacy processor:
//  - the manual capture-phase mousedown/pointerdown stop (initiativeProcessor.ts:46-47)
//    -> the pipeline's default click shield (def.noClickShield unset);
//  - the try/catch + ".error-message" div (:48-55) -> the pipeline's single error
//    boundary + renderErrorCard;
//  - ALL 13 CodeBlocks.updateInitiativeTracker(app, data, ctx) calls (:82,93,124,129,
//    157,196,219,317,326,377,402,506,523) -> mutate this.model in place, then
//    void this.persist() (debounced write-behind through host.replaceSource).
//
// UPDATE STRATEGY (preserves legacy's mixed approach):
//  - in-place targeted updates stay in-place: turn indicator, stamina text, malice text,
//    condition-icon container rebuild — immediate feedback; persist() just saves;
//  - mid-level: instance-cell select rebuilds only the detail-row sub-container (:312);
//  - coarse rebuilds (legacy Reset Round :78 / grid minion-pool callback :324 emptied a
//    container and re-ran buildUI INSIDE it — the minion-pool one even nested the whole
//    tracker inside one group's container, masked only by the post-write re-render)
//    become rebuildAndPersist(): framework default update() (unload owned children +
//    onMount against this.model), then persist — the negotiation resetNegotiation shape.
//  - Reset Encounter (:90-95) never rebuilt in legacy at all (it relied on the
//    file-write re-render); on v2 rendering never writes without a user mutation, so it
//    now goes through the same rebuildAndPersist().
//
// DELIBERATE DIVERGENCE (malice): legacy's malice click did
// `maliceContainer.setText(...)` (:123,:128), which — setText replacing the container's
// ENTIRE content — destroyed the chevron modifiers and the .malice-text div on first
// click; the post-write reading-mode re-render immediately rebuilt them, hiding the bug.
// persist() alone doesn't rebuild, so the port sets the text on the .malice-text element
// itself, keeping the chevrons alive (same visible behavior legacy users saw).
//
// READ-ONLY (F1 §4.4 — cx.host.canPersist === false, e.g. canvas): the tracker renders
// inert. No write-triggering handler is wired (turn/stamina/malice/condition/select/
// reset), and dead-end write affordances (top action bar, malice chevrons, add-condition
// icons, click-invite titles) are not built at all. The pipeline stamps
// data-dse-readonly + the CSS badge shows "Read-only"; nothing extra needed here.
import { Component, setIcon } from 'obsidian';
import type { Modal } from 'obsidian';
import { ElementView } from '@/framework/view';
import type { RenderContext } from '@/framework/context';
import { ConditionManager } from '@utils/Conditions';
import { Images } from '@utils/Images';
import { StaminaBar } from '@model/StaminaBar';
import { StaminaEditModal } from '@views/StaminaEditModal';
import { ResetEncounterModal } from '@views/ResetEncounterModal';
import { AddConditionsModal } from '@views/ConditionSelectModal';
import { MinionStaminaPoolModal } from '@views/MinionStaminaPoolModal';
import {
	Condition,
	Creature,
	CreatureInstance,
	EncounterData,
	EnemyGroup,
	Hero,
	resetEncounter,
} from './model';

export class InitiativeView extends ElementView<EncounterData> {
	/** Same construction site as the legacy processor's constructor (:31). */
	private readonly conditionManager = new ConditionManager();

	/** The currently OPEN modal from the most recent open, or null once it closes.
	 *  REPLACED (not accumulated) on every open and nulled on close — the view holds
	 *  exactly one pending closer regardless of how many modals were opened
	 *  (stamina-bar's activeModal pattern; never register() per open). */
	private activeModal: Modal | null = null;

	constructor(cx: RenderContext) {
		super(cx);
		// F1 §4.5: a modal opened by the view must close on view unload. ONE
		// view-lifetime registration over the replaced-on-open reference above;
		// registered here (not in onMount, which the default update() path re-runs).
		this.register(() => this.activeModal?.close());
	}

	protected onMount(root: HTMLElement, model: EncounterData): void {
		// Per-mount listener owner: coarse rebuilds go through the framework default
		// update(), whose unloadOwnedChildren() releases every registration bound here
		// before onMount runs again — nothing accumulates on the view across rebuilds.
		const owner = this.addChild(new Component());
		const container = root.createEl('div', { cls: 'ds-init-container' });
		this.buildUI(container, owner, model);
	}

	private get canWrite(): boolean {
		return this.cx.host.canPersist;
	}

	/** Open `modal` tracked as THE active modal: close-on-unload via the constructor's
	 *  single registration; the wrapped onClose nulls the reference when the modal
	 *  actually closes (identity-guarded so an older modal can't null a newer one) while
	 *  still running the modal's own inherited onClose behavior. */
	private openModal(modal: Modal): void {
		const inheritedOnClose = modal.onClose.bind(modal);
		modal.onClose = () => {
			inheritedOnClose();
			if (this.activeModal === modal) this.activeModal = null;
		};
		this.activeModal = modal;
		modal.open();
	}

	/** The one whole-model change path (Reset Round / Reset Encounter / squad-pool edits
	 *  from the grid): this.model was already mutated; rebuild through the framework
	 *  default update() (unload owned children + onMount), then persist. Failures are
	 *  caught and logged — never left as unhandled rejections (negotiation's
	 *  resetNegotiation pattern). */
	private async rebuildAndPersist(): Promise<void> {
		try {
			await this.update(this.model);
			await this.persist();
		} catch (error) {
			console.error('Draw Steel Elements: initiative tracker rebuild failed', error);
		}
	}

	// ------------------------------------------------------------- build (port of :58)

	private buildUI(container: HTMLElement, owner: Component, data: EncounterData): void {
		// Top action bar: both children are write actions — gated off entirely when
		// read-only (F1 §4.4: no dead-end write affordances).
		if (this.canWrite) {
			const topActionBar = container.createEl('div', { cls: 'top-action-bar' });

			// Reset Round Button (:62): legacy emptied the container and re-ran buildUI
			// inside it; on v2 the same coarse rebuild is the framework update().
			const resetRoundButton = topActionBar.createEl('button', {
				text: 'Reset Round',
				cls: 'reset-round-button',
			});
			owner.registerDomEvent(resetRoundButton, 'click', () => {
				this.model.heroes.forEach((hero) => {
					hero.has_taken_turn = false;
				});
				this.model.enemy_groups.forEach((group) => {
					group.has_taken_turn = false;
				});
				void this.rebuildAndPersist();
			});

			// Reset Encounter Button (:86).
			const resetEncounterButton = topActionBar.createEl('button', {
				text: 'Reset Encounter State',
				cls: 'reset-encounter-button',
			});
			owner.registerDomEvent(resetEncounterButton, 'click', () => {
				this.openModal(
					new ResetEncounterModal(this.cx.app, () => {
						resetEncounter(this.model);
						void this.rebuildAndPersist();
					}),
				);
			});
		}

		// Heroes UI (:98).
		const heroesContainer = container.createEl('div', { cls: 'heroes-container' });
		heroesContainer.createEl('h3', { text: 'Heroes' });
		data.heroes.forEach((hero) => {
			const heroContEl = heroesContainer.createEl('div', { cls: 'hero-container' });
			this.buildCharacterRow(heroContEl, hero, owner);
		});

		// Enemies UI (:107).
		const enemiesContainer = container.createEl('div', { cls: 'enemies-container' });
		const enemyHeader = enemiesContainer.createEl('div', { cls: 'enemies-header' });
		enemyHeader.createEl('h3', { text: 'Enemy Groups' });

		// Villain Power (:112). Chevrons are write controls — not built when read-only.
		const maliceContainer = enemyHeader.createEl('div', { cls: 'malice-container' });
		let maliceUp: HTMLElement | null = null;
		let maliceDown: HTMLElement | null = null;
		if (this.canWrite) {
			const maliceModifiers = maliceContainer.createEl('div', { cls: 'malice-modifiers' });
			maliceUp = maliceModifiers.createEl('div', { cls: 'malice-modifier' });
			maliceDown = maliceModifiers.createEl('div', { cls: 'malice-modifier' });
			setIcon(maliceUp, 'chevron-up');
			setIcon(maliceDown, 'chevron-down');
		}
		const maliceText = maliceContainer.createEl('div', {
			cls: 'malice-text',
			text: 'Malice: ' + data.malice.value,
		});
		if (maliceUp && maliceDown) {
			// In-place text update on the .malice-text el — NOT legacy's
			// maliceContainer.setText, which wiped the chevrons (see file header).
			owner.registerDomEvent(maliceUp, 'click', () => {
				data.malice.value += 1;
				maliceText.setText('Malice: ' + data.malice.value);
				void this.persist();
			});
			owner.registerDomEvent(maliceDown, 'click', () => {
				data.malice.value -= 1;
				maliceText.setText('Malice: ' + data.malice.value);
				void this.persist();
			});
		}

		data.enemy_groups.forEach((group) => {
			const groupContEl = enemiesContainer.createEl('div', { cls: 'enemy-group-container' });
			this.buildEnemyGroupRow(groupContEl, group, owner);
		});
	}

	// -------------------------------------------------------------- hero row (:138)

	private buildCharacterRow(container: HTMLElement, character: Hero, owner: Component): void {
		// Left icons
		const icon = container.createEl('div', { cls: 'character-icon' });

		// Turn Indicator
		const turnIndicatorEl = icon.createEl('div', { cls: 'turn-indicator' });
		this.updateTurnIndicator(turnIndicatorEl, character.has_taken_turn ?? false);
		if (this.canWrite) {
			turnIndicatorEl.title = 'Toggle to mark turn taken';
			owner.registerDomEvent(turnIndicatorEl, 'click', () => {
				if (this.isHero(character)) {
					character.has_taken_turn = !(character.has_taken_turn ?? false);
					this.updateTurnIndicator(turnIndicatorEl, character.has_taken_turn);
					void this.persist();
				}
			});
		}

		const rowEl = container.createEl('div', { cls: 'character-row' });

		// Character Image
		const imageEl = rowEl.createEl('div', { cls: 'character-image' });
		const imgSrcRaw = character.image ?? null;
		Images.resolveImageSourceOrDefault(this.cx.app, imgSrcRaw, this.cx.settings.defaultImagePath).then(
			(imgSrc) => {
				imageEl.createEl('img', { attr: { src: imgSrc, alt: character.name } });
			},
		);

		// Middle: Character Info
		const infoEl = rowEl.createEl('div', { cls: 'character-info' });
		infoEl.createEl('div', { cls: 'character-name', text: character.name });
		const conditionsEl = infoEl.createEl('div', { cls: 'character-conditions' });
		this.buildConditionIcons(conditionsEl, character, owner);

		// Right: Health Info
		const rightContainer = rowEl.createEl('div', { cls: 'character-right' });
		const healthEl = rightContainer.createEl('div', { cls: 'character-health' });
		const staminaEl = healthEl.createEl('div', { cls: 'character-stamina' });
		this.updateStaminaDisplay(staminaEl, character);

		if (this.canWrite) {
			owner.registerDomEvent(staminaEl, 'click', () => {
				const staminaBar = StaminaBar.fromHero(character);
				this.openModal(
					new StaminaEditModal(this.cx.app, staminaBar, true, character.name, () => {
						staminaBar.updateHero(character);
						this.updateStaminaDisplay(staminaEl, character);
						void this.persist();
					}),
				);
			});
		}
	}

	// ------------------------------------------------------------ group row (:202)

	private buildEnemyGroupRow(container: HTMLElement, group: EnemyGroup, owner: Component): void {
		// Left icons
		const icon = container.createEl('div', { cls: 'enemy-group-icon' });

		// Turn Indicator
		const turnIndicatorEl = icon.createEl('div', { cls: 'turn-indicator' });
		this.updateTurnIndicator(turnIndicatorEl, group.has_taken_turn ?? false);
		if (this.canWrite) {
			turnIndicatorEl.title = 'Toggle to mark turn taken';
			owner.registerDomEvent(turnIndicatorEl, 'click', () => {
				group.has_taken_turn = !(group.has_taken_turn ?? false);
				this.updateTurnIndicator(turnIndicatorEl, group.has_taken_turn);
				void this.persist();
			});
		}

		const groupEl = container.createEl('div', { cls: 'enemy-group' });

		// Group Header
		const groupHeader = groupEl.createEl('div', { cls: 'group-header' });
		groupHeader.createEl('h4', { text: group.name });

		// Detailed Creature Row Container
		const detailRowContainer = groupEl.createEl('div', { cls: 'creature-detail-row' });

		// Determine the selected creature instance (:232 — verbatim).
		let selectedInstance: { creature: Creature; instance: CreatureInstance } | null = null;
		if (group.selectedInstanceKey != null) {
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
				group,
				owner,
			);
		}

		// If the enemy group contains a single creature, no need for a grid (:271).
		if (group.creatures.length === 1 && group.creatures[0].amount === 1) {
			return;
		}

		// Grid of Creature Instances
		const instancesGrid = groupEl.createEl('div', { cls: 'creature-instances-grid' });

		group.creatures.forEach((creature, creatureIndex) => {
			creature.instances?.forEach((instance) => {
				const cellEl = instancesGrid.createEl('div', { cls: 'creature-instance-cell' });

				const instanceKey = `${creatureIndex}-${instance.id}`;
				if (group.selectedInstanceKey === instanceKey) {
					cellEl.addClass('selected');
				}

				const imgEl = cellEl.createEl('div', { cls: 'instance-image' });
				const imgSrcRaw = creature.image ?? null;
				Images.resolveImageSourceOrDefault(this.cx.app, imgSrcRaw, this.cx.settings.defaultImagePath).then(
					(imgSrc) => {
						imgEl.createEl('img', { attr: { src: imgSrc, alt: creature.name } });
					},
				);

				const staminaEl = cellEl.createEl('div', { cls: 'instance-stamina' });
				this.updateStaminaDisplay(staminaEl, instance, creature, group);

				// Selection persists selectedInstanceKey and dblclick edits stamina —
				// both are writes; the cells stay inert when read-only.
				if (!this.canWrite) return;

				// Click: select + rebuild the detail-row sub-container (:303).
				owner.registerDomEvent(cellEl, 'click', () => {
					instancesGrid.querySelectorAll('.creature-instance-cell').forEach((cell) => {
						cell.removeClass('selected');
					});
					cellEl.addClass('selected');

					detailRowContainer.empty();
					this.buildDetailedCreatureRow(detailRowContainer, creature, instance, group, owner);

					group.selectedInstanceKey = instanceKey;
					void this.persist();
				});

				// Double-click: edit STAMINA (:321).
				owner.registerDomEvent(cellEl, 'dblclick', () => {
					if (group.is_squad && creature.squad_role === 'minion') {
						// The Task-3 decoupled modal: it mutates the shared model, then the
						// injected persist callback must BOTH refresh the owner UI AND save.
						// Legacy re-ran buildUI inside the group container (:324) — on v2
						// the whole-view update() is the equivalent coarse rebuild.
						this.openModal(
							new MinionStaminaPoolModal(this.cx.app, group, creature, () => {
								void this.rebuildAndPersist();
							}),
						);
					} else {
						this.openCreatureStaminaModal(instance, creature, staminaEl, container);
					}
				});
			});
		});
	}

	// ---------------------------------------------------------- detail row (:337)

	private buildDetailedCreatureRow(
		container: HTMLElement,
		creature: Creature,
		instance: CreatureInstance,
		group: EnemyGroup,
		owner: Component,
	): void {
		container.addClass('character-row');

		// Left: Creature Image
		const imageEl = container.createEl('div', { cls: 'character-image' });
		const imgSrcRaw = creature.image ?? null;
		Images.resolveImageSourceOrDefault(this.cx.app, imgSrcRaw, this.cx.settings.defaultImagePath).then(
			(imgSrc) => {
				imageEl.createEl('img', { attr: { src: imgSrc, alt: creature.name } });
			},
		);

		// Middle: Creature Info
		const infoEl = container.createEl('div', { cls: 'character-info' });
		infoEl.createEl('div', { cls: 'character-name', text: `${creature.name} #${instance.id}` });
		const conditionsEl = infoEl.createEl('div', { cls: 'character-conditions' });
		this.buildConditionIcons(conditionsEl, instance, owner);

		// Right: Health Info
		const healthEl = container.createEl('div', { cls: 'character-health' });
		const staminaEl = healthEl.createEl('div', { cls: 'character-stamina' });

		if (group.is_squad && creature.squad_role === 'minion') {
			// For minions in a squad, display the pool health
			this.updateStaminaDisplay(staminaEl, instance, creature, group);
			if (this.canWrite) {
				owner.registerDomEvent(staminaEl, 'click', () => {
					// Persist callback refreshes the affected UI (this detail row, as
					// legacy :374-378 did) and saves.
					this.openModal(
						new MinionStaminaPoolModal(this.cx.app, group, creature, () => {
							container.empty();
							this.buildDetailedCreatureRow(container, creature, instance, group, owner);
							void this.persist();
						}),
					);
				});
			}
		} else {
			// For normal creatures and captains
			this.updateStaminaDisplay(staminaEl, instance, creature, group);
			if (this.canWrite) {
				owner.registerDomEvent(staminaEl, 'click', () => {
					this.openCreatureStaminaModal(instance, creature, staminaEl, container);
				});
			}
		}
	}

	// ------------------------------------------------- creature stamina modal (:390)

	private openCreatureStaminaModal(
		instance: CreatureInstance,
		creature: Creature,
		staminaEl: HTMLElement,
		container: HTMLElement,
	): void {
		const staminaBar = StaminaBar.fromCreature(instance, creature);
		this.openModal(
			new StaminaEditModal(this.cx.app, staminaBar, false, creature.name, () => {
				staminaBar.updateCreature(instance);
				this.updateStaminaDisplay(staminaEl, instance, creature);
				void this.persist();

				// Update the STAMINA in the grid cell as well (legacy :405 —
				// nth-child(instance.id) targeting ported verbatim, quirks included).
				const gridCell = container.parentElement?.querySelector(
					`.creature-instance-cell:nth-child(${instance.id}) .instance-stamina`,
				);
				if (gridCell) {
					this.updateStaminaDisplay(gridCell as HTMLElement, instance, creature);
				}
			}),
		);
	}

	// --------------------------------------------------- targeted updates (:414/:425)

	private updateTurnIndicator(el: HTMLElement, hasTakenTurn: boolean): void {
		el.empty();
		if (hasTakenTurn) {
			el.addClass('taken-turn');
			setIcon(el, 'check');
		} else {
			el.removeClass('taken-turn');
			setIcon(el, 'dot');
		}
	}

	private updateStaminaDisplay(
		staminaEl: HTMLElement,
		character: Hero | CreatureInstance,
		creature?: Creature,
		group?: EnemyGroup,
	): void {
		if (group?.is_squad && creature?.squad_role === 'minion') {
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
				staminaEl.style.color = 'red';
			} else if (tempStamina > 0) {
				staminaEl.style.color = 'green';
			} else {
				staminaEl.style.color = '';
			}
		}
	}

	// ------------------------------------------------------- condition icons (:466)

	private buildConditionIcons(
		container: HTMLElement,
		character: Hero | CreatureInstance,
		owner: Component,
	): void {
		const conditions = character.conditions || [];

		conditions.forEach((conditionEntry) => {
			let conditionKey: string;
			let conditionData: Condition | null = null;
			if (typeof conditionEntry === 'string') {
				conditionKey = conditionEntry;
			} else if (typeof conditionEntry === 'object' && conditionEntry.key) {
				conditionKey = conditionEntry.key;
				conditionData = conditionEntry;
			} else {
				return;
			}

			const condition = this.conditionManager.getAnyConditionByKey(conditionKey);
			if (condition) {
				const iconEl = container.createEl('div', { cls: 'condition-icon' });
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

				// Click-to-remove is a write — inert when read-only.
				if (this.canWrite) {
					owner.registerDomEvent(iconEl, 'click', () => {
						character.conditions = conditions.filter((entry) => entry !== conditionEntry);
						container.empty();
						this.buildConditionIcons(container, character, owner);
						void this.persist();
					});
				}
			}
		});

		// The add-condition affordance is pure write UI — not built when read-only.
		if (!this.canWrite) return;
		const addConditionEl = container.createEl('div', { cls: 'add-condition-icon' });
		setIcon(addConditionEl, 'plus-circle');
		addConditionEl.title = 'Add Condition';
		owner.registerDomEvent(addConditionEl, 'click', () => {
			this.openModal(
				new AddConditionsModal(this.cx.app, character, this.conditionManager, (newConditions) => {
					character.conditions = (character.conditions || []).concat(newConditions);
					container.empty();
					this.buildConditionIcons(container, character, owner);
					void this.persist();
				}),
			);
		});
	}

	private isHero(character: Hero | CreatureInstance): character is Hero {
		return 'isHero' in character ? character.isHero : false;
	}
}
