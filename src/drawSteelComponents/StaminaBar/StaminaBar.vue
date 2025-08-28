<template>
    <component-wrapper component-name="Stamina Bar" :model="model">
        <div v-if="model?.style == 'sheet'">
            Sheet style is not implemented, use default style </div>
        <div class="vue-stamina-bar-container" :style="{ height: `calc(${model?.height}em + 4px)` }" v-else>
            <span class="health-container">
                <div class="health-indicator"
                    :style="{
                        width: `calc(${calculatePercentFromStamina(model?.current_stamina ?? 0)}% - 2px)`,
                        backgroundColor: barColor
                    }">
                </div>
            </span> <span class="overlay-container">
                <div class="dying-overlay">
                    <span class="background-pill">
                        Dying
                    </span>
                </div>
                <div class="winded-overlay"
                    :style="{ width: `${calculatePercentFromStamina((model?.max_stamina ?? 0) / 2, true)}%` }">
                    <span class="background-pill">
                        Winded
                    </span>
                </div>
                <div class="stamina-overlay">
                    <span class="background-pill">
                        5/20
                    </span>
                </div>
            </span>
        </div>
    </component-wrapper>
</template>

<script setup lang="ts">
import ComponentWrapper from "@drawSteelComponents/Common/ComponentWrapper.vue";
import { StaminaBar } from '@/model/StaminaBar'; 
import { computed, reactive } from "vue";

const props = defineProps<{
    model?: StaminaBar,
}>();

const barColor = computed(() => {
    const current_stamina = props.model?.current_stamina ?? 0
    if (current_stamina <= 0) {
        return 'var(--stamina-bar-color-dying)';
    }
    else if (current_stamina < (props.model?.max_stamina ?? 0)) {
        return 'var(--stamina-bar-color-winded)';
    }
    return 'var(--stamina-bar-color)';
})

console.log(props.model);

const calculatePercentFromStamina = (stamina: number, ignore_dying: boolean = false) => {
    const dying_stamina = Math.floor((props.model?.max_stamina ?? 0) / 2);
    const total_stamina = (props.model?.max_stamina ?? 0) + dying_stamina;
    const absolute_stamina = ignore_dying ? stamina : stamina + dying_stamina;
    const ratio = absolute_stamina / total_stamina;
    
    console.log("stamina", stamina);
    console.log("dying_stamina", dying_stamina);
    console.log("total_stamina", total_stamina);
    console.log("absolute_stamina", absolute_stamina);
    console.log("ratio", ratio);
    console.log("percent", ratio * 100);
    
    return ratio * 100; }
</script>

<style scoped>
.vue-stamina-bar-container {
    width: 100%;
    height: 20px;
    background-color: var(--code-background);
    border: 1px solid var(--text-normal);
    border-radius: var(--radius-s);
    margin-bottom: 10px;
    position: relative;
}

.overlay-container,
.health-container {
    position: absolute;
    display: flex;
    height: 100%;
    width: 100%;
    align-items: center;
    overflow: hidden;
}

.health-indicator {
    height: calc(100% - 2px);
    margin-left: 1px; 
    border-radius: calc(var(--radius-s) - 1px);
}

.winded-overlay,
.dying-overlay,
.stamina-overlay {
    display: flex;
    height: calc(100%);
    width: calc(100% / 3);
    color: black;
    font-size: 0.7em;
    border-top-left-radius: calc(var(--radius-s) - 1px);
    border-bottom-left-radius: calc(var(--radius-s) - 1px);
    justify-content: center;
    align-items: center;
}

.winded-overlay {
    background: repeating-linear-gradient(135deg, #000 0 1.4px, transparent 1px 6px);
}

.dying-overlay {
    background: repeating-linear-gradient(45deg, #000 0 1.4px, transparent 1px 6px), repeating-linear-gradient(135deg, #000 0 1.4px, transparent 1px 6px);
}

.background-pill {
    display: flex;
    height: 1em;
    padding: 0 0.4em;
    color: var(--text-normal);
    background-color: var(--background-primary-alt);
    border-radius: 10px;
    justify-content: center;
    align-items: center;
}
</style>
