// Plan 09 Task 9 (D2 §3.11) — InitiativeView on the D2 kit: the a11y epicenter. The
// Plan 06 port (which transcribed the legacy InitiativeProcessor's nine build/update
// methods) rebuilt so every legacy click-<div> is a REAL, labelled, focus-visible kit
// control, with every color riding the --dse-* tokens (D2 §5 — zero inline color):
//  - the top action bar -> kit buttonRow (real <button>s, labelled);
//  - the turn indicator -> kit iconButton: aria-pressed + [data-taken] (check/dot glyph
//    swap — color is never the sole signal, §4.7);
//  - Malice ± -> the kit stepper (CB-7 FIX at the root: the stepper's render() updates
//    ONLY its value node in place, so the ± buttons can never be wiped the way legacy's
//    maliceContainer.setText wiped the chevrons);
//  - creature grid cells -> real toggle <button>s (aria-pressed + [data-selected] on the
//    --dse-select token) tagged data-instance-key, and the stamina-edit grid-cell sync
//    targets that key (CB-6 FIX — legacy's nth-child(instance.id) lookup hit the wrong
//    cell whenever the instance wasn't also the grid's nth child, e.g. any creature
//    after the first);
//  - stamina numbers -> .dse-init__stamina[data-state="healthy|dying|dead"] (the inline
//    red/green/crimson eviction, SC-5) on real buttons that open the stamina modals;
//  - condition icons -> .dse-cond kit iconButtons riding the T8 validated helpers
//    (applyConditionColor — CSS.supports-gated --dse-condition-color custom property,
//    never el.style.color — and applyConditionEffect's known-vocabulary classes).
// The portraits preference (D4 owns the descriptor) arrives on the element root as
// data-dse-portraits via the pipeline's prefs.reflect(); the stylesheet hides
// .dse-init__portrait/.dse-init__cell-portrait when it is "off" — nothing to wire here.
//
// PERSISTENCE IS UNTOUCHED (the byte-compat bar): the model + serialize path are exactly
// the Plan 06 wrappers; every mutation still mutates this.model in place then
// `void this.persist()` (debounced write-behind through host.replaceSource).
//
// UPDATE STRATEGY (preserves the port's mixed approach):
//  - in-place targeted updates stay in-place: turn indicator, stamina text, the malice
//    stepper value, condition-icon container rebuild — immediate feedback; persist()
//    just saves;
//  - mid-level: instance-cell select rebuilds only the detail-row sub-container and
//    repaints cell selection through the kit handles;
//  - coarse rebuilds (Reset Round / Reset Encounter / squad-pool edits from the grid)
//    go through rebuildAndPersist(): framework default update() (unload owned children
//    + onMount against this.model), then persist — the negotiation resetNegotiation
//    shape.
//
// READ-ONLY (F1 §4.4 — cx.host.canPersist === false, e.g. canvas): the tracker renders
// inert. No write-triggering handler is wired and no dead-end write affordance is built
// — the action bar, malice stepper, add-condition and remove-condition buttons are
// omitted, and turn indicators / cells / stamina render as static state displays (spans,
// not buttons). The pipeline stamps data-dse-readonly + the CSS badge shows "Read-only".
import { Component, setIcon } from 'obsidian';
import type { Modal } from 'obsidian';
import { ElementView } from '@/framework/view';
import type { RenderContext } from '@/framework/context';
import { buttonRow, iconButton, stepper, tooltip } from '@/framework/kit';
import type { IconButtonHandle } from '@/framework/kit';
import { ConditionManager } from '@utils/Conditions';
import { Images } from '@utils/Images';
import { StaminaBar } from '@model/StaminaBar';
import { StaminaEditModal } from '@views/StaminaEditModal';
import { ResetEncounterModal } from '@views/ResetEncounterModal';
import { AddConditionsModal } from '@views/ConditionSelectModal';
import { MinionStaminaPoolModal } from '@views/MinionStaminaPoolModal';
import { applyConditionColor, applyConditionEffect } from '../conditionColor';
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
		const container = root.createDiv({ cls: 'dse-init' });
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

	// ------------------------------------------------------------------------- build

	private buildUI(container: HTMLElement, owner: Component, data: EncounterData): void {
		// Top action bar: both children are write actions — gated off entirely when
		// read-only (F1 §4.4: no dead-end write affordances).
		if (this.canWrite) {
			const bar = buttonRow(
				container,
				[
					{
						icon: 'rotate-ccw',
						text: 'Reset Round',
						label: 'Reset Round',
						onClick: () => {
							this.model.heroes.forEach((hero) => {
								hero.has_taken_turn = false;
							});
							this.model.enemy_groups.forEach((group) => {
								group.has_taken_turn = false;
							});
							void this.rebuildAndPersist();
						},
					},
					{
						icon: 'refresh-cw',
						text: 'Reset Encounter State',
						label: 'Reset Encounter State',
						onClick: () => {
							this.openModal(
								new ResetEncounterModal(this.cx.app, () => {
									resetEncounter(this.model);
									void this.rebuildAndPersist();
								}),
							);
						},
					},
				],
				owner,
			);
			bar.rowEl.addClass('dse-init__actionbar');
		}

		// Heroes.
		const heroesGroup = container.createDiv({ cls: 'dse-init__group dse-init__group--heroes' });
		heroesGroup.createEl('h3', { text: 'Heroes' });
		data.heroes.forEach((hero) => {
			this.buildCharacterRow(heroesGroup.createDiv({ cls: 'dse-init__entry' }), hero, owner);
		});

		// Enemies.
		const enemiesGroup = container.createDiv({ cls: 'dse-init__group dse-init__group--enemies' });
		const enemiesHead = enemiesGroup.createDiv({ cls: 'dse-init__enemies-head' });
		enemiesHead.createEl('h3', { text: 'Enemy Groups' });

		// Malice: the kit stepper (write) or a static value (read-only). CB-7 is fixed
		// by construction — stepper.render() sets ONLY its value node, so the ± buttons
		// survive every press (legacy's container.setText destroyed the chevrons).
		const malice = enemiesHead.createDiv({ cls: 'dse-init__malice' });
		if (this.canWrite) {
			const handle = stepper(
				malice,
				{
					value: data.malice.value,
					// Future-proofing: malice has no editable input today (stepper
					// buttons only), so `integer` is inert until one is enabled.
					integer: true,
					label: 'Malice',
					format: (v) => 'Malice: ' + v,
					onChange: (v) => {
						data.malice.value = v;
						void this.persist();
					},
				},
				owner,
			);
			handle.rootEl
				.querySelector<HTMLElement>('.dse-stepper__value')
				?.addClass('dse-init__malice-value');
		} else {
			malice.createDiv({ cls: 'dse-init__malice-value', text: 'Malice: ' + data.malice.value });
		}

		data.enemy_groups.forEach((group) => {
			this.buildEnemyGroupRow(enemiesGroup.createDiv({ cls: 'dse-init__entry' }), group, owner);
		});
	}

	// ---------------------------------------------------------------- turn indicator

	/** The turn indicator: a kit iconButton (aria-pressed + [data-taken], §4.3) when
	 *  writable; a static glyph span when read-only (state display, not a dead-end
	 *  control). `toggle` flips the model and returns the new state. */
	private buildTurnIndicator(
		entry: HTMLElement,
		name: string,
		taken: boolean,
		toggle: (() => boolean) | null,
		owner: Component,
	): void {
		const box = entry.createDiv({ cls: 'dse-init__turnbox' });
		if (toggle) {
			const handle = iconButton(
				box,
				{
					icon: taken ? 'check' : 'dot',
					label: `Toggle turn taken: ${name}`,
					pressed: taken,
					tooltip: 'Toggle to mark turn taken',
					onClick: () => {
						const nowTaken = toggle();
						handle.setPressed(nowTaken);
						this.updateTurnGlyph(handle.buttonEl, nowTaken);
						void this.persist();
					},
				},
				owner,
			);
			handle.buttonEl.addClass('dse-init__turn');
			this.updateTurnGlyph(handle.buttonEl, taken); // stamp [data-taken] at build
		} else {
			const el = box.createSpan({ cls: 'dse-init__turn' });
			el.createSpan({ cls: 'dse-init__turn-glyph' });
			this.updateTurnGlyph(el, taken);
		}
	}

	/** In-place turn repaint: [data-taken] for the CSS (--dse-turn-done) + the check/dot
	 *  glyph swap (§4.7 — color is never the sole signal). */
	private updateTurnGlyph(turnEl: HTMLElement, taken: boolean): void {
		turnEl.toggleAttribute('data-taken', taken);
		const glyph = turnEl.querySelector<HTMLElement>('.dse-btn__icon, .dse-init__turn-glyph');
		if (glyph) setIcon(glyph, taken ? 'check' : 'dot');
	}

	// -------------------------------------------------------------- stamina control

	/** The clickable stamina number: a kit iconButton (opens the edit modal) when
	 *  writable; a static span when read-only. Content + [data-state] are painted by
	 *  updateStaminaDisplay. aria-live announces in-place value changes (§4.8). */
	private createStaminaControl(
		parent: HTMLElement,
		label: string,
		onClick: (() => void) | null,
		owner: Component,
	): HTMLElement {
		let el: HTMLElement;
		if (onClick) {
			el = iconButton(parent, { label, onClick }, owner).buttonEl;
		} else {
			el = parent.createSpan();
		}
		el.addClass('dse-init__stamina');
		el.setAttribute('aria-live', 'polite');
		return el;
	}

	// -------------------------------------------------------------------- hero row

	private buildCharacterRow(entry: HTMLElement, character: Hero, owner: Component): void {
		const name = character.name ?? 'Hero';
		this.buildTurnIndicator(
			entry,
			name,
			character.has_taken_turn ?? false,
			this.canWrite
				? () => {
						character.has_taken_turn = !(character.has_taken_turn ?? false);
						return character.has_taken_turn;
					}
				: null,
			owner,
		);

		const rowEl = entry.createDiv({ cls: 'dse-init__row' });

		// Character Image
		const imageEl = rowEl.createDiv({ cls: 'dse-init__portrait' });
		const imgSrcRaw = character.image ?? null;
		Images.resolveImageSourceOrDefault(this.cx.app, imgSrcRaw, this.cx.settings.defaultImagePath).then(
			(imgSrc) => {
				imageEl.createEl('img', { attr: { src: imgSrc, alt: character.name } });
			},
		);

		// Middle: Character Info
		const infoEl = rowEl.createDiv({ cls: 'dse-init__info' });
		infoEl.createDiv({ cls: 'dse-init__name', text: character.name });
		const conditionsEl = infoEl.createDiv({ cls: 'dse-init__conditions' });
		this.buildConditionIcons(conditionsEl, character, owner);

		// Right: Health Info
		const rightEl = rowEl.createDiv({ cls: 'dse-init__right' });
		const healthEl = rightEl.createDiv({ cls: 'dse-init__health' });
		const staminaEl = this.createStaminaControl(
			healthEl,
			`Edit stamina: ${name}`,
			this.canWrite
				? () => {
						const staminaBar = StaminaBar.fromHero(character);
						this.openModal(
							new StaminaEditModal(this.cx.app, staminaBar, true, character.name, () => {
								staminaBar.updateHero(character);
								this.updateStaminaDisplay(staminaEl, character);
								void this.persist();
							}),
						);
					}
				: null,
			owner,
		);
		this.updateStaminaDisplay(staminaEl, character);
	}

	// ------------------------------------------------------------------- group row

	private buildEnemyGroupRow(entry: HTMLElement, group: EnemyGroup, owner: Component): void {
		this.buildTurnIndicator(
			entry,
			group.name ?? 'Enemy group',
			group.has_taken_turn ?? false,
			this.canWrite
				? () => {
						group.has_taken_turn = !(group.has_taken_turn ?? false);
						return group.has_taken_turn;
					}
				: null,
			owner,
		);

		const groupEl = entry.createDiv({ cls: 'dse-init__groupbody' });

		// Group Header
		const groupHeader = groupEl.createDiv({ cls: 'dse-init__grouphead' });
		groupHeader.createEl('h4', { text: group.name });

		// Detailed Creature Row Container
		const detailRowContainer = groupEl.createDiv({ cls: 'dse-init__detail' });

		// Determine the selected creature instance (legacy :232 — verbatim, but the
		// creature INDEX is tracked so the detail row knows its data-instance-key).
		let selectedInstance: { creature: Creature; instance: CreatureInstance; key: string } | null =
			null;
		if (group.selectedInstanceKey != null) {
			for (let creatureIndex = 0; creatureIndex < group.creatures.length; creatureIndex++) {
				const creature = group.creatures[creatureIndex];
				if (creature.instances) {
					const instance = creature.instances.find((inst) => {
						const instanceKey = `${creatureIndex}-${inst.id}`;
						return instanceKey === group.selectedInstanceKey;
					});
					if (instance) {
						selectedInstance = { creature, instance, key: group.selectedInstanceKey };
						break;
					}
				}
			}
		}
		if (!selectedInstance) {
			// If no selected instance, default to the first instance
			for (let creatureIndex = 0; creatureIndex < group.creatures.length; creatureIndex++) {
				const creature = group.creatures[creatureIndex];
				if (creature.instances && creature.instances.length > 0) {
					const instance = creature.instances[0];
					selectedInstance = { creature, instance, key: `${creatureIndex}-${instance.id}` };
					break;
				}
			}
		}

		if (selectedInstance) {
			this.buildDetailedCreatureRow(
				detailRowContainer,
				selectedInstance.creature,
				selectedInstance.instance,
				selectedInstance.key,
				group,
				groupEl,
				owner,
			);
		}

		// If the enemy group contains a single creature, no need for a grid (:271).
		if (group.creatures.length === 1 && group.creatures[0].amount === 1) {
			return;
		}

		// Grid of Creature Instances: every cell is a REAL toggle button (aria-pressed,
		// [data-selected] on --dse-select) tagged data-instance-key (CB-6), or a static
		// state display when read-only. Selection repaints through the kit handles.
		const instancesGrid = groupEl.createDiv({ cls: 'dse-init__grid' });
		const cellHandles: IconButtonHandle[] = [];

		group.creatures.forEach((creature, creatureIndex) => {
			creature.instances?.forEach((instance) => {
				const instanceKey = `${creatureIndex}-${instance.id}`;
				const selected = group.selectedInstanceKey === instanceKey;

				let cellEl: HTMLElement;
				if (this.canWrite) {
					const handle = iconButton(
						instancesGrid,
						{
							label: `Select ${creature.name} #${instance.id}`,
							pressed: selected,
							onClick: () => {
								// Repaint selection in place: kit handles own aria-pressed;
								// [data-selected] carries the --dse-select ring.
								cellHandles.forEach((h) => {
									h.setPressed(false);
									h.buttonEl.removeAttribute('data-selected');
								});
								handle.setPressed(true);
								cellEl.setAttribute('data-selected', '');

								detailRowContainer.empty();
								this.buildDetailedCreatureRow(
									detailRowContainer,
									creature,
									instance,
									instanceKey,
									group,
									groupEl,
									owner,
								);

								group.selectedInstanceKey = instanceKey;
								void this.persist();
							},
						},
						owner,
					);
					handle.buttonEl.addClass('dse-init__cell');
					cellHandles.push(handle);
					cellEl = handle.buttonEl;

					// Double-click: edit STAMINA (legacy :321).
					owner.registerDomEvent(cellEl, 'dblclick', () => {
						if (group.is_squad && creature.squad_role === 'minion') {
							// The Task-3 decoupled modal: it mutates the shared model, then the
							// injected persist callback must BOTH refresh the owner UI AND save.
							// The whole-view update() is the equivalent coarse rebuild.
							this.openModal(
								new MinionStaminaPoolModal(this.cx.app, group, creature, () => {
									void this.rebuildAndPersist();
								}),
							);
						} else {
							this.openCreatureStaminaModal(instance, creature, staminaEl, groupEl, instanceKey);
						}
					});
				} else {
					cellEl = instancesGrid.createDiv({ cls: 'dse-init__cell' });
				}

				cellEl.setAttribute('data-instance-key', instanceKey);
				if (selected) cellEl.setAttribute('data-selected', '');

				const imgEl = cellEl.createSpan({ cls: 'dse-init__cell-portrait' });
				const imgSrcRaw = creature.image ?? null;
				Images.resolveImageSourceOrDefault(this.cx.app, imgSrcRaw, this.cx.settings.defaultImagePath).then(
					(imgSrc) => {
						imgEl.createEl('img', { attr: { src: imgSrc, alt: creature.name } });
					},
				);

				const staminaEl = cellEl.createSpan({ cls: 'dse-init__stamina dse-init__cell-stamina' });
				this.updateStaminaDisplay(staminaEl, instance, creature, group);
			});
		});
	}

	// ------------------------------------------------------------------ detail row

	private buildDetailedCreatureRow(
		container: HTMLElement,
		creature: Creature,
		instance: CreatureInstance,
		instanceKey: string,
		group: EnemyGroup,
		groupBodyEl: HTMLElement,
		owner: Component,
	): void {
		container.addClass('dse-init__row');

		// Left: Creature Image
		const imageEl = container.createDiv({ cls: 'dse-init__portrait' });
		const imgSrcRaw = creature.image ?? null;
		Images.resolveImageSourceOrDefault(this.cx.app, imgSrcRaw, this.cx.settings.defaultImagePath).then(
			(imgSrc) => {
				imageEl.createEl('img', { attr: { src: imgSrc, alt: creature.name } });
			},
		);

		// Middle: Creature Info
		const name = `${creature.name} #${instance.id}`;
		const infoEl = container.createDiv({ cls: 'dse-init__info' });
		infoEl.createDiv({ cls: 'dse-init__name', text: name });
		const conditionsEl = infoEl.createDiv({ cls: 'dse-init__conditions' });
		this.buildConditionIcons(conditionsEl, instance, owner);

		// Right: Health Info
		const healthEl = container.createDiv({ cls: 'dse-init__health' });
		const isSquadMinion = !!group.is_squad && creature.squad_role === 'minion';
		const staminaEl = this.createStaminaControl(
			healthEl,
			`Edit stamina: ${name}`,
			this.canWrite
				? () => {
						if (isSquadMinion) {
							// For minions in a squad: the pool modal. Persist callback
							// refreshes the affected UI (this detail row, as legacy did)
							// and saves.
							this.openModal(
								new MinionStaminaPoolModal(this.cx.app, group, creature, () => {
									container.empty();
									this.buildDetailedCreatureRow(
										container,
										creature,
										instance,
										instanceKey,
										group,
										groupBodyEl,
										owner,
									);
									void this.persist();
								}),
							);
						} else {
							// For normal creatures and captains
							this.openCreatureStaminaModal(instance, creature, staminaEl, groupBodyEl, instanceKey);
						}
					}
				: null,
			owner,
		);
		this.updateStaminaDisplay(staminaEl, instance, creature, group);
	}

	// ------------------------------------------------------ creature stamina modal

	private openCreatureStaminaModal(
		instance: CreatureInstance,
		creature: Creature,
		staminaEl: HTMLElement,
		groupBodyEl: HTMLElement,
		instanceKey: string,
	): void {
		const staminaBar = StaminaBar.fromCreature(instance, creature);
		this.openModal(
			new StaminaEditModal(this.cx.app, staminaBar, false, creature.name, () => {
				staminaBar.updateCreature(instance);
				this.updateStaminaDisplay(staminaEl, instance, creature);
				void this.persist();

				// CB-6: refresh THE instance's own grid cell, found by data-instance-key
				// within this group's body (legacy's nth-child(instance.id) lookup hit
				// the wrong cell for any creature after the first).
				const gridCell = groupBodyEl.querySelector<HTMLElement>(
					`.dse-init__cell[data-instance-key="${instanceKey}"] .dse-init__cell-stamina`,
				);
				if (gridCell) {
					this.updateStaminaDisplay(gridCell, instance, creature);
				}
			}),
		);
	}

	// -------------------------------------------------------------- targeted updates

	/** In-place stamina repaint: text + [data-state] (SC-5 — the state attribute keys
	 *  the --dse-stamina-* / --dse-danger tokens in CSS; never an inline color). */
	private updateStaminaDisplay(
		staminaEl: HTMLElement,
		character: Hero | CreatureInstance,
		creature?: Creature,
		group?: EnemyGroup,
	): void {
		const setState = (state: 'healthy' | 'dying' | 'dead' | null): void => {
			if (state) staminaEl.setAttribute('data-state', state);
			else staminaEl.removeAttribute('data-state');
		};

		if (group?.is_squad && creature?.squad_role === 'minion') {
			// For minions in squads, display the minion stamina pool or DEAD
			if ((character as CreatureInstance).isDead) {
				staminaEl.textContent = `DEAD`;
				setState('dead');
			} else {
				const currentStamina = group.minion_stamina_pool ?? 0;
				staminaEl.textContent = `${currentStamina}/${creature.max_stamina * creature.amount} (${creature.max_stamina})`;
				setState(null);
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
			setState(currentStamina < 0 ? 'dying' : tempStamina > 0 ? 'healthy' : null);
		}
	}

	// -------------------------------------------------------------- condition icons

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
			if (!condition) return;

			// Click-to-remove is a write — read-only renders a static state glyph.
			let iconEl: HTMLElement;
			if (this.canWrite) {
				iconEl = iconButton(
					container,
					{
						icon: condition.iconName,
						label: `Remove condition: ${condition.displayName}`,
						tooltip: condition.displayName,
						onClick: () => {
							character.conditions = conditions.filter((entry) => entry !== conditionEntry);
							container.empty();
							this.buildConditionIcons(container, character, owner);
							void this.persist();
						},
					},
					owner,
				).buttonEl;
			} else {
				iconEl = container.createSpan();
				setIcon(iconEl, condition.iconName);
				tooltip(iconEl, condition.displayName);
			}
			iconEl.addClass('dse-cond');

			// Color and effect customizations ride the T8 validated helpers: the color
			// arrives as the CSS.supports-gated --dse-condition-color custom property
			// (never el.style.color), the effect as a known-vocabulary class.
			applyConditionColor(iconEl, conditionData?.color);
			applyConditionEffect(iconEl, conditionData?.effect);
		});

		// The add-condition affordance is pure write UI — not built when read-only.
		if (!this.canWrite) return;
		iconButton(
			container,
			{
				icon: 'plus-circle',
				label: 'Add Condition',
				tooltip: 'Add Condition',
				onClick: () => {
					this.openModal(
						new AddConditionsModal(this.cx.app, character, this.conditionManager, (newConditions) => {
							character.conditions = (character.conditions || []).concat(newConditions);
							container.empty();
							this.buildConditionIcons(container, character, owner);
							void this.persist();
						}),
					);
				},
			},
			owner,
		).buttonEl.addClass('dse-cond--add');
	}

	private isHero(character: Hero | CreatureInstance): character is Hero {
		return 'isHero' in character ? character.isHero : false;
	}
}
