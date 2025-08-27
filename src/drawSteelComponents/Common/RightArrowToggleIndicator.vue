<template>
	<span :class="collapseClasses" @mousedown.stop @click.capture.stop.prevent="handleClick" ref="iconContainer">
	</span>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { setIcon } from 'obsidian';

const props = defineProps({
	enabled: {
		type: Boolean,
		required: false,
	}
})

const emit = defineEmits<{
	toggle: [enabled: boolean]
}>()

const iconContainer = ref<HTMLElement>()

const collapseClasses = computed(() => [
	'heading-collapse-indicator',
	'collapse-indicator',
	'collapse-icon',
	{
		'is-collapsed': !props.enabled,
	}
])

const handleClick = () => {
	emit('toggle', !props.enabled)
}

onMounted(() => {
	if (iconContainer.value) {
		setIcon(iconContainer.value, 'right-triangle');
	}
})
</script>

<style scoped>
/*
	Override of Obsidian functionality to ironically gain function parity with
	Obsidian's own heading elements.
*/
.is-collapsed {
	opacity: 1;
}
.is-collapsed :deep(svg) {
	color: var(--collapse-icon-color-collapsed) !important;
}
</style>
