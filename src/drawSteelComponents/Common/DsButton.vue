<template>
    <button @click="emit('click')" :class="buttonClasses">
        <span ref="iconElement" :class="iconClasses" v-if="icon"></span>
        <slot />
    </button>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, useSlots } from "vue";
import { setIcon } from "obsidian";

const props = withDefaults(defineProps<{
    icon?: string,
    variant?: 'default' | 'icon' | 'simplified',
    disabled?: boolean
}>(), {
    variant: 'default'
});

const emit = defineEmits(["click"])
const slots = useSlots()

const iconElement = ref<HTMLElement | null>(null);

const buttonClasses = computed(() => [
	{
        'text-button': props.variant == 'default',
        'icon-button': props.variant == 'icon',
        'simplified-button': props.variant == 'simplified',
        'has-icon': props.variant != 'icon' && props.icon,
        'disabled': props.disabled
    }
])

const iconClasses = computed(() => [
    'icon',
	{
        'pre-text-icon': slots.default,
    }
])

onMounted(() => {
    if (props.icon){
        if (iconElement.value) {
            setIcon(iconElement.value, props.icon);
        }
    }
});
</script>

<style scoped>
button {
    cursor: pointer;
}

.icon {
    height: var(--icon-size);
    width: var(--icon-size);
}

.pre-text-icon {
    margin-right: 0.4em;
}

.disabled {
    pointer-events: none;
	background-color: var(--interactive-normal);
    opacity: 0.5;
    box-shadow: var(--input-shadow);
}

.text-button {
    min-width: 75px;
}

.text-button.has-icon {
    display: flex;
    justify-content: start;
}

.icon-button {
    display: flex;
    height: var(--icon-size);
    width: var(--icon-size);
    background-color: transparent;
    box-shadow: none;
    padding: 0;
}

.simplified-button {
    display: flex;
    padding: 0.5em;
    background: none;
    border: none;
}
</style>
