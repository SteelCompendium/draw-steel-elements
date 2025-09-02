<template>
    <button @click="emit('click')" :class="buttonClasses">
        <span ref="iconElement" :class="iconClasses" v-if="icon"></span>
        <slot />
    </button>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { setIcon } from "obsidian";

const props = defineProps<{
    icon?: string,
    icon_button?: boolean,
    disabled?: boolean
}>();

const emit = defineEmits(["click"])

const iconElement = ref<HTMLElement | null>(null);

const buttonClasses = computed(() => [
	{
        'text-button': !props.icon_button,
        'icon-button': props.icon_button,
        'has-icon': !props.icon_button && props.icon,
        'disabled': props.disabled
    }
])

const iconClasses = computed(() => [
    'icon',
	{
        'pre-text-icon': !props.icon_button,
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
</style>
