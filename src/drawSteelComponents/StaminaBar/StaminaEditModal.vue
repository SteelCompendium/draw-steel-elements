<template>
    <modal :ok_button_disabled="!state.model_has_changes"
            ok_button_text="Apply"
            cancel_button_text="Reset"
            cancel_button_icon="undo"
            @close="closeButtonPressed"
            @ok="okButtonPressed"
        >
        <stamina-bar :model="state.model" :disable_click="true"/>
        <div class="modifiers-container">
            <div class="stamina-container">
                <div class="stamina-adjust">
                    <stamina-adjustor
                        :max_stamina="state.max_stamina"
                        :current_stamina="state.current_stamina"
                        @add-stamina="addStamina"
                        @sub-stamina="subStamina"
                        @set-stamina="setStamina"
                        @mod-stamina="modStamina"
                    />
                    <span class="temp-stamina-container">
                        Temporary Stamina
                        <stamina-adjustor
                            :current_stamina="state.temp_stamina"
                            :hide_max_stamina="true"
                            @add-stamina="addTempStamina"
                            @sub-stamina="subTempStamina"
                            @set-stamina="setTempStamina"
                            @mod-stamina="modTempStamina"
                        />
                    </span>
                </div>
            </div>
            <div class="quick-access-container">
                <ds-button icon="skull" @click="kill">Kill</ds-button>
                <ds-button icon="plus" @click="fullHeal">Full Heal</ds-button>
                <ds-button icon="syringe" @click="spendRecovery">Spend Recovery</ds-button>
            </div>
        </div>
    </modal>
</template>

<script setup lang="ts">
import Modal from '@drawSteelComponents/Common/Modal.vue';
import DsButton from "@drawSteelComponents/Common/DsButton.vue"
import StaminaBar from '@drawSteelComponents/StaminaBar/StaminaBar.vue';
import StaminaAdjustor from '@drawSteelComponents/StaminaBar/StaminaAdjustor.vue'
import { StaminaBar as StaminaBarModel } from '@/model/StaminaBar'; 
import { computed, reactive } from 'vue';

const props = defineProps<{
    model: StaminaBarModel | undefined
}>();

const emit = defineEmits(['close', 'result']);

const state = reactive({
    model: props.model,
    max_stamina: props.model?.max_stamina ?? 0,
    current_stamina: props.model?.current_stamina ?? 0,
    temp_stamina: props.model?.temp_stamina ?? 0,
    model_has_changes: false,
});

const updateModel = () => {
    if (!state.model) return;
    state.model.max_stamina = state.max_stamina
    state.model.current_stamina = state.current_stamina
    state.model.temp_stamina = state.temp_stamina
    if (state.model != props.model) {
        state.model_has_changes = true;
    }
}

const setStamina = (value: number) => {
    state.current_stamina = value
    updateModel();
}

const modStamina = (value: number) => {
    state.current_stamina += value;
    if (state.current_stamina > state.max_stamina) {
        state.current_stamina = state.max_stamina;
    }
    updateModel();
}

const addStamina = () => {
    modStamina(1);
}

const subStamina = () => {
    modStamina(-1);
    // I'm choosing to not have a minimum as it isn't gamebreaking and some
    // times it's fun to see how much you got overkilled/how much the monster
    // got overkilled.
}

const setTempStamina = (value: number) => {
    state.temp_stamina = value
    updateModel();
}

const modTempStamina = (value: number) => {
    state.temp_stamina += value;
    if (state.temp_stamina < 0) {
        state.current_stamina += state.temp_stamina;
        state.temp_stamina = 0;
    }
    updateModel();
}

const addTempStamina = () => {
    modTempStamina(1);
}

const subTempStamina = () => {
    modTempStamina(-1);
}

const kill = () => {
    setStamina(Math.floor(-state.max_stamina/2))
    setTempStamina(0)
}

const fullHeal = () => {
    setStamina(state.max_stamina)
}
const spendRecovery = () => {
    modStamina(Math.floor(state.max_stamina/3))
}

// Save and close
const okButtonPressed = () => {
    emit('result', state.model)
}

// Close without saving
const closeButtonPressed = () => {
    emit('close');
}
</script>

<style scoped>
.modifiers-container {
    margin-top: 1em;
    display: flex;
}

.stamina-container {
    display: flex;
    width: 50%;
    justify-content: center;
}

.stamina-adjust {
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.temp-stamina-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: var(--font-ui-small);
    row-gap: 0.5em;
    margin-top: 1em;
    padding: 0.5em 0;
}

.quick-access-container {
    display: flex;
    border-left: 1px solid var(--modal-border-color);
    flex-direction: column;
    align-items: center;
    width: 50%;
}

.quick-access-container > button {
    width: 20ch;
    margin-top: .5em;
}
</style>
