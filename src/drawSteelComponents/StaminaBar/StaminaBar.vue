<template>
    <component-wrapper 
        component-name="Stamina Bar" 
        :model="model"
        :collapsible="!disable_click"
    >
        <div v-if="model?.style == 'sheet'">
            Sheet style is not implemented, use default style 
        </div>
        <div :class="staminaBarContainerClasses"
            :style="{ height: `calc(${model?.height ?? 1}em + 4px)` }"
            @click="handleClick"
            v-else>
            <span class="stamina-container">
                <div class="stamina-indicator"
                    :style="{
                        width: `calc(${calculatePercentFromStamina(model?.current_stamina ?? 0)}% - 2px)`,
                        backgroundColor: barColor
                    }">
                </div>
            </span> 
            <span class="ds-temp-stamina-container">
                <!-- <span class="temp-stamina-spacer"
                    :style="{
                        width: `${overlayWidth}%`,
                    }"/> -->
                <div class="temp-stamina-indicator"
                    :style="{
                        width: `calc(${calculatePercentFromStamina(model?.temp_stamina ?? 0, true)}% - 1px)`,
                    }">
                </div>
            </span> 
            <span class="overlay-container">
                <div class="dying-overlay"
                    :style="{ width: `${overlayWidth}%` }">
                    <span class="background-pill">
                        Dying
                    </span>
                </div>
                <div class="winded-overlay"
                    :style="{ width: `${overlayWidth}%` }">
                    <span class="background-pill">
                        Winded
                    </span>
                </div>
                <div class="stamina-overlay">
                    <span class="background-pill">
                        ({{model?.current_stamina ?? 0}}/{{model?.max_stamina ?? 0}})
                    </span>
                </div>
            </span>
        </div>
    </component-wrapper>
</template>

<script setup lang="ts">
import ComponentWrapper from "@drawSteelComponents/Common/ComponentWrapper.vue";
import StaminaEditModal from "@drawSteelComponents/StaminaBar/StaminaEditModal.vue";
import { ModalProcessor } from "@/utils/ModalProcessor";
import { StaminaBar } from '@/model/StaminaBar'; 
import { computed, inject, reactive } from "vue";
import { App, MarkdownPostProcessorContext } from "obsidian";
import { CodeBlocks } from "@/utils/CodeBlocks";

const props = defineProps<{
    model?: StaminaBar,
    disable_click?: boolean,
}>();

const state = reactive({
    show_edit: true,
})

const overlayWidth = computed(() => {
    return calculatePercentFromStamina(Math.floor(props.model?.max_stamina ?? 0) / 2, true)
})

const barColor = computed(() => {
    const current_stamina = props.model?.current_stamina ?? 0
    if (current_stamina <= 0) {
        return 'var(--stamina-bar-color-dying)';
    }
    else if (current_stamina < Math.floor((props.model?.max_stamina ?? 0) / 2)) {
        console.log("winded", current_stamina, props.model?.max_stamina, );
        
        return 'var(--stamina-bar-color-winded)';
    }
    return 'var(--stamina-bar-color)';
})

const obsidianApp = inject<App>('obsidianApp')
const obsidianContext = inject<MarkdownPostProcessorContext>('obsidianContext')

const staminaBarContainerClasses = computed(() => [
	'vue-stamina-bar-container',
	{
		'clickable': !props.disable_click,
	}
])

console.log(props.model);

const calculatePercentFromStamina = (stamina: number, ignore_dying: boolean = false) => {
    const dying_stamina = Math.floor((props.model?.max_stamina ?? 0) / 2);
    const total_stamina = (props.model?.max_stamina ?? 0) + dying_stamina;
    const absolute_stamina = ignore_dying ? stamina : stamina + dying_stamina;
    const ratio = absolute_stamina / total_stamina;
    
    return ratio * 100;
}

const handleClick = () => {
    if (props.disable_click) return;

    new ModalProcessor(
        obsidianApp!,
        StaminaEditModal,
        obsidianContext!,
        { model: props.model },
        "Stamina",
        (result) => {
            CodeBlocks.updateStaminaBarVue(obsidianApp!, result, obsidianContext!);
        }
    ).open();
}
</script>

<style scoped>
/* TODO: remove the vue part of the class when stamina-bar-container has been removed from source-styles.css */
.vue-stamina-bar-container {
    position: relative;
    width: 100%;
    height: 20px;
    background-color: var(--code-background);
    border: 1px solid var(--text-normal);
    border-radius: var(--radius-s);
    margin-bottom: 10px;
}

.clickable {
    cursor: pointer;
}

.overlay-container,
.stamina-container,
.ds-temp-stamina-container {
    position: absolute;
    display: flex;
    height: 100%;
    width: 100%;
    align-items: center;
    overflow: hidden;
}

.ds-temp-stamina-container {
    align-items: end;
}

.stamina-indicator{
    height: calc(100% - 2px);
    margin-left: 1px; 
    border-radius: calc(var(--radius-s) - 1px);
}

.temp-stamina-indicator {
    border-top-left-radius: calc(var(--radius-s) - 1px);
    border-top-right-radius: calc(var(--radius-s) - 1px);
    background-color: purple;
}

.temp-stamina-spacer { color:brown}

.winded-overlay,
.dying-overlay,
.stamina-overlay,
.temp-stamina-indicator,
.temp-stamina-spacer  {
    display: flex;
    height: 100%;
    width: calc(100% / 3);
    color: black;
    font-size: 0.7em;
    border-top-left-radius: calc(var(--radius-s) - 1px);
    border-bottom-left-radius: calc(var(--radius-s) - 1px);
    justify-content: center;
    align-items: center;
}

.temp-stamina-indicator {
    height: 50%;
}

.winded-overlay {
    background: repeating-linear-gradient(135deg, #000 0 1.41px, transparent 1px 6px);
}

.dying-overlay {
    background: repeating-linear-gradient(45deg, #000 0 1.41px, transparent 1px 6px),
                repeating-linear-gradient(135deg, #000 0 1.41px, transparent 1px 6px);
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
